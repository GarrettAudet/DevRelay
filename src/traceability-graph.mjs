import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "./content-digest.mjs";
import {
  TRACEABILITY_ANALYZER,
  TRACEABILITY_EDGE_KINDS,
  TRACEABILITY_EDGE_KINDS_V1_1,
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_HORIZONS,
  TRACEABILITY_MERGE_ENGINE,
  TRACEABILITY_RECEIPT_MEDIA_TYPE,
  TRACEABILITY_RECEIPT_SCHEMA,
  TRACEABILITY_UPDATE_MEDIA_TYPE,
  TRACEABILITY_UPDATE_SCHEMA,
  TRACEABILITY_NODE_KINDS,
  TRACEABILITY_VOCABULARY,
  TRACEABILITY_VOCABULARY_V1_1,
  assertTraceabilityVocabularyTransition,
  traceabilityContentDigest,
  traceabilityDiagnosticId,
  traceabilityEdgeId,
  traceabilityHorizonRank,
  traceabilityNodeId,
  traceabilityUpdateId,
  validateTraceabilityDiagnosticReport,
  validateTraceabilityGraphSnapshot,
  validateTraceabilityMergeReceipt,
  validateTraceabilityUpdate,
} from "./traceability-artifact-validator.mjs";

const PREPARED = new WeakSet();
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ACTIVE_STATE = "active";
const MAX_COMMIT_ATTEMPTS = 8;
const CONTRIBUTOR_AUTHORITIES = new Set(["approved", "candidate", "observed"]);
const TRACE_NODE_KIND_SET = new Set(TRACEABILITY_NODE_KINDS);
const TRACE_EDGE_KIND_SET = new Set(TRACEABILITY_EDGE_KINDS);
const CORE_EMPTY_OWNERSHIP = Object.freeze({
  scope: "core/non-contributing",
  authority: "candidate",
  nodeKinds: Object.freeze([]),
  edgeKinds: Object.freeze([]),
});
const CORE_EMPTY_CONTRIBUTOR = Object.freeze({
  id: "devrelay.traceability/non-contributing",
  version: "1.0.0",
  contractDigest: canonicalJsonDigest({
    id: "devrelay.traceability/non-contributing",
    version: "1.0.0",
    ownership: CORE_EMPTY_OWNERSHIP,
  }),
});
const CORE_ARTIFACT_OWNERSHIP = Object.freeze({
  scope: "core/artifact-reference",
  authority: "reference",
  nodeKinds: Object.freeze(["artifact-reference"]),
  edgeKinds: Object.freeze([]),
});
const CORE_ARTIFACT_CONTRIBUTOR = Object.freeze({
  id: "devrelay.traceability/artifact-reference",
  version: "1.0.0",
  contractDigest: canonicalJsonDigest({
    id: "devrelay.traceability/artifact-reference",
    version: "1.0.0",
    ownership: CORE_ARTIFACT_OWNERSHIP,
  }),
});

export class TraceabilityGraphError extends Error {
  constructor(code, message, diagnostics = []) {
    super(`${code}: ${message}`);
    this.name = "TraceabilityGraphError";
    this.code = code;
    this.diagnostics = immutableJson(diagnostics);
  }
}

export class TraceabilityConflictError extends TraceabilityGraphError {
  constructor(message, diagnostics) {
    super("TG_CONCURRENT_UPDATE", message, diagnostics);
    this.name = "TraceabilityConflictError";
  }
}

function fail(code, message, diagnostics) {
  throw new TraceabilityGraphError(code, message, diagnostics);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeDeep(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
    Object.freeze(value);
  }
  return value;
}

function immutableJson(value) {
  return freezeDeep(JSON.parse(JSON.stringify(value)));
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("TG_INVALID_ARGUMENT", `${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail("TG_INVALID_ARGUMENT", `${label} must be a non-empty string`);
  }
  return value;
}

function sameRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.schema === right.schema &&
      left.mediaType === right.mediaType &&
      left.digest === right.digest &&
      left.uri === right.uri,
  );
}

function pointerKey(ref) {
  return `${ref.artifactId}\u0000${ref.digest}`;
}

function refKey(ref) {
  return [
    ref.artifactId,
    ref.schema,
    ref.mediaType,
    ref.digest,
    ref.uri,
  ].join("\u0000");
}

function canonicalBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

function safeId(value) {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 96);
}

function makeRef({ artifactId, schema, mediaType, value, graphId, category }) {
  const bytes = canonicalBytes(value);
  const digest = sha256Digest(bytes);
  return Object.freeze({
    ref: immutableJson({
      artifactId,
      schema,
      mediaType,
      digest,
      uri: `memory://devrelay/traceability/${encodeURIComponent(graphId)}/${category}/${digest.slice(7)}.json`,
    }),
    bytes,
    value: immutableJson(value),
  });
}

function copyLoaded(entry) {
  return Object.freeze({
    ref: immutableJson(entry.ref),
    bytes: Buffer.from(entry.bytes),
    value: immutableJson(entry.value),
  });
}

export function createInMemoryTraceabilityStore() {
  const heads = new Map();
  const artifacts = new Map();
  const receipts = new Map();

  function artifactKey(ref) {
    return `${ref.schema}\u0000${ref.digest}`;
  }

  function putArtifact(entry) {
    const actual = sha256Digest(entry.bytes);
    if (actual !== entry.ref.digest) {
      fail("TG_ARTIFACT_DIGEST_MISMATCH", `artifact ${entry.ref.artifactId} bytes do not match its ref`);
    }
    const existing = artifacts.get(artifactKey(entry.ref));
    if (existing && !sameRef(existing.ref, entry.ref)) {
      fail("TG_ARTIFACT_IDENTITY_CONFLICT", `artifact digest ${entry.ref.digest} has conflicting metadata`);
    }
    artifacts.set(artifactKey(entry.ref), copyLoaded(entry));
  }

  const store = {
    restore(graphId, entries, headRef) {
      if (heads.has(graphId)) {
        fail("TG_GRAPH_ALREADY_INITIALIZED", `traceability graph ${graphId} is already initialized`);
      }
      if (!Array.isArray(entries) || entries.length === 0) {
        fail("TG_INVALID_ARGUMENT", "restored graph history requires at least one artifact");
      }
      for (const entry of entries) {
        putArtifact(entry);
      }
      const head = artifacts.get(artifactKey(headRef));
      if (!head || !sameRef(head.ref, headRef)) {
        fail("TG_ARTIFACT_NOT_FOUND", "restored graph head is absent from its artifact closure");
      }
      heads.set(graphId, immutableJson(headRef));
      return copyLoaded(head);
    },

    initialize(graphId, entry) {
      const current = heads.get(graphId);
      if (current) {
        return copyLoaded(artifacts.get(artifactKey(current)));
      }
      putArtifact(entry);
      heads.set(graphId, immutableJson(entry.ref));
      return copyLoaded(entry);
    },

    capture(graphId) {
      const ref = heads.get(graphId);
      if (!ref) {
        fail("TG_GRAPH_NOT_FOUND", `traceability graph ${graphId} does not exist`);
      }
      return copyLoaded(artifacts.get(artifactKey(ref)));
    },

    load(ref) {
      const entry = artifacts.get(artifactKey(ref));
      if (!entry || !sameRef(entry.ref, ref)) {
        fail("TG_ARTIFACT_NOT_FOUND", `traceability artifact ${ref.artifactId} is unavailable`);
      }
      return copyLoaded(entry);
    },

    receipt(updateRef) {
      const result = receipts.get(updateRef.digest);
      if (result && !sameRef(result.receipt.update, updateRef)) {
        fail(
          "TG_UPDATE_REF_MISMATCH",
          "update digest is already bound to different ArtifactRef metadata",
        );
      }
      return result;
    },

    isAncestor(ancestorRef, descendantRef) {
      let cursor = store.load(descendantRef);
      for (;;) {
        if (sameRef(cursor.ref, ancestorRef)) {
          return true;
        }
        if (cursor.value.parentGraph === null) {
          return false;
        }
        cursor = store.load(cursor.value.parentGraph);
      }
    },

    commit({ graphId, expectedHead, artifacts: entries, updateRef, result }) {
      const prior = receipts.get(updateRef.digest);
      if (prior) {
        return prior;
      }
      const current = heads.get(graphId);
      if (!sameRef(current, expectedHead)) {
        return undefined;
      }
      for (const entry of entries) {
        putArtifact(entry);
      }
      heads.set(graphId, immutableJson(result.snapshotRef));
      const frozen = freezeMergeResult(result);
      receipts.set(updateRef.digest, frozen);
      return frozen;
    },
  };
  return Object.freeze(store);
}

function freezeMergeResult(result) {
  return Object.freeze({
    disposition: result.disposition,
    snapshotRef: immutableJson(result.snapshotRef),
    snapshot: immutableJson(result.snapshot),
    receiptRef: immutableJson(result.receiptRef),
    receipt: immutableJson(result.receipt),
    diagnostics: immutableJson(result.diagnostics),
  });
}

function normalizeOwnedKinds(value, allowed, label, forbidden = new Set()) {
  if (!Array.isArray(value)) {
    fail("TG_INVALID_CONTRIBUTOR", `${label} must be an array`);
  }
  const normalized = [...value].sort(compareText);
  if (new Set(normalized).size !== normalized.length) {
    fail("TG_INVALID_CONTRIBUTOR", `${label} contains duplicates`);
  }
  for (const kind of normalized) {
    requireString(kind, label);
    if (!allowed.has(kind) || forbidden.has(kind)) {
      fail("TG_INVALID_CONTRIBUTOR", `${label} contains unauthorized kind ${kind}`);
    }
  }
  return Object.freeze(normalized);
}

function contributorOwnership(contributor, index) {
  const ownership = requireRecord(
    contributor.ownership,
    `contributors[${index}].ownership`,
  );
  if (
    Object.keys(ownership).sort().join(",") !==
    "authority,edgeKinds,nodeKinds,scope"
  ) {
    fail(
      "TG_INVALID_CONTRIBUTOR",
      `contributors[${index}].ownership must contain exactly authority, edgeKinds, nodeKinds, and scope`,
    );
  }
  const scope = requireString(ownership.scope, `contributors[${index}].ownership.scope`);
  const authority = requireString(
    ownership.authority,
    `contributors[${index}].ownership.authority`,
  );
  if (!CONTRIBUTOR_AUTHORITIES.has(authority)) {
    fail("TG_INVALID_CONTRIBUTOR", `contributors[${index}] has unauthorized authority ${authority}`);
  }
  if (contributor.scope !== scope || contributor.authority !== authority) {
    fail(
      "TG_INVALID_CONTRIBUTOR",
      `contributors[${index}] scope and authority must equal its ownership descriptor`,
    );
  }
  return Object.freeze({
    scope,
    authority,
    nodeKinds: normalizeOwnedKinds(
      ownership.nodeKinds,
      TRACE_NODE_KIND_SET,
      `contributors[${index}].ownership.nodeKinds`,
      new Set(["artifact-reference"]),
    ),
    edgeKinds: normalizeOwnedKinds(
      ownership.edgeKinds,
      TRACE_EDGE_KIND_SET,
      `contributors[${index}].ownership.edgeKinds`,
    ),
  });
}

function contributorIdentity(metadata, index, ownership) {
  requireRecord(metadata, `contributors[${index}].metadata`);
  const id = requireString(metadata.id, `contributors[${index}].metadata.id`);
  const version = requireString(
    metadata.version,
    `contributors[${index}].metadata.version`,
  );
  const contractDigest = canonicalJsonDigest({ id, version, ownership });
  if (
    metadata.contractDigest !== undefined &&
    metadata.contractDigest !== contractDigest
  ) {
    fail(
      "TG_INVALID_CONTRIBUTOR",
      `contributors[${index}].metadata.contractDigest does not bind its ownership descriptor`,
    );
  }
  return Object.freeze({
    id,
    version,
    contractDigest,
  });
}

function normalizeContributors(contributors) {
  if (!Array.isArray(contributors)) {
    fail("TG_INVALID_ARGUMENT", "contributors must be an array");
  }
  const normalized = contributors.map((contributor, index) => {
    requireRecord(contributor, `contributors[${index}]`);
    if (typeof contributor.project !== "function") {
      fail("TG_INVALID_ARGUMENT", `contributors[${index}].project must be a function`);
    }
    const ownership = contributorOwnership(contributor, index);
    return Object.freeze({
      ...contributor,
      metadata: contributorIdentity(contributor.metadata, index, ownership),
      ownership,
    });
  });
  const owners = new Map();
  for (const contributor of normalized) {
    const key = `${contributor.ownership.authority}\u0000${contributor.ownership.scope}`;
    const existing = owners.get(key);
    if (existing && !sameContributor(existing, contributor.metadata)) {
      fail(
        "TG_CONTRIBUTOR_OWNERSHIP_CONFLICT",
        `different contributor contracts claim ${contributor.ownership.authority}/${contributor.ownership.scope}`,
      );
    }
    owners.set(key, contributor.metadata);
  }
  return normalized;
}

function declarativeMatch(match, context) {
  if (match === undefined) {
    return true;
  }
  requireRecord(match, "contributor.match");
  const module = context.invocation.module;
  return (
    (match.moduleId === undefined || match.moduleId === module.id) &&
    (match.moduleVersion === undefined || match.moduleVersion === module.version) &&
    (match.operation === undefined || match.operation === module.operation) &&
    (match.outcomes === undefined || match.outcomes.includes(context.moduleResult.outcome))
  );
}

async function contributorMatches(contributor, context) {
  return typeof contributor.match === "function"
    ? Boolean(await contributor.match(context))
    : declarativeMatch(contributor.match, context);
}

async function contributorValue(value, context, label) {
  const resolved = typeof value === "function" ? await value(context) : value;
  return requireString(resolved, label);
}

function collectLoaded(value, target = []) {
  if (value === null || value === undefined) {
    return target;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectLoaded(child, target);
    return target;
  }
  if (typeof value !== "object") {
    return target;
  }
  if (value.ref && value.ref.digest) {
    target.push(value);
    return target;
  }
  for (const child of Object.values(value)) collectLoaded(child, target);
  return target;
}

function collectOutputRefs(moduleResult) {
  const refs = [];
  for (const artifacts of Object.values(moduleResult.outputs ?? {})) {
    if (Array.isArray(artifacts)) refs.push(...artifacts);
  }
  return refs;
}

function decodeLoaded(entry, expectedRef) {
  const ref = entry?.ref ?? expectedRef;
  if (!sameRef(ref, expectedRef)) {
    fail("TG_RESOLVER_REF_MISMATCH", `resolver returned the wrong artifact for ${expectedRef.artifactId}`);
  }
  const bytes = Buffer.from(entry.bytes ?? []);
  if (sha256Digest(bytes) !== expectedRef.digest) {
    fail("TG_SOURCE_DIGEST_MISMATCH", `resolved ${expectedRef.artifactId} bytes do not match its digest`);
  }
  const mediaType = expectedRef.mediaType?.toLowerCase();
  const isJson = mediaType === "application/json" || mediaType?.endsWith("+json");
  if (!isJson) {
    if (entry.value !== undefined) {
      fail(
        "TG_OPAQUE_VALUE_FORBIDDEN",
        `resolved opaque artifact ${expectedRef.artifactId} cannot supply a decoded value`,
      );
    }
    const value = {
      artifactId: expectedRef.artifactId,
      digest: expectedRef.digest,
      mediaType: expectedRef.mediaType,
      opaque: true,
    };
    return Object.freeze({ ref: immutableJson(ref), bytes, value: immutableJson(value) });
  }
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail("TG_SOURCE_DECODE_FAILED", `resolved ${expectedRef.artifactId} is not valid JSON: ${error.message}`);
  }
  if (
    entry.value !== undefined &&
    canonicalJsonDigest(entry.value) !== canonicalJsonDigest(decoded)
  ) {
    fail(
      "TG_SOURCE_VALUE_MISMATCH",
      `resolved ${expectedRef.artifactId} bytes do not match its supplied value`,
    );
  }
  return Object.freeze({ ref: immutableJson(ref), bytes, value: immutableJson(decoded) });
}

async function createTrackedResolver({ loadedInputs, loadedOutputs, loadedAttachments, resolvedArtifacts, resolveArtifact }) {
  const closure = new Map();
  const exposed = new Map();
  const entries = [
    ...collectLoaded(loadedInputs),
    ...collectLoaded(loadedOutputs),
    ...collectLoaded(loadedAttachments),
    ...collectLoaded(resolvedArtifacts),
  ];
  for (const entry of entries) {
    if (!entry.ref) continue;
    exposed.set(pointerKey(entry.ref), entry);
    if (entry.bytes !== undefined) {
      closure.set(pointerKey(entry.ref), decodeLoaded(entry, entry.ref));
    }
  }

  async function resolve(ref) {
    const cached = closure.get(pointerKey(ref));
    if (cached) {
      if (!sameRef(cached.ref, ref)) {
        fail("TG_RESOLVER_REF_MISMATCH", `loaded closure conflicts for ${ref.artifactId}`);
      }
      return cached;
    }
    if (typeof resolveArtifact !== "function") {
      fail("TG_ATTACHMENT_NOT_RESOLVED", `no trusted resolver is available for ${ref.artifactId}`);
    }
    const supplied = await resolveArtifact(immutableJson(ref));
    const visible = exposed.get(pointerKey(ref));
    const loaded = decodeLoaded(
      visible?.value === undefined
        ? supplied
        : { ...supplied, value: visible.value },
      ref,
    );
    closure.set(pointerKey(ref), loaded);
    return loaded;
  }

  for (const entry of exposed.values()) {
    if (!closure.has(pointerKey(entry.ref))) {
      await resolve(entry.ref);
    }
  }
  return Object.freeze({ closure, resolve });
}

function pointerValue(value, pointer) {
  if (pointer === "") return value;
  let current = value;
  for (const token of pointer.slice(1).split("/")) {
    const key = token.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) {
      fail("TG_SOURCE_POINTER_MISSING", `source JSON Pointer ${pointer} does not resolve`);
    }
    current = current[key];
  }
  return current;
}

function normalizeLocators(locators, closure, label) {
  if (locators === undefined) {
    fail("TG_SOURCE_REQUIRED", `${label}.sourceLocators must contain provenance`);
  }
  if (!Array.isArray(locators)) fail("TG_INVALID_ASSERTION", `${label}.sourceLocators must be an array`);
  if (locators.length === 0) fail("TG_SOURCE_REQUIRED", `${label}.sourceLocators must not be empty`);
  const normalized = locators.map((locator, index) => {
    requireRecord(locator, `${label}.sourceLocators[${index}]`);
    const loaded = closure.get(pointerKey(locator.artifact));
    if (!loaded) {
      fail("TG_UNTRUSTED_SOURCE", `${label} cites artifact outside the trusted loaded closure`);
    }
    const selected = pointerValue(loaded.value, locator.jsonPointer);
    if (canonicalJsonDigest(selected) !== locator.entityDigest) {
      fail("TG_SOURCE_DIGEST_MISMATCH", `${label} source entity digest is invalid`);
    }
    return immutableJson(locator);
  });
  normalized.sort((a, b) => compareText(
    `${pointerKey(a.artifact)}\u0000${a.jsonPointer}\u0000${a.entityDigest}`,
    `${pointerKey(b.artifact)}\u0000${b.jsonPointer}\u0000${b.entityDigest}`,
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (canonicalJsonDigest(normalized[index - 1]) === canonicalJsonDigest(normalized[index])) {
      fail("TG_DUPLICATE_ASSERTION", `${label} contains duplicate source locators`);
    }
  }
  return normalized;
}

function artifactStableId(ref) {
  return canonicalJsonDigest({
    schema: ref.schema,
    artifactId: ref.artifactId,
    digest: ref.digest,
  });
}

function normalizeNode(raw, owner, graphId, closure, label) {
  requireRecord(raw, label);
  const kind = requireString(raw.kind, `${label}.kind`);
  if (kind === "artifact-reference") {
    const artifact = raw.attributes?.artifact;
    requireRecord(artifact, `${label}.attributes.artifact`);
    const loaded = closure.get(pointerKey(artifact));
    if (!loaded || !sameRef(loaded.ref, artifact)) {
      fail("TG_UNTRUSTED_ARTIFACT_REFERENCE", `${label} artifact-reference is not an exact loaded artifact`);
    }
    const stableId = artifactStableId(artifact);
    const material = {
      nodeId: traceabilityNodeId({ graphId, kind, stableId }),
      kind,
      stableId,
      label: raw.label ?? artifact.artifactId,
      authority: "reference",
      state: ACTIVE_STATE,
      scope: "core/artifact-reference",
      contributor: CORE_ARTIFACT_CONTRIBUTOR,
      attributes: { artifact: immutableJson(artifact) },
      sourceLocators: [
        {
          artifact: {
            artifactId: artifact.artifactId,
            digest: artifact.digest,
          },
          jsonPointer: "",
          entityDigest: canonicalJsonDigest(loaded.value),
        },
      ],
    };
    return Object.freeze({ ...material, contentDigest: traceabilityContentDigest(material) });
  }
  const stableId = requireString(raw.stableId, `${label}.stableId`);
  const material = {
    nodeId: traceabilityNodeId({
      graphId,
      kind,
      stableId,
      authority: owner.authority,
      scope: owner.scope,
    }),
    kind,
    stableId,
    label: requireString(raw.label, `${label}.label`),
    authority: owner.authority,
    state: raw.state ?? ACTIVE_STATE,
    scope: owner.scope,
    contributor: owner.contributor,
    ...(raw.verificationStatus === undefined
      ? {}
      : { verificationStatus: raw.verificationStatus }),
    attributes: immutableJson(raw.attributes ?? {}),
    sourceLocators: normalizeLocators(raw.sourceLocators, closure, label),
  };
  return Object.freeze({ ...material, contentDigest: traceabilityContentDigest(material) });
}

function endpointId(endpoint, owner, graphId, available) {
  if (typeof endpoint === "string" && DIGEST_PATTERN.test(endpoint)) return endpoint;
  requireRecord(endpoint, "edge endpoint");
  if (endpoint.nodeId) return endpoint.nodeId;
  if (endpoint.artifact) {
    const stableId = artifactStableId(endpoint.artifact);
    return traceabilityNodeId({ graphId, kind: "artifact-reference", stableId });
  }
  const kind = requireString(endpoint.kind, "edge endpoint.kind");
  const stableId = requireString(endpoint.stableId, "edge endpoint.stableId");
  if (endpoint.authority !== undefined || endpoint.scope !== undefined) {
    if (endpoint.authority === undefined || endpoint.scope === undefined) {
      fail("TG_AMBIGUOUS_ENDPOINT", "endpoint authority and scope must be supplied together");
    }
    return traceabilityNodeId({
      graphId,
      kind,
      stableId,
      authority: endpoint.authority,
      scope: endpoint.scope,
    });
  }
  const local = traceabilityNodeId({
    graphId,
    kind,
    stableId,
    authority: owner.authority,
    scope: owner.scope,
  });
  if (available.has(local)) return local;
  const matches = [...available.values()].filter(
    (node) => node.kind === kind && node.stableId === stableId && node.state !== "retired",
  );
  if (matches.length !== 1) {
    fail(
      "TG_AMBIGUOUS_ENDPOINT",
      `endpoint ${kind}/${stableId} resolves to ${matches.length} active observations; specify authority and scope`,
    );
  }
  return matches[0].nodeId;
}

function normalizeEdge(raw, owner, graphId, available, closure, label) {
  requireRecord(raw, label);
  const kind = requireString(raw.kind, `${label}.kind`);
  const sourceNodeId = endpointId(raw.source ?? raw.sourceNodeId, owner, graphId, available);
  const targetNodeId = endpointId(raw.target ?? raw.targetNodeId, owner, graphId, available);
  const qualifier = raw.qualifier ?? "";
  const material = {
    edgeId: traceabilityEdgeId({
      graphId,
      kind,
      sourceNodeId,
      targetNodeId,
      qualifier,
      authority: owner.authority,
      scope: owner.scope,
    }),
    kind,
    sourceNodeId,
    targetNodeId,
    qualifier,
    rationale: requireString(raw.rationale, `${label}.rationale`),
    authority: owner.authority,
    state: raw.state ?? ACTIVE_STATE,
    scope: owner.scope,
    contributor: owner.contributor,
    attributes: immutableJson(raw.attributes ?? {}),
    sourceLocators: normalizeLocators(raw.sourceLocators, closure, label),
  };
  return Object.freeze({ ...material, contentDigest: traceabilityContentDigest(material) });
}

function retired(record) {
  const material = { ...record, state: "retired" };
  delete material.contentDigest;
  return Object.freeze({ ...material, contentDigest: traceabilityContentDigest(material) });
}

function putDesired(map, value, label) {
  const id = value.nodeId ?? value.edgeId;
  const existing = map.get(id);
  if (existing && existing.contentDigest !== value.contentDigest) {
    fail("TG_ASSERTION_OWNERSHIP_CONFLICT", `${label} ${id} has conflicting desired values`);
  }
  map.set(id, value);
}

function sameContributor(left, right) {
  return Boolean(
    left &&
      right &&
      left.id === right.id &&
      left.version === right.version &&
      left.contractDigest === right.contractDigest,
  );
}

function diffRecords(baseRecords, desired, owners, idField) {
  const base = new Map(baseRecords.map((record) => [record[idField], record]));
  const changes = [];
  for (const desiredRecord of desired.values()) {
    const previous = base.get(desiredRecord[idField]);
    if (
      previous &&
      !sameContributor(previous.contributor, desiredRecord.contributor)
    ) {
      fail(
        "TG_ASSERTION_OWNERSHIP_CONFLICT",
        `${idField} ${desiredRecord[idField]} is owned by another contributor contract`,
      );
    }
    if (previous?.contentDigest === desiredRecord.contentDigest) continue;
    changes.push({
      precondition: previous
        ? { state: "match", contentDigest: previous.contentDigest }
        : { state: "absent" },
      [idField === "nodeId" ? "node" : "edge"]: desiredRecord,
    });
  }
  for (const owner of owners) {
    if (owner.empty) continue;
    for (const previous of baseRecords) {
      if (
        previous.scope !== owner.scope ||
        previous.authority !== owner.authority ||
        !sameContributor(previous.contributor, owner.contributor) ||
        previous.state === "retired" ||
        (idField === "nodeId" && previous.kind === "artifact-reference") ||
        desired.has(previous[idField])
      ) {
        continue;
      }
      const value = retired(previous);
      changes.push({
        precondition: { state: "match", contentDigest: previous.contentDigest },
        [idField === "nodeId" ? "node" : "edge"]: value,
      });
    }
  }
  changes.sort((left, right) =>
    compareText(
      left[idField === "nodeId" ? "node" : "edge"][idField],
      right[idField === "nodeId" ? "node" : "edge"][idField],
    ),
  );
  return changes;
}

function maxHorizon(values) {
  return values.reduce((current, value) =>
    traceabilityHorizonRank(value) > traceabilityHorizonRank(current)
      ? value
      : current,
  "requirements");
}

function producer(invocation, invocationFingerprint, moduleResult) {
  requireRecord(invocation.module, "invocation.module");
  if (moduleResult.invocationId !== invocation.invocationId) {
    fail("TG_INVOCATION_MISMATCH", "module result invocationId does not match invocation");
  }
  if (!DIGEST_PATTERN.test(invocationFingerprint)) {
    fail("TG_INVALID_ARGUMENT", "invocationFingerprint is invalid");
  }
  return {
    module: {
      id: invocation.module.id,
      version: invocation.module.version,
      operation: invocation.module.operation,
    },
    invocationId: invocation.invocationId,
    invocationFingerprint,
    outcome: moduleResult.outcome,
  };
}

function createDiagnostic({ code, severity, blocking, category, subjectKind, subjectId, relatedNodeIds = [], message }) {
  const material = {
    code,
    severity,
    blocking,
    category,
    subjectKind,
    subjectId,
    relatedNodeIds: [...new Set(relatedNodeIds)].sort(compareText),
    message,
  };
  return Object.freeze({ diagnosticId: traceabilityDiagnosticId(material), ...material });
}

function activeGraph(snapshot) {
  const nodes = new Map(
    snapshot.nodes.filter(({ state }) => state === ACTIVE_STATE).map((node) => [node.nodeId, node]),
  );
  const edges = snapshot.edges.filter(
    (edge) => edge.state === ACTIVE_STATE && nodes.has(edge.sourceNodeId) && nodes.has(edge.targetNodeId),
  );
  return { nodes, edges };
}

export function diagnoseTraceabilityGraph(snapshot) {
  validateTraceabilityGraphSnapshot(snapshot);
  const { nodes, edges } = activeGraph(snapshot);
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.sourceNodeId)) outgoing.set(edge.sourceNodeId, []);
    if (!incoming.has(edge.targetNodeId)) incoming.set(edge.targetNodeId, []);
    outgoing.get(edge.sourceNodeId).push(edge);
    incoming.get(edge.targetNodeId).push(edge);
  }
  const diagnostics = [];
  const approvedBlocking = (node) => node.authority === "approved";
  const requirements = [...nodes.values()].filter(({ kind }) =>
    new Set(["user-story", "non-functional-requirement", "requirement-constraint", "acceptance-criterion"]).has(kind),
  );
  for (const node of nodes.values()) {
    if (node.kind === "business-objective") {
      const realized = (outgoing.get(node.nodeId) ?? []).some(({ kind }) => kind === "realized-by");
      if (!realized) {
        diagnostics.push(createDiagnostic({
          code: "TG_ORPHAN_REQUIREMENT",
          severity: approvedBlocking(node) ? "error" : "warning",
          blocking: approvedBlocking(node),
          category: "orphan",
          subjectKind: "node",
          subjectId: node.nodeId,
          message: `business objective ${node.stableId} has no realizing capability`,
        }));
      }
    }
    if (node.kind === "capability") {
      const objective = (incoming.get(node.nodeId) ?? []).some(({ kind }) => kind === "realized-by");
      const behavioralRequirement = (outgoing.get(node.nodeId) ?? []).some(({ kind }) =>
        new Set(["specified-by", "exercised-by"]).has(kind),
      );
      const qualityKinds = new Set([
        "non-functional-requirement",
        "requirement-constraint",
      ]);
      const hasApplicableQuality = (targetNodeId) =>
        (incoming.get(targetNodeId) ?? []).some((edge) => {
          const source = nodes.get(edge.sourceNodeId);
          return (
            edge.kind === "applies-to" &&
            qualityKinds.has(source?.kind) &&
            source.authority === node.authority
          );
        });
      const directQuality = hasApplicableQuality(node.nodeId);
      const projectQuality = [...nodes.values()].some(
        (candidate) =>
          candidate.kind === "project" &&
          candidate.authority === node.authority &&
          hasApplicableQuality(candidate.nodeId),
      );
      const requirement = behavioralRequirement || directQuality || projectQuality;
      if (!objective || !requirement) {
        diagnostics.push(createDiagnostic({
          code: "TG_ORPHAN_REQUIREMENT",
          severity: approvedBlocking(node) ? "error" : "warning",
          blocking: approvedBlocking(node),
          category: "orphan",
          subjectKind: "node",
          subjectId: node.nodeId,
          message: `capability ${node.stableId} is not connected to both objective and normative behavior`,
        }));
      }
    }
  }
  for (const node of requirements) {
    const linked = node.kind === "user-story"
      ? (incoming.get(node.nodeId) ?? []).some(({ kind }) => kind === "specified-by")
      : node.kind === "acceptance-criterion"
        ? (incoming.get(node.nodeId) ?? []).some(({ kind }) => kind === "accepted-by")
        : (outgoing.get(node.nodeId) ?? []).some(({ kind }) => kind === "applies-to");
    const designed = node.kind === "acceptance-criterion"
      ? (incoming.get(node.nodeId) ?? [])
          .filter(({ kind }) => kind === "accepted-by")
          .some(({ sourceNodeId }) =>
            (outgoing.get(sourceNodeId) ?? []).some(
              ({ kind }) => kind === "designed-by",
            ),
          )
      : (outgoing.get(node.nodeId) ?? []).some(
          ({ kind }) => kind === "designed-by",
        );
    if (!linked || (traceabilityHorizonRank(snapshot.horizon) >= 1 && !designed)) {
      diagnostics.push(createDiagnostic({
        code: "TG_ORPHAN_REQUIREMENT",
        severity: approvedBlocking(node) ? "error" : "warning",
        blocking: approvedBlocking(node),
        category: "orphan",
        subjectKind: "node",
        subjectId: node.nodeId,
        message: !linked
          ? `${node.kind} ${node.stableId} is not connected to its requirements scope`
          : `${node.kind} ${node.stableId} has no architecture realization at the current horizon`,
      }));
    }
  }

  function hasUpstreamScope(startId) {
    const queue = [startId];
    const seen = new Set(queue);
    while (queue.length > 0) {
      const id = queue.shift();
      const node = nodes.get(id);
      if (node && new Set([
        "project",
        "business-objective",
        "capability",
        "user-story",
        "non-functional-requirement",
        "requirement-constraint",
        "acceptance-criterion",
        "architecture-change",
        "architecture-constraint",
        "architecture-element",
        "architecture-relationship",
        "architecture-view",
        "decision-record",
        "interface-intent",
        "technical-design",
        "contract",
      ]).has(node.kind) && id !== startId) return true;
      for (const edge of incoming.get(id) ?? []) {
        if (
          !new Set([
            "contracted-by",
            "implemented-by",
            "implementation-planned-by",
            "planned-by",
            "realization-planned-by",
          ]).has(edge.kind)
        ) continue;
        if (!seen.has(edge.sourceNodeId)) {
          seen.add(edge.sourceNodeId);
          queue.push(edge.sourceNodeId);
        }
      }
    }
    return false;
  }

  if (traceabilityHorizonRank(snapshot.horizon) >= 3) {
    for (const node of nodes.values()) {
      if (new Set(["work-item", "code-change"]).has(node.kind) && !hasUpstreamScope(node.nodeId)) {
        diagnostics.push(createDiagnostic({
          code: "TG_UNSCOPED_WORK",
          severity: "error",
          blocking: true,
          category: "scope",
          subjectKind: "node",
          subjectId: node.nodeId,
          message: `${node.kind} ${node.stableId} has no upstream product or engineering scope`,
        }));
      }
    }
  }

  const EVIDENCE_PATH_EDGES = new Set([
    "accepted-by",
    "contracted-by",
    "designed-by",
    "implemented-by",
    "implementation-planned-by",
    "planned-by",
    "produces",
    "realization-planned-by",
    "realized-by",
    "specified-by",
    "tested-by",
    "verified-by",
  ]);
  const EVIDENCE_REVERSE_PATH_EDGES = new Set(["applies-to", "defines"]);
  const PASSING_EVIDENCE_AUTHORITIES = new Set([
    "approved",
    "observed",
  ]);

  function reachesPassingEvidence(startId) {
    const queue = [startId];
    const seen = new Set(queue);
    while (queue.length > 0) {
      const id = queue.shift();
      const node = nodes.get(id);
      if (
        node?.kind === "verification-evidence" &&
        node.verificationStatus === "pass" &&
        PASSING_EVIDENCE_AUTHORITIES.has(node.authority)
      ) {
        return true;
      }
      for (const edge of outgoing.get(id) ?? []) {
        const target = nodes.get(edge.targetNodeId);
        if (
          !EVIDENCE_PATH_EDGES.has(edge.kind) ||
          !PASSING_EVIDENCE_AUTHORITIES.has(edge.authority) ||
          !PASSING_EVIDENCE_AUTHORITIES.has(target?.authority)
        ) continue;
        if (!seen.has(edge.targetNodeId)) {
          seen.add(edge.targetNodeId);
          queue.push(edge.targetNodeId);
        }
      }
      for (const edge of incoming.get(id) ?? []) {
        const source = nodes.get(edge.sourceNodeId);
        if (
          !EVIDENCE_REVERSE_PATH_EDGES.has(edge.kind) ||
          !PASSING_EVIDENCE_AUTHORITIES.has(edge.authority) ||
          !PASSING_EVIDENCE_AUTHORITIES.has(source?.authority)
        ) continue;
        if (!seen.has(edge.sourceNodeId)) {
          seen.add(edge.sourceNodeId);
          queue.push(edge.sourceNodeId);
        }
      }
    }
    return false;
  }

  if (traceabilityHorizonRank(snapshot.horizon) >= 4) {
    for (const node of nodes.values()) {
      if (
        node.authority === "approved" &&
        new Set([
          "business-objective",
          "user-story",
          "non-functional-requirement",
          "requirement-constraint",
          "acceptance-criterion",
        ]).has(node.kind) &&
        !reachesPassingEvidence(node.nodeId)
      ) {
        diagnostics.push(createDiagnostic({
          code: "TG_MISSING_EVIDENCE",
          severity: "error",
          blocking: true,
          category: "evidence",
          subjectKind: "node",
          subjectId: node.nodeId,
          message: `${node.kind} ${node.stableId} has no path to passing verification evidence`,
        }));
      }
    }
  }
  diagnostics.sort((left, right) => compareText(left.diagnosticId, right.diagnosticId));
  return immutableJson(diagnostics);
}


export function createTraceabilityDiagnosticReport(snapshot, { graphRef, updateRef } = {}) {
  validateTraceabilityGraphSnapshot(snapshot);
  const bytes = canonicalBytes(snapshot);
  const resolvedGraphRef = graphRef ?? {
    artifactId: `traceability-graph-${safeId(snapshot.graphId)}-r${snapshot.revision}`,
    schema: TRACEABILITY_GRAPH_SCHEMA,
    mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
    digest: sha256Digest(bytes),
    uri: `memory://devrelay/traceability/${encodeURIComponent(snapshot.graphId)}/snapshots/derived-${sha256Digest(bytes).slice(7)}.json`,
  };
  if (
    resolvedGraphRef.schema !== TRACEABILITY_GRAPH_SCHEMA ||
    resolvedGraphRef.mediaType !== TRACEABILITY_GRAPH_MEDIA_TYPE ||
    resolvedGraphRef.digest !== sha256Digest(bytes)
  ) {
    fail("TG_GRAPH_REF_MISMATCH", "diagnostic report graph ref does not match snapshot bytes");
  }
  if (
    updateRef !== undefined &&
    !snapshot.appliedUpdates.some((applied) => sameRef(applied, updateRef))
  ) {
    fail(
      "TG_UPDATE_REF_MISMATCH",
      "diagnostic report update is not an exact applied update of its graph",
    );
  }
  const diagnostics = diagnoseTraceabilityGraph(snapshot);
  const report = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityDiagnosticReport",
    graph: immutableJson(resolvedGraphRef),
    ...(updateRef === undefined ? {} : { update: immutableJson(updateRef) }),
    horizon: snapshot.horizon,
    analyzer: TRACEABILITY_ANALYZER,
    summary: {
      errors: diagnostics.filter(({ severity }) => severity === "error").length,
      warnings: diagnostics.filter(({ severity }) => severity === "warning").length,
      information: diagnostics.filter(({ severity }) => severity === "information").length,
    },
    diagnostics,
  };
  validateTraceabilityDiagnosticReport(report);
  return immutableJson(report);
}

export function queryTraceabilityGraph(snapshot, options = {}) {
  validateTraceabilityGraphSnapshot(snapshot);
  requireRecord(options, "traceability query options");
  const direction = options.direction ?? "outgoing";
  if (!new Set(["outgoing", "incoming", "both"]).has(direction)) {
    fail("TG_INVALID_QUERY", "query direction must be outgoing, incoming, or both");
  }
  const maxDepth = options.maxDepth ?? 64;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 1024) {
    fail("TG_INVALID_QUERY", "query maxDepth must be an integer from 0 through 1024");
  }
  const includeRetired = options.includeRetired === true;
  const nodes = new Map(
    snapshot.nodes
      .filter(({ state }) => includeRetired || state !== "retired")
      .map((node) => [node.nodeId, node]),
  );
  const edges = snapshot.edges
    .filter(
      (edge) =>
        (includeRetired || edge.state !== "retired") &&
        nodes.has(edge.sourceNodeId) &&
        nodes.has(edge.targetNodeId),
    )
    .sort((left, right) => compareText(left.edgeId, right.edgeId));
  let startNodeIds = options.startNodeIds;
  if (startNodeIds === undefined && options.start !== undefined) {
    const start = requireRecord(options.start, "query start");
    startNodeIds = [...nodes.values()]
      .filter(
        (node) =>
          node.kind === start.kind &&
          node.stableId === start.stableId &&
          (start.authority === undefined || node.authority === start.authority) &&
          (start.scope === undefined || node.scope === start.scope),
      )
      .map(({ nodeId }) => nodeId);
  }
  if (!Array.isArray(startNodeIds) || startNodeIds.length === 0) {
    fail("TG_QUERY_START_NOT_FOUND", "query requires at least one existing start node");
  }
  startNodeIds = [...new Set(startNodeIds)].sort(compareText);
  for (const nodeId of startNodeIds) {
    if (!nodes.has(nodeId)) fail("TG_QUERY_START_NOT_FOUND", `query start node ${nodeId} does not exist`);
  }
  const adjacency = new Map();
  const add = (nodeId, edge, nextNodeId) => {
    if (!adjacency.has(nodeId)) adjacency.set(nodeId, []);
    adjacency.get(nodeId).push({ edge, nextNodeId });
  };
  for (const edge of edges) {
    if (direction !== "incoming") add(edge.sourceNodeId, edge, edge.targetNodeId);
    if (direction !== "outgoing") add(edge.targetNodeId, edge, edge.sourceNodeId);
  }
  for (const values of adjacency.values()) {
    values.sort((left, right) => compareText(left.edge.edgeId, right.edge.edgeId));
  }
  const reached = new Set(startNodeIds);
  const reachedEdges = new Set();
  const pathsByNode = new Map(
    startNodeIds.map((nodeId) => [nodeId, { nodeIds: [nodeId], edgeIds: [] }]),
  );
  const queue = startNodeIds.map((nodeId) => ({ nodeId, depth: 0 }));
  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    for (const { edge, nextNodeId } of adjacency.get(nodeId) ?? []) {
      reachedEdges.add(edge.edgeId);
      if (reached.has(nextNodeId)) continue;
      reached.add(nextNodeId);
      const prior = pathsByNode.get(nodeId);
      pathsByNode.set(nextNodeId, {
        nodeIds: [...prior.nodeIds, nextNodeId],
        edgeIds: [...prior.edgeIds, edge.edgeId],
      });
      queue.push({ nodeId: nextNodeId, depth: depth + 1 });
    }
  }
  const targetKinds = options.targetKinds === undefined
    ? undefined
    : new Set(options.targetKinds);
  const paths = [...pathsByNode.entries()]
    .filter(([nodeId]) => !targetKinds || targetKinds.has(nodes.get(nodeId).kind))
    .map(([targetNodeId, path]) => ({ targetNodeId, ...path }))
    .sort((left, right) => compareText(left.targetNodeId, right.targetNodeId));
  return immutableJson({
    graphId: snapshot.graphId,
    revision: snapshot.revision,
    direction,
    startNodeIds,
    nodes: [...reached].map((id) => nodes.get(id)).sort((a, b) => compareText(a.nodeId, b.nodeId)),
    edges: edges.filter(({ edgeId }) => reachedEdges.has(edgeId)),
    paths,
  });
}

function validateChangePreconditions(update, base) {
  const baseNodes = new Map(base.nodes.map((node) => [node.nodeId, node]));
  const baseEdges = new Map(base.edges.map((edge) => [edge.edgeId, edge]));
  for (const [changes, map, key, valueKey] of [
    [update.nodeChanges, baseNodes, "nodeId", "node"],
    [update.edgeChanges, baseEdges, "edgeId", "edge"],
  ]) {
    for (const change of changes) {
      const id = change[valueKey][key];
      const existing = map.get(id);
      if (
        (change.precondition.state === "absent" && existing) ||
        (change.precondition.state === "match" && existing?.contentDigest !== change.precondition.contentDigest)
      ) {
        fail("TG_PRECONDITION_FAILED", `update precondition does not match base assertion ${id}`);
      }
    }
  }
}

function applyChanges(update, base, current) {
  const conflicts = [];
  const effective = { nodes: [], edges: [] };
  const maps = {
    nodes: new Map(current.nodes.map((node) => [node.nodeId, node])),
    edges: new Map(current.edges.map((edge) => [edge.edgeId, edge])),
  };
  for (const [changes, baseRecords, currentMap, idField, valueField, bucket] of [
    [update.nodeChanges, base.nodes, maps.nodes, "nodeId", "node", "nodes"],
    [update.edgeChanges, base.edges, maps.edges, "edgeId", "edge", "edges"],
  ]) {
    const baseMap = new Map(baseRecords.map((record) => [record[idField], record]));
    for (const change of changes) {
      const desired = change[valueField];
      const id = desired[idField];
      const before = baseMap.get(id);
      const now = currentMap.get(id);
      const untouched = before?.contentDigest === now?.contentDigest || (!before && !now);
      const converged = now?.contentDigest === desired.contentDigest;
      if (!untouched && !converged) {
        conflicts.push(id);
        continue;
      }
      if (!converged) {
        currentMap.set(id, desired);
        effective[bucket].push({ before: now, after: desired });
      }
    }
  }
  if (conflicts.length > 0) {
    const diagnostic = createDiagnostic({
      code: "TG_PRECONDITION_FAILED",
      severity: "error",
      blocking: true,
      category: "concurrency",
      subjectKind: "graph",
      subjectId: current.graphId,
      relatedNodeIds: conflicts.filter((id) => maps.nodes.has(id)),
      message: `concurrent graph changes overlap ${conflicts.length} assertion(s)`,
    });
    throw new TraceabilityConflictError("stale update overlaps current graph changes", [diagnostic]);
  }
  return {
    nodes: [...maps.nodes.values()].sort((a, b) => compareText(a.nodeId, b.nodeId)),
    edges: [...maps.edges.values()].sort((a, b) => compareText(a.edgeId, b.edgeId)),
    effective,
  };
}

function changeSummary(effective) {
  const summary = {
    nodesAdded: 0,
    nodesReplaced: 0,
    nodesRetired: 0,
    edgesAdded: 0,
    edgesReplaced: 0,
    edgesRetired: 0,
  };
  for (const { before, after } of effective.nodes) {
    if (!before) summary.nodesAdded += 1;
    else if (after.state === "retired" && before.state !== "retired") summary.nodesRetired += 1;
    else summary.nodesReplaced += 1;
  }
  for (const { before, after } of effective.edges) {
    if (!before) summary.edgesAdded += 1;
    else if (after.state === "retired" && before.state !== "retired") summary.edgesRetired += 1;
    else summary.edgesReplaced += 1;
  }
  return summary;
}


function verifyGraphLoaded(entry, expectedRef, graphId, projectId, label) {
  requireRecord(entry, label);
  requireRecord(entry.ref, `${label}.ref`);
  if (expectedRef && !sameRef(entry.ref, expectedRef)) {
    fail("TG_GRAPH_REF_MISMATCH", `${label} returned a different graph ref`);
  }
  if (
    entry.ref.schema !== TRACEABILITY_GRAPH_SCHEMA ||
    entry.ref.mediaType !== TRACEABILITY_GRAPH_MEDIA_TYPE
  ) {
    fail("TG_GRAPH_REF_MISMATCH", `${label} is not a TraceabilityGraph snapshot ref`);
  }
  if (!Buffer.isBuffer(entry.bytes) && !(entry.bytes instanceof Uint8Array)) {
    fail("TG_INVALID_STORE", `${label}.bytes must be raw bytes`);
  }
  const bytes = Buffer.from(entry.bytes);
  if (sha256Digest(bytes) !== entry.ref.digest) {
    fail("TG_GRAPH_DIGEST_MISMATCH", `${label} bytes do not match their ref`);
  }
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail("TG_GRAPH_DECODE_FAILED", `${label} is not valid UTF-8 JSON: ${error.message}`);
  }
  if (
    entry.value === undefined ||
    canonicalJsonDigest(decoded) !== canonicalJsonDigest(entry.value)
  ) {
    fail("TG_GRAPH_VALUE_MISMATCH", `${label} bytes and value differ`);
  }
  validateTraceabilityGraphSnapshot(decoded);
  if (decoded.graphId !== graphId || decoded.projectId !== projectId) {
    fail("TG_GRAPH_IDENTITY_MISMATCH", `${label} belongs to a different graph or project`);
  }
  return Object.freeze({ ref: immutableJson(entry.ref), bytes, value: immutableJson(decoded) });
}

function verifyMergeResult(result, expectedUpdateRef, graphId, projectId, label) {
  requireRecord(result, label);
  const keys = Object.keys(result).sort().join(",");
  if (keys !== "diagnostics,disposition,receipt,receiptRef,snapshot,snapshotRef") {
    fail("TG_INVALID_STORE", `${label} must have the exact merge-result shape`);
  }
  if (!new Set(["merged", "rebased", "no-op"]).has(result.disposition)) {
    fail("TG_INVALID_STORE", `${label}.disposition is invalid`);
  }
  const snapshot = verifyGraphLoaded(
    {
      ref: result.snapshotRef,
      bytes: canonicalBytes(result.snapshot),
      value: result.snapshot,
    },
    result.snapshotRef,
    graphId,
    projectId,
    `${label}.snapshot`,
  );
  requireRecord(result.receiptRef, `${label}.receiptRef`);
  if (
    result.receiptRef.schema !== TRACEABILITY_RECEIPT_SCHEMA ||
    result.receiptRef.mediaType !== TRACEABILITY_RECEIPT_MEDIA_TYPE ||
    result.receiptRef.digest !== sha256Digest(canonicalBytes(result.receipt))
  ) {
    fail("TG_RECEIPT_REF_MISMATCH", `${label}.receiptRef does not bind the receipt bytes`);
  }
  validateTraceabilityMergeReceipt(result.receipt);
  if (
    result.receipt.graphId !== graphId ||
    !sameRef(result.receipt.update, expectedUpdateRef) ||
    !sameRef(result.receipt.resultGraph, snapshot.ref) ||
    result.receipt.disposition !== result.disposition ||
    result.receipt.revisionAfter !== snapshot.value.revision ||
    canonicalJsonDigest(result.receipt.diagnostics) !== canonicalJsonDigest(result.diagnostics)
  ) {
    fail("TG_RECEIPT_PROOF_MISMATCH", `${label} is not a coherent merge proof`);
  }
  return freezeMergeResult(result);
}

function verifyJsonLoaded(
  entry,
  expectedRef,
  schema,
  mediaType,
  validator,
  label,
) {
  requireRecord(entry, label);
  requireRecord(entry.ref, `${label}.ref`);
  if (!sameRef(entry.ref, expectedRef)) {
    fail("TG_STORED_ARTIFACT_REF_MISMATCH", `${label} returned a different artifact ref`);
  }
  if (entry.ref.schema !== schema || entry.ref.mediaType !== mediaType) {
    fail("TG_STORED_ARTIFACT_REF_MISMATCH", `${label} has the wrong artifact contract`);
  }
  if (!Buffer.isBuffer(entry.bytes) && !(entry.bytes instanceof Uint8Array)) {
    fail("TG_INVALID_STORE", `${label}.bytes must be raw bytes`);
  }
  const bytes = Buffer.from(entry.bytes);
  if (sha256Digest(bytes) !== entry.ref.digest) {
    fail("TG_STORED_ARTIFACT_DIGEST_MISMATCH", `${label} bytes do not match their ref`);
  }
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail("TG_STORED_ARTIFACT_DECODE_FAILED", `${label} is not valid UTF-8 JSON: ${error.message}`);
  }
  if (
    entry.value === undefined ||
    canonicalJsonDigest(decoded) !== canonicalJsonDigest(entry.value)
  ) {
    fail("TG_STORED_ARTIFACT_VALUE_MISMATCH", `${label} bytes and value differ`);
  }
  validator(decoded);
  return Object.freeze({
    ref: immutableJson(entry.ref),
    bytes,
    value: immutableJson(decoded),
  });
}

function materializeMerge({ prepared, base, current, graphId, projectId }) {
  assertTraceabilityVocabularyTransition(
    current.value.vocabulary,
    prepared.update.vocabulary,
  );
  validateChangePreconditions(prepared.update, base.value);
  const applied = applyChanges(prepared.update, base.value, current.value);
  const hasChanges = applied.effective.nodes.length + applied.effective.edges.length > 0;
  const disposition = !hasChanges
    ? "no-op"
    : sameRef(base.ref, current.ref)
      ? "merged"
      : "rebased";
  const appliedUpdates = [
    ...current.value.appliedUpdates.filter(
      ({ digest }) => digest !== prepared.updateRef.digest,
    ),
    prepared.updateRef,
  ].sort((left, right) => compareText(refKey(left), refKey(right)));
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId,
    projectId,
    revision: current.value.revision + 1,
    horizon: maxHorizon([current.value.horizon, prepared.update.horizon]),
    vocabulary: immutableJson(prepared.update.vocabulary),
    parentGraph: immutableJson(current.ref),
    lastAppliedUpdate: immutableJson(prepared.updateRef),
    appliedUpdates,
    nodes: applied.nodes,
    edges: applied.edges,
  };
  validateTraceabilityGraphSnapshot(snapshot);
  const snapshotEntry = makeRef({
    artifactId: `traceability-graph-${safeId(graphId)}-r${snapshot.revision}`,
    schema: TRACEABILITY_GRAPH_SCHEMA,
    mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
    value: snapshot,
    graphId,
    category: "snapshots",
  });
  const diagnostics = diagnoseTraceabilityGraph(snapshotEntry.value);
  const receipt = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityMergeReceipt",
    graphId,
    update: immutableJson(prepared.updateRef),
    previousGraph: immutableJson(current.ref),
    resultGraph: immutableJson(snapshotEntry.ref),
    disposition,
    mergeEngine: TRACEABILITY_MERGE_ENGINE,
    revisionBefore: current.value.revision,
    revisionAfter: snapshotEntry.value.revision,
    changes: changeSummary(applied.effective),
    diagnostics,
  };
  validateTraceabilityMergeReceipt(receipt);
  const receiptEntry = makeRef({
    artifactId: `traceability-merge-receipt-${prepared.update.updateId.slice(7, 23)}`,
    schema: TRACEABILITY_RECEIPT_SCHEMA,
    mediaType: TRACEABILITY_RECEIPT_MEDIA_TYPE,
    value: receipt,
    graphId,
    category: "receipts",
  });
  const result = freezeMergeResult({
    disposition,
    snapshotRef: snapshotEntry.ref,
    snapshot: snapshotEntry.value,
    receiptRef: receiptEntry.ref,
    receipt,
    diagnostics,
  });
  return Object.freeze({ result, snapshotEntry, receiptEntry });
}

function verifyStoredApplication({
  store,
  result,
  expectedUpdateRef,
  expectedUpdate,
  graphId,
  projectId,
  label,
}) {
  const verified = verifyMergeResult(
    result,
    expectedUpdateRef,
    graphId,
    projectId,
    label,
  );
  const updateEntry = verifyJsonLoaded(
    store.load(expectedUpdateRef),
    expectedUpdateRef,
    TRACEABILITY_UPDATE_SCHEMA,
    TRACEABILITY_UPDATE_MEDIA_TYPE,
    validateTraceabilityUpdate,
    `${label}.storedUpdate`,
  );
  if (
    updateEntry.value.graphId !== graphId ||
    updateEntry.value.projectId !== projectId ||
    (expectedUpdate !== undefined &&
      canonicalJsonDigest(updateEntry.value) !== canonicalJsonDigest(expectedUpdate))
  ) {
    fail("TG_STORED_UPDATE_MISMATCH", `${label} stored a different update`);
  }
  const storedReceipt = verifyJsonLoaded(
    store.load(verified.receiptRef),
    verified.receiptRef,
    TRACEABILITY_RECEIPT_SCHEMA,
    TRACEABILITY_RECEIPT_MEDIA_TYPE,
    validateTraceabilityMergeReceipt,
    `${label}.storedReceipt`,
  );
  if (canonicalJsonDigest(storedReceipt.value) !== canonicalJsonDigest(verified.receipt)) {
    fail("TG_STORED_RECEIPT_MISMATCH", `${label} receipt is not the stored receipt`);
  }
  const storedSnapshot = verifyGraphLoaded(
    store.load(verified.snapshotRef),
    verified.snapshotRef,
    graphId,
    projectId,
    `${label}.storedSnapshot`,
  );
  if (canonicalJsonDigest(storedSnapshot.value) !== canonicalJsonDigest(verified.snapshot)) {
    fail("TG_STORED_SNAPSHOT_MISMATCH", `${label} snapshot is not the stored graph`);
  }
  const base = normalizeBase(store, graphId, projectId, updateEntry.value.baseGraph);
  const previous = normalizeBase(
    store,
    graphId,
    projectId,
    verified.receipt.previousGraph,
  );
  if (!isVerifiedAncestor(store, base.ref, previous, graphId, projectId)) {
    fail("TG_STORED_APPLICATION_INVALID", `${label} update base is not an ancestor of its previous graph`);
  }
  const expected = materializeMerge({
    prepared: { updateRef: updateEntry.ref, update: updateEntry.value },
    base,
    current: previous,
    graphId,
    projectId,
  }).result;
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(verified)) {
    fail("TG_STORED_APPLICATION_INVALID", `${label} does not represent the exact update application`);
  }
  const head = verifyGraphLoaded(
    store.capture(graphId),
    undefined,
    graphId,
    projectId,
    `${label}.currentHead`,
  );
  if (!isVerifiedAncestor(store, storedSnapshot.ref, head, graphId, projectId)) {
    fail("TG_UPDATE_NOT_APPLIED", `${label} result graph is not in the persisted head lineage`);
  }
  return verified;
}

function isVerifiedAncestor(store, ancestorRef, descendant, graphId, projectId) {
  let cursor = descendant;
  const visited = new Set();
  const maximumDepth = descendant.value.revision + 1;
  for (;;) {
    if (sameRef(cursor.ref, ancestorRef)) return true;
    if (visited.has(cursor.ref.digest)) {
      fail("TG_GRAPH_LINEAGE_CYCLE", "graph snapshot parent lineage contains a cycle");
    }
    visited.add(cursor.ref.digest);
    if (visited.size > maximumDepth) {
      fail("TG_GRAPH_LINEAGE_INVALID", "graph snapshot lineage exceeds its revision bound");
    }
    if (cursor.value.parentGraph === null) return false;
    const childRevision = cursor.value.revision;
    const parent = verifyGraphLoaded(
      store.load(cursor.value.parentGraph),
      cursor.value.parentGraph,
      graphId,
      projectId,
      "graph parent",
    );
    if (parent.value.revision !== childRevision - 1) {
      fail(
        "TG_GRAPH_LINEAGE_INVALID",
        "graph snapshot parent revision must decrement by exactly one",
      );
    }
    cursor = parent;
  }
}

function normalizeBase(store, graphId, projectId, baseGraph) {
  const ref = baseGraph?.ref ?? baseGraph;
  requireRecord(ref, "baseGraph");
  return verifyGraphLoaded(
    store.load(ref),
    ref,
    graphId,
    projectId,
    "base graph",
  );
}

function selectUpdateVocabulary(baseVocabulary, rawProjects) {
  const usesOnlyV1_1Edges = rawProjects.every(({ projected }) =>
    projected.edges.every(({ kind }) => TRACEABILITY_EDGE_KINDS_V1_1.includes(kind)),
  );
  if (
    baseVocabulary.version === TRACEABILITY_VOCABULARY_V1_1.version &&
    baseVocabulary.contractDigest === TRACEABILITY_VOCABULARY_V1_1.contractDigest &&
    usesOnlyV1_1Edges
  ) {
    return TRACEABILITY_VOCABULARY_V1_1;
  }
  return TRACEABILITY_VOCABULARY;
}
function preparedValue(baseGraphRef, updateEntry) {
  const checkpoint = immutableJson({
    baseGraphRef,
    updateRef: updateEntry.ref,
    update: updateEntry.value,
  });
  const value = Object.freeze({
    baseGraphRef: immutableJson(baseGraphRef),
    updateRef: immutableJson(updateEntry.ref),
    update: immutableJson(updateEntry.value),
    checkpoint,
  });
  PREPARED.add(value);
  return value;
}

export function createTraceabilityGraphService({ graphId, projectId, store, contributors }) {
  requireString(graphId, "graphId");
  requireString(projectId, "projectId");
  requireRecord(store, "store");
  for (const method of ["initialize", "capture", "load", "receipt", "isAncestor", "commit"]) {
    if (typeof store[method] !== "function") {
      fail("TG_INVALID_ARGUMENT", `store.${method} must be a function`);
    }
  }
  const registered = normalizeContributors(contributors);
  const initialSnapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId,
    projectId,
    revision: 0,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [],
    edges: [],
  };
  validateTraceabilityGraphSnapshot(initialSnapshot);
  const initial = makeRef({
    artifactId: `traceability-graph-${safeId(graphId)}-r0`,
    schema: TRACEABILITY_GRAPH_SCHEMA,
    mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
    value: initialSnapshot,
    graphId,
    category: "snapshots",
  });
  verifyGraphLoaded(
    store.initialize(graphId, initial),
    undefined,
    graphId,
    projectId,
    "initialized graph",
  );

  function captureBase() {
    const loaded = verifyGraphLoaded(
      store.capture(graphId),
      undefined,
      graphId,
      projectId,
      "captured graph",
    );
    return Object.freeze({
      graphId,
      projectId,
      revision: loaded.value.revision,
      ref: immutableJson(loaded.ref),
      snapshot: immutableJson(loaded.value),
      bytes: Buffer.from(loaded.bytes),
    });
  }

  async function prepare(request) {
    requireRecord(request, "prepare request");
    const {
      baseGraph,
      invocation,
      invocationFingerprint,
      moduleResult,
      loadedInputs = {},
      loadedOutputs = {},
      loadedAttachments,
      resolvedArtifacts,
      resolveArtifact,
      gate,
    } = request;
    requireRecord(invocation, "invocation");
    requireRecord(moduleResult, "moduleResult");
    const base = normalizeBase(store, graphId, projectId, baseGraph);
    const tracked = await createTrackedResolver({
      loadedInputs,
      loadedOutputs,
      loadedAttachments,
      resolvedArtifacts,
      resolveArtifact,
    });
    const context = {
      graphId,
      projectId,
      baseGraph: Object.freeze({
        ref: immutableJson(base.ref),
        snapshot: immutableJson(base.value),
        bytes: Buffer.from(base.bytes),
      }),
      invocation: immutableJson(invocation),
      invocationFingerprint,
      moduleResult: immutableJson(moduleResult),
      ...(gate === undefined ? {} : { gate: immutableJson(gate) }),
      loadedInputs,
      loadedOutputs,
      loadedAttachments,
      resolvedArtifacts,
      loadedArtifacts: [...tracked.closure.values()],
      resolveArtifact: tracked.resolve,
    };

    const matches = [];
    for (const contributor of registered) {
      if (await contributorMatches(contributor, context)) matches.push(contributor);
    }
    if (matches.length === 0) {
      const outputCount = collectOutputRefs(moduleResult).length;
      const evidenceCount = Array.isArray(moduleResult.evidence) ? moduleResult.evidence.length : 0;
      if (outputCount > 0 || evidenceCount > 0) {
        fail(
          "TG_MISSING_CONTRIBUTOR",
          `no traceability contributor matches contribution-bearing outcome ${moduleResult.outcome}`,
        );
      }
      matches.push({
        metadata: CORE_EMPTY_CONTRIBUTOR,
        scope: CORE_EMPTY_OWNERSHIP.scope,
        authority: CORE_EMPTY_OWNERSHIP.authority,
        ownership: CORE_EMPTY_OWNERSHIP,
        async project() {
          return {
            horizon: base.value.horizon,
            nodes: [],
            edges: [],
            reason: moduleResult.status === "failed"
              ? "failed terminal outcome has no semantic graph facts"
              : "output-empty terminal outcome has no semantic graph facts",
          };
        },
      });
    }

    const owners = [];
    const rawProjects = [];
    const activeOwners = new Set();
    for (const contributor of matches) {
      const owner = {
        contributor: contributor.metadata,
        scope: contributor.ownership.scope,
        authority: contributor.ownership.authority,
        nodeKinds: contributor.ownership.nodeKinds,
        edgeKinds: contributor.ownership.edgeKinds,
      };
      const ownerKey = `${owner.authority}\u0000${owner.scope}`;
      if (activeOwners.has(ownerKey)) {
        fail(
          "TG_CONTRIBUTOR_OWNERSHIP_CONFLICT",
          `multiple matching projections claim ${owner.authority}/${owner.scope}`,
        );
      }
      activeOwners.add(ownerKey);
      const projected = requireRecord(await contributor.project(context), "contributor project result");
      if (!TRACEABILITY_HORIZONS.includes(projected.horizon)) {
        fail("TG_INVALID_ASSERTION", `contributor returned unknown horizon ${projected.horizon}`);
      }
      if (!Array.isArray(projected.nodes) || !Array.isArray(projected.edges)) {
        fail("TG_INVALID_ASSERTION", "contributor project must return nodes and edges arrays");
      }
      const empty = projected.nodes.length === 0 && projected.edges.length === 0;
      if (empty && (typeof projected.reason !== "string" || projected.reason.length === 0)) {
        fail("TG_EMPTY_PROJECTION_REASON_REQUIRED", `empty projection ${owner.scope} requires a reason`);
      }
      owners.push({ ...owner, empty });
      rawProjects.push({ owner, projected });
    }

    const desiredNodes = new Map();
    for (const { owner, projected } of rawProjects) {
      for (const [index, raw] of projected.nodes.entries()) {
        if (
          raw.kind !== "artifact-reference" &&
          !owner.nodeKinds.includes(raw.kind)
        ) {
          fail("TG_UNAUTHORIZED_ASSERTION_KIND", `${owner.scope} cannot project node kind ${raw.kind}`);
        }
        putDesired(
          desiredNodes,
          normalizeNode(raw, owner, graphId, tracked.closure, `${owner.scope}.nodes[${index}]`),
          "node",
        );
      }
    }
    const available = new Map(base.value.nodes.map((node) => [node.nodeId, node]));
    for (const node of desiredNodes.values()) available.set(node.nodeId, node);
    const desiredEdges = new Map();
    for (const { owner, projected } of rawProjects) {
      for (const [index, raw] of projected.edges.entries()) {
        if (!owner.edgeKinds.includes(raw.kind)) {
          fail("TG_UNAUTHORIZED_ASSERTION_KIND", `${owner.scope} cannot project edge kind ${raw.kind}`);
        }
        putDesired(
          desiredEdges,
          normalizeEdge(raw, owner, graphId, available, tracked.closure, `${owner.scope}.edges[${index}]`),
          "edge",
        );
      }
    }

    const nodeChanges = diffRecords(base.value.nodes, desiredNodes, owners, "nodeId");
    const edgeChanges = diffRecords(base.value.edges, desiredEdges, owners, "edgeId");
    const scopes = rawProjects.map(({ owner, projected }) => {
      const nodeIds = projected.nodes
        .filter(({ kind }) => kind !== "artifact-reference")
        .map((raw) =>
          traceabilityNodeId({
            graphId,
            kind: raw.kind,
            stableId: raw.stableId,
            authority: owner.authority,
            scope: owner.scope,
          }),
        )
        .sort(compareText);
      nodeIds.push(
        ...nodeChanges
          .map(({ node }) => node)
          .filter(
            (node) =>
              node.kind !== "artifact-reference" &&
              node.scope === owner.scope &&
              node.authority === owner.authority &&
              sameContributor(node.contributor, owner.contributor),
          )
          .map(({ nodeId }) => nodeId),
      );
      const edgeIds = [
        ...[...desiredEdges.values()]
          .filter(
            (edge) => edge.scope === owner.scope && edge.authority === owner.authority,
          )
          .map(({ edgeId }) => edgeId),
        ...edgeChanges
        .map(({ edge }) => edge)
        .filter(
          (edge) =>
            edge.scope === owner.scope &&
            edge.authority === owner.authority &&
            sameContributor(edge.contributor, owner.contributor),
        )
        .map(({ edgeId }) => edgeId),
      ]
        .sort(compareText);
      const emptyAfterCoreProjection = nodeIds.length === 0 && edgeIds.length === 0;
      return {
        scope: owner.scope,
        contributor: owner.contributor,
        authority: owner.authority,
        nodeIds: [...new Set(nodeIds)].sort(compareText),
        edgeIds: [...new Set(edgeIds)].sort(compareText),
        ...(projected.reason !== undefined
          ? { reason: projected.reason }
          : emptyAfterCoreProjection
            ? { reason: "projection contains only Core-owned artifact references" }
            : {}),
      };
    });
    const artifactNodeIds = [...desiredNodes.values()]
      .filter(({ kind }) => kind === "artifact-reference")
      .map(({ nodeId }) => nodeId)
      .sort(compareText);
    if (artifactNodeIds.length > 0) {
      scopes.push({
        scope: "core/artifact-reference",
        contributor: CORE_ARTIFACT_CONTRIBUTOR,
        authority: "reference",
        nodeIds: artifactNodeIds,
        edgeIds: [],
      });
    }
    scopes.sort((left, right) => compareText(
      `${left.scope}\u0000${left.contributor.id}\u0000${left.contributor.version}`,
      `${right.scope}\u0000${right.contributor.id}\u0000${right.contributor.version}`,
    ));

    const sourceArtifactsByPointer = new Map(
      [...tracked.closure.values()].map(({ ref }) => [
        pointerKey(ref),
        immutableJson(ref),
      ]),
    );
    const baseArtifactRefs = new Map();
    for (const { attributes } of base.value.nodes.filter(
      ({ kind }) => kind === "artifact-reference",
    )) {
      baseArtifactRefs.set(
        pointerKey(attributes.artifact),
        immutableJson(attributes.artifact),
      );
    }
    for (const appliedUpdateRef of base.value.appliedUpdates) {
      const historical = verifyJsonLoaded(
        store.load(appliedUpdateRef),
        appliedUpdateRef,
        TRACEABILITY_UPDATE_SCHEMA,
        TRACEABILITY_UPDATE_MEDIA_TYPE,
        validateTraceabilityUpdate,
        "historical traceability update",
      );
      if (
        historical.value.graphId !== graphId ||
        historical.value.projectId !== projectId
      ) {
        fail("TG_GRAPH_IDENTITY_MISMATCH", "historical update belongs to another graph or project");
      }
      for (const ref of historical.value.sourceArtifacts) {
        baseArtifactRefs.set(pointerKey(ref), immutableJson(ref));
      }
    }
    for (const assertion of [
      ...nodeChanges.map(({ node }) => node),
      ...edgeChanges.map(({ edge }) => edge),
    ]) {
      for (const locator of assertion.sourceLocators) {
        const key = pointerKey(locator.artifact);
        if (!sourceArtifactsByPointer.has(key)) {
          const prior = baseArtifactRefs.get(key);
          if (!prior) {
            fail(
              "TG_UNTRUSTED_SOURCE",
              `changed assertion cites unavailable source ${locator.artifact.artifactId}`,
            );
          }
          sourceArtifactsByPointer.set(key, prior);
        }
      }
    }
    const sourceArtifacts = [...sourceArtifactsByPointer.values()].sort(
      (left, right) => compareText(refKey(left), refKey(right)),
    );
    const updateMaterial = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "TraceabilityUpdate",
      graphId,
      projectId,
      baseGraph: immutableJson(base.ref),
      horizon: maxHorizon(rawProjects.map(({ projected }) => projected.horizon)),
      vocabulary: selectUpdateVocabulary(base.value.vocabulary, rawProjects),
      producer: producer(invocation, invocationFingerprint, moduleResult),
      sourceArtifacts,
      scopes,
      nodeChanges,
      edgeChanges,
    };
    const update = { updateId: traceabilityUpdateId(updateMaterial), ...updateMaterial };
    validateTraceabilityUpdate(update);
    validateChangePreconditions(update, base.value);
    const updateEntry = makeRef({
      artifactId: `traceability-update-${update.updateId.slice(7, 23)}`,
      schema: TRACEABILITY_UPDATE_SCHEMA,
      mediaType: TRACEABILITY_UPDATE_MEDIA_TYPE,
      value: update,
      graphId,
      category: "updates",
    });
    if (
      moduleResult.traceabilityUpdate !== undefined &&
      !sameRef(moduleResult.traceabilityUpdate, updateEntry.ref)
    ) {
      fail("TG_RESULT_UPDATE_MISMATCH", "moduleResult.traceabilityUpdate does not match prepared update");
    }
    materializeMerge({
      prepared: { updateRef: updateEntry.ref, update: updateEntry.value },
      base,
      current: base,
      graphId,
      projectId,
    });
    return preparedValue(base.ref, updateEntry);
  }

  async function validatePrepared(request) {
    requireRecord(request, "validatePrepared request");
    const checkpoint = requireRecord(request.checkpoint, "checkpoint");
    const exactKeys = Object.keys(checkpoint).sort().join(",");
    if (exactKeys !== "baseGraphRef,update,updateRef") {
      fail("TG_INVALID_CHECKPOINT", "prepared checkpoint must contain exactly baseGraphRef, updateRef, and update");
    }
    const recomputed = await prepare({
      ...request,
      baseGraph: checkpoint.baseGraphRef,
    });
    if (
      !sameRef(recomputed.baseGraphRef, checkpoint.baseGraphRef) ||
      !sameRef(recomputed.updateRef, checkpoint.updateRef) ||
      canonicalJsonDigest(recomputed.update) !== canonicalJsonDigest(checkpoint.update)
    ) {
      fail("TG_PREPARED_CHECKPOINT_MISMATCH", "prepared checkpoint does not match deterministic reprojection");
    }
    return recomputed;
  }

  async function mergePrepared(candidate, attempt = 1) {
    const prepared = candidate?.prepared ?? candidate;
    if (!PREPARED.has(prepared)) {
      fail("TG_UNVERIFIED_PREPARED_UPDATE", "merge requires an in-process prepared update");
    }
    const prior = store.receipt(prepared.updateRef);
    if (prior) {
      return verifyStoredApplication({
        store,
        result: prior,
        expectedUpdateRef: prepared.updateRef,
        expectedUpdate: prepared.update,
        graphId,
        projectId,
        label: "stored receipt result",
      });
    }
    const base = normalizeBase(store, graphId, projectId, prepared.baseGraphRef);
    const current = verifyGraphLoaded(
      store.capture(graphId),
      undefined,
      graphId,
      projectId,
      "current graph",
    );
    if (!isVerifiedAncestor(store, base.ref, current, graphId, projectId)) {
      throw new TraceabilityConflictError("prepared base is not an ancestor of the current graph", []);
    }
    const { result, snapshotEntry, receiptEntry } = materializeMerge({
      prepared,
      base,
      current,
      graphId,
      projectId,
    });
    const committed = store.commit({
      graphId,
      expectedHead: current.ref,
      artifacts: [
        {
          ref: prepared.updateRef,
          bytes: canonicalBytes(prepared.update),
          value: prepared.update,
        },
        snapshotEntry,
        receiptEntry,
      ],
      updateRef: prepared.updateRef,
      result,
    });
    if (!committed) {
      if (attempt >= MAX_COMMIT_ATTEMPTS) {
        fail(
          "TG_COMMIT_RETRY_EXHAUSTED",
          `graph commit did not win after ${MAX_COMMIT_ATTEMPTS} attempts`,
        );
      }
      return mergePrepared(prepared, attempt + 1);
    }
    const verified = verifyStoredApplication({
      store,
      result: committed,
      expectedUpdateRef: prepared.updateRef,
      expectedUpdate: prepared.update,
      graphId,
      projectId,
      label: "committed merge result",
    });
    if (canonicalJsonDigest(verified) !== canonicalJsonDigest(result)) {
      fail("TG_COMMIT_RESULT_MISMATCH", "store commit returned a result different from the proposed merge");
    }
    return verified;
  }

  function assertApplied(updateRef) {
    requireRecord(updateRef, "updateRef");
    if (
      updateRef.schema !== TRACEABILITY_UPDATE_SCHEMA ||
      updateRef.mediaType !== TRACEABILITY_UPDATE_MEDIA_TYPE ||
      !DIGEST_PATTERN.test(updateRef.digest)
    ) {
      fail("TG_UPDATE_REF_MISMATCH", "assertApplied requires a TraceabilityUpdate ref");
    }
    const result = store.receipt(updateRef);
    if (!result) {
      fail("TG_UPDATE_NOT_APPLIED", `traceability update ${updateRef.digest} is not applied`);
    }
    const verified = verifyStoredApplication({
      store,
      result,
      expectedUpdateRef: updateRef,
      graphId,
      projectId,
      label: "stored applied result",
    });
    return Object.freeze({
      updateRef: immutableJson(updateRef),
      receiptRef: immutableJson(verified.receiptRef),
      receipt: immutableJson(verified.receipt),
      resultGraphRef: immutableJson(verified.snapshotRef),
    });
  }

  return Object.freeze({
    graphId,
    projectId,
    captureBase,
    prepare,
    validatePrepared,
    mergePrepared,
    assertApplied,
  });
}

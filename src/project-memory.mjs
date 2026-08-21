import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "./content-digest.mjs";
import {
  PROJECT_MEMORY_ARTIFACT_CONTRACTS,
  validateProjectMemoryArtifact,
  withProjectMemoryContentDigest,
} from "./project-memory-artifact-validator.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const QUALITATIVE_DOMAINS = new Set([
  "requirements",
  "architecture",
  "contracts",
  "roadmap",
  "work-planning",
]);
const DOMAIN_ROUTES = Object.freeze({
  requirements: "requirements-gathering",
  architecture: "architecture-design",
  contracts: "contract-generation",
  roadmap: "roadmap-management",
  "work-planning": "work-breakdown",
});

export class ProjectMemoryRuntimeError extends Error {
  constructor(message, code = "DR5310") {
    super(`project memory runtime failed: ${message}`);
    this.name = "ProjectMemoryRuntimeError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new ProjectMemoryRuntimeError(message, code);
};

const immutable = (value) => {
  const copy = structuredClone(value);
  const freeze = (subject) => {
    if (ArrayBuffer.isView(subject)) return subject;
    if (subject && typeof subject === "object" && !Object.isFrozen(subject)) {
      Object.freeze(subject);
      for (const child of Object.values(subject)) freeze(child);
    }
    return subject;
  };
  return freeze(copy);
};

function assertId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(`${label} must be a safe non-empty identity`, "DR5311");
  }
  return value;
}

function sameRef(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function artifactIdFor(value) {
  return (
    value.candidateId ??
    value.baselineId ??
    value.approvalId ??
    value.proofId ??
    value.receiptId ??
    value.projectionId ??
    value.bundleId ??
    value.conclusionId ??
    value.stateId
  );
}

export function loadProjectMemoryArtifact(value, uri) {
  validateProjectMemoryArtifact(value);
  const contract = PROJECT_MEMORY_ARTIFACT_CONTRACTS[value.kind];
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const artifactId = artifactIdFor(value);
  return immutable({
    value,
    bytes,
    ref: {
      artifactId,
      schema: contract.schema,
      mediaType: contract.mediaType,
      digest: sha256Digest(bytes),
      uri:
        uri ??
        `memory://devrelay/project-memory/${encodeURIComponent(artifactId)}/${sha256Digest(bytes).slice(7)}.json`,
    },
  });
}

export function projectMemoryNamespace({
  projectId,
  sessionId,
  moduleId,
  invocationId,
} = {}) {
  const segments = ["project", assertId(projectId, "projectId")];
  if (sessionId !== undefined) {
    segments.push("session", assertId(sessionId, "sessionId"));
  }
  if (moduleId !== undefined) {
    if (sessionId === undefined) fail("module namespace requires sessionId", "DR5312");
    segments.push("module", assertId(moduleId, "moduleId"));
  }
  if (invocationId !== undefined) {
    if (moduleId === undefined) fail("invocation namespace requires moduleId", "DR5312");
    segments.push("invocation", assertId(invocationId, "invocationId"));
  }
  return segments.join("/");
}

export function routeProjectMemoryOperation({
  requestedOperation,
  currentSession,
  taskId,
  contextStale = false,
} = {}) {
  const allowed = new Set([
    "load-context",
    "propose-update",
    "refresh-context",
    "conclude-session",
  ]);
  if (!allowed.has(requestedOperation)) fail("unsupported operation", "DR5313");
  if (
    currentSession?.status === "open" &&
    currentSession.taskId !== taskId
  ) {
    return immutable({
      operation: "recovery-required",
      outcome: "blocked",
      allowedActions: ["resume", "conclude", "abandon"],
      blockingSessionId: currentSession.sessionId,
    });
  }
  if (requestedOperation === "load-context" && contextStale) {
    return immutable({ operation: "refresh-context", outcome: "routed" });
  }
  return immutable({ operation: requestedOperation, outcome: "routed" });
}

export function createMemoryUpdateCandidate({
  projectId,
  sessionId,
  taskId,
  baseBaseline,
  baseGraphCheckpoint,
  producerType,
  parentTaskId,
  changes,
  sourceRefs,
} = {}) {
  if (!Array.isArray(changes)) fail("changes must be an array", "DR5314");
  const material = {
    apiVersion: API_VERSION,
    kind: "MemoryUpdateCandidate",
    candidateId: `MUC-${canonicalJsonDigest({
      projectId,
      sessionId,
      taskId,
      baseBaseline,
      baseGraphCheckpoint,
      producerType,
      parentTaskId: parentTaskId ?? null,
      changes,
    })
      .slice(7, 23)
      .toUpperCase()}`,
    projectId,
    sessionId,
    taskId,
    baseBaseline: structuredClone(baseBaseline),
    baseGraphCheckpoint: structuredClone(baseGraphCheckpoint),
    producerType,
    ...(parentTaskId ? { parentTaskId } : {}),
    changes: structuredClone(changes).sort((left, right) =>
      left.changeId.localeCompare(right.changeId, "en"),
    ),
    sourceRefs: structuredClone(sourceRefs).sort((left, right) =>
      `${left.role}:${left.artifact.artifactId}`.localeCompare(
        `${right.role}:${right.artifact.artifactId}`,
        "en",
      ),
    ),
  };
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest(material));
}

export function resolveMemoryChangeRoutes(candidate) {
  validateProjectMemoryArtifact(candidate);
  if (candidate.kind !== "MemoryUpdateCandidate") {
    fail("route input must be MemoryUpdateCandidate", "DR5315");
  }
  return immutable(
    candidate.changes.map((change) => ({
      changeId: change.changeId,
      domain: change.domain,
      blocking: QUALITATIVE_DOMAINS.has(change.domain),
      nextModule: DOMAIN_ROUTES[change.domain] ?? "project-memory-gate",
      reason: QUALITATIVE_DOMAINS.has(change.domain)
        ? `The proposed memory delta changes authoritative ${change.domain} state and must be resolved by its owning Module and Gate.`
        : "The proposed delta remains within ProjectMemoryGate authority.",
    })),
  );
}

function tokenize(value) {
  return new Set(
    String(value)
      .normalize("NFC")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 2),
  );
}

function scoreRecord(queryTokens, record) {
  const recordTokens = tokenize(`${record.category} ${record.statement}`);
  if (queryTokens.size === 0) return 1;
  let overlap = 0;
  for (const token of queryTokens) if (recordTokens.has(token)) overlap += 1;
  return overlap / queryTokens.size;
}

function contextItemFromRecord(record, authorityRank = 0) {
  return {
    memoryId: record.id,
    statement: record.statement,
    authorityRank,
    effectiveAt: record.effectiveAt,
    sourceRefs: structuredClone(record.sourceRefs),
  };
}

export function retrieveNativeProjectMemory({ baseline, query, limit = 32 } = {}) {
  validateProjectMemoryArtifact(baseline);
  if (baseline.kind !== "ProjectMemoryBaseline") {
    fail("native retrieval requires ProjectMemoryBaseline", "DR5316");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) {
    fail("retrieval limit must be an integer from 1 through 256", "DR5316");
  }
  const queryTokens = tokenize(query);
  const ranked = baseline.records
    .filter(({ status }) => status === "active" || status === "retained")
    .map((record) => ({ record, score: scoreRecord(queryTokens, record) }))
    .filter(({ score }) => queryTokens.size === 0 || score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.record.effectiveAt.localeCompare(left.record.effectiveAt, "en") ||
        left.record.id.localeCompare(right.record.id, "en"),
    )
    .slice(0, limit);
  return immutable({
    items: ranked.map(({ record }) => contextItemFromRecord(record)),
    citations: ranked.map(({ record, score }, index) => ({
      rank: index + 1,
      sourceRef: structuredClone(record.sourceRefs[0]),
      score: Number(score.toFixed(12)),
    })),
  });
}

function providerReceipt({
  providerId,
  providerVersion,
  operation,
  namespace,
  configurationDigest,
  inputCheckpoints,
  query,
  outcome,
  durationMs,
  replayed,
  citations,
  items,
  diagnostics,
} = {}) {
  const material = {
    apiVersion: API_VERSION,
    kind: "MemoryProviderReceipt",
    receiptId: `MPR-${canonicalJsonDigest({
      providerId,
      providerVersion,
      operation,
      namespace,
      configurationDigest,
      inputCheckpoints,
      query,
      outcome,
      citations,
      items,
    })
      .slice(7, 23)
      .toUpperCase()}`,
    providerId,
    providerVersion,
    operation,
    namespace,
    configurationDigest,
    inputCheckpoints: structuredClone(inputCheckpoints),
    ...(query !== undefined ? { queryDigest: canonicalJsonDigest(query) } : {}),
    commandFingerprint: canonicalJsonDigest({
      providerId,
      providerVersion,
      operation,
      namespace,
      configurationDigest,
      query: query ?? null,
    }),
    outcome,
    durationMs,
    replayed,
    citations: structuredClone(citations),
    outputDigest: canonicalJsonDigest(items),
    ...(diagnostics?.length ? { diagnostics: [...diagnostics] } : {}),
  };
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest(material));
}

function requiredActiveIds(baseline) {
  return baseline.records
    .filter(({ status }) => status === "active" || status === "retained")
    .map(({ id }) => id)
    .sort();
}

export function verifyNativeMemoryEquivalence({ baseline, items } = {}) {
  const required = requiredActiveIds(baseline);
  const received = new Set(items.map(({ memoryId }) => memoryId));
  const missing = required.filter((id) => !received.has(id));
  return immutable({
    equivalent: missing.length === 0,
    requiredMemoryIds: required,
    receivedMemoryIds: [...received].sort(),
    missingMemoryIds: missing,
    evidenceDigest: canonicalJsonDigest({ required, received: [...received].sort() }),
  });
}

export function assembleMemoryContext({
  projectId,
  sessionId,
  taskId,
  moduleInvocationId,
  projectMemoryBaseline,
  synopsisProjection,
  traceabilityProjection,
  providerReceipt: receipt,
  providerItems,
  sessionItems = [],
  freshness = "fresh",
  diagnostics = [],
} = {}) {
  validateProjectMemoryArtifact(projectMemoryBaseline.value);
  validateProjectMemoryArtifact(traceabilityProjection.value);
  validateProjectMemoryArtifact(receipt.value);
  if (!sameRef(projectMemoryBaseline.value.graphCheckpoint, traceabilityProjection.value.graphCheckpoint)) {
    fail("traceability projection does not bind the baseline graph checkpoint", "DR5317");
  }
  if (!["pass", "native-equivalent"].includes(receipt.value.outcome)) {
    fail("context cannot use an unverified provider receipt", "DR5317");
  }
  const authoritative = projectMemoryBaseline.value.records
    .filter(({ status }) => status === "active" || status === "retained")
    .map((record) => contextItemFromRecord(record, 0));
  const candidates = [
    ...authoritative,
    ...sessionItems.map((item) => ({ ...structuredClone(item), authorityRank: 1 })),
    ...providerItems.map((item) => ({ ...structuredClone(item), authorityRank: 2 })),
  ];
  candidates.sort(
    (left, right) =>
      left.authorityRank - right.authorityRank ||
      right.effectiveAt.localeCompare(left.effectiveAt, "en") ||
      left.memoryId.localeCompare(right.memoryId, "en"),
  );
  const seen = new Set();
  const items = candidates.filter(({ memoryId }) => {
    if (seen.has(memoryId)) return false;
    seen.add(memoryId);
    return true;
  });
  const material = {
    apiVersion: API_VERSION,
    kind: "MemoryContextBundle",
    bundleId: `MCB-${canonicalJsonDigest({
      projectId,
      sessionId,
      taskId,
      moduleInvocationId,
      baseline: projectMemoryBaseline.ref,
      synopsisProjection,
      traceabilityProjection: traceabilityProjection.ref,
      providerReceipt: receipt.ref,
      items,
      freshness,
    })
      .slice(7, 23)
      .toUpperCase()}`,
    projectId,
    sessionId,
    taskId,
    moduleInvocationId,
    projectMemoryBaseline: structuredClone(projectMemoryBaseline.ref),
    synopsisProjection: structuredClone(synopsisProjection),
    traceabilityProjection: structuredClone(traceabilityProjection.ref),
    providerReceipt: structuredClone(receipt.ref),
    items,
    freshness,
    diagnostics: [...diagnostics],
  };
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest(material));
}

export function createInMemoryProjectMemoryCheckpointStore() {
  const entries = new Map();
  return Object.freeze({
    async get(key) {
      const value = entries.get(key);
      return value ? structuredClone(value) : undefined;
    },
    async put(key, value) {
      if (entries.has(key)) fail(`immutable checkpoint ${key} already exists`, "DR5318");
      entries.set(key, structuredClone(value));
    },
  });
}

export function createInMemoryProjectMemoryStore() {
  const baselines = new Map();
  const heads = new Map();
  return Object.freeze({
    putBaseline(loadedBaseline, expectedHead) {
      validateProjectMemoryArtifact(loadedBaseline.value);
      if (loadedBaseline.value.kind !== "ProjectMemoryBaseline") {
        fail("store accepts only ProjectMemoryBaseline", "DR5319");
      }
      const projectId = loadedBaseline.value.projectId;
      const current = heads.get(projectId);
      if (expectedHead && !sameRef(current, expectedHead)) {
        fail("project memory head changed before commit", "DR5319");
      }
      if (baselines.has(loadedBaseline.ref.digest)) {
        const prior = baselines.get(loadedBaseline.ref.digest);
        if (!prior.bytes.equals(loadedBaseline.bytes)) {
          fail("baseline digest collision", "DR5319");
        }
      } else {
        baselines.set(loadedBaseline.ref.digest, {
          ...loadedBaseline,
          bytes: Buffer.from(loadedBaseline.bytes),
        });
      }
      heads.set(projectId, structuredClone(loadedBaseline.ref));
      return structuredClone(loadedBaseline.ref);
    },
    head(projectId) {
      return structuredClone(heads.get(projectId));
    },
    get(digest) {
      const value = baselines.get(digest);
      return value
        ? {
            ...structuredClone(value),
            bytes: Buffer.from(value.bytes),
          }
        : undefined;
    },
    history(projectId) {
      return [...baselines.values()]
        .filter(({ value }) => value.projectId === projectId)
        .sort((left, right) => left.value.version.localeCompare(right.value.version, "en"))
        .map(({ ref }) => structuredClone(ref));
    },
  });
}

function checkpointBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

export function createProjectMemoryRuntime({
  provider,
  checkpoints = createInMemoryProjectMemoryCheckpointStore(),
  monotonicNow = () => performance.now(),
} = {}) {
  const configuredProvider = provider ?? null;
  if (typeof monotonicNow !== "function") fail("monotonicNow must be a function", "DR5322");
  return Object.freeze({
    async execute(request) {
      const route = routeProjectMemoryOperation(request);
      if (route.outcome === "blocked") return route;
      if (!["load-context", "refresh-context", "propose-update"].includes(route.operation)) {
        fail(`${route.operation} is owned by the conclusion coordinator`, "DR5320");
      }
      const fingerprintMaterial = {
        executionId: request.executionId,
        operation: route.operation,
        projectId: request.projectId,
        sessionId: request.sessionId,
        taskId: request.taskId,
        moduleInvocationId: request.moduleInvocationId,
        baseline: request.projectMemoryBaseline?.ref,
        synopsisProjection: request.synopsisProjection,
        traceabilityProjection: request.traceabilityProjection?.ref,
        query: request.query ?? null,
        changes: request.changes ?? null,
        provider: configuredProvider
          ? { id: configuredProvider.id, version: configuredProvider.version, configurationDigest: configuredProvider.configurationDigest }
          : null,
      };
      const executionFingerprint = canonicalJsonDigest(fingerprintMaterial);
      const checkpointKey = `project-memory/${request.executionId}/${executionFingerprint.slice(7)}`;
      const prior = await checkpoints.get(checkpointKey);
      if (prior) {
        return immutable({
          ...prior.result,
          replayed: true,
          providerCalls: 0,
          checkpoint: prior,
        });
      }

      let result;
      let providerCalls = 0;
      if (route.operation === "propose-update") {
        const candidate = createMemoryUpdateCandidate({
          projectId: request.projectId,
          sessionId: request.sessionId,
          taskId: request.taskId,
          baseBaseline: request.projectMemoryBaseline.ref,
          baseGraphCheckpoint: request.projectMemoryBaseline.value.graphCheckpoint,
          producerType: request.producerType,
          parentTaskId: request.parentTaskId,
          changes: request.changes,
          sourceRefs: request.sourceRefs,
        });
        result = {
          outcome: "candidate-proposed",
          operation: route.operation,
          executionFingerprint,
          candidate: loadProjectMemoryArtifact(candidate),
        };
      } else {
        const retrievalStartedAt = monotonicNow();
        const namespace = projectMemoryNamespace({
          projectId: request.projectId,
          sessionId: request.sessionId,
          moduleId: request.moduleId,
          invocationId: request.moduleInvocationId,
        });
        let retrieval;
        let outcome = "native-equivalent";
        let providerId = "devrelay.native-project-memory";
        let providerVersion = "1.0.0";
        let configurationDigest = canonicalJsonDigest({ providerId, providerVersion });
        const diagnostics = [];
        if (configuredProvider) {
          try {
            providerCalls += 1;
            const proposed = await configuredProvider.retrieve(
              immutable({
                namespace,
                query: request.query,
                baseline: request.projectMemoryBaseline.value,
                traceabilityProjection: request.traceabilityProjection.value,
              }),
            );
            if (!proposed || !Array.isArray(proposed.items) || !Array.isArray(proposed.citations)) {
              throw new Error("provider returned malformed retrieval output");
            }
            retrieval = proposed;
            outcome = "pass";
            providerId = configuredProvider.id;
            providerVersion = configuredProvider.version;
            configurationDigest = configuredProvider.configurationDigest;
          } catch (error) {
            diagnostics.push(`provider failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (!retrieval) {
          retrieval = retrieveNativeProjectMemory({
            baseline: request.projectMemoryBaseline.value,
            query: "",
            limit: 256,
          });
          const equivalence = verifyNativeMemoryEquivalence({
            baseline: request.projectMemoryBaseline.value,
            items: retrieval.items,
          });
          if (!equivalence.equivalent) {
            fail(`provider failed and native equivalence is incomplete: ${equivalence.missingMemoryIds.join(", ")}`, "DR5321");
          }
        }
        const retrievalCompletedAt = monotonicNow();
        if (!Number.isFinite(retrievalStartedAt) || !Number.isFinite(retrievalCompletedAt) || retrievalCompletedAt < retrievalStartedAt) {
          fail("monotonic clock returned an invalid retrieval duration", "DR5322");
        }
        const receiptValue = providerReceipt({
          providerId,
          providerVersion,
          operation: "retrieve",
          namespace,
          configurationDigest,
          inputCheckpoints: [
            request.projectMemoryBaseline.ref,
            request.traceabilityProjection.ref,
          ],
          query: request.query ?? "",
          outcome,
          durationMs: retrievalCompletedAt - retrievalStartedAt,
          replayed: false,
          citations: retrieval.citations,
          items: retrieval.items,
          diagnostics,
        });
        const receipt = loadProjectMemoryArtifact(receiptValue);
        const bundleValue = assembleMemoryContext({
          projectId: request.projectId,
          sessionId: request.sessionId,
          taskId: request.taskId,
          moduleInvocationId: request.moduleInvocationId,
          projectMemoryBaseline: request.projectMemoryBaseline,
          synopsisProjection: request.synopsisProjection,
          traceabilityProjection: request.traceabilityProjection,
          providerReceipt: receipt,
          providerItems: retrieval.items,
          sessionItems: request.sessionItems ?? [],
          freshness: "fresh",
          diagnostics,
        });
        result = {
          outcome: "context-loaded",
          operation: route.operation,
          executionFingerprint,
          context: loadProjectMemoryArtifact(bundleValue),
          providerReceipt: receipt,
        };
      }
      const checkpointMaterial = {
        apiVersion: API_VERSION,
        kind: "ProjectMemoryExecutionCheckpoint",
        checkpointKey,
        executionFingerprint,
        operation: route.operation,
        result: {
          ...result,
          replayed: false,
          providerCalls,
        },
      };
      const checkpoint = {
        ...checkpointMaterial,
        checkpointDigest: sha256Digest(checkpointBytes(checkpointMaterial)),
      };
      await checkpoints.put(checkpointKey, checkpoint);
      return immutable({
        ...result,
        replayed: false,
        providerCalls,
        checkpoint,
      });
    },
  });
}

import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

export const TRACEABILITY_GRAPH_SCHEMA =
  "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1";
export const TRACEABILITY_UPDATE_SCHEMA =
  "https://devrelay.dev/artifacts/traceability-update/v1";
export const TRACEABILITY_RECEIPT_SCHEMA =
  "https://devrelay.dev/artifacts/traceability-merge-receipt/v1";
export const TRACEABILITY_DIAGNOSTIC_SCHEMA =
  "https://devrelay.dev/artifacts/traceability-diagnostic-report/v1";

export const TRACEABILITY_GRAPH_MEDIA_TYPE =
  "application/vnd.devrelay.traceability-graph+json";
export const TRACEABILITY_UPDATE_MEDIA_TYPE =
  "application/vnd.devrelay.traceability-update+json";
export const TRACEABILITY_RECEIPT_MEDIA_TYPE =
  "application/vnd.devrelay.traceability-merge-receipt+json";
export const TRACEABILITY_DIAGNOSTIC_MEDIA_TYPE =
  "application/vnd.devrelay.traceability-diagnostic-report+json";

export const TRACEABILITY_HORIZONS_V1_0 = Object.freeze([
  "requirements",
  "architecture",
  "contracts",
  "implementation",
  "verification",
]);

export const TRACEABILITY_NODE_KINDS_V1_0 = Object.freeze([
  "acceptance-criterion",
  "architecture-change",
  "architecture-constraint",
  "architecture-element",
  "architecture-relationship",
  "architecture-view",
  "artifact-reference",
  "business-objective",
  "capability",
  "code-change",
  "contract",
  "decision-record",
  "interface-intent",
  "non-functional-requirement",
  "project",
  "requirement-constraint",
  "stakeholder",
  "success-metric",
  "technical-design",
  "test",
  "user",
  "user-journey",
  "user-story",
  "verification-evidence",
  "work-item",
]);

export const TRACEABILITY_EDGE_KINDS_V1_0 = Object.freeze([
  "accepted-by",
  "affects",
  "applies-to",
  "contains",
  "contracted-by",
  "defines",
  "depends-on",
  "derived-from",
  "designed-by",
  "exercised-by",
  "implemented-by",
  "measured-by",
  "owned-by",
  "performed-by",
  "planned-by",
  "produces",
  "projects",
  "realized-by",
  "represents",
  "serves",
  "source-endpoint",
  "specified-by",
  "supersedes",
  "target-endpoint",
  "tested-by",
  "verified-by",
]);

const VOCABULARY_MATERIAL_V1_0 = Object.freeze({
  id: "devrelay.traceability/v1",
  version: "1.0.0",
});

export const TRACEABILITY_VOCABULARY_V1_0 = Object.freeze({
  ...VOCABULARY_MATERIAL_V1_0,
  contractDigest: canonicalJsonDigest(VOCABULARY_MATERIAL_V1_0),
});

export const TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_1 = "1.1.0";
export const TRACEABILITY_HORIZONS = TRACEABILITY_HORIZONS_V1_0;
export const TRACEABILITY_NODE_KINDS = TRACEABILITY_NODE_KINDS_V1_0;
export const TRACEABILITY_EDGE_KINDS_V1_1 = Object.freeze([
  "accepted-by",
  "affects",
  "applies-to",
  "contains",
  "contracted-by",
  "defines",
  "depends-on",
  "derived-from",
  "designed-by",
  "exercised-by",
  "implemented-by",
  "implementation-planned-by",
  "measured-by",
  "owned-by",
  "performed-by",
  "planned-by",
  "produces",
  "projects",
  "realization-planned-by",
  "realized-by",
  "represents",
  "serves",
  "source-endpoint",
  "specified-by",
  "supersedes",
  "target-endpoint",
  "tested-by",
  "verified-by",
]);

const VOCABULARY_MATERIAL_V1_1 = Object.freeze({
  id: "devrelay.traceability/v1",
  version: "1.1.0",
  horizons: TRACEABILITY_HORIZONS,
  nodeKinds: TRACEABILITY_NODE_KINDS,
  edgeKinds: TRACEABILITY_EDGE_KINDS_V1_1,
  endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_1,
});

export const TRACEABILITY_VOCABULARY_V1_1 = Object.freeze({
  id: VOCABULARY_MATERIAL_V1_1.id,
  version: VOCABULARY_MATERIAL_V1_1.version,
  contractDigest: canonicalJsonDigest(VOCABULARY_MATERIAL_V1_1),
});

export const TRACEABILITY_ENDPOINT_POLICY_VERSION = "1.2.0";
export const TRACEABILITY_EDGE_KINDS = Object.freeze([
  ...TRACEABILITY_EDGE_KINDS_V1_1,
  "prerequisite-for",
].sort());

const VOCABULARY_MATERIAL = Object.freeze({
  id: "devrelay.traceability/v1",
  version: "1.2.0",
  horizons: TRACEABILITY_HORIZONS,
  nodeKinds: TRACEABILITY_NODE_KINDS,
  edgeKinds: TRACEABILITY_EDGE_KINDS,
  endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION,
});

export const TRACEABILITY_VOCABULARY = Object.freeze({
  id: VOCABULARY_MATERIAL.id,
  version: VOCABULARY_MATERIAL.version,
  contractDigest: canonicalJsonDigest(VOCABULARY_MATERIAL),
});

export const TRACEABILITY_ANALYZER = Object.freeze({
  id: "devrelay.traceability/analyzer",
  version: "1.0.0",
  contractDigest: canonicalJsonDigest({
    id: "devrelay.traceability/analyzer",
    version: "1.0.0",
  }),
});

export const TRACEABILITY_MERGE_ENGINE = Object.freeze({
  id: "devrelay.traceability/merge-engine",
  version: "1.0.0",
  contractDigest: canonicalJsonDigest({
    id: "devrelay.traceability/merge-engine",
    version: "1.0.0",
  }),
});


const NODE_KINDS = new Set(TRACEABILITY_NODE_KINDS);
const EDGE_KINDS = new Set(TRACEABILITY_EDGE_KINDS);
const EDGE_KINDS_V1_1 = new Set(TRACEABILITY_EDGE_KINDS_V1_1);
const EDGE_KINDS_V1_0 = new Set(TRACEABILITY_EDGE_KINDS_V1_0);
const CURRENT_VOCABULARY_PROFILE = Object.freeze({
  version: "1.2.0",
  endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION,
  edgeKinds: EDGE_KINDS,
});
const LEGACY_VOCABULARY_PROFILE = Object.freeze({
  version: "1.0.0",
  endpointPolicyVersion: "1.0.0",
  edgeKinds: EDGE_KINDS_V1_0,
});
const V1_1_VOCABULARY_PROFILE = Object.freeze({
  version: "1.1.0",
  endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_1,
  edgeKinds: EDGE_KINDS_V1_1,
});
const ARCHITECTURE_KINDS = new Set([
  "architecture-change",
  "architecture-constraint",
  "architecture-element",
  "architecture-relationship",
  "architecture-view",
  "decision-record",
  "interface-intent",
  "technical-design",
]);
const REQUIREMENT_KINDS = new Set([
  "acceptance-criterion",
  "non-functional-requirement",
  "requirement-constraint",
  "user-story",
]);

const REQUIREMENTS_INTERNAL_EDGE_KINDS = new Set([
  "accepted-by",
  "applies-to",
  "defines",
  "exercised-by",
  "measured-by",
  "owned-by",
  "performed-by",
  "realized-by",
  "represents",
  "serves",
  "specified-by",
]);

const schemaValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL(
        "../contracts/traceability-graph-artifacts.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

export class TraceabilityArtifactValidationError extends Error {
  constructor(message, code = "TG_INVALID_ARTIFACT") {
    super(`${code}: ${message}`);
    this.name = "TraceabilityArtifactValidationError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new TraceabilityArtifactValidationError(message, code);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalStrings(value, label) {
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) {
      fail(`${label} must use Unicode NFC normalization`);
    }
    if (value.includes("\r")) {
      fail(`${label} must use LF-only line endings`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertCanonicalStrings(child, `${label}[${index}]`),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertCanonicalStrings(child, `${label}.${key}`);
    }
  }
}

function assertStrictOrder(values, key, label) {
  let previous;
  for (const value of values) {
    const current = key(value);
    if (previous !== undefined && compareText(previous, current) >= 0) {
      fail(`${label} must be strictly sorted with no duplicates`);
    }
    previous = current;
  }
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

function exactRef(left, right) {
  return Boolean(left && right && refKey(left) === refKey(right));
}

function assertArtifactRefType(ref, schema, mediaType, label) {
  if (ref.schema !== schema || ref.mediaType !== mediaType) {
    fail(`${label} uses the wrong schema or media type`, "TG_ARTIFACT_REF_TYPE");
  }
}

function locatorKey(locator) {
  return [
    locator.artifact.artifactId,
    locator.artifact.digest,
    locator.jsonPointer,
    locator.entityDigest,
  ].join("\u0000");
}

function sameContract(actual, expected) {
  return (
    actual.id === expected.id &&
    actual.version === expected.version &&
    actual.contractDigest === expected.contractDigest
  );
}

export function traceabilityNodeId({
  graphId,
  kind,
  stableId,
  authority,
  scope,
}) {
  if (kind === "artifact-reference") {
    return canonicalJsonDigest({ graphId, kind, stableId });
  }
  return canonicalJsonDigest({
    graphId,
    kind,
    stableId,
    authority,
    scope,
  });
}

export function traceabilityEdgeId({
  graphId,
  kind,
  sourceNodeId,
  targetNodeId,
  qualifier = "",
  authority,
  scope,
}) {
  return canonicalJsonDigest({
    graphId,
    kind,
    sourceNodeId,
    targetNodeId,
    qualifier,
    authority,
    scope,
  });
}

export function traceabilityContentDigest(record) {
  const { contentDigest: ignored, ...material } = record;
  return canonicalJsonDigest(material);
}

export function traceabilityUpdateId(update) {
  const { updateId: ignored, ...material } = update;
  return canonicalJsonDigest(material);
}

export function traceabilityDiagnosticId(diagnostic) {
  const { diagnosticId: ignored, ...material } = diagnostic;
  return canonicalJsonDigest(material);
}

function assertArtifactReference(node) {
  if (node.kind !== "artifact-reference") {
    if (node.authority === "reference") {
      fail("only artifact-reference nodes may use reference authority");
    }
    return;
  }
  if (node.authority !== "reference") {
    fail("artifact-reference node authority must be reference");
  }
  if (
    Object.keys(node.attributes).length !== 1 ||
    node.attributes.artifact === undefined
  ) {
    fail("artifact-reference attributes must contain only artifact");
  }
  const artifact = node.attributes.artifact;
  if (
    artifact === null ||
    typeof artifact !== "object" ||
    Array.isArray(artifact)
  ) {
    fail("artifact-reference attributes.artifact must be an ArtifactRef");
  }
  const expectedStableId = canonicalJsonDigest({
    schema: artifact.schema,
    artifactId: artifact.artifactId,
    digest: artifact.digest,
  });
  if (node.stableId !== expectedStableId) {
    fail("artifact-reference stableId does not match its exact artifact identity");
  }
}

function assertNode(node, graphId) {
  if (!NODE_KINDS.has(node.kind)) {
    fail(`unknown node kind ${node.kind}`, "TG_UNKNOWN_NODE_KIND");
  }
  if (
    node.nodeId !==
    traceabilityNodeId({
      graphId,
      kind: node.kind,
      stableId: node.stableId,
      authority: node.authority,
      scope: node.scope,
    })
  ) {
    fail(`node ${node.stableId} has a noncanonical nodeId`);
  }
  if (node.contentDigest !== traceabilityContentDigest(node)) {
    fail(`node ${node.nodeId} contentDigest is invalid`);
  }
  assertStrictOrder(node.sourceLocators, locatorKey, `node ${node.nodeId} sources`);
  if (node.sourceLocators.length === 0) {
    fail(`node ${node.nodeId} requires at least one source locator`, "TG_PROVENANCE_REQUIRED");
  }
  assertArtifactReference(node);
  if (
    node.verificationStatus !== undefined &&
    !new Set(["test", "verification-evidence"]).has(node.kind)
  ) {
    fail(`node ${node.nodeId} cannot carry verificationStatus`);
  }
}

const WORK_BREAKDOWN_SCOPE = "work-breakdown/candidate";

function edgeEndpointsAllowed(kind, sourceKind, targetKind, profile) {
  switch (kind) {
    case "defines":
      return sourceKind === "project";
    case "owned-by":
      return sourceKind === "business-objective" && targetKind === "stakeholder";
    case "represents":
      return sourceKind === "user" && targetKind === "stakeholder";
    case "serves":
      return sourceKind === "capability" && targetKind === "user";
    case "performed-by":
      return (
        new Set(["user-journey", "user-story"]).has(sourceKind) &&
        targetKind === "user"
      );
    case "measured-by":
      return sourceKind === "business-objective" && targetKind === "success-metric";
    case "realized-by":
      return sourceKind === "business-objective" && targetKind === "capability";
    case "exercised-by":
      return sourceKind === "capability" && targetKind === "user-journey";
    case "specified-by":
      return sourceKind === "capability" && targetKind === "user-story";
    case "accepted-by":
      return (
        new Set([
          "non-functional-requirement",
          "requirement-constraint",
          "user-story",
        ]).has(sourceKind) && targetKind === "acceptance-criterion"
      );
    case "applies-to":
      return (
        new Set(["non-functional-requirement", "requirement-constraint"]).has(
          sourceKind,
        ) && new Set(["project", "capability"]).has(targetKind)
      );
    case "designed-by":
      return REQUIREMENT_KINDS.has(sourceKind) && ARCHITECTURE_KINDS.has(targetKind);
    case "source-endpoint":
    case "target-endpoint":
      return sourceKind === "architecture-relationship" && targetKind === "architecture-element";
    case "affects":
      return sourceKind === "decision-record" && ARCHITECTURE_KINDS.has(targetKind);
    case "projects":
    case "derived-from":
      return sourceKind === "artifact-reference" && targetKind === "artifact-reference";
    case "contains":
      return (
        sourceKind === "artifact-reference" ||
        (sourceKind === "architecture-element" && targetKind === "architecture-element") ||
        sourceKind === "technical-design"
      );
    case "supersedes":
      return sourceKind === targetKind;
    case "contracted-by":
      return targetKind === "contract";
    case "planned-by":
      return targetKind === "work-item";
    case "implementation-planned-by":
      return (
        profile.endpointPolicyVersion !== "1.0.0" &&
        sourceKind === "architecture-element" &&
        targetKind === "work-item"
      );
    case "realization-planned-by":
      return (
        profile.endpointPolicyVersion !== "1.0.0" &&
        sourceKind === "contract" &&
        targetKind === "work-item"
      );
    case "implemented-by":
      return targetKind === "code-change";
    case "tested-by":
      return targetKind === "test";
    case "verified-by":
      return targetKind === "verification-evidence";
    case "produces":
      return sourceKind === "test" && targetKind === "verification-evidence";
    case "depends-on":
      return sourceKind !== "artifact-reference" && targetKind !== "artifact-reference";
    case "prerequisite-for":
      return (
        profile.endpointPolicyVersion === TRACEABILITY_ENDPOINT_POLICY_VERSION &&
        sourceKind === "work-item" &&
        targetKind === "work-item"
      );
    default:
      return false;
  }
}

function assertPlanningEdgeAuthority(edge, source, target, profile) {
  if (profile.endpointPolicyVersion === "1.0.0") {
    return;
  }
  if (
    edge.kind === "planned-by" &&
    edge.scope !== WORK_BREAKDOWN_SCOPE
  ) {
    return;
  }
  const sourceScopes = new Map([
    ["planned-by", "requirements/baseline"],
    ["implementation-planned-by", "architecture/baseline"],
    ["realization-planned-by", "contracts/baseline"],
  ]);
  const sourceKinds = new Map([
    ["planned-by", "acceptance-criterion"],
    ["implementation-planned-by", "architecture-element"],
    ["realization-planned-by", "contract"],
  ]);
  const sourceScope = sourceScopes.get(edge.kind);
  if (sourceScope === undefined) {
    return;
  }
  if (
    source.authority !== "approved" ||
    source.kind !== sourceKinds.get(edge.kind) ||
    edge.scope !== WORK_BREAKDOWN_SCOPE ||
    target.kind !== "work-item" ||
    source.scope !== sourceScope ||
    target.authority !== "candidate" ||
    target.scope !== "work-breakdown/candidate" ||
    edge.authority !== target.authority ||
    edge.scope !== target.scope ||
    !sameContract(edge.contributor, target.contributor)
  ) {
    fail(
      `planning edge ${edge.edgeId} crosses an unauthorized authority or ownership scope`,
      "TG_INVALID_EDGE_AUTHORITY",
    );
  }
}

function assertEdge(edge, graphId, nodes, requireEndpoints, profile) {
  if (!profile.edgeKinds.has(edge.kind)) {
    fail(`unknown edge kind ${edge.kind}`, "TG_UNKNOWN_EDGE_KIND");
  }
  if (
    edge.edgeId !==
    traceabilityEdgeId({
      graphId,
      kind: edge.kind,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      qualifier: edge.qualifier,
      authority: edge.authority,
      scope: edge.scope,
    })
  ) {
    fail(`edge ${edge.edgeId} has a noncanonical edgeId`);
  }
  if (edge.contentDigest !== traceabilityContentDigest(edge)) {
    fail(`edge ${edge.edgeId} contentDigest is invalid`);
  }
  assertStrictOrder(edge.sourceLocators, locatorKey, `edge ${edge.edgeId} sources`);
  if (edge.sourceLocators.length === 0) {
    fail(`edge ${edge.edgeId} requires at least one source locator`, "TG_PROVENANCE_REQUIRED");
  }
  if (!requireEndpoints) {
    return;
  }
  const source = nodes.get(edge.sourceNodeId);
  const target = nodes.get(edge.targetNodeId);
  if (!source || !target) {
    fail(`edge ${edge.edgeId} has a dangling endpoint`, "TG_DANGLING_EDGE");
  }
  if (
    edge.state === "active" &&
    (source.state !== "active" || target.state !== "active")
  ) {
    fail(
      `active edge ${edge.edgeId} has a non-active endpoint`,
      "TG_INACTIVE_EDGE_ENDPOINT",
    );
  }
  if (
    REQUIREMENTS_INTERNAL_EDGE_KINDS.has(edge.kind) &&
    (edge.authority !== source.authority ||
      edge.authority !== target.authority ||
      edge.scope !== source.scope ||
      edge.scope !== target.scope)
  ) {
    fail(
      `requirements edge ${edge.edgeId} crosses authority or ownership scope`,
      "TG_INVALID_EDGE_AUTHORITY",
    );
  }
  if (!edgeEndpointsAllowed(edge.kind, source.kind, target.kind, profile)) {
    fail(
      `edge ${edge.edgeId} has invalid ${source.kind} -> ${target.kind} endpoints for ${edge.kind}`,
      "TG_INVALID_EDGE_ENDPOINTS",
    );
  }
  assertPlanningEdgeAuthority(edge, source, target, profile);
}

function assertScope(scope) {
  assertStrictOrder(scope.nodeIds, (value) => value, `scope ${scope.scope} nodeIds`);
  assertStrictOrder(scope.edgeIds, (value) => value, `scope ${scope.scope} edgeIds`);
  if (
    scope.nodeIds.length === 0 &&
    scope.edgeIds.length === 0 &&
    scope.reason === undefined
  ) {
    fail(`empty scope ${scope.scope} requires a reason`);
  }
  if (
    (scope.nodeIds.length > 0 || scope.edgeIds.length > 0) &&
    scope.reason !== undefined
  ) {
    fail(`nonempty scope ${scope.scope} cannot carry an empty-projection reason`);
  }
}

function artifactPointerKey(artifact) {
  return `${artifact.artifactId}\u0000${artifact.digest}`;
}

function assertUpdateClosure(update) {
  const nodeClaims = new Map();
  const edgeClaims = new Map();
  const claim = (claims, id, scope, label) => {
    if (claims.has(id)) {
      fail(`${label} ${id} is declared by multiple scopes`, "TG_UPDATE_SCOPE_CLOSURE");
    }
    claims.set(id, scope);
  };
  for (const scope of update.scopes) {
    for (const nodeId of scope.nodeIds) claim(nodeClaims, nodeId, scope, "node");
    for (const edgeId of scope.edgeIds) claim(edgeClaims, edgeId, scope, "edge");
  }

  const sourceArtifacts = new Map();
  for (const ref of update.sourceArtifacts) {
    const key = artifactPointerKey(ref);
    const prior = sourceArtifacts.get(key);
    if (prior && refKey(prior) !== refKey(ref)) {
      fail(`source artifact ${ref.artifactId} has ambiguous metadata`, "TG_UPDATE_PROVENANCE_CLOSURE");
    }
    sourceArtifacts.set(key, ref);
  }

  const assertOwned = (assertion, claimScope, label) => {
    if (!claimScope) {
      fail(`${label} is not declared by any update scope`, "TG_UPDATE_SCOPE_CLOSURE");
    }
    if (
      assertion.scope !== claimScope.scope ||
      assertion.authority !== claimScope.authority ||
      !sameContract(assertion.contributor, claimScope.contributor)
    ) {
      fail(`${label} owner does not match its declaring scope`, "TG_UPDATE_SCOPE_CLOSURE");
    }
    for (const locator of assertion.sourceLocators) {
      if (!sourceArtifacts.has(artifactPointerKey(locator.artifact))) {
        fail(`${label} cites an artifact outside sourceArtifacts`, "TG_UPDATE_PROVENANCE_CLOSURE");
      }
    }
    if (assertion.kind === "artifact-reference") {
      const ref = assertion.attributes.artifact;
      const declared = sourceArtifacts.get(artifactPointerKey(ref));
      if (!declared || refKey(declared) !== refKey(ref)) {
        fail(`${label} references an artifact outside sourceArtifacts`, "TG_UPDATE_PROVENANCE_CLOSURE");
      }
    }
  };

  for (const { node } of update.nodeChanges) {
    assertOwned(node, nodeClaims.get(node.nodeId), `node ${node.nodeId}`);
  }
  for (const { edge } of update.edgeChanges) {
    assertOwned(edge, edgeClaims.get(edge.edgeId), `edge ${edge.edgeId}`);
  }
}

function assertVocabulary(vocabulary) {
  if (sameContract(vocabulary, TRACEABILITY_VOCABULARY)) {
    return CURRENT_VOCABULARY_PROFILE;
  }
  if (sameContract(vocabulary, TRACEABILITY_VOCABULARY_V1_1)) {
    return V1_1_VOCABULARY_PROFILE;
  }
  if (sameContract(vocabulary, TRACEABILITY_VOCABULARY_V1_0)) {
    return LEGACY_VOCABULARY_PROFILE;
  }
  fail("artifact does not identify a supported traceability vocabulary");
}

export function assertTraceabilityVocabularyTransition(
  parentVocabulary,
  updateVocabulary,
) {
  const parentProfile = assertVocabulary(parentVocabulary);
  const updateProfile = assertVocabulary(updateVocabulary);
  const rank = new Map([
    ["1.0.0", 0],
    ["1.1.0", 1],
    ["1.2.0", 2],
  ]);
  if (rank.get(updateProfile.version) < rank.get(parentProfile.version)) {
    fail(
      "a traceability update cannot downgrade the graph vocabulary",
      "TG_VOCABULARY_DOWNGRADE",
    );
  }
  return updateVocabulary;
}

function validateSnapshot(snapshot) {
  const vocabularyProfile = assertVocabulary(snapshot.vocabulary);
  assertStrictOrder(snapshot.appliedUpdates, refKey, "appliedUpdates");
  assertStrictOrder(snapshot.nodes, ({ nodeId }) => nodeId, "nodes");
  assertStrictOrder(snapshot.edges, ({ edgeId }) => edgeId, "edges");
  if (snapshot.revision !== snapshot.appliedUpdates.length) {
    fail("graph revision must equal the complete applied-update count", "TG_GRAPH_LINEAGE_INVALID");
  }
  if (snapshot.revision === 0) {
    if (
      snapshot.parentGraph !== null ||
      snapshot.lastAppliedUpdate !== null ||
      snapshot.appliedUpdates.length !== 0
    ) {
      fail("revision zero graph cannot have lineage or applied updates", "TG_GRAPH_LINEAGE_INVALID");
    }
  } else {
    if (snapshot.parentGraph === null || snapshot.lastAppliedUpdate === null) {
      fail("nonzero graph revision has incomplete update lineage", "TG_GRAPH_LINEAGE_INVALID");
    }
    assertArtifactRefType(
      snapshot.parentGraph,
      TRACEABILITY_GRAPH_SCHEMA,
      TRACEABILITY_GRAPH_MEDIA_TYPE,
      "parentGraph",
    );
    assertArtifactRefType(
      snapshot.lastAppliedUpdate,
      TRACEABILITY_UPDATE_SCHEMA,
      TRACEABILITY_UPDATE_MEDIA_TYPE,
      "lastAppliedUpdate",
    );
    if (!snapshot.appliedUpdates.some((ref) => exactRef(ref, snapshot.lastAppliedUpdate))) {
      fail("lastAppliedUpdate is not an exact member of appliedUpdates", "TG_GRAPH_LINEAGE_INVALID");
    }
  }
  const updateDigests = new Set();
  for (const [index, ref] of snapshot.appliedUpdates.entries()) {
    assertArtifactRefType(
      ref,
      TRACEABILITY_UPDATE_SCHEMA,
      TRACEABILITY_UPDATE_MEDIA_TYPE,
      `appliedUpdates[${index}]`,
    );
    if (updateDigests.has(ref.digest)) {
      fail("appliedUpdates contains duplicate update digest metadata", "TG_GRAPH_LINEAGE_INVALID");
    }
    updateDigests.add(ref.digest);
  }
  const nodes = new Map();
  for (const node of snapshot.nodes) {
    assertNode(node, snapshot.graphId);
    nodes.set(node.nodeId, node);
  }
  for (const edge of snapshot.edges) {
    assertEdge(edge, snapshot.graphId, nodes, true, vocabularyProfile);
  }
}

function validateUpdate(update) {
  const vocabularyProfile = assertVocabulary(update.vocabulary);
  assertArtifactRefType(
    update.baseGraph,
    TRACEABILITY_GRAPH_SCHEMA,
    TRACEABILITY_GRAPH_MEDIA_TYPE,
    "baseGraph",
  );
  if (update.updateId !== traceabilityUpdateId(update)) {
    fail("traceability updateId is invalid");
  }
  assertStrictOrder(update.sourceArtifacts, refKey, "sourceArtifacts");
  assertStrictOrder(
    update.scopes,
    (scope) => `${scope.scope}\u0000${scope.contributor.id}\u0000${scope.contributor.version}`,
    "scopes",
  );
  assertStrictOrder(update.nodeChanges, ({ node }) => node.nodeId, "nodeChanges");
  assertStrictOrder(update.edgeChanges, ({ edge }) => edge.edgeId, "edgeChanges");
  for (const scope of update.scopes) {
    assertScope(scope);
  }
  const changedNodes = new Map();
  for (const { node } of update.nodeChanges) {
    assertNode(node, update.graphId);
    changedNodes.set(node.nodeId, node);
  }
  for (const { edge } of update.edgeChanges) {
    const sourceNode = changedNodes.get(edge.sourceNodeId);
    const targetNode = changedNodes.get(edge.targetNodeId);
    if (
      edge.kind === "accepted-by" &&
      ((sourceNode && !new Set([
        "non-functional-requirement",
        "requirement-constraint",
        "user-story",
      ]).has(sourceNode.kind)) ||
        (targetNode && targetNode.kind !== "acceptance-criterion"))
    ) {
      fail(
        `edge ${edge.edgeId} has invalid known endpoints for accepted-by`,
        "TG_INVALID_EDGE_ENDPOINTS",
      );
    }
    const endpointsKnown = Boolean(sourceNode && targetNode);
    assertEdge(
      edge,
      update.graphId,
      changedNodes,
      endpointsKnown,
      vocabularyProfile,
    );
  }
  assertUpdateClosure(update);
}

function validateDiagnostics(diagnostics, summary) {
  assertStrictOrder(diagnostics, ({ diagnosticId }) => diagnosticId, "diagnostics");
  for (const diagnostic of diagnostics) {
    if (diagnostic.diagnosticId !== traceabilityDiagnosticId(diagnostic)) {
      fail(`diagnostic ${diagnostic.code} has an invalid diagnosticId`);
    }
    assertStrictOrder(
      diagnostic.relatedNodeIds,
      (value) => value,
      `diagnostic ${diagnostic.diagnosticId} relatedNodeIds`,
    );
  }
  if (summary) {
    const actual = {
      errors: diagnostics.filter(({ severity }) => severity === "error").length,
      warnings: diagnostics.filter(({ severity }) => severity === "warning").length,
      information: diagnostics.filter(({ severity }) => severity === "information").length,
    };
    if (canonicalJsonDigest(actual) !== canonicalJsonDigest(summary)) {
      fail("diagnostic summary does not match diagnostics");
    }
  }
}

function validateReceipt(receipt) {
  if (!sameContract(receipt.mergeEngine, TRACEABILITY_MERGE_ENGINE)) {
    fail("receipt does not identify the supported merge engine");
  }
  if (receipt.revisionAfter !== receipt.revisionBefore + 1) {
    fail("receipt must advance exactly one immutable graph revision");
  }
  if (
    receipt.previousGraph.schema !== TRACEABILITY_GRAPH_SCHEMA ||
    receipt.previousGraph.mediaType !== TRACEABILITY_GRAPH_MEDIA_TYPE ||
    receipt.resultGraph.schema !== TRACEABILITY_GRAPH_SCHEMA ||
    receipt.resultGraph.mediaType !== TRACEABILITY_GRAPH_MEDIA_TYPE ||
    receipt.update.schema !== TRACEABILITY_UPDATE_SCHEMA ||
    receipt.update.mediaType !== TRACEABILITY_UPDATE_MEDIA_TYPE ||
    receipt.resultGraph.digest === receipt.previousGraph.digest
  ) {
    fail("receipt lineage does not identify a new graph revision");
  }
  const changed = Object.values(receipt.changes).reduce((sum, value) => sum + value, 0);
  if (
    (receipt.disposition === "no-op" && changed !== 0) ||
    (receipt.disposition !== "no-op" && changed === 0)
  ) {
    fail("receipt disposition does not match its change summary");
  }
  validateDiagnostics(receipt.diagnostics);
}

function validateDiagnosticReport(report) {
  assertArtifactRefType(
    report.graph,
    TRACEABILITY_GRAPH_SCHEMA,
    TRACEABILITY_GRAPH_MEDIA_TYPE,
    "diagnostic graph",
  );
  if (report.update !== undefined) {
    assertArtifactRefType(
      report.update,
      TRACEABILITY_UPDATE_SCHEMA,
      TRACEABILITY_UPDATE_MEDIA_TYPE,
      "diagnostic update",
    );
  }
  if (!sameContract(report.analyzer, TRACEABILITY_ANALYZER)) {
    fail("diagnostic report does not identify the supported analyzer");
  }
  validateDiagnostics(report.diagnostics, report.summary);
}

export function validateTraceabilityArtifact(artifact) {
  if (!schemaValidator(artifact)) {
    fail(validationDetail(schemaValidator));
  }
  assertCanonicalStrings(artifact, artifact.kind);
  switch (artifact.kind) {
    case "TraceabilityGraphSnapshot":
      validateSnapshot(artifact);
      break;
    case "TraceabilityUpdate":
      validateUpdate(artifact);
      break;
    case "TraceabilityMergeReceipt":
      validateReceipt(artifact);
      break;
    case "TraceabilityDiagnosticReport":
      validateDiagnosticReport(artifact);
      break;
    default:
      fail(`unsupported artifact kind ${artifact.kind}`);
  }
  return artifact;
}

export function validateTraceabilityGraphSnapshot(snapshot) {
  validateTraceabilityArtifact(snapshot);
  if (snapshot.kind !== "TraceabilityGraphSnapshot") {
    fail("expected TraceabilityGraphSnapshot");
  }
  return snapshot;
}

export function validateTraceabilityUpdate(update) {
  validateTraceabilityArtifact(update);
  if (update.kind !== "TraceabilityUpdate") {
    fail("expected TraceabilityUpdate");
  }
  return update;
}

export function validateTraceabilityMergeReceipt(receipt) {
  validateTraceabilityArtifact(receipt);
  if (receipt.kind !== "TraceabilityMergeReceipt") {
    fail("expected TraceabilityMergeReceipt");
  }
  return receipt;
}

export function validateTraceabilityDiagnosticReport(report) {
  validateTraceabilityArtifact(report);
  if (report.kind !== "TraceabilityDiagnosticReport") {
    fail("expected TraceabilityDiagnosticReport");
  }
  return report;
}

export function traceabilityHorizonRank(horizon) {
  const rank = TRACEABILITY_HORIZONS.indexOf(horizon);
  if (rank < 0) {
    fail(`unknown traceability horizon ${horizon}`);
  }
  return rank;
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import {
  TRACEABILITY_EDGE_KINDS,
  TRACEABILITY_EDGE_KINDS_V1_0,
  TRACEABILITY_ENDPOINT_POLICY_VERSION,
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_HORIZONS,
  TRACEABILITY_NODE_KINDS,
  TRACEABILITY_VOCABULARY,
  TRACEABILITY_VOCABULARY_V1_0,
  assertTraceabilityVocabularyTransition,
  traceabilityContentDigest,
  traceabilityEdgeId,
  traceabilityNodeId,
  validateTraceabilityGraphSnapshot,
} from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

function assertionNode({
  graphId,
  kind,
  stableId,
  authority = "candidate",
  scope = "fixture/legacy",
}) {
  const material = {
    nodeId: traceabilityNodeId({ graphId, kind, stableId, authority, scope }),
    kind,
    stableId,
    label: stableId,
    authority,
    state: "active",
    scope,
    contributor: {
      id: "fixture.legacy",
      version: "1.0.0",
      contractDigest: `sha256:${"a".repeat(64)}`,
    },
    attributes: {},
    sourceLocators: [
      {
        artifact: {
          artifactId: "legacy-fixture",
          digest: `sha256:${"b".repeat(64)}`,
        },
        jsonPointer: "",
        entityDigest: `sha256:${"c".repeat(64)}`,
      },
    ],
  };
  return { ...material, contentDigest: traceabilityContentDigest(material) };
}

function assertionEdge({
  graphId,
  source,
  target,
  kind = "planned-by",
  authority = "candidate",
  scope = "fixture/legacy",
}) {
  const material = {
    edgeId: traceabilityEdgeId({
      graphId,
      kind,
      sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId,
      qualifier: "",
      authority,
      scope,
    }),
    kind,
    sourceNodeId: source.nodeId,
    targetNodeId: target.nodeId,
    qualifier: "",
    rationale: "Legacy 1.0 allowed any semantic source to plan a work item.",
    authority,
    state: "active",
    scope,
    contributor: structuredClone(target.contributor),
    attributes: {},
    sourceLocators: structuredClone(source.sourceLocators),
  };
  return { ...material, contentDigest: traceabilityContentDigest(material) };
}

test("traceability 1.1 identity binds its complete vocabulary while 1.0 stays exact", () => {
  assert.equal(
    TRACEABILITY_VOCABULARY_V1_0.contractDigest,
    canonicalJsonDigest({ id: "devrelay.traceability/v1", version: "1.0.0" }),
  );
  assert.equal(
    TRACEABILITY_VOCABULARY.contractDigest,
    canonicalJsonDigest({
      id: "devrelay.traceability/v1",
      version: "1.1.0",
      horizons: TRACEABILITY_HORIZONS,
      nodeKinds: TRACEABILITY_NODE_KINDS,
      edgeKinds: TRACEABILITY_EDGE_KINDS,
      endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION,
    }),
  );
  assert.equal(
    TRACEABILITY_EDGE_KINDS_V1_0.includes("implementation-planned-by"),
    false,
  );
  assert.equal(
    TRACEABILITY_EDGE_KINDS_V1_0.includes("realization-planned-by"),
    false,
  );
  assert.equal(TRACEABILITY_EDGE_KINDS.includes("implementation-planned-by"), true);
  assert.equal(TRACEABILITY_EDGE_KINDS.includes("realization-planned-by"), true);
  assert.equal(TRACEABILITY_HORIZONS.includes("implementation"), true);
});

test("legacy 1.0 validation retains its original planned-by endpoints", () => {
  const graphId = "legacy-endpoints";
  const architecture = assertionNode({
    graphId,
    kind: "architecture-element",
    stableId: "ARCH-LEGACY",
  });
  const workItem = assertionNode({
    graphId,
    kind: "work-item",
    stableId: "WORK-LEGACY",
  });
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId,
    projectId: "legacy-project",
    revision: 0,
    horizon: "implementation",
    vocabulary: TRACEABILITY_VOCABULARY_V1_0,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [architecture, workItem].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId, "en"),
    ),
    edges: [assertionEdge({ graphId, source: architecture, target: workItem })],
  };
  assert.doesNotThrow(() => validateTraceabilityGraphSnapshot(snapshot));

  const current = { ...snapshot, vocabulary: TRACEABILITY_VOCABULARY };
  assert.doesNotThrow(() => validateTraceabilityGraphSnapshot(current));
});

test("vocabulary migration permits upgrade and rejects downgrade", () => {
  assert.equal(
    assertTraceabilityVocabularyTransition(
      TRACEABILITY_VOCABULARY_V1_0,
      TRACEABILITY_VOCABULARY,
    ),
    TRACEABILITY_VOCABULARY,
  );
  assert.equal(
    assertTraceabilityVocabularyTransition(
      TRACEABILITY_VOCABULARY,
      TRACEABILITY_VOCABULARY,
    ),
    TRACEABILITY_VOCABULARY,
  );
  assert.throws(
    () =>
      assertTraceabilityVocabularyTransition(
        TRACEABILITY_VOCABULARY,
        TRACEABILITY_VOCABULARY_V1_0,
      ),
    (error) => error.code === "TG_VOCABULARY_DOWNGRADE",
  );
});

test("a 1.1 update on a valid 1.0 parent creates a 1.1 child with exact lineage", async () => {
  const graphId = "vocabulary-migration";
  const projectId = "migration-project";
  const architecture = assertionNode({
    graphId,
    kind: "architecture-element",
    stableId: "ARCH-LEGACY-MIGRATION",
  });
  const workItem = assertionNode({
    graphId,
    kind: "work-item",
    stableId: "WORK-LEGACY-MIGRATION",
  });
  const legacyEdge = assertionEdge({ graphId, source: architecture, target: workItem });
  const legacySnapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId,
    projectId,
    revision: 0,
    horizon: "implementation",
    vocabulary: TRACEABILITY_VOCABULARY_V1_0,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [architecture, workItem].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId, "en"),
    ),
    edges: [legacyEdge],
  };
  const bytes = Buffer.from(canonicalJson(legacySnapshot), "utf8");
  const legacyRef = {
    artifactId: "traceability-graph-vocabulary-migration-r0",
    schema: TRACEABILITY_GRAPH_SCHEMA,
    mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
    digest: sha256Digest(bytes),
    uri: "memory://fixtures/traceability-graph-vocabulary-migration-r0.json",
  };
  const store = createInMemoryTraceabilityStore();
  store.initialize(graphId, { ref: legacyRef, bytes, value: legacySnapshot });
  const service = createTraceabilityGraphService({
    graphId,
    projectId,
    store,
    contributors: [],
  });
  const invocation = {
    invocationId: "migration-invocation",
    module: { id: "migration", version: "1.0.0", operation: "observe" },
  };
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: {
      invocationId: invocation.invocationId,
      status: "completed",
      outcome: "observed",
      outputs: {},
      evidence: [],
    },
  });
  assert.deepEqual(prepared.update.vocabulary, TRACEABILITY_VOCABULARY);
  const merged = await service.mergePrepared(prepared);
  assert.deepEqual(merged.snapshot.vocabulary, TRACEABILITY_VOCABULARY);
  assert.deepEqual(merged.snapshot.parentGraph, legacyRef);
  assert.deepEqual(merged.snapshot.lastAppliedUpdate, prepared.updateRef);
  assert.deepEqual(merged.snapshot.appliedUpdates, [prepared.updateRef]);
  assert.equal(merged.snapshot.revision, 1);
  assert.equal(merged.snapshot.edges.length, 1);
  assert.deepEqual(merged.snapshot.edges[0], legacyEdge);
  assert.doesNotThrow(() => validateTraceabilityGraphSnapshot(merged.snapshot));
});

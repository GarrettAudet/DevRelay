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
  TRACEABILITY_EDGE_KINDS_V1_1,
  TRACEABILITY_EDGE_KINDS_V1_2,
  TRACEABILITY_EDGE_KINDS_V1_3,
  TRACEABILITY_EDGE_KINDS_V1_4,
  TRACEABILITY_ENDPOINT_POLICY_VERSION,
  TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_2,
  TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_3,
  TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_4,
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_HORIZONS,
  TRACEABILITY_HORIZONS_V1_4,
  TRACEABILITY_NODE_KINDS,
  TRACEABILITY_NODE_KINDS_V1_2,
  TRACEABILITY_NODE_KINDS_V1_3,
  TRACEABILITY_NODE_KINDS_V1_4,
  TRACEABILITY_VOCABULARY,
  TRACEABILITY_VOCABULARY_V1_0,
  TRACEABILITY_VOCABULARY_V1_1,
  TRACEABILITY_VOCABULARY_V1_2,
  TRACEABILITY_VOCABULARY_V1_3,
  TRACEABILITY_VOCABULARY_V1_4,
  assertTraceabilityVocabularyTransition,
  traceabilityContentDigest,
  traceabilityEdgeId,
  traceabilityNodeId,
  traceabilityUpdateId,
  validateTraceabilityGraphSnapshot,
  validateTraceabilityUpdate,
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

test("traceability 1.5 adds acceptance facts while versions 1.0 through 1.4 stay exact", () => {
  assert.equal(
    TRACEABILITY_VOCABULARY_V1_0.contractDigest,
    canonicalJsonDigest({ id: "devrelay.traceability/v1", version: "1.0.0" }),
  );
  assert.equal(
    TRACEABILITY_VOCABULARY_V1_2.contractDigest,
    canonicalJsonDigest({
      id: "devrelay.traceability/v1",
      version: "1.2.0",
      horizons: TRACEABILITY_HORIZONS_V1_4,
      nodeKinds: TRACEABILITY_NODE_KINDS_V1_2,
      edgeKinds: TRACEABILITY_EDGE_KINDS_V1_2,
      endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_2,
    }),
  );
  assert.equal(
    TRACEABILITY_VOCABULARY_V1_3.contractDigest,
    canonicalJsonDigest({
      id: "devrelay.traceability/v1",
      version: "1.3.0",
      horizons: TRACEABILITY_HORIZONS_V1_4,
      nodeKinds: TRACEABILITY_NODE_KINDS_V1_3,
      edgeKinds: TRACEABILITY_EDGE_KINDS_V1_3,
      endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_3,
    }),
  );
  assert.equal(
    TRACEABILITY_VOCABULARY_V1_4.contractDigest,
    canonicalJsonDigest({
      id: "devrelay.traceability/v1",
      version: "1.4.0",
      horizons: TRACEABILITY_HORIZONS_V1_4,
      nodeKinds: TRACEABILITY_NODE_KINDS_V1_4,
      edgeKinds: TRACEABILITY_EDGE_KINDS_V1_4,
      endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION_V1_4,
    }),
  );
  assert.equal(
    TRACEABILITY_VOCABULARY.contractDigest,
    canonicalJsonDigest({
      id: "devrelay.traceability/v1",
      version: "1.5.0",
      horizons: TRACEABILITY_HORIZONS,
      nodeKinds: TRACEABILITY_NODE_KINDS,
      edgeKinds: TRACEABILITY_EDGE_KINDS,
      endpointPolicyVersion: TRACEABILITY_ENDPOINT_POLICY_VERSION,
    }),
  );
  assert.equal(TRACEABILITY_NODE_KINDS_V1_2.includes("specialist-profile"), false);
  assert.equal(TRACEABILITY_NODE_KINDS.includes("specialist-profile"), true);
  assert.equal(TRACEABILITY_EDGE_KINDS_V1_2.includes("assigned-to"), false);
  assert.equal(TRACEABILITY_EDGE_KINDS.includes("assigned-to"), true);
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
  assert.equal(TRACEABILITY_EDGE_KINDS_V1_1.includes("prerequisite-for"), false);
  assert.equal(TRACEABILITY_EDGE_KINDS.includes("prerequisite-for"), true);
  assert.equal(TRACEABILITY_NODE_KINDS_V1_3.includes("change-set"), false);
  assert.equal(TRACEABILITY_NODE_KINDS_V1_4.includes("change-set"), true);
  assert.equal(TRACEABILITY_EDGE_KINDS_V1_3.includes("integrated-as"), false);
  assert.equal(TRACEABILITY_EDGE_KINDS_V1_4.includes("integrated-as"), true);
  assert.equal(TRACEABILITY_NODE_KINDS_V1_4.includes("business-acceptance-record"), false);
  assert.equal(TRACEABILITY_NODE_KINDS.includes("business-acceptance-record"), true);
  assert.equal(TRACEABILITY_NODE_KINDS_V1_4.includes("business-scope"), false);
  assert.equal(TRACEABILITY_NODE_KINDS.includes("business-scope"), true);
  assert.equal(TRACEABILITY_HORIZONS_V1_4.includes("acceptance"), false);
  assert.equal(TRACEABILITY_HORIZONS.includes("acceptance"), true);
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
      left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0,
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
      TRACEABILITY_VOCABULARY_V1_3,
      TRACEABILITY_VOCABULARY,
    ),
    TRACEABILITY_VOCABULARY,
  );
  assert.equal(
    assertTraceabilityVocabularyTransition(
      TRACEABILITY_VOCABULARY_V1_4,
      TRACEABILITY_VOCABULARY,
    ),
    TRACEABILITY_VOCABULARY,
  );
  assert.equal(
    assertTraceabilityVocabularyTransition(
      TRACEABILITY_VOCABULARY_V1_0,
      TRACEABILITY_VOCABULARY,
    ),
    TRACEABILITY_VOCABULARY,
  );
  assert.equal(
    assertTraceabilityVocabularyTransition(
      TRACEABILITY_VOCABULARY_V1_1,
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
        TRACEABILITY_VOCABULARY_V1_1,
      ),
    (error) => error.code === "TG_VOCABULARY_DOWNGRADE",
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

test("1.4 snapshots and updates reject acceptance while 1.5 accepts it", async () => {
  const contributor = {
    metadata: { id: "fixture.acceptance", version: "1.0.0" },
    authority: "approved",
    scope: "fixture/acceptance",
    ownership: { authority: "approved", scope: "fixture/acceptance", nodeKinds: [], edgeKinds: [] },
    match: () => true,
    project: () => ({ horizon: "acceptance", nodes: [], edges: [], reason: "Horizon-only migration fixture." }),
  };
  const service = createTraceabilityGraphService({
    graphId: "acceptance-horizon",
    projectId: "migration-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [contributor],
  });
  const invocation = { invocationId: "acceptance", module: { id: "fixture", version: "1.0.0", operation: "accept" } };
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: { invocationId: "acceptance", status: "completed", outcome: "accepted", outputs: {}, evidence: [] },
  });
  assert.equal(prepared.update.horizon, "acceptance");
  assert.doesNotThrow(() => validateTraceabilityUpdate(prepared.update));
  const legacyUpdateMaterial = { ...prepared.update, vocabulary: TRACEABILITY_VOCABULARY_V1_4 };
  const legacyUpdate = { ...legacyUpdateMaterial, updateId: traceabilityUpdateId(legacyUpdateMaterial) };
  assert.throws(() => validateTraceabilityUpdate(legacyUpdate), (error) => error.code === "TG_UNSUPPORTED_HORIZON");

  const merged = await service.mergePrepared(prepared);
  assert.equal(merged.snapshot.horizon, "acceptance");
  assert.doesNotThrow(() => validateTraceabilityGraphSnapshot(merged.snapshot));
  const legacySnapshot = { ...merged.snapshot, vocabulary: TRACEABILITY_VOCABULARY_V1_4 };
  assert.throws(() => validateTraceabilityGraphSnapshot(legacySnapshot), (error) => error.code === "TG_UNSUPPORTED_HORIZON");
});

test("a 1.2 update on a valid 1.0 parent creates a 1.2 child with exact lineage", async () => {
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
      left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0,
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

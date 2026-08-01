import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_UPDATE_SCHEMA,
  TRACEABILITY_VOCABULARY,
  TraceabilityArtifactValidationError,
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
import { traceabilityRuntimeArtifactContracts } from "../src/traceability-runtime-contracts.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function node({
  graphId = "contract-graph",
  kind,
  stableId,
  authority = "candidate",
  scope = "requirements/candidate",
  label = stableId,
  sourceLocators = [
    {
      artifact: { artifactId: "fixture-source", digest: digest("f") },
      jsonPointer: "",
      entityDigest: digest("e"),
    },
  ],
}) {
  const material = {
    nodeId: traceabilityNodeId({ graphId, kind, stableId, authority, scope }),
    kind,
    stableId,
    label,
    authority,
    state: "active",
    scope,
    contributor: {
      id: "test.projector",
      version: "1.0.0",
      contractDigest: digest("a"),
    },
    attributes: {},
    sourceLocators,
  };
  return { ...material, contentDigest: traceabilityContentDigest(material) };
}

function edge({ graphId = "contract-graph", kind, sourceNodeId, targetNodeId }) {
  const material = {
    edgeId: traceabilityEdgeId({
      graphId,
      kind,
      sourceNodeId,
      targetNodeId,
      qualifier: "",
      authority: "candidate",
      scope: "requirements/candidate",
    }),
    kind,
    sourceNodeId,
    targetNodeId,
    qualifier: "",
    rationale: "Canonical contract relationship.",
    authority: "candidate",
    state: "active",
    scope: "requirements/candidate",
    contributor: {
      id: "test.projector",
      version: "1.0.0",
      contractDigest: digest("a"),
    },
    attributes: {},
    sourceLocators: [
      {
        artifact: { artifactId: "fixture-source", digest: digest("f") },
        jsonPointer: "",
        entityDigest: digest("e"),
      },
    ],
  };
  return { ...material, contentDigest: traceabilityContentDigest(material) };
}

test("runtime registrations expose all four stable artifact schemas", () => {
  const contracts = traceabilityRuntimeArtifactContracts();
  assert.equal(contracts.length, 4);
  assert.deepEqual(
    contracts.map(({ schema }) => schema).sort(),
    [
      "https://devrelay.dev/artifacts/traceability-diagnostic-report/v1",
      TRACEABILITY_GRAPH_SCHEMA,
      "https://devrelay.dev/artifacts/traceability-merge-receipt/v1",
      TRACEABILITY_UPDATE_SCHEMA,
    ].sort(),
  );
  assert.ok(contracts.every(({ validate }) => typeof validate === "function"));
});

test("revision-zero graph is closed, canonical, and content addressable", () => {
  const service = createTraceabilityGraphService({
    graphId: "contract-graph",
    projectId: "contract-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [],
  });
  const base = service.captureBase();
  assert.equal(base.ref.schema, TRACEABILITY_GRAPH_SCHEMA);
  assert.equal(base.snapshot.revision, 0);
  assert.equal(base.snapshot.vocabulary.contractDigest, TRACEABILITY_VOCABULARY.contractDigest);
  assert.equal(validateTraceabilityGraphSnapshot(base.snapshot), base.snapshot);
  assert.equal(service.graphId, "contract-graph");
  assert.equal(service.projectId, "contract-project");
});

test("candidate and approved observations have different stable node identities", () => {
  const candidate = traceabilityNodeId({
    graphId: "contract-graph",
    kind: "user-story",
    stableId: "US-ONE",
    authority: "candidate",
    scope: "requirements/candidate",
  });
  const approved = traceabilityNodeId({
    graphId: "contract-graph",
    kind: "user-story",
    stableId: "US-ONE",
    authority: "approved",
    scope: "requirements/baseline",
  });
  assert.notEqual(candidate, approved);
});

test("graph accepts valid endpoint kinds and rejects invalid endpoint combinations", () => {
  const project = node({ kind: "project", stableId: "project" });
  const objective = node({ kind: "business-objective", stableId: "BO-ONE" });
  const valid = edge({
    kind: "defines",
    sourceNodeId: project.nodeId,
    targetNodeId: objective.nodeId,
  });
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId: "contract-graph",
    projectId: "contract-project",
    revision: 0,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [objective, project].sort((a, b) => a.nodeId.localeCompare(b.nodeId, "en")),
    edges: [valid],
  };
  assert.doesNotThrow(() => validateTraceabilityGraphSnapshot(snapshot));

  const invalid = structuredClone(snapshot);
  invalid.edges[0].kind = "accepted-by";
  invalid.edges[0].edgeId = traceabilityEdgeId({
    graphId: invalid.graphId,
    kind: "accepted-by",
    sourceNodeId: project.nodeId,
    targetNodeId: objective.nodeId,
    qualifier: "",
    authority: "candidate",
    scope: "requirements/candidate",
  });
  invalid.edges[0].contentDigest = traceabilityContentDigest(invalid.edges[0]);
  assert.throws(
    () => validateTraceabilityGraphSnapshot(invalid),
    (error) => error.code === "TG_INVALID_EDGE_ENDPOINTS",
  );
});

test("source locator supports multi-segment RFC 6901 pointers and rejects invalid escapes", () => {
  const graphId = "contract-graph";
  const objective = node({
    graphId,
    kind: "business-objective",
    stableId: "BO-ONE",
    sourceLocators: [
      {
        artifact: { artifactId: "requirements-draft", digest: digest("b") },
        jsonPointer: "/requirements/businessObjectives/0",
        entityDigest: digest("c"),
      },
    ],
  });
  const baseGraph = {
    artifactId: "graph-r0",
    schema: TRACEABILITY_GRAPH_SCHEMA,
    mediaType: "application/vnd.devrelay.traceability-graph+json",
    digest: digest("d"),
    uri: "memory://graph/r0",
  };
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityUpdate",
    graphId,
    projectId: "contract-project",
    baseGraph,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    producer: {
      module: { id: "test", version: "1.0.0", operation: "project" },
      invocationId: "invocation",
      invocationFingerprint: digest("e"),
      outcome: "completed",
    },
    sourceArtifacts: [
      {
        artifactId: "requirements-draft",
        schema: "https://example.test/requirements-draft/v1",
        mediaType: "application/json",
        digest: digest("b"),
        uri: "memory://fixtures/requirements-draft.json",
      },
    ],
    scopes: [
      {
        scope: "requirements/candidate",
        contributor: objective.contributor,
        authority: "candidate",
        nodeIds: [objective.nodeId],
        edgeIds: [],
      },
    ],
    nodeChanges: [{ precondition: { state: "absent" }, node: objective }],
    edgeChanges: [],
  };
  const update = { updateId: traceabilityUpdateId(material), ...material };
  assert.doesNotThrow(() => validateTraceabilityUpdate(update));

  const malformed = structuredClone(update);
  malformed.nodeChanges[0].node.sourceLocators[0].jsonPointer = "/requirements/~2bad";
  malformed.nodeChanges[0].node.contentDigest = traceabilityContentDigest(
    malformed.nodeChanges[0].node,
  );
  malformed.updateId = traceabilityUpdateId(malformed);
  assert.throws(
    () => validateTraceabilityUpdate(malformed),
    TraceabilityArtifactValidationError,
  );
});

test("node and update digest tampering fails closed", () => {
  const record = node({ kind: "business-objective", stableId: "BO-TAMPER" });
  const tampered = structuredClone(record);
  tampered.label = "Changed after digest";
  const project = node({ kind: "project", stableId: "project" });
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId: "contract-graph",
    projectId: "contract-project",
    revision: 0,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [project, tampered].sort((a, b) => a.nodeId.localeCompare(b.nodeId, "en")),
    edges: [],
  };
  assert.throws(() => validateTraceabilityGraphSnapshot(snapshot), /contentDigest/u);
  assert.match(canonicalJsonDigest(record), /^sha256:[a-f0-9]{64}$/u);
});


test("accepted-by never permits acceptance-criterion to acceptance-criterion", () => {
  const sourceCriterion = node({ kind: "acceptance-criterion", stableId: "AC-SOURCE" });
  const targetCriterion = node({ kind: "acceptance-criterion", stableId: "AC-TARGET" });
  const invalid = edge({
    kind: "accepted-by",
    sourceNodeId: sourceCriterion.nodeId,
    targetNodeId: targetCriterion.nodeId,
  });
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId: "contract-graph",
    projectId: "contract-project",
    revision: 0,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [sourceCriterion, targetCriterion].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId, "en"),
    ),
    edges: [invalid],
  };
  assert.throws(
    () => validateTraceabilityGraphSnapshot(snapshot),
    (error) => error.code === "TG_INVALID_EDGE_ENDPOINTS",
  );
});

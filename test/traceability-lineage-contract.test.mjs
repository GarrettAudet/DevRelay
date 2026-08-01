import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACEABILITY_ANALYZER,
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_UPDATE_MEDIA_TYPE,
  TRACEABILITY_UPDATE_SCHEMA,
  TRACEABILITY_VOCABULARY,
  traceabilityContentDigest,
  traceabilityEdgeId,
  traceabilityNodeId,
  traceabilityUpdateId,
  validateTraceabilityDiagnosticReport,
  validateTraceabilityGraphSnapshot,
  validateTraceabilityUpdate,
} from "../src/traceability-artifact-validator.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function graphRef(id = "graph-r0", character = "a") {
  return {
    artifactId: id,
    schema: TRACEABILITY_GRAPH_SCHEMA,
    mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
    digest: digest(character),
    uri: `memory://audit/${id}.json`,
  };
}

function updateRef(id = "update-one", character = "b") {
  return {
    artifactId: id,
    schema: TRACEABILITY_UPDATE_SCHEMA,
    mediaType: TRACEABILITY_UPDATE_MEDIA_TYPE,
    digest: digest(character),
    uri: `memory://audit/${id}.json`,
  };
}

function revisionOneSnapshot() {
  const applied = updateRef();
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId: "lineage-graph",
    projectId: "lineage-project",
    revision: 1,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    parentGraph: graphRef(),
    lastAppliedUpdate: structuredClone(applied),
    appliedUpdates: [applied],
    nodes: [],
    edges: [],
  };
}

function noChangeUpdate() {
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityUpdate",
    graphId: "lineage-graph",
    projectId: "lineage-project",
    baseGraph: graphRef(),
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    producer: {
      module: { id: "audit", version: "1.0.0", operation: "project" },
      invocationId: "invocation-audit",
      invocationFingerprint: digest("c"),
      outcome: "completed",
    },
    sourceArtifacts: [],
    scopes: [
      {
        scope: "core/non-contributing",
        contributor: {
          id: "audit.non-contributing",
          version: "1.0.0",
          contractDigest: digest("d"),
        },
        authority: "candidate",
        nodeIds: [],
        edgeIds: [],
        reason: "No semantic graph assertions.",
      },
    ],
    nodeChanges: [],
    edgeChanges: [],
  };
  return { updateId: traceabilityUpdateId(material), ...material };
}

function diagnosticReport() {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityDiagnosticReport",
    graph: graphRef("graph-r1", "e"),
    update: updateRef("update-diagnostic", "f"),
    horizon: "requirements",
    analyzer: TRACEABILITY_ANALYZER,
    summary: { errors: 0, warnings: 0, information: 0 },
    diagnostics: [],
  };
}

function assertionNode({ kind, stableId, state = "active" }) {
  const material = {
    nodeId: traceabilityNodeId({
      graphId: "edge-state-graph",
      kind,
      stableId,
      authority: "candidate",
      scope: "requirements/candidate",
    }),
    kind,
    stableId,
    label: stableId,
    authority: "candidate",
    state,
    scope: "requirements/candidate",
    contributor: {
      id: "audit.projector",
      version: "1.0.0",
      contractDigest: digest("1"),
    },
    attributes: {},
    sourceLocators: [
      {
        artifact: { artifactId: "edge-source", digest: digest("2") },
        jsonPointer: "",
        entityDigest: digest("3"),
      },
    ],
  };
  return { ...material, contentDigest: traceabilityContentDigest(material) };
}

test("snapshot lineage uses exact graph/update reference types and full-ref membership", () => {
  assert.equal(validateTraceabilityGraphSnapshot(revisionOneSnapshot()).revision, 1);

  const wrongParent = revisionOneSnapshot();
  wrongParent.parentGraph.schema = TRACEABILITY_UPDATE_SCHEMA;
  wrongParent.parentGraph.mediaType = TRACEABILITY_UPDATE_MEDIA_TYPE;
  assert.throws(() => validateTraceabilityGraphSnapshot(wrongParent));

  const wrongAppliedType = revisionOneSnapshot();
  wrongAppliedType.lastAppliedUpdate.schema = "https://example.test/not-update";
  wrongAppliedType.lastAppliedUpdate.mediaType = "application/json";
  wrongAppliedType.appliedUpdates[0] = structuredClone(
    wrongAppliedType.lastAppliedUpdate,
  );
  assert.throws(() => validateTraceabilityGraphSnapshot(wrongAppliedType));

  const alteredLastMetadata = revisionOneSnapshot();
  alteredLastMetadata.lastAppliedUpdate.uri =
    "memory://attacker/same-digest-different-ref.json";
  assert.throws(
    () => validateTraceabilityGraphSnapshot(alteredLastMetadata),
    /exact member/u,
  );
});

test("snapshot revision is the complete unique applied-update count", () => {
  const wrongCount = revisionOneSnapshot();
  wrongCount.revision = 99;
  assert.throws(
    () => validateTraceabilityGraphSnapshot(wrongCount),
    /complete applied-update count/u,
  );

  const duplicateDigest = revisionOneSnapshot();
  duplicateDigest.revision = 2;
  duplicateDigest.appliedUpdates = [
    updateRef("update-a", "b"),
    updateRef("update-z", "b"),
  ];
  duplicateDigest.lastAppliedUpdate = structuredClone(
    duplicateDigest.appliedUpdates[1],
  );
  assert.throws(
    () => validateTraceabilityGraphSnapshot(duplicateDigest),
    /duplicate update digest/u,
  );

  const invalidZero = revisionOneSnapshot();
  invalidZero.revision = 0;
  invalidZero.appliedUpdates = [];
  invalidZero.lastAppliedUpdate = null;
  assert.throws(
    () => validateTraceabilityGraphSnapshot(invalidZero),
    /revision zero/u,
  );
});

test("update base and diagnostic graph/update refs use their exact artifact types", () => {
  const update = noChangeUpdate();
  assert.equal(validateTraceabilityUpdate(update), update);
  const wrongBase = structuredClone(update);
  wrongBase.baseGraph.schema = "https://example.test/not-graph";
  wrongBase.baseGraph.mediaType = "application/json";
  wrongBase.updateId = traceabilityUpdateId(wrongBase);
  assert.throws(() => validateTraceabilityUpdate(wrongBase));

  const report = diagnosticReport();
  assert.equal(validateTraceabilityDiagnosticReport(report), report);
  const wrongGraph = structuredClone(report);
  wrongGraph.graph.schema = TRACEABILITY_UPDATE_SCHEMA;
  wrongGraph.graph.mediaType = TRACEABILITY_UPDATE_MEDIA_TYPE;
  assert.throws(() => validateTraceabilityDiagnosticReport(wrongGraph));
  const wrongUpdate = structuredClone(report);
  wrongUpdate.update.schema = TRACEABILITY_GRAPH_SCHEMA;
  wrongUpdate.update.mediaType = TRACEABILITY_GRAPH_MEDIA_TYPE;
  assert.throws(() => validateTraceabilityDiagnosticReport(wrongUpdate));
});

test("an active edge cannot point to a retired or superseded node", () => {
  const project = assertionNode({ kind: "project", stableId: "PROJECT" });
  const objective = assertionNode({
    kind: "business-objective",
    stableId: "BO-RETIRED",
    state: "retired",
  });
  const edgeMaterial = {
    edgeId: traceabilityEdgeId({
      graphId: "edge-state-graph",
      kind: "defines",
      sourceNodeId: project.nodeId,
      targetNodeId: objective.nodeId,
      qualifier: "",
      authority: "candidate",
      scope: "requirements/candidate",
    }),
    kind: "defines",
    sourceNodeId: project.nodeId,
    targetNodeId: objective.nodeId,
    qualifier: "",
    rationale: "Invalid active relationship to retired objective.",
    authority: "candidate",
    state: "active",
    scope: "requirements/candidate",
    contributor: project.contributor,
    attributes: {},
    sourceLocators: structuredClone(project.sourceLocators),
  };
  const edge = {
    ...edgeMaterial,
    contentDigest: traceabilityContentDigest(edgeMaterial),
  };
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityGraphSnapshot",
    graphId: "edge-state-graph",
    projectId: "edge-state-project",
    revision: 0,
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    nodes: [project, objective].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId, "en"),
    ),
    edges: [edge],
  };
  assert.throws(
    () => validateTraceabilityGraphSnapshot(snapshot),
    (error) => error.code === "TG_INACTIVE_EDGE_ENDPOINT",
  );
});

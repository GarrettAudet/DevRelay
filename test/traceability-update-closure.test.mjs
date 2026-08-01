import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_VOCABULARY,
  traceabilityContentDigest,
  traceabilityNodeId,
  traceabilityUpdateId,
  validateTraceabilityUpdate,
} from "../src/traceability-artifact-validator.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function fixture() {
  const contributor = {
    id: "test.projector",
    version: "1.0.0",
    contractDigest: digest("a"),
  };
  const source = {
    artifactId: "requirements-draft",
    schema: "https://example.test/requirements-draft/v1",
    mediaType: "application/json",
    digest: digest("b"),
    uri: "memory://fixtures/requirements-draft.json",
  };
  const nodeMaterial = {
    nodeId: traceabilityNodeId({
      graphId: "closure-graph",
      kind: "business-objective",
      stableId: "BO-ONE",
      authority: "candidate",
      scope: "requirements/candidate",
    }),
    kind: "business-objective",
    stableId: "BO-ONE",
    label: "Objective",
    authority: "candidate",
    state: "active",
    scope: "requirements/candidate",
    contributor,
    attributes: {},
    sourceLocators: [
      {
        artifact: { artifactId: source.artifactId, digest: source.digest },
        jsonPointer: "/businessObjectives/0",
        entityDigest: digest("c"),
      },
    ],
  };
  const node = {
    ...nodeMaterial,
    contentDigest: traceabilityContentDigest(nodeMaterial),
  };
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityUpdate",
    graphId: "closure-graph",
    projectId: "closure-project",
    baseGraph: {
      artifactId: "closure-graph-r0",
      schema: TRACEABILITY_GRAPH_SCHEMA,
      mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
      digest: digest("d"),
      uri: "memory://fixtures/closure-graph-r0.json",
    },
    horizon: "requirements",
    vocabulary: TRACEABILITY_VOCABULARY,
    producer: {
      module: { id: "requirements", version: "1.0.0", operation: "gather" },
      invocationId: "invocation-closure",
      invocationFingerprint: digest("e"),
      outcome: "completed",
    },
    sourceArtifacts: [source],
    scopes: [
      {
        scope: node.scope,
        contributor,
        authority: node.authority,
        nodeIds: [node.nodeId],
        edgeIds: [],
      },
    ],
    nodeChanges: [{ precondition: { state: "absent" }, node }],
    edgeChanges: [],
  };
  return { updateId: traceabilityUpdateId(material), ...material };
}

function resign(update) {
  update.updateId = traceabilityUpdateId(update);
  return update;
}

test("a traceability update is closed over scope ownership and provenance", () => {
  const update = fixture();
  assert.equal(validateTraceabilityUpdate(update), update);
  assert.match(canonicalJsonDigest(update), /^sha256:[a-f0-9]{64}$/u);
});

test("a changed assertion cannot be hidden behind an empty unrelated scope", () => {
  const update = fixture();
  update.scopes[0].nodeIds = [];
  update.scopes[0].reason = "Forged empty projection.";
  resign(update);
  assert.throws(
    () => validateTraceabilityUpdate(update),
    (error) => error.code === "TG_UPDATE_SCOPE_CLOSURE" && /not declared/u.test(error.message),
  );
});

test("scope authority and contributor must exactly own each changed assertion", () => {
  for (const mutate of [
    (update) => {
      update.scopes[0].authority = "approved";
    },
    (update) => {
      update.scopes[0].contributor = {
        id: "test.forged-projector",
        version: "1.0.0",
        contractDigest: digest("f"),
      };
    },
  ]) {
    const update = fixture();
    mutate(update);
    resign(update);
    assert.throws(
      () => validateTraceabilityUpdate(update),
      (error) => error.code === "TG_UPDATE_SCOPE_CLOSURE" && /owner/u.test(error.message),
    );
  }
});

test("one assertion cannot be claimed by multiple scopes", () => {
  const update = fixture();
  update.scopes.push({
    scope: "z/forged",
    contributor: {
      id: "z.forged",
      version: "1.0.0",
      contractDigest: digest("f"),
    },
    authority: "candidate",
    nodeIds: [update.nodeChanges[0].node.nodeId],
    edgeIds: [],
  });
  resign(update);
  assert.throws(
    () => validateTraceabilityUpdate(update),
    (error) => error.code === "TG_UPDATE_SCOPE_CLOSURE" && /multiple scopes/u.test(error.message),
  );
});

test("assertion locators must resolve to the declared sourceArtifacts closure", () => {
  const update = fixture();
  update.sourceArtifacts = [];
  resign(update);
  assert.throws(
    () => validateTraceabilityUpdate(update),
    (error) => error.code === "TG_UPDATE_PROVENANCE_CLOSURE",
  );

  const missing = fixture();
  missing.nodeChanges[0].node.sourceLocators = [];
  const { contentDigest: ignored, ...material } = missing.nodeChanges[0].node;
  missing.nodeChanges[0].node.contentDigest = traceabilityContentDigest(material);
  resign(missing);
  assert.throws(
    () => validateTraceabilityUpdate(missing),
    /sourceLocators must NOT have fewer than 1 items/u,
  );
});

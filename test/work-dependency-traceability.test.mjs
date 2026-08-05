import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  TRACEABILITY_VOCABULARY,
} from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";
import {
  workDependencyBaselineTraceabilityContributor,
} from "../src/work-dependency-traceability-contributor.mjs";

function loaded(value, schema, mediaType, id) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: {
      artifactId: id,
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `memory://trace/${id}.json`,
    },
  };
}

function seedContributor() {
  return {
    metadata: { id: "fixture.work-breakdown", version: "1.0.0" },
    scope: "work-breakdown/candidate",
    authority: "candidate",
    ownership: {
      scope: "work-breakdown/candidate",
      authority: "candidate",
      nodeKinds: ["work-item"],
      edgeKinds: [],
    },
    match: ({ invocation }) => invocation.module.id === "fixture-seed",
    project: ({ loadedOutputs }) => {
      const source = loadedOutputs.seed[0];
      return {
        horizon: "implementation",
        nodes: source.value.workItems.map((workItem, index) => ({
          kind: "work-item",
          stableId: workItem.id,
          label: workItem.id,
          attributes: { workItem },
          sourceLocators: [
            {
              artifact: {
                artifactId: source.ref.artifactId,
                digest: source.ref.digest,
              },
              jsonPointer: `/workItems/${index}`,
              entityDigest: canonicalJsonDigest(workItem),
            },
          ],
        })),
        edges: [],
      };
    },
  };
}

function ref(id, schema = "https://devrelay.dev/evidence/test/v1") {
  return {
    artifactId: id,
    schema,
    mediaType: "application/json",
    digest: `sha256:${id.charCodeAt(0).toString(16).padStart(2, "0").repeat(32)}`,
    uri: `memory://trace/${id}.json`,
  };
}

test("approved dependency baseline contributes only forward prerequisite-for edges", async () => {
  const graphId = "work-dependency-trace";
  const projectId = "devrelay-test";
  const service = createTraceabilityGraphService({
    graphId,
    projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [seedContributor(), workDependencyBaselineTraceabilityContributor],
  });
  const seed = loaded(
    {
      kind: "SeedWorkItems",
      workItems: [{ id: "WI-UPSTREAM" }, { id: "WI-DOWNSTREAM" }],
    },
    "https://devrelay.dev/fixtures/work-items/v1",
    "application/json",
    "seed-work-items",
  );
  const seedInvocation = {
    invocationId: "seed-001",
    module: { id: "fixture-seed", version: "1.0.0", operation: "seed" },
  };
  const seedPrepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation: seedInvocation,
    invocationFingerprint: canonicalJsonDigest(seedInvocation),
    moduleResult: {
      invocationId: seedInvocation.invocationId,
      status: "completed",
      outcome: "seeded",
      outputs: { seed: [seed.ref] },
      evidence: [],
    },
    loadedOutputs: { seed: [seed] },
  });
  await service.mergePrepared(seedPrepared);

  const edge = {
    id: "DEP-UPSTREAM-DOWNSTREAM",
    prerequisiteId: "WI-UPSTREAM",
    dependentId: "WI-DOWNSTREAM",
    rationale: "The upstream contract must exist before downstream integration.",
    evidence: [{ kind: "approved-dependency" }],
    policyDisposition: "allow",
  };
  const graphMaterial = {
    nodes: ["WI-DOWNSTREAM", "WI-UPSTREAM"],
    edges: [edge],
  };
  const candidateRef = ref("candidate", "https://devrelay.dev/artifacts/work-dependency-candidate/v1");
  candidateRef.mediaType = "application/vnd.devrelay.work-dependency-candidate+json";
  const workBreakdownRef = ref("work-breakdown", "https://devrelay.dev/artifacts/work-breakdown-baseline/v1");
  workBreakdownRef.mediaType = "application/vnd.devrelay.work-breakdown-baseline+json";
  const policyRef = ref("policy");
  const reviewRef = ref("review");
  const approvalRef = ref("approval");
  const baselineValue = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyBaseline",
    baselineId: "WDB-TRACE-001",
    version: "1.0.0",
    approvedCandidate: candidateRef,
    workBreakdownBaseline: workBreakdownRef,
    nodes: graphMaterial.nodes,
    edges: graphMaterial.edges,
    graphDigest: canonicalJsonDigest(graphMaterial),
    topologicalOrder: ["WI-UPSTREAM", "WI-DOWNSTREAM"],
    policyEvidence: policyRef,
    consistencyEvidence: reviewRef,
    approvalEvidence: [approvalRef],
    sourceRefs: [],
  };
  const baseline = loaded(
    baselineValue,
    "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
    "application/vnd.devrelay.work-dependency-baseline+json",
    baselineValue.baselineId,
  );
  const invocation = {
    invocationId: "wda-gate-001",
    module: {
      id: "work-dependency-gate",
      version: "0.1.0",
      operation: "promote-baseline",
    },
  };
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: {
      invocationId: invocation.invocationId,
      status: "completed",
      outcome: "promoted",
      outputs: { "work-dependency-baseline": [baseline.ref] },
      evidence: [],
    },
    loadedOutputs: { "work-dependency-baseline": [baseline] },
  });
  assert.deepEqual(prepared.update.vocabulary, TRACEABILITY_VOCABULARY);
  assert.equal(prepared.update.edgeChanges.length, 1);
  assert.equal(prepared.update.edgeChanges[0].edge.kind, "prerequisite-for");
  const merged = await service.mergePrepared(prepared);
  const dependency = merged.snapshot.edges.find(
    ({ kind }) => kind === "prerequisite-for",
  );
  const nodeById = new Map(merged.snapshot.nodes.map((node) => [node.nodeId, node]));
  assert.equal(nodeById.get(dependency.sourceNodeId).stableId, "WI-UPSTREAM");
  assert.equal(nodeById.get(dependency.targetNodeId).stableId, "WI-DOWNSTREAM");
  assert.equal(merged.snapshot.edges.some(({ kind }) => kind === "depends-on"), false);
});

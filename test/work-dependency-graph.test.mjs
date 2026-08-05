import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  analyzeDependencyGraph,
  deriveRunnableFrontier,
} from "../src/work-dependency-graph.mjs";
import { validateWorkDependencyArtifact } from "../src/work-dependency-artifact-validator.mjs";

function edge(prerequisiteId, dependentId) {
  return {
    prerequisiteId,
    dependentId,
    rationale: `${prerequisiteId} must precede ${dependentId}`,
    evidence: [{ kind: "fixture" }],
    policyDisposition: "allow",
  };
}

test("Graphology-DAG mechanics produce insertion-order-independent canonical output", () => {
  const nodes = ["WI-C", "WI-A", "WI-D", "WI-B"];
  const edges = [
    edge("WI-A", "WI-C"),
    edge("WI-B", "WI-C"),
    edge("WI-C", "WI-D"),
  ];
  const first = analyzeDependencyGraph({
    expectedWorkItemIds: nodes,
    nodeIds: nodes,
    edges,
  });
  const second = analyzeDependencyGraph({
    expectedWorkItemIds: [...nodes].reverse(),
    nodeIds: [...nodes].reverse(),
    edges: [...edges].reverse(),
  });
  assert.equal(first.status, "valid");
  assert.deepEqual(first, second);
  assert.deepEqual(first.topologicalOrder, ["WI-A", "WI-B", "WI-C", "WI-D"]);
  assert.deepEqual(first.generations, [
    ["WI-A", "WI-B"],
    ["WI-C"],
    ["WI-D"],
  ]);
  assert.doesNotThrow(() => validateWorkDependencyArtifact(first));
});

test("cycles, self-dependencies, duplicates, and unknown endpoints remain explicit evidence", () => {
  const cycle = analyzeDependencyGraph({
    expectedWorkItemIds: ["WI-A", "WI-B", "WI-C"],
    nodeIds: ["WI-A", "WI-B", "WI-C"],
    edges: [edge("WI-B", "WI-C"), edge("WI-C", "WI-A"), edge("WI-A", "WI-B")],
  });
  assert.equal(cycle.status, "invalid");
  assert.deepEqual(cycle.cycleWitness, ["WI-A", "WI-B", "WI-C", "WI-A"]);
  assert.deepEqual(cycle.diagnostics.map(({ code }) => code), ["WDA_CYCLE"]);
  assert.doesNotThrow(() => validateWorkDependencyArtifact(cycle));

  const malformed = analyzeDependencyGraph({
    expectedWorkItemIds: ["WI-A", "WI-B"],
    nodeIds: ["WI-A", "WI-B"],
    edges: [
      edge("WI-A", "WI-A"),
      edge("WI-A", "WI-B"),
      edge("WI-A", "WI-B"),
      edge("WI-MISSING", "WI-B"),
    ],
  });
  assert.equal(malformed.status, "invalid");
  assert.deepEqual(
    new Set(malformed.diagnostics.map(({ code }) => code)),
    new Set([
      "WDA_DUPLICATE_EDGE",
      "WDA_INVALID_ENDPOINT",
      "WDA_SELF_DEPENDENCY",
    ]),
  );
  assert.doesNotThrow(() => validateWorkDependencyArtifact(malformed));
});

test("runnable frontier is derived downstream and never stored in the baseline", () => {
  const edges = [
    { id: "DEP-A-B", ...edge("WI-A", "WI-B") },
    { id: "DEP-B-C", ...edge("WI-B", "WI-C") },
  ];
  const nodes = ["WI-A", "WI-B", "WI-C", "WI-D"];
  const baseline = {
    kind: "WorkDependencyBaseline",
    nodes,
    edges,
    graphDigest: canonicalJsonDigest({ nodes, edges }),
  };
  assert.deepEqual(deriveRunnableFrontier({ baseline }), ["WI-A", "WI-D"]);
  assert.deepEqual(
    deriveRunnableFrontier({ baseline, completedWorkItemIds: ["WI-A"] }),
    ["WI-B", "WI-D"],
  );
  assert.deepEqual(
    deriveRunnableFrontier({
      baseline,
      completedWorkItemIds: ["WI-A", "WI-B"],
    }),
    ["WI-C", "WI-D"],
  );
});

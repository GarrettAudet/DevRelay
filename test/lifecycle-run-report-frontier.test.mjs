import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  createIntegratedCompletionRegistry,
  deriveReadyFrontier,
} from "../src/lifecycle-run-report-frontier.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function edge(prerequisiteId, dependentId) {
  return {
    id: `DEP-${prerequisiteId}-${dependentId}`,
    prerequisiteId,
    dependentId,
    rationale: `${prerequisiteId} precedes ${dependentId}`,
    evidence: [{ kind: "fixture" }],
    policyDisposition: "allow",
  };
}

function baseline(nodes, edges) {
  const canonicalNodes = [...nodes].sort();
  const canonicalEdges = [...edges].sort((left, right) =>
    `${left.prerequisiteId}\0${left.dependentId}\0${left.id}`.localeCompare(`${right.prerequisiteId}\0${right.dependentId}\0${right.id}`, "en"),
  );
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyBaseline",
    baselineId: "WDB-TEST",
    nodes: canonicalNodes,
    edges: canonicalEdges,
    graphDigest: canonicalJsonDigest({ nodes: canonicalNodes, edges: canonicalEdges }),
  };
}

function completion(workItemId, suffix = workItemId) {
  const body = {
    completionId: `ICF-${suffix}`,
    workItem: { artifactId: workItemId, digest: digest("a") },
    changeSet: { artifactId: `CHANGE-${suffix}`, digest: digest("b") },
    verification: { artifactId: `VERIFY-${suffix}`, digest: digest("c") },
    integration: { artifactId: `INTEGRATE-${suffix}`, digest: digest("d") },
    status: "verified-and-integrated",
    authority: "factual-completion",
  };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "IntegratedCompletionFact",
    ...body,
    completionDigest: canonicalJsonDigest(body),
  };
}

const graph = baseline(
  ["WI-A", "WI-B", "WI-C", "WI-D", "WI-E"],
  [edge("WI-A", "WI-C"), edge("WI-B", "WI-C"), edge("WI-C", "WI-D")],
);

test("empty, serial, parallel, repeated, and all-complete frontiers are factual and deterministic", () => {
  const registry = createIntegratedCompletionRegistry({ baseline: graph });
  assert.deepEqual(registry.derive("F-0").readyWorkItemIds, ["WI-A", "WI-B", "WI-E"]);
  registry.record(completion("WI-A"));
  assert.deepEqual(registry.derive("F-1").readyWorkItemIds, ["WI-B", "WI-E"]);
  registry.record(completion("WI-B"));
  assert.deepEqual(registry.derive("F-2").readyWorkItemIds, ["WI-C", "WI-E"]);
  assert.deepEqual(registry.derive("F-2-REPEAT").readyWorkItemIds, ["WI-C", "WI-E"]);
  registry.record(completion("WI-C"));
  registry.record(completion("WI-D"));
  registry.record(completion("WI-E"));
  assert.deepEqual(registry.derive("F-DONE").readyWorkItemIds, []);
});

test("completion insertion order cannot change the derived frontier or dispositions", () => {
  const facts = [completion("WI-A"), completion("WI-B")];
  const first = deriveReadyFrontier({ baseline: graph, completionFacts: facts, frontierId: "F" });
  const second = deriveReadyFrontier({ baseline: graph, completionFacts: [...facts].reverse(), frontierId: "F" });
  assert.deepEqual(first, second);
  assert.deepEqual(first.dispositions.find(({ workItemId }) => workItemId === "WI-D"), {
    workItemId: "WI-D",
    status: "blocked",
    blockingWorkItemIds: ["WI-C"],
  });
});

test("stale, substituted, duplicated, and non-integrated completion claims fail closed", () => {
  assert.throws(() => deriveReadyFrontier({ baseline: graph, completionFacts: [completion("WI-MISSING")], frontierId: "F" }), /unknown work item/);
  const substituted = { ...completion("WI-A"), workItem: { artifactId: "WI-B", digest: digest("a") } };
  assert.throws(() => deriveReadyFrontier({ baseline: graph, completionFacts: [substituted], frontierId: "F" }), /exact validation/);
  assert.throws(() => deriveReadyFrontier({ baseline: graph, completionFacts: [completion("WI-A"), completion("WI-A", "OTHER")], frontierId: "F" }), /duplicate completion for work item/);
  const unintegrated = { ...completion("WI-A"), status: "verified" };
  assert.throws(() => deriveReadyFrontier({ baseline: graph, completionFacts: [unintegrated], frontierId: "F" }), /exact validation/);
});

test("missing predecessors, cycles, and baseline mutation are rejected or remain isolated", () => {
  const missing = structuredClone(graph);
  missing.edges[0].prerequisiteId = "WI-MISSING";
  assert.throws(() => deriveReadyFrontier({ baseline: missing, frontierId: "F" }), /exact valid dependency graph/);
  const cyclic = baseline(["WI-A", "WI-B"], [edge("WI-A", "WI-B"), edge("WI-B", "WI-A")]);
  assert.throws(() => deriveReadyFrontier({ baseline: cyclic, frontierId: "F" }), /exact valid dependency graph/);
  const original = structuredClone(graph);
  const result = deriveReadyFrontier({ baseline: graph, completionFacts: [completion("WI-A")], frontierId: "F" });
  assert.deepEqual(graph, original);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.dispositions));
});

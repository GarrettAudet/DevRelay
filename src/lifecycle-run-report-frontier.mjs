import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";
import {
  analyzeDependencyGraph,
  deriveRunnableFrontier,
} from "./work-dependency-graph.mjs";

export class LifecycleRunReportFrontierError extends Error {
  constructor(message) {
    super(`lifecycle run report frontier is invalid: ${message}`);
    this.name = "LifecycleRunReportFrontierError";
    this.code = "DR4410";
  }
}

const fail = (message) => {
  throw new LifecycleRunReportFrontierError(message);
};

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function validateBaseline(baseline) {
  if (baseline?.kind !== "WorkDependencyBaseline") {
    fail("an approved WorkDependencyBaseline is required");
  }
  const mechanics = analyzeDependencyGraph({
    expectedWorkItemIds: baseline.nodes,
    nodeIds: baseline.nodes,
    edges: baseline.edges,
  });
  if (mechanics.status !== "valid" || mechanics.graphDigest !== baseline.graphDigest) {
    fail("WorkDependencyBaseline does not match its exact valid dependency graph");
  }
  return mechanics;
}

function normalizeCompletionFacts(completionFacts, nodeIds) {
  if (!Array.isArray(completionFacts)) fail("completionFacts must be an array");
  const known = new Set(nodeIds);
  const completionIds = new Set();
  const workItemIds = new Set();
  const normalized = completionFacts.map((fact) => {
    try {
      validateLifecycleRunReportArtifact(fact);
    } catch (error) {
      fail(`completion fact failed exact validation: ${error.message}`);
    }
    if (fact.kind !== "IntegratedCompletionFact") fail("only IntegratedCompletionFact artifacts are accepted");
    if (!known.has(fact.workItem.artifactId)) fail(`completion fact names unknown work item ${fact.workItem.artifactId}`);
    if (completionIds.has(fact.completionId)) fail(`duplicate completion ID ${fact.completionId}`);
    if (workItemIds.has(fact.workItem.artifactId)) fail(`duplicate completion for work item ${fact.workItem.artifactId}`);
    completionIds.add(fact.completionId);
    workItemIds.add(fact.workItem.artifactId);
    return structuredClone(fact);
  });
  return normalized.sort((left, right) => compareText(left.completionId, right.completionId));
}

function artifactRef(artifactId, artifact, digestField) {
  return { artifactId, digest: artifact[digestField] ?? canonicalJsonDigest(artifact) };
}

export function deriveReadyFrontier({ baseline, completionFacts = [], frontierId }) {
  if (typeof frontierId !== "string" || frontierId.length === 0) fail("frontierId is required");
  const mechanics = validateBaseline(baseline);
  const facts = normalizeCompletionFacts(completionFacts, mechanics.nodes);
  const completedWorkItemIds = facts.map((fact) => fact.workItem.artifactId);
  const readyWorkItemIds = deriveRunnableFrontier({ baseline, completedWorkItemIds });
  const completed = new Set(completedWorkItemIds);
  const ready = new Set(readyWorkItemIds);
  const predecessors = new Map(mechanics.nodes.map((id) => [id, []]));
  for (const edge of mechanics.edges) predecessors.get(edge.dependentId).push(edge.prerequisiteId);
  const dispositions = mechanics.nodes.map((workItemId) => {
    if (completed.has(workItemId)) return { workItemId, status: "completed" };
    if (ready.has(workItemId)) return { workItemId, status: "ready" };
    return {
      workItemId,
      status: "blocked",
      blockingWorkItemIds: predecessors.get(workItemId).filter((id) => !completed.has(id)).sort(compareText),
    };
  });
  const workDependencyBaseline = artifactRef(baseline.baselineId, baseline, "digest");
  const completionFactRefs = facts.map((fact) => artifactRef(fact.completionId, fact, "completionDigest"));
  const derivation = {
    algorithm: "approved-dag-plus-integrated-completion",
    version: "1.0.0",
    inputDigest: canonicalJsonDigest({ workDependencyBaseline, completionFacts: completionFactRefs }),
  };
  const body = {
    frontierId,
    workDependencyBaseline,
    completionFacts: completionFactRefs,
    derivation,
    dispositions,
    readyWorkItemIds,
    authority: "core-derived-readiness",
  };
  const result = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ReadyFrontier",
    ...body,
    frontierDigest: canonicalJsonDigest(body),
  };
  validateLifecycleRunReportArtifact(result);
  return immutable(result);
}

export function createIntegratedCompletionRegistry({ baseline, completionFacts = [] }) {
  const mechanics = validateBaseline(baseline);
  let facts = normalizeCompletionFacts(completionFacts, mechanics.nodes);
  return Object.freeze({
    record(fact) {
      facts = normalizeCompletionFacts([...facts, fact], mechanics.nodes);
      return this.snapshot();
    },
    snapshot() {
      return immutable(facts);
    },
    derive(frontierId) {
      return deriveReadyFrontier({ baseline, completionFacts: facts, frontierId });
    },
  });
}

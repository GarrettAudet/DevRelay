import { DirectedGraph } from "graphology";
import {
  hasCycle,
  topologicalGenerations,
  topologicalSort,
} from "graphology-dag";

import { canonicalJsonDigest } from "./content-digest.mjs";

const GRAPH_IMPLEMENTATION = Object.freeze({
  graphology: "0.26.0",
  graphologyDag: "0.4.1",
});

export class WorkDependencyGraphError extends Error {
  constructor(message) {
    super(`work dependency graph is invalid: ${message}`);
    this.name = "WorkDependencyGraphError";
    this.code = "DR3000";
  }
}

function fail(message) {
  throw new WorkDependencyGraphError(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

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

function requireIds(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  const normalized = [...values].sort(compareText);
  if (
    normalized.some((id) => typeof id !== "string" || !/^WI-[A-Z0-9-]+$/u.test(id)) ||
    new Set(normalized).size !== normalized.length
  ) {
    fail(`${label} must contain unique WorkItem IDs`);
  }
  return normalized;
}

function normalizeEdge(edge, position) {
  if (edge === null || typeof edge !== "object" || Array.isArray(edge)) {
    fail(`edges[${position}] must be an object`);
  }
  const prerequisiteId = edge.prerequisiteId;
  const dependentId = edge.dependentId;
  if (
    typeof prerequisiteId !== "string" ||
    typeof dependentId !== "string" ||
    !/^WI-[A-Z0-9-]+$/u.test(prerequisiteId) ||
    !/^WI-[A-Z0-9-]+$/u.test(dependentId)
  ) {
    fail(`edges[${position}] has an invalid endpoint`);
  }
  if (typeof edge.rationale !== "string" || edge.rationale.length === 0) {
    fail(`edges[${position}] requires rationale`);
  }
  if (!Array.isArray(edge.evidence) || edge.evidence.length === 0) {
    fail(`edges[${position}] requires evidence`);
  }
  const material = {
    prerequisiteId,
    dependentId,
    rationale: edge.rationale,
    evidence: structuredClone(edge.evidence),
    policyDisposition: edge.policyDisposition ?? "allow",
  };
  if (!new Set(["allow", "deny"]).has(material.policyDisposition)) {
    fail(`edges[${position}] has invalid policyDisposition`);
  }
  return {
    id:
      edge.id ??
      `DEP-${canonicalJsonDigest({ prerequisiteId, dependentId }).slice(7, 23).toUpperCase()}`,
    ...material,
  };
}

function diagnostic(code, subject, message) {
  return { code, severity: "error", subject, message };
}

function canonicalCycleWitness(nodeIds, edges) {
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) adjacency.get(edge.prerequisiteId)?.push(edge.dependentId);
  for (const targets of adjacency.values()) targets.sort(compareText);

  const normalize = (cycle) => {
    const body = cycle.slice(0, -1);
    const rotations = body.map((_, index) => [
      ...body.slice(index),
      ...body.slice(0, index),
    ]);
    rotations.sort((left, right) =>
      left.join("\u0000").localeCompare(right.join("\u0000"), "en"),
    );
    return [...rotations[0], rotations[0][0]];
  };

  const witnesses = [];
  for (const start of nodeIds) {
    const path = [];
    const positions = new Map();
    const visit = (node) => {
      positions.set(node, path.length);
      path.push(node);
      for (const target of adjacency.get(node) ?? []) {
        if (target === start) {
          witnesses.push(normalize([...path, start]));
          continue;
        }
        if (!positions.has(target) && compareText(target, start) >= 0) visit(target);
      }
      path.pop();
      positions.delete(node);
    };
    visit(start);
  }
  witnesses.sort((left, right) =>
    left.join("\u0000").localeCompare(right.join("\u0000"), "en"),
  );
  return witnesses[0] ?? [];
}

function canonicalTopological(nodeIds, edges) {
  const incoming = new Map(nodeIds.map((id) => [id, 0]));
  const outgoing = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    incoming.set(edge.dependentId, incoming.get(edge.dependentId) + 1);
    outgoing.get(edge.prerequisiteId).push(edge.dependentId);
  }
  for (const targets of outgoing.values()) targets.sort(compareText);
  const ready = nodeIds.filter((id) => incoming.get(id) === 0).sort(compareText);
  const order = [];
  const generations = [];
  while (ready.length > 0) {
    const generation = [...ready].sort(compareText);
    generations.push(generation);
    ready.length = 0;
    for (const node of generation) {
      order.push(node);
      for (const target of outgoing.get(node)) {
        incoming.set(target, incoming.get(target) - 1);
        if (incoming.get(target) === 0) ready.push(target);
      }
    }
  }
  return { order, generations };
}

export function analyzeDependencyGraph({ expectedWorkItemIds, nodeIds, edges }) {
  const expected = requireIds(expectedWorkItemIds, "expectedWorkItemIds");
  const nodes = requireIds(nodeIds, "nodeIds");
  const normalizedEdges = edges
    .map(normalizeEdge)
    .sort((left, right) =>
      `${left.prerequisiteId}\u0000${left.dependentId}\u0000${left.id}`.localeCompare(
        `${right.prerequisiteId}\u0000${right.dependentId}\u0000${right.id}`,
        "en",
      ),
    );
  const diagnostics = [];
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(nodes)) {
    diagnostics.push(
      diagnostic(
        "WDA_GRAPH_COVERAGE",
        "nodes",
        "candidate nodes do not exactly cover the WorkBreakdownBaseline",
      ),
    );
  }
  const known = new Set(expected);
  const pairs = new Set();
  for (const edge of normalizedEdges) {
    const pair = `${edge.prerequisiteId}\u0000${edge.dependentId}`;
    if (!known.has(edge.prerequisiteId) || !known.has(edge.dependentId)) {
      diagnostics.push(
        diagnostic("WDA_INVALID_ENDPOINT", edge.id, "dependency endpoint is absent from the work-item universe"),
      );
    }
    if (edge.prerequisiteId === edge.dependentId) {
      diagnostics.push(diagnostic("WDA_SELF_DEPENDENCY", edge.id, "self-dependencies are forbidden"));
    }
    if (pairs.has(pair)) {
      diagnostics.push(diagnostic("WDA_DUPLICATE_EDGE", edge.id, "duplicate dependency endpoints are forbidden"));
    }
    pairs.add(pair);
  }

  const graph = new DirectedGraph({ allowSelfLoops: true, multi: false });
  for (const id of nodes) graph.addNode(id);
  if (diagnostics.length === 0) {
    for (const edge of normalizedEdges) {
      graph.addDirectedEdgeWithKey(edge.id, edge.prerequisiteId, edge.dependentId);
    }
  }
  let cycleWitness = [];
  let topologicalOrder = [];
  let generations = [];
  if (diagnostics.length === 0 && hasCycle(graph)) {
    cycleWitness = canonicalCycleWitness(nodes, normalizedEdges);
    diagnostics.push(
      diagnostic("WDA_CYCLE", cycleWitness.join(" -> "), "dependency graph contains a directed cycle"),
    );
  } else if (diagnostics.length === 0) {
    const canonical = canonicalTopological(nodes, normalizedEdges);
    topologicalOrder = canonical.order;
    generations = canonical.generations;
    const libraryOrder = topologicalSort(graph);
    const libraryGenerations = topologicalGenerations(graph);
    if (
      new Set(libraryOrder).size !== nodes.length ||
      libraryGenerations.flat().length !== nodes.length
    ) {
      fail("Graphology-DAG returned incomplete traversal output");
    }
  }

  const graphMaterial = { nodes, edges: normalizedEdges };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyGraphMechanicsResult",
    status: diagnostics.length === 0 ? "valid" : "invalid",
    implementation: GRAPH_IMPLEMENTATION,
    nodes,
    edges: normalizedEdges,
    graphDigest: canonicalJsonDigest(graphMaterial),
    topologicalOrder,
    generations,
    cycleWitness,
    diagnostics: diagnostics.sort((left, right) =>
      `${left.code}\u0000${left.subject}`.localeCompare(
        `${right.code}\u0000${right.subject}`,
        "en",
      ),
    ),
  });
}

export function deriveRunnableFrontier({ baseline, completedWorkItemIds = [] }) {
  if (baseline?.kind !== "WorkDependencyBaseline") {
    fail("deriveRunnableFrontier requires a WorkDependencyBaseline");
  }
  const completed = new Set(requireIds(completedWorkItemIds, "completedWorkItemIds"));
  const nodes = new Set(baseline.nodes);
  for (const id of completed) if (!nodes.has(id)) fail(`unknown completed work item ${id}`);
  const blocked = new Set();
  for (const edge of baseline.edges) {
    if (!completed.has(edge.prerequisiteId)) blocked.add(edge.dependentId);
  }
  return [...nodes]
    .filter((id) => !completed.has(id) && !blocked.has(id))
    .sort(compareText);
}

export const WORK_DEPENDENCY_GRAPH_IMPLEMENTATION = GRAPH_IMPLEMENTATION;

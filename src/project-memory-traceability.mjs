import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateProjectMemoryArtifact, withProjectMemoryContentDigest } from "./project-memory-artifact-validator.mjs";

export class ProjectMemoryTraceabilityError extends Error {
  constructor(message, code = "DR5350") {
    super(`project memory traceability failed: ${message}`);
    this.name = "ProjectMemoryTraceabilityError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new ProjectMemoryTraceabilityError(message, code); };

export function createTraceabilityContextProjection({ graphSnapshot, graphCheckpoint, sourceArtifacts, scope, lifecyclePosition, maxNodes = 128 } = {}) {
  if (graphSnapshot?.revision === undefined || graphCheckpoint?.digest === undefined) fail("an exact graph snapshot and checkpoint are required");
  if (!Array.isArray(scope) || scope.length === 0) fail("scope is required");
  const allowed = new Set(scope);
  const selected = graphSnapshot.nodes
    .filter((node) => node.state === "active" && node.authority === "approved" && (allowed.has(node.stableId) || allowed.has(node.kind) || allowed.has(node.scope)))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId, "en"))
    .slice(0, maxNodes);
  const nodeIds = new Set(selected.map(({ nodeId }) => nodeId));
  const resolveSourceRefs = (node) => node.sourceLocators.map((locator) => {
    const artifact = sourceArtifacts[locator.artifact.artifactId];
    if (!artifact || artifact.digest !== locator.artifact.digest) fail(`source artifact ${locator.artifact.artifactId} is missing or drifted`, "DR5351");
    return { role: node.kind, artifact: structuredClone(artifact), ...(locator.jsonPointer ? { jsonPointer: locator.jsonPointer } : {}) };
  });
  const nodes = selected.map((node) => ({ id: node.nodeId, kind: node.kind, label: node.label, sourceRefs: resolveSourceRefs(node) }));
  const edges = graphSnapshot.edges
    .filter((edge) => edge.state === "active" && edge.authority === "approved" && nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId, "en"))
    .map((edge) => ({ id: edge.edgeId, from: edge.sourceNodeId, kind: edge.kind, to: edge.targetNodeId }));
  const diagnostics = [];
  if (selected.length === maxNodes && graphSnapshot.nodes.length > maxNodes) diagnostics.push(`projection capped at ${maxNodes} nodes`);
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityContextProjection",
    projectionId: `TCP-${canonicalJsonDigest({ graphCheckpoint, scope, lifecyclePosition, nodes, edges }).slice(7, 23).toUpperCase()}`,
    graphCheckpoint: structuredClone(graphCheckpoint),
    graphVersion: graphSnapshot.vocabulary?.version ?? `1.0.${graphSnapshot.revision}`,
    scope: [...scope].sort(),
    lifecyclePosition,
    nodes,
    edges,
    diagnostics,
  };
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest(material));
}

export function queryTraceabilityContext(projection, { nodeId, direction = "both", maxEdges = 24 } = {}) {
  validateProjectMemoryArtifact(projection);
  if (projection.kind !== "TraceabilityContextProjection") fail("query requires a TraceabilityContextProjection");
  const nodes = new Map(projection.nodes.map((node) => [node.id, node]));
  if (!nodes.has(nodeId)) return Object.freeze({ node: null, relationships: [], diagnostics: ["node is outside the bounded projection"] });
  const relationships = projection.edges
    .filter((edge) => (direction !== "incoming" && edge.from === nodeId) || (direction !== "outgoing" && edge.to === nodeId))
    .slice(0, maxEdges)
    .map((edge) => ({ ...edge, fromLabel: nodes.get(edge.from)?.label, toLabel: nodes.get(edge.to)?.label }));
  return Object.freeze({ node: structuredClone(nodes.get(nodeId)), relationships, diagnostics: [] });
}

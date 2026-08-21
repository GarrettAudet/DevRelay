import assert from "node:assert/strict";
import test from "node:test";
import { createTraceabilityContextProjection, queryTraceabilityContext } from "../src/project-memory-traceability.mjs";

const D = `sha256:${"d".repeat(64)}`;
const artifact = { artifactId: "REQ", schema: "https://devrelay.dev/requirements", mediaType: "application/json", digest: D, uri: "devrelay://req/REQ" };
const node = (nodeId, stableId, kind, label) => ({ nodeId, stableId, kind, label, state: "active", authority: "approved", scope: "requirements/baseline", sourceLocators: [{ artifact: { artifactId: "REQ", digest: D }, jsonPointer: `/${stableId}` }] });
const graph = { revision: 11, vocabulary: { version: "1.6.0" }, nodes: [node("N-1", "AC-1", "acceptance-criterion", "Criterion"), node("N-2", "WI-1", "work-item", "Work"), { ...node("N-3", "OTHER", "work-item", "Candidate"), authority: "candidate" }], edges: [{ edgeId: "E-1", sourceNodeId: "N-1", targetNodeId: "N-2", kind: "planned-by", state: "active", authority: "approved" }] };
const checkpoint = { artifactId: "GRAPH", schema: "https://devrelay.dev/graph", mediaType: "application/json", digest: D, uri: "devrelay://graph/G" };

test("trusted projector selects only bounded approved graph closure", () => {
  const projection = createTraceabilityContextProjection({ graphSnapshot: graph, graphCheckpoint: checkpoint, sourceArtifacts: { REQ: artifact }, scope: ["acceptance-criterion", "work-item"], lifecyclePosition: "work-execution" });
  assert.equal(projection.nodes.length, 2);
  assert.equal(projection.edges.length, 1);
  assert.equal(projection.graphVersion, "1.6.0");
  assert.equal(projection.nodes.some(({ id }) => id === "N-3"), false);
});

test("compact query returns bounded provenance in either direction", () => {
  const projection = createTraceabilityContextProjection({ graphSnapshot: graph, graphCheckpoint: checkpoint, sourceArtifacts: { REQ: artifact }, scope: ["acceptance-criterion", "work-item"], lifecyclePosition: "work-execution" });
  assert.equal(queryTraceabilityContext(projection, { nodeId: "N-1" }).relationships[0].toLabel, "Work");
  assert.deepEqual(queryTraceabilityContext(projection, { nodeId: "missing" }).relationships, []);
});

test("projection fails closed on source drift and never exposes a graph mutation surface", () => {
  assert.throws(() => createTraceabilityContextProjection({ graphSnapshot: graph, graphCheckpoint: checkpoint, sourceArtifacts: { REQ: { ...artifact, digest: `sha256:${"e".repeat(64)}` } }, scope: ["work-item"], lifecyclePosition: "x" }), /drifted/u);
  const projection = createTraceabilityContextProjection({ graphSnapshot: graph, graphCheckpoint: checkpoint, sourceArtifacts: { REQ: artifact }, scope: ["work-item"], lifecyclePosition: "x" });
  assert.equal(projection.merge, undefined);
  assert.equal(projection.update, undefined);
});

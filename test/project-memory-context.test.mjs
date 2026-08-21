import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createProjectMemoryContextBootstrap, createProjectMemorySessionState } from "../src/project-memory-context.mjs";
import { createProjectMemoryRuntime, loadProjectMemoryArtifact } from "../src/project-memory.mjs";
import { withProjectMemoryContentDigest } from "../src/project-memory-artifact-validator.mjs";

const D = `sha256:${"a".repeat(64)}`;
const ref = (artifactId, overrides = {}) => ({ artifactId, schema: "https://devrelay.dev/artifacts/test/v1", mediaType: "application/json", digest: D, uri: `devrelay://test/${artifactId}`, ...overrides });
const sourceRef = (artifactId) => ({ role: "test", artifact: ref(artifactId) });
const graphCheckpoint = ref("GRAPH");
const baseline = withProjectMemoryContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectMemoryBaseline", baselineId: "PMB-1", projectId: "devrelay", version: "1.0.0", approvedCandidate: ref("MUC"), records: [{ id: "MEM-1", category: "direction", statement: "Stay deterministic.", authority: "approved-project", status: "active", effectiveAt: "2026-08-20T12:00:00Z", domain: "project-memory", sourceRefs: [sourceRef("SRC")] }], graphCheckpoint, projectionDigest: D, approvalEvidence: [ref("APP")], sourceRefs: [sourceRef("BASE")] });
const trace = withProjectMemoryContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "TraceabilityContextProjection", projectionId: "TCP-1", graphCheckpoint, graphVersion: "1.6.0", scope: ["work-item"], lifecyclePosition: "work-execution", nodes: [{ id: "NODE-1", kind: "work-item", label: "Work", sourceRefs: [sourceRef("WORK")] }], edges: [], diagnostics: [] });
const loaded = (value) => loadProjectMemoryArtifact(value);
const synopsisBytes = Buffer.from("# Current Synopsis\n", "utf8");
const synopsisRef = { artifactId: "CURRENT-SYNOPSIS", schema: "https://devrelay.dev/artifacts/current-synopsis/v1", mediaType: "text/markdown", digest: sha256Digest(synopsisBytes), uri: "devrelay://test/synopsis" };
const values = new Map([[synopsisRef.digest, { ref: synopsisRef, bytes: synopsisBytes }], [loaded(baseline).ref.digest, loaded(baseline)], [loaded(trace).ref.digest, loaded(trace)]]);

test("fresh-task bootstrap loads synopsis first and emits reconstructable context", async () => {
  const calls = [];
  const bootstrap = createProjectMemoryContextBootstrap({ loadArtifact: async (artifact, role) => { calls.push(role); return values.get(artifact.digest); }, runtime: createProjectMemoryRuntime(), clock: () => "2026-08-20T15:00:00Z" });
  const result = await bootstrap.load({ executionId: "E-1", operation: "load-context", projectId: "devrelay", sessionId: "S-1", taskId: "T-1", workspaceId: "W-1", repositoryRevision: "a".repeat(40), moduleId: "work-execution", moduleInvocationId: "INV-1", projectMemoryBaseline: loaded(baseline).ref, synopsisProjection: synopsisRef, traceabilityProjection: loaded(trace).ref, query: "deterministic" });
  assert.equal(result.outcome, "pass");
  assert.deepEqual(calls, ["synopsis", "baseline", "traceability"]);
  assert.deepEqual(result.receipt.loadOrder, ["current-synopsis", "project-memory-baseline", "traceability-context"]);
  assert.equal(result.bundle.value.kind, "MemoryContextBundle");
});

test("bootstrap blocks behind an unconcluded different task before artifact I/O", async () => {
  let calls = 0;
  const bootstrap = createProjectMemoryContextBootstrap({ loadArtifact: async () => { calls += 1; }, runtime: createProjectMemoryRuntime() });
  const result = await bootstrap.load({ taskId: "NEW", currentSession: { taskId: "OLD", sessionId: "S-OLD", status: "open" } });
  assert.equal(result.operation, "recovery-required");
  assert.equal(calls, 0);
});

test("bootstrap fails closed on stale synopsis bytes", async () => {
  const bootstrap = createProjectMemoryContextBootstrap({ loadArtifact: async () => ({ ref: synopsisRef, bytes: Buffer.from("changed") }), runtime: createProjectMemoryRuntime() });
  await assert.rejects(() => bootstrap.load({ taskId: "T", synopsisProjection: synopsisRef }), /drifted/u);
});

test("session state records open, concluded, and explicit abandonment semantics", () => {
  const common = { projectId: "devrelay", sessionId: "S", taskId: "T", baseline: loaded(baseline).ref, graphCheckpoint, lastCheckpointDigest: D, updatedAt: "2026-08-20T15:00:00Z" };
  assert.equal(createProjectMemorySessionState({ ...common, status: "open" }).status, "open");
  assert.equal(createProjectMemorySessionState({ ...common, status: "concluded" }).status, "concluded");
  assert.equal(createProjectMemorySessionState({ ...common, status: "abandoned", abandonmentRationale: "Owner discarded this task." }).status, "abandoned");
  assert.throws(() => createProjectMemorySessionState({ ...common, status: "abandoned" }), /rationale/u);
});

test("context load receipt identity is stable for equal inputs", async () => {
  const make = () => createProjectMemoryContextBootstrap({ loadArtifact: async (artifact) => values.get(artifact.digest), runtime: createProjectMemoryRuntime(), clock: () => "2026-08-20T15:00:00Z" });
  const request = { executionId: "E-2", operation: "load-context", projectId: "devrelay", sessionId: "S-1", taskId: "T-2", workspaceId: "W", repositoryRevision: "b".repeat(40), moduleId: "m", moduleInvocationId: "i", projectMemoryBaseline: loaded(baseline).ref, synopsisProjection: synopsisRef, traceabilityProjection: loaded(trace).ref, query: "" };
  assert.equal((await make().load(request)).receipt.receiptId, (await make().load(request)).receipt.receiptId);
  assert.equal(canonicalJson(JSON.parse(canonicalJson(baseline))), canonicalJson(baseline));
  assert.match(canonicalJsonDigest(request), /^sha256:/u);
});

test("context load timing is Core-observed and rejects an invalid monotonic clock", async () => {
  const request = { executionId: "E-TIMING", operation: "load-context", projectId: "devrelay", sessionId: "S-1", taskId: "T-TIMING", workspaceId: "W", repositoryRevision: "c".repeat(40), moduleId: "m", moduleInvocationId: "i", projectMemoryBaseline: loaded(baseline).ref, synopsisProjection: synopsisRef, traceabilityProjection: loaded(trace).ref, query: "", cache: "warm", durationMs: 9999 };
  const ticks = [10, 17];
  const bootstrap = createProjectMemoryContextBootstrap({ loadArtifact: async (artifact) => values.get(artifact.digest), runtime: createProjectMemoryRuntime(), clock: () => "2026-08-20T15:00:00Z", monotonicNow: () => ticks.shift() });
  const result = await bootstrap.load(request);
  assert.equal(result.receipt.durationMs, 7);
  assert.equal(result.receipt.cache, "warm");

  const invalidTicks = [20, 19];
  const invalid = createProjectMemoryContextBootstrap({ loadArtifact: async (artifact) => values.get(artifact.digest), runtime: createProjectMemoryRuntime(), monotonicNow: () => invalidTicks.shift() });
  await assert.rejects(() => invalid.load({ ...request, executionId: "E-TIMING-INVALID" }), /invalid duration/u);
});
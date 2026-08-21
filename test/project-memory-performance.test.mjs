import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createProjectMemoryContextBootstrap } from "../src/project-memory-context.mjs";
import {
  createProjectMemoryRuntime,
  loadProjectMemoryArtifact,
  retrieveNativeProjectMemory,
} from "../src/project-memory.mjs";
import { withProjectMemoryContentDigest } from "../src/project-memory-artifact-validator.mjs";

const D = `sha256:${"a".repeat(64)}`;
const ref = (artifactId, overrides = {}) => ({ artifactId, schema: "https://devrelay.dev/artifacts/test/v1", mediaType: "application/json", digest: D, uri: `devrelay://performance/${artifactId}`, ...overrides });
const sourceRef = (artifactId) => ({ role: "performance-fixture", artifact: ref(artifactId) });
const graphCheckpoint = ref("GRAPH-PERFORMANCE");
const baselineValue = withProjectMemoryContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectMemoryBaseline",
  baselineId: "PMB-PERFORMANCE",
  projectId: "devrelay",
  version: "1.0.0",
  approvedCandidate: ref("MUC-PERFORMANCE"),
  records: Array.from({ length: 32 }, (_, index) => ({
    id: `MEM-PERFORMANCE-${String(index).padStart(3, "0")}`,
    category: index % 2 === 0 ? "direction" : "status",
    statement: `Deterministic project memory performance record ${index}.`,
    authority: index % 2 === 0 ? "approved-project" : "validated-status",
    status: "active",
    effectiveAt: `2026-08-20T12:00:${String(index).padStart(2, "0")}Z`,
    domain: index % 2 === 0 ? "project-memory" : "execution",
    sourceRefs: [sourceRef(`SOURCE-${String(index).padStart(3, "0")}`)],
  })),
  graphCheckpoint,
  projectionDigest: D,
  approvalEvidence: [ref("APPROVAL-PERFORMANCE")],
  sourceRefs: [sourceRef("SOURCE-BASELINE")],
});
const traceValue = withProjectMemoryContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityContextProjection",
  projectionId: "TRACE-PERFORMANCE",
  graphCheckpoint,
  graphVersion: "1.6.0",
  scope: ["WI-PM-REGRESSION-PERFORMANCE"],
  lifecyclePosition: "work-item-verification",
  nodes: [{ id: "WI-PM-REGRESSION-PERFORMANCE", kind: "work-item", label: "PM regression and performance", sourceRefs: [sourceRef("SOURCE-WORK")] }],
  edges: [],
  diagnostics: [],
});
const baseline = loadProjectMemoryArtifact(baselineValue);
const trace = loadProjectMemoryArtifact(traceValue);
const synopsisBytes = Buffer.from("# Current Synopsis\n\n- PM-001 performance fixture.\n", "utf8");
const synopsisRef = ref("CURRENT-SYNOPSIS-PERFORMANCE", { schema: "https://devrelay.dev/artifacts/current-synopsis/v1", mediaType: "text/markdown", digest: sha256Digest(synopsisBytes) });
const loadedByDigest = new Map([[baseline.ref.digest, baseline], [trace.ref.digest, trace], [synopsisRef.digest, { ref: synopsisRef, bytes: synopsisBytes }]]);
const p95 = (samples) => [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1];

function request(executionId, cache) {
  return { executionId, operation: "load-context", projectId: "devrelay", sessionId: "SESSION-PERFORMANCE", taskId: "TASK-PERFORMANCE", workspaceId: "WORKSPACE-PERFORMANCE", repositoryRevision: "d".repeat(40), moduleId: "work-execution", moduleInvocationId: "INVOCATION-PERFORMANCE", projectMemoryBaseline: baseline.ref, synopsisProjection: synopsisRef, traceabilityProjection: trace.ref, query: "deterministic", cache };
}

function bootstrap(runtime) {
  return createProjectMemoryContextBootstrap({ loadArtifact: async (artifact) => loadedByDigest.get(artifact.digest), runtime, clock: () => "2026-08-20T15:00:00Z" });
}

test("PM-001 context load and provider retrieval stay within approved Windows budgets", async (context) => {
  const cold = [];
  const coldDigests = new Set();
  for (let index = 0; index < 25; index += 1) {
    const started = performance.now();
    const result = await bootstrap(createProjectMemoryRuntime()).load(request(`PM-COLD-${index}`, "cold"));
    const elapsed = performance.now() - started;
    cold.push(result.receipt.durationMs);
    coldDigests.add(canonicalJsonDigest(result.bundle.value.items));
    assert.equal(result.receipt.cache, "cold");
    assert.equal(result.replayed, false);
    assert.ok(result.receipt.durationMs <= elapsed + 5);
  }

  const warmRuntime = createProjectMemoryRuntime();
  const warmBootstrap = bootstrap(warmRuntime);
  await warmBootstrap.load(request("PM-WARM", "cold"));
  const warm = [];
  for (let index = 0; index < 25; index += 1) {
    const result = await warmBootstrap.load(request("PM-WARM", "warm"));
    warm.push(result.receipt.durationMs);
    assert.equal(result.receipt.cache, "warm");
    assert.equal(result.replayed, true);
  }

  const providerDurations = [];
  const providerRuntime = createProjectMemoryRuntime({
    provider: {
      id: "mem0.performance-fixture",
      version: "1.1.0",
      configurationDigest: D,
      async retrieve(providerRequest) {
        return retrieveNativeProjectMemory({ baseline: providerRequest.baseline, query: providerRequest.query, limit: 32 });
      },
    },
  });
  for (let index = 0; index < 25; index += 1) {
    const result = await providerRuntime.execute({ ...request(`PM-PROVIDER-${index}`, "cold"), requestedOperation: "load-context", projectMemoryBaseline: baseline, traceabilityProjection: trace, synopsisProjection: synopsisRef });
    providerDurations.push(result.providerReceipt.value.durationMs);
    assert.equal(result.providerReceipt.value.providerId, "mem0.performance-fixture");
    assert.equal(result.providerReceipt.value.providerVersion, "1.1.0");
    assert.match(result.providerReceipt.value.commandFingerprint, /^sha256:[0-9a-f]{64}$/u);
  }

  assert.equal(coldDigests.size, 1);
  assert.ok(p95(cold) <= 750, `cold authoritative context p95 ${p95(cold)} ms exceeded 750 ms`);
  assert.ok(p95(warm) <= 250, `warm authoritative context p95 ${p95(warm)} ms exceeded 250 ms`);
  assert.ok(p95(providerDurations) <= 750, `bounded provider retrieval p95 ${p95(providerDurations)} ms exceeded 750 ms`);
  context.diagnostic(`PM-001 performance: cold p95=${p95(cold).toFixed(3)} ms; warm p95=${p95(warm).toFixed(3)} ms; provider p95=${p95(providerDurations).toFixed(3)} ms; samples=25`);
});

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createRoadmapManagementRuntime, createRoadmapPriorityPolicy, evaluateRoadmapPriority } from "../src/roadmap-management.mjs";
import { createSessionContextSnapshot, executeSessionBootstrap } from "../src/session-bootstrap.mjs";

const D = `sha256:${"a".repeat(64)}`;
const REVISION = "d".repeat(40);
const ref = (artifactId, digest = D) => ({ artifactId, schema: "https://devrelay.dev/test/v1", mediaType: "application/json", digest, uri: `memory://devrelay/${artifactId}` });
const sourceRefs = [{ role: "requirements", artifact: ref("REQ-1") }];
const factorValues = { strategicAlignment: 0.8, userValue: 0.8, urgency: 0.5, riskReduction: 0.7, effort: 0.4, dependencies: 0.6, confidence: 0.9 };
const policy = createRoadmapPriorityPolicy({ policyId: "RM-PERF-POLICY", weights: { strategicAlignment: 0.2, userValue: 0.2, urgency: 0.1, riskReduction: 0.15, effort: 0.1, dependencies: 0.1, confidence: 0.15 } });
const policyRef = ref("RM-PERF-POLICY");
const p95 = (samples) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];

function sessionFixture() {
  const roles = ["project-overview", "project-overview-projection", "project-memory-baseline", "current-synopsis", "traceability-context", "lifecycle-status", "roadmap", "roadmap-projection"];
  const bytesByDigest = new Map();
  const bindings = roles.map((role) => {
    const bytes = Buffer.from(`performance:${role}`, "utf8");
    const artifact = ref(`PERF-${role}`, sha256Digest(bytes));
    bytesByDigest.set(artifact.digest, bytes);
    return { role, artifact, artifactVersion: "1.0.0" };
  });
  return {
    snapshot: createSessionContextSnapshot({ projectId: "PROJECT-PERF", taskId: "TASK-PERF", workspaceId: "WORKSPACE-PERF", repositoryRevision: REVISION, bindings, roadmapDisposition: "initialized", createdAt: "2026-08-15T12:00:00Z" }),
    artifactResolver: async (artifact) => ({ bytes: bytesByDigest.get(artifact.digest) }),
  };
}

async function bootstrapSamples(cache) {
  const fixture = sessionFixture();
  const samples = [];
  for (let index = 0; index < 25; index += 1) {
    const started = performance.now();
    const receipt = await executeSessionBootstrap({ snapshot: fixture.snapshot, artifactResolver: fixture.artifactResolver, expectedProjectId: "PROJECT-PERF", expectedTaskId: "TASK-PERF", expectedWorkspaceId: "WORKSPACE-PERF", expectedRepositoryRevision: REVISION, cache });
    samples.push(performance.now() - started);
    assert.equal(receipt.outcome, "pass");
  }
  return samples;
}

test("RM-001 bootstrap and 1,000-item review stay within approved Windows budgets", async () => {
  const cold = await bootstrapSamples("cold");
  const warm = await bootstrapSamples("warm");
  assert.ok(p95(cold) <= 750, `cold bootstrap p95 ${p95(cold)} ms exceeded 750 ms`);
  assert.ok(p95(warm) <= 250, `warm bootstrap p95 ${p95(warm)} ms exceeded 250 ms`);

  const initiatives = Array.from({ length: 1_000 }, (_, index) => {
    const id = `RI-PERF-${String(index).padStart(4, "0")}`;
    return {
      id,
      title: `Initiative ${index}`,
      purpose: `Deterministic performance fixture ${index}.`,
      status: "kept",
      recommendation: "keep",
      rationale: "Performance fixture.",
      priority: evaluateRoadmapPriority({ policy, factors: factorValues }),
      requirementsBaseline: ref("REQ-1"),
      sourceRefs,
    };
  });
  const runtime = createRoadmapManagementRuntime();
  const started = performance.now();
  const result = await runtime.execute({ operation: "review-roadmap", currentBaseline: { baselineId: "ROADMAP-PERF", version: "1.0.0", initiatives }, currentBaselineRef: ref("ROADMAP-PERF"), priorityPolicy: policy, priorityPolicyRef: policyRef, sourceRefs });
  const reviewMs = performance.now() - started;
  assert.equal(result.draft.initiatives.length, 1_000);
  assert.ok(reviewMs <= 1_000, `1,000-item review ${reviewMs} ms exceeded 1,000 ms`);
  const { contentDigest, ...draftMaterial } = result.draft;
  assert.equal(canonicalJsonDigest(draftMaterial), contentDigest);
});
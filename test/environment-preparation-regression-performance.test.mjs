import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createEnvironmentAdapterCheckpointController, createEnvironmentAdapterInvocation, defineEnvironmentAdapterManifest, selectEnvironmentAdapter } from "../src/environment-preparation-adapters.mjs";
import { createEnvironmentEffectCoordinator, createEnvironmentRemediationApproval, createEnvironmentRemediationPlan, createInMemoryEnvironmentEffectCheckpointStore } from "../src/environment-preparation-effects.mjs";
import { createNativeWindowsEnvironmentHost, createNativeWindowsEnvironmentInventory, resolveEnvironmentProfileSet } from "../src/environment-preparation-profile-inventory.mjs";
import { recordLocalPerformanceMetrics, verifyLocalPerformanceMetrics } from "../src/local-performance-metrics.mjs";

const D = (value) => canonicalJsonDigest(value);
const ref = (id) => ({ artifactId: id, schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`, mediaType: "application/json", digest: D(id), uri: `memory://fixture/${id}` });
const repository = ref("REPOSITORY");
const sourceRefs = [{ role: "approved-work-item", artifact: ref("WI-EP-REGRESSION-PERFORMANCE") }];
const checks = [
  { id: "OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds: 300 },
  { id: "NODE", capability: "node", required: true, observationKind: "runtime", constraint: ">=22.0.0", freshnessSeconds: 300 },
  { id: "SECRET", capability: "DEVRELAY_TOKEN", required: true, observationKind: "environment-variable", constraint: "present", freshnessSeconds: 300 },
];

function profiles(reverse = false) {
  const projectChecks = reverse ? [...checks.slice(1)].reverse() : checks.slice(1);
  return resolveEnvironmentProfileSet({
    profileSetId: "EPS-REGRESSION",
    version: "1.0.0",
    repository,
    hostProfile: { id: "HOST", layer: "devrelay-host", name: "Windows host", checks: [checks[0]] },
    projectProfiles: [{ id: "PROJECT", layer: "project-target", name: "Project", checks: projectChecks }],
    sourceRefs,
  });
}

function host(overrides = {}) {
  return createNativeWindowsEnvironmentHost({
    platform: "win32",
    architecture: "x64",
    environment: { DEVRELAY_TOKEN: "never-export-this-value" },
    repositoryRoot: process.cwd(),
    maturity: "fixture-conformant",
    spawn: () => ({ status: 0, stdout: "v24.0.0\n", stderr: "" }),
    ...overrides,
  });
}

function inventory(id = "INV-REGRESSION", overrides = {}) {
  return createNativeWindowsEnvironmentInventory({ inventoryId: id, profileSet: profiles(), repository, host: host(overrides), observedAt: "2026-08-21T12:00:00.000Z", sourceRefs });
}

test("profile permutations normalize to one deterministic contract and one redacted fingerprint", () => {
  assert.deepEqual(profiles(false), profiles(true));
  const first = inventory("INV-A").inventory;
  const second = inventory("INV-B").inventory;
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(canonicalJson(first).includes("never-export-this-value"), false);
  assert.deepEqual(first.observations.find(({ checkId }) => checkId === "SECRET").present, true);
});

test("bounded parallel read-only inventories converge without shared mutable state", async () => {
  let calls = 0;
  const runs = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
    calls += 1;
    return inventory(`INV-PARALLEL-${index}`).inventory;
  }));
  assert.equal(calls, 4);
  assert.equal(new Set(runs.map(({ fingerprint }) => fingerprint)).size, 1);
  assert.equal(new Set(runs.map(({ observations }) => D(observations.map(({ durationMs, rawEvidence, ...stable }) => stable)))).size, 1);
});

test("effect checkpoints serialize mutation and exact replay records zero additional calls", async () => {
  const failed = inventory("INV-FAILED", { spawn: () => ({ status: 0, stdout: "v1.0.0\n", stderr: "" }) });
  const plan = createEnvironmentRemediationPlan({
    planId: "PLAN-REGRESSION",
    profileSet: profiles(),
    inventory: failed.inventory,
    effectCatalog: [{ checkId: "NODE", effectId: "FIX-NODE", effect: { capability: "configure", scope: "project-local", description: "Pin Node.", impact: "Write one local file.", grants: [{ kind: "filesystem.write", scope: "project/.node-version", purpose: "Pin Node" }], rollback: { supported: true, procedure: "Restore file." }, requiredEvidence: ["file-hash"] } }],
    sourceRefs,
  });
  const approval = createEnvironmentRemediationApproval({ approvalId: "APPROVE-REGRESSION", plan, approvedEffectIds: ["FIX-NODE"] });
  let calls = 0;
  const coordinator = createEnvironmentEffectCoordinator({
    adapter: { id: "fixture.effect", version: "1.0.0", async apply() { calls += 1; return { outcome: "applied", beforeFingerprint: failed.inventory.fingerprint, afterFingerprint: D("fixed"), durationMs: 2, rollbackState: "available", evidence: [ref("EFFECT-EVIDENCE")], diagnostics: [] }; } },
    checkpoints: createInMemoryEnvironmentEffectCheckpointStore(),
  });
  const request = { plan, effectId: "FIX-NODE", approval, hostGrants: plan.effects[0].grants, currentFingerprint: failed.inventory.fingerprint };
  const first = await coordinator.execute(request);
  const replay = await coordinator.execute(request);
  assert.equal(first.effectCalls, 1);
  assert.equal(replay.effectCalls, 0);
  assert.equal(calls, 1);
  assert.equal(replay.receipt.contentDigest, first.receipt.contentDigest);
});

test("provider checkpoint replay is cache-observable and configuration drift fails closed", async () => {
  const manifest = defineEnvironmentAdapterManifest({ id: "fixture.inventory", version: "1.0.0", capabilities: ["inventory"], permissionDemands: [], offlineDefault: true, configurationSchemaDigest: D("schema") });
  const selection = selectEnvironmentAdapter({ catalog: [manifest], configuredAdapterId: manifest.id, capability: "inventory", hostGrants: [] });
  let calls = 0;
  const values = new Map();
  const controller = createEnvironmentAdapterCheckpointController({ manifest, hostExecute: async (request) => { calls += 1; return { invocationFingerprint: request.invocationFingerprint, status: "completed", observations: [{ checkId: "NODE", status: "pass", value: "24.0.0" }], nativeEvidence: [ref("ADAPTER-EVIDENCE")], diagnostics: [], fixture: true }; }, checkpoints: { async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("overwrite"); values.set(key, value); } } });
  const request = createEnvironmentAdapterInvocation({ invocationId: "ADAPTER-REGRESSION", selection, request: { repository }, configurationDigest: D("config") });
  const first = await controller.execute(request);
  const replay = await controller.execute(request);
  assert.equal(first.hostCalls, 1);
  assert.equal(replay.hostCalls, 0);
  assert.equal(calls, 1);
  await assert.rejects(() => controller.execute({ ...request, configurationDigest: D("changed") }), /fingerprint drifted/u);
});

test("EP performance telemetry covers cycle, tests, retries, cache, files, receipts, tokens, tools, and waits without workflow authority", () => {
  const provenance = ["execution-receipt:EP-REGRESSION-001"];
  const measured = (metric, value) => ({ metric, disposition: "measured", value, provenance });
  const attachment = recordLocalPerformanceMetrics({
    executionId: "EP-REGRESSION-001",
    observations: [
      measured("cacheHits", 2),
      measured("changedFiles", 5),
      measured("cycleDurationMilliseconds", 1250),
      measured("receiptBytes", 4096),
      measured("retries", 0),
      measured("testDurationMilliseconds", 900),
      measured("tokenUsage", 0),
      measured("toolCalls", 7),
      measured("waitDurationMilliseconds", 10),
    ],
    selfOverheadMilliseconds: 3,
  });
  assert.equal(verifyLocalPerformanceMetrics(attachment), true);
  assert.equal(attachment.authority, "non-authoritative-observation");
  assert.equal(attachment.exportPolicy, "local-only");
  assert.equal(attachment.metrics.every(({ disposition }) => disposition === "measured"), true);
});

test("telemetry tampering and provider secret output remain closed failures", async () => {
  const attachment = recordLocalPerformanceMetrics({ executionId: "EP-REGRESSION-002", observations: [], selfOverheadMilliseconds: 0 });
  assert.throws(() => verifyLocalPerformanceMetrics({ ...attachment, attachmentDigest: D("tampered") }), /digest drifted/u);
  const manifest = defineEnvironmentAdapterManifest({ id: "fixture.secret", version: "1.0.0", capabilities: ["inventory"], permissionDemands: [], offlineDefault: true, configurationSchemaDigest: D("schema") });
  const selection = selectEnvironmentAdapter({ catalog: [manifest], configuredAdapterId: manifest.id, capability: "inventory", hostGrants: [] });
  const invocation = createEnvironmentAdapterInvocation({ invocationId: "SECRET", selection, request: {}, configurationDigest: D("config") });
  const controller = createEnvironmentAdapterCheckpointController({ manifest, hostExecute: async () => ({ invocationFingerprint: invocation.invocationFingerprint, status: "completed", observations: [{ token: "leak" }], nativeEvidence: [], diagnostics: [], fixture: true }), checkpoints: { async get() {}, async put() {} } });
  await assert.rejects(() => controller.execute(invocation), /secret|sensitive|token/u);
});

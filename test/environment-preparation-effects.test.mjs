import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  createEnvironmentEffectCoordinator,
  createEnvironmentRemediationApproval,
  createEnvironmentRemediationPlan,
  createInMemoryEnvironmentEffectCheckpointStore,
  EnvironmentPreparationEffectError,
} from "../src/environment-preparation-effects.mjs";
import {
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  resolveEnvironmentProfileSet,
} from "../src/environment-preparation-profile-inventory.mjs";

const D = (value) => canonicalJsonDigest(value);
const ref = (id, digest = D(id)) => ({ artifactId: id, schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`, mediaType: "application/json", digest, uri: `memory://fixture/${id}` });
const repository = ref("REPOSITORY");
const sourceRefs = [{ role: "approved-work-item", artifact: ref("WI-EP-PREPARATION-EFFECTS") }];
const check = (id, capability, required = true) => ({ id, capability, required, observationKind: "filesystem", constraint: "present", freshnessSeconds: 300 });

function context({ pathExists = () => false, required = true } = {}) {
  const profileSet = resolveEnvironmentProfileSet({
    profileSetId: "EPS-EFFECT",
    version: "1.0.0",
    repository,
    hostProfile: { id: "HOST", layer: "devrelay-host", name: "host", checks: [{ id: "OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds: 300 }] },
    projectProfiles: [{ id: "PROJECT", layer: "project-target", name: "project", checks: [check("CONFIG", "config/devrelay.json", required), check("CACHE", ".devrelay/cache", false)] }],
    sourceRefs,
  });
  const host = createNativeWindowsEnvironmentHost({ platform: "win32", architecture: "x64", repositoryRoot: process.cwd(), pathExists, maturity: "fixture-conformant" });
  const result = createNativeWindowsEnvironmentInventory({ inventoryId: "INV-EFFECT", profileSet, repository, host, observedAt: "2026-08-21T12:00:00.000Z", sourceRefs });
  return { profileSet, inventory: result.inventory };
}

const projectGrant = { kind: "filesystem.write", scope: "project:config/devrelay.json", purpose: "Create the missing project-local DevRelay configuration." };
const networkGrant = { kind: "network.connect", scope: "registry.npmjs.org:443", purpose: "Acquire the pinned project-local tool." };
const catalog = [{
  checkId: "CONFIG",
  effectId: "CREATE-CONFIG",
  effect: {
    capability: "configure",
    scope: "project-local",
    description: "Create project-local DevRelay configuration.",
    impact: "Writes one declared project file.",
    grants: [projectGrant],
    rollback: { supported: true, procedure: "Remove the created file or restore its exact prior bytes." },
    requiredEvidence: ["environment-preparation/file-change"],
  },
}];

const evidence = (id) => ref(id);
const adapter = (overrides = {}) => ({
  id: "fixture.environment-effect",
  version: "1.0.0",
  async apply(_effect, { currentFingerprint }) {
    return { outcome: "applied", beforeFingerprint: currentFingerprint, afterFingerprint: D("after"), durationMs: 1, rollbackState: "available", evidence: [evidence("APPLY")], diagnostics: [] };
  },
  ...overrides,
});

function planFixture(options = {}) {
  const { profileSet, inventory } = context(options);
  const plan = createEnvironmentRemediationPlan({ planId: "PLAN-EP-001", profileSet, inventory, effectCatalog: catalog, sourceRefs });
  return { profileSet, inventory, plan, approval: createEnvironmentRemediationApproval({ approvalId: "APPROVE-EP-001", plan }) };
}

test("planner converts all required gaps into one ordered approval wave", () => {
  const { plan } = planFixture();
  assert.equal(plan.effects.length, 1);
  assert.equal(plan.effects[0].id, "CREATE-CONFIG");
  assert.equal(plan.approvalRequired, true);
  assert.deepEqual(plan.effects[0].grants, [projectGrant]);
  assert.equal(plan.diagnostics.length, 0);
  const again = planFixture().plan;
  assert.equal(plan.effects[0].idempotencyKey, again.effects[0].idempotencyKey);
});

test("optional gaps do not demand remediation and uncovered required gaps are explicit", () => {
  const { profileSet, inventory } = context();
  const uncovered = createEnvironmentRemediationPlan({ planId: "UNAVAILABLE", profileSet, inventory, effectCatalog: [], sourceRefs });
  assert.equal(uncovered.effects.length, 0);
  assert.equal(uncovered.approvalRequired, false);
  assert.deepEqual(uncovered.diagnostics.map(({ checkId }) => checkId), ["CONFIG"]);
  const satisfied = context({ pathExists: () => true });
  const empty = createEnvironmentRemediationPlan({ planId: "SATISFIED", ...satisfied, effectCatalog: catalog, sourceRefs });
  assert.equal(empty.effects.length, 0);
  assert.equal(empty.diagnostics.length, 0);
});

test("approval binds the exact plan, effects, grants, and separate machine-global consent", () => {
  const { plan } = planFixture();
  const approval = createEnvironmentRemediationApproval({ approvalId: "APPROVAL", plan });
  assert.deepEqual(approval.approvedEffects[0].grants, plan.effects[0].grants);
  assert.throws(() => createEnvironmentRemediationApproval({ approvalId: "BAD", plan, approvedEffectIds: ["OTHER"] }), EnvironmentPreparationEffectError);
  const globalCatalog = [{ ...catalog[0], effect: { ...catalog[0].effect, scope: "machine-global", grants: [projectGrant], rollback: { supported: true, procedure: "Restore the machine setting." } } }];
  const base = context();
  const globalPlan = createEnvironmentRemediationPlan({ planId: "GLOBAL", ...base, effectCatalog: globalCatalog, sourceRefs });
  const noGlobalConsent = createEnvironmentRemediationApproval({ approvalId: "GLOBAL-BASE", plan: globalPlan });
  const coordinator = createEnvironmentEffectCoordinator({ adapter: adapter(), checkpoints: createInMemoryEnvironmentEffectCheckpointStore() });
  assert.rejects(() => coordinator.execute({ plan: globalPlan, effectId: "CREATE-CONFIG", approval: noGlobalConsent, hostGrants: [projectGrant], currentFingerprint: globalPlan.baseFingerprint }), /lacks separate approval/);
});

test("approved project-local effect executes once and exact replay performs zero effects", async () => {
  const { plan, approval } = planFixture();
  let calls = 0;
  const coordinator = createEnvironmentEffectCoordinator({ adapter: adapter({ async apply(effect, state) { calls += 1; return adapter().apply(effect, state); } }), checkpoints: createInMemoryEnvironmentEffectCheckpointStore() });
  const request = { plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint };
  const first = await coordinator.execute(request);
  const replay = await coordinator.execute(request);
  assert.equal(first.receipt.outcome, "applied");
  assert.equal(first.effectCalls, 1);
  assert.equal(replay.replayed, true);
  assert.equal(replay.effectCalls, 0);
  assert.equal(calls, 1);
  assert.deepEqual(first.receipt, replay.receipt);
});

test("grant escalation, undeclared network, stale fingerprint, and approval drift fail before effects", async () => {
  const { plan, approval } = planFixture();
  let calls = 0;
  const coordinator = createEnvironmentEffectCoordinator({ adapter: adapter({ async apply() { calls += 1; throw new Error("must not run"); } }), checkpoints: createInMemoryEnvironmentEffectCheckpointStore() });
  await assert.rejects(() => coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant, networkGrant], currentFingerprint: plan.baseFingerprint }), /host grants differ/);
  await assert.rejects(() => coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: D("drift") }), /fingerprint drifted/);
  await assert.rejects(() => coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval: { ...approval, approvalDigest: D("tamper") }, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint }), /approval digest drifted/);
  assert.equal(calls, 0);
});

test("mutating failure is rolled back and the receipt proves exact restoration", async () => {
  const { plan, approval } = planFixture();
  let rollbackCalls = 0;
  const coordinator = createEnvironmentEffectCoordinator({
    adapter: adapter({
      async apply(_effect, { currentFingerprint }) { return { outcome: "failed", beforeFingerprint: currentFingerprint, afterFingerprint: D("partial"), durationMs: 3, rollbackState: "available", evidence: [evidence("PARTIAL")], diagnostics: [{ code: "FIXTURE", severity: "error", message: "partial failure" }] }; },
      async rollback(_effect, raw) { rollbackCalls += 1; return { outcome: "completed", afterFingerprint: raw.beforeFingerprint, evidence: [evidence("ROLLBACK")], diagnostics: [] }; },
    }),
    checkpoints: createInMemoryEnvironmentEffectCheckpointStore(),
  });
  const result = await coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint });
  assert.equal(result.receipt.outcome, "rolled-back");
  assert.equal(result.receipt.rollbackState, "completed");
  assert.equal(result.receipt.afterFingerprint, plan.baseFingerprint);
  assert.equal(rollbackCalls, 1);
});

test("adapter exceptions produce a closed failed receipt without replaying the effect", async () => {
  const { plan, approval } = planFixture();
  const coordinator = createEnvironmentEffectCoordinator({ adapter: adapter({ async apply() { throw new Error("provider failed"); } }), checkpoints: createInMemoryEnvironmentEffectCheckpointStore() });
  const result = await coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint });
  assert.equal(result.receipt.outcome, "failed");
  assert.equal(result.receipt.beforeFingerprint, result.receipt.afterFingerprint);
  assert.ok(result.receipt.diagnostics.length > 0);
});

test("secret-bearing adapter output is rejected before it becomes evidence", async () => {
  const { plan, approval } = planFixture();
  const coordinator = createEnvironmentEffectCoordinator({ adapter: adapter({ async apply() { return { outcome: "applied", beforeFingerprint: plan.baseFingerprint, afterFingerprint: D("after"), durationMs: 1, evidence: [evidence("BAD")], diagnostics: [], token: "secret-value" }; } }), checkpoints: createInMemoryEnvironmentEffectCheckpointStore() });
  await assert.rejects(() => coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint }), /sensitive field token/);
});

test("changed effect invocation cannot reuse an immutable checkpoint", async () => {
  const { plan, approval } = planFixture();
  const store = createInMemoryEnvironmentEffectCheckpointStore();
  const coordinator = createEnvironmentEffectCoordinator({ adapter: adapter(), checkpoints: store });
  await coordinator.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint });
  const changedAdapter = createEnvironmentEffectCoordinator({ adapter: adapter({ version: "2.0.0" }), checkpoints: store });
  await assert.rejects(() => changedAdapter.execute({ plan, effectId: "CREATE-CONFIG", approval, hostGrants: [projectGrant], currentFingerprint: plan.baseFingerprint }), /checkpoint fingerprint differs/);
});

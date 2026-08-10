import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { authorizeChangeIntegrationEffect } from "../src/change-integration-target-cas.mjs";

const D = `sha256:${"a".repeat(64)}`;
const A = "1".repeat(40);
const B = "2".repeat(40);
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))),
});
const plan = (targetRef = "refs/heads/main") => seal({
  apiVersion: "devrelay.dev/v1alpha1", kind: "IntegrationPlan", planId: "PLAN",
  subject: { artifactId: "SUB", digest: D }, binding: { artifactId: "BIND", digest: D },
  verifiedChange: { artifactId: "CHANGE", digest: D }, verifiedChangeDigest: D,
  baselines: Object.fromEntries(["requirementsBaseline", "projectOverviewBaseline", "architectureBaseline", "contractDisposition", "workBreakdownBaseline", "workDependencyBaseline", "specialistAssignmentBaseline"].map((name) => [name, { artifactId: name, digest: D }])),
  preState: { ref: targetRef, commit: A, treeDigest: D },
  adapter: { id: "adapter.local", version: "1.0.0", configurationDigest: D },
  permissionDemands: [{ kind: "process.spawn", scope: { values: ["bounded-integrator"] } }],
  transition: { targetRef, expectedTargetCommit: A, sourceCommit: B, strategy: "cherry-pick" },
  integrationPolicy: { artifactId: "POLICY", digest: D }, idempotencyKey: "IDEMPOTENCY",
}, "planDigest");

test("an exact target authorizes one bounded host-atomic callback carrying the expected commit", async () => {
  const calls = [];
  const result = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV", observeTarget: async () => ({ ref: "refs/heads/main", commit: A }), applyAtomicConditionalEffect: async (request) => { calls.push(request); return { terminalState: "integrated" }; } });
  assert.equal(result.outcome, "authorized-effect-result");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedTargetCommit, A);
  assert.equal(calls[0].invocation.operation.transition.expectedTargetCommit, A);
  assert.equal(Object.isFrozen(calls[0]), true);
});

test("Core clones a JSON effect result before freezing and never shares the callback object", async () => {
  const original = { terminalState: "integrated", evidence: { count: 1 } };
  const result = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV-CLONE", observeTarget: async () => ({ ref: "refs/heads/main", commit: A }), applyAtomicConditionalEffect: async () => original });
  assert.equal(result.outcome, "authorized-effect-result");
  assert.notEqual(result.effectResult, original);
  assert.notEqual(result.effectResult.evidence, original.evidence);
  assert.equal(Object.isFrozen(result.effectResult), true);
  assert.equal(Object.isFrozen(result.effectResult.evidence), true);
  original.terminalState = "still-mutable";
  original.evidence.count = 2;
  assert.equal(result.effectResult.terminalState, "integrated");
  assert.equal(result.effectResult.evidence.count, 1);
});

test("stale, rewritten, missing, and deleted refs return drift and invoke no effect", async () => {
  for (const observed of [{ ref: "refs/heads/main", commit: B }, { ref: "refs/heads/other", commit: A }, null, { ref: "refs/heads/main" }]) {
    let calls = 0;
    const result = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV", observeTarget: async () => observed, applyAtomicConditionalEffect: async () => { calls += 1; } });
    assert.equal(result.outcome, "baseline-drift");
    assert.equal(calls, 0);
  }
});

test("concurrent same-target attempts serialize and only the still-exact attempt invokes an effect", async () => {
  let live = A, active = 0, maxActive = 0, effects = 0;
  const invoke = (id) => authorizeChangeIntegrationEffect({
    plan: plan(), invocationId: id,
    observeTarget: async () => ({ ref: "refs/heads/main", commit: live }),
    applyAtomicConditionalEffect: async ({ expectedTargetCommit }) => {
      active += 1; maxActive = Math.max(maxActive, active);
      assert.equal(live, expectedTargetCommit);
      await Promise.resolve(); live = B; effects += 1; active -= 1;
      return { terminalState: "integrated" };
    },
  });
  const results = await Promise.all([invoke("INV-1"), invoke("INV-2")]);
  assert.deepEqual(results.map(({ outcome }) => outcome), ["authorized-effect-result", "baseline-drift"]);
  assert.equal(effects, 1);
  assert.equal(maxActive, 1);
});

test("different target refs do not share a serialization key", async () => {
  let active = 0, maxActive = 0;
  const invoke = (targetRef) => authorizeChangeIntegrationEffect({ plan: plan(targetRef), invocationId: targetRef, observeTarget: async () => ({ ref: targetRef, commit: A }), applyAtomicConditionalEffect: async () => { active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setImmediate(resolve)); active -= 1; return {}; } });
  await Promise.all([invoke("refs/heads/a"), invoke("refs/heads/b")]);
  assert.equal(maxActive, 2);
});

test("a callback rejection after simulated mutation is effect-uncertain and binds the exact invocation", async () => {
  let mutated = false;
  const result = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV-UNCERTAIN", observeTarget: async () => ({ ref: "refs/heads/main", commit: A }), applyAtomicConditionalEffect: async () => { mutated = true; throw new Error("connection lost after transition"); } });
  assert.equal(mutated, true);
  assert.equal(result.outcome, "effect-uncertain");
  assert.equal(result.invocation.invocationId, "INV-UNCERTAIN");
  assert.equal(result.invocation.operation.transition.expectedTargetCommit, A);
  assert.deepEqual(result.diagnostic, { authority: "non-authoritative", code: "ATOMIC_EFFECT_OUTCOME_UNCERTAIN", message: "connection lost after transition" });
  assert.equal(Object.isFrozen(result.invocation), true);
});

test("effect-result normalization failure after callback is effect-uncertain", async () => {
  const cyclic = {}; cyclic.self = cyclic;
  const result = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV-NORMALIZE", observeTarget: async () => ({ ref: "refs/heads/main", commit: A }), applyAtomicConditionalEffect: async () => cyclic });
  assert.equal(result.outcome, "effect-uncertain");
  assert.equal(result.invocation.invocationId, "INV-NORMALIZE");
  assert.equal(result.diagnostic.authority, "non-authoritative");
});

test("only proven pre-effect failures are unable-to-proceed and invoke zero effects", async () => {
  let effects = 0;
  const observation = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV", observeTarget: async () => { throw new Error("offline"); }, applyAtomicConditionalEffect: async () => assert.fail() });
  assert.equal(observation.outcome, "unable-to-proceed");
  let hostCalls = 0;
  const invalid = await authorizeChangeIntegrationEffect({ plan: { ...plan(), planDigest: D }, invocationId: "INV", observeTarget: async () => { hostCalls += 1; }, applyAtomicConditionalEffect: async () => { hostCalls += 1; } });
  assert.equal(invalid.outcome, "unable-to-proceed");
  assert.equal(hostCalls, 0);
  const missingCallback = await authorizeChangeIntegrationEffect({ plan: plan(), invocationId: "INV", observeTarget: async () => ({ ref: "refs/heads/main", commit: A }) });
  assert.equal(missingCallback.outcome, "unable-to-proceed");
  assert.equal(effects, 0);
});

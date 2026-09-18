import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDesktopExecutionCoordinator } from "../src/desktop-execution-coordinator.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";

const revision = "a".repeat(40);
const executor = { id: "chatgpt.desktop", version: "1.0.0", configurationDigest: `sha256:${"b".repeat(64)}`, capabilities: ["node"], grants: ["process.spawn"] };
function fixture(t, inject = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), "devrelay-executor-"));
  const storage = createLocalHostStorage({ rootDirectory: root });
  t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
  let calls = 0;
  let transformArtifact = bytes => bytes;
  const trusted = { ...executor, async execute() { calls += 1; return { outcome: "pass", changes: ["src/a.mjs"] }; } };
  const worktree = { workItemId: "WI-1", revision, observedRevision: revision, status: "active", workspace: path.join(root, "worktree") };
  const worktreeManager = { inspectForDispatch: (attemptId) => ({ attemptId, ...worktree }) };
  const coordinator = createDesktopExecutionCoordinator({ storage: { ...storage, getArtifact(ref) { return transformArtifact(storage.getArtifact(ref)); } }, worktreeManager, executors: { [executor.id]: trusted }, failureInjector: inject });
  const request = { runId: "RUN-1", attemptId: "ATT-1", workItemId: "WI-1", repositoryRevision: revision, executor, requiredCapabilities: ["node"], requiredGrants: ["process.spawn"], idempotencyKey: "IDEMPOTENCY-1" };
  return { coordinator, request, trusted, worktree, transformArtifact(fn) { transformArtifact = fn; }, calls: () => calls };
}
test("records one exact effect and replay never calls the executor again", async (t) => {
  const f = fixture(t); f.coordinator.prepare(f.request);
  assert.equal((await f.coordinator.execute("RUN-1")).outcome, "recorded");
  assert.equal((await f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-1", executor })).outcome, "replayed");
  assert.equal(f.calls(), 1);
});
test("rejects executor, capability, grant, and worktree substitution", (t) => {
  const f = fixture(t);
  assert.throws(() => f.coordinator.prepare({ ...f.request, executor: { ...executor, configurationDigest: `sha256:${"c".repeat(64)}` } }), /substituted/u);
  assert.throws(() => f.coordinator.prepare({ ...f.request, requiredCapabilities: ["python"] }), /coverage/u);
  assert.throws(() => f.coordinator.prepare({ ...f.request, requiredGrants: ["network.connect"] }), /coverage/u);
  assert.throws(() => f.coordinator.prepare({ ...f.request, workItemId: "WI-OTHER" }), /worktree/u);
});

test("recorded effect replay rejects substituted receipt envelope without another executor call", async t => {
  const f = fixture(t);
  f.coordinator.prepare(f.request);
  await f.coordinator.execute("RUN-1");
  for (const changes of [{ bindingDigest: "wrong" }, { idempotencyKey: "other" }, { extra: true }]) {
    f.transformArtifact(bytes => Buffer.from(JSON.stringify({ ...JSON.parse(bytes), ...changes })));
    await assert.rejects(() => f.coordinator.execute("RUN-1"), /receipt binding differs/);
    assert.equal(f.calls(), 1);
  }
  f.transformArtifact(bytes => bytes);
  assert.equal((await f.coordinator.execute("RUN-1")).outcome, "replayed");
  assert.equal(f.calls(), 1);
});
test("crash after effect leaves an uncertain run quarantined and never blindly retries", async (t) => {
  const f = fixture(t, ({ boundary }) => { if (boundary === "after-effect") throw new Error("crash"); });
  f.coordinator.prepare(f.request);
  await assert.rejects(() => f.coordinator.execute("RUN-1"), /crash/u);
  const resumed = await f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-1", executor });
  assert.equal(resumed.outcome, "quarantined");
  assert.equal(f.calls(), 1);
});
test("exact external receipt reconciles uncertain effect without executor replay", async (t) => {
  const f = fixture(t, ({ boundary }) => { if (boundary === "after-effect") throw new Error("crash"); });
  const prepared = f.coordinator.prepare(f.request);
  await assert.rejects(() => f.coordinator.execute("RUN-1"));
  const reconciled = f.coordinator.reconcile({ runId: "RUN-1", receiptResult: { idempotencyKey: "IDEMPOTENCY-1", bindingDigest: prepared.bindingDigest, result: { outcome: "pass" } } });
  assert.equal(reconciled.outcome, "recorded");
  assert.equal((await f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-1", executor })).outcome, "replayed");
  assert.equal(f.calls(), 1);
});
test("missing or mismatched reconciliation evidence fails closed", async (t) => {
  const f = fixture(t, ({ boundary }) => { if (boundary === "after-effect-state") throw new Error("crash"); });
  f.coordinator.prepare(f.request);
  await assert.rejects(() => f.coordinator.execute("RUN-1"));
  assert.equal(f.coordinator.inspect("RUN-1").lease, null, "caught checkpoint failure must release its host lease");
  assert.throws(() => f.coordinator.reconcile({ runId: "RUN-1", receiptResult: { idempotencyKey: "OTHER", bindingDigest: "bad" } }), /missing or substituted/u);
});
test("resume rejects a substituted work item or executor binding", async (t) => {
  const f = fixture(t); f.coordinator.prepare(f.request);
  await assert.rejects(() => f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-OTHER", executor }), /substituted/u);
  await assert.rejects(() => f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-1", executor: { ...executor, version: "other" } }), /substituted/u);
});

test("execution rechecks grants, capabilities and worktree binding before authorizing an effect", async t => {
  const f = fixture(t);
  f.coordinator.prepare(f.request);
  const initial = f.coordinator.inspect("RUN-1");
  for (const key of ["grants", "capabilities"]) {
    const original = f.trusted[key];
    f.trusted[key] = [];
    await assert.rejects(() => f.coordinator.execute("RUN-1"), /coverage/);
    f.trusted[key] = original;
    assert.deepEqual(f.coordinator.inspect("RUN-1"), initial);
  }
  const workspace = f.worktree.workspace;
  f.worktree.workspace = path.join(workspace, "substituted");
  await assert.rejects(() => f.coordinator.execute("RUN-1"), /binding drifted/);
  f.worktree.workspace = workspace;
  f.worktree.observedRevision = "c".repeat(40);
  await assert.rejects(() => f.coordinator.execute("RUN-1"), /worktree binding/);
  f.worktree.observedRevision = revision;
  f.worktree.revision = "c".repeat(40);
  await assert.rejects(() => f.coordinator.execute("RUN-1"), /worktree binding/);
  assert.deepEqual(f.coordinator.inspect("RUN-1"), initial);
  assert.equal(f.calls(), 0);
});

test("external operator handoff persists intent and never invokes the registered executor", async t => {
  const f = fixture(t);
  f.coordinator.prepare(f.request);
  const handoff = f.coordinator.beginExternal("RUN-1");
  assert.equal(handoff.outcome, "operator-action-required");
  assert.equal(handoff.request.kind, "DesktopExternalExecutionRequest");
  assert.equal(handoff.request.repeatAllowed, false);
  assert.equal(handoff.request.execution.idempotencyKey, f.request.idempotencyKey);
  const reserved = f.coordinator.inspect("RUN-1");
  assert.deepEqual(reserved.checkpointRef, handoff.requestRef);
  assert.equal(reserved.lease, null);
  assert.equal(f.coordinator.beginExternal("RUN-1").outcome, "quarantined");
  assert.equal((await f.coordinator.execute("RUN-1")).outcome, "quarantined");
  assert.deepEqual(f.coordinator.inspect("RUN-1"), reserved);
  f.coordinator.reconcile({ runId: "RUN-1", receiptResult: { bindingDigest: handoff.request.execution.bindingDigest,
    idempotencyKey: f.request.idempotencyKey, result: { taskId: "EXTERNAL-TASK" } } });
  assert.deepEqual((await f.coordinator.execute("RUN-1")).result, { taskId: "EXTERNAL-TASK" });
  assert.equal(f.calls(), 0);
});

test("lost operator handoff response leaves uncertainty without repeating intent or executor calls", async t => {
  const f = fixture(t, ({ boundary }) => { if (boundary === "after-external-request") throw new Error("lost handoff response"); });
  f.coordinator.prepare(f.request);
  assert.throws(() => f.coordinator.beginExternal("RUN-1"), /lost handoff response/);
  const persisted = f.coordinator.inspect("RUN-1");
  assert.equal(persisted.state.phase, "effect-started");
  assert.equal(persisted.lease, null);
  assert.equal(f.coordinator.beginExternal("RUN-1").outcome, "quarantined");
  assert.equal((await f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-1", executor })).outcome, "quarantined");
  assert.deepEqual(f.coordinator.inspect("RUN-1"), persisted);
  assert.equal(f.calls(), 0);
});

for (const interruptedAt of ["after-effect-state", "after-effect", "after-artifact", "after-recorded"]) {
  test(`controlled expiry at ${interruptedAt} preserves successor ownership and reopens without duplicate effects`, async t => {
    const rootDirectory = mkdtempSync(path.join(tmpdir(), "devrelay-expired-executor-"));
    let now = 1000, calls = 0, successor;
    let storage = createLocalHostStorage({ rootDirectory, clock: () => now });
    t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
    const worktreeManager = { inspectForDispatch: attemptId => ({ attemptId, workItemId: "WI-1", revision,
      observedRevision: revision, status: "active", workspace: path.join(rootDirectory, "worktree") }) };
    const executors = { [executor.id]: { ...executor, async execute() { calls++; return { taskId: "native-task" }; } } };
    const coordinator = createDesktopExecutionCoordinator({ storage, worktreeManager, executors,
      failureInjector({ boundary, runId }) {
        if (boundary !== interruptedAt) return;
        now += 30_000;
        successor = storage.acquireLease({ runId, owner: "successor", expectedVersion: storage.readRun(runId).version });
      } });
    const request = { runId: "run", attemptId: "ATT-1", workItemId: "WI-1", repositoryRevision: revision,
      executor, requiredCapabilities: ["node"], requiredGrants: ["process.spawn"], idempotencyKey: "logical-effect" };
    const prepared = coordinator.prepare(request);
    await assert.rejects(coordinator.execute("run"), { code: "DR4924" });
    const expectedCalls = interruptedAt === "after-effect-state" ? 0 : 1;
    assert.equal(calls, expectedCalls);
    assert.deepEqual(storage.readRun("run").lease, successor);
    storage.close();
    storage = createLocalHostStorage({ rootDirectory, clock: () => now });
    const reopened = createDesktopExecutionCoordinator({ storage, worktreeManager, executors });
    const replay = await reopened.execute("run");
    assert.equal(replay.outcome, interruptedAt === "after-recorded" ? "replayed" : "quarantined");
    assert.equal(replay.executorCalls, 0);
    assert.equal(calls, expectedCalls);
    if (expectedCalls === 1 && interruptedAt !== "after-recorded") {
      storage.releaseLease({ runId: "run", leaseToken: successor.token });
      reopened.reconcile({ runId: "run", receiptResult: { idempotencyKey: request.idempotencyKey,
        bindingDigest: prepared.bindingDigest, result: { taskId: "native-task" } } });
      assert.equal((await reopened.execute("run")).outcome, "replayed");
    }
    assert.equal(calls, expectedCalls);
    assert.equal(storage.readTransitionJournal("run").filter(row =>
      ["record-effect", "reconcile-effect"].includes(row.transition.operation)).length, expectedCalls);
  });
}

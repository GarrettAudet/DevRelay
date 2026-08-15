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
  const trusted = { ...executor, async execute() { calls += 1; return { outcome: "pass", changes: ["src/a.mjs"] }; } };
  const worktreeManager = { inspect: (attemptId) => ({ attemptId, workItemId: "WI-1", revision, workspace: path.join(root, "worktree") }) };
  const coordinator = createDesktopExecutionCoordinator({ storage, worktreeManager, executors: { [executor.id]: trusted }, failureInjector: inject });
  const request = { runId: "RUN-1", attemptId: "ATT-1", workItemId: "WI-1", repositoryRevision: revision, executor, requiredCapabilities: ["node"], requiredGrants: ["process.spawn"], idempotencyKey: "IDEMPOTENCY-1" };
  return { coordinator, request, calls: () => calls };
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
  assert.throws(() => f.coordinator.reconcile({ runId: "RUN-1", receiptResult: { idempotencyKey: "OTHER", bindingDigest: "bad" } }), /missing or substituted/u);
});
test("resume rejects a substituted work item or executor binding", async (t) => {
  const f = fixture(t); f.coordinator.prepare(f.request);
  await assert.rejects(() => f.coordinator.resume({ runId: "RUN-1", workItemId: "WI-OTHER", executor }), /substituted/u);
});

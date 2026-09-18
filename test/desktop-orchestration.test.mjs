import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../src/desktop-project-memory-bootstrap.mjs";
import { createDesktopMemoryJournal } from "../src/desktop-memory-journal.mjs";
import { validateDesktopOrchestrationArtifact } from "../src/desktop-orchestration-artifact-validator.mjs";
import { createDesktopOperatorSnapshot, renderDesktopOperatorSnapshot } from "../src/desktop-operator-view.mjs";
import { createDesktopOrchestrationPlan, createDesktopOrchestrationRuntime, deriveDesktopReadyFrontier } from "../src/desktop-orchestration.mjs";
import { evaluateDesktopMergeReadiness, resolveDesktopReviewRequirement } from "../src/desktop-review-policy.mjs";
import { createDesktopTaskAdapter, createDesktopTaskPlan, revalidateDesktopTaskPlan } from "../src/desktop-task-adapter.mjs";
import { createDurableGitWorktreeManager } from "../src/durable-worktree-manager.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";

const REVISION = "a".repeat(40);
const DIGEST = `sha256:${"b".repeat(64)}`;
const ref = (artifactId, digest = DIGEST) => ({ artifactId, digest, schema: "https://devrelay.dev/test/v1", mediaType: "application/json", uri: `memory://test/${artifactId}` });
const sourceRoot = path.resolve(new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const memoryBootstrap = (taskId = "ATT-A", revision = REVISION) => loadDesktopProjectMemoryBootstrap({ projectRoot: sourceRoot, taskId, repositoryRevision: revision });
const currentMemoryBaselineId = JSON.parse(readFileSync(path.join(sourceRoot, "project", "project-memory-baseline.json"), "utf8")).baselineId;
const orchestrationPlan = () => createDesktopOrchestrationPlan({
  runId: "RUN-DO-1",
  projectId: "devrelay",
  horizonDigest: DIGEST,
  startingRevision: REVISION,
  maxConcurrency: 2,
  workItems: [
    { id: "WI-A", dependencies: [] },
    { id: "WI-B", dependencies: [] },
    { id: "WI-C", dependencies: ["WI-A", "WI-B"] },
  ],
});

function storageFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "devrelay-desktop-orchestration-"));
  const storage = createLocalHostStorage({ rootDirectory: path.join(root, "state") });
  t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, storage };
}

test("frontier scheduling is deterministic, concurrency-bounded, and dependency-safe", () => {
  const plan = orchestrationPlan();
  assert.equal(validateDesktopOrchestrationArtifact(plan), plan);
  assert.deepEqual(deriveDesktopReadyFrontier({ plan }).workItemIds, ["WI-A", "WI-B"]);
  const state = { "WI-A": { status: "integrated" }, "WI-B": { status: "running" }, "WI-C": { status: "pending" } };
  assert.deepEqual(deriveDesktopReadyFrontier({ plan, workState: state }).workItemIds, []);
  state["WI-B"].status = "integrated";
  assert.deepEqual(deriveDesktopReadyFrontier({ plan, workState: state }).workItemIds, ["WI-C"]);
  assert.throws(() => createDesktopOrchestrationPlan({ ...plan, workItems: [{ id: "A", dependencies: ["B"] }, { id: "B", dependencies: ["A"] }] }), /cycle/u);
});

test("orchestration state survives restart and quarantines uncertain external work", (t) => {
  const fx = storageFixture(t);
  const runtime = createDesktopOrchestrationRuntime({ storage: fx.storage });
  runtime.initialize(orchestrationPlan());
  runtime.record("RUN-DO-1", { workItemId: "WI-A", status: "prepared" });
  assert.throws(() => runtime.record("RUN-DO-1", { workItemId: "WI-A", status: "integrated", receipt: {} }), /invalid work transition/u);
  runtime.record("RUN-DO-1", { workItemId: "WI-A", status: "dispatched", receipt: { taskId: "TASK-A" } });
  assert.equal(runtime.recover("RUN-DO-1").outcome, "reconciliation-required");
  assert.deepEqual(runtime.recover("RUN-DO-1").uncertainWorkItemIds, ["WI-A"]);
  fx.storage.close();
  const reopened = createLocalHostStorage({ rootDirectory: path.join(fx.root, "state") });
  const resumed = createDesktopOrchestrationRuntime({ storage: reopened });
  assert.equal(resumed.inspect("RUN-DO-1").state.workState["WI-A"].receipts[0].taskId, "TASK-A");
  resumed.quarantine("RUN-DO-1", { workItemId: "WI-A", reason: "host-receipt-required" });
  assert.equal(resumed.recover("RUN-DO-1").outcome, "recovered");
  reopened.close();
});

test("Desktop task adapter binds every observation and exact memory context to one immutable plan with no authority", async () => {
  const lease = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorktreeLease", attemptId: "ATT-A", runId: "RUN-DO-1", workItemId: "WI-A", revision: REVISION, workspace: "C:/worktrees/ATT-A", status: "active", cleanupDisposition: "retain" };
  const plan = createDesktopTaskPlan({
    runId: "RUN-DO-1", workItem: { id: "WI-A" }, projectId: "devrelay", startingRevision: REVISION,
    worktreeLease: lease, assignment: { specialistId: "implementation" }, executor: { id: "chatgpt.desktop" },
    grants: [{ kind: "filesystem.write", scope: "C:/worktrees/ATT-A" }], promptArtifact: ref("PROMPT-A"), memoryBootstrap: memoryBootstrap(),
  });
  const handlers = Object.fromEntries(["create", "inspect", "wait", "message", "handoff"].map((name) => [name, async ({ taskId }) => ({ taskId: name === "inspect" ? "TASK-OTHER" : taskId ?? "TASK-A", status: name === "create" ? "ready" : "running" })]));
  const adapter = createDesktopTaskAdapter({ providerId: "chatgpt.desktop", providerVersion: "1.0.0", handlers });
  const receipt = await adapter.invoke("create", { plan });
  assert.equal(receipt.taskId, "TASK-A");
  assert.equal(receipt.authority, "observation-only");
  assert.equal(plan.memoryContext.projectMemoryBaseline.artifactId, currentMemoryBaselineId);
  const staleBody = { ...structuredClone(plan), memoryContext: { ...plan.memoryContext, projectMemoryBaseline: ref("STALE") } };
  staleBody.memoryContextDigest = canonicalJsonDigest(staleBody.memoryContext);
  delete staleBody.planDigest;
  const resealedStalePlan = { ...staleBody, planDigest: canonicalJsonDigest(staleBody) };
  assert.equal(validateDesktopOrchestrationArtifact(resealedStalePlan), resealedStalePlan);
  assert.throws(() => revalidateDesktopTaskPlan({ plan: resealedStalePlan, memoryBootstrap: memoryBootstrap() }), /exact prepared ProjectMemory bootstrap/u);
  await assert.rejects(() => adapter.invoke("create", { plan: resealedStalePlan }), /prepared or revalidated/u);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-DO-1", workItem: { id: "WI-A" }, projectId: "devrelay", startingRevision: REVISION, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: ref("PROMPT-A"), memoryBootstrap: structuredClone(memoryBootstrap()) }), /not prepared by the exact loader/u);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-DO-1", workItem: { id: "WI-A" }, projectId: "devrelay", startingRevision: REVISION, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: ref("PROMPT-A"), memoryBootstrap: memoryBootstrap("ATT-A", "d".repeat(40)) }), /revision drifted/u);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-DO-1", workItem: { id: "WI-A" }, projectId: "devrelay", startingRevision: REVISION, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: ref("PROMPT-A"), memoryBootstrap: memoryBootstrap("ATT-OTHER") }), /task or attempt identity drifted/u);
  assert.throws(() => revalidateDesktopTaskPlan({ plan: structuredClone(plan), memoryBootstrap: memoryBootstrap("ATT-OTHER") }), /task or attempt identity drifted/u);
  for (const changes of [{ runId: "RUN-OTHER" }, { revision: "d".repeat(40) }, { status: "quarantined" }, { attemptId: "ATT-OTHER" }]) {
    const changedLease = { ...lease, ...changes };
    if (!changes.attemptId) assert.throws(() => createDesktopTaskPlan({ ...plan, workItem: { id: plan.workItemId },
      worktreeLease: changedLease, memoryBootstrap: memoryBootstrap() }), /worktree.*(disagree|active)|active worktree/);
    const { planDigest, ...body } = structuredClone(plan);
    body.worktreeLease = changedLease;
    const substituted = { ...body, planDigest: canonicalJsonDigest(body) };
    assert.throws(() => revalidateDesktopTaskPlan({ plan: substituted, memoryBootstrap: memoryBootstrap() }), /worktree.*(disagree|active)|active worktree/);
  }
  const revalidated = revalidateDesktopTaskPlan({ plan: structuredClone(plan), memoryBootstrap: memoryBootstrap() });
  assert.equal((await adapter.invoke("create", { plan: revalidated })).taskId, "TASK-A");
  assert.deepEqual(adapter.authority, { gates: false, readiness: false, graph: false, verification: false, integration: false });
  await assert.rejects(() => adapter.invoke("inspect", { plan, taskId: "TASK-X" }), /substituted/u);
});

test("task plan storage survives restart and rejects rebinding without advancing the journal", async t => {
  const fx = storageFixture(t);
  const runtime = createDesktopOrchestrationRuntime({ storage: fx.storage });
  runtime.initialize(orchestrationPlan());
  const bootstrap = memoryBootstrap();
  const makePlan = (promptArtifact = ref("PROMPT-A")) => createDesktopTaskPlan({ runId: "RUN-DO-1", workItem: { id: "WI-A" },
    projectId: "devrelay", startingRevision: REVISION,
    worktreeLease: { apiVersion: "devrelay.dev/v1alpha1", kind: "WorktreeLease", attemptId: "ATT-A", runId: "RUN-DO-1",
      workItemId: "WI-A", revision: REVISION, workspace: "C:/worktrees/ATT-A", status: "active", cleanupDisposition: "retain" },
    assignment: { specialistId: "implementation" }, executor: { id: "chatgpt.desktop-fixture" }, promptArtifact, memoryBootstrap: bootstrap });
  const plan = makePlan();
  runtime.prepareTask({ plan, memoryBootstrap: bootstrap });
  const saved = runtime.inspect("RUN-DO-1");
  assert.equal(saved.state.workState["WI-A"].status, "prepared");
  assert.throws(() => runtime.record("RUN-DO-1", { workItemId: "WI-A", status: "dispatched", receipt: {} }), /reserved dispatch receipt/);
  assert.deepEqual(runtime.prepareTask({ plan, memoryBootstrap: bootstrap }), saved);
  assert.throws(() => runtime.prepareTask({ plan: makePlan(ref("OTHER-PROMPT", canonicalJsonDigest({ other: true }))), memoryBootstrap: bootstrap }), /another task plan/);
  assert.deepEqual(runtime.inspect("RUN-DO-1"), saved);
  const provider = { id: "chatgpt.desktop-fixture", version: "1.0.0" };
  assert.throws(() => runtime.reserveTaskDispatch({ plan, memoryBootstrap: bootstrap, provider: { ...provider, id: "other" } }), /provider differs/);
  runtime.reserveTaskDispatch({ plan, memoryBootstrap: bootstrap, provider });
  const reserved = runtime.inspect("RUN-DO-1");
  let calls = 0;
  const adapter = createDesktopTaskAdapter({ providerId: provider.id, providerVersion: provider.version,
    handlers: Object.fromEntries(["create", "inspect", "wait", "message", "handoff"].map(operation => [operation, async () => {
      calls++;
      assert.equal(runtime.inspect("RUN-DO-1").state.workState["WI-A"].dispatchReservation.status, "reserved");
      return { taskId: "TASK-A", status: "ready" };
    }])) });
  const receipt = await adapter.invoke("create", { plan });
  fx.storage.close();
  const reopened = createLocalHostStorage({ rootDirectory: path.join(fx.root, "state") });
  try {
    const resumed = createDesktopOrchestrationRuntime({ storage: reopened });
    const restored = resumed.loadTaskPlan("RUN-DO-1", { workItemId: "WI-A", memoryBootstrap: memoryBootstrap() });
    assert.deepEqual(restored, plan);
    assert.deepEqual(resumed.prepareTask({ plan: restored, memoryBootstrap: memoryBootstrap() }), reserved);
    assert.throws(() => resumed.loadTaskPlan("RUN-DO-1", { workItemId: "WI-A", memoryBootstrap: memoryBootstrap("ATT-OTHER") }), /task or attempt identity drifted/);
    assert.throws(() => resumed.loadTaskPlan("RUN-DO-1", { workItemId: "WI-B", memoryBootstrap: bootstrap }), /absent/);
    assert.deepEqual(resumed.inspect("RUN-DO-1"), reserved);
    assert.equal(resumed.recover("RUN-DO-1").duplicateEffectsAllowed, false);
    assert.throws(() => resumed.reserveTaskDispatch({ plan: restored, memoryBootstrap: bootstrap, provider }), /reconcile without repeating/);
    const { receiptDigest, ...wrongBody } = receipt;
    wrongBody.provider = { ...provider, version: "other" };
    assert.throws(() => resumed.recordTaskDispatch({ plan: restored, memoryBootstrap: bootstrap,
      receipt: { ...wrongBody, receiptDigest: canonicalJsonDigest(wrongBody) } }), /receipt differs/);
    resumed.recordTaskDispatch({ plan: restored, memoryBootstrap: bootstrap, receipt });
    const recorded = resumed.inspect("RUN-DO-1");
    assert.equal(recorded.state.workState["WI-A"].status, "dispatched");
    assert.deepEqual(resumed.recordTaskDispatch({ plan: restored, memoryBootstrap: bootstrap, receipt }), recorded);
    assert.throws(() => resumed.record("RUN-DO-1", { workItemId: "WI-A", status: "completed", receipt }), /bound provider observation/);
    const { receiptDigest: originalDigest, ...progressBody } = receipt;
    Object.assign(progressBody, { operation: "wait", status: "completed", taskId: "TASK-OTHER" });
    assert.throws(() => resumed.record("RUN-DO-1", { workItemId: "WI-A", status: "completed",
      receipt: { ...progressBody, receiptDigest: canonicalJsonDigest(progressBody) } }), /bound provider observation/);
    assert.equal(resumed.inspect("RUN-DO-1").version, recorded.version);
    progressBody.taskId = receipt.taskId;
    const fixtureProgress = { ...progressBody, receiptDigest: canonicalJsonDigest(progressBody) };
    resumed.record("RUN-DO-1", { workItemId: "WI-A", status: "completed", receipt: fixtureProgress });
    const completedState = resumed.inspect("RUN-DO-1");
    assert.deepEqual(resumed.record("RUN-DO-1", { workItemId: "WI-A", status: "completed", receipt: fixtureProgress }), completedState);
    assert.equal(calls, 1, "reservation recovery and receipt replay never call the provider");
  } finally { reopened.close(); }
});

test("high-risk and cross-cutting changes require independent adversarial review", () => {
  const requirement = resolveDesktopReviewRequirement({ workItemId: "WI-A", subjectDigest: DIGEST, risk: "high", tags: ["cross-cutting"] });
  assert.equal(requirement.adversarialRequired, true);
  assert.equal(evaluateDesktopMergeReadiness({ requirement, implementerTaskId: "TASK-A", testDisposition: "pass", reviewDisposition: "pass" }).outcome, "blocked");
  assert.match(evaluateDesktopMergeReadiness({ requirement, implementerTaskId: "TASK-A", testDisposition: "pass", reviewDisposition: "pass", adversarialReview: { reviewerTaskId: "TASK-A", disposition: "pass" } }).blockers.join(), /self-review/u);
  assert.match(evaluateDesktopMergeReadiness({ requirement, implementerTaskId: "TASK-A", testDisposition: "pass", reviewDisposition: "pass", adversarialReview: { reviewerTaskId: "TASK-REVIEW", subjectDigest: canonicalJsonDigest({ stale: true }), disposition: "pass" } }).blockers.join(), /subject-drift/u);
  assert.equal(evaluateDesktopMergeReadiness({ requirement, implementerTaskId: "TASK-A", testDisposition: "pass", reviewDisposition: "pass", adversarialReview: { reviewerTaskId: "TASK-REVIEW", subjectDigest: DIGEST, disposition: "pass" } }).outcome, "merge-ready");
  assert.equal(evaluateDesktopMergeReadiness({ requirement, implementerTaskId: "TASK-A", testDisposition: "pass", reviewDisposition: "pass", adversarialReview: { reviewerTaskId: "TASK-REVIEW", disposition: "pass" }, conflicts: ["src/a.mjs"] }).conflictDisposition, "owner-review-required");
});

test("worktree configuration rejects implicit current-directory paths before storage access", () => {
  let writes = 0;
  const storage = { initializeRun() { writes++; throw new Error("unexpected storage write"); } };
  const valid = { repositoryPath: path.resolve("fixture-repository"), worktreeRoot: path.resolve("fixture-worktrees"), storage };
  for (const change of [{ repositoryPath: undefined }, { worktreeRoot: undefined },
    { repositoryPath: "relative-repository" }, { worktreeRoot: "relative-worktrees" }, { repositoryPath: "" }]) {
    assert.throws(() => createDurableGitWorktreeManager({ ...valid, ...change }), /absolute repository and worktree paths/);
  }
  assert.equal(writes, 0);
});

test("durable worktree leases recover exact Git state after manager restart", (t) => {
  const fx = storageFixture(t);
  const repository = path.join(fx.root, "repository");
  const worktrees = path.join(fx.root, "worktrees");
  execFileSync("git", ["init", repository], { stdio: "ignore", windowsHide: true });
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", windowsHide: true }).trim();
  git("config", "user.name", "DevRelay Test"); git("config", "user.email", "devrelay@invalid"); git("config", "core.autocrlf", "false");
  writeFileSync(path.join(repository, "base.txt"), "base\n"); git("add", "base.txt"); git("commit", "-m", "base");
  const revision = git("rev-parse", "HEAD");
  const first = createDurableGitWorktreeManager({ repositoryPath: repository, worktreeRoot: worktrees, storage: fx.storage });
  assert.equal(first.allocate({ attemptId: "ATT-1", runId: "RUN-1", workItemId: "WI-1", revision }).status, "active");
  const beforeDispatch = fx.storage.readRun("worktree-lease:ATT-1");
  const readyWorkspace = first.inspectForDispatch("ATT-1");
  assert.equal(readyWorkspace.observedRevision, revision);
  assert.deepEqual(fx.storage.readRun("worktree-lease:ATT-1"), beforeDispatch);
  writeFileSync(path.join(readyWorkspace.workspace, "base.txt"), "pending changes\n");
  assert.throws(() => first.inspectForDispatch("ATT-1"), /uncommitted or untracked/);
  assert.deepEqual(fx.storage.readRun("worktree-lease:ATT-1"), beforeDispatch);
  writeFileSync(path.join(readyWorkspace.workspace, "base.txt"), "base\n");
  const untracked = path.join(readyWorkspace.workspace, "untracked.txt");
  writeFileSync(untracked, "untracked work\n");
  assert.throws(() => first.inspectForDispatch("ATT-1"), /uncommitted or untracked/);
  assert.equal(readFileSync(untracked, "utf8"), "untracked work\n");
  rmSync(untracked);
  first.bindTask("ATT-1", "TASK-1");
  assert.throws(() => first.inspectForDispatch("ATT-1"), /active unbound worktree/);
  const restarted = createDurableGitWorktreeManager({ repositoryPath: repository, worktreeRoot: worktrees, storage: fx.storage });
  assert.equal(restarted.recover("ATT-1").observedRevision, revision);
  assert.equal(restarted.inspect("ATT-1").taskId, "TASK-1");
  const allocation = { attemptId: "ATT-1", runId: "RUN-1", workItemId: "WI-1", revision };
  const beforeRetry = fx.storage.readRun("worktree-lease:ATT-1");
  assert.equal(restarted.bindTask("ATT-1", "TASK-1").taskId, "TASK-1");
  assert.deepEqual(fx.storage.readRun("worktree-lease:ATT-1"), beforeRetry, "task binding replay must not advance the journal");
  assert.equal(restarted.allocate(allocation).taskId, "TASK-1");
  assert.equal(restarted.allocate({ ...allocation, taskId: "TASK-1" }).observedRevision, revision);
  for (const change of [{ runId: "RUN-OTHER" }, { workItemId: "WI-OTHER" },
    { revision: "f".repeat(40) }, { taskId: "TASK-OTHER" }]) {
    assert.throws(() => restarted.allocate({ ...allocation, ...change }), { code: "DR6131" });
  }
  const otherRoot = createDurableGitWorktreeManager({ repositoryPath: repository,
    worktreeRoot: path.join(fx.root, "other-worktrees"), storage: fx.storage });
  assert.throws(() => otherRoot.allocate(allocation), { code: "DR6131" });
  const otherRepository = path.join(fx.root, "other-repository");
  execFileSync("git", ["init", otherRepository], { stdio: "ignore", windowsHide: true });
  const foreign = createDurableGitWorktreeManager({ repositoryPath: otherRepository, worktreeRoot: worktrees, storage: fx.storage });
  for (const operation of [() => foreign.allocate(allocation), () => foreign.recover("ATT-1"),
    () => foreign.inspect("ATT-1"), () => foreign.bindTask("ATT-1", "TASK-1"),
    () => foreign.dispose("ATT-1", { disposition: "completed" })]) {
    assert.throws(operation, /different repository/);
  }
  assert.deepEqual(fx.storage.readRun("worktree-lease:ATT-1"), beforeRetry, "replays and rejected substitutions must not mutate the lease");
  const workspace = restarted.inspect("ATT-1").workspace;
  writeFileSync(path.join(workspace, "base.txt"), "uncommitted work must survive\n");
  assert.throws(() => restarted.dispose("ATT-1", { disposition: "completed" }));
  assert.equal(readFileSync(path.join(workspace, "base.txt"), "utf8"), "uncommitted work must survive\n");
  assert.deepEqual(fx.storage.readRun("worktree-lease:ATT-1"), beforeRetry);
  writeFileSync(path.join(workspace, "base.txt"), "base\n");
  assert.equal(restarted.dispose("ATT-1", { disposition: "completed" }).status, "disposed");
  assert.throws(() => restarted.inspectForDispatch("ATT-1"), /active unbound worktree/);
  const abandoned = restarted.allocate({ attemptId: "ATT-ABANDONED", runId: "RUN-1", workItemId: "WI-2", revision });
  assert.equal(abandoned.status, "active");
  restarted.dispose("ATT-ABANDONED", { disposition: "abandoned" });
  const disposedState = fx.storage.readRun("worktree-lease:ATT-ABANDONED");
  assert.throws(() => restarted.bindTask("ATT-ABANDONED", "TASK-LATE"), /existing active worktree/);
  assert.deepEqual(fx.storage.readRun("worktree-lease:ATT-ABANDONED"), disposedState);
});

test("automatic memory journal bootstraps exact repository memory and preserves conclusion candidates", (t) => {
  const fx = storageFixture(t);
  const project = path.join(fx.root, "project-root");
  mkdirSync(path.join(project, "project"), { recursive: true });
  const baselineBytes = readFileSync(path.join(sourceRoot, "project", "project-memory-baseline.json"));
  const synopsisBytes = readFileSync(path.join(sourceRoot, "project", "CurrentSynopsis.md"));
  writeFileSync(path.join(project, "project", "project-memory-baseline.json"), baselineBytes);
  writeFileSync(path.join(project, "project", "CurrentSynopsis.md"), synopsisBytes);
  const journal = createDesktopMemoryJournal({ dataDirectory: path.join(fx.root, "plugin-data"), projectRoot: project, clock: () => "2026-09-06T00:00:00.000Z" });
  const started = journal.bootstrap({ sessionId: "SESSION-1", taskId: "TASK-1" });
  assert.equal(started.context.baseline.kind, "ProjectMemoryBaseline");
  journal.checkpoint({ sessionId: "SESSION-1", event: "Stop" });
  const conclusion = journal.conclude({ sessionId: "SESSION-1" });
  assert.equal(conclusion.outcome, "candidate-recorded");
  assert.equal(journal.conclude({ sessionId: "SESSION-1" }).outcome, "replayed");
  const next = journal.bootstrap({ sessionId: "SESSION-2", taskId: "TASK-2" });
  assert.equal(next.pending[0].sessionId, "SESSION-1");
  assert.equal(next.pending[0].conclusion.authority, "candidate-only");
  assert.equal(started.context.synopsisDigest, sha256Digest(synopsisBytes));
});

test("operator view is a deterministic read-only projection", (t) => {
  const fx = storageFixture(t);
  const runtime = createDesktopOrchestrationRuntime({ storage: fx.storage });
  runtime.initialize(orchestrationPlan());
  const snapshot = createDesktopOperatorSnapshot({ orchestrationRun: runtime.inspect("RUN-DO-1") });
  assert.equal(snapshot.lifecycleAuthority, "read-only-projection");
  assert.match(renderDesktopOperatorSnapshot(snapshot), /WI-A: pending/u);
});

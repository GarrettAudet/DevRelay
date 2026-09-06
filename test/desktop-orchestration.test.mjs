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
  assert.equal(plan.memoryContext.projectMemoryBaseline.artifactId, "PMB-MUC-72494822F54536E5");
  const staleBody = { ...structuredClone(plan), memoryContext: { ...plan.memoryContext, projectMemoryBaseline: ref("STALE") } };
  staleBody.memoryContextDigest = canonicalJsonDigest(staleBody.memoryContext);
  delete staleBody.planDigest;
  const resealedStalePlan = { ...staleBody, planDigest: canonicalJsonDigest(staleBody) };
  assert.equal(validateDesktopOrchestrationArtifact(resealedStalePlan), resealedStalePlan);
  assert.throws(() => revalidateDesktopTaskPlan({ plan: resealedStalePlan, memoryBootstrap: memoryBootstrap() }), /exact prepared ProjectMemory bootstrap/u);
  await assert.rejects(() => adapter.invoke("create", { plan: resealedStalePlan }), /prepared or revalidated/u);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-DO-1", workItem: { id: "WI-A" }, projectId: "devrelay", startingRevision: REVISION, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: ref("PROMPT-A"), memoryBootstrap: structuredClone(memoryBootstrap()) }), /not prepared by the exact loader/u);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-DO-1", workItem: { id: "WI-A" }, projectId: "devrelay", startingRevision: REVISION, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: ref("PROMPT-A"), memoryBootstrap: memoryBootstrap("ATT-A", "d".repeat(40)) }), /revision drifted/u);
  const revalidated = revalidateDesktopTaskPlan({ plan: structuredClone(plan), memoryBootstrap: memoryBootstrap() });
  assert.equal((await adapter.invoke("create", { plan: revalidated })).taskId, "TASK-A");
  assert.deepEqual(adapter.authority, { gates: false, readiness: false, graph: false, verification: false, integration: false });
  await assert.rejects(() => adapter.invoke("inspect", { plan, taskId: "TASK-X" }), /substituted/u);
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
  first.bindTask("ATT-1", "TASK-1");
  const restarted = createDurableGitWorktreeManager({ repositoryPath: repository, worktreeRoot: worktrees, storage: fx.storage });
  assert.equal(restarted.recover("ATT-1").observedRevision, revision);
  assert.equal(restarted.inspect("ATT-1").taskId, "TASK-1");
  assert.equal(restarted.dispose("ATT-1", { disposition: "completed" }).status, "disposed");
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

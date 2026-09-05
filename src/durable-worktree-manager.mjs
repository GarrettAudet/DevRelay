import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { canonicalJsonDigest } from "./content-digest.mjs";

export class DurableWorktreeError extends Error {
  constructor(message, code = "DR6130") {
    super(`durable worktree manager: ${message}`);
    this.name = "DurableWorktreeError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DurableWorktreeError(message, code); };
const safeId = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/u.test(value)) fail("attempt identity is unsafe");
  return value;
};
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

export function createDurableGitWorktreeManager({ repositoryPath, worktreeRoot, storage, gitExecutable = "git", owner = "desktop-worktree-manager" } = {}) {
  const repository = path.resolve(repositoryPath ?? "");
  const root = path.resolve(worktreeRoot ?? "");
  if (!inside(path.dirname(repository), repository) || !inside(path.dirname(root), root)) fail("absolute repository and worktree paths are required");
  if (repository === root || inside(repository, root)) fail("worktree root must be outside the source checkout");
  if (!storage || typeof storage.initializeRun !== "function") fail("durable storage is required");
  const git = (...args) => execFileSync(gitExecutable, ["-C", repository, ...args], { encoding: "utf8", windowsHide: true }).trim();
  const idFor = (attemptId) => `worktree-lease:${safeId(attemptId)}`;
  const workspaceFor = (attemptId) => {
    const candidate = path.resolve(root, safeId(attemptId));
    if (!inside(root, candidate)) fail("worktree path escapes configured root");
    return candidate;
  };
  const commit = (run, operation, nextState) => {
    const lease = storage.acquireLease({ runId: run.runId, owner, expectedVersion: run.version });
    try {
      return storage.commitTransition({
        runId: run.runId,
        expectedVersion: run.version,
        leaseToken: lease.token,
        transition: { operation },
        nextState,
        artifactRefs: run.artifactRefs,
      });
    } finally {
      try { storage.releaseLease({ runId: run.runId, leaseToken: lease.token }); } catch {}
    }
  };
  const observedRevision = (workspace) => existsSync(workspace)
    ? execFileSync(gitExecutable, ["-C", workspace, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim()
    : null;
  return Object.freeze({
    allocate({ attemptId, runId, workItemId, revision, taskId = null } = {}) {
      safeId(attemptId);
      for (const [label, value] of Object.entries({ runId, workItemId, revision })) if (typeof value !== "string" || !value) fail(`${label} is required`);
      const workspace = workspaceFor(attemptId);
      const state = {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "WorktreeLease",
        attemptId, runId, workItemId, revision, workspace, taskId,
        status: "prepared",
        cleanupDisposition: "retain",
      };
      let durable;
      try {
        durable = storage.initializeRun({ runId: idFor(attemptId), state });
      } catch (error) {
        if (error?.code !== "DR4922") throw error;
        return this.recover(attemptId);
      }
      try {
        git("rev-parse", "--verify", `${revision}^{commit}`);
        execFileSync(gitExecutable, ["-C", repository, "worktree", "add", "--detach", "--", workspace, revision], { stdio: "pipe", windowsHide: true });
      } catch (error) {
        return commit(durable, "worktree-create-failed", { ...state, status: "quarantined", diagnostic: error.stderr?.toString("utf8").trim() || error.message }).state;
      }
      const active = { ...state, status: "active", observedRevision: observedRevision(workspace) };
      if (active.observedRevision !== revision) return commit(durable, "worktree-revision-drift", { ...active, status: "quarantined" }).state;
      return commit(durable, "worktree-created", active).state;
    },
    inspect(attemptId) {
      const run = storage.readRun(idFor(attemptId));
      const observed = observedRevision(run.state.workspace);
      return Object.freeze({ ...structuredClone(run.state), observedRevision: observed, stateVersion: run.version });
    },
    bindTask(attemptId, taskId) {
      if (typeof taskId !== "string" || !taskId) fail("taskId is required");
      const run = storage.readRun(idFor(attemptId));
      if (run.state.taskId && run.state.taskId !== taskId) fail("task identity is already bound", "DR6131");
      return commit(run, "task-bound", { ...run.state, taskId }).state;
    },
    recover(attemptId) {
      const run = storage.readRun(idFor(attemptId));
      const observed = observedRevision(run.state.workspace);
      if (observed && observed !== run.state.revision) return commit(run, "recovery-revision-drift", { ...run.state, observedRevision: observed, status: "quarantined" }).state;
      if (run.state.status === "prepared" && observed === run.state.revision) return commit(run, "recovered-created-worktree", { ...run.state, observedRevision: observed, status: "active" }).state;
      if (run.state.status === "active" && !observed) return commit(run, "recovery-missing-worktree", { ...run.state, observedRevision: null, status: "quarantined" }).state;
      return Object.freeze({ ...structuredClone(run.state), observedRevision: observed });
    },
    dispose(attemptId, { disposition } = {}) {
      if (!["completed", "abandoned", "quarantined"].includes(disposition)) fail("explicit safe cleanup disposition is required");
      const run = storage.readRun(idFor(attemptId));
      const workspace = run.state.workspace;
      if (!inside(root, workspace)) fail("refusing unsafe worktree cleanup");
      if (existsSync(workspace)) execFileSync(gitExecutable, ["-C", repository, "worktree", "remove", "--force", "--", workspace], { stdio: "pipe", windowsHide: true });
      return commit(run, "worktree-disposed", { ...run.state, status: "disposed", cleanupDisposition: disposition, disposalDigest: canonicalJsonDigest({ attemptId, disposition, workspace }) }).state;
    },
    list() { return storage.listRuns({ prefix: "worktree-lease:" }).map((run) => Object.freeze({ ...structuredClone(run.state), stateVersion: run.version })); },
  });
}

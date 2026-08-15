import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

const COMMIT = /^[0-9a-f]{40}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const GRANT_KINDS = new Set([
  "filesystem.read",
  "filesystem.write",
  "process.spawn",
  "network.connect",
  "secrets.read",
]);

export class LocalHostIsolationError extends Error {
  constructor(message, code = "DR4730") {
    super(`local host isolation: ${message}`);
    this.name = "LocalHostIsolationError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new LocalHostIsolationError(message, code);
};
const frozen = (value) => Object.freeze(structuredClone(value));
const within = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const git = (repositoryPath, executable, args) =>
  execFileSync(executable, ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

export function createGitWorktreeManager({ repositoryPath, worktreeRoot, gitExecutable = "git" }) {
  const repository = path.resolve(repositoryPath ?? "");
  const root = path.resolve(worktreeRoot ?? "");
  if (repository === root || within(repository, root)) fail("worktree root must be outside the source checkout");
  const records = new Map();

  function workspacePath(attemptId) {
    if (!ID.test(attemptId ?? "")) fail("attemptId is invalid");
    const candidate = path.resolve(root, attemptId);
    if (!within(root, candidate) || candidate === root) fail("worktree path escapes configured root", "DR4731");
    return candidate;
  }

  return Object.freeze({
    create({ attemptId, workItemId, revision }) {
      if (!ID.test(workItemId ?? "")) fail("workItemId is invalid");
      if (!COMMIT.test(revision ?? "")) fail("exact 40-character repository revision is required");
      if (records.has(attemptId)) fail(`attempt ${attemptId} already has a worktree`, "DR4732");
      let observed;
      try {
        observed = git(repository, gitExecutable, ["rev-parse", "--verify", `${revision}^{commit}`]);
      } catch {
        fail(`revision ${revision} is unavailable`, "DR4733");
      }
      if (observed !== revision) fail("repository revision resolved to unexpected commit", "DR4733");
      const workspace = workspacePath(attemptId);
      try {
        execFileSync(gitExecutable, ["-C", repository, "worktree", "add", "--detach", "--", workspace, revision], {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (error) {
        fail(`could not create isolated worktree: ${error.stderr?.toString("utf8").trim() || error.message}`);
      }
      const record = {
        attemptId,
        workItemId,
        revision,
        workspace,
        state: "active",
        bindingDigest: canonicalJsonDigest({ attemptId, workItemId, revision, workspace }),
      };
      records.set(attemptId, record);
      return frozen(record);
    },
    inspect(attemptId) {
      const record = records.get(attemptId);
      if (!record) fail(`attempt ${attemptId} has no managed worktree`, "DR4734");
      const observedRevision = git(record.workspace, gitExecutable, ["rev-parse", "HEAD"]);
      if (observedRevision !== record.revision) fail(`attempt ${attemptId} worktree base is stale`, "DR4735");
      return frozen({ ...record, observedRevision });
    },
    cleanup(attemptId) {
      const record = records.get(attemptId);
      if (!record) fail(`attempt ${attemptId} has no managed worktree`, "DR4734");
      if (!within(root, record.workspace) || record.workspace === root) fail("refusing unsafe worktree cleanup", "DR4731");
      execFileSync(gitExecutable, ["-C", repository, "worktree", "remove", "--force", "--", record.workspace], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
      records.delete(attemptId);
      return frozen({ attemptId, workspace: record.workspace, outcome: "removed" });
    },
    list() {
      return frozen([...records.values()].sort((left, right) => left.attemptId.localeCompare(right.attemptId, "en")));
    },
  });
}

function normalizeGrants(grants, workspaceRoot) {
  if (!Array.isArray(grants)) fail("grants must be an array");
  return grants.map((grant) => {
    if (!GRANT_KINDS.has(grant?.kind) || !Array.isArray(grant.values)) fail("grant is invalid");
    const values = grant.kind.startsWith("filesystem.")
      ? grant.values.map((value) => {
          const absolute = path.resolve(workspaceRoot, value);
          if (!within(workspaceRoot, absolute)) fail(`filesystem grant escapes workspace: ${value}`, "DR4731");
          return absolute;
        })
      : [...grant.values];
    return { kind: grant.kind, values: [...new Set(values)].sort() };
  });
}

export function createCapabilityEnforcer({ attemptId, workspace, grants, receiptSink = () => {} }) {
  if (!ID.test(attemptId ?? "")) fail("attemptId is invalid");
  const workspaceRoot = path.resolve(workspace ?? "");
  const normalized = normalizeGrants(grants, workspaceRoot);
  const byKind = new Map(normalized.map((grant) => [grant.kind, new Set(grant.values)]));
  let sequence = 0;

  const authorize = (effect) => {
    if (!GRANT_KINDS.has(effect?.kind)) fail("effect kind is invalid");
    const allowed = byKind.get(effect.kind);
    if (!allowed) fail(`effect ${effect.kind} is undeclared`, "DR4736");
    let scope;
    if (effect.kind.startsWith("filesystem.")) {
      scope = path.resolve(workspaceRoot, effect.path ?? "");
      if (!within(workspaceRoot, scope)) fail("filesystem effect escapes workspace", "DR4731");
      if (![...allowed].some((root) => within(root, scope))) fail(`filesystem effect is outside declared grant: ${effect.path}`, "DR4736");
    } else {
      scope = effect.executable ?? effect.host ?? effect.name;
      if (typeof scope !== "string" || !allowed.has(scope)) fail(`effect ${effect.kind} scope is undeclared`, "DR4736");
    }
    return { ...structuredClone(effect), scope };
  };
  const receipt = (authorized, observation) => {
    const safeObservation = {
      outcome: observation.outcome,
      exitCode: observation.exitCode,
      outputDigest: observation.outputDigest,
      byteCount: observation.byteCount,
    };
    const body = {
      attemptId,
      sequence: ++sequence,
      effect: { kind: authorized.kind, scope: authorized.scope },
      observation: Object.fromEntries(Object.entries(safeObservation).filter(([, value]) => value !== undefined)),
    };
    const value = { apiVersion: "devrelay.dev/v1alpha1", kind: "HostEffectReceipt", ...body, receiptDigest: canonicalJsonDigest(body) };
    receiptSink(frozen(value));
    return frozen(value);
  };

  return Object.freeze({
    grants: frozen(normalized),
    authorize,
    executeProcess({ executable, argv = [], cwd = workspaceRoot, timeout = 30_000 }) {
      const authorized = authorize({ kind: "process.spawn", executable });
      const resolvedCwd = path.resolve(cwd);
      if (!within(workspaceRoot, resolvedCwd)) fail("process cwd escapes workspace", "DR4731");
      const result = spawnSync(executable, argv, { cwd: resolvedCwd, encoding: null, timeout, windowsHide: true });
      if (result.error) fail(`process effect failed: ${result.error.message}`);
      const output = Buffer.concat([Buffer.from(result.stdout ?? []), Buffer.from(result.stderr ?? [])]);
      return Object.freeze({
        status: result.status,
        stdout: Buffer.from(result.stdout ?? []),
        stderr: Buffer.from(result.stderr ?? []),
        receipt: receipt(authorized, { outcome: result.status === 0 ? "pass" : "fail", exitCode: result.status, outputDigest: sha256Digest(output), byteCount: output.byteLength }),
      });
    },
    async executeNetwork({ host, action }) {
      const authorized = authorize({ kind: "network.connect", host });
      if (typeof action !== "function") fail("network action is required");
      const result = await action();
      return frozen({ result, receipt: receipt(authorized, { outcome: "pass" }) });
    },
    async readSecret({ name, action }) {
      const authorized = authorize({ kind: "secrets.read", name });
      if (typeof action !== "function") fail("secret reader is required");
      const value = await action();
      return { value, receipt: receipt(authorized, { outcome: "pass" }) };
    },
  });
}


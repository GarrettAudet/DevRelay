import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { createCodingStorage } from "./coding-storage.mjs";
import { createCodingFiles, ensurePlainDirectory } from "./coding-files.mjs";
import { validateCodingArtifact } from "./coding-contracts.mjs";
import { createGovernedCodingWorkflow } from "./coding.mjs";
import { validateCodingReplayBundle } from "./coding-replay-bundle.mjs";

const headKey = "governed-project-head";
const bundleSchema = "https://devrelay.dev/examples/modular/coding/replay-bundle/v1";
const planSchema = "https://devrelay.dev/examples/modular/coding/governed-request/v1";
const digestPattern = /^sha256:[0-9a-f]{64}$/;
function blocked(message, code = "GOVERNED_BLOCKED") {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) blocked("Invalid " + label);
}
function location(workspace, mustExist = true) {
  const root = realpathSync(resolve(workspace));
  // Do not follow a linked host-state directory, even for a status read.
  for (const directory of [join(root, ".devrelay"), join(root, ".devrelay", "modular-coding")]) {
    if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) {
      blocked("Governed state path must be a plain directory");
    }
  }
  const stateDirectory = join(root, ".devrelay", "modular-coding");
  if (mustExist && !existsSync(join(stateDirectory, "state.sqlite"))) blocked("No governed head is active; activate a complete approved replay bundle", "GOVERNED_HOST_REQUIRED");
  return { workspace: root, stateDirectory };
}
function git(workspace, args) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const name of Object.keys(env)) if (name.startsWith("GIT_") && name !== "GIT_OPTIONAL_LOCKS") delete env[name];
  const result = spawnSync("git", ["-C", workspace, ...args], { encoding: "utf8", env, windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) blocked("This bridge requires an existing Git worktree with a committed HEAD: " + (result.error?.message ?? result.stderr.trim()), "UNSUPPORTED_REPOSITORY_CONTEXT");
  return result.stdout;
}
function repository(workspace) {
  // Git and Node can spell the same Windows directory differently (including
  // short/long names). Compare filesystem identity, not case-folded path text.
  const root = statSync(git(workspace, ["rev-parse", "--show-toplevel"]).trim(), { bigint: true });
  const selected = statSync(workspace, { bigint: true });
  if (root.dev === 0n || selected.dev === 0n || root.ino === 0n || selected.ino === 0n) {
    blocked("Filesystem does not expose a reliable Git worktree directory identity", "UNSUPPORTED_REPOSITORY_CONTEXT");
  }
  if (!root.isDirectory() || !selected.isDirectory() || root.dev !== selected.dev || root.ino !== selected.ino) {
    blocked("Workspace must be the Git worktree root", "UNSUPPORTED_REPOSITORY_CONTEXT");
  }
  const commit = git(workspace, ["rev-parse", "--verify", "HEAD"]).trim();
  const tree = git(workspace, ["rev-parse", "--verify", "HEAD^{tree}"]).trim();
  return { revision: commit, treeDigest: canonicalJsonDigest({ commit, tree }) };
}
function assertRepository(workspace, expected, allowedChanges = []) {
  if (canonicalJsonDigest(repository(workspace)) !== canonicalJsonDigest(expected)) blocked("Repository HEAD/tree changed; refresh approved context and replan", "STALE_REPOSITORY");
  const entries = git(workspace, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean);
  const allowed = new Set(allowedChanges);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (status.includes("R") || status.includes("C")) blocked("Renamed/copied files require a new clean approved repository snapshot", "STALE_REPOSITORY");
    if (path.startsWith(".devrelay/modular-coding/")) continue;
    if (!allowed.has(path)) blocked("Unapproved working-tree change: " + path + "; commit or restore it before refreshing/replanning", "STALE_REPOSITORY");
  }
}
function identity(state) {
  return canonicalJsonDigest({ formatVersion: state.formatVersion, workspace: state.workspace,
    generation: state.generation, bundle: state.bundle, heads: state.heads,
    approvalDigest: state.approvalDigest, catalogDigest: state.catalogDigest, repository: state.repository });
}
function readHead(store, workspace) {
  let row;
  try { row = store.host.readRun(headKey); }
  catch (error) { if (error.code === "DR4920") blocked("No governed head is active; activate a complete approved replay bundle", "GOVERNED_HOST_REQUIRED"); throw error; }
  const state = row.state;
  if (state.mode === "legacy") blocked("No governed head is active; activate a complete approved replay bundle", "GOVERNED_HOST_REQUIRED");
  exactKeys(state, ["formatVersion", "workspace", "generation", "bundle", "heads", "approvalDigest", "catalogDigest", "repository", "headDigest", "request", "active", "completed"], "governed head");
  if (state.formatVersion !== 1 || state.workspace !== workspace || identity(state) !== state.headDigest) blocked("Saved governed head identity is invalid");
  return row;
}
function status(row) {
  return { status: row.state.active ? "reconciliation-required" : "active", headDigest: row.state.headDigest,
    generation: row.state.generation, repository: row.state.repository, approvalDigest: row.state.approvalDigest,
    requestId: row.state.request?.requestId ?? null, active: row.state.active, completed: row.state.completed,
    acceptance: "not-recorded" };
}
function assertExpected(row, expected) {
  if (!digestPattern.test(expected ?? "") || row.state.headDigest !== expected) blocked("Request/head is stale; refresh approved context and create a new plan with a new request ID", "STALE_GOVERNED_HEAD");
}
function assertIdle(row) {
  if (row.state.active) blocked("An active or uncertain head-bound effect requires exact checkpoint reconciliation; lease expiry does not clear it", "GOVERNED_RECONCILIATION_REQUIRED");
}
function acquire(store, row, durationMilliseconds = 30000) {
  return store.host.acquireLease({ runId: headKey, owner: "modular-" + randomUUID(), expectedVersion: row.version, durationMilliseconds });
}
function transition(store, row, lease, name, state) {
  return store.host.commitTransition({ runId: headKey, expectedVersion: row.version, leaseToken: lease.token,
    transition: { kind: name, headDigest: state.headDigest }, nextState: state });
}
function assertLease(store, expected, lease) {
  const row = readHead(store, expected.workspace);
  assertExpected(row, expected.headDigest);
  if (row.lease?.token !== lease.token || row.lease.expiresAt <= Date.now()) blocked("Governed head lease expired or changed; reconcile before continuing", "GOVERNED_LEASE_EXPIRED");
  return row;
}
async function resolveHead(store, row) {
  const resolved = await validateCodingReplayBundle(store.json(row.state.bundle));
  if (resolved.approvalDigest !== row.state.approvalDigest || resolved.catalogDigest !== row.state.catalogDigest ||
      canonicalJsonDigest(resolved.heads) !== canonicalJsonDigest(row.state.heads)) blocked("Saved replay bundle no longer reproduces the exact governed head");
  return resolved;
}
function validatePlan(plan) {
  exactKeys(plan, ["formatVersion", "headDigest", "request"], "governed request");
  if (plan.formatVersion !== 1 || !digestPattern.test(plan.headDigest)) blocked("Invalid governed request version or head digest");
  validateCodingArtifact("request", plan.request);
  return structuredClone(plan);
}
function assertOneRequest(row, request) {
  if (row.state.request && row.state.request.requestId !== request.requestId) blocked("This approved work-card head already binds a request; refresh a separately approved change and use a new request ID", "GOVERNED_REPLAN_REQUIRED");
}

/** Import validates evidence consistency, not independent owner authentication. */
export async function activateGovernedCodingProject({ workspace, bundle, expectedHeadDigest }) {
  const local = location(workspace, false);
  bundle = structuredClone(bundle);
  const resolved = await validateCodingReplayBundle(bundle);
  const snapshot = resolved.repositorySnapshot;
  if (!snapshot || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(snapshot.revision)) blocked("Only the existing local Git RepositorySnapshot convention is supported", "UNSUPPORTED_REPOSITORY_CONTEXT");
  const expectedRepository = { revision: snapshot.revision, treeDigest: snapshot.treeDigest };
  assertRepository(local.workspace, expectedRepository);
  ensurePlainDirectory(local.stateDirectory);
  const store = createCodingStorage(local.stateDirectory);
  let lease;
  try {
    let row = store.find(headKey) ? store.host.readRun(headKey) : undefined;
    if (row?.state.mode === "legacy") {
      exactKeys(row.state, ["formatVersion", "mode", "workspace", "active"], "legacy workspace head");
      if (row.state.workspace !== local.workspace || row.state.formatVersion !== 1 || expectedHeadDigest !== undefined) blocked("Legacy head does not match this initial governed activation");
    } else if (row) {
      row = readHead(store, local.workspace);
      assertExpected(row, expectedHeadDigest);
    }
    if (row) {
      assertIdle(row);
      lease = acquire(store, row);
    } else if (expectedHeadDigest !== undefined) blocked("Cannot refresh a missing governed head", "STALE_GOVERNED_HEAD");
    // Validation precedes persistence; immutable bytes are staged before the one head CAS.
    const bundleRef = store.put(bundle, bundleSchema);
    const state = { formatVersion: 1, workspace: local.workspace, generation: (row?.state.generation ?? 0) + 1,
      bundle: bundleRef, heads: resolved.heads, approvalDigest: resolved.approvalDigest, catalogDigest: resolved.catalogDigest,
      repository: expectedRepository, request: null, active: null, completed: null };
    state.headDigest = identity(state);
    if (row?.state.bundle?.digest === bundleRef.digest) blocked("Refresh requires a new approved bundle; old context remains immutable", "GOVERNED_REPLAN_REQUIRED");
    assertRepository(local.workspace, expectedRepository);
    row = row ? transition(store, row, lease, "approved-context-refreshed", state)
      : store.host.initializeRun({ runId: headKey, state });
    return status(row);
  } finally { try { if (lease && store.host.readRun(headKey).lease?.token === lease.token) store.host.releaseLease({ runId: headKey, leaseToken: lease.token }); } finally { store.close(); } }
}

export function inspectGovernedCodingProject(workspace) {
  const local = location(workspace);
  const store = createCodingStorage(local.stateDirectory);
  try { return status(readHead(store, local.workspace)); } finally { store.close(); }
}

/** Produces a pinned envelope; does not approve, edit, execute, or bind a request. */
export async function planGovernedCodingRequest({ workspace, request }) {
  const local = location(workspace);
  const store = createCodingStorage(local.stateDirectory);
  try {
    const row = readHead(store, local.workspace);
    assertIdle(row);
    assertOneRequest(row, request);
    const resolved = await resolveHead(store, row);
    await resolved.preflight.assertCurrent(request);
    assertRepository(local.workspace, row.state.repository, row.state.completed ? request.changes.map(change => change.path) : []);
    const files = createCodingFiles(local.workspace);
    for (const change of request.changes) if (files.read(change.path).digest !== change.beforeDigest) blocked("Stale file preimage: " + change.path);
    return validatePlan({ formatVersion: 1, headDigest: row.state.headDigest, request });
  } finally { store.close(); }
}

export async function runGovernedCodingRequest({ workspace, plan }) {
  plan = validatePlan(plan);
  const local = location(workspace);
  const store = createCodingStorage(local.stateDirectory);
  let lease, workflow;
  try {
    let row = readHead(store, local.workspace);
    assertExpected(row, plan.headDigest);
    assertIdle(row);
    assertOneRequest(row, plan.request);
    const resolved = await resolveHead(store, row);
    await resolved.preflight.assertCurrent(plan.request);
    assertRepository(local.workspace, row.state.repository, row.state.completed ? plan.request.changes.map(change => change.path) : []);
    lease = acquire(store, row, plan.request.timeoutMs + 60000);
    const pinned = row.state;
    const readCurrentHeads = () => {
      const current = assertLease(store, pinned, lease);
      return current.state.heads;
    };
    workflow = await createGovernedCodingWorkflow({ ...local, governance: { ...resolved.governance, readCurrentHeads },
      assertEffectLease: () => assertLease(store, pinned, lease),
      effectGuard: async invocation => {
        row = assertLease(store, pinned, lease);
        assertRepository(local.workspace, pinned.repository, invocation.step === "verify" ? plan.request.changes.map(change => change.path) : []);
        const active = { requestId: plan.request.requestId, headDigest: pinned.headDigest,
          invocation: workflow.invocation(plan.request), step: invocation.step, stepInvocationDigest: invocation.stepInvocationDigest };
        row = transition(store, row, lease, "effect-intent", { ...row.state, active });
      } });
    const planRef = store.put(plan, planSchema);
    store.bind("governed-request:" + plan.request.requestId, { plan: planRef, headDigest: plan.headDigest });
    if (!row.state.request) row = transition(store, row, lease, "request-bound", { ...row.state, request: { requestId: plan.request.requestId, plan: planRef } });
    const result = await workflow.execute(plan.request);
    row = assertLease(store, pinned, lease);
    assertRepository(local.workspace, pinned.repository, plan.request.changes.map(change => change.path));
    // A terminal result is durably checkpointed before this head transition.
    const replay = await workflow.catalog.registry.verifyCheckpointedExecution(workflow.invocation(plan.request), workflow.runtimeContext);
    row = transition(store, row, lease, "effect-completed", { ...row.state, active: null,
      completed: { requestId: plan.request.requestId, result: replay.moduleResult } });
    return { ...result, headDigest: pinned.headDigest };
  } finally {
    workflow?.close();
    try { if (lease && store.host.readRun(headKey).lease?.token === lease.token) store.host.releaseLease({ runId: headKey, leaseToken: lease.token }); } finally { store.close(); }
  }
}

/** Checkpoint-only recovery: missing/partial evidence never invokes an adapter. */
export async function reconcileGovernedCodingProject({ workspace, expectedHeadDigest }) {
  const local = location(workspace);
  const store = createCodingStorage(local.stateDirectory);
  let lease, workflow;
  try {
    let row = readHead(store, local.workspace);
    assertExpected(row, expectedHeadDigest);
    if (!row.state.active) return status(row);
    lease = acquire(store, row);
    const resolved = await resolveHead(store, row);
    const plan = validatePlan(store.json(row.state.request.plan));
    const pinned = row.state;
    workflow = await createGovernedCodingWorkflow({ ...local,
      governance: { ...resolved.governance, readCurrentHeads: () => assertLease(store, pinned, lease).state.heads },
      effectGuard: () => blocked("Reconciliation cannot execute an effect") });
    const expectedInvocation = workflow.invocation(plan.request);
    if (canonicalJsonDigest(expectedInvocation) !== canonicalJsonDigest(row.state.active.invocation) || row.state.active.headDigest !== plan.headDigest) blocked("Active intent does not match the exact pinned request");
    let replay;
    try {
      replay = await workflow.catalog.registry.verifyCheckpointedExecution(row.state.active.invocation, workflow.runtimeContext);
    } catch (error) {
      blocked("Exact terminal checkpoints are incomplete; effect remains quarantined. Do not retry, delete state, or infer process termination from lease expiry. Preserve files/process evidence for supported recovery. Detail: " + error.message, "GOVERNED_RECONCILIATION_REQUIRED");
    }
    const report = workflow.runtimeContext.artifacts.load(replay.moduleResult.outputs.report[0]);
    const value = JSON.parse(Buffer.from(report).toString("utf8"));
    createCodingFiles(local.workspace).assertCurrent(value.files);
    assertRepository(local.workspace, pinned.repository, plan.request.changes.map(change => change.path));
    row = assertLease(store, pinned, lease);
    row = transition(store, row, lease, "terminal-checkpoints-reconciled", { ...row.state, active: null,
      completed: { requestId: plan.request.requestId, result: replay.moduleResult } });
    return status(row);
  } finally { workflow?.close(); try { if (lease && store.host.readRun(headKey).lease?.token === lease.token) store.host.releaseLease({ runId: headKey, leaseToken: lease.token }); } finally { store.close(); } }
}

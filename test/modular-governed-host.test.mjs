import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createCodingStorage } from "../examples/modular/coding-storage.mjs";
import { createCodingWorkflow } from "../examples/modular/coding.mjs";
import { activateGovernedCodingProject, inspectGovernedCodingProject, planGovernedCodingRequest,
  runGovernedCodingRequest, reconcileGovernedCodingProject } from "../examples/modular/coding-governed-host.mjs";
import { createGovernedCodingFixture, defaultGovernedChangeCard } from "./governed-coding-fixture.mjs";

// Synthetic, genuinely Gate-derived approvals exercise mechanics, not owner acceptance.
const cli = fileURLToPath(new URL("../examples/modular/desktop.mjs", import.meta.url));
const broken = "export const add = (a, b) => a - b;\n";
const fixed = "export const add = (a, b) => a + b;\n";
const testSource = `import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { add } from "../add.mjs";
appendFileSync(".test-count", "run\\n");
test("adds the actual operands", () => assert.equal(add(2, 3), 5));
`;
function git(workspace, ...args) {
  const result = spawnSync("git", ["-C", workspace, "-c", "user.name=DevRelay Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "core.autocrlf=false", ...args], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout.trim();
}
function repository(workspace) {
  const commit = git(workspace, "rev-parse", "HEAD");
  const tree = git(workspace, "rev-parse", "HEAD^{tree}");
  return { repositoryRevision: commit, repositoryTreeDigest: canonicalJsonDigest({ commit, tree }) };
}
function command(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", windowsHide: true, timeout: 30000 });
}
function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
async function fixture(t, source = testSource) {
  const root = await mkdtemp(join(tmpdir(), "devrelay-governed-host-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "project");
  await mkdir(join(workspace, "test"), { recursive: true });
  await writeFile(join(workspace, ".gitignore"), ".test-count\n");
  await writeFile(join(workspace, "add.mjs"), broken);
  await writeFile(join(workspace, "test/add.test.mjs"), source);
  git(workspace, "init", "--quiet");
  git(workspace, "add", ".gitignore", "add.mjs", "test/add.test.mjs");
  git(workspace, "commit", "--quiet", "-m", "Initial synthetic test workspace");
  const approved = await createGovernedCodingFixture(undefined, repository(workspace));
  const bundlePath = join(root, "bundle.json");
  await writeFile(bundlePath, JSON.stringify(approved.bundle));
  const request = { requestId: "governed-one", goal: "Repair the bounded arithmetic fixture", readPaths: ["add.mjs", "test/add.test.mjs"],
    changes: [{ path: "add.mjs", beforeDigest: sha256Digest(Buffer.from(broken)), content: fixed }],
    testFiles: ["test/add.test.mjs"], timeoutMs: 10000 };
  const requestPath = join(root, "request.json");
  const planPath = join(root, "plan.json");
  await writeFile(requestPath, JSON.stringify(request));
  return { root, workspace, approved, bundlePath, request, requestPath, planPath,
    stateDirectory: join(workspace, ".devrelay", "modular-coding") };
}
async function activeFixture(t, source) {
  const value = await fixture(t, source);
  value.head = await activateGovernedCodingProject({ workspace: value.workspace, bundle: value.approved.bundle });
  value.plan = await planGovernedCodingRequest(value);
  return value;
}
async function noEffects(value) {
  assert.equal(await readFile(join(value.workspace, "add.mjs"), "utf8"), broken);
  await assert.rejects(access(join(value.workspace, ".test-count")), { code: "ENOENT" });
}

test("governed CLI activates, edits, tests and replays genuine durable evidence in fresh processes", async t => {
  const value = await fixture(t);
  const head = success(command("governed-activate", value.workspace, value.bundlePath));
  assert.equal(head.generation, 1);
  const plan = success(command("governed-plan", value.workspace, value.requestPath));
  assert.equal(plan.headDigest, head.headDigest);
  await writeFile(value.planPath, JSON.stringify(plan));
  const first = success(command("governed-run", value.workspace, value.planPath));
  assert.equal(first.result.outcome, "verified");
  assert.equal(first.replayed, false);
  assert.equal(first.governance.acceptance, "not-recorded");
  assert.match(first.report.verification.stdout, /adds the actual operands/);
  assert.equal(await readFile(join(value.workspace, "add.mjs"), "utf8"), fixed);
  const second = success(command("governed-run", value.workspace, value.planPath));
  assert.equal(second.replayed, true);
  assert.equal(second.currentWorkspaceMatches, true);
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
  const status = success(command("governed-status", value.workspace));
  assert.equal(status.completed.requestId, value.request.requestId);
  assert.equal(status.active, null);
  assert.equal(status.acceptance, "not-recorded");
});

test("missing, substituted head and changed Git revision cannot authorize effects", async t => {
  const value = await fixture(t);
  assert.throws(() => inspectGovernedCodingProject(value.workspace), { code: "GOVERNED_HOST_REQUIRED" });
  await assert.rejects(access(join(value.workspace, ".devrelay")), { code: "ENOENT" });
  const head = await activateGovernedCodingProject({ workspace: value.workspace, bundle: value.approved.bundle });
  const plan = await planGovernedCodingRequest(value);
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace,
    plan: { ...plan, headDigest: "sha256:" + "0".repeat(64) } }), { code: "STALE_GOVERNED_HEAD" });
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan: { ...plan, approved: true } }), /Invalid governed request/);
  git(value.workspace, "commit", "--quiet", "--allow-empty", "-m", "External revision advance");
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan }), { code: "STALE_REPOSITORY" });
  assert.equal(inspectGovernedCodingProject(value.workspace).headDigest, head.headDigest);
  await noEffects(value);
});

test("dirty dependencies and arbitrary .devrelay files are not hidden by host-state exclusion", async t => {
  const value = await activeFixture(t);
  for (const path of ["unapproved.mjs", ".devrelay/unapproved.mjs", "test/add.test.mjs"]) {
    const original = path === "test/add.test.mjs" ? testSource : null;
    await writeFile(join(value.workspace, path), "// unrelated work\n");
    await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan }), { code: "STALE_REPOSITORY" }, path);
    if (original === null) await rm(join(value.workspace, path));
    else await writeFile(join(value.workspace, path), original);
  }
  await noEffects(value);
});

test("two separately approved changes refresh one workspace without deleting old requests or context", async t => {
  const value = await activeFixture(t);
  const first = await runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan });
  assert.equal(first.result.outcome, "verified");
  const firstStore = createCodingStorage(value.stateDirectory);
  const firstHead = firstStore.host.readRun("governed-project-head");
  const oldBundleBytes = firstStore.load(firstHead.state.bundle);
  const oldRequest = firstStore.find("governed-request:" + value.request.requestId);
  firstStore.close();
  // The fixture owner commits independently; refresh never commits the target project.
  git(value.workspace, "add", "add.mjs");
  git(value.workspace, "commit", "--quiet", "-m", "Commit first bounded change");
  const next = await createGovernedCodingFixture({ ...defaultGovernedChangeCard,
    reuse: { disposition: "reuse", rationale: "Reuse the approved arithmetic function and existing assertion for a second bounded change.",
      paths: ["add.mjs", "test/add.test.mjs"] } }, repository(value.workspace));
  await assert.rejects(activateGovernedCodingProject({ workspace: value.workspace, bundle: next.bundle,
    expectedHeadDigest: "sha256:" + "0".repeat(64) }), { code: "STALE_GOVERNED_HEAD" });
  const head = await activateGovernedCodingProject({ workspace: value.workspace, bundle: next.bundle, expectedHeadDigest: value.head.headDigest });
  assert.equal(head.generation, 2);
  assert.notEqual(head.headDigest, value.head.headDigest);
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan }), { code: "STALE_GOVERNED_HEAD" });
  const request = { ...value.request, requestId: "governed-two", changes: [{ path: "add.mjs", beforeDigest: sha256Digest(Buffer.from(fixed)), content: fixed + "// Separately approved second change.\n" }] };
  const plan = await planGovernedCodingRequest({ workspace: value.workspace, request });
  const second = await runGovernedCodingRequest({ workspace: value.workspace, plan });
  assert.equal(second.result.outcome, "verified");
  assert.notEqual(second.governance.approvalDigest, first.governance.approvalDigest);
  assert.equal((await runGovernedCodingRequest({ workspace: value.workspace, plan })).replayed, true);
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\nrun\n");
  const store = createCodingStorage(value.stateDirectory);
  try {
    assert.deepEqual(store.find("governed-request:" + value.request.requestId), oldRequest);
    assert.deepEqual(store.load(firstHead.state.bundle), oldBundleBytes);
    assert.ok(store.host.readTransitionJournal("governed-project-head").some(entry => entry.transition.kind === "approved-context-refreshed"));
  } finally { store.close(); }
});

test("one approved head cannot be silently reused for a different request", async t => {
  const value = await activeFixture(t);
  await runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan });
  const request = { ...value.request, requestId: "not-the-approved-attempt" };
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan: { ...value.plan, request } }), { code: "GOVERNED_REPLAN_REQUIRED" });
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
});

test("timed-out effects remain quarantined after lease expiry and checkpoint-only reconciliation cannot rerun them", async t => {
  const value = await activeFixture(t, testSource + "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);\n");
  const plan = { ...value.plan, request: { ...value.request, timeoutMs: 500 } };
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan }), /process effect failed|timed out|ETIMEDOUT/);
  const before = inspectGovernedCodingProject(value.workspace);
  assert.equal(before.status, "reconciliation-required");
  assert.equal(before.active.step, "verify");
  // A stale lease is intentionally persisted through the public storage API. The
  // active effect intent, not the wall clock or lease, must remain authoritative.
  const storage = createLocalHostStorage({ rootDirectory: value.stateDirectory, clock: () => Date.now() - 60000 });
  const row = storage.readRun("governed-project-head");
  storage.acquireLease({ runId: row.runId, owner: "expired-test-worker", expectedVersion: row.version, durationMilliseconds: 1 });
  storage.close();
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan }), { code: "GOVERNED_RECONCILIATION_REQUIRED" });
  await assert.rejects(reconcileGovernedCodingProject({ workspace: value.workspace, expectedHeadDigest: value.head.headDigest }),
    error => error.code === "GOVERNED_RECONCILIATION_REQUIRED" && /terminal checkpoints are incomplete/.test(error.message));
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
  assert.equal(inspectGovernedCodingProject(value.workspace).status, "reconciliation-required");
  // Even restoring files is not evidence that an uncertain process terminated.
  await writeFile(join(value.workspace, "add.mjs"), broken);
  const next = await createGovernedCodingFixture({ ...defaultGovernedChangeCard,
    reuse: { ...defaultGovernedChangeCard.reuse, rationale: "A different synthetic approval cannot clear uncertainty." } }, repository(value.workspace));
  await assert.rejects(activateGovernedCodingProject({ workspace: value.workspace, bundle: next.bundle,
    expectedHeadDigest: value.head.headDigest }), { code: "GOVERNED_RECONCILIATION_REQUIRED" });
  assert.equal(inspectGovernedCodingProject(value.workspace).headDigest, value.head.headDigest);
});

test("reconciliation uses exact completed checkpoints without repeating edit or test", async t => {
  const value = await activeFixture(t);
  await runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan });
  const store = createCodingStorage(value.stateDirectory);
  try {
    const row = store.host.readRun("governed-project-head");
    const invocation = store.find("request:" + value.request.requestId);
    const terminal = store.host.listRuns({ prefix: "checkpoint:" }).find(item => item.state.disposition === "terminal").state;
    const lease = store.host.acquireLease({ runId: row.runId, owner: "interrupted-finalizer-fixture", expectedVersion: row.version });
    store.host.commitTransition({ runId: row.runId, expectedVersion: row.version, leaseToken: lease.token,
      transition: { kind: "synthetic-interruption-after-terminal-checkpoint" }, nextState: { ...row.state, completed: null,
        active: { requestId: value.request.requestId, headDigest: value.head.headDigest, invocation,
          step: "verify", stepInvocationDigest: terminal.stepInvocationDigest } } });
    store.host.releaseLease({ runId: row.runId, leaseToken: lease.token });
  } finally { store.close(); }
  const result = await reconcileGovernedCodingProject({ workspace: value.workspace, expectedHeadDigest: value.head.headDigest });
  assert.equal(result.active, null);
  assert.equal(result.completed.requestId, value.request.requestId);
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
  assert.equal((await runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan })).replayed, true);
});


test("a competing process cannot execute against a head while its bounded test is live", async t => {
  const value = await activeFixture(t, testSource + "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);\n");
  await writeFile(value.planPath, JSON.stringify(value.plan));
  const child = spawn(process.execPath, [cli, "governed-run", value.workspace, value.planPath], { windowsHide: true });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", status => resolve({ status, stdout, stderr })); });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const deadline = Date.now() + 15000;
  while (true) {
    try { await access(join(value.workspace, ".test-count")); break; }
    catch (error) { if (error.code !== "ENOENT" || Date.now() >= deadline || child.exitCode !== null) throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const active = inspectGovernedCodingProject(value.workspace);
  assert.equal(active.active.step, "verify");
  const storage = createLocalHostStorage({ rootDirectory: value.stateDirectory });
  try {
    const row = storage.readRun("governed-project-head");
    assert.ok(row.lease.expiresAt > Date.now());
    assert.throws(() => storage.acquireLease({ runId: row.runId, owner: "competing-refresh", expectedVersion: row.version }), { code: "DR4924" });
  } finally { storage.close(); }
  await assert.rejects(runGovernedCodingRequest({ workspace: value.workspace, plan: value.plan }), { code: "GOVERNED_RECONCILIATION_REQUIRED" });
  const result = success(await completion);
  assert.equal(result.result.outcome, "verified");
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
});


test("a legacy workflow opened before governed activation cannot bypass the new head", async t => {
  const value = await fixture(t);
  const preview = createCodingWorkflow({ workspace: value.workspace, stateDirectory: value.stateDirectory, ...value.approved.context });
  try {
    const activated = await activateGovernedCodingProject({ workspace: value.workspace, bundle: value.approved.bundle });
    await assert.rejects(preview.execute(value.request), /active governed head/);
    const invocation = preview.invocation(value.request);
    await assert.rejects(preview.catalog.registry.execute(invocation, preview.runtimeContext), /active governed head/);
    await noEffects(value);
    assert.equal(inspectGovernedCodingProject(value.workspace).headDigest, activated.headDigest);
  } finally { preview.close(); }
});

test("a live legacy test reserves the same head lease and prevents governed activation", async t => {
  const value = await fixture(t, testSource + "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);\n");
  const contextPath = join(value.root, "context.json");
  await writeFile(contextPath, JSON.stringify(Object.fromEntries(Object.entries(value.approved.context).map(([key, bytes]) => [key, bytes.toString("base64")]))));
  const moduleUrl = new URL("../examples/modular/coding.mjs", import.meta.url).href;
  const source = `import { readFile } from "node:fs/promises";
    import { createCodingWorkflow } from ${JSON.stringify(moduleUrl)};
    const context = JSON.parse(await readFile(process.argv[3], "utf8"));
    const host = createCodingWorkflow({ workspace: process.argv[1], stateDirectory: process.argv[2],
      ...Object.fromEntries(Object.entries(context).map(([key, bytes]) => [key, Buffer.from(bytes, "base64")])) });
    try { console.log(JSON.stringify(await host.execute(JSON.parse(await readFile(process.argv[4], "utf8"))))); }
    finally { host.close(); }`;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source, value.workspace, value.stateDirectory, contextPath, value.requestPath], { windowsHide: true });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", status => resolve({ status, stdout, stderr })); });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const deadline = Date.now() + 15000;
  while (true) {
    try { await access(join(value.workspace, ".test-count")); break; }
    catch (error) { if (error.code !== "ENOENT" || Date.now() >= deadline || child.exitCode !== null) throw new Error("Legacy child did not reach test: " + stderr, { cause: error }); }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const storage = createLocalHostStorage({ rootDirectory: value.stateDirectory });
  try {
    const row = storage.readRun("governed-project-head");
    assert.equal(row.state.mode, "legacy");
    assert.equal(row.state.active.requestId, value.request.requestId);
    assert.ok(row.lease.expiresAt > Date.now());
    assert.throws(() => storage.acquireLease({ runId: row.runId, owner: "competing-governed-activation", expectedVersion: row.version }), { code: "DR4924" });
  } finally { storage.close(); }
  await assert.rejects(activateGovernedCodingProject({ workspace: value.workspace, bundle: value.approved.bundle }),
    error => ["STALE_REPOSITORY", "GOVERNED_RECONCILIATION_REQUIRED", "DR4924"].includes(error.code));
  const check = createLocalHostStorage({ rootDirectory: value.stateDirectory });
  try { assert.equal(check.readRun("governed-project-head").state.mode, "legacy"); } finally { check.close(); }
  const result = success(await completion);
  assert.equal(result.result.outcome, "verified");
  assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
});

test("fresh legacy replay reconciles a terminal-checkpoint/head-clear crash before activation", async t => {
  const value = await fixture(t);
  const options = { workspace: value.workspace, stateDirectory: value.stateDirectory, ...value.approved.context };
  const preview = createCodingWorkflow(options);
  const raw = createCodingStorage(value.stateDirectory);
  const put = preview.runtimeContext.checkpoints.put;
  preview.runtimeContext.checkpoints.put = async (key, checkpoint) => {
    if (checkpoint.disposition !== "terminal") return put(key, checkpoint);
    await raw.checkpoints.put(key, checkpoint);
    throw new Error("Injected crash after terminal checkpoint, before legacy head clear");
  };
  try {
    await assert.rejects(preview.execute(value.request), /Injected crash/);
    assert.equal(raw.host.readRun("governed-project-head").state.active.requestId, value.request.requestId);
  } finally { preview.close(); raw.close(); }
  const fresh = createCodingWorkflow(options);
  try {
    const replay = await fresh.execute(value.request);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.outcome, "verified");
    assert.equal(await readFile(join(value.workspace, ".test-count"), "utf8"), "run\n");
  } finally { fresh.close(); }
  const inspection = createCodingStorage(value.stateDirectory);
  try { assert.equal(inspection.host.readRun("governed-project-head").state.active, null); }
  finally { inspection.close(); }
  git(value.workspace, "add", "add.mjs");
  git(value.workspace, "commit", "--quiet", "-m", "Commit reconciled synthetic preview change");
  const next = await createGovernedCodingFixture(undefined, repository(value.workspace));
  const head = await activateGovernedCodingProject({ workspace: value.workspace, bundle: next.bundle });
  assert.equal(head.generation, 1);
  assert.equal(head.active, null);
});

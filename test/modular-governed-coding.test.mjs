import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { sha256Digest } from "../src/content-digest.mjs";
import { createCodingPreflight } from "../examples/modular/coding-preflight.mjs";
import { createGovernedCodingWorkflow, inspectCodingWorkspace } from "../examples/modular/coding.mjs";
import { createGovernedCodingFixture } from "./governed-coding-fixture.mjs";

// Synthetic owner decisions below are contract fixtures, never user acceptance.
const broken = "export const add = (a, b) => a - b;\n";
const fixed = "export const add = (a, b) => a + b;\n";
const testSource = 'import {test} from "node:test"; import assert from "node:assert/strict"; import {writeFileSync} from "node:fs"; import {add} from "../add.mjs"; writeFileSync(new URL("./ran.txt",import.meta.url),"ran"); test("adds",()=>assert.equal(add(2,3),5));\n';
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), "devrelay-governed-"));
  const workspace = join(root, "project"), stateDirectory = join(root, "state");
  await mkdir(join(workspace, "test"), { recursive: true });
  await writeFile(join(workspace, "add.mjs"), broken);
  await writeFile(join(workspace, "test/add.test.mjs"), testSource);
  const hosts = [];
  t.after(async () => { for (const host of hosts) host.close(); await rm(root, { recursive: true, force: true }); });
  return { root, workspace, stateDirectory, hosts,
    request: { requestId: "fix-add", goal: "Fix bounded addition", readPaths: [],
      changes: [{ path: "add.mjs", beforeDigest: sha256Digest(Buffer.from(broken)), content: fixed }],
      testFiles: ["test/add.test.mjs"], timeoutMs: 10000 } };
}
async function fixture(t) {
  const local = await workspace(t);
  const approved = await createGovernedCodingFixture();
  const open = async (governance = approved.governance) => {
    const host = await createGovernedCodingWorkflow({ ...local, governance });
    local.hosts.push(host);
    return host;
  };
  return { ...local, ...approved, open };
}
async function noEffects(value) {
  assert.equal(await readFile(join(value.workspace, "add.mjs"), "utf8"), broken);
  await assert.rejects(access(join(value.workspace, "test/ran.txt")), { code: "ENOENT" });
}

test("discovery reads without approval, setup, state writes, or process execution", async t => {
  const local = await workspace(t);
  assert.equal(inspectCodingWorkspace({ workspace: local.workspace, paths: ["add.mjs"] }).files[0].content, broken);
  await assert.rejects(createGovernedCodingWorkflow(local), /Gate.*evidence|current-head/i);
  await assert.rejects(access(local.stateDirectory), { code: "ENOENT" });
  await noEffects(local);
});

test("genuine Core-replayed Gate chain permits a bounded change, not owner acceptance", async t => {
  const value = await fixture(t);
  const host = await value.open();
  const result = await host.execute(value.request);
  assert.equal(result.result.outcome, "verified");
  assert.equal(result.currentWorkspaceMatches, true);
  assert.equal(result.governance.workItemId, "WI-CODING");
  assert.equal(result.governance.acceptance, "not-recorded");
  assert.equal(await readFile(join(value.workspace, "add.mjs"), "utf8"), fixed);
  assert.equal(await readFile(join(value.workspace, "test/ran.txt"), "utf8"), "ran");
});

test("serialized or fabricated replay receipts cannot authorize any Gate", async t => {
  const value = await fixture(t);
  for (const key of ["requirements", "architecture", "workBreakdown"]) {
    const governance = { ...value.governance, [key]: { ...value.governance[key],
      checkpointReplay: structuredClone(value.governance[key].checkpointReplay) } };
    await assert.rejects(value.open(governance), /in-process verified checkpoint replay receipt/i);
  }
  await assert.rejects(value.open({ approved: true }), /Gate.*evidence/i);
  await assert.rejects(value.open({ ...value.governance, readCurrentHeads: () => ({ approved: true }) }), /current requirementsBaseline/i);
  await assert.rejects(access(value.stateDirectory), { code: "ENOENT" });
  await noEffects(value);
});

test("denied owner approval never permits effects", async t => {
  const value = await fixture(t);
  const architecture = { ...value.governance.architecture,
    ownerApproval: { ...value.governance.architecture.ownerApproval, decision: "deny" } };
  architecture.ownerApprovalBytes = Buffer.from(JSON.stringify(architecture.ownerApproval));
  architecture.ownerApprovalRef = { ...architecture.ownerApprovalRef, digest: sha256Digest(architecture.ownerApprovalBytes) };
  await assert.rejects(value.open({ ...value.governance, architecture }), /approval|approve|decision/i);
  await noEffects(value);
});

test("a rehashed unattached scope card cannot widen approved effects", async t => {
  const value = await fixture(t);
  const card = { ...value.card, writePaths: [...value.card.writePaths, "outside.mjs"] };
  const bytes = Buffer.from(JSON.stringify(card));
  const changeCard = { bytes, ref: { ...value.governance.changeCard.ref, digest: sha256Digest(bytes) } };
  await assert.rejects(value.open({ ...value.governance, changeCard }), /attached.*approved work candidate/i);
  await noEffects(value);
});

test("caller mutation after creation cannot widen the frozen approved card", async t => {
  const value = await fixture(t);
  const host = await value.open();
  value.governance.changeCard.bytes.fill(32);
  value.governance.changeCard.ref.digest = "sha256:" + "0".repeat(64);
  value.card.writePaths.push("outside.mjs");
  const request = { ...value.request, requestId: "mutated-card", changes: [{ path: "outside.mjs", beforeDigest: null, content: fixed }] };
  await assert.rejects(host.execute(request), /outside the approved change card/i);
  await noEffects(value);
  assert.equal((await host.execute(value.request)).result.outcome, "verified");
});

test("the bound card must preserve criteria and an explicit reuse/N/A disposition", async () => {
  const base = await createGovernedCodingFixture();
  for (const mutate of [
    card => { delete card.reuse; },
    card => { card.reuse.rationale = " "; },
    card => { card.criterionIds.pop(); },
    card => { card.reuse = { disposition: "reuse", rationale: "Reuse existing source", paths: [] }; },
  ]) {
    const card = structuredClone(base.card);
    mutate(card);
    const value = await createGovernedCodingFixture(card);
    await assert.rejects(createCodingPreflight(value.governance), /card|criterion|reuse/i);
  }
});

test("explicit reuse permits approved scope but cannot skip required inspection", async t => {
  const local = await workspace(t);
  const base = await createGovernedCodingFixture();
  const card = { ...base.card, reuse: { disposition: "reuse", rationale: "Keep the existing function and test harness.",
    paths: ["add.mjs", "test/add.test.mjs"] } };
  const approved = await createGovernedCodingFixture(card);
  const host = await createGovernedCodingWorkflow({ ...local, governance: approved.governance });
  local.hosts.push(host);
  assert.equal((await host.execute(local.request)).result.outcome, "verified");
  const withDependency = { ...card, readPaths: [...card.readPaths, "helper.mjs"],
    reuse: { ...card.reuse, paths: [...card.reuse.paths, "helper.mjs"] } };
  const dependency = await createGovernedCodingFixture(withDependency);
  const preflight = await createCodingPreflight(dependency.governance);
  await assert.rejects(preflight.assertCurrent(local.request), /required reuse inspection/i);
});

test("each changed current dependency blocks a direct Core entry before editing", async t => {
  const value = await fixture(t);
  const host = await value.open();
  for (const key of Object.keys(value.heads)) {
    const original = value.heads[key];
    const invocation = host.invocation({ ...value.request, requestId: "stale-" + key });
    value.heads[key] = { ...original, digest: "sha256:" + "0".repeat(64) };
    await assert.rejects(host.catalog.registry.execute(invocation, host.runtimeContext), /current .*missing, stale, or substituted/i, key);
    await noEffects(value);
    value.heads[key] = original;
  }
});

test("direct Core entry cannot widen paths or test effects", async t => {
  const value = await fixture(t);
  const host = await value.open();
  const request = { ...value.request, changes: [{ path: "outside.mjs", beforeDigest: null, content: fixed }] };
  await assert.rejects(host.catalog.registry.execute(host.invocation(request), host.runtimeContext), /outside the approved change card/i);
  await assert.rejects(access(join(value.workspace, "outside.mjs")), { code: "ENOENT" });
  await noEffects(value);
  const next = { ...value.request, requestId: "other-tests", testFiles: ["other.test.mjs"] };
  await writeFile(join(value.workspace, "other.test.mjs"), testSource);
  await assert.rejects(host.execute(next), /outside the approved change card/i);
  await noEffects(value);
});

test("head changes after inspection are caught by the edit adapter, not only execute", async t => {
  const value = await fixture(t);
  let reads = 0;
  const governance = { ...value.governance, readCurrentHeads: () => {
    if (++reads === 3) value.heads.requirementsBaseline = { ...value.heads.requirementsBaseline, digest: "sha256:" + "0".repeat(64) };
    return value.heads;
  } };
  const host = await value.open(governance);
  await assert.rejects(host.execute(value.request), /current requirementsBaseline/i);
  assert.equal(reads, 3);
  await noEffects(value);
});

test("withdrawal after an edit prevents the test process from launching", async t => {
  const value = await fixture(t);
  let reads = 0;
  const host = await value.open({ ...value.governance, readCurrentHeads: () => {
    if (++reads === 4) delete value.heads.workBreakdownBaseline;
    return value.heads;
  } });
  await assert.rejects(host.execute(value.request), /current workBreakdownBaseline/i);
  assert.equal(await readFile(join(value.workspace, "add.mjs"), "utf8"), fixed);
  await assert.rejects(access(join(value.workspace, "test/ran.txt")), { code: "ENOENT" });
});

test("test failure remains failure and cannot become acceptance", async t => {
  const value = await fixture(t);
  const host = await value.open();
  value.request.changes[0].content = "export const add = () => 0;\n";
  const result = await host.execute(value.request);
  assert.equal(result.result.outcome, "tests_failed");
  assert.equal(result.governance.acceptance, "not-recorded");
});

test("a completed replay still rechecks current heads, without rerunning effects", async t => {
  const value = await fixture(t);
  const host = await value.open();
  await host.execute(value.request);
  const replay = await host.execute(value.request);
  assert.equal(replay.replayed, true);
  delete value.heads.requirementsBaseline;
  await assert.rejects(host.execute(value.request), /current requirementsBaseline/i);
});

test("successive genuine approvals reuse one workspace store without resetting history", async t => {
  const value = await fixture(t);
  const firstHost = await value.open();
  const first = await firstHost.execute(value.request);
  const next = await createGovernedCodingFixture({ ...value.card,
    reuse: { ...value.card.reuse, rationale: "A separately approved second bounded correction." } });
  Object.assign(value.heads, next.heads);
  await assert.rejects(firstHost.execute(value.request), /current workBreakdownBaseline/i);
  firstHost.close();
  const secondHost = await value.open(next.governance);
  const request = { ...value.request, requestId: "second-approved-change", changes: [{ path: "add.mjs",
    beforeDigest: sha256Digest(Buffer.from(fixed)), content: fixed + "// Second approved change.\n" }] };
  const second = await secondHost.execute(request);
  assert.equal(second.result.outcome, "verified");
  assert.equal(second.replayed, false);
  assert.notEqual(second.governance.approvalDigest, first.governance.approvalDigest);
  assert.equal((await secondHost.execute(request)).replayed, true);
  await assert.rejects(secondHost.execute(value.request), /identity|bound to different content/i);
});

test("CLI governed entry reports its missing host instead of falling back to preview", async t => {
  const value = await workspace(t);
  const cli = new URL("../examples/modular/desktop.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(cli), "governed-run", value.workspace, "missing.json"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).code, "GOVERNED_HOST_REQUIRED");
  await assert.rejects(access(join(value.workspace, ".devrelay")), { code: "ENOENT" });
  await noEffects(value);
});

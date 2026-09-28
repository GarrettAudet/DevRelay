import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, cp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "examples/modular/desktop.mjs");
const context = join(root, "examples/modular/context");
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {cwd: root, encoding:"utf8", windowsHide:true, timeout:30000});
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "devrelay-desktop-"));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const workspace = join(directory, "project");
  const requestPath = join(directory, "request.json");
  await writeFile(requestPath, JSON.stringify({requestId:"hello", goal:"Create a tested greeting",
    readPaths:[], changes:[
      {path:"greet.mjs", beforeDigest:null, content:'export const greet = () => "hello";\n'},
      {path:"test/greet.test.mjs", beforeDigest:null, content:'import {test} from "node:test"; import assert from "node:assert/strict"; import {greet} from "../greet.mjs"; test("greeting", () => assert.equal(greet(), "hello"));\n'}
    ], testFiles:["test/greet.test.mjs"], timeoutMs:10000}));
  return {directory, workspace, requestPath};
}
test("Desktop setup creates a new project and reopens saved context for execution and replay", async t => {
  const {workspace, requestPath} = await fixture(t);
  const setup = run(["setup", "new", workspace, context]);
  assert.equal(setup.status, 0, setup.stderr);
  assert.equal(JSON.parse(setup.stdout).configured, true);
  const first = run(["run", workspace, requestPath]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).result.outcome, "verified");
  assert.match(JSON.parse(first.stdout).report.diff, /greet.mjs/);
  const replay = run(["run", workspace, requestPath]);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).replayed, true);
  await writeFile(join(workspace, "greet.mjs"), "drift");
  const drift = run(["run", workspace, requestPath]);
  assert.equal(drift.status, 1, drift.stderr);
  assert.equal(JSON.parse(drift.stdout).currentWorkspaceMatches, false);
});
test("Desktop existing setup preserves files and refuses context replacement", async t => {
  const {directory, workspace} = await fixture(t);
  await mkdir(workspace);
  await writeFile(join(workspace, "keep.txt"), "keep");
  const first = run(["setup", "existing", workspace, context]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(run(["setup", "existing", workspace, context]).status, 0);
  assert.equal(await readFile(join(workspace, "keep.txt"), "utf8"), "keep");
  const otherContext = join(directory, "context");
  await cp(context, otherContext, {recursive:true});
  await writeFile(join(otherContext, "ProjectOverview.md"), "wrong projection");
  assert.equal(run(["setup", "existing", workspace, otherContext]).status, 2);
  assert.equal(run(["setup", "new", workspace, context]).status, 2);
});
test("invalid context has no new-project effects and existing requires an existing directory", async t => {
  const {directory, workspace} = await fixture(t);
  const bad = join(directory, "bad-context");
  await cp(context, bad, {recursive:true});
  await writeFile(join(bad, "ProjectOverview.md"), "invalid");
  const result = run(["setup", "new", workspace, bad]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ProjectOverview|digest/);
  await assert.rejects(access(workspace), {code:"ENOENT"});
  assert.equal(run(["setup", "existing", workspace, context]).status, 2);
  await assert.rejects(access(workspace), {code:"ENOENT"});
});
test("Desktop entry point lists plugins, rejects absent setup and imports inertly", async t => {
  const {workspace} = await fixture(t);
  const list = run(["list"]);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).length, 3);
  assert.equal(run(["run", workspace, "missing.json"]).status, 2);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e",
    'await import("devrelay/examples/modular/desktop.mjs")'], {cwd:root, encoding:"utf8", windowsHide:true});
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "");
});

test("oversized combined context is rejected before new project creation", async t => {
  const {directory, workspace} = await fixture(t);
  const supplied = join(directory, "large-context");
  await cp(context, supplied, {recursive:true});
  const requirements = Buffer.concat([await readFile(join(supplied, "requirements-baseline.json")), Buffer.alloc(12 * 1024 * 1024, 32)]);
  const overview = JSON.parse(await readFile(join(supplied, "project-overview-baseline.json")));
  const {createHash} = await import("node:crypto");
  overview.requirementsBaseline.digest = "sha256:" + createHash("sha256").update(requirements).digest("hex");
  await writeFile(join(supplied, "requirements-baseline.json"), requirements);
  await writeFile(join(supplied, "project-overview-baseline.json"), JSON.stringify(overview));
  const setup = run(["setup","new",workspace,supplied]);
  assert.equal(setup.status, 2, setup.stderr);
  assert.match(setup.stderr, /Combined project context/);
  await assert.rejects(access(workspace), {code:"ENOENT"});
});
test("saved context cannot be silently tampered with or copied to another workspace", async t => {
  const {directory, workspace, requestPath} = await fixture(t);
  assert.equal(run(["setup","new",workspace,context]).status, 0);
  const configuration = join(workspace,".devrelay/modular-project.json");
  const saved = JSON.parse(await readFile(configuration));
  saved.context[0].digest = "sha256:" + "0".repeat(64);
  await writeFile(configuration, JSON.stringify(saved));
  const tampered = run(["run",workspace,requestPath]);
  assert.equal(tampered.status, 2);
  assert.match(tampered.stderr, /digest mismatch/);
  await assert.rejects(access(join(workspace,"greet.mjs")), {code:"ENOENT"});
  const copied = join(directory,"copied");
  await cp(workspace,copied,{recursive:true});
  assert.match(run(["run",copied,requestPath]).stderr, /does not match this workspace/);
});

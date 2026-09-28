import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(script, args=[]) {
  return spawnSync(process.execPath, [script, ...args], {encoding:"utf8", windowsHide:true, timeout:30000});
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "devrelay-plugin-runtime-"));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const plugin = join(directory, "plugin");
  await cp(join(root, "plugins/devrelay-desktop"), plugin, {recursive:true});
  const runtime = join(directory, "runtime");
  await mkdir(join(runtime, "examples/modular"), {recursive:true});
  await writeFile(join(runtime, "package.json"), JSON.stringify({name:"devrelay", version:"0.12.0-test"}));
  await writeFile(join(runtime, "examples/modular/desktop.mjs"), 'export async function main(args) { console.log(JSON.stringify(args)); }\n');
  return {directory, plugin, runtime, configure:join(plugin,"scripts/configure-runtime.mjs"), launcher:join(plugin,"scripts/code.mjs")};
}
test("plugin launcher requires explicit configuration and forwards arguments to the pinned runtime", async t => {
  const {plugin, runtime, configure, launcher} = await fixture(t);
  const missing = run(launcher, ["list"]);
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /configure-runtime/);
  const configured = run(configure, [runtime]);
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(JSON.parse(await readFile(join(plugin, "runtime.json"))).runtimeRoot, runtime);
  const launched = run(launcher, ["run", "path with spaces", "request.json"]);
  assert.equal(launched.status, 0, launched.stderr);
  assert.deepEqual(JSON.parse(launched.stdout), ["run", "path with spaces", "request.json"]);
});
test("plugin refuses runtime drift and requires an explicit configuration replacement", async t => {
  const {runtime, configure, launcher} = await fixture(t);
  assert.equal(run(configure, [runtime]).status, 0);
  await writeFile(join(runtime, "examples/modular/desktop.mjs"), 'throw new Error("must not execute");\n');
  const drift = run(launcher, ["list"]);
  assert.equal(drift.status, 2);
  assert.match(drift.stderr, /digest/);
  assert.doesNotMatch(drift.stderr, /must not execute/);
  assert.equal(run(configure, [runtime]).status, 2);
  assert.equal(run(configure, [runtime, "--replace"]).status, 0);
  await writeFile(join(runtime, "package.json"), '{"name":"devrelay","version":"changed"}');
  assert.match(run(launcher, ["list"]).stderr, /version/);
});
test("configured plugin can load the actual runtime and list supported bindings", async t => {
  const {configure, launcher} = await fixture(t);
  const configured = run(configure, [root]);
  assert.equal(configured.status, 0, configured.stderr);
  const listed = run(launcher, ["list"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).map(item => item.id),
    ["native-repository-inventory","native-file-change","native-node-test"]);
});

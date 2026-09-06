import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const script = path.join(root, "plugins", "devrelay-desktop", "scripts", "lifecycle-hook.mjs");
const bootstrapScript = path.join(root, "plugins", "devrelay-desktop", "scripts", "memory-bootstrap.mjs");
const invoke = (dataDirectory, input) => execFileSync(process.execPath, [script], {
  cwd: root,
  input: JSON.stringify(input),
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, PLUGIN_DATA: dataDirectory },
});

test("explicit host lifecycle bridge bootstraps, checkpoints, concludes, and recovers ProjectMemory", (t) => {
  const data = mkdtempSync(path.join(tmpdir(), "devrelay-desktop-plugin-"));
  t.after(() => rmSync(data, { recursive: true, force: true }));
  const common = { session_id: "SESSION-PLUGIN-1", transcript_path: null, cwd: root, model: "test" };
  const started = JSON.parse(invoke(data, { ...common, hook_event_name: "SessionStart", source: "startup", permission_mode: "default" }));
  assert.equal(started.continue, true);
  assert.match(started.hookSpecificOutput.additionalContext, /ProjectMemory bootstrap verified/u);
  const stopped = JSON.parse(invoke(data, { ...common, hook_event_name: "Stop", turn_id: "TURN-1", permission_mode: "default" }));
  assert.match(stopped.systemMessage, /checkpoint/u);
  assert.equal(invoke(data, { ...common, hook_event_name: "SessionEnd", reason: "other" }), "");
  const next = JSON.parse(invoke(data, { ...common, session_id: "SESSION-PLUGIN-2", hook_event_name: "SessionStart", source: "startup", permission_mode: "default" }));
  assert.match(next.hookSpecificOutput.additionalContext, /SESSION-PLUGIN-1:candidate/u);
});

test("explicit host lifecycle bridge ignores unrelated projects", (t) => {
  const data = mkdtempSync(path.join(tmpdir(), "devrelay-desktop-plugin-"));
  const unrelated = mkdtempSync(path.join(tmpdir(), "devrelay-unrelated-"));
  t.after(() => { rmSync(data, { recursive: true, force: true }); rmSync(unrelated, { recursive: true, force: true }); });
  const output = invoke(data, { session_id: "SESSION-X", transcript_path: null, cwd: unrelated, model: "test", hook_event_name: "SessionStart", source: "startup", permission_mode: "default" });
  assert.equal(output, "");
});

test("repository bootstrap command validates the exact persistent memory chain", () => {
  const output = execFileSync(process.execPath, [bootstrapScript, "--task-id", "TASK-BOOTSTRAP-1", "--repository-revision", "a".repeat(40)], { cwd: root, encoding: "utf8", windowsHide: true });
  const result = JSON.parse(output);
  assert.equal(result.receipt.outcome, "pass");
  assert.equal(result.receipt.projectMemoryBaseline.artifactId, "PMB-MUC-405C2614B0D0DF42");
  assert.equal(result.memoryContext.bootstrapReceipt.digest, result.receiptRef.digest);
  assert.match(result.synopsis, /MEM-DEVRELAY-DESKTOP-ORCHESTRATION/u);
  assert.doesNotMatch(readFileSync(bootstrapScript, "utf8"), /\.\.\/\.\.\/\.\.\/src\//u);
});

test("dependency-free bootstrap is byte-equivalent to the schema-validated Core result", async () => {
  const taskId = "TASK-BOOTSTRAP-EQUIVALENCE";
  const revision = "b".repeat(40);
  const actual = JSON.parse(execFileSync(process.execPath, [bootstrapScript, "--task-id", taskId, "--repository-revision", revision], { cwd: root, encoding: "utf8", windowsHide: true }));
  const { loadDesktopProjectMemoryBootstrap } = await import("../src/desktop-project-memory-bootstrap.mjs");
  const expected = loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId, repositoryRevision: revision });
  assert.deepEqual(actual, expected);
});

test("repository bootstrap command fails closed on synopsis drift", (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "devrelay-memory-bootstrap-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const directory of ["project", "dogfood/ep-001-environment-preparation/final-acceptance"]) mkdirSync(path.join(fixture, directory), { recursive: true });
  for (const file of ["project-memory-baseline.json", "project-memory-promotion.commit.json", "project-memory-bootstrap-manifest.json"]) copyFileSync(path.join(root, "project", file), path.join(fixture, "project", file));
  copyFileSync(path.join(root, "dogfood", "ep-001-environment-preparation", "final-acceptance", "29-business-acceptance-graph.json"), path.join(fixture, "dogfood", "ep-001-environment-preparation", "final-acceptance", "29-business-acceptance-graph.json"));
  writeFileSync(path.join(fixture, "project", "CurrentSynopsis.md"), "stale\n");
  assert.throws(() => execFileSync(process.execPath, [bootstrapScript, "--task-id", "TASK-BOOTSTRAP-DRIFT", "--project-root", fixture], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "pipe" }), /Command failed/u);
});

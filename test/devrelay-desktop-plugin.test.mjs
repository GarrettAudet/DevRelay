import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const script = path.join(root, "plugins", "devrelay-desktop", "scripts", "lifecycle-hook.mjs");
const invoke = (dataDirectory, input) => execFileSync(process.execPath, [script], {
  cwd: root,
  input: JSON.stringify(input),
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, PLUGIN_DATA: dataDirectory },
});

test("Desktop plugin hooks bootstrap, checkpoint, conclude, and recover ProjectMemory", (t) => {
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

test("Desktop plugin hook ignores unrelated projects", (t) => {
  const data = mkdtempSync(path.join(tmpdir(), "devrelay-desktop-plugin-"));
  const unrelated = mkdtempSync(path.join(tmpdir(), "devrelay-unrelated-"));
  t.after(() => { rmSync(data, { recursive: true, force: true }); rmSync(unrelated, { recursive: true, force: true }); });
  const output = invoke(data, { session_id: "SESSION-X", transcript_path: null, cwd: unrelated, model: "test", hook_event_name: "SessionStart", source: "startup", permission_mode: "default" });
  assert.equal(output, "");
});

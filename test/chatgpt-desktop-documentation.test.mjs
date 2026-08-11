import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("Windows Desktop guide covers the bounded operator and recovery contract", () => {
  const guide = read("docs/chatgpt-desktop-windows.md");
  for (const required of [
    "Node.js 20", "install-chatgpt-desktop-plugin.ps1", "chatgpt-desktop-plugin-health-check.ps1",
    "devrelay_create_run", "devrelay_inspect_run", "devrelay_submit_clarification",
    "devrelay_submit_gate_decision", "devrelay_progress_run", "devrelay_resume_run",
    "devrelay_get_evidence", "expectedRevision", "clarification-required", "gate-required",
    "WorkItemVerification", "ChangeIntegration", "fixture-conformant", "release-ready",
    "compare-and-swap", "rollback", "uninstall", "npm run desktop:release:verify",
  ]) assert.match(guide, new RegExp(required, "u"), `missing ${required}`);

  assert.match(guide, /not a public plugin-directory\s+release/iu);
  assert.match(guide, /does not introduce a hosted DevRelay backend/iu);
  assert.match(guide, /do\s+not approve themselves/iu);
  assert.match(guide, /not live upstream-tool\s+interoperability/iu);
});

test("root and plugin documentation lead operators to the Windows guide", () => {
  assert.match(read("README.md"), /\[local installation, operation, recovery, and maturity guide\]\(docs\/chatgpt-desktop-windows\.md\)/u);
  const plugin = read("plugins/devrelay/README.md");
  assert.match(plugin, /docs\/chatgpt-desktop-windows\.md/u);
  assert.match(plugin, /local typed DevRelay STDIO MCP bridge/iu);
  assert.match(plugin, /never selects routes/iu);
  assert.match(plugin, /fixture-conformant.*does not mean\s+live interoperability/isu);
});

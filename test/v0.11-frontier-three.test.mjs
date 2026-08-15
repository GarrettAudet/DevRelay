import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createGodotCompatibilityPolicy, evaluateGodotCompatibility, verifyGodotCompatibilityPolicy } from "../src/godot-compatibility.mjs";
import { createModuleQualityReport, renderModuleQualityReportMarkdown } from "../src/module-quality-report.mjs";

const digest = (seed) => sha256Digest(Buffer.from(seed));
const ref = (artifactId) => ({ artifactId, digest: digest(artifactId) });

test("four repository-scoped Desktop skills are concise and cannot acquire Core authority", () => {
  const names = ["devrelay-cycle", "devrelay-godot-release", "devrelay-plugin-conformance", "devrelay-trace-query"];
  for (const name of names) {
    const root = path.resolve(".codex/skills", name);
    const skill = fs.readFileSync(path.join(root, "SKILL.md"), "utf8");
    const ui = fs.readFileSync(path.join(root, "agents/openai.yaml"), "utf8");
    assert.match(skill, new RegExp("^---\\nname: " + name + "\\n", "u"));
    assert.match(skill, /Core/u);
    assert.match(skill, /never|cannot|Never/u);
    assert.doesNotMatch(skill, /TODO/u);
    assert.match(ui, new RegExp("\\$" + name, "u"));
  }
});

test("Godot compatibility is exact, evidence-backed, offline, and non-authoritative", () => {
  const evidence = [ref("GODOT-AI-MCP"), ref("GDUNIT4-JUNIT")];
  const policy = createGodotCompatibilityPolicy({ policyId: "GCP-V011", supportedTuples: [{ godotVersion: "4.7.1", gdunitVersion: "6.2.0", godotAiVersion: "3.1.5", platform: "win32", architecture: "x64", evidence }] });
  assert.equal(verifyGodotCompatibilityPolicy(policy), true);
  const supported = evaluateGodotCompatibility({ decisionId: "GCD-1", policy, godotVersion: "4.7.1", gdunitVersion: "6.2.0", godotAiVersion: "3.1.5", platform: "win32", architecture: "x64", evidence });
  assert.equal(supported.outcome, "supported");
  assert.equal(supported.releaseAuthority, false);
  assert.equal(evaluateGodotCompatibility({ decisionId: "GCD-2", policy, godotVersion: "4.7.2", gdunitVersion: "6.2.0", godotAiVersion: "3.1.5", platform: "win32", architecture: "x64", evidence }).outcome, "unsupported");
  assert.equal(evaluateGodotCompatibility({ decisionId: "GCD-3", policy, godotVersion: "4.7.1", gdunitVersion: "6.2.0", godotAiVersion: "3.1.5", platform: "win32", architecture: "x64", evidence: [evidence[0]] }).outcome, "needs-evidence");
  assert.throws(() => verifyGodotCompatibilityPolicy({ ...policy, networkAccess: "allowed" }), /invalid/);
});

test("materialized Godot compatibility policy replays against exact live evidence", () => {
  const policy = JSON.parse(fs.readFileSync("dogfood/v0.11-module-quality/providers/godot-compatibility-policy.json", "utf8"));
  const decision = JSON.parse(fs.readFileSync("dogfood/v0.11-module-quality/providers/godot-compatibility-decision.json", "utf8"));
  assert.equal(verifyGodotCompatibilityPolicy(policy), true);
  const supported = policy.supportedTuples[0];
  const replay = evaluateGodotCompatibility({ decisionId: decision.decisionId, policy, ...supported, evidence: supported.evidence });
  assert.deepEqual(replay, decision);
  assert.equal(decision.outcome, "supported");
  assert.equal(decision.releaseAuthority, false);
});

test("module-quality report is dynamic, compact, ASCII-safe, and shows operation and plug-in bindings", () => {
  const report = createModuleQualityReport({ reportId: "MQR-1", runId: "RUN-1", stages: [{ sequence: 2, module: "ArchitectureDesign", operation: "design-change", plugin: "OpenSpec", maturity: "live-conformant", outcome: "promoted", evidence: "ARCH" }, { sequence: 1, module: "RequirementsGathering", operation: "gather-change", plugin: "Spec Kit", maturity: "live-conformant", outcome: "promoted", evidence: "REQ" }], workItems: [{ id: "WI-1", outcome: "integrated", evidence: "CI-1" }], providers: [{ id: "OpenSpec", maturity: "live-conformant", evidence: "PEA-1" }], metrics: [{ name: "duration", value: "12ms", provenance: "receipt" }], nextAction: "Verify." });
  const markdown = renderModuleQualityReportMarkdown(report);
  assert.ok(markdown.length < 4000);
  assert.match(markdown, /ArchitectureDesign \| design-change \| OpenSpec/u);
  assert.match(markdown, /OpenSpec: live-conformant -> PEA-1/u);
  assert.doesNotMatch(markdown, /â|→/u);
  assert.equal(renderModuleQualityReportMarkdown(report), markdown);
});

test("frontier-three APIs are exported", async () => {
  const api = await import("../src/index.mjs");
  for (const name of ["createModuleQualityReport", "renderModuleQualityReportMarkdown"])
    assert.equal(typeof api[name], "function", name);
  const godotPack = await import("../packs/godot/index.mjs");
  for (const name of ["createGodotCompatibilityPolicy", "evaluateGodotCompatibility"])
    assert.equal(typeof godotPack[name], "function", name);
});

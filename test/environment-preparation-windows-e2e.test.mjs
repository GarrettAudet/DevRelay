import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
  validateTraceabilityGraphSnapshot,
} from "../src/index.mjs";

const root = resolve("dogfood/ep-001-environment-preparation/windows-e2e");
const bytes = (name) => readFileSync(resolve(root, name));
const json = (name) => JSON.parse(bytes(name));
const summary = json("windows-e2e-summary.json");
const receipt = json("installed-package-verification-receipt.json");
const scenario = json('installed-scenario-receipt.json');
const installedScenarioSource = bytes('installed-scenario.mjs').toString('utf8');

test('EP-001 optional configuration read is race-safe and fails closed on non-ENOENT errors', () => {
  assert.equal(installedScenarioSource.includes('existsSync(configurationPath)'), false);
  assert.equal(installedScenarioSource.includes("before = readFileSync(configurationPath);"), true);
  assert.equal(installedScenarioSource.includes("error?.code !== 'ENOENT'"), true);
});

test("EP-001 clean Windows consumer imports the packed library and completes the environment circuit", () => {
  assert.equal(summary.kind, "Ep001InstalledPackageVerificationReceipt");
  assert.equal(summary.outcome, "pass");
  assert.deepEqual(summary.host, { application: "ChatGPT Desktop", executor: "Codex", operatingSystem: "Windows" });
  assert.equal(summary.package.name, "devrelay");
  assert.equal(summary.package.version, "0.10.0-rc.3");
  assert.match(summary.package.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(scenario.packageImport, "devrelay/advanced");
  assert.equal(scenario.initialGap.outcome, "remediation-required");
  assert.equal(scenario.firstExecution.outcome, "recorded");
  assert.equal(scenario.resumedExecution.outcome, "recorded");
});

test("EP-001 induced drift blocks execution until approved remediation and re-verification", () => {
  assert.equal(scenario.drift.detected, true);
  assert.equal(scenario.drift.route, "remediate-drift");
  assert.equal(scenario.drift.blockedOutcome, "baseline-drift");
  assert.equal(scenario.drift.blockedBeforeExecution, true);
  assert.equal(scenario.establishment.replayEffectCalls, 0);
  assert.equal(scenario.recovery.replayEffectCalls, 0);
  assert.equal(scenario.recovery.gateReplayEvaluationCalls, 0);
  assert.equal(scenario.recovery.rollback.supported, true);
  assert.equal(scenario.evidence.effectCalls, 2);
  assert.notEqual(scenario.initialGap.fingerprint, scenario.recovery.restoredFingerprint);
  assert.equal(scenario.evidence.inventoryFingerprints[1].fingerprint, scenario.recovery.restoredFingerprint);
  assert.equal(scenario.evidence.inventoryFingerprints[3].fingerprint, scenario.recovery.restoredFingerprint);
});

test("EP-001 evidence preserves exact commands, grants, fingerprints, receipts, and a closed traceability graph", () => {
  assert.ok(scenario.evidence.rawObservationReceipts.some(({ command }) => command.command === "node" && command.exitCode === 0));
  assert.deepEqual(scenario.evidence.grants, [{ kind: "filesystem.write", purpose: "Create the approved project-local environment marker.", scope: "project:.devrelay/environment-ready.json" }]);
  assert.match(scenario.firstExecution.readiness.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(scenario.resumedExecution.readiness.digest, /^sha256:[0-9a-f]{64}$/u);
  const graph = validateTraceabilityGraphSnapshot(scenario.traceability.graph);
  assert.equal(graph.vocabulary.version, "1.7.0");
  assert.equal(scenario.traceability.mergeReceipt.diagnostics.some(({ blocking }) => blocking), false);
  for (const edge of ["realized-by", "specified-by", "accepted-by", "designed-by", "planned-by", "required-by", "authorizes-environment-for"]) {
    assert.ok(graph.edges.some(({ kind }) => kind === edge), edge);
  }
});

test("EP-001 raw command assets, scenario bytes, report, and content seals remain exact", () => {
  for (const [key, name] of [
    ["packStdout", "raw/npm-pack.stdout.txt"],
    ["packStderr", "raw/npm-pack.stderr.txt"],
    ["installStdout", "raw/npm-install.stdout.txt"],
    ["installStderr", "raw/npm-install.stderr.txt"],
    ["scenarioStdout", "raw/installed-scenario.stdout.txt"],
    ["scenarioStderr", "raw/installed-scenario.stderr.txt"],
  ]) {
    assert.equal(summary.rawReceipts[key].digest, sha256Digest(bytes(name)), key);
  }
  assert.equal(summary.scenario.digest, sha256Digest(bytes("installed-scenario-receipt.json")));
  assert.equal(summary.report.digest, sha256Digest(bytes("WindowsDesktopE2EReport.md")));
  const { receiptDigest, ...receiptMaterial } = receipt;
  assert.equal(receiptDigest, canonicalJsonDigest(receiptMaterial));
  const { receiptDigest: scenarioDigest, ...scenarioMaterial } = scenario;
  assert.equal(scenarioDigest, canonicalJsonDigest(scenarioMaterial));
  assert.equal(canonicalJson(summary).includes("AppData/Local/Temp"), false);
});

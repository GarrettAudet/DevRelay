import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalJsonDigest,
  sha256Digest,
  validateLifecycleRunReportArtifact,
  validateTraceabilityGraphSnapshot,
  verifyTwoPhaseEvidenceSeal,
} from "../src/index.mjs";

const root = path.resolve("dogfood/v0.11-module-quality/windows-e2e");
const project = path.join(root, "external-project");
const evidence = path.join(project, "evidence");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const summary = readJson(path.join(root, "evidence/windows-godot-dogfood-summary.json"));

test("installed candidate completes the approved Windows Desktop lifecycle", () => {
  assert.equal(summary.kind, "WindowsGodotDogfoodSummary");
  assert.equal(summary.host.application, "ChatGPT Desktop");
  assert.equal(summary.host.operatingSystem, "Windows");
  assert.equal(summary.outcome, "accepted");
  assert.deepEqual(summary.software.tests, { failed: 0, passed: 3, total: 3 });
  assert.equal(summary.modules.length, 20);
  for (const required of ["RequirementsGathering", "ArchitectureDiscovery", "ArchitectureDesign", "WorkBreakdown", "WorkDependencyAnalysis", "SpecialistAssignment", "WorkExecution", "WorkItemVerification", "ChangeIntegration", "SystemVerification", "BusinessAcceptanceGate"]) {
    assert.ok(summary.modules.some(({ module }) => module === required), required);
  }
  assert.equal(summary.summaryDigest, canonicalJsonDigest(Object.fromEntries(Object.entries(summary).filter(([key]) => !["apiVersion", "kind", "summaryDigest"].includes(key)))));
});

test("candidate identity, live providers, graph, report, and trace query remain exact", () => {
  assert.match(summary.package.tarball.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(summary.liveProviders.length >= 4);
  assert.ok(summary.liveProviders.every(({ maturity }) => maturity === "live-conformant"));
  const graph = readJson(path.join(evidence, "traceability-graph.json"));
  assert.equal(validateTraceabilityGraphSnapshot(graph), graph);
  const snapshot = readJson(path.join(evidence, "lifecycle-run-snapshot.json"));
  assert.equal(validateLifecycleRunReportArtifact(snapshot), snapshot);
  const query = readJson(path.join(evidence, "trace-query.json"));
  assert.equal(query.total, 2);
  assert.equal(sha256Digest(fs.readFileSync(path.join(evidence, "LifecycleRunReport.md"))), summary.reportDigest);
});

test("implementation and evidence commits form a reconstructable two-phase seal", () => {
  const implementationSeal = readJson(path.join(evidence, "implementation-seal.json"));
  const evidenceSeal = readJson(path.join(root, "evidence/evidence-seal.json"));
  const bundle = path.join(root, "evidence/greeting-card-history.bundle");
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "devrelay-v011-godot-history-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--branch", "main", bundle, checkout], { windowsHide: true });
    assert.equal(execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(), summary.integration.evidenceCommit);
    assert.equal(execFileSync("git", ["-C", checkout, "rev-parse", "HEAD^"], { encoding: "utf8", windowsHide: true }).trim(), summary.integration.implementationCommit);
    assert.equal(execFileSync("git", ["-C", checkout, "status", "--porcelain"], { encoding: "utf8", windowsHide: true }).trim(), "");
    assert.equal(verifyTwoPhaseEvidenceSeal({
    implementationSeal,
    evidenceSeal,
    observation: {
      targetRef: "refs/heads/main",
      targetCommit: summary.integration.evidenceCommit,
      evidenceParentCommit: summary.integration.implementationCommit,
      implementationParentCommit: summary.integration.baselineCommit,
      implementationTreeDigest: implementationSeal.treeDigest,
      evidenceManifestDigest: evidenceSeal.evidenceManifestDigest,
      worktreeClean: true,
    },
  }), true);
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
  }
});

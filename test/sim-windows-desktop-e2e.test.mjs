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

const root = path.resolve("dogfood/sim-001-simplification/windows-e2e");
const project = path.join(root, "external-project");
const evidence = path.join(project, "evidence");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const summary = readJson(path.join(root, "evidence/windows-desktop-dogfood-summary.json"));

test("SIM-001 installed RC completes the production Windows Desktop lifecycle", () => {
  assert.equal(summary.kind, "Sim001WindowsDesktopDogfoodSummary");
  assert.deepEqual(summary.host, {
    application: "ChatGPT Desktop",
    operatingSystem: "Windows",
    executor: "Codex",
  });
  assert.equal(summary.package.name, "devrelay");
  assert.equal(summary.package.version, "0.10.0-rc.2");
  assert.equal(summary.operator.profile, "standard");
  assert.deepEqual(summary.operator.commands.map(({ command, exitCode }) => ({ command, exitCode })), [
    { command: "init", exitCode: 0 },
    { command: "run", exitCode: 0 },
    { command: "resume", exitCode: 0 },
    { command: "status", exitCode: 0 },
    { command: "verify", exitCode: 0 },
    { command: "inspect", exitCode: 0 },
    { command: "evidence", exitCode: 0 },
  ]);
  assert.equal(summary.outcome, "accepted");
  assert.deepEqual(summary.software.tests, { failed: 0, passed: 3, total: 3 });
  assert.equal(summary.modules.length, 20);
  for (const required of [
    "RequirementsGathering",
    "RequirementsGate",
    "ArchitectureDiscovery",
    "ArchitectureDesign",
    "ArchitectureGate",
    "ContractGeneration",
    "ContractGate",
    "WorkBreakdown",
    "WorkBreakdownGate",
    "WorkDependencyAnalysis",
    "WorkDependencyGate",
    "SpecialistAssignment",
    "SpecialistAssignmentGate",
    "WorkExecution",
    "WorkItemVerification",
    "WorkItemVerificationGate",
    "ChangeIntegration",
    "TraceabilityGraph",
    "SystemVerification",
    "BusinessAcceptanceGate",
  ]) assert.ok(summary.modules.some(({ module }) => module === required), required);
  assert.equal(
    summary.summaryDigest,
    canonicalJsonDigest(
      Object.fromEntries(
        Object.entries(summary).filter(
          ([key]) => !["apiVersion", "kind", "summaryDigest"].includes(key),
        ),
      ),
    ),
  );
});

test("SIM-001 live providers, graph, report, and trace query remain exact", () => {
  assert.match(summary.package.tarball.digest, /^sha256:[0-9a-f]{64}$/u);
  for (const provider of ["openspec", "spec-kit", "structurizr", "madr"])
    assert.ok(summary.liveProviders.some(({ providerId }) => providerId === provider), provider);
  assert.ok(summary.liveProviders.every(({ maturity }) => maturity === "live-conformant"));
  const graph = readJson(path.join(evidence, "traceability-graph.json"));
  assert.equal(validateTraceabilityGraphSnapshot(graph), graph);
  const snapshot = readJson(path.join(evidence, "lifecycle-run-snapshot.json"));
  assert.equal(validateLifecycleRunReportArtifact(snapshot), snapshot);
  const query = readJson(path.join(evidence, "trace-query.json"));
  assert.equal(query.total, 2);
  assert.equal(
    sha256Digest(fs.readFileSync(path.join(evidence, "LifecycleRunReport.md"))),
    summary.reportDigest,
  );
});

test("SIM-001 software implementation and evidence commits are reconstructable", () => {
  const implementationSeal = readJson(path.join(evidence, "implementation-seal.json"));
  const evidenceSeal = readJson(path.join(root, "evidence/evidence-seal.json"));
  const bundle = path.join(root, "evidence/greeting-card-history.bundle");
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "devrelay-sim001-history-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--branch", "main", bundle, checkout], {
      windowsHide: true,
    });
    const rev = (...args) =>
      execFileSync("git", ["-C", checkout, ...args], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
    assert.equal(rev("rev-parse", "HEAD"), summary.integration.evidenceCommit);
    assert.equal(rev("rev-parse", "HEAD^"), summary.integration.implementationCommit);
    assert.equal(rev("status", "--porcelain"), "");
    assert.equal(
      verifyTwoPhaseEvidenceSeal({
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
      }),
      true,
    );
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
  }
});

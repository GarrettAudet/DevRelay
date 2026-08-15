import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  validateBusinessAcceptanceArtifact,
  validateSystemVerificationArtifact,
} from "../src/index.mjs";

const root = path.resolve("dogfood/sim-001-simplification/final-acceptance");
const readJson = (target) => JSON.parse(fs.readFileSync(target, "utf8"));

test("SIM-001 final modules accepted the complete approved scope", () => {
  const summary = readJson(path.join(root, "final-acceptance-summary.json"));
  const verification = readJson(path.join(root, "system-verification-result.json"));
  const acceptance = readJson(path.join(root, "business-acceptance-record.json"));
  const systemEvaluation = readJson(path.join(root, "11-system-verification-evaluation.json"));
  const businessCandidate = readJson(path.join(root, "21-business-acceptance-candidate.json"));
  const ownerApproval = readJson(path.join(root, "24-business-acceptance-owner-approval.json"));

  assert.equal(validateSystemVerificationArtifact(verification, { evaluation: systemEvaluation }), verification);
  assert.equal(
    validateBusinessAcceptanceArtifact(acceptance, {
      candidate: businessCandidate,
      approval: ownerApproval,
    }),
    acceptance,
  );
  assert.equal(verification.outcome, "verified");
  assert.equal(acceptance.outcome, "accepted");
  assert.deepEqual(summary.coverage, {
    acceptanceCriteria: 119,
    nonFunctionalRequirements: 32,
    businessObjectives: 14,
    successMetrics: 18,
    businessScopes: 43,
    integratedWorkItems: 12,
  });
  assert.equal(summary.blockingDiagnostics, 0);
  assert.equal(summary.systemReplayVerifierCalls, 0);
  assert.equal(summary.gateReplayCalls, 0);
});

test("SIM-001 final traceability checkpoint is acceptance-scoped and nonblocking", () => {
  const summary = readJson(path.join(root, "final-acceptance-summary.json"));
  const proof = readJson(path.join(root, "30-final-acceptance-proof.json"));
  const diagnostics = readJson(path.join(root, "31-traceability-diagnostics.json"));

  assert.equal(summary.traceabilityGraph.digest, proof.traceabilityCheckpoint.digest);
  assert.equal(summary.traceabilityGraph.digest, "sha256:14b4fdd3d4745276b56ee86a7302d1c99e1be1359a891f5e6653172653c7feea");
  assert.equal(proof.graphHorizon, "acceptance");
  assert.equal(diagnostics.blocking, 0);
  assert.equal(diagnostics.outcome, "pass");
});

test("SIM-001 final frontier and release evidence close every planned work item", () => {
  const frontier = readJson(
    path.resolve("dogfood/sim-001-simplification/frontier-7/ready-frontier.json"),
  );
  const evidence = readJson(path.join(root, "00-release-candidate-evidence-set.json"));

  assert.deepEqual(frontier.readyWorkItemIds, []);
  assert.equal(frontier.completionFacts.length, 12);
  assert.equal(new Set(frontier.completionFacts.map((fact) => fact.artifactId)).size, 12);
  assert.ok(frontier.dispositions.every((disposition) => disposition.status === "completed"));
  assert.equal(evidence.verification.failed, 0);
  assert.equal(evidence.verification.total, 983);
});

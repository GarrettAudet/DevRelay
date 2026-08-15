import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  canonicalJsonDigest,
  validateBusinessAcceptanceArtifact,
  validateSystemVerificationArtifact,
  validateTraceabilityGraphSnapshot,
} from "../src/index.mjs";

const root = path.resolve("dogfood/v0.11-module-quality/final-acceptance");
const handoff = path.resolve("handoff/2026-08-14-v011-module-quality-release-ready");
const readJson = (target) => JSON.parse(fs.readFileSync(target, "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("V0.11 final modules accepted the complete approved scope", () => {
  const summary = readJson(path.join(root, "final-acceptance-summary.json"));
  const verification = readJson(path.join(root, "system-verification-result.json"));
  const acceptance = readJson(path.join(root, "business-acceptance-record.json"));
  const systemEvaluation = readJson(path.join(root, "11-system-verification-evaluation.json"));
  const businessCandidate = readJson(path.join(root, "21-business-acceptance-candidate.json"));
  const ownerApproval = readJson(path.join(root, "24-business-acceptance-owner-approval.json"));
  assert.equal(validateSystemVerificationArtifact(verification, { evaluation: systemEvaluation }), verification);
  assert.equal(validateBusinessAcceptanceArtifact(acceptance, { candidate: businessCandidate, approval: ownerApproval }), acceptance);
  assert.equal(verification.outcome, "verified");
  assert.equal(acceptance.outcome, "accepted");
  assert.deepEqual(summary.coverage, {
    acceptanceCriteria: 104,
    nonFunctionalRequirements: 26,
    businessObjectives: 12,
    successMetrics: 14,
    businessScopes: 39,
    integratedWorkItems: 16,
  });
  assert.equal(summary.systemReplayVerifierCalls, 0);
  assert.equal(summary.gateReplayCalls, 0);
});

test("final acceptance graph is canonical and has no blocking diagnostics", () => {
  const graph = readJson(path.join(root, "29-business-acceptance-graph.json"));
  const diagnostics = readJson(path.join(root, "31-traceability-diagnostics.json"));
  assert.equal(validateTraceabilityGraphSnapshot(graph), graph);
  assert.equal(graph.revision, 48);
  assert.equal(graph.horizon, "acceptance");
  assert.equal(diagnostics.blocking, 0);
  assert.equal(diagnostics.outcome, "pass");
});

test("handoff manifest and checksums bind the exact pickup bytes", () => {
  const manifestBytes = fs.readFileSync(path.join(handoff, "MANIFEST.json"));
  const manifest = JSON.parse(manifestBytes);
  for (const entry of manifest.entries) {
    const bytes = fs.readFileSync(path.join(handoff, entry.path));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(`sha256:${sha256(bytes)}`, entry.digest);
  }
  const expected = new Map(fs.readFileSync(path.join(handoff, "SHA256SUMS"), "utf8").trim().split("\n").map((line) => {
    const [digest, ...parts] = line.trim().split(/\s+/u);
    return [parts.join(" "), digest];
  }));
  assert.equal(expected.get("MANIFEST.json"), sha256(manifestBytes));
  assert.equal(manifest.implementationCommit, "868c00e2dc8c0d610d919dbc68256bab9d0e6ca2");
});

test("acceptance proof binds the immutable implementation commit", () => {
  const proof = readJson(path.join(root, "30-final-acceptance-proof.json"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
  const implementation = "868c00e2dc8c0d610d919dbc68256bab9d0e6ca2";
  assert.equal(proof.sourceBaseCommit, implementation);
  assert.equal(proof.blockingDiagnostics, 0);
  assert.equal(proof.disposition, "accepted-for-protected-source-release-promotion");
  if (head !== implementation) {
    const ancestry = execFileSync("git", ["rev-list", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim().split(/\s+/u);
    const evidenceSeal = ancestry.find((candidate) => {
      try {
        return execFileSync("git", ["rev-parse", `${candidate}^`], {
          encoding: "utf8",
          windowsHide: true,
        }).trim() === implementation;
      } catch {
        return false;
      }
    });
    assert.ok(
      evidenceSeal,
      "the checkout ancestry must contain an evidence-seal commit whose direct parent is the implementation commit",
    );
  }
  assert.match(canonicalJsonDigest(proof), /^sha256:[0-9a-f]{64}$/u);
});

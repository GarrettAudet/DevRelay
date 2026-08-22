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
const git = (...args) => execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();

const V011_IMPLEMENTATION_COMMIT = "868c00e2dc8c0d610d919dbc68256bab9d0e6ca2";
const V011_IMPLEMENTATION_TREE = "36e9877f455c224296c5ba14b77d1f22375018c4";
const V011_IMPLEMENTATION_SUBJECT = "Bind release catalogs to tracked source";
const V011_EVIDENCE_SEAL_TREE = "f7914ec112d8192aaa86105428f8e35d00514b65";
const V011_EVIDENCE_SEAL_SUBJECT = "Seal V0.11 tracked-source release evidence";

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
  const head = git("rev-parse", "HEAD");
  assert.equal(proof.sourceBaseCommit, V011_IMPLEMENTATION_COMMIT);
  assert.equal(proof.blockingDiagnostics, 0);
  assert.equal(proof.disposition, "accepted-for-protected-source-release-promotion");
  if (head !== V011_IMPLEMENTATION_COMMIT) {
    const ancestry = git("log", "--format=%H%x00%P%x00%T%x00%s", "HEAD")
      .split("\n")
      .map((line) => {
        const [commit, parents, tree, subject] = line.split("\u0000");
        return { commit, parents: parents === "" ? [] : parents.split(" "), tree, subject };
      });
    const exactEvidenceSeal = ancestry.find(
      (candidate) =>
        candidate.parents.length === 1 && candidate.parents[0] === V011_IMPLEMENTATION_COMMIT,
    );
    if (!exactEvidenceSeal) {
      const rebasedImplementations = ancestry.filter(
        (candidate) =>
          candidate.tree === V011_IMPLEMENTATION_TREE &&
          candidate.subject === V011_IMPLEMENTATION_SUBJECT,
      );
      assert.equal(
        rebasedImplementations.length,
        1,
        "protected-main ancestry must contain exactly one tree-and-subject-equivalent implementation commit",
      );
      const rebasedImplementation = rebasedImplementations[0];
      const rebasedEvidenceSeals = ancestry.filter(
        (candidate) =>
          candidate.parents.length === 1 &&
          candidate.parents[0] === rebasedImplementation.commit &&
          candidate.tree === V011_EVIDENCE_SEAL_TREE &&
          candidate.subject === V011_EVIDENCE_SEAL_SUBJECT,
      );
      assert.equal(
        rebasedEvidenceSeals.length,
        1,
        "protected-main ancestry must retain one direct tree-equivalent evidence-seal child after rebase",
      );
    }
  }
  assert.match(canonicalJsonDigest(proof), /^sha256:[0-9a-f]{64}$/u);
});

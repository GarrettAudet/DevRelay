import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/work-item-verification/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));

const requiredInterfaces = Object.freeze([
  "IF-CG-APPROVED-TRACEABILITY", "IF-CG-CANDIDATE-TRACEABILITY", "IF-CG-CANONICAL-DIFF",
  "IF-CG-FORMAT-VALIDATION", "IF-CG-GATE-CANDIDATE", "IF-CG-GENERATOR-INVOCATION",
  "IF-RUN-COMPARABILITY", "IF-RUN-CONTENT-POLICY", "IF-RUN-HOST-OBSERVATIONS",
  "IF-RUN-INTEGRATED-COMPLETION", "IF-RUN-LIFECYCLE-SNAPSHOT", "IF-RUN-READY-FRONTIER",
  "IF-RUN-REPORT-ACCESS", "IF-RUN-WORKFLOW-FACTS", "IF-SA-APPROVED-TRACEABILITY",
  "IF-SA-CANDIDATE-ASSEMBLY", "IF-SA-CANDIDATE-TRACEABILITY", "IF-SA-ELIGIBILITY-EVALUATION",
  "IF-SA-GATE-CANDIDATE", "IF-SA-RANKER-INVOCATION", "IF-WE-CANDIDATE-TRACEABILITY",
  "IF-WE-EXECUTION-BINDING", "IF-WE-EXECUTOR-INVOCATION", "IF-WE-READINESS-PROOF",
  "IF-WE-RESULT-ASSEMBLY", "IF-WIV-APPROVED-TRACEABILITY", "IF-WIV-CANDIDATE-TRACEABILITY",
  "IF-WIV-EVIDENCE-NORMALIZATION", "IF-WIV-GATE-CANDIDATE", "IF-WIV-INPUT-BINDING",
  "IF-WIV-OBLIGATION-SET", "IF-WIV-POLICY-EVALUATION", "IF-WIV-VERIFIER-BINDING",
  "IF-WIV-VERIFIER-INVOCATION",
]);

const expected = Object.freeze({
  candidate: "sha256:62cf155b41fb9a4d490a2dd6c785d9c195bc63d291e47ff146cbd6b702ad0540",
  gateReview: "sha256:d2847e11cebdc42da5839a7ef8c7f2d34d487815d8b031bd77755ea3db006502",
  conformance: "sha256:23c5d072179e4a62a19246b7a5cc4a2a26aaf00bcdc691f060861713050f2ba7",
  approval: "sha256:5bf0d4b6130ceb594b26934b726acd10c7aa1e09ca7deb26fbf5668cb0db84da",
  baseline: "sha256:90d8281540894e1b19d9e33ea332781fbcf318fead1bc07bca9cf27ca67dc8f7",
  state: "sha256:9c26a93052aec12d36eb0a5378e59e56700fb59480904050a8dd6e19dada86a0",
  proof: "sha256:e7e96e595e3500198eb42c92c4a8bcefeaad766c15ab6a33704f95bf3d0128df",
  journal: "sha256:2ec6a9ecfa68ee110583646dc48c2ad7db1127606569552b11da41bda389c74d",
  previous: "sha256:08d77bce4e294a4ba25374acc8a338dd0c159cd760577d991000c0efe00d5c1d",
});

const promote = () => JSON.parse(execFileSync(
  process.execPath,
  [`${dogfood}materialize.mjs`, "--promote"],
  { cwd: rootPath, encoding: "utf8" },
));

test("approved WIV architecture promotion is exact, restart-safe, and routes to ContractGeneration", async () => {
  const currentBefore = await Promise.all([
    readBytes("project/architecture-baseline.json"),
    readBytes("project/project-architecture-state.json"),
    readBytes("project/architecture-promotion.pending.json"),
    readBytes("project/architecture-promotion.commit.json"),
  ]);
  const first = promote();
  assert.equal(first.status, "ARCHITECTURE_GATE_PROMOTED");
  assert.equal(first.replayAdapterCalls, 0);
  assert.equal(first.architectureChangeSetDigest, expected.candidate);
  assert.equal(first.architectureGateReviewDigest, expected.gateReview);
  assert.equal(first.structurizrConformanceProofDigest, expected.conformance);
  assert.equal(first.ownerApprovalDigest, expected.approval);
  assert.equal(first.architectureBaselineDigest, expected.baseline);
  assert.equal(first.promotionProofDigest, expected.proof);
  assert.deepEqual(first.requiredContractInterfaces, requiredInterfaces);
  assert.equal(first.contractGenerationRequired, true);
  assert.equal(first.contractGenerationOperation, "generate-contract-change");
  assert.equal(first.workBreakdownProgressionAllowed, false);

  const [baselineBytes, stateBytes, approvalBytes, proofBytes, pendingBytes, commitBytes, historyBytes] =
    await Promise.all([
      readBytes(`${dogfood}replay-v2/architecture-baseline.json`),
      readBytes(`${dogfood}replay-v2/project-architecture-state.json`),
      readBytes(`${dogfood}architecture-gate-owner-approval.json`),
      readBytes(`${dogfood}architecture-gate-promotion-proof.json`),
      readBytes(`${dogfood}replay-v2/architecture-promotion.pending.json`),
      readBytes(`${dogfood}replay-v2/architecture-promotion.commit.json`),
      readBytes("project/history/architecture/architecture-baseline-devrelay-v1-work-execution-001/architecture-baseline.json"),
    ]);
  const baseline = JSON.parse(baselineBytes);
  const state = JSON.parse(stateBytes);
  const proof = JSON.parse(proofBytes);

  assert.equal(sha256Digest(baselineBytes), expected.baseline);
  assert.equal(sha256Digest(stateBytes), expected.state);
  assert.equal(sha256Digest(approvalBytes), expected.approval);
  assert.equal(sha256Digest(proofBytes), expected.proof);
  assert.equal(sha256Digest(commitBytes), expected.journal);
  assert.equal(sha256Digest(historyBytes), expected.previous);
  assert.deepEqual(pendingBytes, commitBytes);
  assert.equal(baseline.approvedDraft.digest, expected.candidate);
  assert.equal(state.architectureBaseline.digest, expected.baseline);
  assert.ok(baseline.sections.decisionRecords.content.decisions.every(({ status }) => status === "accepted"));
  assert.deepEqual(proof.requiredContractInterfaces, requiredInterfaces);
  assert.equal(proof.checkpointReplay.adapterCallsOnVerification, 0);
  assert.equal(proof.workBreakdownProgressionAllowed, false);

  const firstBytes = [baselineBytes, stateBytes, approvalBytes, proofBytes, commitBytes];
  assert.deepEqual(promote(), first);
  assert.deepEqual(await Promise.all([
    readBytes(`${dogfood}replay-v2/architecture-baseline.json`),
    readBytes(`${dogfood}replay-v2/project-architecture-state.json`),
    readBytes(`${dogfood}architecture-gate-owner-approval.json`),
    readBytes(`${dogfood}architecture-gate-promotion-proof.json`),
    readBytes(`${dogfood}replay-v2/architecture-promotion.commit.json`),
  ]), firstBytes);
  const currentAfter = await Promise.all([
    readBytes("project/architecture-baseline.json"),
    readBytes("project/project-architecture-state.json"),
    readBytes("project/architecture-promotion.pending.json"),
    readBytes("project/architecture-promotion.commit.json"),
  ]);
  assert.deepEqual(currentAfter, currentBefore);
  assert.notDeepEqual(currentAfter[0], baselineBytes);
});

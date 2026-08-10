import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/contract-generation/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));

const requiredInterfaces = Object.freeze([
  "IF-CG-APPROVED-TRACEABILITY",
  "IF-CG-CANDIDATE-TRACEABILITY",
  "IF-CG-CANONICAL-DIFF",
  "IF-CG-FORMAT-VALIDATION",
  "IF-CG-GATE-CANDIDATE",
  "IF-CG-GENERATOR-INVOCATION",
  "IF-RUN-COMPARABILITY",
  "IF-RUN-CONTENT-POLICY",
  "IF-RUN-HOST-OBSERVATIONS",
  "IF-RUN-INTEGRATED-COMPLETION",
  "IF-RUN-LIFECYCLE-SNAPSHOT",
  "IF-RUN-READY-FRONTIER",
  "IF-RUN-REPORT-ACCESS",
  "IF-RUN-WORKFLOW-FACTS",
]);

const expected = Object.freeze({
  candidate:
    "sha256:c410dd4888d660a9467d964dc447b588aac4d21290dc8045bd7b74c2f79c683c",
  gateReview:
    "sha256:05cb58bf31b3e8884456d8f13c2416bce50c8577654bbaaf6e73990520eed3e4",
  conformance:
    "sha256:e50aaab16f6a807916acddd641e5c9983db6b20138abf15852682678d0f29e29",
  approval:
    "sha256:83004b9f9dc2cc84fd77753cb8618a44bd756a870fc62566969e1e1ecd1453f0",
  baseline:
    "sha256:62a637f33635671295f730ff7e49bd69442d7721968e0bd5ad7be1c6801b9231",
  state:
    "sha256:57f27033c81ac477fec372b857b2ce0d54dbcfcbdb0997e7c2f299b66d427398",
  proof:
    "sha256:9839d22182ad97e4240745b62dde029af35f5576fb22c35a8f87ce192bead02b",
  journal:
    "sha256:df3508bfc1cd1929cca02103a4149857b58a3e3482f560bd27eaf7af79a0c869",
  previous:
    "sha256:a2bc5b38377337dbc6e86eb45821b9fab4eca4be044693944442c6c45153fa29",
});

function promote() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [`${dogfood}materialize.mjs`, "--promote"],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
}

test("approved ContractGeneration architecture promotion is exact, restart-safe, and blocks WorkBreakdown", async () => {
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
  assert.equal(first.contractGenerationProgressionAllowed, true);
  assert.equal(first.workBreakdownProgressionAllowed, false);

  const [
    baselineBytes,
    stateBytes,
    approvalBytes,
    proofBytes,
    pendingBytes,
    committedBytes,
    historyBytes,
    candidate,
  ] = await Promise.all([
    readBytes(`${dogfood}replay-v2/architecture-baseline.json`),
    readBytes(`${dogfood}replay-v2/project-architecture-state.json`),
    readBytes(`${dogfood}architecture-gate-owner-approval.json`),
    readBytes(`${dogfood}architecture-gate-promotion-proof.json`),
    readBytes(`${dogfood}replay-v2/architecture-promotion.pending.json`),
    readBytes(`${dogfood}replay-v2/architecture-promotion.commit.json`),
    readBytes(
      "project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json",
    ),
    readJson(`${dogfood}architecture-change-set-draft.json`),
  ]);
  const baseline = JSON.parse(baselineBytes);
  const state = JSON.parse(stateBytes);
  const approval = JSON.parse(approvalBytes);
  const proof = JSON.parse(proofBytes);
  const journal = JSON.parse(committedBytes);

  assert.equal(sha256Digest(baselineBytes), expected.baseline);
  assert.equal(sha256Digest(stateBytes), expected.state);
  assert.equal(sha256Digest(approvalBytes), expected.approval);
  assert.equal(sha256Digest(proofBytes), expected.proof);
  assert.equal(sha256Digest(pendingBytes), expected.journal);
  assert.equal(sha256Digest(committedBytes), expected.journal);
  assert.equal(sha256Digest(historyBytes), expected.previous);
  assert.deepEqual(pendingBytes, committedBytes);

  assert.equal(approval.decision, "approve");
  assert.equal(approval.authority, "project-owner");
  assert.equal(approval.candidate.digest, expected.candidate);
  assert.equal(baseline.approvedDraft.digest, expected.candidate);
  assert.equal(state.architectureBaseline.digest, expected.baseline);
  assert.equal(state.requirementsBaseline.digest, baseline.requirementsBaseline.digest);
  assert.equal(
    state.projectOverviewBaseline.digest,
    baseline.projectOverviewBaseline.digest,
  );
  assert.ok(
    baseline.sections.decisionRecords.content.decisions.every(
      ({ status }) => status === "accepted",
    ),
  );
  assert.ok(
    candidate.sections.decisionRecords.content.decisions
      .filter(({ id }) => id.startsWith("ADR-CG-"))
      .every(({ status }) => status === "proposed"),
  );
  assert.deepEqual(proof.requiredContractInterfaces, requiredInterfaces);
  assert.equal(proof.checkpointReplay.adapterCallsOnVerification, 0);
  assert.equal(proof.workBreakdownProgressionAllowed, false);
  assert.equal(journal.state, "committed");
  assert.equal(journal.candidate.digest, expected.candidate);
  assert.equal(journal.proof.digest, expected.proof);

  const firstBytes = [
    baselineBytes,
    stateBytes,
    approvalBytes,
    proofBytes,
    committedBytes,
  ];
  assert.deepEqual(promote(), first);
  const secondBytes = await Promise.all([
    readBytes(`${dogfood}replay-v2/architecture-baseline.json`),
    readBytes(`${dogfood}replay-v2/project-architecture-state.json`),
    readBytes(`${dogfood}architecture-gate-owner-approval.json`),
    readBytes(`${dogfood}architecture-gate-promotion-proof.json`),
    readBytes(`${dogfood}replay-v2/architecture-promotion.commit.json`),
  ]);
  assert.deepEqual(secondBytes, firstBytes);
  const currentAfter = await Promise.all([
    readBytes("project/architecture-baseline.json"),
    readBytes("project/project-architecture-state.json"),
    readBytes("project/architecture-promotion.pending.json"),
    readBytes("project/architecture-promotion.commit.json"),
  ]);
  assert.deepEqual(currentAfter, currentBefore);
  assert.notDeepEqual(currentAfter[0], baselineBytes);
});

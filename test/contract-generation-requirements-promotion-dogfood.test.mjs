import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));

const expected = Object.freeze({
  gateCandidate:
    "sha256:bcf7015a4b54e54544dd3e0a69f88e5562956c70f3929dbc0701c0f1c6e7181f",
  requirementsChangeSet:
    "sha256:98c7cb7a87b2e13f258250992faffe4105697d334eff67bc7efe664c8f532c72",
  projectOverviewChangeSet:
    "sha256:c33c06b4111db2db07f90f86c62187558a3ee58cfca0783fcd7c65ea2fcb851f",
  projectOverviewMarkdown:
    "sha256:2c23468dae2092bb133e78e45e725e647a7901fb90e400f149d929192446b6a3",
  terminalCheckpoint:
    "sha256:0940d530439e1088e6f43cbc88815156719ac5d17c9b4b0069a4e29a91424c77",
  clarificationCheckpoint:
    "sha256:36b609c5d7a8209b0f473ec01d4033be1cd069918ef8be229a9ab560f3caede1",
  requirementsBaseline:
    "sha256:cd07170d8ea48ba98a1c4f45d30ade2e83992e0fd4433cb049fbf0af7c34e8cb",
  projectOverviewBaseline:
    "sha256:c440350f162c530a0180661ad7f6812551d0a184298f256a52239e5b2e9de699",
  approval:
    "sha256:161d4171f7a921ac5e0e757830ed8106bfb563a122f07f0b2146befc190afcc6",
  promotionProof:
    "sha256:5f5da723c9e621a1b065c0d7bae82d6fdea3ad769bbb6208d119565556b18fba",
});

function promote() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["dogfood/contract-generation/materialize-requirements-promotion.mjs"],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
}

test("approved ContractGeneration requirements promote as one restart-safe baseline pair", async () => {
  const currentBefore = await Promise.all([
    readBytes("project/requirements-baseline.json"),
    readBytes("project/project-overview-baseline.json"),
    readBytes("ProjectOverview.md"),
  ]);
  const first = promote();
  assert.deepEqual(first, {
    gateStatus: "pass",
    adapterCalls: 0,
    requirementsBaselineDigest: expected.requirementsBaseline,
    projectOverviewBaselineDigest: expected.projectOverviewBaseline,
    projectOverviewMarkdownDigest: expected.projectOverviewMarkdown,
    approvalDigest: expected.approval,
    promotionProofDigest: expected.promotionProof,
    architectureProgressionAllowed: true,
  });

  const [
    requirementsBytes,
    overviewBytes,
    markdownBytes,
    candidateMarkdownBytes,
    approvalBytes,
    proofBytes,
    gateCandidateBytes,
    clarificationCheckpointBytes,
    committedJournal,
    pendingJournal,
    previousRequirementsBytes,
    previousOverviewBytes,
    previousMarkdownBytes,
  ] = await Promise.all([
    readBytes("dogfood/contract-generation/requirements-replay-v2/requirements-baseline.json"),
    readBytes("dogfood/contract-generation/requirements-replay-v2/project-overview-baseline.json"),
    readBytes("dogfood/contract-generation/requirements-replay-v2/ProjectOverview.md"),
    readBytes("dogfood/contract-generation/candidate/ProjectOverview.md"),
    readBytes("dogfood/contract-generation/requirements-gate-owner-approval.json"),
    readBytes("dogfood/contract-generation/requirements-gate-promotion-proof.json"),
    readBytes("dogfood/contract-generation/requirements-gate-candidate.json"),
    readBytes("dogfood/contract-generation/requirements-gathering.checkpoint.json"),
    readJson("dogfood/contract-generation/requirements-replay-v2/requirements-promotion.commit.json"),
    readJson("dogfood/contract-generation/requirements-replay-v2/requirements-promotion.pending.json"),
    readBytes("project/history/1.2.0/requirements-baseline.json"),
    readBytes("project/history/1.2.0/project-overview-baseline.json"),
    readBytes("project/history/1.2.0/ProjectOverview.md"),
  ]);
  const requirements = JSON.parse(requirementsBytes);
  const overview = JSON.parse(overviewBytes);
  const approval = JSON.parse(approvalBytes);
  const proof = JSON.parse(proofBytes);

  assert.equal(sha256Digest(requirementsBytes), expected.requirementsBaseline);
  assert.equal(sha256Digest(overviewBytes), expected.projectOverviewBaseline);
  assert.equal(sha256Digest(markdownBytes), expected.projectOverviewMarkdown);
  assert.deepEqual(markdownBytes, candidateMarkdownBytes);
  assert.equal(sha256Digest(approvalBytes), expected.approval);
  assert.equal(sha256Digest(proofBytes), expected.promotionProof);
  assert.equal(sha256Digest(gateCandidateBytes), expected.gateCandidate);
  assert.equal(
    sha256Digest(clarificationCheckpointBytes),
    expected.clarificationCheckpoint,
  );

  assert.equal(requirements.version, "1.3.0");
  assert.equal(overview.version, "1.3.0");
  assert.equal(
    requirements.supersedes.digest,
    "sha256:c75fd7eab03c6409613cf2a9032794c133ca53aefccafeb6dd66931c16d0dff1",
  );
  assert.equal(
    overview.supersedes.digest,
    "sha256:eb4a5ea9db4c67cff641ffdc50168ee2c4d257ab307be909fe515759ee88239e",
  );
  assert.equal(overview.requirementsBaseline.digest, expected.requirementsBaseline);
  assert.equal(approval.decision, "approve");
  assert.equal(approval.source.statement, "I approve");
  assert.equal(approval.approvedCandidate.gateCandidate, expected.gateCandidate);
  assert.equal(
    approval.requiredLineageEvidence.clarificationCheckpoint,
    expected.clarificationCheckpoint,
  );
  assert.equal(proof.replay.adapterCallCount, 0);
  assert.equal(proof.architectureProgressionAllowed, true);
  assert.equal(committedJournal.state, "committed");
  assert.deepEqual(pendingJournal, committedJournal);

  assert.equal(
    sha256Digest(previousRequirementsBytes),
    "sha256:c75fd7eab03c6409613cf2a9032794c133ca53aefccafeb6dd66931c16d0dff1",
  );
  assert.equal(
    sha256Digest(previousOverviewBytes),
    "sha256:eb4a5ea9db4c67cff641ffdc50168ee2c4d257ab307be909fe515759ee88239e",
  );
  assert.equal(
    sha256Digest(previousMarkdownBytes),
    "sha256:a592c999205b8ffba0eb13327cc0f680e091910e9638b82bb6bb5ffd6ccdd930",
  );

  const firstBytes = [
    requirementsBytes,
    overviewBytes,
    markdownBytes,
    approvalBytes,
    proofBytes,
  ];
  assert.deepEqual(promote(), first);
  const secondBytes = await Promise.all([
    readBytes("dogfood/contract-generation/requirements-replay-v2/requirements-baseline.json"),
    readBytes("dogfood/contract-generation/requirements-replay-v2/project-overview-baseline.json"),
    readBytes("dogfood/contract-generation/requirements-replay-v2/ProjectOverview.md"),
    readBytes("dogfood/contract-generation/requirements-gate-owner-approval.json"),
    readBytes("dogfood/contract-generation/requirements-gate-promotion-proof.json"),
  ]);
  assert.deepEqual(secondBytes, firstBytes);
  const currentAfter = await Promise.all([
    readBytes("project/requirements-baseline.json"),
    readBytes("project/project-overview-baseline.json"),
    readBytes("ProjectOverview.md"),
  ]);
  assert.deepEqual(currentAfter, currentBefore);
  assert.notDeepEqual(currentAfter, [requirementsBytes, overviewBytes, markdownBytes]);
});

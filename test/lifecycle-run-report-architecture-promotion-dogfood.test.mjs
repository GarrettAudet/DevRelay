import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/lifecycle-run-report/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

function promote() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [`${dogfood}verify-promotion-history.mjs`],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
}

test("owner approval promotes one exact restart-safe architecture baseline and routes to ContractGeneration", async () => {
  const first = promote();
  const firstBaselineBytes = await readBytes("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json");
  const firstStateBytes = await readBytes("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/project-architecture-state.json");
  const firstProofBytes = await readBytes(
    `${dogfood}architecture-gate-promotion-proof.json`,
  );
  const second = promote();

  assert.deepEqual(second, first);
  assert.equal(
    (await readBytes("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json")).equals(firstBaselineBytes),
    true,
  );
  assert.equal(
    (await readBytes("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/project-architecture-state.json")).equals(firstStateBytes),
    true,
  );
  assert.equal(
    (await readBytes(`${dogfood}architecture-gate-promotion-proof.json`)).equals(
      firstProofBytes,
    ),
    true,
  );

  const [
    baseline,
    state,
    approval,
    proof,
    pending,
    committed,
    candidate,
    previousBaselineBytes,
    historyBaselineBytes,
  ] = await Promise.all([
    readJson("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json"),
    readJson("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/project-architecture-state.json"),
    readJson(`${dogfood}architecture-gate-owner-approval.json`),
    readJson(`${dogfood}architecture-gate-promotion-proof.json`),
    readJson("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-promotion.pending.json"),
    readJson("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-promotion.commit.json"),
    readJson(`${dogfood}fixture-history/promoted-architecture-change-set-draft.json`),
    readBytes("dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json"),
    readBytes(
      "project/history/architecture/architecture-baseline-devrelay-v1-wda-001/architecture-baseline.json",
    ),
  ]);

  assert.equal(first.status, "ARCHITECTURE_GATE_PROMOTED");
  assert.equal(first.replayAdapterCalls, 0);
  assert.equal(first.contractGenerationProgressionAllowed, true);
  assert.equal(first.workBreakdownProgressionAllowed, false);
  assert.equal(
    first.architectureChangeSetDigest,
    "sha256:9ee1936ae7aafd8484466024273b6fabbc342a3553687dbd903d8d82515593d6",
  );
  assert.equal(first.architectureBaselineDigest, await digest("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json"));
  assert.equal(
    first.promotionProofDigest,
    await digest(`${dogfood}architecture-gate-promotion-proof.json`),
  );

  assert.equal(approval.decision, "approve");
  assert.equal(approval.authority, "project-owner");
  assert.equal(approval.candidate.digest, first.architectureChangeSetDigest);
  assert.equal(baseline.approvedDraft.digest, first.architectureChangeSetDigest);
  assert.equal(state.architectureBaseline.digest, first.architectureBaselineDigest);
  assert.equal(state.architectureBaseline.artifactId, baseline.baselineId);
  assert.equal(baseline.requirementsBaseline.digest, state.requirementsBaseline.digest);
  assert.equal(baseline.projectOverviewBaseline.digest, state.projectOverviewBaseline.digest);
  assert.ok(
    baseline.sections.decisionRecords.content.decisions.every(
      ({ status }) => status === "accepted",
    ),
  );
  assert.ok(
    candidate.sections.decisionRecords.content.decisions
      .filter(({ id }) => id.startsWith("ADR-RUN-"))
      .every(({ status }) => status === "proposed"),
  );

  assert.equal(historyBaselineBytes.equals(previousBaselineBytes), true);
  assert.equal(pending.state, "committed");
  assert.deepEqual(pending, committed);
  assert.equal(committed.candidate.digest, first.architectureChangeSetDigest);
  assert.equal(committed.proof.digest, first.promotionProofDigest);

  assert.equal(proof.status, "pass");
  assert.equal(proof.checkpointReplay.adapterCallsOnVerification, 0);
  assert.equal(proof.contractGenerationProgressionAllowed, true);
  assert.equal(proof.workBreakdownProgressionAllowed, false);
  assert.deepEqual(proof.requiredContractInterfaces, [
    "IF-RUN-COMPARABILITY",
    "IF-RUN-CONTENT-POLICY",
    "IF-RUN-HOST-OBSERVATIONS",
    "IF-RUN-INTEGRATED-COMPLETION",
    "IF-RUN-LIFECYCLE-SNAPSHOT",
    "IF-RUN-READY-FRONTIER",
    "IF-RUN-REPORT-ACCESS",
    "IF-RUN-WORKFLOW-FACTS",
  ]);
});

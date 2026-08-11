import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "../src/specialist-assignment-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "../src/work-breakdown-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "../src/work-dependency-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const readBytes = (relativePath) => readFileSync(new URL(relativePath, root));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const run = (relativePath) =>
  JSON.parse(
    execFileSync(process.execPath, [relativePath], {
      cwd: rootPath,
      encoding: "utf8",
    }),
  );

test("WIV WorkBreakdown promotes ten bounded items with exhaustive coverage", () => {
  const result = run(
    "dogfood/work-item-verification/work-breakdown/materialize.mjs",
  );
  const promotion = run(
    "dogfood/work-item-verification/work-breakdown/promote.mjs",
  );
  const candidateBytes = readBytes(
    "dogfood/work-item-verification/work-breakdown/scenario-wiv-portable-v3/work-breakdown-change-set-draft.json",
  );
  const baselineBytes = readBytes(
    "dogfood/work-item-verification/work-breakdown/scenario-wiv-portable-v3/work-breakdown-baseline.json",
  );
  const candidate = validateWorkBreakdownArtifact(JSON.parse(candidateBytes));
  const baseline = validateWorkBreakdownArtifact(JSON.parse(baselineBytes));

  assert.equal(result.status, "WORK_BREAKDOWN_PROMOTED");
  assert.equal(result.operation, "decompose-change");
  assert.deepEqual(result.plugin, { id: "openspec-tasks", version: "0.1.0" });
  assert.equal(result.newWorkItems, 10);
  assert.equal(result.retiredPriorWorkItems, 10);
  assert.equal(result.coverage, 128);
  assert.equal(result.graphRevision, 5);
  assert.equal(result.progressionAllowed, true);
  assert.equal(
    sha256Digest(candidateBytes),
    "sha256:7214c322f2d98e264891e2f57cce0011be5235e8c636e39cec20d036b4162cca",
  );
  assert.equal(
    sha256Digest(baselineBytes),
    "sha256:933e8c4657a0327860a9ec1583783bff08eb67ea2599bc7f63f63998bfc9ead2",
  );
  assert.equal(candidate.changes.filter(({ operation }) => operation === "add").length, 10);
  assert.equal(candidate.changes.filter(({ operation }) => operation === "retire").length, 10);
  assert.equal(baseline.version, "1.4.0");
  assert.equal(baseline.workItems.length, 10);
  assert.ok(baseline.workItems.every(({ id }) => id.startsWith("WI-WIV-")));
  assert.equal(promotion.nextModule, "work-dependency-analysis");
});

test("WIV WorkDependencyAnalysis promotes one policy-allowed static DAG", () => {
  const candidateResult = run(
    "dogfood/work-item-verification/dependency-analysis/materialize.mjs",
  );
  const promotion = run(
    "dogfood/work-item-verification/dependency-analysis/promote.mjs",
  );
  const candidateBytes = readBytes(
    "dogfood/work-item-verification/dependency-analysis/work-dependency-candidate.json",
  );
  const baselineBytes = readBytes(
    "dogfood/work-item-verification/dependency-analysis/replay-v7/work-dependency-baseline.json",
  );
  const candidate = validateWorkDependencyArtifact(JSON.parse(candidateBytes));
  const baseline = validateWorkDependencyArtifact(JSON.parse(baselineBytes));

  assert.equal(candidateResult.status, "WORK_DEPENDENCY_GATE_CANDIDATE_READY");
  assert.equal(candidateResult.workItems, 10);
  assert.equal(candidateResult.dependencies, 18);
  assert.equal(candidateResult.proposerCalls, 1);
  assert.equal(candidateResult.reviewerCalls, 1);
  assert.equal(
    sha256Digest(candidateBytes),
    "sha256:005d459e99290c4a854ce5b8be044bbd7c6c89a7e394e7801d7442e4b75eae6b",
  );
  assert.equal(
    sha256Digest(baselineBytes),
    "sha256:628e85f134d4cf9eb74e7edc7ca28424c5bf6cd717f84942472f8a374cc8c857",
  );
  assert.equal(candidate.nodes.length, 10);
  assert.equal(candidate.edges.length, 18);
  assert.equal(baseline.topologicalOrder[0], "WI-WIV-CONTRACTS");
  assert.equal(promotion.progression.nextModule, "specialist-assignment");
  assert.equal(promotion.graphRevision, 6);
});

test("WIV SpecialistAssignment assigns every DAG item and routes execution next", () => {
  const projectBaselineUrl = new URL("../project/specialist-assignment-baseline.json", import.meta.url);
  const projectPromotionUrl = new URL("../project/specialist-assignment-promotion.commit.json", import.meta.url);
  const projectBaselineBefore = readFileSync(projectBaselineUrl);
  const projectPromotionBefore = readFileSync(projectPromotionUrl);
  const dogfood = run(
    "dogfood/work-item-verification/assignment/materialize.mjs",
  );
  const promotion = run(
    "dogfood/work-item-verification/assignment/promote.mjs",
  );
  const baseline = validateSpecialistAssignmentArtifact(
    readJson(
      "dogfood/work-item-verification/assignment/specialist-assignment-baseline.json",
    ),
  );
  const projectBaseline = validateSpecialistAssignmentArtifact(
    readJson("project/specialist-assignment-baseline.json"),
  );

  assert.equal(dogfood.outcome, "assigned");
  assert.equal(dogfood.workItemCount, 10);
  assert.equal(dogfood.assignmentCount, 10);
  assert.deepEqual(dogfood.a2aAssignedWorkItems, ["WI-WIV-DOCUMENTATION"]);
  assert.equal(dogfood.replayedWithoutAdapterCall, true);
  assert.equal(baseline.assignments.length, 10);
  assert.notEqual(projectBaseline.baselineId, baseline.baselineId);
  assert.deepEqual(readFileSync(projectBaselineUrl), projectBaselineBefore);
  assert.deepEqual(readFileSync(projectPromotionUrl), projectPromotionBefore);
  assert.equal(promotion.graphRevision, 8);
  assert.equal(promotion.nextModule, "WorkExecution");
});

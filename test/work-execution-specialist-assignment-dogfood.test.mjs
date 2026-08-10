import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "../src/specialist-assignment-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const assignmentRoot = new URL(
  "../dogfood/work-execution/assignment/",
  import.meta.url,
);
const read = (url) => JSON.parse(readFileSync(url, "utf8"));
const readAssignment = (name) => read(new URL(name, assignmentRoot));

function run(relativePath) {
  const result = spawnSync(process.execPath, [relativePath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("WorkExecution SpecialistAssignment binds seven inputs and promotes all ten assignments", () => {
  const projectBaselineUrl = new URL("../project/specialist-assignment-baseline.json", import.meta.url);
  const projectPromotionUrl = new URL("../project/specialist-assignment-promotion.commit.json", import.meta.url);
  const projectBaselineBefore = readFileSync(projectBaselineUrl);
  const projectPromotionBefore = readFileSync(projectPromotionUrl);
  run("dogfood/work-execution/assignment/materialize.mjs");
  run("dogfood/work-execution/assignment/promote.mjs");

  const dogfoodProof = readAssignment(
    "specialist-assignment-dogfood-proof.json",
  );
  const draft = validateSpecialistAssignmentArtifact(
    readAssignment("specialist-assignment-draft.json"),
  );
  const baseline = validateSpecialistAssignmentArtifact(
    readAssignment("specialist-assignment-baseline.json"),
  );
  const promotion = readAssignment(
    "replay-v6/specialist-assignment-promotion-proof.json",
  );
  const dependencyPromotion = read(
    new URL(
      "../dogfood/work-execution/dependency-analysis/work-dependency-gate-promotion-proof.json",
      import.meta.url,
    ),
  );
  const projectBaseline = validateSpecialistAssignmentArtifact(
    read(new URL("../project/specialist-assignment-baseline.json", import.meta.url)),
  );

  assert.equal(dogfoodProof.workItemCount, 10);
  assert.equal(dogfoodProof.assignmentCount, 10);
  assert.equal(dogfoodProof.replayedWithoutAdapterCall, true);
  assert.equal(draft.inputBindings.length, 7);
  assert.deepEqual(
    draft.inputBindings.map(({ role }) => role).sort(),
    [
      "assignment-policy",
      "capability-catalog",
      "project-overview-baseline",
      "repository-context",
      "specialist-catalog",
      "work-breakdown-baseline",
      "work-dependency-baseline",
    ],
  );
  assert.deepEqual(dogfoodProof.a2aAssignedWorkItems, [
    "WI-WE-DOCUMENTATION",
  ]);
  assert.equal(
    baseline.assignments.filter(
      ({ specialistProfileRef }) =>
        specialistProfileRef === dogfoodProof.a2aProfileId,
    ).length,
    1,
  );
  assert.equal(baseline.assignments.length, 10);
  assert.equal(
    projectBaseline.baselineId === baseline.baselineId,
    false,
  );
  assert.deepEqual(readFileSync(projectBaselineUrl), projectBaselineBefore);
  assert.deepEqual(readFileSync(projectPromotionUrl), projectPromotionBefore);
  assert.equal(promotion.nextModule, "WorkExecution");
  assert.equal(promotion.resultingGraphRevision, 7);
  assert.equal(
    dependencyPromotion.proofId,
    "WDA-WE-GATE-PROMOTION-002",
  );
  assert.equal(
    dependencyPromotion.progression.nextModule,
    "specialist-assignment",
  );
  assert.equal(
    sha256Digest(
      Buffer.from(
        JSON.stringify(
          readAssignment("specialist-assignment-dogfood-proof.json"),
        ),
      ),
    ).startsWith("sha256:"),
    true,
  );

  const previousBaseline = new URL(
    "../project/history/specialist-assignment/SAB-6D41BF0C5D6D357C/specialist-assignment-baseline.json",
    import.meta.url,
  );
  const previousPromotion = new URL(
    "../project/history/specialist-assignment/SAB-6D41BF0C5D6D357C/specialist-assignment-promotion.commit.json",
    import.meta.url,
  );
  assert.equal(existsSync(previousBaseline), true);
  assert.equal(existsSync(previousPromotion), true);
  assert.equal(
    read(previousBaseline).baselineId,
    "SAB-6D41BF0C5D6D357C",
  );
});

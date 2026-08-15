import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalJson, sha256Digest } from "../src/content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "../src/specialist-assignment-artifact-validator.mjs";

const value = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const bytes = (relativePath) => readFileSync(new URL(relativePath, import.meta.url));

test("V0.11 SpecialistAssignment binds all 16 work items through V2 checkpoint replay and A2A discovery", () => {
  const draft = value("../dogfood/v0.11-module-quality/assignment/specialist-assignment-draft.json");
  const baseline = value("../dogfood/v0.11-module-quality/assignment/specialist-assignment-baseline.json");
  const gate = value("../dogfood/v0.11-module-quality/assignment/specialist-assignment-gate-candidate.json");
  const approval = value("../dogfood/v0.11-module-quality/assignment/specialist-assignment-gate-owner-approval.json");
  const proof = value("../dogfood/v0.11-module-quality/assignment/specialist-assignment-dogfood-proof.json");
  const workBreakdown = value("../project/history/work-breakdown/1.9.1/work-breakdown-baseline.json");
  const workDependency = value("../project/history/work-dependency/WDB-V011-MODULE-QUALITY-002/WDA-GATE-PROMOTION-V011-MODULE-QUALITY-002/work-dependency-baseline.json");

  validateSpecialistAssignmentArtifact(draft);
  validateSpecialistAssignmentArtifact(baseline);
  assert.equal(sha256Digest(Buffer.from(canonicalJson(draft), "utf8")), "sha256:f2e4b6b790f8107df058129d296c7f7e7a190eafaa00f4af2dfd9ba2df176322");
  assert.equal(sha256Digest(Buffer.from(canonicalJson(baseline), "utf8")), "sha256:f7f81aa8f231394bca6f5bb6f5f421977605e5355f1b876386bd2492e983dd6c");
  assert.equal(gate.checkpointDigest, "sha256:93fae42108b37584546ebddd5a02b93780a9fdf8991ecc82ab74c2628633df52");
  assert.equal(approval.candidate.digest, gate.candidate.digest);
  assert.equal(approval.checkpointDigest, gate.checkpointDigest);
  assert.equal(proof.assignmentCount, 16);
  assert.equal(proof.a2aAssignedWorkItems.length, 13);
  assert.equal(proof.integrationOwnerAssignedWorkItems.length, 3);
  assert.equal(proof.rankerCalls, 1);
  assert.equal(proof.replayedWithoutRankerCall, true);
  assert.deepEqual(
    baseline.assignments.map(({ workItemRef }) => workItemRef).sort(),
    workBreakdown.workItems.map(({ id }) => id).sort(),
  );
  assert.deepEqual(
    baseline.assignments.map(({ workItemRef }) => workItemRef).sort(),
    [...workDependency.nodes].sort(),
  );
});

test("V0.11 assignment promotion persists exact bytes, forward traceability, and Windows-safe replacement", () => {
  const dogfoodBaseline = bytes("../dogfood/v0.11-module-quality/assignment/specialist-assignment-baseline.json");
  const projectBaseline = bytes("../project/history/specialist-assignment/SAB-22406E70A72F9D66/specialist-assignment-baseline.json");
  const promotion = value("../dogfood/v0.11-module-quality/assignment/promotion/specialist-assignment-promotion-proof.json");
  const source = bytes("../dogfood/v0.11-module-quality/assignment/promote.mjs").toString("utf8");

  assert.ok(projectBaseline.equals(dogfoodBaseline));
  assert.equal(sha256Digest(projectBaseline), "sha256:f7f81aa8f231394bca6f5bb6f5f421977605e5355f1b876386bd2492e983dd6c");
  assert.equal(promotion.resultingGraphRevision, 13);
  assert.equal(promotion.resultingGraph.digest, "sha256:ccd8e63b6c58c2b41a03c3259973a58e7fa1d313f7bfeb1b57fe1e7e147245f7");
  assert.equal(promotion.nextModule, "WorkExecution");
  assert.doesNotMatch(source, /openSync\(filePath, "a\+"\)/u);
  assert.match(source, /constants\.O_RDWR \| constants\.O_CREAT/u);
});

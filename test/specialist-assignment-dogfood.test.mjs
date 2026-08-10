import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "../src/specialist-assignment-artifact-validator.mjs";

const base = new URL("../dogfood/specialist-assignment/assignment/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, base), "utf8"));

test("nine-item SpecialistAssignment dogfood is complete, A2A-backed, and replayable", () => {
  const run = spawnSync(process.execPath, ["dogfood/specialist-assignment/assignment/materialize.mjs"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const proof = read("specialist-assignment-dogfood-proof.json");
  const draft = validateSpecialistAssignmentArtifact(read("specialist-assignment-draft.json"));
  const baseline = validateSpecialistAssignmentArtifact(read("specialist-assignment-baseline.json"));
  assert.equal(proof.workItemCount, 9);
  assert.equal(proof.assignmentCount, 9);
  assert.deepEqual(proof.a2aAssignedWorkItems, ["WI-SA-DOCUMENTATION"]);
  assert.equal(proof.replayedWithoutAdapterCall, true);
  assert.equal(draft.assignmentDigest, baseline.assignmentDigest);
  assert.equal(proof.baselineDigest, canonicalJsonDigest(baseline));
});
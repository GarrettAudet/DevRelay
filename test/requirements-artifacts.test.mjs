import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArtifactValidationError,
  validateRequirementsArtifact,
} from "../src/requirements-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const clone = (value) => structuredClone(value);

const artifactNames = [
  "goal-001.json",
  "project-context-001.json",
  "repository-snapshot-001.json",
  "requirements-draft-001.json",
  "clarification-request-001.json",
  "clarification-response-001.json",
  "requirements-continuation-001.json",
  "requirements-baseline-001.json",
  "requirements-change-set-001.json",
];
const artifacts = new Map(
  await Promise.all(
    artifactNames.map(async (name) => [
      name,
      await readJson(`examples/artifacts/${name}`),
    ]),
  ),
);

function expectArtifactError(value, pattern) {
  assert.throws(
    () => validateRequirementsArtifact(value),
    (error) =>
      error instanceof ArtifactValidationError &&
      (pattern === undefined || pattern.test(error.message)),
  );
}

test("every canonical RequirementsGathering artifact fixture validates", () => {
  for (const [name, artifact] of artifacts) {
    assert.equal(
      validateRequirementsArtifact(artifact),
      artifact,
      `${name} did not validate`,
    );
  }
});

test("clarification base inputs require one goal and one project context", () => {
  const invalid = clone(artifacts.get("clarification-request-001.json"));
  invalid.baseInputs[1] = clone(invalid.baseInputs[0]);
  expectArtifactError(invalid);
});

test("baseline-derived context inputs are an intrinsic symmetric pair", () => {
  const request = clone(artifacts.get("clarification-request-001.json"));
  const requirementsBaseline = {
    role: "requirements-baseline",
    artifact: { artifactId: "requirements-baseline-paired", digest: `sha256:${"1".repeat(64)}` },
  };
  const projectOverviewBaseline = {
    role: "project-overview-baseline",
    artifact: { artifactId: "project-overview-baseline-paired", digest: `sha256:${"2".repeat(64)}` },
  };

  request.baseInputs.push(requirementsBaseline);
  expectArtifactError(request);

  request.baseInputs.pop();
  request.baseInputs.push(projectOverviewBaseline);
  expectArtifactError(request);

  request.baseInputs.push(requirementsBaseline);
  assert.equal(validateRequirementsArtifact(request), request);
});

test("promotable candidates require explicit baseInputs", () => {
  for (const name of [
    "requirements-draft-001.json",
    "requirements-change-set-001.json",
  ]) {
    const unbound = clone(artifacts.get(name));
    delete unbound.baseInputs;
    expectArtifactError(unbound);
  }
});

test("continuation preserves a complete typed working state", () => {
  const continuation = artifacts.get("requirements-continuation-001.json");
  assert.ok("workingRequirements" in continuation);
  for (const field of [
    "purpose",
    "businessObjectives",
    "successMetrics",
    "stakeholders",
    "users",
    "capabilities",
    "userJourneys",
    "userStories",
    "acceptanceCriteria",
    "nonFunctionalRequirements",
    "constraints",
    "scope",
    "nonGoals",
    "terminology",
    "currentStatus",
  ]) {
    assert.ok(
      field in continuation.workingRequirements,
      `missing working-state field ${field}`,
    );
  }

  const incomplete = clone(continuation);
  delete incomplete.workingRequirements.scope;
  expectArtifactError(incomplete);

  const unbound = clone(continuation);
  delete unbound.clarificationRequest;
  expectArtifactError(unbound);

  const noSourceInvocation = clone(continuation);
  delete noSourceInvocation.sourceInvocation;
  expectArtifactError(noSourceInvocation);
});

test("a requirements change set must declare at least one changed section", () => {
  const empty = clone(artifacts.get("requirements-change-set-001.json"));
  empty.replacement = clone(
    artifacts.get("requirements-baseline-001.json").requirements,
  );
  empty.changedSections = [];
  expectArtifactError(empty);
});

test("drafts and baselines reject duplicate typed record IDs", () => {
  for (const name of [
    "requirements-draft-001.json",
    "requirements-baseline-001.json",
  ]) {
    const duplicateStory = clone(artifacts.get(name));
    duplicateStory.requirements.userStories.push(
      clone(duplicateStory.requirements.userStories[0]),
    );
    expectArtifactError(duplicateStory, /strictly lexically sorted with no duplicates/);

    const duplicateCriterion = clone(artifacts.get(name));
    duplicateCriterion.requirements.acceptanceCriteria.push(
      clone(duplicateCriterion.requirements.acceptanceCriteria[0]),
    );
    expectArtifactError(duplicateCriterion, /strictly lexically sorted with no duplicates/);
  }
});

test("draft, baseline, change, and continuation assumptions are evidence-backed and nonblocking", () => {
  for (const [name, body] of [
    ["requirements-draft-001.json", (artifact) => artifact.requirements],
    ["requirements-baseline-001.json", (artifact) => artifact.requirements],
    ["requirements-change-set-001.json", (artifact) => artifact.replacement],
    [
      "requirements-continuation-001.json",
      (artifact) => artifact.workingRequirements,
    ],
  ]) {
    for (const assumption of body(artifacts.get(name)).assumptions) {
      assert.equal(typeof assumption.blocking, "boolean", name);
      assert.ok(assumption.sourceRefs.length > 0, name);
    }
  }
});

test("draft, baseline, and continuation assumptions have unique stable IDs", () => {
  for (const [name, body] of [
    ["requirements-draft-001.json", (artifact) => artifact.requirements],
    ["requirements-baseline-001.json", (artifact) => artifact.requirements],
    [
      "requirements-continuation-001.json",
      (artifact) => artifact.workingRequirements,
    ],
  ]) {
    const artifact = clone(artifacts.get(name));
    const assumptions = body(artifact).assumptions;
    const duplicate = clone(assumptions[0]);
    duplicate.statement = "A conflicting assumption under the same stable ID.";
    assumptions.push(duplicate);
    expectArtifactError(artifact, /strictly lexically sorted with no duplicates/);
  }
});

test("continuation working state rejects duplicate story and criterion IDs", () => {
  const duplicateStory = clone(
    artifacts.get("requirements-continuation-001.json"),
  );
  duplicateStory.workingRequirements.userStories.push(
    clone(duplicateStory.workingRequirements.userStories[0]),
  );
  expectArtifactError(duplicateStory, /strictly lexically sorted with no duplicates/);

  const duplicateCriterion = clone(
    artifacts.get("requirements-continuation-001.json"),
  );
  duplicateCriterion.workingRequirements.acceptanceCriteria.push(
    clone(duplicateCriterion.workingRequirements.acceptanceCriteria[0]),
  );
  expectArtifactError(duplicateCriterion, /strictly lexically sorted with no duplicates/);
});

test("change-set replacement is a complete typed body with sorted sections", () => {
  const fixture = artifacts.get("requirements-change-set-001.json");
  assert.ok(fixture.replacement.userStories.length > 0);
  assert.deepEqual(fixture.changedSections, [...fixture.changedSections].sort());

  const duplicate = clone(fixture);
  duplicate.replacement.constraints.push(
    clone(duplicate.replacement.constraints[0]),
  );
  expectArtifactError(duplicate, /strictly lexically sorted with no duplicates/);

  const unsorted = clone(fixture);
  unsorted.changedSections = [...unsorted.changedSections].reverse();
  expectArtifactError(unsorted, /lexically sorted/);
});

test("clarification artifacts reject duplicate question and response IDs", () => {
  const duplicateQuestion = clone(
    artifacts.get("clarification-request-001.json"),
  );
  const secondQuestion = clone(duplicateQuestion.questions[0]);
  secondQuestion.prompt = "A conflicting prompt under the same question ID.";
  duplicateQuestion.questions.push(secondQuestion);
  expectArtifactError(duplicateQuestion);

  const duplicateResponse = clone(
    artifacts.get("clarification-response-001.json"),
  );
  duplicateResponse.responses.push({
    questionId: duplicateResponse.responses[0].questionId,
    answer: ["Password"],
  });
  expectArtifactError(duplicateResponse);
});

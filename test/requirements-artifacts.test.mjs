import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArtifactValidationError,
  validateRequirementsArtifact,
} from "../src/requirements-artifact-validator.mjs";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

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

function clone(value) {
  return structuredClone(value);
}

function expectArtifactError(value) {
  assert.throws(
    () => validateRequirementsArtifact(value),
    ArtifactValidationError,
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

test("continuation preserves a complete typed working state", () => {
  const continuation = artifacts.get("requirements-continuation-001.json");
  for (const field of [
    "objective",
    "scope",
    "assumptions",
    "constraints",
    "candidateRequirements",
    "dependencies",
    "risks",
    "deliverables",
    "requiredEvidence",
  ]) {
    assert.ok(field in continuation, `missing working-state field ${field}`);
  }

  const incomplete = clone(continuation);
  delete incomplete.scope;
  expectArtifactError(incomplete);
});

test("a requirements change set must contain at least one semantic change", () => {
  const empty = clone(artifacts.get("requirements-change-set-001.json"));
  empty.additions = [];
  empty.modifications = [];
  empty.removals = [];

  expectArtifactError(empty);
});

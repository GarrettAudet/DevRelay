import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArtifactValidationError,
  validateRequirementsArtifact,
} from "../src/requirements-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [requestFixture, responseFixture] = await Promise.all([
  readJson("examples/artifacts/clarification-request-001.json"),
  readJson("examples/artifacts/clarification-response-001.json"),
]);

function rejectsArtifact(value) {
  assert.throws(
    () => validateRequirementsArtifact(value),
    ArtifactValidationError,
  );
}

test("choice questions require non-empty unique options", () => {
  const noOptions = structuredClone(requestFixture);
  noOptions.questions[0].options = [];
  rejectsArtifact(noOptions);

  const duplicateOptions = structuredClone(requestFixture);
  duplicateOptions.questions[0].options = ["Password", "Password"];
  rejectsArtifact(duplicateOptions);
});

test("free-text and boolean questions do not carry choice options", () => {
  const freeTextWithOptions = structuredClone(requestFixture);
  freeTextWithOptions.questions[0].responseType = "free-text";
  rejectsArtifact(freeTextWithOptions);
});

test("clarification answers cannot be empty or repeat selections", () => {
  const empty = structuredClone(responseFixture);
  empty.responses[0].answer = [];
  rejectsArtifact(empty);

  const duplicate = structuredClone(responseFixture);
  duplicate.responses[0].answer = ["Password", "Password"];
  rejectsArtifact(duplicate);
});

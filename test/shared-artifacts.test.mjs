import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SharedArtifactValidationError,
  validateSharedArtifact,
} from "../src/shared-artifact-validator.mjs";
import {
  ArtifactValidationError,
  validateRequirementsArtifact,
} from "../src/requirements-artifact-validator.mjs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [requirementsBundle, requirementsSchema, sharedSchema] =
  await Promise.all([
    readJson("examples/artifacts/native-source-bundle-001.json"),
    readJson("contracts/requirements-gathering-artifacts.schema.json"),
    readJson("contracts/shared-artifacts.schema.json"),
  ]);

function expectSharedArtifactError(value) {
  assert.throws(
    () => validateSharedArtifact(value),
    SharedArtifactValidationError,
  );
}

test("NativeSourceBundle has one shared schema owner", () => {
  assert.equal(validateSharedArtifact(requirementsBundle), requirementsBundle);
  assert.equal(
    sharedSchema.$defs.nativeSourceBundle.$id,
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
  );
});

test("RequirementsGathering aggregate schema retains NativeSourceBundle compatibility", () => {
  assert.ok(
    requirementsSchema.oneOf.some(
      ({ $ref }) =>
        $ref === "https://devrelay.dev/artifacts/native-source-bundle/v1",
    ),
  );
  const validateAggregate = compileArtifactSchema(requirementsSchema, [
    sharedSchema,
  ]);
  assert.equal(validateAggregate(requirementsBundle), true);
});

test("RequirementsGathering 0.1.0 validator retains NativeSourceBundle compatibility", () => {
  assert.equal(
    validateRequirementsArtifact(requirementsBundle),
    requirementsBundle,
  );

  const invalid = structuredClone(requirementsBundle);
  invalid.sources = [];
  assert.throws(
    () => validateRequirementsArtifact(invalid),
    ArtifactValidationError,
  );
});

test("shared source bundles require source and canonical output bindings", () => {
  const noSources = structuredClone(requirementsBundle);
  noSources.sources = [];
  expectSharedArtifactError(noSources);

  const noOutputs = structuredClone(requirementsBundle);
  noOutputs.canonicalOutputs = [];
  expectSharedArtifactError(noOutputs);

  const malformedDigest = structuredClone(requirementsBundle);
  malformedDigest.sources[0].artifact.digest = "sha256:not-a-digest";
  expectSharedArtifactError(malformedDigest);
});

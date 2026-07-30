import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ContractError,
  createModuleRegistry,
} from "../src/module-registry.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [moduleFixture, pluginFixture, invocationFixture, resultFixture] =
  await Promise.all([
    readJson("examples/modules/requirements-gathering.module.json"),
    readJson("examples/plugins/openspec.plugin.json"),
    readJson("examples/invocations/requirements-openspec.invocation.json"),
    readJson("examples/results/requirements-openspec.result.json"),
  ]);

function clone(value) {
  return structuredClone(value);
}

function createRegistry(moduleDefinition = moduleFixture) {
  return createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [
      {
        definition: pluginFixture,
        adapter: { invoke() {} },
      },
    ],
  });
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("inherited property names cannot satisfy missing ports or outcomes", () => {
  const inputModule = clone(moduleFixture);
  inputModule.operations[0].inputs.push({
    name: "constructor",
    schema: "https://devrelay.dev/artifacts/goal/v1",
    mediaTypes: ["application/vnd.devrelay.goal+json"],
    cardinality: "one",
    required: true,
  });
  expectCode(
    () => createRegistry(inputModule).resolve(invocationFixture),
    "DR1404",
  );

  const outputModule = clone(moduleFixture);
  outputModule.operations[0].outputs.push({
    name: "constructor",
    schema: "https://devrelay.dev/artifacts/requirements-draft/v1",
    mediaTypes: ["application/vnd.devrelay.requirements-draft+json"],
    cardinality: "one",
    required: false,
  });
  outputModule.operations[0].resultContracts.drafted.requiredOutputs.push(
    "constructor",
  );
  outputModule.operations[0].resultContracts.drafted.allowedOutputs.push(
    "constructor",
  );
  expectCode(
    () =>
      createRegistry(outputModule).validateResult(
        invocationFixture,
        resultFixture,
      ),
    "DR1704",
  );

  const inheritedOutcome = clone(resultFixture);
  inheritedOutcome.outcome = "constructor";
  inheritedOutcome.outputs = {};
  inheritedOutcome.evidence = [];
  expectCode(
    () => createRegistry().validateResult(invocationFixture, inheritedOutcome),
    "DR1701",
  );
});

test("required provenance is unique and bound to its declared output", () => {
  const registry = createRegistry();
  const conflicting = clone(resultFixture);
  conflicting.evidence.push({
    ...clone(conflicting.evidence[0]),
    status: "fail",
  });
  expectCode(
    () => registry.validateResult(invocationFixture, conflicting),
    "DR1711",
  );

  const unrelated = clone(resultFixture);
  unrelated.evidence[0].artifact.artifactId = "unrelated-artifact";
  unrelated.evidence[0].artifact.digest =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  expectCode(
    () => registry.validateResult(invocationFixture, unrelated),
    "DR1707",
  );
});

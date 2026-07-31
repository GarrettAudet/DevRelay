import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ContractError,
  createModuleRegistry,
} from "../src/module-registry.mjs";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

const [
  requirementsModule,
  openSpecPlugin,
  openSpecInvocation,
  openSpecResult,
  clarificationResumeInvocation,
  changeSetInvocation,
] = await Promise.all([
  readJson("examples/modules/requirements-gathering.module.json"),
  readJson("examples/plugins/openspec.plugin.json"),
  readJson("examples/invocations/requirements-openspec.invocation.json"),
  readJson("examples/results/requirements-openspec.result.json"),
  readJson(
    "examples/invocations/requirements-clarification-resume-openspec.invocation.json",
  ),
  readJson(
    "examples/invocations/requirements-openspec-change-set.invocation.json",
  ),
]);

const registry = createModuleRegistry({
  modules: [requirementsModule],
  plugins: [
    {
      definition: openSpecPlugin,
      adapter: { invoke() {} },
    },
  ],
});

function clone(value) {
  return structuredClone(value);
}

function expectContractError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("published invocation and result schemas are executed", () => {
  const badDigest = clone(openSpecInvocation);
  badDigest.inputs.goal[0].digest = "not-a-digest";
  expectContractError(() => registry.resolve(badDigest), "DR1606");

  const missingInvocationId = clone(openSpecInvocation);
  delete missingInvocationId.invocationId;
  expectContractError(() => registry.resolve(missingInvocationId), "DR1606");

  const malformedResult = clone(openSpecResult);
  delete malformedResult.kind;
  expectContractError(
    () => registry.validateResult(openSpecInvocation, malformedResult),
    "DR1709",
  );
});

test("portable options and selected plug-in config schemas are executed", () => {
  const unsupportedOption = clone(openSpecInvocation);
  unsupportedOption.options = { mode: "invented" };
  expectContractError(() => registry.resolve(unsupportedOption), "DR1607");

  const incompleteConfig = clone(openSpecInvocation);
  incompleteConfig.config = {};
  expectContractError(() => registry.resolve(incompleteConfig), "DR1608");
});

test("Module ports accept only JSON-compatible media types", () => {
  const nonJson = clone(requirementsModule);
  nonJson.operations[0].inputs[0].mediaTypes = ["text/plain"];
  expectContractError(
    () => createModuleRegistry({ modules: [nonJson] }),
    "DR1207",
  );

  const genericJson = clone(requirementsModule);
  genericJson.operations[0].inputs[0].mediaTypes = ["application/json"];
  assert.equal(
    createModuleRegistry({ modules: [genericJson] }).moduleCount,
    1,
  );

  const vendorJson = clone(requirementsModule);
  vendorJson.operations[0].inputs[0].mediaTypes = [
    "application/vnd.example.requirement+json",
  ];
  assert.equal(
    createModuleRegistry({ modules: [vendorJson] }).moduleCount,
    1,
  );
});

test("continuation and clarification responses form an explicit pair", () => {
  const noResponses = clone(clarificationResumeInvocation);
  delete noResponses.inputs["clarification-responses"];
  expectContractError(() => registry.resolve(noResponses), "DR1406");

  const noContinuation = clone(clarificationResumeInvocation);
  delete noContinuation.inputs.continuation;
  expectContractError(() => registry.resolve(noContinuation), "DR1406");
});

test("a baseline-bound invocation cannot claim a full draft outcome", () => {
  const mismatchedResult = clone(openSpecResult);
  mismatchedResult.invocationId = changeSetInvocation.invocationId;

  expectContractError(
    () => registry.validateResult(changeSetInvocation, mismatchedResult),
    "DR1710",
  );
});

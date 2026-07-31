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
const clone = (value) => structuredClone(value);

const [
  moduleDefinition,
  specKitPlan,
  openSpecDesign,
  structurizr,
  madr,
  establishInvocation,
  changeInvocation,
  resumeInvocation,
  establishResult,
  changeResult,
  clarificationResult,
  continuationFixture,
] = await Promise.all([
  readJson("examples/modules/architecture-design.module.json"),
  readJson("examples/plugins/spec-kit-plan.plugin.json"),
  readJson("examples/plugins/openspec-design.plugin.json"),
  readJson("examples/plugins/structurizr.plugin.json"),
  readJson("examples/plugins/madr.plugin.json"),
  readJson("examples/invocations/architecture-establish-baseline.invocation.json"),
  readJson("examples/invocations/architecture-design-change.invocation.json"),
  readJson("examples/invocations/architecture-establish-resume.invocation.json"),
  readJson("examples/results/architecture-establish-baseline.result.json"),
  readJson("examples/results/architecture-design-change.result.json"),
  readJson("examples/results/architecture-establish-clarification.result.json"),
  readJson("examples/artifacts/architecture-continuation-001.json"),
]);

const noOpAdapter = {
  async invoke() {
    throw new Error("static contract test does not execute adapters");
  },
};

const registry = createModuleRegistry({
  modules: [moduleDefinition],
  plugins: [specKitPlan, openSpecDesign, structurizr, madr].map(
    (definition) => ({
      definition,
      adapter: noOpAdapter,
    }),
  ),
});

function expectContractError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("canonical baseline and change examples resolve exact configured chains", () => {
  const baseline = registry.resolve(establishInvocation);
  const change = registry.resolve(changeInvocation);

  assert.deepEqual(
    baseline.steps.map(({ binding }) => binding.plugin.id),
    ["spec-kit-plan", "structurizr", "madr"],
  );
  assert.deepEqual(
    change.steps.map(({ binding }) => binding.plugin.id),
    ["openspec-design", "structurizr", "madr"],
  );
  assert.deepEqual(
    moduleDefinition.operations.map(({ id }) => id),
    ["establish-baseline", "design-change"],
  );
});

test("each operation exposes one candidate outcome and never an approved baseline", () => {
  const expected = new Map([
    ["establish-baseline", "architecture-draft"],
    ["design-change", "architecture-change-set-draft"],
  ]);
  for (const operation of moduleDefinition.operations) {
    const success =
      operation.resultContracts[
        operation.id === "establish-baseline"
          ? "baseline_drafted"
          : "change_set_drafted"
      ];
    assert.deepEqual(success.requiredOutputs, [expected.get(operation.id)]);
    assert.deepEqual(success.allowedOutputs, [expected.get(operation.id)]);
    assert.equal(
      operation.outputs.some(
        ({ schema }) =>
          schema === "https://devrelay.dev/artifacts/architecture-baseline/v1",
      ),
      false,
    );
  }
});

test("canonical primary result fixtures validate against their operations", () => {
  assert.equal(
    registry.validateResult(establishInvocation, establishResult),
    establishResult,
  );
  assert.equal(
    registry.validateResult(changeInvocation, changeResult),
    changeResult,
  );
});

test("cross-operation, extra supporting, and unverified outputs fail closed", () => {
  const crossOperation = clone(establishResult);
  crossOperation.outputs = clone(changeResult.outputs);
  expectContractError(
    () => registry.validateResult(establishInvocation, crossOperation),
    "DR1704",
  );

  const extraSupporting = clone(establishResult);
  extraSupporting.outputs["native-source-bundle"] = clone(
    establishResult.outputs["architecture-draft"],
  );
  expectContractError(
    () => registry.validateResult(establishInvocation, extraSupporting),
    "DR1705",
  );

  const missingEvidence = clone(establishResult);
  missingEvidence.evidence = missingEvidence.evidence.filter(
    ({ kind }) => kind !== "architecture/contract-validation",
  );
  expectContractError(
    () => registry.validateResult(establishInvocation, missingEvidence),
    "DR1707",
  );

  const failedEvidence = clone(establishResult);
  failedEvidence.evidence.find(
    ({ kind }) => kind === "architecture/contract-validation",
  ).status = "fail";
  expectContractError(
    () => registry.validateResult(establishInvocation, failedEvidence),
    "DR1707",
  );
});

test("gate inputs are explicit and design-change requires the exact baseline", () => {
  for (const invocation of [establishInvocation, changeInvocation]) {
    for (const required of [
      "project-architecture-state",
      "routing-decision",
      "requirements-baseline",
      "project-context",
    ]) {
      const missing = clone(invocation);
      delete missing.inputs[required];
      expectContractError(() => registry.resolve(missing), "DR1404");
    }
  }

  const missingBaseline = clone(changeInvocation);
  delete missingBaseline.inputs["architecture-baseline"];
  expectContractError(() => registry.resolve(missingBaseline), "DR1404");
});

test("clarification result and resume invocation preserve the exact triad", () => {
  assert.equal(
    registry.validateResult(establishInvocation, clarificationResult),
    clarificationResult,
  );
  const sourceResolution = registry.resolve(establishInvocation);
  const resumeResolution = registry.resolve(resumeInvocation);
  assert.equal(resumeResolution.operationDefinition.id, "establish-baseline");
  assert.equal(
    continuationFixture.sourceInvocation.invocationId,
    establishInvocation.invocationId,
  );
  assert.equal(
    continuationFixture.sourceInvocation.invocationFingerprint,
    sourceResolution.invocationFingerprint,
  );
  assert.equal(
    continuationFixture.chainFingerprint,
    sourceResolution.chainFingerprint,
  );
  assert.equal(
    continuationFixture.chainFingerprint,
    resumeResolution.chainFingerprint,
  );
  for (const member of [
    "clarification-request",
    "clarification-responses",
    "continuation",
  ]) {
    const missing = clone(resumeInvocation);
    delete missing.inputs[member];
    expectContractError(() => registry.resolve(missing), "DR1406");
  }
});

function collectIds(value, result = new Set()) {
  if (value === null || typeof value !== "object") {
    return result;
  }
  if (typeof value.$id === "string") {
    result.add(value.$id);
  }
  for (const child of Object.values(value)) {
    collectIds(child, result);
  }
  return result;
}

test("every ArchitectureDesign port references a published artifact schema", async () => {
  const schemas = await Promise.all(
    [
      "contracts/requirements-gathering-artifacts.schema.json",
      "contracts/shared-artifacts.schema.json",
      "contracts/architecture-design-artifacts.schema.json",
      "contracts/module-route-decision.schema.json",
    ].map(readJson),
  );
  const published = new Set(
    schemas.flatMap((schema) => [...collectIds(schema)]),
  );

  for (const operation of moduleDefinition.operations) {
    for (const port of [...operation.inputs, ...operation.outputs]) {
      assert.ok(published.has(port.schema), `${port.name}: ${port.schema}`);
    }
    for (const step of operation.adapterChain.steps) {
      for (const port of step.outputs ?? []) {
        assert.ok(published.has(port.schema), `${step.id}: ${port.schema}`);
      }
    }
  }
});


test("MADR write demand follows each invocation's configured decisionsPath", () => {
  for (const operation of madr.implements[0].operations) {
    const write = operation.capabilities.find(
      ({ kind }) => kind === "filesystem.write",
    );
    assert.equal(write.scope, "config:decisionsPath");
  }
  for (const invocation of [establishInvocation, changeInvocation]) {
    const binding = invocation.adapters.find(
      ({ plugin }) => plugin.id === "madr",
    );
    assert.equal(
      binding.config.decisionsPath,
      "/workspace/architecture/decisions",
    );
    assert.ok(
      binding.grants.some(
        ({ kind, scope }) =>
          kind === "filesystem.write" &&
          scope === "/workspace/architecture/decisions",
      ),
    );
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateArchitectureArtifact } from "../src/architecture-artifact-validator.mjs";
import { sha256Digest } from "../src/content-digest.mjs";
import { ContractError, createModuleRegistry } from "../src/module-registry.mjs";
import {
  MODULE_ROUTE_DECISION_SCHEMA,
  RoutingError,
  assertInvocationMatchesRoute,
} from "../src/operation-router.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [
  architectureModule,
  specKitPlan,
  openSpecDesign,
  structurizr,
  madr,
] = await Promise.all([
  readJson("examples/modules/architecture-design.module.json"),
  readJson("examples/plugins/spec-kit-plan.plugin.json"),
  readJson("examples/plugins/openspec-design.plugin.json"),
  readJson("examples/plugins/structurizr.plugin.json"),
  readJson("examples/plugins/madr.plugin.json"),
]);

const adapter = {
  async invoke() {
    throw new Error("not executed by module surface tests");
  },
};
const registry = createModuleRegistry({
  modules: [architectureModule],
  plugins: [specKitPlan, openSpecDesign, structurizr, madr].map(
    (definition) => ({
      definition,
      adapter,
    }),
  ),
  artifactContracts: [
    {
      schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
      validate: validateArchitectureArtifact,
    },
  ],
});

const stateFiles = {
  "greenfield-unbaselined":
    "examples/artifacts/project-architecture-state-greenfield-001.json",
  "existing-undiscovered":
    "examples/artifacts/project-architecture-state-existing-undiscovered-001.json",
  "existing-discovered-unbaselined":
    "examples/artifacts/project-architecture-state-existing-discovered-001.json",
  baselined:
    "examples/artifacts/project-architecture-state-baselined-001.json",
};

async function route(state) {
  const bytes = await readFile(new URL(stateFiles[state], root));
  const ref = {
    artifactId: `project-architecture-state-${state}`,
    schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
    mediaType: "application/vnd.devrelay.project-architecture-state+json",
    digest: sha256Digest(bytes),
    uri: `artifact://test/project-architecture-state-${state}`,
  };
  return registry.selectOperation(
    {
      id: "architecture-design",
      version: "0.1.0",
    },
    ref,
    {
      artifacts: {
        async load() {
          return bytes;
        },
      },
    },
  );
}

function targets(plugin) {
  return plugin.implements.flatMap((implementation) =>
    implementation.operations.map((operation) => ({
      operation: operation.id,
      step: operation.step,
    })),
  );
}

test("ArchitectureDesign is one Module with exactly two operations", () => {
  assert.equal(architectureModule.metadata.id, "architecture-design");
  assert.deepEqual(
    architectureModule.operations.map(({ id }) => id),
    ["establish-baseline", "design-change"],
  );
  assert.equal(
    architectureModule.routing.stateInput,
    "project-architecture-state",
  );
  assert.equal(architectureModule.routing.decisionInput, "routing-decision");
  for (const operation of architectureModule.operations) {
    assert.deepEqual(
      operation.adapterChain.steps.map(({ id }) => id),
      ["designer", "modeler", "decision-recorder"],
    );
    const decisionPort = operation.inputs.find(
      ({ name }) => name === "routing-decision",
    );
    assert.equal(decisionPort.schema, MODULE_ROUTE_DECISION_SCHEMA);
  }
});

test("digest-verified project state deterministically selects operation or discovery", async () => {
  for (const state of [
    "greenfield-unbaselined",
    "existing-discovered-unbaselined",
  ]) {
    assert.deepEqual((await route(state)).selection, {
      kind: "operation",
      operation: "establish-baseline",
    });
  }
  assert.deepEqual((await route("baselined")).selection, {
    kind: "operation",
    operation: "design-change",
  });
  assert.deepEqual((await route("existing-undiscovered")).selection, {
    kind: "prerequisite",
    module: {
      id: "architecture-discovery",
      version: "0.1.0",
    },
    operation: "discover",
    outputSchema:
      "https://devrelay.dev/artifacts/current-architecture-snapshot/v1",
  });
});

test("an invocation cannot improvise a different operation", async () => {
  const decision = await route("baselined");
  const valid = {
    module: {
      id: "architecture-design",
      version: "0.1.0",
      operation: "design-change",
    },
  };
  assert.equal(assertInvocationMatchesRoute(decision, valid), valid);

  const invalid = structuredClone(valid);
  invalid.module.operation = "establish-baseline";
  assert.throws(
    () => assertInvocationMatchesRoute(decision, invalid),
    (error) => error instanceof RoutingError && error.code === "DR2017",
  );
});

test("V1 manifests bind only their exact operation and step roles", () => {
  assert.deepEqual(targets(specKitPlan), [
    {
      operation: "establish-baseline",
      step: "designer",
    },
  ]);
  assert.deepEqual(targets(openSpecDesign), [
    {
      operation: "design-change",
      step: "designer",
    },
  ]);
  assert.deepEqual(targets(structurizr), [
    {
      operation: "establish-baseline",
      step: "modeler",
    },
    {
      operation: "design-change",
      step: "modeler",
    },
  ]);
  assert.deepEqual(targets(madr), [
    {
      operation: "establish-baseline",
      step: "decision-recorder",
    },
    {
      operation: "design-change",
      step: "decision-recorder",
    },
  ]);
});

test("each success contract has exactly one primary output", () => {
  const expected = new Map([
    ["establish-baseline", ["architecture-draft"]],
    ["design-change", ["architecture-change-set-draft"]],
  ]);
  for (const operation of architectureModule.operations) {
    const successOutcome =
      operation.id === "establish-baseline"
        ? "baseline_drafted"
        : "change_set_drafted";
    const contract = operation.resultContracts[successOutcome];
    assert.deepEqual(contract.requiredOutputs, expected.get(operation.id));
    assert.deepEqual(contract.allowedOutputs, expected.get(operation.id));
  }
});

test("state artifact loading and validation fail closed", async () => {
  const ref = {
    artifactId: "invalid-state",
    schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
    mediaType: "application/vnd.devrelay.project-architecture-state+json",
    digest: `sha256:${"a".repeat(64)}`,
    uri: "artifact://test/invalid-state",
  };
  await assert.rejects(
    registry.selectOperation(
      {
        id: "architecture-design",
        version: "0.1.0",
      },
      ref,
      {
        artifacts: {
          async load() {
            return Buffer.from('{"state":"model-decides"}\n', "utf8");
          },
        },
      },
    ),
    (error) => error instanceof ContractError && error.code === "DR2103",
  );
});

test("generic Core contains no architecture or adapter product branch", async () => {
  const source = (
    await Promise.all(
      [
        "contracts/module-definition.schema.json",
        "contracts/module-plugin.schema.json",
        "contracts/module-invocation.schema.json",
        "contracts/module-route-decision.schema.json",
        "contracts/module-step-invocation.schema.json",
        "contracts/module-step-result.schema.json",
        "src/artifact-runtime.mjs",
        "src/module-registry.mjs",
        "src/operation-router.mjs",
        "src/schema-validation.mjs",
      ].map((path) => readFile(new URL(path, root), "utf8")),
    )
  )
    .join("\n")
    .toLowerCase();

  for (const identifier of [
    "architecture-design",
    "spec-kit-plan",
    "openspec-design",
    "structurizr",
    "madr",
  ]) {
    assert.equal(source.includes(identifier), false);
  }
});

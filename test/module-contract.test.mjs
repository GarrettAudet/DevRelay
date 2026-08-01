import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ContractError,
  createInvocationFingerprint,
  createModuleRegistry,
} from "../src/module-registry.mjs";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

const [
  definitionSchema,
  pluginSchema,
  invocationSchema,
  routeDecisionSchema,
  resultSchema,
  artifactSchema,
  projectOverviewArtifactSchema,
  sharedArtifactSchema,
  requirementsModule,
  commandModule,
  openSpecPlugin,
  specKitPlugin,
  commandPlugin,
  openSpecInvocation,
  specKitInvocation,
  clarificationInvocation,
  clarificationResumeInvocation,
  changeSetInvocation,
  openSpecResult,
  specKitResult,
  clarificationResult,
  changeSetResult,
] = await Promise.all([
  readJson("contracts/module-definition.schema.json"),
  readJson("contracts/module-plugin.schema.json"),
  readJson("contracts/module-invocation.schema.json"),
  readJson("contracts/module-route-decision.schema.json"),
  readJson("contracts/module-result.schema.json"),
  readJson("contracts/requirements-gathering-artifacts.schema.json"),
  readJson("contracts/project-overview-artifacts.schema.json"),
  readJson("contracts/shared-artifacts.schema.json"),
  readJson("examples/modules/requirements-gathering.module.json"),
  readJson("examples/modules/command.module.json"),
  readJson("examples/plugins/openspec.plugin.json"),
  readJson("examples/plugins/github-spec-kit.plugin.json"),
  readJson("examples/plugins/local-command.plugin.json"),
  readJson("examples/invocations/requirements-openspec.invocation.json"),
  readJson("examples/invocations/requirements-spec-kit.invocation.json"),
  readJson(
    "examples/invocations/requirements-spec-kit-clarification.invocation.json",
  ),
  readJson(
    "examples/invocations/requirements-clarification-resume-openspec.invocation.json",
  ),
  readJson(
    "examples/invocations/requirements-openspec-change-set.invocation.json",
  ),
  readJson("examples/results/requirements-openspec.result.json"),
  readJson("examples/results/requirements-spec-kit.result.json"),
  readJson("examples/results/requirements-spec-kit-clarification.result.json"),
  readJson("examples/results/requirements-openspec-change-set.result.json"),
]);

const adapters = {
  openspec: {
    async invoke() {
      return openSpecResult;
    },
  },
  specKit: {
    async invoke() {
      return specKitResult;
    },
  },
  command: {
    async invoke() {
      throw new Error("not exercised by this contract fixture");
    },
  },
};

const registry = createModuleRegistry({
  modules: [requirementsModule, commandModule],
  plugins: [
    { definition: openSpecPlugin, adapter: adapters.openspec },
    { definition: specKitPlugin, adapter: adapters.specKit },
    { definition: commandPlugin, adapter: adapters.command },
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

function implementationTarget(plugin) {
  const implementation = plugin.implements[0];
  return {
    module: implementation.module,
    operations: implementation.operations.map(({ id }) => id),
  };
}

test("portable core contains no OpenSpec or Spec Kit branch", async () => {
  const coreText = await Promise.all(
    [
      "contracts/module-definition.schema.json",
      "contracts/module-plugin.schema.json",
      "contracts/module-invocation.schema.json",
      "contracts/module-route-decision.schema.json",
      "contracts/module-result.schema.json",
      "src/artifact-runtime.mjs",
      "src/module-registry.mjs",
      "src/operation-router.mjs",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );

  assert.equal(
    coreText.some((text) => /openspec|spec[- ]?kit/i.test(text)),
    false,
  );
});

test("semantic ModuleDefinition excludes implementation details", () => {
  const operation = requirementsModule.operations[0];

  assert.equal(requirementsModule.metadata.id, "requirements-gathering");
  assert.equal(operation.id, "gather");
  assert.equal("execution" in operation, false);
  assert.equal("configSchema" in operation, false);
  assert.equal("capabilities" in operation, false);
  assert.deepEqual(Object.keys(operation.resultContracts).sort(), [
    "change_set_drafted",
    "drafted",
    "execution_failed",
    "needs_clarification",
    "unable_to_proceed",
  ]);
});

test("OpenSpec and GitHub Spec Kit implement one exact semantic contract", () => {
  assert.deepEqual(
    implementationTarget(openSpecPlugin),
    implementationTarget(specKitPlugin),
  );
  assert.deepEqual(implementationTarget(openSpecPlugin), {
    module: {
      id: "requirements-gathering",
      version: "0.1.0",
    },
    operations: ["gather"],
  });

  for (const plugin of [openSpecPlugin, specKitPlugin]) {
    const operation = plugin.implements[0].operations[0];
    assert.equal(plugin.kind, "ModulePlugin");
    assert.equal(operation.execution, "effect");
    assert.equal("inputs" in operation, false);
    assert.equal("outputs" in operation, false);
    assert.equal("outcomes" in operation, false);
  }
});

test("registry resolves either requirements plug-in without changing the module", () => {
  const openSpec = registry.resolve(openSpecInvocation);
  const specKit = registry.resolve(specKitInvocation);

  assert.equal(openSpec.moduleDefinition, specKit.moduleDefinition);
  assert.equal(openSpec.operationDefinition, specKit.operationDefinition);
  assert.equal(openSpec.pluginDefinition.metadata.id, "openspec");
  assert.equal(specKit.pluginDefinition.metadata.id, "github-spec-kit");
  assert.notEqual(openSpec.adapter, adapters.openspec);
  assert.notEqual(specKit.adapter, adapters.specKit);
  assert.equal(Object.isFrozen(openSpec.adapter), true);
  assert.equal(Object.isFrozen(specKit.adapter), true);
  assert.equal(registry.moduleCount, 2);
  assert.equal(registry.pluginCount, 3);
});

test("registry snapshots the adapter invoke callable at registration", () => {
  const supplied = {
    invoke() {
      return "registered";
    },
  };
  const localRegistry = createModuleRegistry({
    modules: [requirementsModule],
    plugins: [{ definition: openSpecPlugin, adapter: supplied }],
  });
  const resolved = localRegistry.resolve(openSpecInvocation);
  const capturedInvoke = resolved.adapter.invoke;

  supplied.invoke = () => "replaced";

  assert.equal(resolved.adapter.invoke, capturedInvoke);
  assert.equal(resolved.adapter.invoke(), "registered");
  assert.equal(Object.isFrozen(resolved.adapter), true);
});

test("plug-in choice is part of deterministic invocation identity", () => {
  assert.notEqual(
    createInvocationFingerprint(openSpecInvocation),
    createInvocationFingerprint(specKitInvocation),
  );

  const reordered = {
    ...openSpecInvocation,
    config: {
      nativeOperation: openSpecInvocation.config.nativeOperation,
      bridge: openSpecInvocation.config.bridge,
      schema: openSpecInvocation.config.schema,
      changeName: openSpecInvocation.config.changeName,
      toolVersion: openSpecInvocation.config.toolVersion,
      toolName: openSpecInvocation.config.toolName,
      projectRoot: openSpecInvocation.config.projectRoot,
    },
  };
  assert.equal(
    createInvocationFingerprint(openSpecInvocation),
    createInvocationFingerprint(reordered),
  );
});

test("draft results from both plug-ins satisfy the same outcome contract", () => {
  assert.equal(
    registry.validateResult(openSpecInvocation, openSpecResult),
    openSpecResult,
  );
  assert.equal(
    registry.validateResult(specKitInvocation, specKitResult),
    specKitResult,
  );

  const openSpecDraft =
    openSpecResult.outputs["requirements-draft"][0];
  const specKitDraft = specKitResult.outputs["requirements-draft"][0];
  assert.equal(openSpecDraft.schema, specKitDraft.schema);
  assert.equal(openSpecDraft.mediaType, specKitDraft.mediaType);
});

test("outcome contracts reject missing, extra, or contradictory outputs", () => {
  const missingDraft = clone(openSpecResult);
  delete missingDraft.outputs["requirements-draft"];
  expectContractError(
    () => registry.validateResult(openSpecInvocation, missingDraft),
    "DR1704",
  );

  const contradictory = clone(openSpecResult);
  contradictory.outputs["requirements-change-set"] =
    changeSetResult.outputs["requirements-change-set"];
  expectContractError(
    () => registry.validateResult(openSpecInvocation, contradictory),
    "DR1705",
  );

  const wrongStatus = clone(openSpecResult);
  wrongStatus.status = "waiting";
  expectContractError(
    () => registry.validateResult(openSpecInvocation, wrongStatus),
    "DR1702",
  );
});

test("change-set outcome requires an exact baseline input", () => {
  assert.equal(
    registry.validateResult(changeSetInvocation, changeSetResult),
    changeSetResult,
  );

  const incompletePair = clone(changeSetInvocation);
  delete incompletePair.inputs["requirements-baseline"];
  expectContractError(
    () => registry.validateResult(incompletePair, changeSetResult),
    "DR1406",
  );

  const noBaselinePair = clone(changeSetInvocation);
  delete noBaselinePair.inputs["requirements-baseline"];
  delete noBaselinePair.inputs["project-overview-baseline"];
  expectContractError(
    () => registry.validateResult(noBaselinePair, changeSetResult),
    "DR1703",
  );
});

test("clarification is checkpointed and requires portable continuation", () => {
  assert.equal(clarificationResult.status, "completed");
  assert.equal(
    registry.validateResult(clarificationInvocation, clarificationResult),
    clarificationResult,
  );

  const noContinuation = clone(clarificationResult);
  delete noContinuation.outputs.continuation;
  expectContractError(
    () => registry.validateResult(clarificationInvocation, noContinuation),
    "DR1704",
  );
});

test("clarification continuation resolves through another compatible plug-in contract", () => {
  const priorRequest = clarificationResult.outputs["clarification-requests"][0];
  const resumedRequest =
    clarificationResumeInvocation.inputs["clarification-request"][0];
  const priorContinuation = clarificationResult.outputs.continuation[0];
  const resumedContinuation =
    clarificationResumeInvocation.inputs.continuation[0];

  assert.equal(priorRequest.artifactId, resumedRequest.artifactId);
  assert.equal(priorRequest.digest, resumedRequest.digest);
  assert.equal(priorContinuation.artifactId, resumedContinuation.artifactId);
  assert.equal(priorContinuation.digest, resumedContinuation.digest);
  assert.equal(clarificationInvocation.plugin.id, "github-spec-kit");
  assert.equal(clarificationResumeInvocation.plugin.id, "openspec");
  assert.equal(
    registry.resolve(clarificationResumeInvocation).moduleDefinition.metadata.id,
    "requirements-gathering",
  );
});

test("resolution rejects implicit, unknown, or incompatible plug-ins", () => {
  const missingPlugin = clone(openSpecInvocation);
  delete missingPlugin.plugin;
  expectContractError(() => registry.resolve(missingPlugin), "DR1606");

  const unknownVersion = clone(openSpecInvocation);
  unknownVersion.plugin.version = "9.9.9";
  expectContractError(() => registry.resolve(unknownVersion), "DR1602");

  const incompatible = clone(openSpecInvocation);
  incompatible.plugin = {
    id: "local-command",
    version: "0.1.0",
  };
  expectContractError(() => registry.resolve(incompatible), "DR1603");
});

test("generic command example uses the same registry path", () => {
  const commandInvocation = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: "command-001",
    runId: "run-command-001",
    nodeId: "command",
    module: {
      id: "command",
      version: "0.1.0",
      operation: "run",
    },
    plugin: {
      id: "local-command",
      version: "0.1.0",
    },
    inputs: {
      workspace: [
        {
          artifactId: "workspace-001",
          schema: "https://devrelay.dev/artifacts/workspace/v1",
          mediaType: "application/vnd.devrelay.workspace+json",
          digest:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          uri: "file:///workspace/.devrelay/artifacts/workspace-001.json",
        },
      ],
    },
    options: {},
    config: {
      executable: "node",
      args: ["--version"],
    },
    grants: [
      {
        kind: "filesystem.read",
        scope: "input:workspace",
      },
      {
        kind: "process.spawn",
        scope: "node",
      },
    ],
  };

  const resolution = registry.resolve(commandInvocation);
  assert.equal(resolution.moduleDefinition.metadata.id, "command");
  assert.equal(resolution.pluginDefinition.metadata.id, "local-command");
});

test("definitions with incomplete outcome contracts fail registration", () => {
  const invalidModule = clone(requirementsModule);
  delete invalidModule.operations[0].resultContracts.drafted;

  expectContractError(
    () => createModuleRegistry({ modules: [invalidModule] }),
    "DR1203",
  );
});

test("duplicate exact registrations fail instead of overwriting", () => {
  expectContractError(
    () =>
      createModuleRegistry({
        modules: [requirementsModule, requirementsModule],
      }),
    "DR1500",
  );
});

test("all top-level contracts use JSON Schema draft 2020-12", () => {
  for (const schema of [
    definitionSchema,
    pluginSchema,
    invocationSchema,
    routeDecisionSchema,
    resultSchema,
    artifactSchema,
    sharedArtifactSchema,
  ]) {
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
  }
  for (const schema of [
    definitionSchema,
    pluginSchema,
    invocationSchema,
    routeDecisionSchema,
    resultSchema,
  ]) {
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
  }
});

test("canonical requirements artifact IDs cover every module port", () => {
  const artifactIds = new Set(
    [
      artifactSchema,
      projectOverviewArtifactSchema,
      sharedArtifactSchema,
    ].flatMap((schema) =>
      Object.values(schema.$defs)
        .map((definition) => definition.$id)
        .filter(Boolean),
    ),
  );
  const operation = requirementsModule.operations[0];

  for (const port of [...operation.inputs, ...operation.outputs]) {
    assert.ok(artifactIds.has(port.schema), `missing artifact schema ${port.schema}`);
  }
});

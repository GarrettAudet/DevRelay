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

const [workBreakdownModule, specKitTasks, openSpecTasks] = await Promise.all([
  readJson("examples/modules/work-breakdown.module.json"),
  readJson("examples/plugins/spec-kit-tasks.plugin.json"),
  readJson("examples/plugins/openspec-tasks.plugin.json"),
]);

const adapter = {
  async invoke() {
    throw new Error("not executed by plug-in contract tests");
  },
};

function targets(plugin) {
  return plugin.implements.flatMap((implementation) =>
    implementation.operations.map((operation) => ({
      module: implementation.module,
      operation: operation.id,
      step: operation.step,
    })),
  );
}

function operations(plugin) {
  return plugin.implements[0].operations;
}

test("Spec Kit Tasks and OpenSpec Tasks are interchangeable direct WorkBreakdown adapters", () => {
  const expectedTargets = [
    {
      module: { id: "work-breakdown", version: "0.1.0" },
      operation: "establish-breakdown",
      step: undefined,
    },
    {
      module: { id: "work-breakdown", version: "0.1.0" },
      operation: "decompose-change",
      step: undefined,
    },
  ];
  assert.deepEqual(targets(specKitTasks), expectedTargets);
  assert.deepEqual(targets(openSpecTasks), expectedTargets);
  assert.equal(
    workBreakdownModule.operations.some((operation) => "adapterChain" in operation),
    false,
  );

  const registry = createModuleRegistry({
    modules: [workBreakdownModule],
    plugins: [specKitTasks, openSpecTasks].map((definition) => ({
      definition,
      adapter,
    })),
  });
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 2);
});

test("both task adapters are effect bindings with planning-only capability demands", () => {
  const expectedCapabilities = [
    { kind: "filesystem.read", scope: "config:projectRoot" },
    { kind: "filesystem.write", scope: "config:planningOutputRoot" },
    { kind: "network.connect", scope: "host:implementation-engine" },
  ];

  for (const plugin of [specKitTasks, openSpecTasks]) {
    for (const operation of operations(plugin)) {
      assert.equal(
        workBreakdownModule.operations.find(({ id }) => id === operation.id)
          .adapterExecution,
        "effect",
      );
      assert.equal(operation.execution, "effect");
      assert.deepEqual(operation.capabilities, expectedCapabilities);
      assert.equal(
        operation.capabilities.some(({ kind }) => kind === "process.spawn"),
        false,
      );
      assert.equal(
        operation.capabilities.some(({ kind }) => kind === "secrets.read"),
        false,
      );
      assert.equal(
        operation.capabilities.some(
          ({ kind, scope }) =>
            kind === "filesystem.write" && scope === "config:projectRoot",
        ),
        false,
      );
    }
  }
});

test("Core rejects a pure adapter for an effect-required WorkBreakdown operation", () => {
  const incompatible = structuredClone(specKitTasks);
  incompatible.implements[0].operations[0].execution = "pure";
  assert.throws(
    () =>
      createModuleRegistry({
        modules: [workBreakdownModule],
        plugins: [
          {
            definition: incompatible,
            adapter,
          },
        ],
      }),
    (error) => {
      assert.ok(error instanceof ContractError);
      assert.equal(error.code, "DR1313");
      return true;
    },
  );
});

test("Spec Kit binding invokes tasks rather than implementation for both operations", () => {
  for (const operation of operations(specKitTasks)) {
    const properties = operation.configSchema.properties;
    assert.equal(properties.toolName.const, "GitHub Spec Kit");
    assert.equal(properties.nativeOperation.const, "work.decompose");
    assert.equal(properties.command.const, "/speckit.tasks");
    assert.equal(properties.bridge.const, "agent-command");
    assert.ok(operation.configSchema.required.includes("planningOutputRoot"));
    assert.doesNotMatch(JSON.stringify(operation), /speckit\.implement/i);
  }
});

test("OpenSpec binding pins the bounded tasks artifact rather than apply for both operations", () => {
  for (const operation of operations(openSpecTasks)) {
    const properties = operation.configSchema.properties;
    assert.equal(properties.toolName.const, "OpenSpec");
    assert.equal(properties.schema.const, "devrelay-work-breakdown");
    assert.equal(properties.artifact.const, "tasks.md");
    assert.equal(properties.command.const, "/opsx:continue");
    assert.equal(properties.bridge.const, "agent-command");
    assert.ok(operation.configSchema.required.includes("planningOutputRoot"));
    assert.doesNotMatch(JSON.stringify(operation), /opsx:apply/i);
  }
});

test("portable Core contains no task-adapter or WorkBreakdown product branch", async () => {
  const source = (
    await Promise.all(
      [
        "contracts/module-definition.schema.json",
        "contracts/module-plugin.schema.json",
        "contracts/module-invocation.schema.json",
        "src/artifact-runtime.mjs",
        "src/module-registry.mjs",
        "src/operation-router.mjs",
      ].map((path) => readFile(new URL(path, root), "utf8")),
    )
  )
    .join("\n")
    .toLowerCase();

  for (const identifier of [
    "work-breakdown",
    "spec-kit-tasks",
    "openspec-tasks",
    "/speckit.tasks",
    "/opsx:continue",
  ]) {
    assert.equal(source.includes(identifier), false, identifier);
  }
});

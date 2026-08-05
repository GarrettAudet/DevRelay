import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createModuleRegistry } from "../src/module-registry.mjs";

const ROOT = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, ROOT), "utf8"));

const moduleDefinition = await readJson(
  "examples/modules/work-dependency-analysis.module.json",
);
const pluginDefinitions = await Promise.all(
  [
    "native-structured-dependency-proposer",
    "openspec-dependency-proposer",
    "task-master-dependency-proposer",
    "spec-kit-dependency-reviewer",
  ].map((id) => readJson(`examples/plugins/${id}.plugin.json`)),
);

const adapter = {
  async invoke() {
    throw new Error("not executed by module surface tests");
  },
};

test("WorkDependencyAnalysis declares one operation with generic Core and adapter-port sequencing", () => {
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: pluginDefinitions.map((definition) => ({ definition, adapter })),
    artifactContracts: [
      {
        schema: "https://devrelay.dev/artifacts/project-work-dependency-state/v1",
        validate(value) {
          assert.equal(value.state, "ready");
        },
      },
    ],
  });
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 4);
  assert.deepEqual(
    moduleDefinition.operations.map(({ id }) => id),
    ["analyze-dependencies"],
  );
  const operation = moduleDefinition.operations[0];
  assert.deepEqual(
    operation.extensionPorts.map(({ id, role }) => [id, role]),
    [
      ["dependency-proposer", "proposer"],
      ["consistency-reviewer", "reviewer"],
    ],
  );
  assert.deepEqual(
    operation.orchestrationPlan.map(({ kind, handler }) => `${kind}:${handler}`),
    [
      "core:work-dependency/snapshot-builder",
      "extension-port:dependency-proposer",
      "core:work-dependency/graphology-dag",
      "core:work-dependency/opa-policy",
      "extension-port:consistency-reviewer",
      "core:work-dependency/candidate-assembler",
      "core:work-dependency/checkpoint",
    ],
  );
});

test("default and optional proposal adapters share one role while Spec Kit is review-only", () => {
  const roles = new Map(
    pluginDefinitions.map((definition) => [
      definition.metadata.id,
      definition.implements[0].operations[0].role,
    ]),
  );
  assert.equal(roles.get("native-structured-dependency-proposer"), "proposer");
  assert.equal(roles.get("openspec-dependency-proposer"), "proposer");
  assert.equal(roles.get("task-master-dependency-proposer"), "proposer");
  assert.equal(roles.get("spec-kit-dependency-reviewer"), "reviewer");
  for (const definition of pluginDefinitions) {
    const implementation = definition.implements[0];
    assert.deepEqual(implementation.module, {
      id: "work-dependency-analysis",
      version: "0.1.0",
    });
    assert.deepEqual(
      implementation.operations.map(({ id }) => id),
      ["analyze-dependencies"],
    );
  }
});

test("Core implementation contains no adapter-specific routing branch", async () => {
  const runtime = await readFile(
    new URL("src/work-dependency-runtime.mjs", ROOT),
    "utf8",
  );
  for (const forbidden of ["openspec", "task-master", "spec-kit"]) {
    assert.equal(runtime.toLowerCase().includes(forbidden), false);
  }
});

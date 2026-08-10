import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { contractGenerationRuntimeArtifactContracts } from "../src/contract-generation-artifact-validator.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";

const ROOT = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
const moduleDefinition = await readJson("examples/modules/contract-generation.module.json");
const pluginIds = [
  "json-schema-contract-generator",
  "openapi-contract-generator",
  "asyncapi-contract-generator",
  "protobuf-contract-generator",
];
const plugins = await Promise.all(pluginIds.map((id) => readJson(`examples/plugins/${id}.plugin.json`)));
const adapter = { async invoke() { throw new Error("surface test does not execute adapters"); } };

test("ContractGeneration is one state-routed module with two operations and one bounded generator port", () => {
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: plugins.map((definition) => ({ definition, adapter })),
    artifactContracts: contractGenerationRuntimeArtifactContracts(),
  });
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 4);
  assert.deepEqual(moduleDefinition.operations.map(({ id }) => id), [
    "establish-contracts",
    "generate-contract-change",
  ]);
  for (const operation of moduleDefinition.operations) {
    assert.deepEqual(operation.extensionPorts, [
      {
        id: "contract-generator",
        role: "proposer",
        inputSchema: "https://devrelay.dev/artifacts/contract-generator-request/v1",
        outputSchema: "https://devrelay.dev/artifacts/generated-contract-bundle/v1",
        required: true,
      },
    ]);
    assert.deepEqual(
      operation.orchestrationPlan.map(({ kind, handler }) => `${kind}:${handler}`),
      [
        "core:contract-generation/route-guard",
        "extension-port:contract-generator",
        "core:contract-generation/format-validator-registry",
        "core:contract-generation/canonical-diff",
        "core:contract-generation/candidate-assembler",
        "core:contract-generation/checkpoint",
      ],
    );
  }
  assert.deepEqual(
    moduleDefinition.operations.map(({ outputs }) => outputs[0].name),
    ["contract-draft-set", "contract-change-set-draft"],
  );
});

test("all format adapters bind the same proposer role without Gate or graph authority", () => {
  for (const plugin of plugins) {
    const implementation = plugin.implements[0];
    assert.deepEqual(implementation.module, { id: "contract-generation", version: "0.1.0" });
    assert.deepEqual(implementation.operations.map(({ id }) => id), [
      "establish-contracts",
      "generate-contract-change",
    ]);
    assert.ok(implementation.operations.every(({ role }) => role === "proposer"));
    assert.equal(JSON.stringify(plugin).toLowerCase().includes("traceabilitygraph"), false);
    assert.equal(JSON.stringify(plugin).toLowerCase().includes("contractgate"), false);
  }
});

test("generic ContractGeneration runtime contains no optional product or interface special cases", async () => {
  const source = (
    await readFile(new URL("src/contract-generation-runtime.mjs", ROOT), "utf8")
  ).toLowerCase();
  for (const forbidden of ["openapi", "asyncapi", "protobuf", "if-run-", "if-cg-"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

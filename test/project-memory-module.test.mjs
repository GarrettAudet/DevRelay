import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createModuleRegistry } from "../src/module-registry.mjs";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("ProjectMemory publishes four state-routed operations and a bounded local Mem0 provider", async () => {
  const moduleDefinition = await readJson("../examples/modules/project-memory.module.json");
  const pluginDefinition = await readJson("../examples/plugins/mem0-project-memory.plugin.json");
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [{ definition: pluginDefinition, adapter: { async invoke() { throw new Error("not exercised"); } } }],
  });
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 1);
  assert.deepEqual(moduleDefinition.operations.map(({ id }) => id), ["load-context", "refresh-context", "propose-update", "conclude-session"]);
  assert.equal(moduleDefinition.operations.every(({ inputs }) => inputs.some(({ name, required }) => name === "project-overview-baseline" && required)), true);

  const providerOperations = moduleDefinition.operations.filter(({ extensionPorts }) => extensionPorts.length > 0);
  assert.deepEqual(providerOperations.map(({ id }) => id), ["load-context", "refresh-context"]);
  assert.equal(providerOperations.every(({ extensionPorts }) => extensionPorts.length === 1 && extensionPorts[0].id === "memory-provider" && extensionPorts[0].role === "proposer" && extensionPorts[0].required === false), true);
  assert.equal(moduleDefinition.operations.find(({ id }) => id === "conclude-session").extensionPorts.length, 0);

  const implementations = pluginDefinition.implements[0].operations;
  assert.deepEqual(implementations.map(({ id }) => id), ["load-context", "refresh-context"]);
  assert.equal(implementations.every(({ role, execution, capabilities }) => role === "proposer" && execution === "effect" && capabilities.length === 1 && capabilities[0].kind === "process.spawn"), true);
  assert.equal(implementations.some(({ capabilities }) => capabilities.some(({ kind }) => kind === "network.connect" || kind === "filesystem.write" || kind === "secrets.read")), false);
});

test("ProjectMemory keeps provider retrieval before Core context assembly and outside Gate authority", async () => {
  const moduleDefinition = await readJson("../examples/modules/project-memory.module.json");
  for (const operation of moduleDefinition.operations.filter(({ id }) => id === "load-context" || id === "refresh-context")) {
    const steps = operation.orchestrationPlan.map(({ id }) => id);
    assert.ok(steps.indexOf("trace-projection") < steps.indexOf("provider-retrieval"));
    assert.ok(steps.indexOf("provider-retrieval") < steps.indexOf("context-assembly"));
    assert.ok(steps.indexOf("context-assembly") < steps.indexOf("checkpoint"));
  }
  const conclude = moduleDefinition.operations.find(({ id }) => id === "conclude-session");
  assert.deepEqual(conclude.orchestrationPlan.map(({ kind }) => kind), Array(conclude.orchestrationPlan.length).fill("core"));
  assert.deepEqual(conclude.resultContracts["session-concluded"].requiredEvidence.map(({ kind }) => kind), ["project-memory/gate-promotion", "project-memory/provider-synchronization"]);
});

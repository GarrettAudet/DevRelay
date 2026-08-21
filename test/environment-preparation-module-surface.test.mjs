import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createModuleRegistry } from "../src/module-registry.mjs";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("EnvironmentPreparation publishes four Core-routed operations and a bounded native Windows inventory plug-in", async () => {
  const moduleDefinition = await readJson("../examples/modules/environment-preparation.module.json");
  const pluginDefinition = await readJson("../examples/plugins/native-windows-environment-inventory.plugin.json");
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [{ definition: pluginDefinition, adapter: { async invoke() { throw new Error("not exercised"); } } }],
  });
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 1);
  assert.deepEqual(moduleDefinition.operations.map(({ id }) => id), ["establish-environment", "prepare-frontier", "revalidate-frontier", "remediate-drift"]);
  assert.ok(moduleDefinition.operations.every(({ outcomes }) => outcomes.includes("ready") && outcomes.includes("baseline-drift") && outcomes.includes("unable-to-proceed")));
  assert.ok(moduleDefinition.operations.every(({ orchestrationPlan }) => orchestrationPlan.some(({ id, kind }) => id === "gate" && kind === "core")));
  assert.ok(moduleDefinition.operations.slice(0, 3).every(({ orchestrationPlan }) => orchestrationPlan.some(({ id, kind }) => id === "inventory" && ["core", "extension-port"].includes(kind))));
  assert.ok(pluginDefinition.implements[0].operations.every(({ capabilities }) => capabilities.every(({ kind }) => new Set(["filesystem.read", "process.spawn"]).has(kind))));
  assert.equal(JSON.stringify(pluginDefinition).includes("filesystem.write"), false);
  assert.equal(JSON.stringify(pluginDefinition).includes("network.connect"), false);
  assert.equal(JSON.stringify(pluginDefinition).includes("secrets.read"), false);
});

test("the Desktop release surface documents readiness as mandatory and preserves scope boundaries", async () => {
  const [readme, guide, packageDocument] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/environment-preparation.md", import.meta.url), "utf8"),
    readJson("../package.json"),
  ]);
  assert.match(readme, /EnvironmentPreparation inventories, remediates, verifies/u);
  assert.match(guide, /mandatory pre-execution control/u);
  assert.match(guide, /does not claim deployment success/u);
  assert.equal(packageDocument.exports["./modules/environment-preparation.module.json"], "./examples/modules/environment-preparation.module.json");
  assert.equal(packageDocument.exports["./plugins/native-windows-environment-inventory.plugin.json"], "./examples/plugins/native-windows-environment-inventory.plugin.json");
});

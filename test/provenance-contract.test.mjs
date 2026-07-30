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

const [moduleDefinition, pluginDefinition, invocation, result] =
  await Promise.all([
    readJson("examples/modules/requirements-gathering.module.json"),
    readJson("examples/plugins/openspec.plugin.json"),
    readJson("examples/invocations/requirements-openspec.invocation.json"),
    readJson("examples/results/requirements-openspec.result.json"),
  ]);

const registry = createModuleRegistry({
  modules: [moduleDefinition],
  plugins: [
    {
      definition: pluginDefinition,
      adapter: { invoke() {} },
    },
  ],
});

test("promotable requirements candidates require passing source provenance", () => {
  const failedProvenance = structuredClone(result);
  failedProvenance.evidence[0].status = "fail";

  assert.throws(
    () => registry.validateResult(invocation, failedProvenance),
    (error) => {
      assert.ok(error instanceof ContractError);
      assert.equal(error.code, "DR1707");
      return true;
    },
  );
});

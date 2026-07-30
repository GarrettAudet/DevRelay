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

const [requirementsModule, openSpecPlugin, openSpecInvocation] =
  await Promise.all([
    readJson("examples/modules/requirements-gathering.module.json"),
    readJson("examples/plugins/openspec.plugin.json"),
    readJson("examples/invocations/requirements-openspec.invocation.json"),
  ]);

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

test("fingerprint follows input content identity, not storage location", () => {
  const relocated = clone(openSpecInvocation);
  relocated.inputs.goal[0].artifactId = "relocated-goal";
  relocated.inputs.goal[0].uri = "artifact://different-store/relocated-goal";
  relocated.grants.reverse();

  assert.equal(
    createInvocationFingerprint(openSpecInvocation),
    createInvocationFingerprint(relocated),
  );
});

test("duplicate semantic port names are rejected", () => {
  const duplicatePort = clone(requirementsModule);
  duplicatePort.operations[0].inputs.push(
    clone(duplicatePort.operations[0].inputs[0]),
  );

  expectContractError(
    () => createModuleRegistry({ modules: [duplicatePort] }),
    "DR1003",
  );
});

test("invalid plug-in capability declarations are rejected", () => {
  const invalidPlugin = clone(openSpecPlugin);
  invalidPlugin.implements[0].operations[0].capabilities[0].kind =
    "pipeline.mutate";

  expectContractError(
    () =>
      createModuleRegistry({
        modules: [requirementsModule],
        plugins: [
          {
            definition: invalidPlugin,
            adapter: { invoke() {} },
          },
        ],
      }),
    "DR1308",
  );
});

test("resolution requires every requested capability kind", () => {
  const registry = createModuleRegistry({
    modules: [requirementsModule],
    plugins: [
      {
        definition: openSpecPlugin,
        adapter: { invoke() {} },
      },
    ],
  });
  const missingNetworkGrant = clone(openSpecInvocation);
  missingNetworkGrant.grants = missingNetworkGrant.grants.filter(
    ({ kind }) => kind !== "network.connect",
  );

  expectContractError(
    () => registry.resolve(missingNetworkGrant),
    "DR1604",
  );
});

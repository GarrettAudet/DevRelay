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

test("resolution requires exact resolved capability scopes and no excess grants", () => {
  const registry = createModuleRegistry({
    modules: [requirementsModule],
    plugins: [
      {
        definition: openSpecPlugin,
        adapter: { invoke() {} },
      },
    ],
  });

  const wrongWritePath = clone(openSpecInvocation);
  wrongWritePath.grants.find(
    ({ kind }) => kind === "filesystem.write",
  ).scope = "C:/totally-unrelated";
  expectContractError(() => registry.resolve(wrongWritePath), "DR1604");

  const wrongImplementationHost = clone(openSpecInvocation);
  wrongImplementationHost.grants.find(
    ({ kind }) => kind === "network.connect",
  ).scope = "host:unrelated-service";
  expectContractError(
    () => registry.resolve(wrongImplementationHost),
    "DR1604",
  );

  const excessGrant = clone(openSpecInvocation);
  excessGrant.grants.push({
    kind: "secrets.read",
    scope: "host:all-secrets",
  });
  expectContractError(() => registry.resolve(excessGrant), "DR1604");

  const relocatedWithoutMatchingGrants = clone(openSpecInvocation);
  relocatedWithoutMatchingGrants.config.projectRoot = "/different-workspace";
  expectContractError(
    () => registry.resolve(relocatedWithoutMatchingGrants),
    "DR1604",
  );
});

test("resolution rejects capability templates that collide after substitution", () => {
  const collidingPlugin = clone(openSpecPlugin);
  collidingPlugin.implements[0].operations[0].capabilities.push({
    kind: "filesystem.read",
    scope: openSpecInvocation.config.projectRoot,
  });
  const collidingRegistry = createModuleRegistry({
    modules: [requirementsModule],
    plugins: [
      {
        definition: collidingPlugin,
        adapter: { invoke() {} },
      },
    ],
  });

  expectContractError(
    () => collidingRegistry.resolve(openSpecInvocation),
    "DR1604",
  );
});

test("plug-in registration rejects ambiguous capability scope templates", () => {
  const invalidPlugin = clone(openSpecPlugin);
  invalidPlugin.implements[0].operations[0].capabilities[1].scope =
    "config:projectRoot/../escape";

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
    "DR1313",
  );
});

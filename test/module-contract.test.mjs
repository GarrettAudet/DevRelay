import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

const [
  definitionSchema,
  invocationSchema,
  resultSchema,
  commandModule,
  openSpecModule,
  templateModule,
  invocation,
  result,
] = await Promise.all([
  readJson("contracts/module-definition.schema.json"),
  readJson("contracts/module-invocation.schema.json"),
  readJson("contracts/module-result.schema.json"),
  readJson("examples/modules/command.module.json"),
  readJson("examples/modules/openspec.module.json"),
  readJson("examples/modules/template-requirements.module.json"),
  readJson("examples/invocations/openspec-proposal.invocation.json"),
  readJson("examples/results/openspec-proposal.result.json"),
]);

const definitions = new Map(
  [commandModule, openSpecModule, templateModule].map((definition) => [
    `${definition.metadata.id}@${definition.metadata.version}`,
    definition,
  ]),
);

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
}

function getOperation(definition, operationId) {
  return definition.operations.find(({ id }) => id === operationId);
}

function portShape(operation, direction) {
  return operation[direction].map(
    ({ name, schema, mediaTypes, cardinality, required }) => ({
      name,
      schema,
      mediaTypes,
      cardinality,
      required,
    }),
  );
}

test("portable contracts contain no OpenSpec special case", async () => {
  const contractText = await Promise.all(
    [
      "contracts/module-definition.schema.json",
      "contracts/module-invocation.schema.json",
      "contracts/module-result.schema.json",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );

  assert.equal(contractText.some((text) => /openspec/i.test(text)), false);
});

test("module examples use one closed generic top-level shape", () => {
  for (const definition of definitions.values()) {
    exactKeys(
      definition,
      ["apiVersion", "kind", "metadata", "operations"],
      definition.metadata.id,
    );
    assert.equal(definition.apiVersion, "devrelay.dev/v1alpha1");
    assert.equal(definition.kind, "ModuleDefinition");
    assert.ok(definition.operations.length > 0);
    assert.equal(
      new Set(definition.operations.map(({ id }) => id)).size,
      definition.operations.length,
    );

    for (const operation of definition.operations) {
      assert.ok(["pure", "effect"].includes(operation.execution));
      assert.ok(operation.outcomes.length > 0);
      assert.equal(new Set(operation.outcomes).size, operation.outcomes.length);
    }
  }
});

test("OpenSpec proposal is replaceable by a non-OpenSpec module", () => {
  const openSpecProposal = getOperation(openSpecModule, "proposal");
  const templateProposal = getOperation(templateModule, "proposal");

  assert.ok(openSpecProposal);
  assert.ok(templateProposal);
  assert.deepEqual(
    portShape(openSpecProposal, "inputs"),
    portShape(templateProposal, "inputs"),
  );
  assert.deepEqual(
    portShape(openSpecProposal, "outputs"),
    portShape(templateProposal, "outputs"),
  );
  assert.deepEqual(openSpecProposal.outcomes, templateProposal.outcomes);
});

test("invocation resolves an exact module operation and declared ports", () => {
  const definition = definitions.get(
    `${invocation.module.id}@${invocation.module.version}`,
  );
  assert.ok(definition);

  const operation = getOperation(definition, invocation.module.operation);
  assert.ok(operation);

  const inputPorts = new Map(operation.inputs.map((port) => [port.name, port]));
  for (const [portName, artifacts] of Object.entries(invocation.inputs)) {
    const port = inputPorts.get(portName);
    assert.ok(port, `undeclared input port ${portName}`);
    assert.ok(artifacts.length > 0);
    for (const artifact of artifacts) {
      assert.equal(artifact.schema, port.schema);
      assert.ok(port.mediaTypes.includes(artifact.mediaType));
    }
  }

  const grantedKinds = new Set(invocation.grants.map(({ kind }) => kind));
  for (const capability of operation.capabilities) {
    assert.ok(grantedKinds.has(capability.kind));
  }
});

test("result uses only declared outcomes and output ports", () => {
  assert.equal(result.invocationId, invocation.invocationId);

  const definition = definitions.get(
    `${invocation.module.id}@${invocation.module.version}`,
  );
  const operation = getOperation(definition, invocation.module.operation);
  assert.ok(operation.outcomes.includes(result.outcome));

  const outputPorts = new Map(operation.outputs.map((port) => [port.name, port]));
  for (const [portName, artifacts] of Object.entries(result.outputs)) {
    const port = outputPorts.get(portName);
    assert.ok(port, `undeclared output port ${portName}`);
    for (const artifact of artifacts) {
      assert.equal(artifact.schema, port.schema);
      assert.ok(port.mediaTypes.includes(artifact.mediaType));
    }
  }
});

test("all contract schemas are draft 2020-12 JSON schemas", () => {
  for (const schema of [definitionSchema, invocationSchema, resultSchema]) {
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
  }
});

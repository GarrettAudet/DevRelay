import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("OpenSpec RequirementsGathering schema declares requirements artifacts only", async () => {
  const schema = await readText(
    "openspec/schemas/devrelay-requirements/schema.yaml",
  );
  assert.match(schema, /^\s*- id: proposal$/m);
  assert.match(schema, /^\s*- id: specs$/m);
  assert.doesNotMatch(schema, /^\s*- id: design$/m);
  assert.doesNotMatch(schema, /^\s*- id: tasks$/m);
});

test("OpenSpec ArchitectureDesign schema declares the designer artifact only", async () => {
  const schema = await readText(
    "openspec/schemas/devrelay-architecture/schema.yaml",
  );
  assert.match(schema, /^\s*- id: design$/m);
  assert.doesNotMatch(schema, /^\s*- id: proposal$/m);
  assert.doesNotMatch(schema, /^\s*- id: specs$/m);
  assert.doesNotMatch(schema, /^\s*- id: tasks$/m);
  const normalizedSchema = schema.replace(/\s+/g, " ");
  for (const downstream of [
    "canonical architecture model",
    "diagrams",
    "final MADR records",
    "detailed interface",
    "tasks",
    "implementation",
    "approval claims",
  ]) {
    assert.ok(normalizedSchema.includes(downstream), `missing exclusion ${downstream}`);
  }
});

test("OpenSpec design binding is limited to design-change designer", async () => {
  const plugin = await readJson(
    "examples/plugins/openspec-design.plugin.json",
  );
  assert.equal(plugin.metadata.id, "openspec-design");
  assert.deepEqual(plugin.implements, [
    {
      module: {
        id: "architecture-design",
        version: "0.1.0",
      },
      operations: plugin.implements[0].operations,
    },
  ]);
  const operation = plugin.implements[0].operations[0];
  assert.equal(operation.id, "design-change");
  assert.equal(operation.step, "designer");
  assert.equal(
    operation.configSchema.properties.schema.const,
    "devrelay-architecture",
  );
  assert.equal(operation.configSchema.properties.artifact.const, "design.md");
});

test("Spec Kit planning binding is limited to baseline designer", async () => {
  const plugin = await readJson(
    "examples/plugins/spec-kit-plan.plugin.json",
  );
  const operation = plugin.implements[0].operations[0];
  assert.equal(plugin.metadata.id, "spec-kit-plan");
  assert.equal(operation.id, "establish-baseline");
  assert.equal(operation.step, "designer");
  assert.equal(
    operation.configSchema.properties.command.const,
    "/speckit.plan",
  );
});

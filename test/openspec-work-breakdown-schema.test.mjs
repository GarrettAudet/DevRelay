import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

const schemaPath = "openspec/schemas/devrelay-work-breakdown/schema.yaml";
const templatePath =
  "openspec/schemas/devrelay-work-breakdown/templates/tasks.md";

test("OpenSpec WorkBreakdown schema exposes only the bounded tasks artifact", async () => {
  const schema = await readText(schemaPath);
  assert.match(schema, /^name: devrelay-work-breakdown$/m);
  assert.match(schema, /^\s*- id: tasks$/m);
  assert.match(schema, /^\s+generates: tasks\.md$/m);
  assert.match(schema, /^\s+template: tasks\.md$/m);
  for (const upstreamOrDownstreamArtifact of [
    "proposal",
    "specs",
    "design",
    "implementation",
    "apply",
  ]) {
    assert.doesNotMatch(
      schema,
      new RegExp(`^\\s*- id: ${upstreamOrDownstreamArtifact}$`, "m"),
    );
  }
  assert.equal((schema.match(/^\s*- id:/gm) ?? []).length, 1);
});

test("bounded OpenSpec instructions preserve the WorkBreakdown domain contract", async () => {
  const source = `${await readText(schemaPath)}\n${await readText(templatePath)}`
    .toLowerCase()
    .replaceAll(/\s+/g, " ");

  for (const requiredConcept of [
    "objective",
    "scope",
    "deliverables",
    "deliverable-oriented work type",
    "acceptance-criterion",
    "architecture",
    "contract references",
    "required capabilities",
    "dependency hints",
    "verification plan",
    "required evidence",
    "source references",
    "coverage disposition",
    "planned",
    "already-satisfied",
    "no-work-required",
  ]) {
    assert.ok(source.includes(requiredConcept), requiredConcept);
  }
});

test("bounded OpenSpec instructions explicitly exclude execution and downstream authority", async () => {
  const source = `${await readText(schemaPath)}\n${await readText(templatePath)}`
    .toLowerCase()
    .replaceAll(/\s+/g, " ");

  for (const exclusion of [
    "do not implement",
    "build code",
    "assign specialists",
    "choose owners",
    "estimate",
    "schedule",
    "track status",
    "produce change sets",
    "claim completion",
    "author traceabilitygraph updates",
    "author graph operations",
    "authoritative dependency dag",
  ]) {
    assert.ok(source.includes(exclusion), exclusion);
  }
});

test("OpenSpec Tasks plug-in pins the bounded schema and artifact for both operations", async () => {
  const plugin = await readJson("examples/plugins/openspec-tasks.plugin.json");
  assert.equal(plugin.metadata.id, "openspec-tasks");
  assert.deepEqual(
    plugin.implements[0].operations.map(({ id }) => id),
    ["establish-breakdown", "decompose-change"],
  );
  for (const operation of plugin.implements[0].operations) {
    assert.equal(
      operation.configSchema.properties.schema.const,
      "devrelay-work-breakdown",
    );
    assert.equal(operation.configSchema.properties.artifact.const, "tasks.md");
    assert.equal(operation.configSchema.properties.command.const, "/opsx:continue");
    assert.doesNotMatch(JSON.stringify(operation), /\/opsx:apply/i);
  }
});

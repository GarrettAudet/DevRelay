import assert from "node:assert/strict";
import test from "node:test";
let createPluginCatalog;
try { ({ createPluginCatalog } = await import("../src/plugin-catalog.mjs")); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

function fixture() {
  let calls = 0;
  const module = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleDefinition",
    metadata: { id: "example.echo", version: "1.0.0", description: "Example capability." },
    operations: [{
      id: "run", description: "Run.", inputs: [], outputs: [], outcomes: ["done"],
      inputRules: [], optionsSchema: { type: "object", additionalProperties: false }, evidence: [],
      resultContracts: { done: { status: "completed", requiredInputs: [], forbiddenInputs: [],
        requiredOutputs: [], allowedOutputs: [], requiredEvidence: [], diagnosticsRequired: false } },
    }],
  };
  const registration = (id) => ({
    definition: {
      apiVersion: "devrelay.dev/v1alpha1", kind: "ModulePlugin",
      metadata: { id, version: "1.0.0", description: "Example implementation." },
      implements: [{ module: { id: "example.echo", version: "1.0.0" },
        operations: [{ id: "run", execution: "pure",
          configSchema: { type: "object", additionalProperties: false }, capabilities: [] }] }],
    },
    adapter: { async invoke(invocation) {
      calls++;
      return { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult",
        invocationId: invocation.invocationId, status: "completed", outcome: "done",
        outputs: {}, evidence: [], diagnostics: [] };
    } },
  });
  return { module, plugins: [registration("example.two"), registration("example.one")], calls: () => calls };
}
function catalogFor(f) {
  assert.equal(typeof createPluginCatalog, "function", "catalog API must exist");
  return createPluginCatalog({ modules: [f.module], plugins: f.plugins });
}
function invocation() {
  return { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleInvocation",
    invocationId: "catalog-one", runId: "run-one", nodeId: "node-one",
    module: { id: "example.echo", version: "1.0.0", operation: "run" },
    plugin: { id: "example.one", version: "1.0.0" }, inputs: {}, options: {}, config: {}, grants: [] };
}

test("catalog lists exact registered bindings without invoking adapters", () => {
  const f = fixture(), catalog = catalogFor(f);
  assert.deepEqual(catalog.list().map(x => x.plugin.id), ["example.one", "example.two"]);
  assert.equal(catalog.list()[0].execution, "pure");
  assert.deepEqual(catalog.list()[0].capabilities, []);
  assert.equal(f.calls(), 0);
  assert.equal(catalog.registry.pluginCount, 2);
});

test("catalog filters exact module version, operation and step", () => {
  const catalog = catalogFor(fixture());
  assert.equal(catalog.list({ module: { id: "example.echo", version: "1.0.0" }, operation: "run" }).length, 2);
  assert.equal(catalog.list({ module: { id: "example.echo", version: "2.0.0" } }).length, 0);
  assert.equal(catalog.list({ operation: "other" }).length, 0);
  assert.equal(catalog.list({ step: "unknown" }).length, 0);
});

test("malformed filters reject instead of widening selection", () => {
  const catalog = catalogFor(fixture());
  for (const filter of [null, [], "run", { operations: "run" }, { operation: "" },
    { operation: 1 }, { step: "" }, { module: { id: "example.echo" } },
    { module: { id: "example.echo", version: "1.0.0", typo: true } }]) {
    assert.throws(() => catalog.list(filter), TypeError);
  }
});

test("catalog metadata and Core adapter bindings resist caller mutation", async () => {
  const f = fixture(), catalog = catalogFor(f);
  f.plugins[1].definition.metadata.id = "changed";
  f.plugins[1].definition.implements[0].operations[0].capabilities.push({ kind: "filesystem.read", scope: "changed" });
  f.plugins[1].adapter.invoke = () => { throw Error("replaced"); };
  assert.equal(catalog.list()[0].plugin.id, "example.one");
  assert.deepEqual(catalog.list()[0].capabilities, []);
  assert.throws(() => { catalog.list()[0].plugin.id = "changed"; }, TypeError);
  assert.throws(() => { catalog.list()[0].capabilities.push({}); }, TypeError);
  const result = await catalog.registry.execute(invocation(), { artifacts: { load() { throw Error("unused"); } } });
  assert.equal(result.outcome, "done");
  assert.equal(f.calls(), 1);
});

test("catalog construction preserves Core registration rejection", () => {
  const f = fixture();
  f.plugins[1].definition.implements[0].module.version = "9.0.0";
  assert.throws(() => catalogFor(f), /module|registered|unknown/i);
});

test("effect checkpoint replay survives a fresh catalog without repeating the effect", async () => {
  const { mkdtemp, readFile, writeFile, appendFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "devrelay-catalog-replay-"));
  try {
    const f = fixture();
    for (const plugin of f.plugins) plugin.definition.implements[0].operations[0].execution = "effect";
    const invoke = f.plugins[1].adapter.invoke;
    f.plugins[1].adapter.invoke = async function (request) {
      await appendFile(join(dir, "effects.txt"), "executed\n");
      return invoke.call(this, request);
    };
    const checkpoints = {
      async get(key) {
        try { return JSON.parse(await readFile(join(dir, Buffer.from(key).toString("hex") + ".json"), "utf8")); }
        catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
      },
      async put(key, value) {
        await writeFile(join(dir, Buffer.from(key).toString("hex") + ".json"), JSON.stringify(value));
      },
    };
    const context = { artifacts: { load() { throw Error("unused"); } }, checkpoints };
    const first = await catalogFor(f).registry.execute(invocation(), context);
    const second = await catalogFor(f).registry.execute(invocation(), context);
    assert.deepEqual(first, second);
    assert.equal(await readFile(join(dir, "effects.txt"), "utf8"), "executed\n");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("catalog execution rejects missing grants before dispatch", async () => {
  const f = fixture();
  f.plugins[1].definition.implements[0].operations[0].capabilities = [{ kind: "filesystem.read", scope: "repository" }];
  const catalog = catalogFor(f);
  await assert.rejects(catalog.registry.execute(invocation(), { artifacts: { load() {} } }), /grant|capability/i);
  assert.equal(f.calls(), 0);
});

test("catalog execution rejects malformed adapter results", async () => {
  const f = fixture();
  f.plugins[1].adapter.invoke = async () => ({ outcome: "done" });
  const catalog = catalogFor(f);
  await assert.rejects(catalog.registry.execute(invocation(), { artifacts: { load() {} } }), /result|invalid/i);
});

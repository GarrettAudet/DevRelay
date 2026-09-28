import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
let createDigestExample;
try { ({ createDigestExample } = await import("../examples/modular/digest.mjs")); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const context = {
  requirementsBytes: await readFile(new URL("../examples/artifacts/requirements-baseline-001.json", import.meta.url)),
  overviewBytes: await readFile(new URL("../examples/artifacts/project-overview-baseline-001.json", import.meta.url)),
  overviewMarkdownBytes: await readFile(new URL("../examples/artifacts/ProjectOverview.md", import.meta.url)),
};
function host() {
  assert.equal(typeof createDigestExample, "function", "runnable example must exist");
  return createDigestExample(context);
}
test("both real SHA-256 implementations satisfy known vectors", async () => {
  const example = host();
  for (const plugin of ["node-sha256", "webcrypto-sha256"]) {
    for (const [text, expected] of [
      ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
      ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
      ["é", "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c"],
    ]) {
      const result = await example.execute({ plugin, text });
      assert.equal(result.value.text, expected);
      assert.equal(result.result.outcome, "computed");
      assert.equal(result.result.evidence[0].status, "pass");
    }
  }
});
test("composition reuses an output artifact as the next declared input", async () => {
  const example = host();
  const first = await example.execute({ plugin: "node-sha256", text: "abc" });
  const second = await example.execute({ plugin: "webcrypto-sha256", input: first.result.outputs.digest[0] });
  assert.equal(second.value.text, "dfe7a23fefeea519e9bbfdd1a6be94c4b2e4529dd6b7cbea83f9959c2621b13c");
});
test("tampered input references fail before computing a result", async () => {
  const example = host();
  const input = example.storeText("abc");
  input.digest = "sha256:" + "0".repeat(64);
  await assert.rejects(example.execute({ plugin: "node-sha256", input }), { code: "DR2103" });
});
test("wrong capability or plugin version cannot execute", async () => {
  const example = host();
  await assert.rejects(example.execute({ plugin: "unknown", text: "abc" }), /plugin|registered/i);
  const invocation = example.invocation({ plugin: "node-sha256", text: "abc" });
  invocation.module.version = "9.0.0";
  await assert.rejects(example.catalog.registry.execute(invocation, example.runtimeContext), /module|registered/i);
});
test("invalid artifact body is rejected by the real validator", async () => {
  const example = host();
  assert.throws(() => example.storeText(7), /text|string/i);
});
test("explicit project context rejects a mismatched paired baseline", async () => {
  const example = createDigestExample({ ...context,
    requirementsBytes: await readFile(new URL("../examples/artifacts/requirements-baseline-002.json", import.meta.url)) });
  await assert.rejects(example.execute({ plugin: "node-sha256", text: "abc" }), /requirementsBaseline|paired|exact/i);
});
test("package consumer imports the focused modular surface", async () => {
  const imported = await import("devrelay/modular").catch(error => {
    if (error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") return {};
    throw error;
  });
  assert.equal(typeof imported.createPluginCatalog, "function", "package must expose modular API");
  assert.equal(typeof imported.createModuleRegistry, "function");
});

test("Desktop listing command works without loading project context or executing plugins", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../examples/modular/run.mjs", import.meta.url)), "--list"],
    { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).map(item => item.id), ["node-sha256", "webcrypto-sha256"]);
});

test("documented CLI runs both plugins against an existing repository file", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { createHash } = await import("node:crypto");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const expected = createHash("sha256").update(await readFile(new URL("../README.md", import.meta.url))).digest("hex");
  for (const plugin of ["node-sha256", "webcrypto-sha256"]) {
    const result = spawnSync(process.execPath,
      ["examples/modular/run.mjs", "README.md", "examples/modular/context", plugin],
      { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).digest, expected);
  }
});

test("CLI accepts a file from a newly created project with explicit demo context", async t => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = await mkdtemp(join(tmpdir(), "devrelay-new-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "hello.txt"), "abc");
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../examples/modular/run.mjs", import.meta.url)), "hello.txt",
    fileURLToPath(new URL("../examples/modular/context", import.meta.url)), "webcrypto-sha256",
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("importing the exported CLI does not execute it", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const result = spawnSync(process.execPath,
    ["--input-type=module", "-e", 'await import("devrelay/examples/modular/run.mjs")'],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

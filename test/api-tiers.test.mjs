import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createApiTierManifest, diagnoseForbiddenImport, verifyApiTierExports } from "../src/api-tiers.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
test("root exposes exactly the nine supported facade operations", async () => {
  const root = await import("../src/root.mjs");
  assert.deepEqual(Object.keys(root).sort(), ["conclude", "createDevRelay", "createLocalHost", "defineModule", "definePlugin", "inspect", "resume", "run", "verify"]);
});
test("tier manifest binds root, advanced, pack, and one-window compat policy", async () => {
  const manifest = createApiTierManifest({ packageExports: pkg.exports });
  assert.equal(manifest.compatibility.deprecated, true);
  assert.equal(verifyApiTierExports({ manifest, rootExports: Object.keys(await import("../src/root.mjs")), packageExports: pkg.exports }), true);
});
test("advanced and compat subpaths remain explicit", async () => {
  assert.equal(typeof (await import("../src/index.mjs")).executeWorkItem, "function");
  assert.equal(pkg.exports["./packs/*"], "./packs/*");
  assert.equal(typeof (await import("../src/index.mjs")).createDesktopExecutionCoordinator, "function");
  const compat = await import("../src/compat-v1.mjs");
  assert.equal(compat.DEVRELAY_COMPAT_V1.supportedThrough, "0.11.x-prerelease");
  assert.equal(typeof compat.executeWorkItem, "function");
});
test("forbidden internals and undeclared subpaths produce machine diagnostics", () => {
  assert.equal(diagnoseForbiddenImport("devrelay"), null);
  assert.equal(diagnoseForbiddenImport("devrelay/src/core.mjs").code, "DR4752");
  assert.equal(diagnoseForbiddenImport("devrelay/mystery").code, "DR4753");
});
test("manifest rejects missing tiers and root drift", () => {
  assert.throws(() => createApiTierManifest({ packageExports: { ".": "./src/index.mjs" } }), /required root/u);
  const manifest = createApiTierManifest({ packageExports: pkg.exports });
  assert.throws(() => verifyApiTierExports({ manifest, rootExports: ["run"], packageExports: pkg.exports }), /inventory drifted/u);
});

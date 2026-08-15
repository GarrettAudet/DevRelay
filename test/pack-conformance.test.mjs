import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  definePackManifest,
  evaluatePackConformance,
  scanGenericCoreIdentifiers,
} from "../src/pack-conformance.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const godot = JSON.parse(
  readFileSync(new URL("../packs/godot/manifest.json", import.meta.url)),
);
const web = JSON.parse(
  readFileSync(new URL("../packs/fixtures/web-service/manifest.json", import.meta.url)),
);
const grant = (command) => [{ kind: "process.spawn", values: command }];

test("Godot and synthetic web fixtures conform through one provider-neutral contract", () => {
  const godotResult = evaluatePackConformance({
    manifest: godot,
    packageExports: pkg.exports,
    availableDependencies: ["godot-engine"],
    availableProviders: ["godot-ai-mcp", "gdunit4"],
    hostGrants: grant(["gdunit4", "godot"]),
  });
  const webResult = evaluatePackConformance({
    manifest: web,
    packageExports: pkg.exports,
    availableDependencies: ["node"],
    hostGrants: grant(["node"]),
  });
  assert.equal(godotResult.outcome, "conformant");
  assert.equal(webResult.outcome, "conformant");
});

test("manifest identity, permissions, maturity, and rollback are deterministic", () => {
  const first = definePackManifest(godot);
  const second = definePackManifest(structuredClone(godot));
  assert.equal(first.manifestDigest, second.manifestDigest);
  assert.equal(first.rollback.strategy, "disable-and-remove-binding");
});

test("missing dependency, provider, or grant yields unavailable without Core mutation", () => {
  const result = evaluatePackConformance({
    manifest: godot,
    packageExports: pkg.exports,
  });
  assert.equal(result.outcome, "unavailable");
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [
      "PACK_DEPENDENCY_UNAVAILABLE",
      "PACK_PROVIDER_UNAVAILABLE",
      "PACK_PROVIDER_UNAVAILABLE",
      "PACK_GRANT_MISSING",
    ],
  );
});

test("undeclared permissions, bad entrypoints, and missing pack export fail closed", () => {
  assert.throws(
    () =>
      definePackManifest({
        ...godot,
        permissionDemands: [{ kind: "shell.root", values: ["*"] }],
      }),
    /permission/u,
  );
  assert.throws(
    () => definePackManifest({ ...godot, entrypoint: "./src/core.mjs" }),
    /entrypoint/u,
  );
  assert.throws(
    () => evaluatePackConformance({ manifest: web, packageExports: {} }),
    /does not expose/u,
  );
});

test("Generic Core identifier scan rejects domain-specific routing", () => {
  assert.equal(
    scanGenericCoreIdentifiers({
      files: [{ path: "src/core.mjs", content: "route(moduleId)" }],
      forbiddenIdentifiers: ["godot", "gdunit"],
    }).outcome,
    "pass",
  );
  assert.equal(
    scanGenericCoreIdentifiers({
      files: [{ path: "src/core.mjs", content: "if (godot)" }],
      forbiddenIdentifiers: ["godot"],
    }).outcome,
    "failed",
  );
});

test("pack entrypoints expose bindings only through the optional tier", async () => {
  const advanced = await import("../src/index.mjs");
  assert.equal(advanced.createGodotMcpAdapter, undefined);
  const coreScan = scanGenericCoreIdentifiers({
    files: ["src/index.mjs", "src/public-facade.mjs"].map((file) => ({
      path: file,
      content: readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    })),
    forbiddenIdentifiers: ["godot", "gdunit"],
  });
  assert.equal(coreScan.outcome, "pass");
  assert.equal(
    typeof (await import("../packs/godot/index.mjs")).createGodotMcpAdapter,
    "function",
  );
  assert.equal(
    (await import("../packs/fixtures/web-service/index.mjs"))
      .WEB_SERVICE_FIXTURE_PACK.fixtureOnly,
    true,
  );
});

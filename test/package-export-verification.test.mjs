import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { enumeratePackageExports } from "../scripts/release-tools.mjs";

test("package export inventory fails closed when a fixed target is absent", () => {
  assert.throws(
    () =>
      enumeratePackageExports(
        { "./modules/missing.json": "./examples/modules/missing.json" },
        ["package.json"],
        "devrelay",
      ),
    /targets missing tarball file/u,
  );
});

test("package export inventory expands wildcards deterministically", () => {
  assert.deepEqual(
    enumeratePackageExports(
      {
        ".": "./src/index.mjs",
        "./contracts/*": "./contracts/*",
      },
      [
        "src/index.mjs",
        "contracts/z.schema.json",
        "contracts/a.schema.json",
      ],
      "devrelay",
    ),
    [
      {
        specifier: "devrelay",
        target: "src/index.mjs",
        kind: "javascript",
      },
      {
        specifier: "devrelay/contracts/a.schema.json",
        target: "contracts/a.schema.json",
        kind: "json",
      },
      {
        specifier: "devrelay/contracts/z.schema.json",
        target: "contracts/z.schema.json",
        kind: "json",
      },
    ],
  );
});

test("declared ArchitectureDiscovery exports remain part of the package contract", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const paths = [
    "src/root.mjs",
    "examples/modules/architecture-discovery.module.json",
    "examples/plugins/native-architecture-discovery.plugin.json",
  ];
  const exportsMap = {
    ".": packageDocument.exports["."],
    "./modules/architecture-discovery.module.json":
      packageDocument.exports["./modules/architecture-discovery.module.json"],
    "./plugins/native-architecture-discovery.plugin.json":
      packageDocument.exports[
        "./plugins/native-architecture-discovery.plugin.json"
      ],
  };
  assert.deepEqual(
    enumeratePackageExports(exportsMap, paths, packageDocument.name).map(
      ({ specifier }) => specifier,
    ),
    [
      "devrelay",
      "devrelay/modules/architecture-discovery.module.json",
      "devrelay/plugins/native-architecture-discovery.plugin.json",
    ],
  );
});

test("installed export smoke is file-backed for the Windows command-length boundary", async () => {
  const source = await readFile(
    new URL("../scripts/release-tools.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes('const smokePath = join(consumer, "release-smoke.mjs")'));
  assert.ok(source.includes('run(process.execPath, [smokePath]'));
  assert.ok(source.includes('const expectedFacade = ["conclude", "createDevRelay", "createLocalHost", "defineModule", "definePlugin", "inspect", "resume", "run", "verify"];'));
  assert.equal(source.includes('["--input-type=module", "--eval", smokeProgram]'), false);
  assert.ok(source.includes('startsWith("# Roadmap\\\\n")'));
  assert.ok(
    source.includes(
      '["project-overview", "project-overview-projection", "project-memory-baseline", "current-synopsis", "traceability-context", "lifecycle-status", "roadmap", "roadmap-projection"]',
    ),
  );
});

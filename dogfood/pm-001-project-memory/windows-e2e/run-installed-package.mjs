import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const scenario = resolve(root, "dogfood/pm-001-project-memory/windows-e2e/installed-scenario.mjs");
const toolchainLock = JSON.parse(
  readFileSync(resolve(root, "dogfood/pm-001-project-memory/windows-e2e/mem0-toolchain-lock.json"), "utf8"),
);
const mem0Entry = process.env.DEVRELAY_MEM0_ENTRY;
assert.ok(mem0Entry && readFileSync(mem0Entry).length > 0, "DEVRELAY_MEM0_ENTRY must identify the pinned local Mem0 SDK");
const temporaryRoot = mkdtempSync(join(tmpdir(), "devrelay-pm001-installed-"));
const packageRoot = join(temporaryRoot, "package");
const hostRoot = join(temporaryRoot, "host");
mkdirSync(packageRoot, { recursive: true });
mkdirSync(hostRoot, { recursive: true });
const run = (executable, argv, options = {}) => {
  const result = spawnSync(executable, argv, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    windowsHide: true,
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} ${argv.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
};
const runNpm = (argv, options = {}) => run(
  process.env.ComSpec ?? "cmd.exe",
  ["/d", "/s", "/c", "npm.cmd", ...argv],
  options,
);
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
assert.equal(sha256(readFileSync(mem0Entry)), toolchainLock.provider.entrypointDigest, "Mem0 entrypoint drifted from the approved toolchain lock");

try {
  const pack = runNpm(["pack", "--json", "--pack-destination", packageRoot], { cwd: root });
  const packed = JSON.parse(pack.stdout);
  assert.equal(packed.length, 1);
  const tarball = join(packageRoot, packed[0].filename);
  const tarballDigest = sha256(readFileSync(tarball));
  writeFileSync(join(temporaryRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  const install = runNpm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: temporaryRoot });
  writeFileSync(join(hostRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  copyFileSync(scenario, join(hostRoot, basename(scenario)));
  const scenarioRun = run(process.execPath, ["installed-scenario.mjs"], {
    cwd: hostRoot,
    env: {
      ...process.env,
      DEVRELAY_MEM0_ENTRY: mem0Entry,
      MEM0_TELEMETRY: "false",
    },
  });
  const lines = scenarioRun.stdout.trim().split(/\r?\n/u);
  const scenarioReceipt = JSON.parse(lines.at(-1));
  assert.equal(scenarioReceipt.kind, "Pm001InstalledWindowsDesktopE2eReceipt");
  assert.equal(scenarioReceipt.platform, "win32");
  assert.equal(scenarioReceipt.provider.version, toolchainLock.provider.version);
  assert.equal(scenarioReceipt.provider.maturity, "live-conformant");
  assert.equal(scenarioReceipt.provider.executableDigest, toolchainLock.provider.entrypointDigest);
  assert.equal(scenarioReceipt.provider.networkAttempts, 0);
  assert.equal(scenarioReceipt.restart.zeroCallReplay, true);
  assert.equal(scenarioReceipt.conclusion.atomicCommits, 1);
  assert.deepEqual(scenarioReceipt.facade.bootstrapOrder.slice(0, 3), [
    "project-memory:start",
    "project-memory:complete",
    "session-context:complete",
  ]);
  const receipt = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "Pm001InstalledPackageVerificationReceipt",
    package: {
      name: packed[0].name,
      version: packed[0].version,
      filename: packed[0].filename,
      digest: tarballDigest,
      files: packed[0].entryCount,
      unpackedSize: packed[0].unpackedSize,
    },
    install: {
      command: "npm install --offline --ignore-scripts",
      exitCode: 0,
      stdoutDigest: sha256(Buffer.from(install.stdout, "utf8")),
    },
    scenario: scenarioReceipt,
    stderrDigest: sha256(Buffer.from(scenarioRun.stderr, "utf8")),
  };
  receipt.receiptDigest = sha256(Buffer.from(JSON.stringify(receipt), "utf8"));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const installScript = path.join(root, "scripts", "install-chatgpt-desktop-plugin.ps1");
const healthScript = path.join(root, "scripts", "chatgpt-desktop-plugin-health-check.ps1");
const powershell = process.platform === "win32"
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : undefined;
const windowsTest = process.platform === "win32" ? test : test.skip;
const revision = "1".repeat(40);

function makeFixture(label = "fixture") {
  const base = mkdtempSync(path.join(os.tmpdir(), `devrelay ${label} `));
  const repository = path.join(base, "repository with spaces");
  mkdirSync(path.join(repository, "plugins"), { recursive: true });
  cpSync(path.join(root, "plugins", "devrelay"), path.join(repository, "plugins", "devrelay"), { recursive: true });
  mkdirSync(path.join(repository, ".agents", "plugins"), { recursive: true });
  cpSync(path.join(root, ".agents", "plugins", "marketplace.json"), path.join(repository, ".agents", "plugins", "marketplace.json"));
  const target = path.join(base, "ChatGPT Desktop state");
  return {
    base, repository,
    plugin: path.join(target, "plugins", "devrelay"),
    marketplace: path.join(target, "marketplaces", "devrelay"),
    receipt: path.join(target, "receipts", "install.json"),
  };
}

function invoke(f, operation, receipt, extra = [], environment = process.env) {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installScript, "-Operation", operation, "-RepositoryPath", f.repository,
    "-PluginPath", f.plugin, "-MarketplacePath", f.marketplace, "-ReceiptPath", receipt,
    "-RepositoryRevision", revision, "-SkipDependencyCheck", ...extra];
  return spawnSync(powershell, args, { encoding: "utf8", env: environment });
}

function succeed(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

windowsTest("clean install and idempotent reinstall work through paths with spaces", (t) => {
  const f = makeFixture("clean install"); t.after(() => rmSync(f.base, { recursive: true, force: true }));
  const first = succeed(invoke(f, "install", f.receipt));
  assert.equal(first.outputs.state, "installed");
  assert.equal(first.inputs.target.platform, "win32");
  assert.ok(existsSync(path.join(f.plugin, ".codex-plugin", "plugin.json")));
  assert.ok(first.outputs.installedFiles.every(({ path: file }) => path.isAbsolute(file)));
  const before = first.outputs.installedFiles.map(({ path: file, digest }) => [file, digest]);
  const second = succeed(invoke(f, "install", f.receipt));
  assert.deepEqual(second.outputs.installedFiles.map(({ path: file, digest }) => [file, digest]), before);
  const health = execFileSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", healthScript, "-ReceiptPath", f.receipt, "-SkipDependencyCheck"], { encoding: "utf8" });
  assert.equal(JSON.parse(health).state, "healthy");
  writeFileSync(path.join(f.plugin, ".codex-plugin", "plugin.json"), "{}\n");
  const drifted = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", healthScript, "-ReceiptPath", f.receipt, "-SkipDependencyCheck"], { encoding: "utf8" });
  assert.notEqual(drifted.status, 0);
  assert.match(drifted.stderr, /digest mismatch/i);
});

windowsTest("upgrade preserves prior bytes, rollback restores them, and uninstall is clean", (t) => {
  const f = makeFixture("lifecycle"); t.after(() => rmSync(f.base, { recursive: true, force: true }));
  succeed(invoke(f, "install", f.receipt));
  const originalManifest = readFileSync(path.join(f.plugin, ".codex-plugin", "plugin.json"), "utf8");
  const sourceManifest = path.join(f.repository, "plugins", "devrelay", ".codex-plugin", "plugin.json");
  writeFileSync(sourceManifest, readFileSync(sourceManifest, "utf8").replace('"version": "0.9.0"', '"version": "0.9.1"'));
  const upgradeReceipt = path.join(path.dirname(f.receipt), "upgrade.json");
  const upgraded = succeed(invoke(f, "upgrade", upgradeReceipt, ["-PriorReceiptPath", f.receipt]));
  assert.equal(upgraded.outputs.state, "upgraded");
  assert.match(readFileSync(path.join(f.plugin, ".codex-plugin", "plugin.json"), "utf8"), /0\.9\.1/);
  const rollbackReceipt = path.join(path.dirname(f.receipt), "rollback.json");
  const rolledBack = succeed(invoke(f, "rollback", rollbackReceipt, ["-PriorReceiptPath", upgradeReceipt, "-RollbackReceiptPath", upgradeReceipt]));
  assert.equal(rolledBack.outputs.state, "rolled-back");
  assert.equal(rolledBack.outputs.pluginManifestDigest, JSON.parse(readFileSync(f.receipt, "utf8").replace(/^\uFEFF/, "")).outputs.pluginManifestDigest);
  assert.equal(readFileSync(path.join(f.plugin, ".codex-plugin", "plugin.json"), "utf8"), originalManifest);
  const uninstallReceipt = path.join(path.dirname(f.receipt), "uninstall.json");
  const uninstalled = succeed(invoke(f, "uninstall", uninstallReceipt, ["-PriorReceiptPath", rollbackReceipt]));
  assert.equal(uninstalled.outputs.state, "uninstalled");
  assert.equal(existsSync(f.plugin), false);
  assert.equal(existsSync(f.marketplace), false);
});

windowsTest("tampered package and missing dependency fail before mutation", (t) => {
  const f = makeFixture("negative"); t.after(() => rmSync(f.base, { recursive: true, force: true }));
  const tampered = invoke(f, "install", f.receipt, ["-ExpectedRepositoryDigest", `sha256:${"0".repeat(64)}`]);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /digest mismatch/i);
  assert.equal(existsSync(f.plugin), false);
  const missing = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installScript, "-Operation", "install", "-RepositoryPath", f.repository,
    "-PluginPath", f.plugin, "-MarketplacePath", f.marketplace, "-ReceiptPath", f.receipt, "-RepositoryRevision", revision],
  { encoding: "utf8", env: { ...process.env, PATH: path.dirname(process.execPath) } });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Required dependency is unavailable: codex/i);
  assert.equal(existsSync(f.plugin), false);
});

test("installer hashing has no Get-FileHash module dependency", () => {
  for (const script of [installScript, healthScript]) {
    const source = readFileSync(script, "utf8");
    assert.doesNotMatch(source, /\bGet-FileHash\b/u);
    assert.match(source, /\[IO\.File\]::OpenRead\(\$Path\)/u);
    assert.match(
      source,
      /\[Security\.Cryptography\.SHA256\]::Create\(\)/u,
    );
  }
});

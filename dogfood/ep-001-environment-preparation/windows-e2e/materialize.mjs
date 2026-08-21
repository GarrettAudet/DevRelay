import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";

const API = "devrelay.dev/v1alpha1";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const outputRoot = fileURLToPath(new URL("./", import.meta.url));
const scenarioSource = resolve(outputRoot, "installed-scenario.mjs");
const temporaryRoot = mkdtempSync(join(tmpdir(), "devrelay-ep001-installed-"));
const packageRoot = join(temporaryRoot, "package");
const hostRoot = join(temporaryRoot, "host");
mkdirSync(packageRoot, { recursive: true });
mkdirSync(hostRoot, { recursive: true });

const run = (executable, argv, options = {}) => {
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, argv, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    windowsHide: true,
    env: options.env ?? process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} ${argv.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return { ...result, durationMs };
};
const runNpm = (argv, options = {}) => run(
  process.env.ComSpec ?? "cmd.exe",
  ["/d", "/s", "/c", "npm.cmd", ...argv],
  options,
);
const writeBytes = (name, bytes) => {
  const target = resolve(outputRoot, name);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, bytes);
  return {
    artifactId: `EP-E2E-${name.replaceAll(/[^A-Za-z0-9]+/gu, "-").toUpperCase()}`,
    digest: sha256Digest(bytes),
    bytes: bytes.length,
  };
};
const writeJson = (name, value) => writeBytes(name, Buffer.from(`${canonicalJson(value)}\n`, "utf8"));
const commandReceipt = ({ id, executable, arguments: argv, result, stdout, stderr }) => ({
  apiVersion: API,
  kind: "Ep001WindowsCommandReceipt",
  receiptId: id,
  executable,
  arguments: argv,
  workingDirectory: "<ephemeral-clean-consumer>",
  exitCode: result.status,
  durationMilliseconds: Number(result.durationMs.toFixed(3)),
  stdoutDigest: sha256Digest(Buffer.from(stdout, "utf8")),
  stderrDigest: sha256Digest(Buffer.from(stderr, "utf8")),
});

try {
  assert.equal(process.platform, "win32", "EP-001 installed-package materialization requires Windows");
  const packArguments = ["pack", "--json", "--pack-destination", packageRoot];
  const pack = runNpm(packArguments, { cwd: root });
  const packed = JSON.parse(pack.stdout);
  assert.equal(packed.length, 1);
  const packageMetadata = packed[0];
  const tarball = join(packageRoot, packageMetadata.filename);
  const tarballDigest = sha256Digest(readFileSync(tarball));

  writeFileSync(join(temporaryRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  const installArguments = ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball];
  const install = runNpm(installArguments, { cwd: temporaryRoot });
  writeFileSync(join(hostRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  copyFileSync(scenarioSource, join(hostRoot, basename(scenarioSource)));
  const scenario = run(process.execPath, ["installed-scenario.mjs"], { cwd: hostRoot });
  const scenarioLines = scenario.stdout.trim().split(/\r?\n/u);
  const scenarioReceipt = JSON.parse(scenarioLines.at(-1));
  assert.equal(scenarioReceipt.kind, "Ep001InstalledWindowsDesktopE2eReceipt");
  assert.equal(scenarioReceipt.platform, "win32");
  assert.equal(scenarioReceipt.outcome, "pass");

  const raw = {
    packStdout: writeBytes("raw/npm-pack.stdout.txt", Buffer.from(pack.stdout, "utf8")),
    packStderr: writeBytes("raw/npm-pack.stderr.txt", Buffer.from(pack.stderr, "utf8")),
    installStdout: writeBytes("raw/npm-install.stdout.txt", Buffer.from(install.stdout, "utf8")),
    installStderr: writeBytes("raw/npm-install.stderr.txt", Buffer.from(install.stderr, "utf8")),
    scenarioStdout: writeBytes("raw/installed-scenario.stdout.txt", Buffer.from(scenario.stdout, "utf8")),
    scenarioStderr: writeBytes("raw/installed-scenario.stderr.txt", Buffer.from(scenario.stderr, "utf8")),
  };
  const packReceipt = commandReceipt({ id: "CMD-EP-E2E-NPM-PACK", executable: "npm.cmd", arguments: packArguments.map((value) => value === packageRoot ? "<package-output>" : value), result: pack, stdout: pack.stdout, stderr: pack.stderr });
  const installReceipt = commandReceipt({ id: "CMD-EP-E2E-NPM-INSTALL", executable: "npm.cmd", arguments: ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "<devrelay-tarball>"], result: install, stdout: install.stdout, stderr: install.stderr });
  const scenarioCommandReceipt = commandReceipt({ id: "CMD-EP-E2E-SCENARIO", executable: "node", arguments: ["installed-scenario.mjs"], result: scenario, stdout: scenario.stdout, stderr: scenario.stderr });
  const packReceiptRef = writeJson("npm-pack-command-receipt.json", packReceipt);
  const installReceiptRef = writeJson("npm-install-command-receipt.json", installReceipt);
  const scenarioCommandRef = writeJson("scenario-command-receipt.json", scenarioCommandReceipt);
  const scenarioRef = writeJson("installed-scenario-receipt.json", scenarioReceipt);

  const receipt = {
    apiVersion: API,
    kind: "Ep001InstalledPackageVerificationReceipt",
    host: { application: "ChatGPT Desktop", executor: "Codex", operatingSystem: "Windows" },
    package: {
      name: packageMetadata.name,
      version: packageMetadata.version,
      filename: packageMetadata.filename,
      digest: tarballDigest,
      files: packageMetadata.entryCount,
      unpackedSize: packageMetadata.unpackedSize,
    },
    commands: { pack: packReceiptRef, install: installReceiptRef, scenario: scenarioCommandRef },
    rawReceipts: raw,
    scenario: scenarioRef,
    scenarioReceipt,
    outcome: "pass",
  };
  receipt.receiptDigest = canonicalJsonDigest(receipt);
  writeJson("installed-package-verification-receipt.json", receipt);
  const report = [
    "# EP-001 Windows Desktop installed-package E2E",
    "",
    `Outcome: **${receipt.outcome}**`,
    `Package: \`${receipt.package.name}@${receipt.package.version}\``,
    `Tarball: \`${receipt.package.digest}\``,
    "",
    "The clean consumer installed the packed DevRelay library offline, imported `devrelay/advanced`, observed a real Windows and Node host, remediated a controlled project-local gap under exact approval, consumed one single-use readiness receipt, detected induced drift, blocked execution, recovered, reverified, and resumed.",
    "",
    `- Initial gap: ${scenarioReceipt.initialGap.outcome}`,
    `- First execution: ${scenarioReceipt.firstExecution.outcome}`,
    `- Drift route: ${scenarioReceipt.drift.route} (${scenarioReceipt.drift.blockedOutcome})`,
    `- Resumed execution: ${scenarioReceipt.resumedExecution.outcome}`,
    `- Effect replay calls: ${scenarioReceipt.establishment.replayEffectCalls + scenarioReceipt.recovery.replayEffectCalls}`,
    `- Gate replay evaluations: ${scenarioReceipt.recovery.gateReplayEvaluationCalls}`,
    `- Traceability graph revision: ${scenarioReceipt.traceability.graph.revision}`,
    "",
    "Raw stdout/stderr, command fingerprints, environment observations, grants, effect receipts, rollback policy, readiness receipts, graph update, and installed-package metadata are preserved beside this report.",
    "",
    "Exclusions: no public npm publication, hosted backend, deployment, or non-Windows support claim.",
    "",
  ].join("\n");
  const reportRef = writeBytes("WindowsDesktopE2EReport.md", Buffer.from(report, "utf8"));
  const summary = { ...receipt, report: reportRef };
  summary.summaryDigest = canonicalJsonDigest(summary);
  writeJson("windows-e2e-summary.json", summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

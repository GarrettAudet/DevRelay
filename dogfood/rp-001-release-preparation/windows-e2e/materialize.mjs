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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";

const API = "devrelay.dev/v1alpha1";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const outputRoot = fileURLToPath(new URL("./", import.meta.url));
const scenarioSource = resolve(outputRoot, "installed-scenario.mjs");
const temporaryRoot = mkdtempSync(join(tmpdir(), "devrelay-rp001-installed-"));
const sourceRoot = join(temporaryRoot, "source");
const packageRoot = join(temporaryRoot, "package");
const cacheWarmRoot = join(temporaryRoot, "cache-warm-consumer");
const hostRoot = join(temporaryRoot, "host");
const inputRoot = join(hostRoot, "inputs");
const npmCli = process.env.DEVRELAY_NPM_CLI ?? "C:/Users/SC/AppData/Local/Temp/devrelay-npm-cli/node_modules/npm/bin/npm-cli.js";
const npmEnvironment = {
  ...process.env,
  PATH: `${dirname(process.execPath)};${process.env.PATH ?? ""}`,
  npm_config_cache: join(temporaryRoot, "npm-cache"),
  npm_execpath: npmCli,
};
mkdirSync(packageRoot, { recursive: true });
mkdirSync(cacheWarmRoot, { recursive: true });
mkdirSync(inputRoot, { recursive: true });

const run = (executable, argv, options = {}) => {
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, argv, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    windowsHide: true,
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stdoutTail = String(result.stdout ?? "").slice(-24_000);
    const stderrTail = String(result.stderr ?? "").slice(-24_000);
    throw new Error(`${executable} ${argv.join(" ")} failed (${result.status})\n--- stdout tail ---\n${stdoutTail}\n--- stderr tail ---\n${stderrTail}`);
  }
  return { ...result, durationMs };
};
const runNpm = (argv, options = {}) => run(process.execPath, [npmCli, ...argv], {
  ...options,
  env: {
    ...npmEnvironment,
    ...(options.env ?? {}),
  },
});
const writeBytes = (name, bytes) => {
  const target = resolve(outputRoot, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    artifactId: `RP-E2E-${name.replaceAll(/[^A-Za-z0-9]+/gu, "-").toUpperCase()}`,
    digest: sha256Digest(bytes),
    bytes: bytes.length,
  };
};
const writeJson = (name, value) => writeBytes(name, Buffer.from(`${canonicalJson(value)}\n`, "utf8"));
const copyInput = (source, destination = basename(source)) => copyFileSync(resolve(root, source), resolve(inputRoot, destination));
const commandReceipt = ({ id, executable, arguments: argv, result, stdout, stderr, workingDirectory }) => ({
  apiVersion: API,
  kind: "Rp001WindowsCommandReceipt",
  receiptId: id,
  executable,
  arguments: argv,
  workingDirectory,
  exitCode: result.status,
  durationMilliseconds: Number(result.durationMs.toFixed(3)),
  stdoutDigest: sha256Digest(Buffer.from(stdout, "utf8")),
  stderrDigest: sha256Digest(Buffer.from(stderr, "utf8")),
});

try {
  assert.equal(process.platform, "win32", "RP-001 installed-package materialization requires Windows");

  const integration = JSON.parse(readFileSync(resolve(root, "dogfood/rp-001-release-preparation/integration-system-fix-4/integration-summary.json"), "utf8"));
  run("git", ["clone", "--quiet", "--shared", "--no-checkout", root, sourceRoot], { cwd: temporaryRoot });
  const alternatesPath = resolve(sourceRoot, ".git/objects/info/alternates");
  mkdirSync(dirname(alternatesPath), { recursive: true });
  writeFileSync(alternatesPath, `${resolve(root, ".git/objects").replaceAll("\\", "/")}\n`, "utf8");
  run("git", ["checkout", "--quiet", "--detach", integration.finalCommit], { cwd: sourceRoot });
  runNpm(["run", "release:catalog"], { cwd: sourceRoot });
  copyFileSync(resolve(sourceRoot, "release/0.10.0-rc.3.json"), resolve(root, "release/0.10.0-rc.3.json"));
  const catalogCheck = run("git", ["diff", "--exit-code", "--", "release/0.10.0-rc.3.json"], { cwd: sourceRoot });
  assert.equal(catalogCheck.status, 0, "the integrated repair commit must contain its exact generated release catalog");
  const sourceCommit = run("git", ["rev-parse", "HEAD"], { cwd: sourceRoot }).stdout.trim();
  const sourceTree = run("git", ["rev-parse", "HEAD^{tree}"], { cwd: sourceRoot }).stdout.trim();
  runNpm(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: sourceRoot });

  const releaseCheckArguments = ["scripts/release-check.mjs"];
  const releaseCheck = run(process.execPath, releaseCheckArguments, {
    cwd: sourceRoot,
    env: npmEnvironment,
  });
  const releaseCheckEvidence = {
    apiVersion: API,
    kind: "ReleaseCheckEvidence",
    artifactId: "RP-001-RELEASE-CHECK-EVIDENCE",
    command: "node scripts/release-check.mjs",
    platform: process.platform,
    nodeVersion: process.version,
    exitCode: releaseCheck.status,
    durationMilliseconds: Number(releaseCheck.durationMs.toFixed(3)),
    stdoutDigest: sha256Digest(Buffer.from(releaseCheck.stdout, "utf8")),
    stderrDigest: sha256Digest(Buffer.from(releaseCheck.stderr, "utf8")),
    outcome: "pass",
  };

  const packArguments = ["pack", "--json", "--pack-destination", packageRoot];
  const pack = runNpm(packArguments, { cwd: sourceRoot });
  const packed = JSON.parse(pack.stdout);
  assert.equal(packed.length, 1);
  const packageMetadata = packed[0];
  const tarball = join(packageRoot, packageMetadata.filename);
  const tarballDigest = sha256Digest(readFileSync(tarball));
  const npmVersionRun = runNpm(["--version"], { cwd: sourceRoot });
  const npmVersion = npmVersionRun.stdout.trim();
  const repositorySnapshot = {
    apiVersion: API,
    kind: "RepositorySnapshot",
    artifactId: `REPOSITORY-RP-001-${sourceCommit.slice(0, 12).toUpperCase()}`,
    repository: "github.com/GarrettAudet/DevRelay",
    revision: sourceCommit,
    treeDigest: canonicalJsonDigest({ commit: sourceCommit, tree: sourceTree }),
    includedPaths: ["src/**", "test/**", "package.json", "release/**"],
    excludedPaths: [".git/**", "node_modules/**"],
  };
  writeFileSync(resolve(inputRoot, "repository-snapshot.json"), `${canonicalJson(repositorySnapshot)}\n`, "utf8");
  writeFileSync(resolve(inputRoot, "release-check-evidence.json"), `${canonicalJson(releaseCheckEvidence)}\n`, "utf8");
  writeFileSync(resolve(inputRoot, "package-files.json"), `${canonicalJson({ paths: packageMetadata.files.map(({ path }) => path).sort((a, b) => a.localeCompare(b, "en")), npmVersion })}\n`, "utf8");
  for (const file of [
    "project/requirements-baseline.json",
    "project/project-overview-baseline.json",
    "project/architecture-baseline.json",
    "project/contract-disposition.json",
    "project/work-breakdown-baseline.json",
    "project/work-dependency-baseline.json",
    "project/specialist-assignment-baseline.json",
    "project/project-memory-baseline.json",
  ]) copyInput(file);
  copyInput("dogfood/ep-001-environment-preparation/final-acceptance/12-system-verification-result.json", "system-verification-result.json");

  writeFileSync(join(cacheWarmRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  const cacheWarmArguments = ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball];
  const cacheWarm = runNpm(cacheWarmArguments, { cwd: cacheWarmRoot });
  writeFileSync(join(temporaryRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  const installArguments = ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball];
  const install = runNpm(installArguments, { cwd: temporaryRoot });
  writeFileSync(join(hostRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`, "utf8");
  copyFileSync(scenarioSource, join(hostRoot, basename(scenarioSource)));
  const scenario = run(process.execPath, ["installed-scenario.mjs"], {
    cwd: hostRoot,
    env: npmEnvironment,
  });
  const scenarioReceipt = JSON.parse(scenario.stdout.trim().split(/\r?\n/u).at(-1));
  assert.equal(scenarioReceipt.kind, "Rp001InstalledWindowsDesktopE2eReceipt");
  assert.equal(scenarioReceipt.platform, "win32");
  assert.equal(scenarioReceipt.outcome, "pass");
  assert.equal(scenarioReceipt.noPublication.publicRegistryCalls, 0);

  const raw = {
    releaseCheckStdout: writeBytes("raw/release-check.stdout.txt", Buffer.from(releaseCheck.stdout, "utf8")),
    releaseCheckStderr: writeBytes("raw/release-check.stderr.txt", Buffer.from(releaseCheck.stderr, "utf8")),
    packStdout: writeBytes("raw/npm-pack.stdout.txt", Buffer.from(pack.stdout, "utf8")),
    packStderr: writeBytes("raw/npm-pack.stderr.txt", Buffer.from(pack.stderr, "utf8")),
    cacheWarmStdout: writeBytes("raw/npm-cache-warm.stdout.txt", Buffer.from(cacheWarm.stdout, "utf8")),
    cacheWarmStderr: writeBytes("raw/npm-cache-warm.stderr.txt", Buffer.from(cacheWarm.stderr, "utf8")),
    installStdout: writeBytes("raw/npm-install.stdout.txt", Buffer.from(install.stdout, "utf8")),
    installStderr: writeBytes("raw/npm-install.stderr.txt", Buffer.from(install.stderr, "utf8")),
    scenarioStdout: writeBytes("raw/installed-scenario.stdout.txt", Buffer.from(scenario.stdout, "utf8")),
    scenarioStderr: writeBytes("raw/installed-scenario.stderr.txt", Buffer.from(scenario.stderr, "utf8")),
  };
  const releaseCheckReceipt = commandReceipt({ id: "CMD-RP-E2E-RELEASE-CHECK", executable: "node", arguments: releaseCheckArguments, result: releaseCheck, stdout: releaseCheck.stdout, stderr: releaseCheck.stderr, workingDirectory: "<source-checkout>" });
  const packReceipt = commandReceipt({ id: "CMD-RP-E2E-NPM-PACK", executable: "npm.cmd", arguments: packArguments.map((value) => value === packageRoot ? "<package-output>" : value), result: pack, stdout: pack.stdout, stderr: pack.stderr, workingDirectory: "<source-checkout>" });
  const cacheWarmReceipt = commandReceipt({ id: "CMD-RP-E2E-NPM-CACHE-WARM", executable: "npm.cmd", arguments: ["install", "--ignore-scripts", "--no-audit", "--no-fund", "<devrelay-tarball>"], result: cacheWarm, stdout: cacheWarm.stdout, stderr: cacheWarm.stderr, workingDirectory: "<ephemeral-cache-warm-consumer>" });
  const installReceipt = commandReceipt({ id: "CMD-RP-E2E-NPM-INSTALL", executable: "npm.cmd", arguments: ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "<devrelay-tarball>"], result: install, stdout: install.stdout, stderr: install.stderr, workingDirectory: "<ephemeral-clean-consumer>" });
  const scenarioCommandReceipt = commandReceipt({ id: "CMD-RP-E2E-SCENARIO", executable: "node", arguments: ["installed-scenario.mjs"], result: scenario, stdout: scenario.stdout, stderr: scenario.stderr, workingDirectory: "<ephemeral-clean-consumer>" });
  const releaseCheckReceiptRef = writeJson("release-check-command-receipt.json", releaseCheckReceipt);
  const packReceiptRef = writeJson("npm-pack-command-receipt.json", packReceipt);
  const cacheWarmReceiptRef = writeJson("npm-cache-warm-command-receipt.json", cacheWarmReceipt);
  const installReceiptRef = writeJson("npm-install-command-receipt.json", installReceipt);
  const scenarioCommandRef = writeJson("scenario-command-receipt.json", scenarioCommandReceipt);
  const scenarioRef = writeJson("installed-scenario-receipt.json", scenarioReceipt);

  const receipt = {
    apiVersion: API,
    kind: "Rp001InstalledPackageVerificationReceipt",
    host: { application: "ChatGPT Desktop", executor: "Codex", operatingSystem: "Windows" },
    source: { commit: sourceCommit, tree: sourceTree },
    package: {
      name: packageMetadata.name,
      version: packageMetadata.version,
      filename: packageMetadata.filename,
      digest: tarballDigest,
      files: packageMetadata.entryCount,
      unpackedSize: packageMetadata.unpackedSize,
    },
    commands: { releaseCheck: releaseCheckReceiptRef, pack: packReceiptRef, cacheWarm: cacheWarmReceiptRef, install: installReceiptRef, scenario: scenarioCommandRef },
    rawReceipts: raw,
    scenario: scenarioRef,
    scenarioReceipt,
    noPublication: scenarioReceipt.noPublication,
    outcome: "pass",
  };
  receipt.receiptDigest = canonicalJsonDigest(receipt);
  writeJson("installed-package-verification-receipt.json", receipt);
  const report = [
    "# RP-001 Windows Desktop installed-package E2E",
    "",
    `Outcome: **${receipt.outcome}**`,
    `Package: \`${receipt.package.name}@${receipt.package.version}\``,
    `Tarball: \`${receipt.package.digest}\``,
    `Source commit: \`${sourceCommit}\``,
    "",
    "A clean ephemeral Windows consumer installed the packed DevRelay library offline, imported `devrelay/advanced`, loaded the exact current baselines and project memory, proved environment readiness, routed from a verified SystemVerification result, materialized the seven-artifact candidate, verified every release obligation from stored bytes, reached ReleaseVerificationGate readiness, replayed with zero additional effects, rejected induced drift and substitution, recovered to the original identity, and queried candidate coverage and readiness provenance.",
    "",
    `- Release obligations: ${scenarioReceipt.verification.obligations.length}`,
    `- Materialization replay effect calls: ${scenarioReceipt.materialization.replayEffectCalls}`,
    `- Recovery replay effect calls: ${scenarioReceipt.recovery.replayEffectCalls}`,
    `- Traceability graph revision: ${scenarioReceipt.traceability.readinessMerge.revisionAfter}`,
    `- Publication authorized: ${scenarioReceipt.noPublication.publicationAuthorized}`,
    "- Dependency acquisition: disposable cache warm before the separately clean offline consumer install",
    "",
    "Raw command output, exact command receipts, grants, candidate artifacts, checkpoints, policy results, Gate summary, traceability receipts, and installed-consumer proof are preserved beside this report.",
    "",
    "Exclusions: no public npm publication, hosted release creation, tag creation or push, deployment, protected-main mutation, one-click Desktop installation, or non-Windows support claim.",
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

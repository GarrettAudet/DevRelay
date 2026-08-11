import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(root, "release", "chatgpt-desktop", "release-gate-evidence.attempt-003.json");
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const focusedSuites = [
  "test/chatgpt-desktop-runtime-contracts.test.mjs",
  "test/chatgpt-desktop-capability-resolver.test.mjs",
  "test/chatgpt-desktop-install.test.mjs",
  "test/chatgpt-desktop-lifecycle-controller.test.mjs",
  "test/chatgpt-desktop-mcp-server.test.mjs",
  "test/chatgpt-desktop-app-server-client.test.mjs",
  "test/chatgpt-desktop-plugin.test.mjs",
  "test/chatgpt-desktop-run-store.test.mjs",
  "test/chatgpt-desktop-task-supervisor.test.mjs",
];

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function run(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    command: [command, ...args].join(" "), startedAt, finishedAt: new Date().toISOString(),
    exitCode: result.status ?? 1, signal: result.signal ?? null, spawnError: result.error?.message ?? null,
    stdoutDigest: digest(stdout), stderrDigest: digest(stderr),
    stdoutTail: stdout.slice(-4000), stderrTail: stderr.slice(-4000),
  };
}

function fail(message, checks) {
  const error = new Error(message);
  error.checks = checks;
  throw error;
}

export function releaseGatePlan() {
  return Object.freeze({ focusedSuites: [...focusedSuites], evidencePath });
}

export function runReleaseGate() {
  const checks = [];
  const failures = [];
  const temp = mkdtempSync(path.join(os.tmpdir(), "devrelay desktop release gate "));
  const npmEnvironment = {
    ...process.env,
    npm_config_cache: path.join(temp, "npm-cache"),
    npm_config_registry: "https://registry.npmjs.org/",
  };
  let outcome = "pass";
  let failure = null;
  try {
    if (process.platform !== "win32") fail("The Desktop release gate requires a Windows host.", checks);
    if (!existsSync(npmCli)) fail(`npm CLI is unavailable at ${npmCli}.`, checks);
    const packageBytes = readFileSync(path.join(root, "package.json"));
    const lockfileBytes = readFileSync(path.join(root, "package-lock.json"));
    checks.push(run(process.execPath, [npmCli, "ci", "--registry=https://registry.npmjs.org/", "--ignore-scripts", "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=10000"], { env: npmEnvironment }));
    if (checks.at(-1).exitCode !== 0) failures.push("Exact lockfile workspace provisioning failed.");
    if (digest(readFileSync(path.join(root, "package.json"))) !== digest(packageBytes) || digest(readFileSync(path.join(root, "package-lock.json"))) !== digest(lockfileBytes)) {
      failures.push("Workspace provisioning modified package.json or package-lock.json.");
    }
    checks.push(run(process.execPath, ["--test", ...focusedSuites]));
    if (checks.at(-1).exitCode !== 0) failures.push("Focused Desktop repository suites failed.");

    checks.push(run(process.execPath, [npmCli, "pack", "--json", "--pack-destination", temp], { env: npmEnvironment }));
    if (checks.at(-1).exitCode !== 0) {
      failures.push("npm pack failed.");
    } else {
      const packedFiles = readdirSync(temp).filter((entry) => entry.endsWith(".tgz"));
      const tarball = packedFiles.length === 1 ? path.join(temp, packedFiles[0]) : "";
      if (!existsSync(tarball)) {
        failures.push("npm pack did not produce its declared tarball.");
      } else {
        const consumer = path.join(temp, "consumer with spaces");
        mkdirSync(consumer, { recursive: true });
        writeFileSync(path.join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
        checks.push(run(process.execPath, [npmCli, "install", "--registry=https://registry.npmjs.org/", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "--fetch-retries=0", "--fetch-timeout=10000", tarball], { cwd: consumer, env: npmEnvironment }));
        if (checks.at(-1).exitCode !== 0) {
          failures.push("Installing the packed package failed.");
        } else {
          const probe = "import('devrelay').then(m=>{if(typeof m!=='object')throw Error('bad root export');return import('devrelay/desktop-runtime-contracts')}).then(m=>{if(!Object.keys(m).some(k=>k.startsWith('validate')))throw Error('missing Desktop validator export')})";
          checks.push(run(process.execPath, ["-e", probe], { cwd: consumer }));
          if (checks.at(-1).exitCode !== 0) failures.push("Installed-package public exports failed.");
        }
      }
    }

    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const requiredExports = [".", "./desktop-runtime-contracts", "./package.json"];
    if (!requiredExports.every((key) => Object.hasOwn(packageJson.exports, key))) failures.push("Required package exports are absent.");
    if (failures.length) fail(failures.join(" "), checks);
  } catch (error) {
    outcome = "block";
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  const evidence = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ChatGptDesktopReleaseGateEvidence",
    evidenceKind: "chatgpt-desktop/release-gate",
    workItemId: "WI-DESKTOP-VERIFICATION",
    executionId: "ATT-DESKTOP-VERIFICATION-003",
    host: { platform: process.platform, arch: process.arch, node: process.version },
    outcome, failure,
    coverage: {
      workspaceProvisioning: ["npm ci --ignore-scripts", "committed package and lockfile byte-stability"],
      repositoryAndContracts: focusedSuites.slice(0, 2),
      packageAndInstalledPackage: ["npm pack", "npm install packed tarball", "public export probe"],
      installationAndWindowsPaths: [focusedSuites[2]],
      appServerAndMcpProtocols: [focusedSuites[4], focusedSuites[5]],
      restartDriftIsolationAndPermissionNegative: [focusedSuites[2], focusedSuites[3], focusedSuites[6], focusedSuites[7], focusedSuites[8]],
    },
    checks,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outcome, evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"), evidenceDigest: digest(readFileSync(evidencePath)), checks: checks.map(({ command, exitCode }) => ({ command, exitCode })), failure })}\n`);
  return outcome === "pass" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = runReleaseGate();

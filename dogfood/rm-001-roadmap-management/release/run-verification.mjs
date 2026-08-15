import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";

const OUTPUT = new URL("./", import.meta.url);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const parentCommit = execFileSync("git", ["rev-parse", "HEAD^"], { encoding: "utf8" }).trim();
const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (status !== "") throw new Error("RM verification must begin from the clean implementation commit");
const tree = execFileSync("git", ["ls-tree", "-r", "--full-tree", "HEAD"]);
const treeDigest = sha256Digest(tree);

function write(relativePath, bytes) {
  const url = new URL(relativePath, OUTPUT);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, bytes);
}

function execute(command, args, receiptId) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: new URL("../../../", import.meta.url),
    encoding: "buffer",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
    shell: command.endsWith(".cmd"),
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const commandMaterial = { command, args };
  const outputText = stdout.toString("utf8");
  const tests = /ℹ tests (\d+)/u.exec(outputText);
  const passed = /ℹ pass (\d+)/u.exec(outputText);
  const failed = /ℹ fail (\d+)/u.exec(outputText);
  const skipped = /ℹ skipped (\d+)/u.exec(outputText);
  const receiptMaterial = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RawCommandReceipt",
    receiptId,
    implementationCommit: commit,
    implementationParentCommit: parentCommit,
    implementationTreeDigest: treeDigest,
    command: commandMaterial,
    commandFingerprint: canonicalJsonDigest(commandMaterial),
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    durationMs,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    stdoutDigest: sha256Digest(stdout),
    stdoutBytes: stdout.length,
    stderrDigest: sha256Digest(stderr),
    stderrBytes: stderr.length,
    ...(tests ? { testSummary: { tests: Number(tests[1]), passed: Number(passed?.[1] ?? 0), failed: Number(failed?.[1] ?? 0), skipped: Number(skipped?.[1] ?? 0) } } : {}),
  };
  const receipt = { ...receiptMaterial, receiptDigest: canonicalJsonDigest(receiptMaterial) };
  write(`${receiptId}.stdout.txt`, stdout);
  write(`${receiptId}.stderr.txt`, stderr);
  write(`${receiptId}.json`, Buffer.from(canonicalJson(receipt), "utf8"));
  if (receipt.exitCode !== 0) throw new Error(`${receiptId} failed with exit ${receipt.exitCode}`);
  return receipt;
}

const canonical = execute("npm.cmd", ["run", "verify"], "canonical-verification-receipt");
const performance = execute(process.execPath, ["--test", "test/roadmap-management-performance.test.mjs"], "roadmap-performance-receipt");
const summaryMaterial = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RMVerificationSummary",
  implementationCommit: commit,
  implementationParentCommit: parentCommit,
  implementationTreeDigest: treeDigest,
  canonicalVerification: {
    artifactId: canonical.receiptId,
    digest: canonical.receiptDigest,
    outcome: "pass",
  },
  performanceVerification: {
    artifactId: performance.receiptId,
    digest: performance.receiptDigest,
    outcome: "pass",
  },
};
const summary = { ...summaryMaterial, contentDigest: canonicalJsonDigest(summaryMaterial) };
write("verification-summary.json", Buffer.from(canonicalJson(summary), "utf8"));
console.log(JSON.stringify({ implementationCommit: commit, canonical: canonical.testSummary, performance: performance.testSummary, summaryDigest: summary.contentDigest }, null, 2));
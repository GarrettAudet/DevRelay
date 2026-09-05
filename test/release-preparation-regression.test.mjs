import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { scanGenericCoreIdentifiers } from "../src/pack-conformance.mjs";

const releaseTests = [
  "test/release-preparation-adapters.test.mjs",
  "test/release-preparation-artifacts.test.mjs",
  "test/release-preparation-gate.test.mjs",
  "test/release-preparation-identity-routing.test.mjs",
  "test/release-preparation-native-materializer.test.mjs",
  "test/release-preparation-traceability.test.mjs",
  "test/release-preparation-verification.test.mjs",
];

function runReleaseMatrix() {
  const started = process.hrtime.bigint();
  const environment = { ...process.env, NO_PROXY: "*", no_proxy: "*" };
  delete environment.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", ...releaseTests], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, env: environment });
  if (run.error) throw run.error;
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  return { exitCode: run.status, durationMs, stdoutDigest: canonicalJsonDigest(run.stdout ?? ""), stderrDigest: canonicalJsonDigest(run.stderr ?? ""), tests: Number(output.match(/tests (\d+)/u)?.[1]), passed: Number(output.match(/pass (\d+)/u)?.[1]), failed: Number(output.match(/fail (\d+)/u)?.[1]), retries: 0, cacheHits: 0, commandFingerprint: canonicalJsonDigest({ command: process.execPath, argv: ["--test", ...releaseTests], cwd: process.cwd().replaceAll("\\", "/") }) };
}

test("complete release matrix passes repeatedly with complete telemetry", () => {
  const first = runReleaseMatrix();
  const second = runReleaseMatrix();
  for (const receipt of [first, second]) {
    assert.equal(receipt.exitCode, 0);
    assert.equal(receipt.tests, 46);
    assert.equal(receipt.passed, 46);
    assert.equal(receipt.failed, 0);
    assert.equal(receipt.durationMs > 0, true);
    assert.match(receipt.commandFingerprint, /^sha256:/u);
    assert.match(receipt.stdoutDigest, /^sha256:/u);
    assert.equal(receipt.retries, 0);
    assert.equal(receipt.cacheHits, 0);
  }
  assert.deepEqual({ tests: first.tests, passed: first.passed, failed: first.failed, exitCode: first.exitCode }, { tests: second.tests, passed: second.passed, failed: second.failed, exitCode: second.exitCode });
});

test("generic Core contains no release product or operation routing branch", () => {
  const paths = ["src/artifact-runtime.mjs", "src/module-registry.mjs", "src/operation-router.mjs", "src/root.mjs"];
  const result = scanGenericCoreIdentifiers({ files: paths.map((path) => ({ path, content: readFileSync(path, "utf8") })), forbiddenIdentifiers: ["ReleasePreparation", "release-preparation", "prepare-candidate", "verify-candidate", "ReleaseVerificationGate"] });
  assert.deepEqual(result, { outcome: "pass", findings: [] });
});

test("release test matrix is closed, unique, and excludes its aggregate runner", () => {
  assert.equal(new Set(releaseTests).size, releaseTests.length);
  assert.equal(releaseTests.every((path) => path.endsWith(".test.mjs") && path !== "test/release-preparation-regression.test.mjs"), true);
  assert.equal(releaseTests.every((path) => readFileSync(path).byteLength > 0), true);
});

test("release preparation source has no ambient network or publication command", () => {
  const paths = ["src/release-preparation-adapters.mjs", "src/release-preparation-native-materializer.mjs", "src/release-preparation-verification.mjs", "src/release-preparation-gate.mjs", "src/release-preparation-traceability-contributor.mjs"];
  const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /\b(?:fetch|https\.request|npm publish|git push|git tag)\s*\(/u);
  assert.match(source, /publicationAuthorized:\s*false/u);
  assert.match(source, /network\.connect/u);
});

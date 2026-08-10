import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), "utf8"));

test("DG-1 exact planning continuation checkpoints all three new executors and replays with zero calls", async () => {
  const loaderArgs = process.execArgv.filter((arg, index, all) => arg === "--experimental-loader" || all[index - 1] === "--experimental-loader");
  const output = JSON.parse(execFileSync(process.execPath, [...loaderArgs, "dogfood/bootstrap-architecture-host-executor-adapters/materialize-dg1.mjs"], { cwd: root, encoding: "utf8" }));
  assert.deepEqual(output.calls, { "openspec-design": 1, structurizr: 1, madr: 1 });
  assert.equal(output.checkpoints, 3);
  assert.equal(output.replayAdditionalCalls, 0);

  const proof = await readJson("dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/runtime-execution-proof.json");
  assert.equal(proof.sourceHandoffDigest, "sha256:45637fb614b5fd8c6e175bedeca69802bb2aad2f87ea94e3bf7469296814f516");
  assert.equal(proof.identicalReplayBytes, true);
  assert.equal(proof.terminalArtifactRawDigest, output.terminalDigest);
  assert.deepEqual(proof.authority, { gateMutation: false, traceabilityMutation: false, baselineMutation: false, completionMutation: false });
});

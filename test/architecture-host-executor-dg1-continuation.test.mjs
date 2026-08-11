import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const sourceRoot = process.env.DEVRELAY_DG1_ARCHITECTURE_SOURCE_ROOT;
const readJson = async (relative) =>
  JSON.parse(await readFile(new URL(relative, root), "utf8"));

test("committed DG-1 architecture execution proof remains exact and independently bound", async () => {
  const proof = await readJson(
    "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/runtime-execution-proof.json",
  );
  assert.equal(
    proof.sourceHandoffDigest,
    "sha256:45637fb614b5fd8c6e175bedeca69802bb2aad2f87ea94e3bf7469296814f516",
  );
  assert.deepEqual(proof.firstExecutionCalls, {
    "openspec-design": 1,
    structurizr: 1,
    madr: 1,
  });
  assert.equal(proof.checkpointCount, 3);
  assert.deepEqual(proof.replayAdditionalCalls, {
    "openspec-design": 0,
    structurizr: 0,
    madr: 0,
  });
  assert.equal(proof.identicalReplayBytes, true);
  assert.deepEqual(proof.authority, {
    gateMutation: false,
    traceabilityMutation: false,
    baselineMutation: false,
    completionMutation: false,
  });

  const candidateBytes = await readFile(
    new URL(
      "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/architecture-change-set-draft.json",
      root,
    ),
  );
  const resultBytes = await readFile(
    new URL(
      "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/architecture-design.result.json",
      root,
    ),
  );
  assert.equal(sha256Digest(candidateBytes), proof.terminalArtifactRawDigest);
  assert.equal(sha256Digest(resultBytes), proof.terminalResultDigest);

  const handoffBytes = await readFile(
    new URL(
      "dogfood/bootstrap-architecture-host-executor-adapters/verification/dg1-architecture-host-executor-reverification-handoff.json",
      root,
    ),
  );
  assert.equal(
    sha256Digest(handoffBytes),
    "sha256:b612ab3f805a36e1e2e432c43f262f862d0b2b70807dc5c6cdcc9309b87682bc",
  );
  const handoff = JSON.parse(handoffBytes);
  assert.equal(handoff.outcome, "PASS");
  assert.equal(handoff.closed, true);
  assert.equal(handoff.executionProof.checkpointCount, 3);
  assert.equal(handoff.executionProof.identicalReplayBytes, true);
});

test("mounted DG-1 historical source reruns all three executors and replays with zero calls", async (t) => {
  if (!sourceRoot)
    return t.skip(
      "DEVRELAY_DG1_ARCHITECTURE_SOURCE_ROOT is not configured",
    );
  try {
    await readFile(
      path.join(
        sourceRoot,
        "dogfood/prefix-integrity-repair-dg1-2026-08-10/evidence-manifest.json",
      ),
    );
  } catch {
    return t.skip("the immutable DG-1 historical source root is not mounted");
  }

  const loaderArgs = process.execArgv.filter(
    (arg, index, all) =>
      arg === "--experimental-loader" ||
      all[index - 1] === "--experimental-loader",
  );
  const output = JSON.parse(
    spawnSync(
      process.execPath,
      [
        ...loaderArgs,
        "dogfood/bootstrap-architecture-host-executor-adapters/materialize-dg1.mjs",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          DEVRELAY_DG1_ARCHITECTURE_SOURCE_ROOT: sourceRoot,
        },
      },
    ).stdout,
  );
  assert.deepEqual(output.calls, {
    "openspec-design": 1,
    structurizr: 1,
    madr: 1,
  });
  assert.equal(output.checkpoints, 3);
  assert.equal(output.replayAdditionalCalls, 0);
});

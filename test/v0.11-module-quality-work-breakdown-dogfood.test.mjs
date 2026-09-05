import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";
import { validateTraceabilityGraphSnapshot, validateTraceabilityUpdate } from "../src/traceability-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "../src/work-breakdown-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const output = new URL(
  "../dogfood/v0.11-module-quality/work-breakdown/",
  import.meta.url,
);
const readBytes = (name) => readFileSync(new URL(name, output));
const readJson = (name) => JSON.parse(readBytes(name));

test("V0.11 WorkBreakdown deterministically proposes complete bounded work without downstream authority", { timeout: 300_000 }, () => {
  const run = spawnSync(
    process.execPath,
    ["dogfood/v0.11-module-quality/work-breakdown/materialize.mjs"],
    { cwd: rootPath, encoding: "utf8", timeout: 240_000 },
  );
  assert.equal(run.status, 0, run.stderr);

  const candidateBytes = readBytes("work-breakdown-change-set-draft.json");
  const gateReviewBytes = readBytes("work-breakdown-gate.md");
  const gateCandidateBytes = readBytes("work-breakdown-gate-candidate.json");
  const checkpointBytes = readBytes("checkpoint-replay-receipt.json");
  const candidate = JSON.parse(candidateBytes);
  const gateCandidate = JSON.parse(gateCandidateBytes);
  const proof = readJson("work-breakdown-dogfood-proof.json");
  const executionRecord = readJson("module-execution-record.json");
  const update = readJson("traceability-update.json");
  const graph = readJson("traceability-graph-snapshot.json");

  validateWorkBreakdownArtifact(candidate);
  validateModuleExecutionRecord(executionRecord);
  validateTraceabilityUpdate(update);
  validateTraceabilityGraphSnapshot(graph);

  assert.equal(
    sha256Digest(candidateBytes),
    "sha256:1e450c2018b3b45fd2e7138f1ffb13c05ae37ddec4cbb86de0a73f736467ae3b",
  );
  assert.equal(
    sha256Digest(gateReviewBytes),
    "sha256:a36d36230cc60e85f1c4cbb2153214da40005bf7c37a52841fe7729d5c8aff97",
  );
  assert.equal(
    sha256Digest(gateCandidateBytes),
    "sha256:352af3c794c94e857d315169f5b94307a69a7f2e7f259cce6f5dcfe132cc151a",
  );
  assert.equal(
    sha256Digest(checkpointBytes),
    "sha256:27879d4619a5c805601ef868273f54801bb7ebfab39e1ced1eadca9928defa65",
  );
  assert.equal(candidate.operation, "decompose-change");
  assert.equal(candidate.changes.filter(({ operation }) => operation === "retire").length, 8);
  assert.equal(candidate.changes.filter(({ operation }) => operation === "add").length, 16);
  assert.equal(candidate.coverageDispositions.length, 261);
  assert.equal(
    candidate.coverageDispositions.filter(({ disposition }) => disposition === "already-satisfied").length,
    222,
  );
  assert.equal(
    candidate.coverageDispositions.filter(({ disposition }) => disposition === "planned").length,
    39,
  );
  assert.ok(
    candidate.changes
      .filter(({ operation }) => operation === "add")
      .every(({ workItem }) =>
        workItem["dependency-hints"].every(({ authority }) => authority === "hint"),
      ),
  );
  assert.equal(executionRecord.mergeReceipt.snapshot.revision, 10);
  assert.equal(executionRecord.moduleResult.outcome, "decomposed");
  assert.equal(gateCandidate.progressionAllowed, false);
  assert.equal(gateCandidate.nextGate, "work-breakdown-gate");
  assert.equal(gateCandidate.workBreakdownChangeSet.digest, sha256Digest(candidateBytes));
  assert.equal(gateCandidate.checkpointReplayReceipt.digest, sha256Digest(checkpointBytes));
  assert.equal(proof.assertions.newWorkItems, 16);
  assert.equal(proof.assertions.retiredPriorWorkItems, 8);
  assert.equal(proof.assertions.alreadySatisfiedCoverage, 222);
  assert.equal(proof.assertions.plannedAcceptanceCoverage, 16);
  assert.equal(proof.assertions.plannedArchitectureCoverage, 15);
  assert.equal(proof.assertions.plannedContractCoverage, 8);
  assert.equal(proof.assertions.normalReplayAdapterCalls, 0);
  assert.equal(proof.assertions.checkpointVerificationAdapterCalls, 0);
  assert.equal(proof.status, "pass-awaiting-gate-approval");
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { validateContractGenerationArtifact } from "../src/contract-generation-artifact-validator.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const output = new URL(
  "../dogfood/work-item-verification/contract-generation/",
  import.meta.url,
);
const readBytes = (name) => readFileSync(new URL(name, output));
const readJson = (name) => JSON.parse(readBytes(name));
const replayOutput = new URL("replay-v7/", output);
const readReplayBytes = (name) => readFileSync(new URL(name, replayOutput));
const readReplayJson = (name) => JSON.parse(readReplayBytes(name));
const contextOutput = new URL("../work-breakdown/context/", output);
const readContextBytes = (name) => readFileSync(new URL(name, contextOutput));
const run = (relativePath) => {
  const result = spawnSync(process.execPath, [relativePath], {
    cwd: rootPath,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test("WIV ContractGeneration restart reproduces the exact approved 25+9 candidate", () => {
  const first = run(
    "dogfood/work-item-verification/contract-generation/materialize.mjs",
  );
  const candidateBytes = readBytes("contract-change-set-draft.json");
  const checkpointBytes = readBytes("execution-checkpoint.json");
  const second = run(
    "dogfood/work-item-verification/contract-generation/materialize.mjs",
  );

  assert.equal(first, second);
  assert.equal(
    sha256Digest(candidateBytes),
    "sha256:f816fde59c1125a63b64c1b62ffca65b791a1baed13376a2a51947a9ba60dd5a",
  );
  assert.deepEqual(readBytes("contract-change-set-draft.json"), candidateBytes);
  assert.deepEqual(readBytes("execution-checkpoint.json"), checkpointBytes);

  const candidate = readJson("contract-change-set-draft.json");
  const validation = readJson("contract-format-validation-set.json");
  const diff = readJson("contract-canonical-diff.json");
  validateContractGenerationArtifact(candidate);
  validateContractGenerationArtifact(validation);
  validateContractGenerationArtifact(diff);
  assert.equal(candidate.contracts.length, 34);
  assert.equal(validation.status, "pass");
  assert.equal(validation.results.length, 34);
  assert.equal(diff.status, "compatible");
  assert.equal(
    diff.changes.filter(({ changeType }) => changeType === "unchanged").length,
    25,
  );
  assert.equal(
    diff.changes.filter(({ changeType }) => changeType === "add").length,
    9,
  );
  assert.equal(
    readdirSync(new URL("native/", output)).filter((name) => name.endsWith(".json"))
      .length,
    34,
  );
  validateModuleExecutionRecord(readJson("module-execution-record.json"));
});

test("WIV ContractGate promotion is idempotent and keeps the nine-contract delta", () => {
  const first = run(
    "dogfood/work-item-verification/contract-generation/promote.mjs",
  );
  const baselineBytes = readReplayBytes("contract-baseline.json");
  const promotionBytes = readReplayBytes("contract-gate-promotion.json");
  const second = run(
    "dogfood/work-item-verification/contract-generation/promote.mjs",
  );

  assert.equal(first, second);
  assert.deepEqual(readReplayBytes("contract-baseline.json"), baselineBytes);
  assert.deepEqual(readReplayBytes("contract-gate-promotion.json"), promotionBytes);
  assert.deepEqual(readContextBytes("contract-baseline.json"), baselineBytes);
  assert.deepEqual(readContextBytes("contract-disposition.json"), readReplayBytes("contract-disposition.json"));
  assert.deepEqual(readContextBytes("contract-gate-promotion.json"), promotionBytes);
  assert.equal(
    sha256Digest(baselineBytes),
    "sha256:a7c00e3f80160cdbc5b9f6c58c4c4edbd94a1b825073f845475a160e0f8c9f7a",
  );
  const baseline = readReplayJson("contract-baseline.json");
  validateContractGenerationArtifact(baseline);
  assert.equal(baseline.version, "1.3.0");
  assert.equal(baseline.contracts.length, 34);
  assert.equal(baseline.contractsDigest, canonicalJsonDigest(baseline.contracts));
  assert.equal(
    baseline.approvedCandidate.digest,
    "sha256:f816fde59c1125a63b64c1b62ffca65b791a1baed13376a2a51947a9ba60dd5a",
  );
  assert.equal(
    baseline.contracts.filter(({ interfaceIntentId }) =>
      interfaceIntentId.startsWith("IF-WIV-"),
    ).length,
    9,
  );
  const promotion = readReplayJson("contract-gate-promotion.json");
  assert.equal(promotion.progressionAllowed, true);
  assert.equal(promotion.nextModule, "work-breakdown");
});

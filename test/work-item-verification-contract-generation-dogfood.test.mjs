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
const replayOutput = new URL("replay-v6/", output);
const readReplayBytes = (name) => readFileSync(new URL(name, replayOutput));
const readReplayJson = (name) => JSON.parse(readReplayBytes(name));
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
    "sha256:861c9a3b24a9d0d03e6aa68d7afc7e25bc8724a47f76109b3b2fc30952152014",
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
  assert.equal(
    sha256Digest(baselineBytes),
    "sha256:621c1a83696cbbb6c2a9f8a623946dbbba0db2301e53db344c9c80537c777499",
  );
  const baseline = readReplayJson("contract-baseline.json");
  validateContractGenerationArtifact(baseline);
  assert.equal(baseline.version, "1.3.0");
  assert.equal(baseline.contracts.length, 34);
  assert.equal(baseline.contractsDigest, canonicalJsonDigest(baseline.contracts));
  assert.equal(
    baseline.approvedCandidate.digest,
    "sha256:861c9a3b24a9d0d03e6aa68d7afc7e25bc8724a47f76109b3b2fc30952152014",
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

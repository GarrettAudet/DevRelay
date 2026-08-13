import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Digest } from "../../../src/content-digest.mjs";
import { validateContractGenerationArtifact } from "../../../src/contract-generation-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "../../../src/work-breakdown-artifact-validator.mjs";

const root = new URL("../../../", import.meta.url);
const source = new URL("dogfood/v0.10-release-hardening/contract-generation/replay-v1/", root);
const expected = Object.freeze({
  baseline: "sha256:cb01502d2a23345ad3bc86ea87445692f04311ab014401367522ab1ebc465835",
  disposition: "sha256:2929935e75f526d949e105524845d67110cbf7774cd9e9b1ef087e42ada83370",
  promotion: "sha256:e7d5cf82484b3d6b72e42bbd5b150911448bfe09495b799ab1822518a47881a4",
});

async function load(name, digest, validate) {
  const bytes = await readFile(new URL(name, source));
  assert.equal(sha256Digest(bytes), digest);
  const value = JSON.parse(bytes);
  validate(value);
  return { bytes, value };
}

async function preserveAndReplace(name, loaded) {
  const current = new URL(`project/${name}`, root);
  const history = new URL(`project/history/contracts/CB-DEVRELAY-007/${name}`, root);
  try {
    const currentBytes = await readFile(current);
    if (!currentBytes.equals(loaded.bytes)) {
      await mkdir(path.dirname(fileURLToPath(history)), { recursive: true });
      try {
        assert.deepEqual(await readFile(history), currentBytes);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        await writeFile(history, currentBytes, { flag: "wx" });
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeFile(current, loaded.bytes);
}

const baseline = await load("contract-baseline.json", expected.baseline, validateContractGenerationArtifact);
const disposition = await load("contract-disposition.json", expected.disposition, validateWorkBreakdownArtifact);
const promotion = await load("contract-gate-promotion.json", expected.promotion, (value) => {
  assert.equal(value.kind, "ContractGatePromotionProof");
  assert.equal(value.contractBaseline.digest, expected.baseline);
  assert.equal(value.contractDisposition.digest, expected.disposition);
  assert.equal(value.progressionAllowed, true);
});
await preserveAndReplace("contract-baseline.json", baseline);
await preserveAndReplace("contract-disposition.json", disposition);
await preserveAndReplace("contract-gate-promotion.json", promotion);
process.stdout.write(`${JSON.stringify({ status: "CONTRACT_PROJECT_STATE_PERSISTED", ...expected, nextModule: "work-breakdown" }, null, 2)}\n`);

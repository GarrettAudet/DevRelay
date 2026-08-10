import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateContractGenerationArtifact } from "../src/contract-generation-artifact-validator.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";

const execute = promisify(execFile);
const ROOT = new URL("../", import.meta.url);
const OUTPUT = new URL("dogfood/contract-generation/contract-generation/", ROOT);
const files = [
  "contract-draft-set.json",
  "contract-format-validation-set.json",
  "contract-canonical-diff.json",
  "execution-checkpoint.json",
  "module-execution-record.json",
  "traceability-update.json",
  "traceability-merge-receipt.json",
  "traceability-graph-snapshot.json",
  "contract-gate-review.json",
  "contract-gate-candidate.json",
  "runtime-execution-proof.json",
];

async function materialize() {
  return execute(process.execPath, ["dogfood/contract-generation/contract-generation/materialize.mjs"], {
    cwd: new URL(".", ROOT),
  });
}

test("ContractGeneration dogfood is deterministic, complete, traceable, and stops at ContractGate", async () => {
  const first = await materialize();
  const firstBytes = new Map(
    await Promise.all(files.map(async (name) => [name, await readFile(new URL(name, OUTPUT))])),
  );
  const second = await materialize();
  const summary = JSON.parse(second.stdout);
  assert.equal(summary.status, "CONTRACT_GATE_CANDIDATE_READY");
  assert.equal(summary.requiredInterfaceIntents, 14);
  assert.equal(summary.contracts, 14);
  assert.equal(summary.generatorCalls, 1);
  assert.equal(summary.candidate, "sha256:5ee40f770704ef83ccdde89cfce1a584e2e3d5f9af6bc738db073dfef94255b6");
  assert.equal(summary.gateReview, "sha256:4ccf220764be3d83e545748fa19818315c27e01af3be02e3b619456c50c36351");
  assert.equal(summary.gateCandidate, "sha256:ccc3cb15f764a54f3a6da70327df058c1c30a17df00793b462316d8c80a1c307");
  for (const name of files) {
    assert.deepEqual(await readFile(new URL(name, OUTPUT)), firstBytes.get(name), name);
  }
  const candidate = JSON.parse(firstBytes.get("contract-draft-set.json"));
  const validation = JSON.parse(firstBytes.get("contract-format-validation-set.json"));
  const diff = JSON.parse(firstBytes.get("contract-canonical-diff.json"));
  validateContractGenerationArtifact(candidate);
  validateContractGenerationArtifact(validation);
  validateContractGenerationArtifact(diff);
  assert.equal(candidate.contracts.length, 14);
  assert.equal(validation.status, "pass");
  assert.equal(validation.results.length, 14);
  assert.equal(diff.status, "compatible");
  assert.ok(diff.changes.every(({ changeType, compatibility }) => changeType === "add" && compatibility === "initial"));
  const nativeNames = (await readdir(new URL("native/", OUTPUT))).sort();
  assert.equal(nativeNames.length, 14);
  for (const name of nativeNames) {
    const schema = JSON.parse(await readFile(new URL(`native/${name}`, OUTPUT)));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  }
  validateModuleExecutionRecord(JSON.parse(firstBytes.get("module-execution-record.json")));
  const graph = JSON.parse(firstBytes.get("traceability-graph-snapshot.json"));
  assert.equal(
    graph.nodes.filter(({ kind, authority, scope, state }) => kind === "contract" && authority === "candidate" && scope === "contracts/candidate" && state === "active").length,
    14,
  );
  assert.equal(
    graph.edges.filter(({ kind, authority, scope, state }) => kind === "contracted-by" && authority === "candidate" && scope === "contracts/candidate" && state === "active").length,
    14,
  );
  assert.equal(sha256Digest(firstBytes.get("contract-gate-candidate.json")), summary.gateCandidate);
  assert.equal(first.stdout.includes("CONTRACT_GATE_CANDIDATE_READY"), true);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateContractGenerationArtifact } from "../src/contract-generation-artifact-validator.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const architectureOutput = new URL(
  "../dogfood/v0.11-module-quality/architecture-design/",
  import.meta.url,
);
const contractOutput = new URL(
  "../dogfood/v0.11-module-quality/contract-generation/",
  import.meta.url,
);
const readBytes = (base, name) => readFileSync(new URL(name, base));
const readJson = (base, name) => JSON.parse(readBytes(base, name));

const expectedNewInterfaces = [
  "IF-MQ-EVIDENCE-SEAL",
  "IF-MQ-EXECUTION-RECEIPT",
  "IF-MQ-GODOT-MCP",
  "IF-MQ-GODOT-VERIFY",
  "IF-MQ-METRICS",
  "IF-MQ-PROVIDER-TOOLCHAIN",
  "IF-MQ-REQUIREMENTS-STRATEGY",
  "IF-MQ-TRACE-QUERY",
];

test("V0.11 ArchitectureGate promotion is exact and routes only to ContractGeneration", () => {
  const candidate = readJson(architectureOutput, "architecture-change-set-draft.json");
  const approvalBytes = readBytes(
    architectureOutput,
    "architecture-gate-owner-approval-v2.json",
  );
  const approval = JSON.parse(approvalBytes);
  const proof = readJson(architectureOutput, "architecture-gate-promotion-proof.json");
  const journal = JSON.parse(
    readFileSync(new URL("../project/architecture-promotion.commit.json", import.meta.url)),
  );
  const baselineBytes = readFileSync(
    new URL("../project/architecture-baseline.json", import.meta.url),
  );
  const baseline = JSON.parse(baselineBytes);

  assert.equal(
    sha256Digest(readBytes(architectureOutput, "architecture-change-set-draft.json")),
    "sha256:130bbbfe95be781f2f28caf8b37f9ee11279af110dbd20bdeeab1bf4612077fd",
  );
  assert.equal(
    sha256Digest(approvalBytes),
    "sha256:62a216fce4ba86a539a5bbb46e9e7b77d5bac590eb609259aee1b6f0691f84f7",
  );
  assert.equal(
    sha256Digest(baselineBytes),
    "sha256:248e888701ce3aa30481bdda40624faa8fec95a45aefc76334ba5fd648fe48bb",
  );
  assert.equal(approval.candidate.digest, proof.candidate.digest);
  assert.equal(proof.candidate.digest, journal.candidate.digest);
  assert.equal(proof.ownerApproval.digest, journal.approval.digest);
  assert.equal(proof.promotedArchitectureBaseline.digest, journal.next.architectureBaseline.digest);
  assert.equal(proof.status, "pass");
  assert.equal(proof.checkpointReplay.adapterCallsOnVerification, 0);
  assert.equal(proof.contractGenerationProgressionAllowed, true);
  assert.equal(proof.workBreakdownProgressionAllowed, false);
  assert.deepEqual(
    proof.requiredContractInterfaces.filter((id) => id.startsWith("IF-MQ-")),
    expectedNewInterfaces,
  );
  assert.equal(baseline.approvedDraft.digest, proof.candidate.digest);
  assert.ok(
    baseline.sections.decisionRecords.content.decisions.every(
      ({ status }) => status === "accepted",
    ),
  );
  assert.equal(candidate.changes.interfaceChanges.length, 9);
});

test("V0.11 ContractGeneration produces the exact replayable 51+8 Gate candidate", () => {
  const run = () =>
    spawnSync(
      process.execPath,
      ["dogfood/v0.11-module-quality/contract-generation/materialize.mjs"],
      { cwd: rootPath, encoding: "utf8" },
    );
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const candidateBytes = readBytes(contractOutput, "contract-change-set-draft.json");
  const checkpointBytes = readBytes(contractOutput, "execution-checkpoint.json");
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(
    readBytes(contractOutput, "contract-change-set-draft.json"),
    candidateBytes,
  );
  assert.deepEqual(
    readBytes(contractOutput, "execution-checkpoint.json"),
    checkpointBytes,
  );
  assert.equal(
    sha256Digest(candidateBytes),
    "sha256:6434e9fd59e553525a50e7d4ffcb8fb5f329eea4f95132e121888039df233ab9",
  );

  const candidate = JSON.parse(candidateBytes);
  const validation = readJson(contractOutput, "contract-format-validation-set.json");
  const diff = readJson(contractOutput, "contract-canonical-diff.json");
  const proof = readJson(contractOutput, "runtime-execution-proof.json");
  const gate = readJson(contractOutput, "contract-gate-candidate.json");
  validateContractGenerationArtifact(candidate);
  validateContractGenerationArtifact(validation);
  validateContractGenerationArtifact(diff);
  validateModuleExecutionRecord(
    readJson(contractOutput, "module-execution-record.json"),
  );
  assert.equal(candidate.contracts.length, 59);
  assert.equal(validation.status, "pass");
  assert.equal(validation.results.length, 59);
  assert.equal(diff.status, "compatible");
  assert.equal(
    diff.changes.filter(({ changeType }) => changeType === "unchanged").length,
    51,
  );
  assert.deepEqual(
    diff.changes
      .filter(({ changeType }) => changeType === "add")
      .map(({ interfaceIntentId }) => interfaceIntentId),
    expectedNewInterfaces,
  );
  assert.equal(
    readdirSync(new URL("native/", contractOutput)).filter((name) =>
      name.endsWith(".json"),
    ).length,
    59,
  );
  assert.equal(proof.generatorCalls, 1);
  assert.equal(proof.firstExecutionReplayed, false);
  assert.equal(proof.secondExecutionReplayed, true);
  assert.equal(gate.candidate.digest, sha256Digest(candidateBytes));
  assert.equal(
    gate.architectureBaseline.digest,
    "sha256:248e888701ce3aa30481bdda40624faa8fec95a45aefc76334ba5fd648fe48bb",
  );
});

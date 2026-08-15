import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateWorkBreakdownArtifact } from "../src/work-breakdown-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "../src/work-dependency-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const workBreakdownOutput = new URL("../dogfood/v0.11-module-quality/work-breakdown/", import.meta.url);
const dependencyOutput = new URL("../dogfood/v0.11-module-quality/dependency-analysis/", import.meta.url);
const readBytes = (base, name) => readFileSync(new URL(name, base));
const readJson = (base, name) => JSON.parse(readBytes(base, name));

test("approved V0.11 WorkBreakdown promotion is exact and advances only to WorkDependencyAnalysis", () => {
  const baselineBytes = readFileSync(new URL("../project/history/work-breakdown/1.9.1/work-breakdown-baseline.json", import.meta.url));
  const baseline = JSON.parse(baselineBytes);
  const proof = readJson(workBreakdownOutput, "work-breakdown-gate-promotion-proof.json");
  const approvalBytes = readBytes(workBreakdownOutput, "work-breakdown-gate-owner-approval.json");
  const commit = JSON.parse(readFileSync(new URL("../project/history/work-breakdown/1.9.1/work-breakdown-promotion.commit.json", import.meta.url)));

  validateWorkBreakdownArtifact(baseline);
  assert.equal(baseline.version, "1.9.1");
  assert.equal(baseline.workItems.length, 16);
  assert.equal(baseline.coverageDispositions.length, 261);
  assert.equal(
    sha256Digest(baselineBytes),
    "sha256:c4651af37d938818d798fb871260ceb6f45d5fa45a50ab581dcf7d0ca1a51999",
  );
  assert.equal(
    sha256Digest(approvalBytes),
    "sha256:01ff0dc6c63a3689452a52050bf2dd09c22c240ca313658e7044b20b12984164",
  );
  assert.equal(proof.candidate.digest, "sha256:1e450c2018b3b45fd2e7138f1ffb13c05ae37ddec4cbb86de0a73f736467ae3b");
  assert.equal(proof.gateCandidate.digest, "sha256:352af3c794c94e857d315169f5b94307a69a7f2e7f259cce6f5dcfe132cc151a");
  assert.equal(proof.promotedWorkBreakdownBaseline.digest, sha256Digest(baselineBytes));
  assert.equal(proof.workDependencyAnalysisProgressionAllowed, true);
  assert.equal(proof.checkpointReplay.adapterCallsDuringVerification, 0);
  assert.equal(commit.status, "committed");
  assert.equal(commit.nextBaseline.digest, sha256Digest(baselineBytes));
});

test("V0.11 WorkDependencyAnalysis produces one policy-allowed acyclic 16-item DAG candidate", { timeout: 30_000 }, () => {
  const run = () => spawnSync(
    process.execPath,
    ["dogfood/v0.11-module-quality/dependency-analysis/materialize.mjs"],
    { cwd: rootPath, encoding: "utf8", timeout: 25_000 },
  );
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const candidateBytes = readBytes(dependencyOutput, "work-dependency-candidate.json");
  const checkpointBytes = readBytes(dependencyOutput, "execution-checkpoint.json");
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(readBytes(dependencyOutput, "work-dependency-candidate.json"), candidateBytes);
  assert.deepEqual(readBytes(dependencyOutput, "execution-checkpoint.json"), checkpointBytes);

  const candidate = JSON.parse(candidateBytes);
  const mechanics = readJson(dependencyOutput, "graph-mechanics-result.json");
  const policy = readJson(dependencyOutput, "opa-policy-decision-set.json");
  const review = readJson(dependencyOutput, "spec-kit-consistency-review.json");
  const proof = readJson(dependencyOutput, "runtime-execution-proof.json");
  const gate = readJson(dependencyOutput, "gate-candidate.json");
  validateWorkDependencyArtifact(candidate);

  assert.equal(sha256Digest(candidateBytes), "sha256:4c4e6fd493e432acbd6ea44e73fcdc1aaec247612c7f63aea1e8f564626753c7");
  assert.equal(sha256Digest(readBytes(dependencyOutput, "work-dependency-gate-review.json")), "sha256:1c8589a4efec5f4fa772cb4a29ad12bbe45012226c7eb295ebea09d4a48d781c");
  assert.equal(sha256Digest(readBytes(dependencyOutput, "gate-candidate.json")), "sha256:d1c788b7b7eea1a224360a0a3aad5b8a3623654e02e1b58457ac477afa522970");
  assert.equal(candidate.nodes.length, 16);
  assert.equal(candidate.edges.length, 25);
  assert.equal(mechanics.status, "valid");
  assert.deepEqual(mechanics.cycleWitness, []);
  assert.equal(mechanics.generations.length, 4);
  assert.equal(policy.allow, true);
  assert.equal(policy.denials.length, 0);
  assert.equal(policy.edgeDecisions.length, 25);
  assert.ok(policy.edgeDecisions.every(({ allow }) => allow));
  assert.equal(review.advisory, true);
  assert.equal(review.status, "pass");
  assert.equal(proof.proposerCalls, 1);
  assert.equal(proof.reviewerCalls, 1);
  assert.equal(proof.firstExecutionReplayed, false);
  assert.equal(proof.secondExecutionReplayed, true);
  assert.equal(gate.candidate.digest, sha256Digest(candidateBytes));
  assert.equal(gate.workBreakdownBaseline.digest, "sha256:c4651af37d938818d798fb871260ceb6f45d5fa45a50ab581dcf7d0ca1a51999");
  assert.equal(gate.repositoryRevision, "a97f1f5e3de896d0858a117b6672c5891a095ea3");
});

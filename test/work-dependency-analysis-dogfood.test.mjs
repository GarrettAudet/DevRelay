import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";
import {
  validateTraceabilityGraphSnapshot,
  validateTraceabilityUpdate,
} from "../src/traceability-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "../src/work-dependency-artifact-validator.mjs";

const ROOT = new URL(
  "../dogfood/work-dependency-analysis/dependency-analysis/",
  import.meta.url,
);

async function artifact(name) {
  const bytes = await readFile(new URL(name, ROOT));
  return { bytes, value: JSON.parse(bytes), digest: sha256Digest(bytes) };
}

test("dogfood candidate binds the full 11-item snapshot to one policy-allowed static DAG", async () => {
  const [candidate, snapshot, proposal, mechanics, policy, review, proof] =
    await Promise.all(
      [
        "work-dependency-candidate.json",
        "work-breakdown-analysis-snapshot.json",
        "dependency-proposal.json",
        "graph-mechanics-result.json",
        "opa-policy-decision-set.json",
        "spec-kit-consistency-review.json",
        "runtime-execution-proof.json",
      ].map(artifact),
    );
  assert.equal(
    candidate.digest,
    "sha256:f929a756793927c894aada19bbf544a228445dc085ecf78aa4fe8dbda7afa61a",
  );
  assert.doesNotThrow(() => validateWorkDependencyArtifact(candidate.value));
  assert.equal(snapshot.value.workItemIds.length, 11);
  assert.equal(snapshot.value.workItems.length, 11);
  assert.equal(snapshot.value.contextSlices.length, 3);
  assert.equal(proposal.value.nodes.length, 11);
  assert.equal(proposal.value.edges.length, 10);
  assert.equal(mechanics.value.status, "valid");
  assert.equal(mechanics.value.cycleWitness.length, 0);
  assert.equal(mechanics.value.topologicalOrder.length, 11);
  assert.equal(policy.value.evaluationStatus, "evaluated");
  assert.equal(policy.value.allow, true);
  assert.equal(policy.value.edgeDecisions.length, 10);
  assert.equal(policy.value.edgeDecisions.every(({ allow }) => allow), true);
  assert.equal(review.value.reviewer.id, "spec-kit-dependency-reviewer");
  assert.equal(review.value.status, "pass");
  assert.equal(proof.value.firstExecutionReplayed, false);
  assert.equal(proof.value.secondExecutionReplayed, true);
  assert.equal(proof.value.proposerCalls, 1);
  assert.equal(proof.value.reviewerCalls, 1);
});

test("Gate candidate remains the exact replay-bound input to promotion", async () => {
  const [candidate, gateReview, gateCandidate, checkpoint] = await Promise.all(
    [
      "work-dependency-candidate.json",
      "work-dependency-gate-review.json",
      "gate-candidate.json",
      "execution-checkpoint.json",
    ].map(artifact),
  );
  assert.equal(
    gateReview.digest,
    "sha256:d5afcefa8140b81a6dfa6ec16d84ca6df8306739a7755727f627a247691bc0ce",
  );
  assert.equal(
    gateCandidate.digest,
    "sha256:07290d240e0ec60ace267c68aa8d3a61e2ddb89c80bb714220d98fc3ccd0d6b3",
  );
  assert.equal(gateCandidate.value.candidate.digest, candidate.digest);
  assert.equal(gateCandidate.value.gateReview.digest, gateReview.digest);
  assert.equal(
    gateCandidate.value.terminalCheckpointDigest,
    checkpoint.value.checkpointDigest,
  );
  const { checkpointDigest, ...checkpointMaterial } = checkpoint.value;
  assert.equal(checkpointDigest, canonicalJsonDigest(checkpointMaterial));
  assert.equal(gateCandidate.value.requestedDecision, "approve");
  assert.equal(gateReview.value.decision, "eligible-for-owner-approval");
});


test("owner-approved promotion is exact, idempotent, and forward-only", async () => {
  const replay = JSON.parse(
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("promote.mjs", ROOT))],
      { encoding: "utf8" },
    ),
  );
  const [
    approval,
    baseline,
    proof,
    update,
    graph,
    record,
    checkpoint,
    gateCandidate,
    gateReview,
  ] = await Promise.all(
    [
      "work-dependency-gate-owner-approval.json",
      "work-dependency-baseline.json",
      "work-dependency-gate-promotion-proof.json",
      "traceability-update.json",
      "traceability-graph-snapshot.json",
      "module-execution-record.json",
      "execution-checkpoint.json",
      "gate-candidate.json",
      "work-dependency-gate-review.json",
    ].map(artifact),
  );
  const projectBaselineBytes = await readFile(
    new URL("../../../project/work-dependency-baseline.json", ROOT),
  );

  assert.equal(replay.status, "WORK_DEPENDENCY_BASELINE_PROMOTED");
  assert.equal(
    approval.digest,
    "sha256:74f10b74bde9c2c3cbb4c86975fb9ca5e5795f97c1dd5052fbbe4ac4f8df1d12",
  );
  assert.equal(
    baseline.digest,
    "sha256:f11d0a1031781a8645da3db637462af4775c4861afc355054ad52df4d19ab52c",
  );
  assert.equal(
    update.digest,
    "sha256:04e17bb9558cdb8a6bebfa450abdbe76875061106680cc3883bb08d3de2ad932",
  );
  assert.equal(
    graph.digest,
    "sha256:53d3f7872cd5cb3d23ab47d641833f5a72a4fb2ee2bf3a1ea3f8ffc2c349d738",
  );
  assert.equal(
    record.digest,
    "sha256:c1f11b136c167d1fbaf2fc5eb9d1f14e9ed48fc60893875d694fc0b8b8339c79",
  );
  assert.deepEqual(projectBaselineBytes, baseline.bytes);
  assert.doesNotThrow(() => validateWorkDependencyArtifact(baseline.value));
  assert.doesNotThrow(() => validateTraceabilityUpdate(update.value));
  assert.doesNotThrow(() => validateTraceabilityGraphSnapshot(graph.value));
  assert.doesNotThrow(() => validateModuleExecutionRecord(record.value));

  const requiredEvidence = new Set(
    approval.value.requiredEvidence.map(({ digest }) => digest),
  );
  assert.deepEqual(
    requiredEvidence,
    new Set([gateCandidate.digest, gateReview.digest, checkpoint.digest]),
  );
  assert.equal(baseline.value.approvalEvidence[0].digest, approval.digest);
  assert.equal(proof.value.status, "promoted");
  assert.equal(proof.value.progression.allowed, true);
  assert.equal(proof.value.progression.nextModule, "specialist-assignment");
  assert.equal(proof.value.promotedBaseline.digest, baseline.digest);
  assert.equal(proof.value.traceability.update.digest, update.digest);
  assert.equal(proof.value.traceability.resultingGraph.digest, graph.digest);
  assert.equal(proof.value.traceability.moduleExecutionRecord.digest, record.digest);
  assert.equal(record.value.moduleResult.outcome, "promoted");
  assert.equal(
    record.value.moduleResult.outputs["work-dependency-baseline"][0].digest,
    baseline.digest,
  );
  assert.equal(graph.value.vocabulary.version, "1.2.0");
  assert.equal(graph.value.revision, 3);
  assert.equal(
    graph.value.edges.filter(
      ({ kind, state }) => kind === "prerequisite-for" && state === "active",
    ).length,
    10,
  );
  assert.equal(graph.value.edges.some(({ kind }) => kind === "depends-on"), false);
});

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
  execFileSync(process.execPath, [fileURLToPath(new URL("materialize.mjs", ROOT))]);
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
    "sha256:5009bf9189b801f34f58582ecfb6a7444abbdefd2a31ec957c866672e8086807",
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
    "sha256:c35b3be93fae40c70720d721222187faeef1613037d86b18f13c291d8768601f",
  );
  assert.equal(
    gateCandidate.digest,
    "sha256:74c22ef41298a1ced28bfe14f3d3ad5f0a23c3c4843bddaecb8a3129fd8acd91",
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
  const promotionSource = await readFile(new URL("promote.mjs", ROOT), "utf8");
  const repositorySnapshotBytes = await readFile(
    new URL("../repository-snapshot.json", ROOT),
  );
  const repositorySnapshot = JSON.parse(repositorySnapshotBytes);
  assert.doesNotMatch(promotionSource, /rev-parse|execFileSync\("git"/);
  assert.equal(
    sha256Digest(repositorySnapshotBytes),
    "sha256:1092f90bf5ebed8096dd12879a2511645b53116eb0d0b82483460053eee88481",
  );
  assert.equal(
    repositorySnapshot.revision,
    "9cb4f2b8d340142557027fc0477440722d4f8286",
  );
  assert.equal(
    repositorySnapshot.treeDigest,
    "sha256:b6d7beba6da3151dc15f4de0dd2a78a9d0edef3097b2f1e22039a6fb21275c61",
  );
  const projectBaselineUrl = new URL("../../../project/work-dependency-baseline.json", ROOT);
  const projectBaselineBefore = await readFile(projectBaselineUrl);
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
      "replay-v6/work-dependency-gate-owner-approval.json",
      "replay-v6/work-dependency-baseline.json",
      "replay-v6/work-dependency-gate-promotion-proof.json",
      "replay-v6/traceability-update.json",
      "replay-v6/traceability-graph-snapshot.json",
      "replay-v6/module-execution-record.json",
      "execution-checkpoint.json",
      "gate-candidate.json",
      "work-dependency-gate-review.json",
    ].map(artifact),
  );
  const projectBaselineBytes = await readFile(projectBaselineUrl);

  assert.equal(replay.status, "WORK_DEPENDENCY_BASELINE_PROMOTED");
  assert.equal(
    approval.digest,
    "sha256:7d2bd56226dc0c68c4f2813389388dd0c49921bf86766f107e65d48d4c3d3d8f",
  );
  assert.equal(
    baseline.digest,
    "sha256:0c25a5870f716921bb8761c5c31a4f5c45c5410aa62b7401412dbd06d7511498",
  );
  assert.equal(
    update.digest,
    "sha256:274394a947b9374da4c1af1e7779117b050c001cf64110988e4e118d4dae85d0",
  );
  assert.equal(
    graph.digest,
    "sha256:a5b4c9c0ef4c1434abec36b53a57e0f20fcec50182d743c9e20be056ef685caa",
  );
  assert.equal(
    record.digest,
    "sha256:8bc6e112d862336c10f7458330e030b1065123cdfe53506c6afe6321b57e6bb6",
  );
  assert.deepEqual(projectBaselineBytes, projectBaselineBefore);
  assert.notDeepEqual(projectBaselineBytes, baseline.bytes);
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
  assert.equal(graph.value.vocabulary.version, "1.5.0");
  assert.equal(graph.value.revision, 3);
  assert.equal(
    graph.value.edges.filter(
      ({ kind, state }) => kind === "prerequisite-for" && state === "active",
    ).length,
    10,
  );
  assert.equal(graph.value.edges.some(({ kind }) => kind === "depends-on"), false);
});

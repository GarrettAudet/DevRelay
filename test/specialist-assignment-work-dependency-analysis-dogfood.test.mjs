import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";
import {
  validateTraceabilityGraphSnapshot,
  validateTraceabilityUpdate,
} from "../src/traceability-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "../src/work-dependency-artifact-validator.mjs";

const ROOT = new URL(
  "../dogfood/specialist-assignment/dependency-analysis/",
  import.meta.url,
);

async function artifact(name) {
  const bytes = await readFile(new URL(name, ROOT));
  return { bytes, value: JSON.parse(bytes), digest: sha256Digest(bytes) };
}

test("dogfood candidate binds the full 9-item snapshot to one policy-allowed static DAG", async () => {
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
    "sha256:0229e3182c202f8ab9f75d9ff62f08affaa7b85ca550389112055c2e6de21667",
  );
  assert.doesNotThrow(() => validateWorkDependencyArtifact(candidate.value));
  assert.equal(snapshot.value.workItemIds.length, 9);
  assert.equal(snapshot.value.workItems.length, 9);
  assert.equal(snapshot.value.contextSlices.length, 3);
  assert.equal(proposal.value.nodes.length, 9);
  assert.equal(proposal.value.edges.length, 9);
  assert.equal(mechanics.value.status, "valid");
  assert.equal(mechanics.value.cycleWitness.length, 0);
  assert.equal(mechanics.value.topologicalOrder.length, 9);
  assert.equal(policy.value.evaluationStatus, "evaluated");
  assert.equal(policy.value.allow, true);
  assert.equal(policy.value.edgeDecisions.length, 9);
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
    "sha256:806014023546569a7817c165921cb0cde5478565859dd334c27f799fcee79f1b",
  );
  assert.equal(
    gateCandidate.digest,
    "sha256:ce2757df68774df1dda528d29226f9b99d4627a8eb13c4e9266c5a4db1f49b8a",
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


test("owner-approved promotion archive is exact and forward-only", async () => {
  const promotionSource = await readFile(new URL("promote.mjs", ROOT), "utf8");
  const repositorySnapshotBytes = await readFile(
    new URL("../repository-snapshot.json", ROOT),
  );
  const repositorySnapshot = JSON.parse(repositorySnapshotBytes);
  assert.doesNotMatch(promotionSource, /rev-parse|execFileSync\("git"/);
  assert.equal(
    sha256Digest(repositorySnapshotBytes),
    "sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73",
  );
  assert.equal(
    repositorySnapshot.revision,
    "4bda7fe707ba102bd22fe0001c83aa13ec03b0c5",
  );
  assert.equal(
    repositorySnapshot.treeDigest,
    "sha256:6d27786016084029b7148e33d7200656366120cd986f046d32b9e406c12b33dd",
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
    new URL(
      "../../../project/history/work-dependency/WDB-SA-DOGFOOD/work-dependency-baseline.json",
      ROOT,
    ),
  );

  assert.equal(
    approval.digest,
    "sha256:f2ab289df400f94a4d50e18e52f3f7959c2f6e065b9683c231aaca88f7f8aac3",
  );
  assert.equal(
    baseline.digest,
    "sha256:f77421268cd21e5fe1f7264208702d60ce5e563328f1b833299a2cb16047f8c9",
  );
  assert.equal(
    update.digest,
    "sha256:c77144d83d451837ac01023be26d745fe80f14fbae427d9c8a848fc9e7abd4fe",
  );
  assert.equal(
    graph.digest,
    "sha256:9ee44993af3f20c4ff5617d4f091ad486a340073c8ac29d9d209608803dcb80a",
  );
  assert.equal(
    record.digest,
    "sha256:5eec472237bed5a4ce316db1dce0c4e9b63ad85ac24d03509170a32f5674ab9a",
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
  assert.equal(graph.value.revision, 4);
  assert.equal(
    graph.value.edges.filter(
      ({ kind, state }) => kind === "prerequisite-for" && state === "active",
    ).length,
    9,
  );
  assert.equal(graph.value.edges.some(({ kind }) => kind === "depends-on"), false);
});

import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryArtifactUriFromUrl } from "../../_support/repository-artifact-uri.mjs";

import { architectureBaselineObserverContributor } from "../../../src/architecture-traceability-contributor.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { CONTRACT_GENERATION_ARTIFACT_CONTRACTS, validateContractGenerationArtifact } from "../../../src/contract-generation-artifact-validator.mjs";
import { contractBaselineTraceabilityContributor, contractCandidateTraceabilityContributor } from "../../../src/contract-traceability-contributor.mjs";
import { CONTRACT_GATE_APPROVAL_CONTRACT, promoteContractBaseline } from "../../../src/contract-gate.mjs";
import { requirementsBaselineObserverContributor } from "../../../src/requirements-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../../../src/traceability-graph.mjs";
import { validateWorkBreakdownArtifact } from "../../../src/work-breakdown-artifact-validator.mjs";
import { contractGenerationDogfoodExecution as dogfood } from "./materialize.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./replay-v6/", import.meta.url);
const APPROVED = Object.freeze({
  candidate: "sha256:861c9a3b24a9d0d03e6aa68d7afc7e25bc8724a47f76109b3b2fc30952152014",
  gateReview: "sha256:c425eaae5eb5474ea8a33b18b0e8bbd36dc43b91ccc4425ae632e54645c62921",
  gateCandidate: "sha256:9247c6b4dbf23610ad224f5a20f983ded1881943f28f070cc919b6ed6b97cae7",
  checkpoint: "sha256:16214be69a072b0aac5eef75fe863c2fdb0cfec14a3d86cda667231691e7f66a",
  traceabilityUpdate: "sha256:a4b8559def8ee384e0b7e64fc6f2e8faabe053c76f173cfa1e6102b754bd8a3f",
  executionRecord: "sha256:5a73e801d17cb1498feefb4dcb66fc8087b369943f6cd200d1fbdced26fb8270",
});
const CONTRACTS = Object.freeze({
  approval: CONTRACT_GATE_APPROVAL_CONTRACT,
  baseline: CONTRACT_GENERATION_ARTIFACT_CONTRACTS.ContractBaseline,
  disposition: {
    schema: "https://devrelay.dev/artifacts/contract-disposition/v1",
    mediaType: "application/vnd.devrelay.contract-disposition+json",
  },
  state: CONTRACT_GENERATION_ARTIFACT_CONTRACTS.ProjectContractState,
  promotion: {
    schema: "https://devrelay.dev/evidence/contract-gate-promotion/v1",
    mediaType: "application/json",
  },
});

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifactId === right.artifactId &&
    left.schema === right.schema &&
    left.mediaType === right.mediaType &&
    left.digest === right.digest);
}
function document(value, artifactId, contract, url) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: {
      artifactId,
      schema: contract.schema,
      mediaType: contract.mediaType,
      digest: sha256Digest(bytes),
      uri: repositoryArtifactUriFromUrl(ROOT, url),
    },
    url,
  };
}
async function writeExact(loaded, destinations = [loaded.url]) {
  for (const url of destinations) {
    const target = fileURLToPath(url);
    try {
      const existing = await readFile(target);
      if (!existing.equals(loaded.bytes)) {
        throw new Error("immutable promotion artifact already differs: " + target);
      }
      continue;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), "." + path.basename(target) + "." + process.pid + ".tmp");
    await writeFile(temporary, loaded.bytes, { flag: "wx" });
    await rename(temporary, target);
  }
}
async function preserveAndReplaceCurrent(loaded, currentUrl, historyUrl) {
  const currentPath = fileURLToPath(currentUrl);
  try {
    const currentBytes = await readFile(currentPath);
    if (currentBytes.equals(loaded.bytes)) return;
    await writeExact({ bytes: currentBytes, url: historyUrl });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(currentPath), { recursive: true });
  await writeFile(currentPath, loaded.bytes);
}

assert.equal(dogfood.candidateLoaded.ref.digest, APPROVED.candidate);
assert.equal(dogfood.gateReview.ref.digest, APPROVED.gateReview);
assert.equal(dogfood.gateCandidate.ref.digest, APPROVED.gateCandidate);
assert.equal(dogfood.checkpoint.checkpointDigest, APPROVED.checkpoint);
assert.equal(dogfood.traceabilityUpdateFile.ref.digest, APPROVED.traceabilityUpdate);
assert.equal(dogfood.executionRecordFile.ref.digest, APPROVED.executionRecord);

const approvalValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ContractGateApproval",
  approvalId: "CGA-WORK-ITEM-VERIFICATION-CONTRACT-CHANGE-001",
  authority: "project-owner",
  decision: "approve",
  policyVersion: "contract-gate/0.1.0",
  candidate: dogfood.candidateLoaded.ref,
  breakingChangeApproved: false,
  requiredEvidence: [
    dogfood.gateCandidate.ref,
    dogfood.gateReview.ref,
    dogfood.checkpointFile.ref,
    dogfood.executionRecordFile.ref,
    dogfood.traceabilityUpdateFile.ref,
  ],
};
const approval = document(approvalValue, approvalValue.approvalId, CONTRACTS.approval, new URL("contract-gate-owner-approval.json", OUTPUT));

const baselineValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ContractBaseline",
  baselineId: "CB-DEVRELAY-004",
  version: "1.3.0",
  approvedCandidate: dogfood.candidateLoaded.ref,
  supersedes: dogfood.currentContractBaseline.ref,
  architectureBaseline: dogfood.architecture.ref,
  projectOverviewBaseline: dogfood.projectOverview.ref,
  contracts: dogfood.candidateLoaded.value.contracts.map((entry) => ({
    ...entry,
    compatibility: entry.compatibility === "initial" ? "backward-compatible" : entry.compatibility,
  })),
  contractsDigest: canonicalJsonDigest(
    dogfood.candidateLoaded.value.contracts.map((entry) => ({
      ...entry,
      compatibility: entry.compatibility === "initial" ? "backward-compatible" : entry.compatibility,
    })),
  ),
  approvalEvidence: [approval.ref],
  sourceRefs: dogfood.candidateLoaded.value.sourceRefs,
};
const baseline = document(baselineValue, baselineValue.baselineId, CONTRACTS.baseline, new URL("contract-baseline.json", OUTPUT));
validateContractGenerationArtifact(baseline.value, { ref: baseline.ref });

const evidence = [
  dogfood.gateCandidate,
  dogfood.gateReview,
  dogfood.checkpointFile,
  dogfood.executionRecordFile,
  dogfood.traceabilityUpdateFile,
];
const commit = await promoteContractBaseline({
  replayReceipt: dogfood.replayReceipt,
  baseline: baseline.value,
  baselineRef: baseline.ref,
  baselineBytes: baseline.bytes,
  approval,
  evidenceResolver: async (ref) => evidence.find((entry) => sameRef(entry.ref, ref)),
});
assert.equal(commit.progressionAllowed, true);
assert.equal(commit.contractDisposition.contractTargets.length, 34);

const disposition = document(
  commit.contractDisposition,
  commit.contractDisposition.dispositionId,
  CONTRACTS.disposition,
  new URL("contract-disposition.json", OUTPUT),
);
validateWorkBreakdownArtifact(disposition.value, { ref: disposition.ref });
const stateValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContractState",
  stateId: "PCS-DEVRELAY-CONTRACTS-WORK-ITEM-VERIFICATION-BASELINED-001",
  state: "baselined",
  architectureBaseline: dogfood.architecture.ref,
  projectOverviewBaseline: dogfood.projectOverview.ref,
  requiredInterfaceIntentIds: dogfood.candidateLoaded.value.requiredInterfaceIntentIds,
  contractBaseline: baseline.ref,
};
const state = document(stateValue, stateValue.stateId, CONTRACTS.state, new URL("project-contract-state-baselined.json", OUTPUT));
validateContractGenerationArtifact(state.value, { ref: state.ref });

const graphStore = createInMemoryTraceabilityStore();
const upstreamGraph = createTraceabilityGraphService({
  graphId: "devrelay/contract-generation-promotion",
  projectId: "devrelay",
  store: graphStore,
  contributors: [
    requirementsBaselineObserverContributor,
    architectureBaselineObserverContributor,
  ],
});
const upstreamInvocation = {
  invocationId: "contract-promotion-upstream-seed",
  module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" },
};
const upstream = await upstreamGraph.prepare({
  invocation: upstreamInvocation,
  invocationFingerprint: canonicalJsonDigest(upstreamInvocation),
  moduleResult: {
    invocationId: upstreamInvocation.invocationId,
    status: "completed",
    outcome: "decomposed",
    outputs: {},
    evidence: [],
    diagnostics: [],
  },
  loadedInputs: {
    "requirements-baseline": [{ ...dogfood.requirements, ref: structuredClone(dogfood.architecture.value.requirementsBaseline) }],
    "project-overview-baseline": [{ ...dogfood.projectOverview, ref: structuredClone(dogfood.architecture.value.projectOverviewBaseline) }],
    "architecture-baseline": [dogfood.architecture],
  },
  loadedOutputs: {},
  baseGraph: upstreamGraph.captureBase(),
});
await upstreamGraph.mergePrepared(upstream);
const graph = createTraceabilityGraphService({
  graphId: "devrelay/contract-generation-promotion",
  projectId: "devrelay",
  store: graphStore,
  contributors: [contractCandidateTraceabilityContributor, contractBaselineTraceabilityContributor],
});

const candidatePrepared = await graph.prepare({
  invocation: dogfood.invocation,
  invocationFingerprint: canonicalJsonDigest({ invocation: dogfood.invocation }),
  moduleResult: dogfood.moduleResult,
  loadedInputs: {
    "project-contract-state": [dogfood.state],
    "architecture-baseline": [dogfood.architecture],
    "project-overview-baseline": [dogfood.projectOverview],
  },
  loadedOutputs: { "contract-change-set-draft": [dogfood.candidateLoaded] },
  baseGraph: graph.captureBase(),
});
await graph.mergePrepared(candidatePrepared);

const gateInvocation = {
  invocationId: "contract-gate-promotion-work-item-verification-v1",
  module: { id: "contract-gate", version: "0.1.0", operation: "promote" },
};
const approvedPrepared = await graph.prepare({
  invocation: gateInvocation,
  invocationFingerprint: canonicalJsonDigest(gateInvocation),
  moduleResult: {
    invocationId: gateInvocation.invocationId,
    status: "completed",
    outcome: "promoted",
    outputs: { "contract-baseline": [baseline.ref] },
    evidence: [],
    diagnostics: [],
  },
  gate: { id: "contract-gate", outcome: "promoted" },
  loadedInputs: {},
  loadedOutputs: { "contract-baseline": [baseline] },
  baseGraph: graph.captureBase(),
});
const approvedMerge = await graph.mergePrepared(approvedPrepared);
graph.assertApplied(approvedPrepared.updateRef);
assert.equal(
  approvedMerge.snapshot.nodes.filter(({ kind, state: nodeState }) => kind === "contract" && nodeState === "active").length,
  68,
);

const approvedUpdate = document(
  approvedPrepared.update,
  approvedPrepared.updateRef.artifactId,
  { schema: approvedPrepared.updateRef.schema, mediaType: approvedPrepared.updateRef.mediaType },
  new URL("approved-traceability-update.json", OUTPUT),
);
assert.equal(approvedUpdate.ref.digest, approvedPrepared.updateRef.digest);
const approvedReceipt = document(
  approvedMerge.receipt,
  approvedMerge.receiptRef.artifactId,
  { schema: approvedMerge.receiptRef.schema, mediaType: approvedMerge.receiptRef.mediaType },
  new URL("approved-traceability-merge-receipt.json", OUTPUT),
);
const approvedSnapshot = document(
  approvedMerge.snapshot,
  approvedMerge.snapshotRef.artifactId,
  { schema: approvedMerge.snapshotRef.schema, mediaType: approvedMerge.snapshotRef.mediaType },
  new URL("approved-traceability-graph-snapshot.json", OUTPUT),
);

const promotionValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ContractGatePromotionProof",
  promotionId: "CGP-WORK-ITEM-VERIFICATION-CONTRACT-CHANGE-001",
  candidate: dogfood.candidateLoaded.ref,
  approval: approval.ref,
  contractBaseline: baseline.ref,
  contractDisposition: disposition.ref,
  projectContractState: state.ref,
  checkpointDigest: commit.checkpointDigest,
  approvedTraceabilityUpdate: approvedUpdate.ref,
  approvedTraceabilityMergeReceipt: approvedReceipt.ref,
  approvedTraceabilityGraphSnapshot: approvedSnapshot.ref,
  contractCount: baseline.value.contracts.length,
  progressionAllowed: true,
  nextModule: "work-breakdown",
};
const promotion = document(promotionValue, promotionValue.promotionId, CONTRACTS.promotion, new URL("contract-gate-promotion.json", OUTPUT));

await writeExact(approval);
await writeExact(baseline);
await writeExact(disposition);
await writeExact(state);
await writeExact(approvedUpdate);
await writeExact(approvedReceipt);
await writeExact(approvedSnapshot);
await writeExact(promotion);

process.stdout.write(JSON.stringify({
  status: "CONTRACT_BASELINE_PROMOTED",
  approval: approval.ref.digest,
  baseline: baseline.ref.digest,
  disposition: disposition.ref.digest,
  projectContractState: state.ref.digest,
  approvedTraceabilityUpdate: approvedUpdate.ref.digest,
  approvedTraceabilityCheckpoint: approvedMerge.snapshotRef.digest,
  promotion: promotion.ref.digest,
  contracts: baseline.value.contracts.length,
  nextModule: promotion.value.nextModule,
}, null, 2) + "\n");

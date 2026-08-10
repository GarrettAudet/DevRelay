import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const OUTPUT = new URL("./", import.meta.url);
const APPROVED = Object.freeze({
  candidate: "sha256:e5f41f1733fa7dd26d82e30846033f2c2df8761440b6f02e97f38ee7b527255c",
  gateReview: "sha256:11ef6368c714aaa209bae9cb8bf9180b07fa4f1a696432d7dbc043d986ebf753",
  gateCandidate: "sha256:5293522ccb6f8dcd7672608b51ec0847e5d5a6cd216f2818c359c2edb7e6fe14",
  checkpoint: "sha256:3102d800ad4740ccdeb57b53c06feaaa85fbb587e07c3a659764d9136052a86a",
  traceabilityUpdate: "sha256:5697b99079c02566a47351e207ca5d5cb59dd0f7bc4c78235b2451aca310bf70",
  executionRecord: "sha256:797de9bac4b9f4b6e166a088f3f15ecb887d2c47ba2ec6e70cba449ff432eac4",
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
      uri: pathToFileURL(fileURLToPath(url)).href,
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
  approvalId: "CGA-ARCHITECTURE-DISCOVERY-CONTRACT-CHANGE-001",
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
  baselineId: "CB-DEVRELAY-006",
  version: "1.5.0",
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
assert.equal(commit.contractDisposition.contractTargets.length, 48);

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
  stateId: "PCS-DEVRELAY-CONTRACTS-ARCHITECTURE-DISCOVERY-BASELINED-001",
  state: "baselined",
  architectureBaseline: dogfood.architecture.ref,
  projectOverviewBaseline: dogfood.projectOverview.ref,
  requiredInterfaceIntentIds: dogfood.candidateLoaded.value.requiredInterfaceIntentIds,
  contractBaseline: baseline.ref,
};
const state = document(stateValue, stateValue.stateId, CONTRACTS.state, new URL("project-contract-state-baselined.json", OUTPUT));
validateContractGenerationArtifact(state.value, { ref: state.ref });

const graph = createTraceabilityGraphService({
  graphId: "devrelay/contract-generation-promotion",
  projectId: "devrelay",
  store: createInMemoryTraceabilityStore(),
  contributors: [
    requirementsBaselineObserverContributor,
    architectureBaselineObserverContributor,
    contractCandidateTraceabilityContributor,
    contractBaselineTraceabilityContributor,
  ],
});
const upstreamInvocation = {
  invocationId: "contract-promotion-upstream-seed",
  module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" },
};
const upstream = await graph.prepare({
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
    "requirements-baseline": [dogfood.requirements],
    "project-overview-baseline": [dogfood.projectOverview],
    "architecture-baseline": [dogfood.architecture],
  },
  loadedOutputs: {},
  baseGraph: graph.captureBase(),
});
await graph.mergePrepared(upstream);

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
  invocationId: "contract-gate-promotion-architecture-discovery-v1",
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
  96,
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
  promotionId: "CGP-ARCHITECTURE-DISCOVERY-CONTRACT-CHANGE-001",
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

const HISTORY = new URL("project/history/contracts/CB-DEVRELAY-005/", ROOT);
await writeExact(approval);
await writeExact(baseline);
await writeExact(disposition);
await writeExact(state);
await writeExact(approvedUpdate);
await writeExact(approvedReceipt);
await writeExact(approvedSnapshot);
await writeExact(promotion);
await preserveAndReplaceCurrent(approval, new URL("project/contract-gate-owner-approval.json", ROOT), new URL("contract-gate-owner-approval.json", HISTORY));
await preserveAndReplaceCurrent(baseline, new URL("project/contract-baseline.json", ROOT), new URL("contract-baseline.json", HISTORY));
await preserveAndReplaceCurrent(disposition, new URL("project/contract-disposition.json", ROOT), new URL("contract-disposition.json", HISTORY));
await preserveAndReplaceCurrent(state, new URL("project/project-contract-state.json", ROOT), new URL("project-contract-state.json", HISTORY));
await preserveAndReplaceCurrent(promotion, new URL("project/contract-promotion.commit.json", ROOT), new URL("contract-promotion.commit.json", HISTORY));

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

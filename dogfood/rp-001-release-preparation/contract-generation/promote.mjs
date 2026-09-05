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
const OUTPUT = new URL("./replay-v1/", import.meta.url);
const WORK_BREAKDOWN_CONTEXT = new URL("../work-breakdown/context/", import.meta.url);
const DISPLACED_CONTEXT = new URL("history/pre-rp-001-contract-promotion/", WORK_BREAKDOWN_CONTEXT);
const APPROVED = Object.freeze({
  candidate: "sha256:72053a4ec2f283d5d645d8e8996f18e2909d90f113093f0199c89ae159a6bf6e",
  gateReview: "sha256:5533255b72fd0c382349f748b55eb531cf9087d029e5efbfceb7b29b0c588d9c",
  gateCandidate: "sha256:95f95c1fb347adf5fd91a806477091a55eefad2902eb845e300832ae77d1030a",
  checkpoint: "sha256:fbd3cf5b25964d8899a72ca4c5b05634689828696bc24295f9e05e3edaa2223f",
  traceabilityUpdate: "sha256:31257cb0c550503963403434dc19276bf221fa4b02b44cf7c18f99726de2219d",
  executionRecord: "sha256:a8232a5b6db71673a499cecf3c3fccf58acc4740ff1a363a1edfd434aee4dc2b",
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
  approvalId: "CGA-RP-001-CONTRACT-CHANGE-001",
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
  baselineId: "CB-DEVRELAY-015",
  version: "2.3.0",
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
assert.equal(commit.contractDisposition.contractTargets.length, dogfood.candidateLoaded.value.contracts.length);

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
  stateId: "PCS-DEVRELAY-CONTRACTS-RP-001-BASELINED-001",
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
  graphId: "devrelay/rp-001-contract-generation-promotion",
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
  graphId: "devrelay/rp-001-contract-generation-promotion",
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
  invocationId: "contract-gate-promotion-rp-001-v1",
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
  baseline.value.contracts.length * 2,
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
  promotionId: "CGP-RP-001-CONTRACT-CHANGE-001",
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

await preserveAndReplaceCurrent(baseline, new URL("contract-baseline.json", WORK_BREAKDOWN_CONTEXT), new URL("contract-baseline.json", DISPLACED_CONTEXT));
await preserveAndReplaceCurrent(disposition, new URL("contract-disposition.json", WORK_BREAKDOWN_CONTEXT), new URL("contract-disposition.json", DISPLACED_CONTEXT));
await preserveAndReplaceCurrent(promotion, new URL("contract-gate-promotion.json", WORK_BREAKDOWN_CONTEXT), new URL("contract-gate-promotion.json", DISPLACED_CONTEXT));
await preserveAndReplaceCurrent(
  baseline,
  new URL("project/contract-baseline.json", ROOT),
  new URL("project/history/contracts/CB-DEVRELAY-014/contract-baseline.json", ROOT),
);
await preserveAndReplaceCurrent(
  disposition,
  new URL("project/contract-disposition.json", ROOT),
  new URL("project/history/contracts/CB-DEVRELAY-014/contract-disposition.json", ROOT),
);
await preserveAndReplaceCurrent(
  promotion,
  new URL("project/contract-gate-promotion.json", ROOT),
  new URL("project/history/contracts/CB-DEVRELAY-014/contract-gate-promotion.json", ROOT),
);
await preserveAndReplaceCurrent(
  state,
  new URL("project/project-contract-state.json", ROOT),
  new URL("project/history/contracts/CB-DEVRELAY-014/project-contract-state.pre-rp-001.json", ROOT),
);

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

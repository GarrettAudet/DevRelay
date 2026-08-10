import assert from "node:assert/strict";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryArtifactUriFromUrl } from "../../_support/repository-artifact-uri.mjs";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../../src/content-digest.mjs";
import {
  createGraphAwareInvocationFingerprint,
  createTraceCheckpointKey,
  validateModuleExecutionRecord,
} from "../../../src/module-execution-record-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../../../src/traceability-graph.mjs";
import { promoteWorkDependencyBaseline } from "../../../src/work-dependency-gate.mjs";
import { createWorkDependencyAnalysisRuntime } from "../../../src/work-dependency-runtime.mjs";
import { workDependencyBaselineTraceabilityContributor } from "../../../src/work-dependency-traceability-contributor.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const REPLAY = new URL("./replay-v6/", import.meta.url);
const APPROVED = Object.freeze({
  candidate:
    "sha256:5009bf9189b801f34f58582ecfb6a7444abbdefd2a31ec957c866672e8086807",
  gateReview:
    "sha256:c35b3be93fae40c70720d721222187faeef1613037d86b18f13c291d8768601f",
  gateCandidate:
    "sha256:74c22ef41298a1ced28bfe14f3d3ad5f0a23c3c4843bddaecb8a3129fd8acd91",
  checkpoint:
    "sha256:bf07f72b90e740b21a35da041d5a82b6eb767c9bb74c3f3aca0a058082f17086",
  checkpointRaw:
    "sha256:5bd6ba7a202e4f214172657307ba4a63f8271d3a75023c7d052a05608ef0940e",
  repositorySnapshot:
    "sha256:1092f90bf5ebed8096dd12879a2511645b53116eb0d0b82483460053eee88481",
  repositoryRevision: "9cb4f2b8d340142557027fc0477440722d4f8286",
  repositoryTree:
    "sha256:b6d7beba6da3151dc15f4de0dd2a78a9d0edef3097b2f1e22039a6fb21275c61",
});

const CONTRACTS = Object.freeze({
  approval: {
    schema: "https://devrelay.dev/evidence/work-dependency-gate-approval/v1",
    mediaType: "application/vnd.devrelay.work-dependency-gate-approval+json",
  },
  baseline: {
    schema: "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
    mediaType: "application/vnd.devrelay.work-dependency-baseline+json",
  },
  gateCandidate: {
    schema: "https://devrelay.dev/gates/work-dependency-candidate/v1",
    mediaType: "application/json",
  },
  gateReview: {
    schema: "https://devrelay.dev/evidence/work-dependency-gate-review/v1",
    mediaType: "application/json",
  },
  executionCheckpoint: {
    schema: "https://devrelay.dev/evidence/work-dependency-execution-checkpoint/v1",
    mediaType: "application/json",
  },
  executionRecord: {
    schema: "https://devrelay.dev/contracts/module-execution-record.schema.json",
    mediaType: "application/vnd.devrelay.module-execution-record+json",
  },
  promotionProof: {
    schema: "https://devrelay.dev/evidence/work-dependency-gate-promotion/v1",
    mediaType: "application/json",
  },
  repositorySnapshot: {
    schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
    mediaType: "application/vnd.devrelay.repository-snapshot+json",
  },
});

function refFor({ artifactId, bytes, contract, uri }) {
  return {
    artifactId,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest: sha256Digest(bytes),
    uri,
  };
}

function sameArtifact(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function selfDigest(value, field) {
  const { [field]: ignored, ...material } = value;
  return { ...material, [field]: canonicalJsonDigest(material) };
}

async function loadedJson(relativePath, contract, artifactId) {
  const url = new URL(relativePath, ROOT);
  const bytes = await readFile(url);
  const value = JSON.parse(bytes);
  return {
    value,
    bytes,
    ref: refFor({
      artifactId,
      bytes,
      contract,
      uri: repositoryArtifactUriFromUrl(ROOT, url),
    }),
  };
}

async function writeExact(url, bytes) {
  const target = fileURLToPath(url);
  try {
    const existing = await readFile(target);
    if (!existing.equals(bytes)) {
      throw new Error(`immutable promotion artifact already differs: ${target}`);
    }
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.tmp`,
  );
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, target);
}

function exactDocument(value, artifactId, contract, url) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: refFor({
      artifactId,
      bytes,
      contract,
      uri: repositoryArtifactUriFromUrl(ROOT, url),
    }),
  };
}

const repositorySnapshot = await loadedJson(
  "dogfood/work-dependency-analysis/repository-snapshot.json",
  CONTRACTS.repositorySnapshot,
  "repository-snapshot-devrelay-9cb4f2b",
);
assert.equal(repositorySnapshot.ref.digest, APPROVED.repositorySnapshot);
const repositoryRevision = repositorySnapshot.value.revision;
assert.equal(repositoryRevision, APPROVED.repositoryRevision);
assert.equal(repositorySnapshot.value.treeDigest, APPROVED.repositoryTree);

const candidate = await loadedJson(
  "dogfood/work-dependency-analysis/dependency-analysis/work-dependency-candidate.json",
  {
    schema: "https://devrelay.dev/artifacts/work-dependency-candidate/v1",
    mediaType: "application/vnd.devrelay.work-dependency-candidate+json",
  },
  "WDC-94324FDFE6521CA0",
);
const gateReview = await loadedJson(
  "dogfood/work-dependency-analysis/dependency-analysis/work-dependency-gate-review.json",
  CONTRACTS.gateReview,
  "WDA-GATE-REVIEW-001",
);
const gateCandidate = await loadedJson(
  "dogfood/work-dependency-analysis/dependency-analysis/gate-candidate.json",
  CONTRACTS.gateCandidate,
  "WDA-GATE-CANDIDATE-001",
);
const checkpoint = await loadedJson(
  "dogfood/work-dependency-analysis/dependency-analysis/execution-checkpoint.json",
  CONTRACTS.executionCheckpoint,
  "WDA-DOGFOOD-001-CHECKPOINT",
);
assert.equal(candidate.ref.digest, APPROVED.candidate);
assert.equal(gateReview.ref.digest, APPROVED.gateReview);
assert.equal(gateCandidate.ref.digest, APPROVED.gateCandidate);
assert.equal(checkpoint.ref.digest, APPROVED.checkpointRaw);
assert.equal(checkpoint.value.checkpointDigest, APPROVED.checkpoint);
assert.equal(gateCandidate.value.terminalCheckpointDigest, APPROVED.checkpoint);
assert.ok(sameArtifact(gateCandidate.value.candidate, candidate.ref));
assert.ok(sameArtifact(gateCandidate.value.gateReview, gateReview.ref));
assert.equal(gateCandidate.value.repositoryRevision, repositoryRevision);

const approvalValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkDependencyGateApproval",
  approvalId: "WDA-GATE-OWNER-APPROVAL-001",
  authority: "project-owner",
  decision: "approve",
  candidate: checkpoint.value.artifacts.candidate.ref,
  policyVersion: "work-dependency-gate/0.1.0",
  requiredEvidence: [gateCandidate.ref, gateReview.ref, checkpoint.ref],
};
const approval = exactDocument(
  approvalValue,
  approvalValue.approvalId,
  CONTRACTS.approval,
  new URL("work-dependency-gate-owner-approval.json", OUTPUT),
);

const baselineValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkDependencyBaseline",
  baselineId: "WDB-WDA-DOGFOOD",
  version: "1.0.0",
  approvedCandidate: checkpoint.value.artifacts.candidate.ref,
  workBreakdownBaseline: checkpoint.value.inputBindings.find(
    ({ role }) => role === "work-breakdown-baseline",
  ).artifact,
  nodes: candidate.value.nodes,
  edges: candidate.value.edges,
  graphDigest: candidate.value.graphDigest,
  topologicalOrder: candidate.value.topologicalOrder,
  policyEvidence: checkpoint.value.artifacts.policyDecisionSet.ref,
  consistencyEvidence: checkpoint.value.artifacts.consistencyReview.ref,
  approvalEvidence: [approval.ref],
  sourceRefs: candidate.value.sourceRefs,
};
const projectBaselineUrl = new URL("project/work-dependency-baseline.json", ROOT);
const baseline = exactDocument(
  baselineValue,
  baselineValue.baselineId,
  CONTRACTS.baseline,
  projectBaselineUrl,
);

const storedCheckpoint = structuredClone(checkpoint.value);
const checkpointStore = {
  async get(key) {
    return key === storedCheckpoint.checkpointKey
      ? structuredClone(storedCheckpoint)
      : undefined;
  },
  async put() {
    throw new Error("promotion must not write or rerun the approved execution");
  },
};
const runtime = createWorkDependencyAnalysisRuntime({
  proposer: {
    id: checkpoint.value.adapters.proposer.id,
    version: checkpoint.value.adapters.proposer.version,
    async propose() {
      throw new Error("promotion must not call the proposer");
    },
  },
  reviewer: {
    id: checkpoint.value.adapters.reviewer.id,
    version: checkpoint.value.adapters.reviewer.version,
    async review() {
      throw new Error("promotion must not call the reviewer");
    },
  },
  entrypoint: checkpoint.value.policyEntrypoint,
});
const replayReceipt = await runtime.verifyCheckpointedExecution({
  executionId: checkpoint.value.executionId,
  executionFingerprint: checkpoint.value.executionFingerprint,
  checkpoints: checkpointStore,
});

const evidence = new Map(
  [gateCandidate, gateReview, checkpoint].map((entry) => [
    `${entry.ref.artifactId}\u0000${entry.ref.digest}`,
    entry,
  ]),
);
const commit = await promoteWorkDependencyBaseline({
  replayReceipt,
  baseline: baseline.value,
  baselineRef: baseline.ref,
  baselineBytes: baseline.bytes,
  approval,
  evidenceResolver: async (ref) =>
    evidence.get(`${ref.artifactId}\u0000${ref.digest}`),
});
assert.equal(commit.progressionAllowed, true);
assert.deepEqual(commit.baselineRef, baseline.ref);

const priorRecord = await loadedJson(
  "dogfood/work-dependency-analysis/work-breakdown/module-execution-record.json",
  CONTRACTS.executionRecord,
  "work-breakdown-decompose-wda-v1",
);
const priorGraphUrl = new URL(
  "dogfood/work-dependency-analysis/work-breakdown/traceability-graph-snapshot.json",
  ROOT,
);
const priorGraphBytes = await readFile(priorGraphUrl);
const priorGraphValue = JSON.parse(priorGraphBytes);
const priorGraphRef = priorRecord.value.mergeReceipt.snapshotRef;
const priorGraphCanonicalBytes = Buffer.from(canonicalJson(priorGraphValue), "utf8");
assert.equal(sha256Digest(priorGraphCanonicalBytes), priorGraphRef.digest);

const graphStore = createInMemoryTraceabilityStore();
graphStore.initialize(priorGraphValue.graphId, {
  ref: priorGraphRef,
  bytes: priorGraphCanonicalBytes,
  value: priorGraphValue,
});
const historicalUpdatePaths = [
  "dogfood/work-breakdown/work-breakdown/traceability-update.json",
  "dogfood/work-dependency-analysis/work-breakdown/traceability-update.json",
];
const historicalByDigest = new Map();
for (const relativePath of historicalUpdatePaths) {
  const value = JSON.parse(await readFile(new URL(relativePath, ROOT)));
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  const ref = priorGraphValue.appliedUpdates.find(
    (candidateRef) => candidateRef.digest === digest,
  );
  assert.ok(ref, `historical update ${relativePath} is not in graph lineage`);
  historicalByDigest.set(digest, { ref, bytes, value });
}
assert.equal(
  historicalByDigest.size,
  priorGraphValue.appliedUpdates.length,
  "every applied update must be restored exactly once",
);
assert.ok(
  historicalByDigest.has(priorRecord.value.traceabilityUpdateRef.digest),
  "the WorkBreakdown execution update must be present",
);
const updateEntries = priorGraphValue.appliedUpdates.map((ref) => {
  const entry = historicalByDigest.get(ref.digest);
  assert.ok(entry);
  return entry;
});
const restoredPriorMerge = graphStore.commit({
  graphId: priorGraphValue.graphId,
  expectedHead: priorGraphRef,
  artifacts: updateEntries,
  updateRef: priorRecord.value.traceabilityUpdateRef,
  result: priorRecord.value.mergeReceipt,
});
assert.ok(restoredPriorMerge);
const graph = createTraceabilityGraphService({
  graphId: priorGraphValue.graphId,
  projectId: priorGraphValue.projectId,
  store: graphStore,
  contributors: [workDependencyBaselineTraceabilityContributor],
});
const module = {
  id: "work-dependency-gate",
  version: "0.1.0",
  operation: "promote-baseline",
};
const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "work-dependency-gate-promote-wda-v1",
  runId: "work-dependency-gate-run-wda-v1",
  nodeId: "work-dependency-gate-node-wda-v1",
  module,
  inputs: {},
  options: {},
};
const invocationFingerprint = canonicalJsonDigest({ invocation });
const moduleResult = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId: invocation.invocationId,
  status: "completed",
  outcome: "promoted",
  outputs: { "work-dependency-baseline": [baseline.ref] },
  evidence: [
    {
      kind: "work-dependency/gate-promotion",
      subject: `work-dependency-baseline:${baseline.value.baselineId}`,
      status: "pass",
      artifact: baseline.ref,
      summary:
        "The exact owner-approved candidate was promoted without rerunning its proposer or reviewer.",
    },
  ],
  diagnostics: [],
};
const baseGraph = graph.captureBase();
const prepared = await graph.prepare({
  baseGraph,
  invocation,
  invocationFingerprint,
  moduleResult,
  loadedInputs: {},
  loadedOutputs: { "work-dependency-baseline": [baseline] },
});
assert.equal(prepared.update.edgeChanges.length, baseline.value.edges.length);
const mergeReceipt = await graph.mergePrepared(prepared);
const applicationProof = await graph.assertApplied(prepared.updateRef);
const graphAwareInvocationFingerprint = createGraphAwareInvocationFingerprint({
  invocationFingerprint,
  graphId: priorGraphValue.graphId,
  projectId: priorGraphValue.projectId,
  baseGraphRef: prepared.baseGraphRef,
});
const traceCheckpointKey = createTraceCheckpointKey({
  graphId: priorGraphValue.graphId,
  projectId: priorGraphValue.projectId,
  invocationId: invocation.invocationId,
  runId: invocation.runId,
  nodeId: invocation.nodeId,
  module,
  invocationFingerprint,
});
const executionContext = {
  approval: approval.ref,
  gateCandidate: gateCandidate.ref,
  terminalCheckpointDigest: APPROVED.checkpoint,
};
const traceCheckpoint = selfDigest(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleTraceabilityCheckpoint",
    traceCheckpointKey,
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module,
    invocationFingerprint,
    graphAwareInvocationFingerprint,
    graphId: priorGraphValue.graphId,
    projectId: priorGraphValue.projectId,
    baseGraphRef: prepared.baseGraphRef,
    moduleResult,
    moduleResultDigest: canonicalJsonDigest(moduleResult),
    executionContext,
    executionContextDigest: canonicalJsonDigest(executionContext),
    preparedCheckpoint: prepared.checkpoint,
    preparedCheckpointDigest: canonicalJsonDigest(prepared.checkpoint),
    updateRef: prepared.updateRef,
    updateRefDigest: canonicalJsonDigest(prepared.updateRef),
    updateDigest: canonicalJsonDigest(prepared.update),
  },
  "checkpointDigest",
);
const executionRecordValue = selfDigest(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleExecutionRecord",
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module,
    invocationFingerprint,
    graphAwareInvocationFingerprint,
    graphId: priorGraphValue.graphId,
    projectId: priorGraphValue.projectId,
    baseGraphRef: prepared.baseGraphRef,
    traceCheckpointKey,
    traceCheckpointDigest: traceCheckpoint.checkpointDigest,
    traceCheckpoint,
    moduleResult,
    traceabilityUpdate: prepared.update,
    traceabilityUpdateRef: prepared.updateRef,
    mergeReceipt,
    applicationProof,
  },
  "recordDigest",
);
validateModuleExecutionRecord(executionRecordValue);
const executionRecord = exactDocument(
  executionRecordValue,
  invocation.invocationId,
  CONTRACTS.executionRecord,
  new URL("module-execution-record.json", OUTPUT),
);

const promotionProofValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkDependencyGatePromotionProof",
  proofId: "WDA-GATE-PROMOTION-001",
  status: "promoted",
  approval: approval.ref,
  gateCandidate: gateCandidate.ref,
  approvedCandidate: candidate.ref,
  promotedBaseline: baseline.ref,
  workBreakdownBaseline: baseline.value.workBreakdownBaseline,
  terminalCheckpointDigest: APPROVED.checkpoint,
  gateCommitDigest: commit.commitDigest,
  traceability: {
    update: prepared.updateRef,
    traceCheckpointDigest: traceCheckpoint.checkpointDigest,
    mergeReceipt: mergeReceipt.receiptRef,
    resultingGraph: mergeReceipt.snapshotRef,
    moduleExecutionRecord: executionRecord.ref,
  },
  progression: {
    allowed: true,
    nextModule: "specialist-assignment",
  },
};
const promotionProof = exactDocument(
  promotionProofValue,
  promotionProofValue.proofId,
  CONTRACTS.promotionProof,
  new URL("work-dependency-gate-promotion-proof.json", OUTPUT),
);

const writes = [
  [new URL("work-dependency-gate-owner-approval.json", REPLAY), approval.bytes],
  [new URL("work-dependency-baseline.json", REPLAY), baseline.bytes],
  [new URL("traceability-update.json", REPLAY), Buffer.from(canonicalJson(prepared.update), "utf8")],
  [new URL("traceability-graph-snapshot.json", REPLAY), Buffer.from(canonicalJson(mergeReceipt.snapshot), "utf8")],
  [new URL("traceability-merge-receipt.json", REPLAY), Buffer.from(canonicalJson(mergeReceipt.receipt), "utf8")],
  [new URL("traceability-checkpoint.json", REPLAY), Buffer.from(canonicalJson(traceCheckpoint), "utf8")],
  [new URL("module-execution-record.json", REPLAY), executionRecord.bytes],
  [new URL("work-dependency-gate-promotion-proof.json", REPLAY), promotionProof.bytes],
];
for (const [url, bytes] of writes) await writeExact(url, bytes);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "WORK_DEPENDENCY_BASELINE_PROMOTED",
      approval: approval.ref.digest,
      baseline: baseline.ref.digest,
      gateCommit: commit.commitDigest,
      traceabilityUpdate: prepared.updateRef.digest,
      graphVersion: mergeReceipt.snapshot.vocabulary.version,
      graphRevision: mergeReceipt.snapshot.revision,
      resultingGraph: mergeReceipt.snapshotRef.digest,
      executionRecord: executionRecord.ref.digest,
      progression: promotionProof.value.progression,
    },
    null,
    2,
  )}\n`,
);

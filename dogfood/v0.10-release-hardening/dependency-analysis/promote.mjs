import assert from "node:assert/strict";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const OUTPUT = new URL("./replay-v4/", import.meta.url);
const APPROVED = Object.freeze({
  candidate: "sha256:3494cc5d35f7764ad41d167715c062c06b9482ea89f9b476f7d4d4c41ff2b045",
  gateReview: "sha256:300d61f88b7d83c4a56a07693e42566cb40d374c0d53bc21304d2523bbada8a9",
  gateCandidate: "sha256:87318d083a0ff39f7d084acf1e5989a250e67eb831be9c848ee940abb663fa63",
  checkpoint: "sha256:9a6c8b8dc8db4e2688e94b3d9397856823c49bc5c773a30db90a212c1d6e6b40",
  checkpointRaw: "sha256:ceb0f9a19398dcf980ed3570b003386962d0288fdeae26baeb70965fa5b2ca64",
  repositorySnapshot: "sha256:a0a7f32db9f68215d68b6bca04ef0800d808fd3d3862c51bbc904115eebf16a9",
  repositoryRevision: "a38d2ffde71b5226721a45fedf203c62fc093739",
  repositoryTree: "sha256:5511e51c26b863a4fe0d34c161d814ce859e41430742b6a0a7dd2dda28d8a23b",
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
      uri: pathToFileURL(fileURLToPath(url)).href,
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

async function preserveAndReplaceCurrent(bytes, currentUrl, historyUrl) {
  const currentPath = fileURLToPath(currentUrl);
  try {
    const current = await readFile(currentPath);
    if (current.equals(bytes)) return;
    await writeExact(historyUrl, current);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(currentPath), { recursive: true });
  await writeFile(currentPath, bytes);
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
      uri: pathToFileURL(fileURLToPath(url)).href,
    }),
  };
}

const repositorySnapshot = await loadedJson(
  "dogfood/v0.10-release-hardening/repository-snapshot.json",
  CONTRACTS.repositorySnapshot,
  "repository-snapshot-devrelay-a38d2ff-v010-release-hardening",
);
assert.equal(repositorySnapshot.ref.digest, APPROVED.repositorySnapshot);
const repositoryRevision = repositorySnapshot.value.revision;
assert.equal(repositoryRevision, APPROVED.repositoryRevision);
assert.equal(repositorySnapshot.value.treeDigest, APPROVED.repositoryTree);

const candidate = await loadedJson(
  "dogfood/v0.10-release-hardening/dependency-analysis/work-dependency-candidate.json",
  {
    schema: "https://devrelay.dev/artifacts/work-dependency-candidate/v1",
    mediaType: "application/vnd.devrelay.work-dependency-candidate+json",
  },
  "WDC-4A3A591A81F79D8C",
);
const gateReview = await loadedJson(
  "dogfood/v0.10-release-hardening/dependency-analysis/work-dependency-gate-review.json",
  CONTRACTS.gateReview,
  "WDA-REL-GATE-REVIEW-002",
);
const gateCandidate = await loadedJson(
  "dogfood/v0.10-release-hardening/dependency-analysis/gate-candidate.json",
  CONTRACTS.gateCandidate,
  "WDA-REL-GATE-CANDIDATE-002",
);
const checkpoint = await loadedJson(
  "dogfood/v0.10-release-hardening/dependency-analysis/execution-checkpoint.json",
  CONTRACTS.executionCheckpoint,
  "WDA-REL-DOGFOOD-002-CHECKPOINT",
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
  approvalId: "WDA-REL-GATE-OWNER-APPROVAL-003",
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
  baselineId: "WDB-REL-RELEASE-HARDENING-R3",
  version: "1.0.3",
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
  "dogfood/v0.10-release-hardening/work-breakdown/module-execution-record.json",
  CONTRACTS.executionRecord,
  "work-breakdown-decompose-v0.10-release-hardening-v1",
);
const priorGraphUrl = new URL(
  "dogfood/v0.10-release-hardening/work-breakdown/traceability-graph-snapshot.json",
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
  "project/history/traceability/updates/00920a6f6f2cf849510888a69a6e22cf1747c0889ac3d5d9d5226aff905d0b3c.json",
  "project/history/traceability/updates/4d7d052f347a91b104506510dc09dad51dceeb488bac5675a89ce7ca8af45067.json",
  "project/history/traceability/updates/d8fde060e3a21be13c5d90307dca6bda5a44e95055a31e292175dee99fabf37a.json",
  "project/history/traceability/updates/b9b77863db97ccfe1aa36c24224e5cd523030500908afb208b5883b24b6a8822.json",
  "dogfood/change-integration/work-breakdown/traceability-update.json",
  "project/history/traceability/updates/dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681.json",
  "dogfood/architecture-discovery/work-breakdown/traceability-update.json",
  "dogfood/lifecycle-run-report/work-breakdown/replay-v1/traceability-update.json",
  "dogfood/v0.10-release-hardening/work-breakdown/traceability-update.json",
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
  invocationId: "work-dependency-gate-promote-v0.10-release-hardening-v1",
  runId: "work-dependency-gate-run-v0.10-release-hardening-v1",
  nodeId: "work-dependency-gate-node-v0.10-release-hardening-v1",
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
  proofId: "WDA-REL-GATE-PROMOTION-003",
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
  [new URL("work-dependency-gate-owner-approval.json", OUTPUT), approval.bytes],
  [new URL("work-dependency-baseline.json", OUTPUT), baseline.bytes],
  [new URL("traceability-update.json", OUTPUT), Buffer.from(canonicalJson(prepared.update), "utf8")],
  [new URL("traceability-graph-snapshot.json", OUTPUT), Buffer.from(canonicalJson(mergeReceipt.snapshot), "utf8")],
  [new URL("traceability-merge-receipt.json", OUTPUT), Buffer.from(canonicalJson(mergeReceipt.receipt), "utf8")],
  [new URL("traceability-checkpoint.json", OUTPUT), Buffer.from(canonicalJson(traceCheckpoint), "utf8")],
  [new URL("module-execution-record.json", OUTPUT), executionRecord.bytes],
  [new URL("work-dependency-gate-promotion-proof.json", OUTPUT), promotionProof.bytes],
];
for (const [url, bytes] of writes) await writeExact(url, bytes);
const baselineHistory = new URL("project/history/work-dependency/WDB-RUN-DOGFOOD/1.0.1/", ROOT);
await preserveAndReplaceCurrent(
  baseline.bytes,
  projectBaselineUrl,
  new URL("work-dependency-baseline.json", baselineHistory),
);
const projectPromotionUrl = new URL(
  "project/work-dependency-promotion.commit.json",
  ROOT,
);
let promotionHistory = baselineHistory;
try {
  const currentPromotion = JSON.parse(await readFile(projectPromotionUrl, "utf8"));
  const previousBaselineId = currentPromotion.promotedBaseline?.artifactId;
  const previousProofId = currentPromotion.proofId;
  if (
    typeof previousBaselineId === "string" &&
    /^[A-Z0-9-]+$/u.test(previousBaselineId) &&
    typeof previousProofId === "string" &&
    /^[A-Z0-9-]+$/u.test(previousProofId)
  ) {
    promotionHistory = new URL(
      `project/history/work-dependency/${previousBaselineId}/${previousProofId}/`,
      ROOT,
    );
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await preserveAndReplaceCurrent(
  promotionProof.bytes,
  projectPromotionUrl,
  new URL("work-dependency-promotion.commit.json", promotionHistory),
);

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

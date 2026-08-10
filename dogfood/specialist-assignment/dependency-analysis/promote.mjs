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
const OUTPUT = new URL("./", import.meta.url);
const APPROVED = Object.freeze({
  candidate:
    "sha256:0229e3182c202f8ab9f75d9ff62f08affaa7b85ca550389112055c2e6de21667",
  gateReview:
    "sha256:806014023546569a7817c165921cb0cde5478565859dd334c27f799fcee79f1b",
  gateCandidate:
    "sha256:ce2757df68774df1dda528d29226f9b99d4627a8eb13c4e9266c5a4db1f49b8a",
  checkpoint:
    "sha256:4e21c268898f0fa66372642a2e7487fed86939c3e69851365c301b2b67b3ecaf",
  checkpointRaw:
    "sha256:75380c0ba7b4464b4c62d85112a330530e440979f861ca86b238a9fe395e183b",
  repositorySnapshot:
    "sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73",
  repositoryRevision: "4bda7fe707ba102bd22fe0001c83aa13ec03b0c5",
  repositoryTree:
    "sha256:6d27786016084029b7148e33d7200656366120cd986f046d32b9e406c12b33dd",
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
  "dogfood/specialist-assignment/repository-snapshot.json",
  CONTRACTS.repositorySnapshot,
  "repository-snapshot-devrelay-4bda7fe",
);
assert.equal(repositorySnapshot.ref.digest, APPROVED.repositorySnapshot);
const repositoryRevision = repositorySnapshot.value.revision;
assert.equal(repositoryRevision, APPROVED.repositoryRevision);
assert.equal(repositorySnapshot.value.treeDigest, APPROVED.repositoryTree);

const candidate = await loadedJson(
  "dogfood/specialist-assignment/dependency-analysis/work-dependency-candidate.json",
  {
    schema: "https://devrelay.dev/artifacts/work-dependency-candidate/v1",
    mediaType: "application/vnd.devrelay.work-dependency-candidate+json",
  },
  "WDC-76703409E4685143",
);
const gateReview = await loadedJson(
  "dogfood/specialist-assignment/dependency-analysis/work-dependency-gate-review.json",
  CONTRACTS.gateReview,
  "WDA-SA-GATE-REVIEW-001",
);
const gateCandidate = await loadedJson(
  "dogfood/specialist-assignment/dependency-analysis/gate-candidate.json",
  CONTRACTS.gateCandidate,
  "WDA-SA-GATE-CANDIDATE-001",
);
const checkpoint = await loadedJson(
  "dogfood/specialist-assignment/dependency-analysis/execution-checkpoint.json",
  CONTRACTS.executionCheckpoint,
  "WDA-SA-DOGFOOD-001-CHECKPOINT",
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
  approvalId: "WDA-SA-GATE-OWNER-APPROVAL-001",
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
  baselineId: "WDB-SA-DOGFOOD",
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
  "dogfood/specialist-assignment/work-breakdown/module-execution-record.json",
  CONTRACTS.executionRecord,
  "work-breakdown-decompose-specialist-assignment-v1",
);
const priorGraphUrl = new URL(
  "dogfood/specialist-assignment/work-breakdown/traceability-graph-snapshot.json",
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
  "dogfood/specialist-assignment/work-breakdown/traceability-update.json",
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
  invocationId: "work-dependency-gate-promote-specialist-assignment-v1",
  runId: "work-dependency-gate-run-specialist-assignment-v1",
  nodeId: "work-dependency-gate-node-specialist-assignment-v1",
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
  proofId: "WDA-SA-GATE-PROMOTION-001",
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
const history = new URL("project/history/work-dependency/1.0.0/", ROOT);
await preserveAndReplaceCurrent(baseline.bytes, projectBaselineUrl, new URL("work-dependency-baseline.json", history));
await preserveAndReplaceCurrent(promotionProof.bytes, new URL("project/work-dependency-promotion.commit.json", ROOT), new URL("work-dependency-promotion.commit.json", history));

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

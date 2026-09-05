import assert from "node:assert/strict";
import fs from "node:fs";

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
const OUTPUT = new URL("./promotion/", import.meta.url);
const APPROVED = Object.freeze({
  candidate: "sha256:428b2413a80b8fb15e36833b6b970a2a0f92a0ed17227decaa2794bb98738eff",
  gateReview: "sha256:3fcc1050f7617d943ab44eb64710c9a6f80eac6bf6e1201a707c874e22563e79",
  gateCandidate: "sha256:59387bcd3cb576963a5a68168ea444a6be19cdfcd7aa4aad769ad16b5198fb56",
  checkpoint: "sha256:73dbc340d64fc48dd39b3074341eee2770e4640a89d0cc66b8285e9ee47925b5",
  checkpointRaw: "sha256:7410dd60d8777b62fe383b27cb68d445531501baa6f89ccda54fc1220e88084a",
  repositorySnapshot: "sha256:6f0ecc8b5d8825b4705b467e97cf2f5a14e545c0fd1110b51fd7e69685cd8ad0",
  repositoryRevision: "1ff3cc4ebecf15aa9ed6a1629a480ef9c790fcd2",
  repositoryTree: "sha256:51d718b2ca00d12bc98d4c060ac2ab7d36fa9f382495302d0767bb719e506a37",
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
  "dogfood/rp-001-release-preparation/repository-snapshot.json",
  CONTRACTS.repositorySnapshot,
  "repository-snapshot-devrelay-1ff3cc4",
);
assert.equal(repositorySnapshot.ref.digest, APPROVED.repositorySnapshot);
const repositoryRevision = repositorySnapshot.value.revision;
assert.equal(repositoryRevision, APPROVED.repositoryRevision);
assert.equal(repositorySnapshot.value.treeDigest, APPROVED.repositoryTree);

const candidate = await loadedJson(
  "dogfood/rp-001-release-preparation/dependency-analysis/work-dependency-candidate.json",
  {
    schema: "https://devrelay.dev/artifacts/work-dependency-candidate/v1",
    mediaType: "application/vnd.devrelay.work-dependency-candidate+json",
  },
  "WDC-B7BF29C8A2AEFC43",
);
const gateReview = await loadedJson(
  "dogfood/rp-001-release-preparation/dependency-analysis/work-dependency-gate-review.json",
  CONTRACTS.gateReview,
  "WDA-GATE-REVIEW-RP-001-001",
);
const gateCandidate = await loadedJson(
  "dogfood/rp-001-release-preparation/dependency-analysis/gate-candidate.json",
  CONTRACTS.gateCandidate,
  "WDA-GATE-CANDIDATE-RP-001-001",
);
const checkpoint = await loadedJson(
  "dogfood/rp-001-release-preparation/dependency-analysis/execution-checkpoint.json",
  CONTRACTS.executionCheckpoint,
  "WDA-RP-001-001-CHECKPOINT",
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
  approvalId: "WDA-GATE-OWNER-APPROVAL-RP-001-001",
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
  baselineId: "WDB-RP-001-001",
  version: "2.4.0",
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
  "dogfood/rp-001-release-preparation/work-breakdown/module-execution-record.json",
  CONTRACTS.executionRecord,
  "work-breakdown-decompose-rp-001-v1",
);
const priorGraphUrl = new URL(
  "dogfood/rp-001-release-preparation/work-breakdown/traceability-graph-snapshot.json",
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
function sortedJsonFiles(rootPath) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(next);
    }
  }
  visit(rootPath);
  return files;
}
const historicalByDigest = new Map();
const wantedPriorUpdates = new Set(priorGraphValue.appliedUpdates.map(({ digest }) => digest));
for (const searchRoot of [fileURLToPath(new URL("dogfood/", ROOT)), fileURLToPath(new URL("project/history/", ROOT))]) {
  for (const sourcePath of sortedJsonFiles(searchRoot)) {
    let value;
    try { value = JSON.parse(fs.readFileSync(sourcePath)); } catch { continue; }
    if (value.kind !== "TraceabilityUpdate") continue;
    const bytes = Buffer.from(canonicalJson(value), "utf8");
    const digest = sha256Digest(bytes);
    const ref = priorGraphValue.appliedUpdates.find((candidateRef) => candidateRef.digest === digest);
    if (ref && !historicalByDigest.has(digest)) historicalByDigest.set(digest, { ref, bytes, value });
  }
}
assert.equal(historicalByDigest.size, priorGraphValue.appliedUpdates.length, "every applied update must be restored exactly once");
assert.ok(historicalByDigest.has(priorRecord.value.traceabilityUpdateRef.digest), "the WorkBreakdown execution update must be present");
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
  vocabulary: priorGraphValue.vocabulary,
});
const module = {
  id: "work-dependency-gate",
  version: "0.1.0",
  operation: "promote-baseline",
};
const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "work-dependency-gate-promote-rp-001-v1",
  runId: "work-dependency-gate-run-rp-001-v1",
  nodeId: "work-dependency-gate-node-rp-001-v1",
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
assert.deepEqual(
  mergeReceipt.snapshot.vocabulary,
  priorGraphValue.vocabulary,
  "dependency promotion must preserve the predecessor graph vocabulary",
);
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
  proofId: "WDA-GATE-PROMOTION-RP-001-001",
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
const baselineHistory = new URL("project/history/work-dependency/WDB-EP-001-001/WDA-GATE-PROMOTION-EP-001-001/", ROOT);
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

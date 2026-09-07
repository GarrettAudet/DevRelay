import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/qc-001-quality-continuity/project-memory-closeout";
const taskId = "QC-001-RELEASE-SEAL";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const implementationCommit = "779e6aa341b93aca99ff33177f95742284f6d606";
const effectiveAt = "2026-09-07T06:30:00.000Z";
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));
const canonicalBytes = (value, newline = true) => Buffer.from(`${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8");
const writeJson = (relative, value, newline = true) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalBytes(value, newline));
};
const writeBytes = (relative, value) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};
const ref = (artifactId, relative, schema) => {
  const digest = api.sha256Digest(read(relative));
  return {
    artifactId,
    schema,
    mediaType: "application/json",
    digest,
    uri: `memory://devrelay/qc-001/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json`,
  };
};
const source = (role, artifact) => ({ role, artifact });

const baseValue = json("project/history/project-memory/1.0.7/project-memory-baseline.json");
const base = api.loadProjectMemoryArtifact(baseValue);
assert.equal(baseValue.version, "1.0.7");
const acceptanceRef = ref(
  "QC-001-BUSINESS-ACCEPTANCE-001",
  "dogfood/qc-001-quality-continuity/verification/business-acceptance.json",
  "https://devrelay.dev/evidence/quality-continuity/v1",
);
const systemVerificationRef = ref(
  "QC-001-SYSTEM-VERIFICATION-001",
  "dogfood/qc-001-quality-continuity/verification/system-verification.json",
  "https://devrelay.dev/evidence/quality-continuity/v1",
);
const bootstrapReceipt = {
  apiVersion: API,
  kind: "DesktopProjectMemoryBootstrapReceipt",
  receiptId: "DPMBR-30A664E0473BF7E5",
  projectId: "devrelay",
  taskId,
  repositoryRevision: implementationCommit,
  loadOrder: ["current-synopsis", "project-memory-baseline", "promotion-proof", "traceability-graph"],
  projectMemoryBaseline: {
    artifactId: "PMB-MUC-38E72BBE2741C0CF",
    schema: "https://devrelay.dev/artifacts/project-memory-baseline/v1",
    mediaType: "application/vnd.devrelay.project-memory-baseline+json",
    digest: "sha256:14ebd552fc35250c9c38679ef517e7ce8706c3f741e614a405acdf5d0a1016d2",
    uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-baseline.json",
  },
  synopsisProjection: {
    artifactId: "CURRENT-SYNOPSIS-PMB-MUC-38E72BBE2741C0CF",
    schema: "https://devrelay.dev/artifacts/current-synopsis/v1",
    mediaType: "text/markdown",
    digest: "sha256:a0f4acd5cfda48a570574701025620c59f71613745174ff4d62627a64779ee4e",
    uri: "memory://devrelay/project-memory/synopsis/a0f4acd5cfda48a570574701025620c59f71613745174ff4d62627a64779ee4e.md",
  },
  graphCheckpoint: baseValue.graphCheckpoint,
  promotionProof: {
    artifactId: "PMGP-E923ED3C47687A65",
    schema: "https://devrelay.dev/evidence/project-memory-gate-promotion/v1",
    mediaType: "application/vnd.devrelay.project-memory-gate-promotion+json",
    digest: "sha256:038eb99a6d5cda34a98109e7ecfc7851ba75df13f03d7e09df466041ec448bb5",
    uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-promotion.commit.json",
  },
  activeMemoryIds: baseValue.records.filter(({ status }) => ["active", "retained"].includes(status)).map(({ id }) => id).sort(),
  outcome: "pass",
  receiptDigest: "sha256:efb81dacfe29881fa41354b3dc9156781f180827d37be650a9c7d253492ce1f9",
};
assert.equal(api.sha256Digest(canonicalBytes(bootstrapReceipt, false)), "sha256:4caeda2adcecbe19528e93db552d3b4b078ccc5950c80798691e4a157daabdb5");
const bootstrapReceiptRef = {
  artifactId: bootstrapReceipt.receiptId,
  digest: "sha256:4caeda2adcecbe19528e93db552d3b4b078ccc5950c80798691e4a157daabdb5",
  schema: "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1",
  mediaType: "application/json",
  uri: "memory://devrelay/desktop-bootstrap/DPMBR-30A664E0473BF7E5/4caeda2adcecbe19528e93db552d3b4b078ccc5950c80798691e4a157daabdb5.json",
};
writeJson(`${out}/00-project-memory-bootstrap-receipt.json`, bootstrapReceipt, false);

const sharedSources = [source("business-acceptance", acceptanceRef), source("system-verification", systemVerificationRef)];
const acceptedStatus = {
  id: "MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE",
  category: "status",
  statement: "DevRelay 0.11.0-rc.2 Quality Continuity is implementation-sealed at commit 779e6aa341b93aca99ff33177f95742284f6d606 and system-verified with 1,191 tests, 1,189 passing, zero failures, and two intentional skips; Desktop end-to-end proof covers worktrees, exact reuse, independent quality evidence, read-only project control, and fresh-task ProjectMemory recovery.",
  authority: "validated-status",
  status: "active",
  effectiveAt,
  domain: "acceptance",
  sourceRefs: sharedSources,
};
const change = {
  changeId: "CHANGE-QC001-RC2-STATUS-ADD",
  disposition: "add",
  qualitative: false,
  domain: "acceptance",
  proposedMemory: acceptedStatus,
  rationale: "Record the exact accepted candidate without claiming integration or publication.",
  sourceRefs: sharedSources,
};
const candidateValue = api.createMemoryUpdateCandidate({
  projectId: "devrelay",
  sessionId,
  taskId,
  baseBaseline: base.ref,
  baseGraphCheckpoint: baseValue.graphCheckpoint,
  producerType: "main",
  changes: [change],
  sourceRefs: [...sharedSources, source("desktop-memory-bootstrap", bootstrapReceiptRef)],
});
const candidate = api.loadProjectMemoryArtifact(candidateValue);
const routes = api.resolveMemoryChangeRoutes(candidateValue);
assert.deepEqual(routes.map(({ nextModule }) => nextModule), ["project-memory-gate"]);
const conclusionValue = api.createSessionConclusion({
  projectId: "devrelay",
  sessionId,
  taskId,
  producerType: "main",
  startingBaseline: base.ref,
  startingGraphCheckpoint: baseValue.graphCheckpoint,
  contextReceipt: bootstrapReceiptRef,
  completedArtifacts: [acceptanceRef, systemVerificationRef],
  evidence: [acceptanceRef, systemVerificationRef, bootstrapReceiptRef],
  pendingDecisions: [],
  memoryCandidate: candidate.ref,
});
const terminalCheckpointDigest = api.canonicalJsonDigest({ conclusion: conclusionValue.contentDigest, acceptance: acceptanceRef, implementationCommit });
const approvalValue = api.createProjectMemoryGateApproval({
  candidate: candidateValue,
  candidateRef: candidate.ref,
  terminalCheckpointDigest,
  decisions: [{
    changeId: change.changeId,
    decision: "approve",
    rationale: "The project owner explicitly approved all in-scope implementation and asked execution to proceed through completion.",
  }],
});
const providerValue = api.withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "MemoryProviderReceipt",
  receiptId: "MPR-QC001-NATIVE-EQUIVALENT-001",
  providerId: "devrelay.native-project-memory",
  providerVersion: "1.0.0",
  operation: "synchronize",
  namespace: "project/devrelay",
  configurationDigest: api.canonicalJsonDigest({ provider: "devrelay.native-project-memory", policy: "exact-baseline-equivalence" }),
  inputCheckpoints: [base.ref, candidate.ref],
  commandFingerprint: api.canonicalJsonDigest({ operation: "synchronize", baseline: base.ref, candidate: candidate.ref }),
  outcome: "native-equivalent",
  durationMs: 0,
  replayed: false,
  citations: [],
  outputDigest: api.canonicalJsonDigest([change]),
});
const provider = api.loadProjectMemoryArtifact(providerValue);
let commits = 0;
let committed;
const coordinator = api.createProjectMemoryConclusionCoordinator({
  commitAtomic: async ({ expectedBaseline, baseline, synopsis, proof }) => {
    assert.deepEqual(expectedBaseline, base.ref);
    commits += 1;
    committed = { baseline, synopsis, proof };
    return { committed: true };
  },
});
const concludeInput = {
  conclusion: conclusionValue,
  candidate: candidateValue,
  candidateRef: candidate.ref,
  approval: approvalValue,
  baseBaseline: base.value,
  baseBaselineRef: base.ref,
  providerSyncReceipt: providerValue,
  providerSyncReceiptRef: provider.ref,
  resultGraphCheckpoint: baseValue.graphCheckpoint,
  sourceRefs: [...sharedSources, source("desktop-memory-bootstrap", bootstrapReceiptRef), source("provider-equivalence", provider.ref)],
};
const concluded = await coordinator.conclude(concludeInput);
const replayed = await coordinator.conclude(concludeInput);
assert.equal(concluded.outcome, "concluded");
assert.equal(replayed.replayed, true);
assert.equal(commits, 1);
assert.equal(committed.baseline.value.version, "1.0.8");
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === acceptedStatus.id && status === "active"), true);

const traceValue = json("dogfood/ep-001-environment-preparation/final-conclusion/00-traceability-context-projection.json");
const trace = api.loadProjectMemoryArtifact(traceValue);
assert.deepEqual(traceValue.graphCheckpoint, baseValue.graphCheckpoint);
const artifacts = new Map([
  [committed.baseline.ref.digest, committed.baseline],
  [committed.synopsis.ref.digest, { ref: committed.synopsis.ref, bytes: committed.synopsis.bytes }],
  [trace.ref.digest, trace],
]);
let tick = 0;
const runtime = api.createProjectMemoryRuntime({ provider: null, monotonicNow: () => ++tick });
const bootstrap = api.createProjectMemoryContextBootstrap({
  loadArtifact: async (artifact) => artifacts.get(artifact.digest),
  runtime,
  clock: () => "2026-09-07T06:35:00.000Z",
  monotonicNow: () => ++tick,
});
const freshRequest = {
  executionId: "QC001-FRESH-TASK-AFTER-CONCLUDE",
  operation: "load-context",
  projectId: "devrelay",
  sessionId: "SESSION-QC001-NEXT",
  taskId: "TASK-QC001-NEXT",
  workspaceId: "WORKSPACE-DEVRELAY",
  repositoryRevision: implementationCommit,
  moduleId: "release-preparation",
  moduleInvocationId: "INV-QC001-NEXT-RELEASE",
  projectMemoryBaseline: committed.baseline.ref,
  synopsisProjection: committed.synopsis.ref,
  traceabilityProjection: trace.ref,
  query: "QC-001 0.11.0-rc.2 quality continuity candidate status",
};
const fresh = await bootstrap.load(freshRequest);
const freshReplay = await bootstrap.load(freshRequest);
assert.equal(freshReplay.replayed, true);
assert.equal(freshReplay.providerReceipt.value.outcome, "native-equivalent");
assert.equal(freshReplay.bundle.value.items.some(({ memoryId }) => memoryId === acceptedStatus.id), true);
const session = api.createProjectMemorySessionState({
  projectId: "devrelay",
  sessionId,
  taskId,
  status: "concluded",
  baseline: committed.baseline.ref,
  graphCheckpoint: baseValue.graphCheckpoint,
  lastCheckpointDigest: concluded.receipt.resultingCheckpointDigest,
  updatedAt: "2026-09-07T06:35:00.000Z",
});
const outputs = [
  ["01-memory-update-candidate.json", candidateValue],
  ["02-memory-change-routes.json", { apiVersion: API, kind: "ProjectMemoryChangeRoutes", routes }],
  ["03-session-conclusion.json", conclusionValue],
  ["04-project-memory-gate-approval.json", approvalValue],
  ["05-provider-native-equivalence-receipt.json", providerValue],
  ["06-project-memory-baseline.json", committed.baseline.value],
  ["07-project-memory-gate-promotion-proof.json", committed.proof],
  ["08-conclude-receipt.json", concluded.receipt],
  ["09-project-memory-session-state.json", session],
  ["10-fresh-task-context-load-receipt.json", fresh.receipt],
  ["11-fresh-task-provider-receipt.json", fresh.providerReceipt.value],
  ["12-fresh-task-memory-context-bundle.json", fresh.bundle.value],
  ["13-fresh-task-replay-proof.json", {
    apiVersion: API,
    kind: "ProjectMemoryFreshTaskReplayProof",
    firstReplayed: fresh.replayed,
    replayed: freshReplay.replayed,
    replayProviderCalls: 0,
    loadOrder: fresh.receipt.loadOrder,
    baseline: committed.baseline.ref,
    synopsis: committed.synopsis.ref,
    graphCheckpoint: baseValue.graphCheckpoint,
    recoveredMemoryIds: [acceptedStatus.id],
    outcome: "pass",
  }],
];
for (const [name, value] of outputs) writeJson(`${out}/${name}`, value);
writeBytes(`${out}/CurrentSynopsis.md`, committed.synopsis.bytes);
writeJson("project/project-memory-baseline.json", committed.baseline.value, false);
writeBytes("project/CurrentSynopsis.md", committed.synopsis.bytes);
writeJson("project/project-memory-promotion.commit.json", committed.proof);
writeJson("project/project-memory-session-state.json", session);
writeJson("project/project-memory-context-load-receipt.json", fresh.receipt);
writeJson(`project/history/project-memory/${committed.baseline.value.version}/project-memory-baseline.json`, committed.baseline.value, false);
writeBytes(`project/history/project-memory/${committed.baseline.value.version}/CurrentSynopsis.md`, committed.synopsis.bytes);
const summary = {
  apiVersion: API,
  kind: "QualityContinuityMemoryCloseoutSummary",
  taskId,
  implementationCommit,
  baseBaseline: base.ref,
  bootstrapReceipt: bootstrapReceiptRef,
  candidate: candidate.ref,
  approval: api.loadProjectMemoryArtifact(approvalValue).ref,
  resultBaseline: committed.baseline.ref,
  synopsis: committed.synopsis.ref,
  concludeReceipt: api.loadProjectMemoryArtifact(concluded.receipt).ref,
  graphCheckpoint: baseValue.graphCheckpoint,
  atomicCommits: commits,
  replayAtomicCommits: 0,
  freshTaskLoadOrder: fresh.receipt.loadOrder,
  freshTaskReplayed: freshReplay.replayed,
  freshTaskProviderOutcome: freshReplay.providerReceipt.value.outcome,
  recoveredMemoryIds: [acceptedStatus.id],
  outcome: "pass",
};
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeJson(`${out}/14-closeout-summary.json`, summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

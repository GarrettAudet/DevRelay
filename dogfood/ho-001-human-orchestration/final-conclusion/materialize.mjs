import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/ho-001-human-orchestration/final-conclusion";
const taskId = "HO-001-RELEASE-SEAL";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const implementationCommit = "119c08560273657f8d1720c9e459c033313faf50";
const effectiveAt = "2026-09-10T01:00:00.000Z";
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));
const canonicalBytes = (value, newline = true) => Buffer.from(`${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8");
const writeJson = (relative, value, newline = true) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalBytes(value, newline));
};
const writeBytes = (relative, bytes) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
};
const evidenceRef = (artifactId, relative, schema) => ({
  artifactId,
  schema,
  mediaType: "application/json",
  digest: api.sha256Digest(read(relative)),
  uri: `memory://devrelay/ho-001/${encodeURIComponent(artifactId)}.json`,
});
const source = (role, artifact) => ({ role, artifact });

const baseValue = json("project/history/project-memory/1.0.9/project-memory-baseline.json");
const base = api.loadProjectMemoryArtifact(baseValue);
assert.equal(baseValue.version, "1.0.9");

const systemVerificationRef = evidenceRef(
  "HO-001-SYSTEM-VERIFICATION-001",
  "dogfood/ho-001-human-orchestration/verification/system-verification.json",
  "https://devrelay.dev/evidence/human-orchestration/v1",
);
const businessAcceptanceRef = evidenceRef(
  "HO-001-BUSINESS-ACCEPTANCE-001",
  "dogfood/ho-001-human-orchestration/verification/business-acceptance.json",
  "https://devrelay.dev/evidence/human-orchestration/v1",
);

const bootstrapReceipt = {
  apiVersion: API,
  kind: "DesktopProjectMemoryBootstrapReceipt",
  receiptId: "DPMBR-A4AD0B51685CB1AA",
  projectId: "devrelay",
  taskId,
  repositoryRevision: implementationCommit,
  loadOrder: ["current-synopsis", "project-memory-baseline", "promotion-proof", "traceability-graph"],
  projectMemoryBaseline: {
    artifactId: "PMB-MUC-A061019F06AC2E7A",
    schema: "https://devrelay.dev/artifacts/project-memory-baseline/v1",
    mediaType: "application/vnd.devrelay.project-memory-baseline+json",
    digest: "sha256:ccabb39cebb22d8d6fa6562657c8b8826a4484d51390a93f1d9cc42a6ece36e5",
    uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-baseline.json",
  },
  synopsisProjection: {
    artifactId: "CURRENT-SYNOPSIS-PMB-MUC-A061019F06AC2E7A",
    schema: "https://devrelay.dev/artifacts/current-synopsis/v1",
    mediaType: "text/markdown",
    digest: "sha256:52112dafbddfc0f244475a1981b615cf0b57274494b91daac981dab2cef80f1a",
    uri: "memory://devrelay/project-memory/synopsis/52112dafbddfc0f244475a1981b615cf0b57274494b91daac981dab2cef80f1a.md",
  },
  graphCheckpoint: baseValue.graphCheckpoint,
  promotionProof: {
    artifactId: "PMGP-9DBA01493AB9727E",
    schema: "https://devrelay.dev/evidence/project-memory-gate-promotion/v1",
    mediaType: "application/vnd.devrelay.project-memory-gate-promotion+json",
    digest: "sha256:309958017357d85318dae5dc522eb1d8dad3a3f22d82e8e11f81c761e86d430f",
    uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-promotion.commit.json",
  },
  activeMemoryIds: baseValue.records.filter(({ status }) => ["active", "retained"].includes(status)).map(({ id }) => id).sort(),
  outcome: "pass",
  receiptDigest: "sha256:5c5db989e5f034cd8a85683987b2a67f3137681ca53c9469e8072798dd5f39b9",
};
const bootstrapReceiptRef = {
  artifactId: bootstrapReceipt.receiptId,
  digest: api.sha256Digest(canonicalBytes(bootstrapReceipt, false)),
  schema: "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1",
  mediaType: "application/json",
  uri: "memory://devrelay/desktop-bootstrap/DPMBR-A4AD0B51685CB1AA/c86875788528512ac11139ddfdc4d1aae8503ed16bd3b23325c357344143f2b7.json",
};
assert.equal(bootstrapReceiptRef.digest, "sha256:c86875788528512ac11139ddfdc4d1aae8503ed16bd3b23325c357344143f2b7");

const sharedSources = [
  source("system-verification", systemVerificationRef),
  source("business-acceptance", businessAcceptanceRef),
];
const acceptedStatus = {
  id: "MEM-DEVRELAY-STATUS-HO001-RC3-CANDIDATE",
  category: "status",
  statement: "DevRelay 0.11.0-rc.3 Human Orchestration is implementation-sealed at commit 119c08560273657f8d1720c9e459c033313faf50 and system-verified with 1,204 tests, 1,202 passing, zero failures, and two intentional skips; the deterministic operator view covers agents, sub-agents, dependency queues, blockers, quality, approvals, worktrees, and ProjectMemory, while nine typed interventions retain their existing owning authorities.",
  authority: "validated-status",
  status: "active",
  effectiveAt,
  domain: "acceptance",
  sourceRefs: sharedSources,
};
const nextAction = {
  id: "MEM-DEVRELAY-NEXT-AFTER-HO001",
  category: "next-action",
  statement: "Review the HO-001 protected-branch pull request and its checks, then separately authorize merge and publication of DevRelay 0.11.0-rc.3 if the exact release candidate remains green.",
  authority: "validated-status",
  status: "active",
  effectiveAt,
  domain: "roadmap",
  sourceRefs: sharedSources,
};
const statusChange = {
  changeId: "CHANGE-HO001-RC3-STATUS-ADD",
  disposition: "add",
  qualitative: false,
  domain: "acceptance",
  proposedMemory: acceptedStatus,
  rationale: "Record the exact accepted candidate without claiming protected-main integration or publication.",
  sourceRefs: sharedSources,
};
const pendingRoadmapChange = {
  changeId: "CHANGE-HO001-NEXT-ACTION-REPLACE",
  disposition: "replace",
  qualitative: false,
  domain: "roadmap",
  targetMemoryId: "MEM-DEVRELAY-NEXT-AFTER-DO001",
  proposedMemory: nextAction,
  rationale: "Retire the obsolete rc.1 publication action only through the owning RoadmapManagement boundary.",
  sourceRefs: sharedSources,
};

const candidateValue = api.createMemoryUpdateCandidate({
  projectId: "devrelay",
  sessionId,
  taskId,
  baseBaseline: base.ref,
  baseGraphCheckpoint: baseValue.graphCheckpoint,
  producerType: "main",
  changes: [statusChange],
  sourceRefs: [...sharedSources, source("desktop-memory-bootstrap", bootstrapReceiptRef)],
});
const candidate = api.loadProjectMemoryArtifact(candidateValue);
const pendingRoadmapCandidateValue = api.createMemoryUpdateCandidate({
  projectId: "devrelay",
  sessionId,
  taskId,
  baseBaseline: base.ref,
  baseGraphCheckpoint: baseValue.graphCheckpoint,
  producerType: "main",
  changes: [pendingRoadmapChange],
  sourceRefs: [...sharedSources, source("desktop-memory-bootstrap", bootstrapReceiptRef)],
});
const routes = [
  ...api.resolveMemoryChangeRoutes(candidateValue),
  ...api.resolveMemoryChangeRoutes(pendingRoadmapCandidateValue),
].sort((left, right) => left.changeId.localeCompare(right.changeId, "en"));
assert.deepEqual(routes.map(({ changeId, nextModule }) => [changeId, nextModule]), [
  ["CHANGE-HO001-NEXT-ACTION-REPLACE", "roadmap-management"],
  ["CHANGE-HO001-RC3-STATUS-ADD", "project-memory-gate"],
]);

const conclusionValue = api.createSessionConclusion({
  projectId: "devrelay",
  sessionId,
  taskId,
  producerType: "main",
  startingBaseline: base.ref,
  startingGraphCheckpoint: baseValue.graphCheckpoint,
  contextReceipt: bootstrapReceiptRef,
  completedArtifacts: [businessAcceptanceRef, systemVerificationRef],
  evidence: [...sharedSources.map(({ artifact }) => artifact), bootstrapReceiptRef],
  pendingDecisions: [pendingRoadmapChange.changeId],
  memoryCandidate: candidate.ref,
});
const terminalCheckpointDigest = api.canonicalJsonDigest({
  conclusion: conclusionValue.contentDigest,
  implementationCommit,
  systemVerification: systemVerificationRef,
  businessAcceptance: businessAcceptanceRef,
});
const approvalValue = api.createProjectMemoryGateApproval({
  candidate: candidateValue,
  candidateRef: candidate.ref,
  terminalCheckpointDigest,
  decisions: [{
    changeId: statusChange.changeId,
    decision: "approve",
    rationale: "The project owner approved the proposed modules and repeatedly directed implementation to proceed; this records only the verified candidate status.",
  }],
});
const providerValue = api.withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "MemoryProviderReceipt",
  receiptId: "MPR-HO001-NATIVE-EQUIVALENT-001",
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
  outputDigest: api.canonicalJsonDigest([statusChange]),
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
assert.equal(committed.baseline.value.version, "1.0.10");
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === acceptedStatus.id && status === "active"), true);
assert.equal(committed.baseline.value.records.some(({ id }) => id === nextAction.id), false);

const traceValue = json("dogfood/ep-001-environment-preparation/final-conclusion/00-traceability-context-projection.json");
const trace = api.loadProjectMemoryArtifact(traceValue);
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
  clock: () => "2026-09-10T01:05:00.000Z",
  monotonicNow: () => ++tick,
});
const freshRequest = {
  executionId: "HO001-FRESH-TASK-AFTER-CONCLUDE",
  operation: "load-context",
  projectId: "devrelay",
  sessionId: "SESSION-HO001-NEXT",
  taskId: "TASK-HO001-NEXT",
  workspaceId: "WORKSPACE-DEVRELAY",
  repositoryRevision: implementationCommit,
  moduleId: "roadmap-management",
  moduleInvocationId: "INV-HO001-NEXT-ROADMAP",
  projectMemoryBaseline: committed.baseline.ref,
  synopsisProjection: committed.synopsis.ref,
  traceabilityProjection: trace.ref,
  query: "Human Orchestration rc.3 candidate status and next routed action",
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
  updatedAt: "2026-09-10T01:05:00.000Z",
});
const outputs = [
  ["00-project-memory-bootstrap-receipt.json", bootstrapReceipt, false],
  ["01-memory-update-candidate.json", candidateValue],
  ["02-pending-roadmap-memory-candidate.json", pendingRoadmapCandidateValue],
  ["03-memory-change-routes.json", { apiVersion: API, kind: "ProjectMemoryChangeRoutes", routes }],
  ["04-session-conclusion.json", conclusionValue],
  ["05-project-memory-gate-approval.json", approvalValue],
  ["06-provider-native-equivalence-receipt.json", providerValue],
  ["07-project-memory-baseline.json", committed.baseline.value],
  ["08-project-memory-gate-promotion-proof.json", committed.proof],
  ["09-conclude-receipt.json", concluded.receipt],
  ["10-project-memory-session-state.json", session],
  ["11-fresh-task-context-load-receipt.json", fresh.receipt],
  ["12-fresh-task-provider-receipt.json", fresh.providerReceipt.value],
  ["13-fresh-task-memory-context-bundle.json", fresh.bundle.value],
  ["14-fresh-task-replay-proof.json", {
    apiVersion: API,
    kind: "ProjectMemoryFreshTaskReplayProof",
    replayed: freshReplay.replayed,
    replayProviderCalls: 0,
    baseline: committed.baseline.ref,
    synopsis: committed.synopsis.ref,
    graphCheckpoint: baseValue.graphCheckpoint,
    recoveredMemoryIds: [acceptedStatus.id],
    pendingRoadmapChangeId: pendingRoadmapChange.changeId,
    outcome: "pass",
  }],
];
for (const [name, value, newline] of outputs) writeJson(`${out}/${name}`, value, newline ?? true);
writeBytes(`${out}/CurrentSynopsis.md`, committed.synopsis.bytes);
writeJson(`${out}/15-final-conclusion-summary.json`, {
  apiVersion: API,
  kind: "HumanOrchestrationFinalConclusionSummary",
  implementationCommit,
  baseline: committed.baseline.ref,
  synopsis: committed.synopsis.ref,
  graphCheckpoint: baseValue.graphCheckpoint,
  acceptedMemoryId: acceptedStatus.id,
  pendingRoadmapChangeId: pendingRoadmapChange.changeId,
  replayProviderCalls: 0,
  outcome: "pass",
});

writeJson("project/project-memory-baseline.json", committed.baseline.value, false);
writeBytes("project/CurrentSynopsis.md", committed.synopsis.bytes);
writeJson("project/project-memory-promotion.commit.json", committed.proof);
writeJson("project/project-memory-context-load-receipt.json", fresh.receipt);
writeJson("project/project-memory-session-state.json", session);

console.log(JSON.stringify({
  outcome: "pass",
  implementationCommit,
  baselineId: committed.baseline.value.baselineId,
  baselineVersion: committed.baseline.value.version,
  baselineDigest: committed.baseline.ref.digest,
  synopsisDigest: committed.synopsis.ref.digest,
  graphCheckpointDigest: baseValue.graphCheckpoint.digest,
  pendingRoadmapChangeId: pendingRoadmapChange.changeId,
  replayProviderCalls: 0,
}, null, 2));

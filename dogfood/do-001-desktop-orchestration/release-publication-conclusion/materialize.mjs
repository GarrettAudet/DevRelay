import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/do-001-desktop-orchestration/release-publication-conclusion";
const at = "2026-09-06T13:02:40.000Z";
const protectedMainCommit = "08be8385966223d16a20150ac804505b5fe40153";
const testedHead = "1e569ac1b8046ae4febe11171863c87d2ef64e70";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const taskId = "ATT-DO001-RELEASE-PUBLISH-006";
const bytes = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(bytes(relative));
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
const ref = (artifactId, digest, schema, mediaType = "application/json", namespace = "do-001-publication") => ({
  artifactId,
  schema,
  mediaType,
  digest,
  uri: `memory://devrelay/${namespace}/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json`,
});
const source = (role, artifact) => ({ role, artifact });

const releaseEvidenceValue = {
  apiVersion: API,
  kind: "ReleasePublicationEvidence",
  evidenceId: "DEVRELAY-V0.11.0-RC.1-PUBLICATION-001",
  release: {
    tag: "v0.11.0-rc.1",
    url: "https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.1",
    tagCommit: protectedMainCommit,
    target: "main",
    prerelease: true,
    publishedAt: "2026-09-06T13:02:39.000Z",
    assets: [
      { name: "0.11.0-rc.1.json", size: 3052688, digest: "sha256:552287936dcf3e15f5fd4989324bdae579fccefff5c74e74b28d70c8a45f96b6" },
      { name: "devrelay-0.11.0-rc.1.tgz", size: 2762583, digest: "sha256:1f9b3fab7ceb325d96e6722f3a6e88b2fcc6a5e41229efdb1d3ad5486ce18b99" },
      { name: "SBOM.cdx.json", size: 21561, digest: "sha256:140141370fce70b72844947d3976d6441ce3e781ea8bd58ff17bf783da6de7a8" },
      { name: "SHA256SUMS", size: 254, digest: "sha256:28d6a30d112adf7dbd3a3fa29599a05ee6c84c504ea764b727063b1bd07d1e42" },
    ],
  },
  integration: {
    pullRequest: "https://github.com/GarrettAudet/DevRelay/pull/19",
    testedHead,
    protectedMainCommit,
    testedTreeMatchesProtectedMain: true,
    pullRequestChecks: { total: 11, passed: 11, failed: 0 },
  },
  releaseWorkflow: {
    runId: 34034582831,
    url: "https://github.com/GarrettAudet/DevRelay/actions/runs/34034582831",
    buildAndVerifyJobId: 101490212893,
    createPrereleaseJobId: 101491027728,
    conclusion: "success",
  },
  localVerification: {
    command: "node scripts/release-check.mjs",
    testSummary: { tests: 1169, passed: 1167, failed: 0, skipped: 2 },
    catalog: { repositoryDigests: 11360, packagePaths: 415 },
    package: { files: 415, installedExports: 202 },
    outcome: "pass",
  },
  outcome: "published-and-verified",
};
writeJson(`${out}/00-release-publication-evidence.json`, releaseEvidenceValue);
const releaseEvidenceRef = ref(
  releaseEvidenceValue.evidenceId,
  api.sha256Digest(bytes(`${out}/00-release-publication-evidence.json`)),
  "https://devrelay.dev/evidence/release-publication/v1",
);

const baseValue = json("project/project-memory-baseline.json");
const base = api.loadProjectMemoryArtifact(baseValue);
assert.equal(baseValue.version, "1.0.6");
const baseSynopsis = api.renderCurrentSynopsis(baseValue);
assert.deepEqual(baseSynopsis.bytes, bytes("project/CurrentSynopsis.md"));
const bootstrapBaselineRef = {
  ...base.ref,
  uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-baseline.json",
};

const bootstrapReceipt = {
  apiVersion: API,
  kind: "DesktopProjectMemoryBootstrapReceipt",
  receiptId: "DPMBR-E423AA55FBC14223",
  projectId: "devrelay",
  taskId,
  repositoryRevision: protectedMainCommit,
  loadOrder: ["current-synopsis", "project-memory-baseline", "promotion-proof", "traceability-graph"],
  projectMemoryBaseline: bootstrapBaselineRef,
  synopsisProjection: baseSynopsis.ref,
  graphCheckpoint: baseValue.graphCheckpoint,
  promotionProof: {
    artifactId: "PMGP-0270AE68459EBE7C",
    schema: "https://devrelay.dev/evidence/project-memory-gate-promotion/v1",
    mediaType: "application/vnd.devrelay.project-memory-gate-promotion+json",
    digest: "sha256:e7c527f24e12f01005afa4d1f34e974df982bd9d28b03a7300e9d5e3e7f81610",
    uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-promotion.commit.json",
  },
  activeMemoryIds: baseValue.records.filter(({ status }) => ["active", "retained"].includes(status)).map(({ id }) => id).sort(),
  outcome: "pass",
  receiptDigest: "sha256:520795fb4c3d553939f36b2656536230bfc0000a651a901580b9631856e265bd",
};
writeJson(`${out}/01-project-memory-bootstrap-receipt.json`, bootstrapReceipt, false);
const bootstrapReceiptRef = ref(
  bootstrapReceipt.receiptId,
  api.sha256Digest(canonicalBytes(bootstrapReceipt, false)),
  "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1",
  "application/json",
  "desktop-bootstrap",
);
assert.equal(bootstrapReceiptRef.digest, "sha256:3369bc760edd4cb9d2c2ced2c93404ee0cded758ca372797fc8021167c5d318d");

const published = {
  id: "MEM-DEVRELAY-RELEASE-V0.11.0-RC1",
  category: "status",
  statement: "DevRelay v0.11.0-rc.1 is published as the controlled GitHub source and installable-library prerelease from protected-main commit 08be8385966223d16a20150ac804505b5fe40153; PR #19 passed all 11 checks, release workflow 34034582831 passed both artifact-verification and prerelease-creation jobs, and the catalog, tarball, CycloneDX SBOM, and checksum ledger are public with exact SHA-256 digests.",
  authority: "validated-status",
  status: "active",
  effectiveAt: at,
  domain: "acceptance",
  sourceRefs: [source("release-publication", releaseEvidenceRef)],
};
const nextAction = {
  id: "MEM-DEVRELAY-NEXT-AFTER-V0110RC1",
  category: "next-action",
  statement: "Run RoadmapManagement against the current approved project baselines before selecting another owner-approved product increment; the existing roadmap still ranks the now-completed ReleasePreparation initiative first, so publication does not imply a new scope choice.",
  authority: "validated-status",
  status: "active",
  effectiveAt: at,
  domain: "roadmap",
  sourceRefs: [source("release-publication", releaseEvidenceRef)],
};
const publicationChange = {
  changeId: "CHANGE-V0110RC1-PUBLICATION-REPLACE",
  disposition: "replace",
  qualitative: false,
  domain: "acceptance",
  targetMemoryId: "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V3",
  proposedMemory: published,
  rationale: "Replace the release-ready observation with the exact protected-main publication result.",
  sourceRefs: published.sourceRefs,
};
const pendingRoadmapChange = {
  changeId: "CHANGE-V0110RC1-NEXT-ACTION-REPLACE",
  disposition: "replace",
  qualitative: false,
  domain: "roadmap",
  targetMemoryId: "MEM-DEVRELAY-NEXT-AFTER-DO001",
  proposedMemory: nextAction,
  rationale: "Retire the completed publication action without choosing new product scope on the owner's behalf.",
  sourceRefs: nextAction.sourceRefs,
};
const changes = [publicationChange];
const candidateValue = api.createMemoryUpdateCandidate({
  projectId: "devrelay",
  sessionId,
  taskId,
  baseBaseline: base.ref,
  baseGraphCheckpoint: baseValue.graphCheckpoint,
  producerType: "main",
  changes,
  sourceRefs: [source("release-publication", releaseEvidenceRef), source("desktop-memory-bootstrap", bootstrapReceiptRef)],
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
  sourceRefs: [source("release-publication", releaseEvidenceRef), source("desktop-memory-bootstrap", bootstrapReceiptRef)],
});
const routes = [
  ...api.resolveMemoryChangeRoutes(candidateValue),
  ...api.resolveMemoryChangeRoutes(pendingRoadmapCandidateValue),
].sort((left, right) => left.changeId.localeCompare(right.changeId, "en"));
assert.deepEqual(routes.map(({ changeId, nextModule }) => [changeId, nextModule]), [
  ["CHANGE-V0110RC1-NEXT-ACTION-REPLACE", "roadmap-management"],
  ["CHANGE-V0110RC1-PUBLICATION-REPLACE", "project-memory-gate"],
]);
const conclusionValue = api.createSessionConclusion({
  projectId: "devrelay",
  sessionId,
  taskId,
  producerType: "main",
  startingBaseline: base.ref,
  startingGraphCheckpoint: baseValue.graphCheckpoint,
  contextReceipt: bootstrapReceiptRef,
  completedArtifacts: [releaseEvidenceRef],
  evidence: [releaseEvidenceRef, bootstrapReceiptRef],
  pendingDecisions: [pendingRoadmapChange.changeId],
  memoryCandidate: candidate.ref,
});
const terminalCheckpointDigest = api.canonicalJsonDigest({
  conclusion: conclusionValue.contentDigest,
  releaseEvidence: releaseEvidenceRef,
  protectedMainCommit,
  releaseWorkflowRunId: releaseEvidenceValue.releaseWorkflow.runId,
});
const approvalValue = api.createProjectMemoryGateApproval({
  candidate: candidateValue,
  candidateRef: candidate.ref,
  terminalCheckpointDigest,
  decisions: changes.map(({ changeId }) => ({
    changeId,
    decision: "approve",
    rationale: "Standing owner authorization applies to recording the exact completed release and retiring its completed next action; no new product scope is selected.",
  })),
});
const providerValue = api.withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "MemoryProviderReceipt",
  receiptId: "MPR-DEVRELAY-V0110-RC1-NATIVE-EQUIVALENT-001",
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
  outputDigest: api.canonicalJsonDigest(changes),
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
  sourceRefs: [source("release-publication", releaseEvidenceRef), source("desktop-memory-bootstrap", bootstrapReceiptRef), source("provider-equivalence", provider.ref)],
};
const concluded = await coordinator.conclude(concludeInput);
const replayed = await coordinator.conclude(concludeInput);
assert.equal(concluded.outcome, "concluded");
assert.equal(replayed.replayed, true);
assert.equal(commits, 1);
assert.equal(committed.baseline.value.version, "1.0.7");
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === published.id && status === "active"), true);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V3" && status === "superseded"), true);
assert.equal(committed.baseline.value.records.some(({ id }) => id === nextAction.id), false);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === "MEM-DEVRELAY-NEXT-AFTER-DO001" && status === "active"), true);

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
  clock: () => "2026-09-06T13:05:00.000Z",
  monotonicNow: () => ++tick,
});
const freshRequest = {
  executionId: "V0110-RC1-FRESH-TASK-AFTER-CONCLUDE",
  operation: "load-context",
  projectId: "devrelay",
  sessionId: "SESSION-V0110-RC1-NEXT",
  taskId: "TASK-V0110-RC1-NEXT",
  workspaceId: "WORKSPACE-DEVRELAY",
  repositoryRevision: protectedMainCommit,
  moduleId: "roadmap-management",
  moduleInvocationId: "INV-V0110-RC1-NEXT-ROADMAP",
  projectMemoryBaseline: committed.baseline.ref,
  synopsisProjection: committed.synopsis.ref,
  traceabilityProjection: trace.ref,
  query: "published DevRelay release and next authorized action",
};
const fresh = await bootstrap.load(freshRequest);
const freshReplay = await bootstrap.load(freshRequest);
assert.equal(freshReplay.replayed, true);
assert.equal(freshReplay.providerReceipt.value.outcome, "native-equivalent");
assert.equal(freshReplay.bundle.value.items.some(({ memoryId }) => memoryId === published.id), true);

const session = api.createProjectMemorySessionState({
  projectId: "devrelay",
  sessionId,
  taskId,
  status: "concluded",
  baseline: committed.baseline.ref,
  graphCheckpoint: baseValue.graphCheckpoint,
  lastCheckpointDigest: concluded.receipt.resultingCheckpointDigest,
  updatedAt: "2026-09-06T13:05:00.000Z",
});
const outputs = [
  ["02-memory-update-candidate.json", candidateValue],
  ["03-pending-roadmap-memory-candidate.json", pendingRoadmapCandidateValue],
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
    firstReplayed: fresh.replayed,
    replayed: freshReplay.replayed,
    replayProviderCalls: 0,
    loadOrder: fresh.receipt.loadOrder,
    baseline: committed.baseline.ref,
    synopsis: committed.synopsis.ref,
    graphCheckpoint: baseValue.graphCheckpoint,
    recoveredMemoryIds: [published.id],
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
  kind: "ReleasePublicationConclusionSummary",
  baseBaseline: base.ref,
  bootstrapReceipt: bootstrapReceiptRef,
  releaseEvidence: releaseEvidenceRef,
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
  protectedMainCommit,
  releaseWorkflowRunId: releaseEvidenceValue.releaseWorkflow.runId,
  publishedMemoryId: published.id,
  pendingRoadmapChange: pendingRoadmapChange.changeId,
  proposedNextAction: nextAction.id,
  outcome: "pass",
};
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeJson(`${out}/release-publication-conclusion-summary.json`, summary);
writeBytes(`${out}/CONCLUSION_DELTA.md`, Buffer.from(
  `# v0.11.0-rc.1 publication /conclude delta\n\n- Replace: \`MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V3\` with \`${published.id}\`\n- Pending RoadmapManagement: replace \`MEM-DEVRELAY-NEXT-AFTER-DO001\` with \`${nextAction.id}\`\n- Retain: all other active project-memory records\n- Reject: none\n- Result baseline: \`${committed.baseline.ref.digest}\`\n- Synopsis: \`${committed.synopsis.ref.digest}\`\n- Graph checkpoint: \`${baseValue.graphCheckpoint.digest}\`\n- Fresh-task load order: ${fresh.receipt.loadOrder.join(" -> ")}\n- Replay provider calls: 0\n`,
  "utf8",
));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

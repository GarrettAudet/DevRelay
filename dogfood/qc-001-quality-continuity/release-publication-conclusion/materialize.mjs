import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/qc-001-quality-continuity/release-publication-conclusion";
const at = "2026-09-08T03:28:44.000Z";
const protectedMainCommit = "75c9b3a312d24bff967e5c652385f529ffab4db0";
const testedHead = "061be4ce570edb0fc2baba2f812f194847143e14";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const taskId = "ATT-QC001-RELEASE-PUBLISH-001";
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
const ref = (artifactId, digest, schema, mediaType = "application/json", namespace = "qc-001-publication") => ({
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
  evidenceId: "DEVRELAY-V0.11.0-RC.2-PUBLICATION-001",
  release: {
    tag: "v0.11.0-rc.2",
    url: "https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.2",
    tagCommit: protectedMainCommit,
    target: "main",
    prerelease: true,
    publishedAt: "2026-09-08T03:28:43.000Z",
    assets: [
      { name: "0.11.0-rc.2.json", size: 3076749, digest: "sha256:06a60c9cb0c68639094becba6700f72f39851cf1dcfce1e6344d51cc5ff8e5cc" },
      { name: "devrelay-0.11.0-rc.2.tgz", size: 3286625, digest: "sha256:0e4277b9f6f0d4d1ffb0bc57f954de60a7ce37f29390c6762acced4e78123242" },
      { name: "SBOM.cdx.json", size: 21561, digest: "sha256:d3b2a6b6b882e6b640fc40933e6e7c94eef74191bacdba4459dc714333b3ebb2" },
      { name: "SHA256SUMS", size: 254, digest: "sha256:280d2f0e6f27c7a724ceedb321dd6264b83a4e2d28010425479b8d62697eae03" },
    ],
  },
  integration: {
    pullRequest: "https://github.com/GarrettAudet/DevRelay/pull/21",
    testedHead,
    protectedMainCommit,
    testedTreeMatchesProtectedMain: true,
    pullRequestChecks: { total: 11, passed: 11, failed: 0 },
  },
  releaseWorkflow: {
    runId: 34183116800,
    url: "https://github.com/GarrettAudet/DevRelay/actions/runs/34183116800",
    buildAndVerifyJobId: 101926041522,
    createPrereleaseJobId: 101927529638,
    conclusion: "success",
  },
  localVerification: {
    command: "node scripts/release-check.mjs",
    testSummary: { tests: 1191, passed: 1189, failed: 0, skipped: 2 },
    catalog: { repositoryDigests: 11452, packagePaths: 430 },
    package: { files: 430, installedExports: 214 },
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
assert.equal(baseValue.version, "1.0.8");
const baseSynopsis = api.renderCurrentSynopsis(baseValue);
assert.deepEqual(baseSynopsis.bytes, bytes("project/CurrentSynopsis.md"));
const bootstrapBaselineRef = {
  ...base.ref,
  uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-baseline.json",
};

const bootstrapReceipt = {
  apiVersion: API,
  kind: "DesktopProjectMemoryBootstrapReceipt",
  receiptId: "DPMBR-E62627A2292EF064",
  projectId: "devrelay",
  taskId,
  repositoryRevision: protectedMainCommit,
  loadOrder: ["current-synopsis", "project-memory-baseline", "promotion-proof", "traceability-graph"],
  projectMemoryBaseline: bootstrapBaselineRef,
  synopsisProjection: baseSynopsis.ref,
  graphCheckpoint: baseValue.graphCheckpoint,
  promotionProof: {
    artifactId: "PMGP-D17E73EC2F1D7016",
    schema: "https://devrelay.dev/evidence/project-memory-gate-promotion/v1",
    mediaType: "application/vnd.devrelay.project-memory-gate-promotion+json",
    digest: "sha256:5ac72a8456b8485b2296cb3518d092243ec4d94796b753c8caa42ad2c063dd18",
    uri: "file:///C:/Users/SC/Documents/ChatGPT/DevRelay/project/project-memory-promotion.commit.json",
  },
  activeMemoryIds: baseValue.records.filter(({ status }) => ["active", "retained"].includes(status)).map(({ id }) => id).sort(),
  outcome: "pass",
  receiptDigest: "sha256:4d225e8df9bc6d26601cb315b90a876ce27bb94aa0ed707c5a5c54290d06878a",
};
writeJson(`${out}/01-project-memory-bootstrap-receipt.json`, bootstrapReceipt, false);
const bootstrapReceiptRef = ref(
  bootstrapReceipt.receiptId,
  api.sha256Digest(canonicalBytes(bootstrapReceipt, false)),
  "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1",
  "application/json",
  "desktop-bootstrap",
);
assert.equal(bootstrapReceiptRef.digest, "sha256:9292a2fb067fa8e6886c444ffd6c667cc0975b556fc01716964bd01270f95144");

const published = {
  id: "MEM-DEVRELAY-RELEASE-V0.11.0-RC2",
  category: "status",
  statement: "DevRelay v0.11.0-rc.2 is published as the controlled GitHub source and installable-library prerelease from protected-main commit 75c9b3a312d24bff967e5c652385f529ffab4db0; PR #21 passed all 11 checks, release workflow 34183116800 passed both artifact-verification and prerelease-creation jobs, and the catalog, tarball, CycloneDX SBOM, and checksum ledger are public with exact SHA-256 digests.",
  authority: "validated-status",
  status: "active",
  effectiveAt: at,
  domain: "acceptance",
  sourceRefs: [source("release-publication", releaseEvidenceRef)],
};
const nextAction = {
  id: "MEM-DEVRELAY-NEXT-AFTER-V0110RC2",
  category: "next-action",
  statement: "Use RoadmapManagement to establish HO-001 Human Orchestration as the next owner-approved increment: add a conversation-native Desktop operator control surface for agent and sub-agent topology, dependency-safe work queues, blockers, approvals, quality evidence, worktree leases, ProjectMemory continuity, and typed auditable human interventions without acquiring Module, Gate, graph, verification, integration, or owner authority.",
  authority: "validated-status",
  status: "active",
  effectiveAt: at,
  domain: "roadmap",
  sourceRefs: [source("release-publication", releaseEvidenceRef)],
};
const publicationChange = {
  changeId: "CHANGE-V0110RC2-PUBLICATION-REPLACE",
  disposition: "replace",
  qualitative: false,
  domain: "acceptance",
  targetMemoryId: "MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE",
  proposedMemory: published,
  rationale: "Replace the rc.2 release-candidate observation with the exact protected-main publication result.",
  sourceRefs: published.sourceRefs,
};
const pendingRoadmapChange = {
  changeId: "CHANGE-V0110RC2-NEXT-ACTION-REPLACE",
  disposition: "replace",
  qualitative: false,
  domain: "roadmap",
  targetMemoryId: "MEM-DEVRELAY-NEXT-AFTER-DO001",
  proposedMemory: nextAction,
  rationale: "Retire the completed publication action and route the owner-selected HO-001 increment through RoadmapManagement.",
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
  ["CHANGE-V0110RC2-NEXT-ACTION-REPLACE", "roadmap-management"],
  ["CHANGE-V0110RC2-PUBLICATION-REPLACE", "project-memory-gate"],
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
    rationale: "Standing owner authorization applies to recording the exact completed release and retiring its completed next action; HO-001 remains a separately routed roadmap proposal.",
  })),
});
const providerValue = api.withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "MemoryProviderReceipt",
  receiptId: "MPR-DEVRELAY-V0110-RC2-NATIVE-EQUIVALENT-001",
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
assert.equal(committed.baseline.value.version, "1.0.9");
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === published.id && status === "active"), true);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE" && status === "superseded"), true);
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
  clock: () => "2026-09-10T00:00:00.000Z",
  monotonicNow: () => ++tick,
});
const freshRequest = {
  executionId: "V0110-RC2-FRESH-TASK-AFTER-CONCLUDE",
  operation: "load-context",
  projectId: "devrelay",
  sessionId: "SESSION-V0110-RC2-NEXT",
  taskId: "TASK-V0110-RC2-NEXT",
  workspaceId: "WORKSPACE-DEVRELAY",
  repositoryRevision: protectedMainCommit,
  moduleId: "roadmap-management",
  moduleInvocationId: "INV-V0110-RC2-NEXT-ROADMAP",
  projectMemoryBaseline: committed.baseline.ref,
  synopsisProjection: committed.synopsis.ref,
  traceabilityProjection: trace.ref,
  query: "published DevRelay v0.11.0-rc.2 release and HO-001 roadmap proposal",
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
  updatedAt: "2026-09-10T00:00:00.000Z",
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
  `# v0.11.0-rc.2 publication /conclude delta\n\n- Replace: \`MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE\` with \`${published.id}\`\n- Pending RoadmapManagement: replace \`MEM-DEVRELAY-NEXT-AFTER-DO001\` with \`${nextAction.id}\`\n- Retain: all other active project-memory records\n- Reject: none\n- Result baseline: \`${committed.baseline.ref.digest}\`\n- Synopsis: \`${committed.synopsis.ref.digest}\`\n- Graph checkpoint: \`${baseValue.graphCheckpoint.digest}\`\n- Fresh-task load order: ${fresh.receipt.loadOrder.join(" -> ")}\n- Replay provider calls: 0\n`,
  "utf8",
));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

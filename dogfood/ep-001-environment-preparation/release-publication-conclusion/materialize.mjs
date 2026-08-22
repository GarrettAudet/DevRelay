import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/ep-001-environment-preparation/release-publication-conclusion";
const bytes = (p) => fs.readFileSync(path.join(root, p));
const json = (p) => JSON.parse(bytes(p));
const ref = (artifactId, digest, schema, mediaType = "application/json") => ({
  artifactId, schema, mediaType, digest,
  uri: `memory://devrelay/release-publication/${encodeURIComponent(artifactId)}/${digest.slice(7)}`,
});
const source = (role, artifact) => ({ role, artifact });
const writeJson = (p, value, newline = true) => {
  const target = path.join(root, p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8");
};
const writeBytes = (p, value) => {
  const target = path.join(root, p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};

const releaseEvidenceValue = {
  apiVersion: API,
  kind: "ReleasePublicationEvidence",
  evidenceId: "DEVRELAY-V0.10.0-RC.3-PUBLICATION-001",
  release: {
    tag: "v0.10.0-rc.3",
    url: "https://github.com/GarrettAudet/DevRelay/releases/tag/v0.10.0-rc.3",
    tagCommit: "dc0f4094ce0e178757984e363836d05cfcc0037d",
    assets: [
      { name: "0.10.0-rc.3.json", digest: "sha256:30ebabeb56d1c1ca67222bdc72d2ebaf564ea6fd4b8c2f993d80092070c68564" },
      { name: "devrelay-0.10.0-rc.3.tgz", digest: "sha256:2fbe981e32cb67cefaca95294ce6f56081db746bca185c098cea00704fa65fff" },
      { name: "SBOM.cdx.json", digest: "sha256:465aa7a123569cea58a772029b03e0e53b8f0ecc21f7627950e791345cf5dc66" },
      { name: "SHA256SUMS", digest: "sha256:ce59ca6e6a4a7b02c1d6b245e967e3b9993e4075e99cd0168ac73d4887d8fb73" },
    ],
  },
  publicationRecovery: {
    sourceWorkflowRunId: 32573676370,
    sourceBuildJobId: 97032764058,
    failedCreateJobId: 97033498528,
    disposition: "exact-attested-assets-published-without-rebuild-or-substitution",
  },
  automationFollowup: {
    pullRequest: "https://github.com/GarrettAudet/DevRelay/pull/13",
    implementationCommit: "c4c45ceaced6012bb9631f1dd09354865e00df52",
    evidenceSealCommit: "8132f2a0a23d587ff73c15092742d2d427bf0b48",
    protectedMainCommit: "d17bc7dada964c3b669c29407cdabfbfe37c2651",
    canonicalRuns: { verify: 32592205364, codeql: 32592205360, scorecard: 32592205344 },
    result: "pass",
  },
  outcome: "published-and-canonical-main-verified",
};
writeJson(`${out}/00-release-publication-evidence.json`, releaseEvidenceValue);
const releaseEvidenceRef = ref(
  releaseEvidenceValue.evidenceId,
  api.sha256Digest(bytes(`${out}/00-release-publication-evidence.json`)),
  "https://devrelay.dev/evidence/release-publication/v1",
);

const baseValue = json("project/project-memory-baseline.json");
const base = api.loadProjectMemoryArtifact(baseValue);
const baseSynopsis = api.renderCurrentSynopsis(baseValue);
assert.deepEqual(baseSynopsis.bytes, bytes("project/CurrentSynopsis.md"));
const traceValue = json("dogfood/ep-001-environment-preparation/final-conclusion/00-traceability-context-projection.json");
const trace = api.loadProjectMemoryArtifact(traceValue);
assert.deepEqual(traceValue.graphCheckpoint, baseValue.graphCheckpoint);
const artifacts = new Map([
  [base.ref.digest, base],
  [baseSynopsis.ref.digest, { ref: baseSynopsis.ref, bytes: baseSynopsis.bytes }],
  [trace.ref.digest, trace],
]);
let tick = 0;
const runtime = api.createProjectMemoryRuntime({ provider: null, monotonicNow: () => ++tick });
const bootstrap = api.createProjectMemoryContextBootstrap({
  loadArtifact: async (artifact) => artifacts.get(artifact.digest), runtime,
  clock: () => "2026-08-22T19:08:00.000Z", monotonicNow: () => ++tick,
});
const initial = await bootstrap.load({
  executionId: "V0100-RC3-RELEASE-CONCLUSION-INITIAL-LOAD", operation: "load-context",
  projectId: "devrelay", sessionId: "SESSION-V0100-RC3-RELEASE-CONCLUSION",
  taskId: "TASK-V0100-RC3-RELEASE-CONCLUSION", workspaceId: "WORKSPACE-DEVRELAY",
  repositoryRevision: releaseEvidenceValue.automationFollowup.protectedMainCommit,
  moduleId: "project-memory", moduleInvocationId: "INV-V0100-RC3-RELEASE-CONCLUSION",
  projectMemoryBaseline: base.ref, synopsisProjection: baseSynopsis.ref,
  traceabilityProjection: trace.ref,
  query: "published DevRelay release, canonical verification, and next action",
});
assert.deepEqual(initial.receipt.loadOrder, ["current-synopsis", "project-memory-baseline", "traceability-context"]);

const published = {
  id: "MEM-DEVRELAY-RELEASE-V0.10.0-RC3", category: "status",
  statement: "DevRelay v0.10.0-rc.3 is published as the controlled GitHub source/library prerelease from tag commit dc0f4094ce0e178757984e363836d05cfcc0037d; its exact attested assets are public, the repository-explicit publication repair is integrated at protected-main commit d17bc7dada964c3b669c29407cdabfbfe37c2651, and canonical verify, CodeQL, and scorecard runs passed.",
  authority: "validated-status", status: "active", effectiveAt: "2026-08-22T19:08:00.000Z",
  domain: "acceptance", sourceRefs: [source("release-publication", releaseEvidenceRef)],
};
const changes = [{
  changeId: "CHANGE-V0100-RC3-PUBLICATION-ADD", disposition: "add", qualitative: false,
  domain: "acceptance", proposedMemory: published,
  rationale: "Record the exact published prerelease, protected-main repair, and canonical verification outcome without changing the approved roadmap priority.",
  sourceRefs: [source("release-publication", releaseEvidenceRef)],
}];
const candidateValue = api.createMemoryUpdateCandidate({
  projectId: "devrelay", sessionId: "SESSION-V0100-RC3-RELEASE-CONCLUSION",
  taskId: "TASK-V0100-RC3-RELEASE-CONCLUSION", baseBaseline: base.ref,
  baseGraphCheckpoint: baseValue.graphCheckpoint, producerType: "main", changes,
  sourceRefs: [source("release-publication", releaseEvidenceRef)],
});
const candidate = api.loadProjectMemoryArtifact(candidateValue);
const routes = api.resolveMemoryChangeRoutes(candidateValue);
assert.deepEqual(routes.map(({ changeId, nextModule }) => [changeId, nextModule]), [
  ["CHANGE-V0100-RC3-PUBLICATION-ADD", "project-memory-gate"],
]);
const contextReceipt = ref(initial.receipt.receiptId, api.canonicalJsonDigest(initial.receipt), "https://devrelay.dev/evidence/project-memory-context-load/v1");
const conclusionValue = api.createSessionConclusion({
  projectId: "devrelay", sessionId: "SESSION-V0100-RC3-RELEASE-CONCLUSION",
  taskId: "TASK-V0100-RC3-RELEASE-CONCLUSION", producerType: "main",
  startingBaseline: base.ref, startingGraphCheckpoint: baseValue.graphCheckpoint,
  contextReceipt, completedArtifacts: [releaseEvidenceRef], evidence: [releaseEvidenceRef],
  pendingDecisions: [], memoryCandidate: candidate.ref,
});
const terminalCheckpointDigest = api.canonicalJsonDigest({
  conclusion: conclusionValue.contentDigest, releaseEvidence: releaseEvidenceRef,
  protectedMainCommit: releaseEvidenceValue.automationFollowup.protectedMainCommit,
});
const approvalValue = api.createProjectMemoryGateApproval({
  candidate: candidateValue, candidateRef: candidate.ref, terminalCheckpointDigest,
  decisions: [{
    changeId: "CHANGE-V0100-RC3-PUBLICATION-ADD", decision: "approve",
    rationale: "Standing owner authorization applies to recording this exact verified release status; it does not alter product scope or roadmap priority.",
  }],
});
const providerValue = api.withProjectMemoryContentDigest({
  apiVersion: API, kind: "MemoryProviderReceipt",
  receiptId: "MPR-DEVRELAY-V0100-RC3-NATIVE-EQUIVALENT-001",
  providerId: "devrelay.native-project-memory", providerVersion: "1.0.0",
  operation: "synchronize", namespace: "project/devrelay",
  configurationDigest: api.canonicalJsonDigest({ provider: "devrelay.native-project-memory", policy: "exact-baseline-equivalence" }),
  inputCheckpoints: [base.ref, candidate.ref],
  commandFingerprint: api.canonicalJsonDigest({ operation: "synchronize", baseline: base.ref, candidate: candidate.ref }),
  outcome: "native-equivalent", durationMs: 0, replayed: false, citations: [],
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
  conclusion: conclusionValue, candidate: candidateValue, candidateRef: candidate.ref,
  approval: approvalValue, baseBaseline: base.value, baseBaselineRef: base.ref,
  providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref,
  resultGraphCheckpoint: baseValue.graphCheckpoint,
  sourceRefs: [source("release-publication", releaseEvidenceRef), source("provider-equivalence", provider.ref)],
};
const concluded = await coordinator.conclude(concludeInput);
const replay = await coordinator.conclude(concludeInput);
assert.equal(concluded.outcome, "concluded");
assert.equal(replay.replayed, true);
assert.equal(commits, 1);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === published.id && status === "active"), true);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === "MEM-DEVRELAY-NEXT-AFTER-EP001" && status === "active"), true);

artifacts.set(committed.baseline.ref.digest, committed.baseline);
artifacts.set(committed.synopsis.ref.digest, { ref: committed.synopsis.ref, bytes: committed.synopsis.bytes });
const freshRequest = {
  executionId: "V0100-RC3-FRESH-TASK-AFTER-CONCLUDE", operation: "load-context",
  projectId: "devrelay", sessionId: "SESSION-V0100-RC3-NEXT", taskId: "TASK-V0100-RC3-NEXT",
  workspaceId: "WORKSPACE-DEVRELAY", repositoryRevision: releaseEvidenceValue.automationFollowup.protectedMainCommit,
  moduleId: "roadmap-management", moduleInvocationId: "INV-V0100-RC3-NEXT-ROADMAP",
  projectMemoryBaseline: committed.baseline.ref, synopsisProjection: committed.synopsis.ref,
  traceabilityProjection: trace.ref, query: "current DevRelay status and next prioritized work",
};
const fresh = await bootstrap.load(freshRequest);
const freshReplay = await bootstrap.load(freshRequest);
assert.equal(freshReplay.replayed, true);
assert.equal(freshReplay.providerReceipt.value.outcome, "native-equivalent");
assert.equal(freshReplay.bundle.value.items.some(({ memoryId }) => memoryId === published.id), true);
const session = api.createProjectMemorySessionState({
  projectId: "devrelay", sessionId: "SESSION-V0100-RC3-RELEASE-CONCLUSION",
  taskId: "TASK-V0100-RC3-RELEASE-CONCLUSION", status: "concluded",
  baseline: committed.baseline.ref, graphCheckpoint: baseValue.graphCheckpoint,
  lastCheckpointDigest: concluded.receipt.resultingCheckpointDigest,
  updatedAt: "2026-08-22T19:10:00.000Z",
});
const outputs = [
  ["01-initial-context-load-receipt.json", initial.receipt],
  ["02-memory-update-candidate.json", candidateValue],
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
    apiVersion: API, kind: "ProjectMemoryFreshTaskReplayProof", firstReplayed: fresh.replayed,
    replayed: freshReplay.replayed, replayProviderCalls: 0, loadOrder: fresh.receipt.loadOrder,
    baseline: committed.baseline.ref, synopsis: committed.synopsis.ref,
    graphCheckpoint: baseValue.graphCheckpoint, outcome: "pass",
  }],
];
for (const [name, value] of outputs) writeJson(`${out}/${name}`, value);
writeBytes(`${out}/CurrentSynopsis.md`, committed.synopsis.bytes);
writeJson("project/project-memory-baseline.json", committed.baseline.value, false);
writeBytes("project/CurrentSynopsis.md", committed.synopsis.bytes);
writeJson("project/project-memory-promotion.commit.json", committed.proof);
writeJson("project/project-memory-session-state.json", session);
writeJson("project/project-memory-context-load-receipt.json", fresh.receipt);
writeJson(`project/history/project-memory/${base.value.version}/project-memory-baseline.json`, base.value, false);
writeBytes(`project/history/project-memory/${base.value.version}/CurrentSynopsis.md`, baseSynopsis.bytes);
writeJson(`project/history/project-memory/${committed.baseline.value.version}/project-memory-baseline.json`, committed.baseline.value, false);
writeBytes(`project/history/project-memory/${committed.baseline.value.version}/CurrentSynopsis.md`, committed.synopsis.bytes);
const summary = {
  apiVersion: API, kind: "ReleasePublicationConclusionSummary", baseBaseline: base.ref,
  releaseEvidence: releaseEvidenceRef, candidate: candidate.ref,
  approval: api.loadProjectMemoryArtifact(approvalValue).ref, resultBaseline: committed.baseline.ref,
  synopsis: committed.synopsis.ref, concludeReceipt: api.loadProjectMemoryArtifact(concluded.receipt).ref,
  graphCheckpoint: baseValue.graphCheckpoint, atomicCommits: commits, replayAtomicCommits: 0,
  freshTaskLoadOrder: fresh.receipt.loadOrder, freshTaskReplayed: freshReplay.replayed,
  freshTaskProviderOutcome: freshReplay.providerReceipt.value.outcome,
  protectedMainCommit: releaseEvidenceValue.automationFollowup.protectedMainCommit,
  nextActionRetained: "MEM-DEVRELAY-NEXT-AFTER-EP001", outcome: "pass",
};
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeJson(`${out}/release-publication-conclusion-summary.json`, summary);
writeBytes(`${out}/CONCLUSION_DELTA.md`, Buffer.from(
  `# v0.10.0-rc.3 publication /conclude delta\n\n- Add: \`${published.id}\`\n- Retain: \`MEM-DEVRELAY-NEXT-AFTER-EP001\`\n- Retain: all other active project-memory records\n- Replace: none\n- Reject: none\n- Result baseline: \`${committed.baseline.ref.digest}\`\n- Synopsis: \`${committed.synopsis.ref.digest}\`\n- Graph checkpoint: \`${baseValue.graphCheckpoint.digest}\`\n- Fresh-task load order: ${fresh.receipt.loadOrder.join(" -> ")}\n- Replay provider calls: 0\n`, "utf8"));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

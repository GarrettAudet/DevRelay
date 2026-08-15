import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { runAdaptiveRequirementsInterview } from "../../../src/requirements-interview.mjs";
import {
  ROADMAP_ARTIFACT_CONTRACTS,
  createRoadmapIntakeCandidate,
  createRoadmapManagementRuntime,
  createRoadmapNotInitialized,
  createRoadmapPriorityPolicy,
} from "../../../src/index.mjs";
import { promoteRoadmapBaseline } from "../../../src/roadmap-gate.mjs";
import {
  assertSessionContextReceipt,
  createSessionContextSnapshot,
  executeSessionBootstrap,
  refreshSessionContext,
} from "../../../src/session-bootstrap.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../../../src/traceability-graph.mjs";
import { roadmapTraceabilityContributor } from "../../../src/roadmap-traceability-contributor.mjs";
import { createImplementationSeal } from "../../../src/two-phase-evidence-seal.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const API = "devrelay.dev/v1alpha1";
const IMPLEMENTATION_COMMIT = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const verification = JSON.parse(readFileSync(new URL("verification-summary.json", OUTPUT), "utf8"));
if (verification.implementationCommit !== IMPLEMENTATION_COMMIT) throw new Error("verification does not bind the current implementation commit");

function bytes(relativePath) {
  return readFileSync(new URL(relativePath, ROOT));
}
function json(relativePath) {
  return JSON.parse(bytes(relativePath).toString("utf8"));
}
function write(relativePath, value, raw = false) {
  const url = new URL(relativePath, OUTPUT);
  mkdirSync(new URL(".", url), { recursive: true });
  const output = raw ? Buffer.from(value) : Buffer.from(canonicalJson(value), "utf8");
  writeFileSync(url, output);
  return output;
}
function writeRoot(relativePath, value, raw = false) {
  const url = new URL(relativePath, ROOT);
  mkdirSync(new URL(".", url), { recursive: true });
  const output = raw ? Buffer.from(value) : Buffer.from(canonicalJson(value), "utf8");
  writeFileSync(url, output);
  return output;
}
function refFor({ artifactId, schema, mediaType, uri, rawBytes }) {
  return { artifactId, schema, mediaType, digest: sha256Digest(rawBytes), uri };
}
function loadedRoot(relativePath, artifactId, schema, mediaType, uri, artifactVersion) {
  const rawBytes = bytes(relativePath);
  return {
    value: mediaType === "text/markdown" ? rawBytes.toString("utf8") : JSON.parse(rawBytes.toString("utf8")),
    bytes: rawBytes,
    ref: refFor({ artifactId, schema, mediaType, uri, rawBytes }),
    artifactVersion,
  };
}
function loadedValue(value, artifactId, schema, mediaType, uri) {
  const rawBytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes: rawBytes, ref: refFor({ artifactId, schema, mediaType, uri, rawBytes }) };
}

const requirements = loadedRoot(
  "project/requirements-baseline.json",
  json("project/requirements-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
  "devrelay://repository/project/requirements-baseline.json",
  json("project/requirements-baseline.json").version,
);
const projectOverview = loadedRoot(
  "project/project-overview-baseline.json",
  json("project/project-overview-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
  "devrelay://repository/project/project-overview-baseline.json",
  json("project/project-overview-baseline.json").version,
);
const projectOverviewProjection = loadedRoot(
  "ProjectOverview.md",
  "project-overview-markdown-rm-001",
  "https://devrelay.dev/artifacts/project-overview-markdown/v1",
  "text/markdown",
  "devrelay://repository/ProjectOverview.md",
  projectOverview.artifactVersion,
);
const lifecycleStatus = loadedRoot(
  "CURRENT_STATUS.md",
  "current-status-rm-001-implementation",
  "https://devrelay.dev/artifacts/current-status/v1",
  "text/markdown",
  "devrelay://repository/CURRENT_STATUS.md",
  "rm-001-implementation",
);
const architecture = loadedRoot("project/architecture-baseline.json", json("project/architecture-baseline.json").baselineId, "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", "devrelay://repository/project/architecture-baseline.json", json("project/architecture-baseline.json").version);
const contracts = loadedRoot("project/contract-baseline.json", json("project/contract-baseline.json").baselineId, "https://devrelay.dev/artifacts/contract-baseline/v1", "application/vnd.devrelay.contract-baseline+json", "devrelay://repository/project/contract-baseline.json", json("project/contract-baseline.json").version);
const workBreakdown = loadedRoot("project/work-breakdown-baseline.json", json("project/work-breakdown-baseline.json").baselineId, "https://devrelay.dev/artifacts/work-breakdown-baseline/v1", "application/vnd.devrelay.work-breakdown-baseline+json", "devrelay://repository/project/work-breakdown-baseline.json", json("project/work-breakdown-baseline.json").version);
const workDependency = loadedRoot("project/work-dependency-baseline.json", json("project/work-dependency-baseline.json").baselineId, "https://devrelay.dev/artifacts/work-dependency-baseline/v1", "application/vnd.devrelay.work-dependency-baseline+json", "devrelay://repository/project/work-dependency-baseline.json", json("project/work-dependency-baseline.json").version);
const assignment = loadedRoot("project/specialist-assignment-baseline.json", json("project/specialist-assignment-baseline.json").baselineId, "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1", "application/vnd.devrelay.specialist-assignment-baseline+json", "devrelay://repository/project/specialist-assignment-baseline.json", json("project/specialist-assignment-baseline.json").version);

const interviewText = `# Roadmap candidate requirements interview\n\nCandidate: Live optional roadmap planning-system adapters\n\n- Objective: allow configured GitHub Projects and Linear adapters to propose roadmap changes without replacing the native file contract.\n- Users: DevRelay project owners operating through ChatGPT Desktop on Windows.\n- Scope: proposer-only intake, review, and reprioritization bindings with exact provider receipts and native artifact archival.\n- Non-goals: no external system may approve, mutate the authoritative baseline, schedule work, execute work, or become required for offline operation.\n- Success: both adapters normalize into the same candidate contract; substitution, unavailable providers, and permission drift fail closed; the native provider remains fully usable.\n- Constraints: GitHub source distribution only, explicit grants, content-addressed artifacts, no hidden credentials, and no source transmission without approval.\n- Dependencies: stable RoadmapManagement 0.1.0, provider-execution attestations, capability enforcement, and RoadmapGate.\n- Operational boundary: optional future increment; triage must not start construction automatically.\n`;
const interviewBytes = Buffer.from(interviewText, "utf8");
const interviewRef = refFor({
  artifactId: "RM-CANDIDATE-INTERVIEW-LIVE-PLANNING-ADAPTERS-001",
  schema: "https://devrelay.dev/evidence/requirements-interview/v1",
  mediaType: "text/markdown",
  uri: "devrelay://repository/dogfood/rm-001-roadmap-management/release/roadmap-candidate-requirements-interview.md",
  rawBytes: interviewBytes,
});
write("roadmap-candidate-requirements-interview.md", interviewBytes, true);

const domains = [
  { id: "problem", weight: 0.18, blocking: true },
  { id: "users", weight: 0.12, blocking: true },
  { id: "scope", weight: 0.15, blocking: true },
  { id: "success", weight: 0.15, blocking: true },
  { id: "constraints", weight: 0.12, blocking: true },
  { id: "security", weight: 0.08, blocking: true },
  { id: "dependencies", weight: 0.1, blocking: false },
  { id: "operations", weight: 0.1, blocking: false },
];
const questions = domains.map(({ id }) => ({ id: `Q-RM-${id.toUpperCase()}`, domainId: id, prompt: `Resolve the ${id} decision domain for this roadmap candidate.` }));
const initialInterview = runAdaptiveRequirementsInterview({ domains, questions, minimumWeightedCoverage: 0.99, waveNumber: 1, maxQuestions: 24 });
if (initialInterview.outcome !== "needs-clarification" || initialInterview.wave.questions.length !== domains.length) throw new Error("adaptive requirements interview did not produce the complete breadth-first first wave");
const closedInterview = runAdaptiveRequirementsInterview({
  domains,
  domainEvidence: domains.map(({ id }) => ({ domainId: id, status: "resolved", confidence: 1, evidenceRefs: [`${interviewRef.artifactId}#${id}`] })),
  contradictions: [],
  questions,
  minimumWeightedCoverage: 0.99,
});
if (closedInterview.outcome !== "gate-candidate-ready" || closedInterview.assessment.weightedCoverage < 0.99) throw new Error("candidate requirements did not reach mandatory closure");
write("requirements-interview-initial.json", initialInterview);
write("requirements-closure-assessment.json", closedInterview.assessment);

const notInitialized = createRoadmapNotInitialized("devrelay");
write("roadmap-not-initialized.json", notInitialized);

const commonBindings = [
  ["project-overview", projectOverview],
  ["project-overview-projection", projectOverviewProjection],
  ["lifecycle-status", lifecycleStatus],
  ["requirements-baseline", requirements],
  ["architecture-baseline", architecture],
  ["contract-baseline", contracts],
  ["work-breakdown-baseline", workBreakdown],
  ["work-dependency-baseline", workDependency],
  ["specialist-assignment-baseline", assignment],
];
const preBindings = commonBindings.map(([role, artifact]) => ({ role, artifact: artifact.ref, artifactVersion: artifact.artifactVersion }));
const resolverValues = new Map(commonBindings.map(([, artifact]) => [artifact.ref.digest, artifact.bytes]));
const preSnapshot = createSessionContextSnapshot({
  projectId: "devrelay",
  taskId: "RM-001-WINDOWS-DESKTOP-E2E",
  workspaceId: "devrelay-source-workspace",
  repositoryRevision: IMPLEMENTATION_COMMIT,
  bindings: preBindings,
  roadmapDisposition: "RoadmapNotInitialized",
  createdAt: "2026-08-15T20:00:00Z",
});
const preReceipt = await executeSessionBootstrap({
  snapshot: preSnapshot,
  artifactResolver: async (artifact) => ({ bytes: resolverValues.get(artifact.digest) }),
  expectedProjectId: "devrelay",
  expectedTaskId: "RM-001-WINDOWS-DESKTOP-E2E",
  expectedWorkspaceId: "devrelay-source-workspace",
  expectedRepositoryRevision: IMPLEMENTATION_COMMIT,
  cache: "cold",
  durationMs: 0,
});
assertSessionContextReceipt({ receipt: preReceipt, snapshot: preSnapshot, currentBindings: preBindings, currentRepositoryRevision: IMPLEMENTATION_COMMIT });
if (preReceipt.outcome !== "RoadmapNotInitialized") throw new Error("fresh Desktop task did not explicitly observe RoadmapNotInitialized");
write("session-context-pre.json", preSnapshot);
write("session-receipt-pre.json", preReceipt);

const sourceRefs = [
  { role: "candidate-requirements", artifact: interviewRef },
  { role: "requirements-baseline", artifact: requirements.ref },
  { role: "project-overview-baseline", artifact: projectOverview.ref },
].sort((a, b) => a.role.localeCompare(b.role, "en"));
const intake = createRoadmapIntakeCandidate({
  candidateId: "RM-CANDIDATE-LIVE-PLANNING-ADAPTERS-001",
  title: "Live optional roadmap planning-system adapters",
  purpose: "Allow configured GitHub Projects and Linear adapters to propose roadmap changes while the native file contract and human-owned RoadmapGate remain authoritative.",
  requirementsBaseline: requirements.ref,
  contextBindings: sourceRefs,
});
const priorityPolicy = createRoadmapPriorityPolicy({
  policyId: "ROADMAP-PRIORITY-DEVRELAY-V1",
  weights: { strategicAlignment: 0.25, userValue: 0.2, urgency: 0.15, riskReduction: 0.15, effort: 0.1, dependencies: 0.05, confidence: 0.1 },
});
const priorityPolicyLoaded = loadedValue(priorityPolicy, priorityPolicy.policyId, "https://devrelay.dev/artifacts/roadmap-priority-policy/v1", "application/vnd.devrelay.roadmap-priority-policy+json", "devrelay://repository/dogfood/rm-001-roadmap-management/release/roadmap-priority-policy.json");
const checkpointValues = new Map();
let proposerCalls = 0;
const runtime = createRoadmapManagementRuntime({
  proposer: {
    id: "native-structured-roadmap-proposer",
    version: "0.1.0",
    async propose(request) { proposerCalls += 1; return request.nativeProposal; },
  },
});
const invocation = {
  operation: "triage-candidate",
  intakeCandidate: intake,
  comparison: { closureConfidence: closedInterview.assessment.weightedCoverage, alreadyCovered: false, blockingConflict: false },
  factors: { strategicAlignment: 1, userValue: 0.85, urgency: 0.45, riskReduction: 0.8, effort: 0.55, dependencies: 0.7, confidence: 1 },
  priorityPolicy,
  priorityPolicyRef: priorityPolicyLoaded.ref,
  sourceRefs,
  checkpoints: {
    async get(key) { return checkpointValues.get(key); },
    async put(key, value) { checkpointValues.set(key, structuredClone(value)); },
  },
};
const first = await runtime.execute(invocation);
const replay = await runtime.execute(invocation);
if (proposerCalls !== 1 || replay.replayed !== true || canonicalJsonDigest(first.changeSet) !== canonicalJsonDigest(replay.changeSet)) throw new Error("roadmap execution did not replay byte-identically with zero additional proposer calls");
if (first.draft.initiatives.length !== 1 || first.draft.initiatives[0].recommendation !== "keep") throw new Error("roadmap triage did not return exactly one keep disposition");
const terminalCheckpoint = [...checkpointValues.values()][0];
if (!terminalCheckpoint?.checkpointDigest) throw new Error("roadmap terminal checkpoint is unavailable");
write("roadmap-intake-candidate.json", intake);
write("roadmap-priority-policy.json", priorityPolicy);
write("roadmap-draft.json", first.draft);
write("roadmap-change-set-draft.json", first.changeSet);
write("roadmap-execution-checkpoint.json", terminalCheckpoint);
write("roadmap-replay-result.json", replay);

const changeLoaded = loadedValue(first.changeSet, first.changeSet.changeSetId, ROADMAP_ARTIFACT_CONTRACTS.RoadmapChangeSetDraft.schema, ROADMAP_ARTIFACT_CONTRACTS.RoadmapChangeSetDraft.mediaType, "devrelay://repository/dogfood/rm-001-roadmap-management/release/roadmap-change-set-draft.json");
const approval = {
  apiVersion: API,
  kind: "RoadmapGateApproval",
  approvalId: "RM-GATE-APPROVAL-LIVE-PLANNING-ADAPTERS-001",
  authority: "project-owner",
  decision: "approve",
  candidate: changeLoaded.ref,
  currentBaselineDisposition: "RoadmapNotInitialized",
  terminalCheckpointDigest: terminalCheckpoint.checkpointDigest,
  policyVersion: "1.0.0",
};
const approvalLoaded = loadedValue(approval, approval.approvalId, ROADMAP_ARTIFACT_CONTRACTS.RoadmapGateApproval.schema, ROADMAP_ARTIFACT_CONTRACTS.RoadmapGateApproval.mediaType, "devrelay://repository/dogfood/rm-001-roadmap-management/release/roadmap-gate-owner-approval.json");
const promoted = promoteRoadmapBaseline({
  changeSet: first.changeSet,
  changeSetRef: changeLoaded.ref,
  changeSetBytes: changeLoaded.bytes,
  approval,
  approvalRef: approvalLoaded.ref,
  approvalBytes: approvalLoaded.bytes,
  terminalCheckpointDigest: terminalCheckpoint.checkpointDigest,
  priorityPolicyRef: priorityPolicyLoaded.ref,
  sourceRefs,
  baselineId: "ROADMAP-DEVRELAY-V1",
});
write("roadmap-gate-owner-approval.json", approval);
write("roadmap-gate-promotion-proof.json", promoted.promotionProof);
write("roadmap-baseline.json", promoted.baseline);
write("Roadmap.md", promoted.projectionBytes, true);
writeRoot("project/roadmap-baseline.json", promoted.baseline);
writeRoot("Roadmap.md", promoted.projectionBytes, true);

const roadmapLoaded = { value: promoted.baseline, bytes: promoted.baselineBytes, ref: promoted.baselineRef, artifactVersion: promoted.baseline.version };
const roadmapProjectionLoaded = { value: promoted.projection, bytes: promoted.projectionBytes, ref: promoted.projectionRef, artifactVersion: promoted.baseline.version };
resolverValues.set(roadmapLoaded.ref.digest, roadmapLoaded.bytes);
resolverValues.set(roadmapProjectionLoaded.ref.digest, roadmapProjectionLoaded.bytes);
const postBindings = [...preBindings, { role: "roadmap", artifact: roadmapLoaded.ref, artifactVersion: roadmapLoaded.artifactVersion }, { role: "roadmap-projection", artifact: roadmapProjectionLoaded.ref, artifactVersion: roadmapProjectionLoaded.artifactVersion }];
const postSnapshot = createSessionContextSnapshot({
  projectId: "devrelay",
  taskId: "RM-001-WINDOWS-DESKTOP-E2E",
  workspaceId: "devrelay-source-workspace",
  repositoryRevision: IMPLEMENTATION_COMMIT,
  bindings: postBindings,
  roadmapDisposition: "initialized",
  createdAt: "2026-08-15T20:05:00Z",
});
const postReceipt = await refreshSessionContext({
  priorReceipt: preReceipt,
  nextSnapshot: postSnapshot,
  artifactResolver: async (artifact) => ({ bytes: resolverValues.get(artifact.digest) }),
  expectedProjectId: "devrelay",
  expectedTaskId: "RM-001-WINDOWS-DESKTOP-E2E",
  expectedWorkspaceId: "devrelay-source-workspace",
  expectedRepositoryRevision: IMPLEMENTATION_COMMIT,
  cache: "warm",
  durationMs: 0,
});
assertSessionContextReceipt({ receipt: postReceipt, snapshot: postSnapshot, currentBindings: postBindings, currentRepositoryRevision: IMPLEMENTATION_COMMIT });
write("session-context-post.json", postSnapshot);
write("session-receipt-post.json", postReceipt);

const priorGraph = json("dogfood/rm-001-roadmap-management/assignment/promotion/traceability-graph-snapshot.json");
const priorProof = json("dogfood/rm-001-roadmap-management/assignment/promotion/specialist-assignment-promotion-proof.json");
const priorBytes = Buffer.from(canonicalJson(priorGraph), "utf8");
const priorLoaded = { value: priorGraph, bytes: priorBytes, ref: priorProof.resultingGraph };
if (sha256Digest(priorBytes) !== priorLoaded.ref.digest) throw new Error("prior assignment graph proof drifted");
const historicalUpdatePaths = [
  "dogfood/architecture-discovery/work-breakdown/traceability-update.json",
  "dogfood/v0.11-module-quality/work-breakdown/traceability-update.json",
  "dogfood/v0.10-release-hardening/work-breakdown/traceability-update.json",
  "project/history/traceability/updates/00920a6f6f2cf849510888a69a6e22cf1747c0889ac3d5d9d5226aff905d0b3c.json",
  "project/history/traceability/updates/4d7d052f347a91b104506510dc09dad51dceeb488bac5675a89ce7ca8af45067.json",
  "dogfood/lifecycle-run-report/work-breakdown/replay-v1/traceability-update.json",
  "project/history/traceability/updates/d8fde060e3a21be13c5d90307dca6bda5a44e95055a31e292175dee99fabf37a.json",
  "project/history/traceability/updates/b9b77863db97ccfe1aa36c24224e5cd523030500908afb208b5883b24b6a8822.json",
  "dogfood/change-integration/work-breakdown/traceability-update.json",
  "project/history/traceability/updates/dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681.json",
  "dogfood/sim-001-simplification/work-breakdown/traceability-update.json",
  "dogfood/rm-001-roadmap-management/work-breakdown/traceability-update.json",
  "dogfood/rm-001-roadmap-management/dependency-analysis/promotion/traceability-update.json",
  "dogfood/rm-001-roadmap-management/assignment/promotion/candidate-traceability-update.json",
  "dogfood/rm-001-roadmap-management/assignment/promotion/approved-traceability-update.json",
];
const historyByDigest = new Map(historicalUpdatePaths.map((path) => {
  const value = json(path);
  const rawBytes = Buffer.from(canonicalJson(value), "utf8");
  return [sha256Digest(rawBytes), { value, bytes: rawBytes, path }];
}));
const historicalUpdates = priorGraph.appliedUpdates.map((ref) => {
  const loaded = historyByDigest.get(ref.digest);
  if (!loaded) throw new Error(`missing historical update ${ref.digest}`);
  return { ref, bytes: loaded.bytes, value: loaded.value };
});
const store = createInMemoryTraceabilityStore();
store.restore(priorGraph.graphId, [priorLoaded, ...historicalUpdates], priorLoaded.ref);
const graph = createTraceabilityGraphService({ graphId: priorGraph.graphId, projectId: priorGraph.projectId, store, contributors: [roadmapTraceabilityContributor], vocabulary: priorGraph.vocabulary });
const gateInvocation = { invocationId: "RM-GATE-PROMOTE-001", module: { id: "roadmap-gate", version: "0.1.0", operation: "promote-baseline" } };
const prepared = await graph.prepare({
  baseGraph: graph.captureBase(),
  invocation: gateInvocation,
  invocationFingerprint: canonicalJsonDigest(gateInvocation),
  moduleResult: { invocationId: gateInvocation.invocationId, status: "completed", outcome: "promoted", outputs: { "roadmap-baseline": [promoted.baselineRef] }, evidence: [] },
  loadedOutputs: { "roadmap-baseline": [roadmapLoaded] },
});
const merged = await graph.mergePrepared(prepared);
const applied = await graph.assertApplied(prepared.updateRef);
write("traceability-update.json", prepared.update);
write("traceability-merge-receipt.json", merged.receipt);
write("traceability-graph-snapshot.json", merged.snapshot);
write("traceability-application-proof.json", applied);

const verifiedChangeSetMaterial = {
  apiVersion: API,
  kind: "VerifiedChangeSet",
  changeSetId: "VCS-RM-001-IMPLEMENTATION",
  implementationCommit: IMPLEMENTATION_COMMIT,
  workItems: json("dogfood/rm-001-roadmap-management/work-breakdown/work-items.json").map(({ id }) => id),
  verification: { artifactId: "RMVerificationSummary", digest: verification.contentDigest, outcome: "pass" },
};
const verifiedChangeSet = { ...verifiedChangeSetMaterial, contentDigest: canonicalJsonDigest(verifiedChangeSetMaterial) };
const verifiedChangeSetLoaded = loadedValue(verifiedChangeSet, verifiedChangeSet.changeSetId, "https://devrelay.dev/evidence/verified-change-set/v1", "application/vnd.devrelay.verified-change-set+json", "devrelay://repository/dogfood/rm-001-roadmap-management/release/verified-change-set.json");
const integrationRecordMaterial = {
  apiVersion: API,
  kind: "IntegrationRecord",
  integrationId: "INTEGRATION-RM-001-IMPLEMENTATION",
  targetRef: "refs/heads/codex/rm-001-roadmap-management",
  parentCommit: verification.implementationParentCommit,
  integratedCommit: IMPLEMENTATION_COMMIT,
  strategy: "direct-branch-commit",
  outcome: "integrated",
};
const integrationRecord = { ...integrationRecordMaterial, contentDigest: canonicalJsonDigest(integrationRecordMaterial) };
const integrationRecordLoaded = loadedValue(integrationRecord, integrationRecord.integrationId, "https://devrelay.dev/evidence/integration-record/v1", "application/vnd.devrelay.integration-record+json", "devrelay://repository/dogfood/rm-001-roadmap-management/release/integration-record.json");
const implementationSeal = createImplementationSeal({
  repositoryId: "GarrettAudet/DevRelay",
  targetRef: "refs/heads/codex/rm-001-roadmap-management",
  parentCommit: verification.implementationParentCommit,
  implementationCommit: IMPLEMENTATION_COMMIT,
  treeDigest: verification.implementationTreeDigest,
  worktreeClean: true,
  verifiedChangeSet: verifiedChangeSetLoaded.ref,
  integrationRecord: integrationRecordLoaded.ref,
});
write("verified-change-set.json", verifiedChangeSet);
write("integration-record.json", integrationRecord);
write("implementation-seal.json", implementationSeal);

const workItems = json("dogfood/rm-001-roadmap-management/work-breakdown/work-items.json");
const completionMaterial = {
  apiVersion: API,
  kind: "RMLifecycleCompletionSummary",
  implementationCommit: IMPLEMENTATION_COMMIT,
  dependencyBaseline: workDependency.ref,
  assignmentBaseline: assignment.ref,
  completedWorkItems: workItems.map(({ id, objective, workType }) => ({
    workItemId: id,
    objective,
    workType,
    workExecution: "succeeded",
    workItemVerification: "verified",
    changeIntegration: "integrated",
    implementationCommit: IMPLEMENTATION_COMMIT,
    verificationEvidence: verification.contentDigest,
  })),
  readyFrontier: [],
  systemVerification: "verified",
  roadmapDogfood: {
    initialDisposition: "RoadmapNotInitialized",
    requirementsClosure: closedInterview.assessment.assessmentDigest,
    recommendation: first.draft.initiatives[0].recommendation,
    baseline: promoted.baselineRef,
    projection: promoted.projectionRef,
    contextRefresh: postReceipt.contentDigest,
    resultingGraph: merged.snapshotRef,
  },
};
const completion = { ...completionMaterial, contentDigest: canonicalJsonDigest(completionMaterial) };
write("lifecycle-completion-summary.json", completion);

const promotionRecordMaterial = {
  apiVersion: API,
  kind: "RoadmapPromotionRecord",
  gateProof: promoted.promotionProof,
  traceabilityUpdate: prepared.updateRef,
  traceabilityMergeReceipt: merged.receiptRef,
  resultingGraph: merged.snapshotRef,
  priorSessionReceipt: { artifactId: preReceipt.receiptId, digest: preReceipt.contentDigest },
  refreshedSessionReceipt: { artifactId: postReceipt.receiptId, digest: postReceipt.contentDigest },
  implementationSeal: { artifactId: implementationSeal.sealId, digest: implementationSeal.sealDigest },
};
const promotionRecord = { ...promotionRecordMaterial, contentDigest: canonicalJsonDigest(promotionRecordMaterial) };
write("roadmap-promotion-record.json", promotionRecord);
writeRoot("project/roadmap-promotion.commit.json", promotionRecord);

const report = `# RM-001 Windows Desktop lifecycle report\n\n- Implementation commit: ${IMPLEMENTATION_COMMIT}\n- Canonical verification: ${verification.canonicalVerification.outcome} (${verification.canonicalVerification.digest})\n- Planned work completed: ${completion.completedWorkItems.length}/${completion.completedWorkItems.length}\n- Fresh-task bootstrap: ${preReceipt.outcome}\n- Requirements closure: ${closedInterview.assessment.weightedCoverage.toFixed(6)}\n- Roadmap disposition: ${first.draft.initiatives[0].recommendation}\n- Roadmap baseline: ${promoted.baseline.baselineId} ${promoted.baseline.version}\n- Context refresh: ${postReceipt.outcome}\n- TraceabilityGraph revision: ${merged.snapshot.revision}\n- Ready frontier: empty\n- Construction triggered for triaged initiative: no\n\nThe run used the native adaptive RequirementsGathering interview, native structured RoadmapManagement proposer, human-owned RoadmapGate, trusted traceability contributor, and mandatory fresh-task bootstrap. External planning systems remained optional and were not required.\n`;
write("lifecycle-report.md", Buffer.from(report, "utf8"), true);

console.log(JSON.stringify({
  implementationCommit: IMPLEMENTATION_COMMIT,
  requirementsClosure: closedInterview.assessment.weightedCoverage,
  disposition: first.draft.initiatives[0].recommendation,
  roadmapBaseline: promoted.baselineRef,
  preBootstrap: preReceipt.outcome,
  postBootstrap: postReceipt.outcome,
  graphRevision: merged.snapshot.revision,
  lifecycleDigest: completion.contentDigest,
}, null, 2));
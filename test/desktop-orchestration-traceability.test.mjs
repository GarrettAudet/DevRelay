import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../src/desktop-project-memory-bootstrap.mjs";
import { desktopOrchestrationApprovedTraceabilityContributor, desktopOrchestrationCandidateTraceabilityContributor } from "../src/desktop-orchestration-traceability-contributor.mjs";
import { validateDesktopOrchestrationArtifact } from "../src/desktop-orchestration-artifact-validator.mjs";
import { createDesktopOrchestrationPlan } from "../src/desktop-orchestration.mjs";
import { evaluateDesktopMergeReadiness, resolveDesktopReviewRequirement } from "../src/desktop-review-policy.mjs";
import { createDesktopTaskAdapter, createDesktopTaskPlan } from "../src/desktop-task-adapter.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService, diagnoseTraceabilityGraph, queryTraceabilityGraph } from "../src/traceability-graph.mjs";

const root = path.resolve(new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const REVISION = "a".repeat(40);
const fullRef = (artifactId, digest, schema = "https://devrelay.dev/evidence/desktop-orchestration/v1") => ({ artifactId, digest, schema, mediaType: "application/json", uri: `memory://devrelay/test/${artifactId}/${digest.slice(7)}.json` });
const loaded = (value, artifactId = value.runId ?? value.attemptId ?? value.receiptId ?? value.integrationId ?? value.kind, schema) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: fullRef(artifactId, sha256Digest(bytes), schema) };
};
const seal = (body, field) => ({ ...body, [field]: canonicalJsonDigest(body) });

function requirementsPair() {
  const requirementBytes = fs.readFileSync(path.join(root, "project", "requirements-baseline.json"));
  const overviewBytes = fs.readFileSync(path.join(root, "project", "project-overview-baseline.json"));
  const requirementValue = JSON.parse(requirementBytes);
  const overviewValue = JSON.parse(overviewBytes);
  return {
    requirements: { value: requirementValue, bytes: requirementBytes, ref: fullRef(requirementValue.baselineId, sha256Digest(requirementBytes), "https://devrelay.dev/artifacts/requirements-baseline/v1") },
    overview: { value: overviewValue, bytes: overviewBytes, ref: fullRef(overviewValue.baselineId, sha256Digest(overviewBytes), "https://devrelay.dev/artifacts/project-overview-baseline/v1") },
  };
}

async function seededGraph() {
  const graph = createTraceabilityGraphService({ graphId: "devrelay/desktop-trace-test", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [requirementsBaselineObserverContributor, desktopOrchestrationCandidateTraceabilityContributor, desktopOrchestrationApprovedTraceabilityContributor] });
  const pair = requirementsPair();
  const invocation = { invocationId: "REQ-OBSERVE", module: { id: "architecture-design", version: "0.1.0", operation: "design" } };
  const prepared = await graph.prepare({ projectId: "devrelay", invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome: "drafted", outputs: {}, evidence: [], diagnostics: [] }, loadedInputs: { "requirements-baseline": [pair.requirements], "project-overview-baseline": [pair.overview] }, baseGraph: graph.captureBase() });
  await graph.mergePrepared(prepared);
  return graph;
}

async function fixture() {
  const graph = await seededGraph();
  const planValue = createDesktopOrchestrationPlan({ runId: "RUN-LIVE-MEMORY", projectId: "devrelay", horizonDigest: canonicalJsonDigest({ horizon: "approved-do-001" }), startingRevision: REVISION, maxConcurrency: 1, workItems: [{ id: "WI-DO-LIVE-MEMORY", dependencies: [], acceptanceCriteria: ["AC-DO-DESKTOP-E2E-001", "AC-DO-TRACEABILITY-001"] }] });
  const leaseValue = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorktreeLease", attemptId: "ATT-LIVE-MEMORY", runId: planValue.runId, workItemId: "WI-DO-LIVE-MEMORY", revision: REVISION, workspace: "C:/worktrees/ATT-LIVE-MEMORY", taskId: "TASK-LIVE-MEMORY", status: "active", cleanupDisposition: "retain" };
  const prompt = fullRef("PROMPT-LIVE-MEMORY", canonicalJsonDigest({ prompt: "verify injected memory" }));
  const memoryBootstrap = loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId: "ATT-LIVE-MEMORY", repositoryRevision: REVISION });
  const taskPlanValue = createDesktopTaskPlan({ runId: planValue.runId, workItem: { id: "WI-DO-LIVE-MEMORY" }, projectId: "devrelay", startingRevision: REVISION, worktreeLease: leaseValue, assignment: { profile: "independent-memory-verifier" }, executor: { id: "chatgpt.desktop", version: "1.0.0" }, grants: [], promptArtifact: prompt, memoryBootstrap });
  validateDesktopOrchestrationArtifact(taskPlanValue);
  const adapter = createDesktopTaskAdapter({ providerId: "chatgpt.desktop", providerVersion: "1.0.0", handlers: Object.fromEntries(["create", "inspect", "wait", "message", "handoff"].map((operation) => [operation, async () => ({ taskId: "TASK-LIVE-MEMORY", status: operation === "create" ? "ready" : "completed", observation: { operation } })])) });
  const receiptValue = await adapter.invoke("create", { plan: taskPlanValue });
  const requirementValue = resolveDesktopReviewRequirement({ workItemId: "WI-DO-LIVE-MEMORY", subjectDigest: taskPlanValue.planDigest, risk: "high", tags: ["release"] });
  const recoveryValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopOrchestrationRecovery", runId: planValue.runId, outcome: "recovered", uncertainWorkItemIds: [], duplicateEffectsAllowed: false, stateVersion: 8 }, "recoveryDigest");
  const conclusionValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopSessionConclusionCandidate", projectId: "devrelay", sessionId: "SESSION-LIVE-MEMORY", taskId: "TASK-LIVE-MEMORY", startingBaseline: { baselineId: "PMB-TEST", digest: canonicalJsonDigest({ baseline: 1 }) }, transcriptDigest: null, reason: "session-end", checkpointDigests: [], authority: "candidate-only" }, "conclusionDigest");
  const artifacts = { plan: loaded(planValue, "PLAN-LIVE-MEMORY"), taskPlan: loaded(taskPlanValue, "TASK-PLAN-LIVE-MEMORY"), lease: loaded(leaseValue, "LEASE-LIVE-MEMORY"), receipt: loaded(receiptValue, "TASK-RECEIPT-LIVE-MEMORY"), requirement: loaded(requirementValue, "REVIEW-REQUIREMENT-LIVE-MEMORY"), recovery: loaded(recoveryValue, "RECOVERY-LIVE-MEMORY"), conclusion: loaded(conclusionValue, "CONCLUSION-LIVE-MEMORY") };
  const invocation = { invocationId: "DESKTOP-CANDIDATE", module: { id: "desktop-orchestration", version: "0.1.0", operation: "project-run" } };
  const candidate = await graph.prepare({ projectId: "devrelay", invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome: "planned", outputs: {}, evidence: [], diagnostics: [] }, loadedInputs: { plan: [artifacts.plan], taskPlans: [artifacts.taskPlan], leases: [artifacts.lease], receipts: [artifacts.receipt], requirements: [artifacts.requirement], recovery: [artifacts.recovery], conclusions: [artifacts.conclusion] }, baseGraph: graph.captureBase() });
  const candidateMerge = await graph.mergePrepared(candidate);
  return { graph, artifacts, values: { planValue, taskPlanValue, requirementValue, recoveryValue }, candidateMerge };
}

test("Desktop orchestration contributors preserve candidate and approved lifecycle provenance", async () => {
  const fx = await fixture();
  const reviewValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopReviewReceipt", runId: fx.values.planValue.runId, workItemId: "WI-DO-LIVE-MEMORY", implementerTaskId: "TASK-LIVE-MEMORY", reviewerTaskId: "TASK-INDEPENDENT-REVIEW", subjectDigest: fx.values.taskPlanValue.planDigest, requirementDigest: fx.values.requirementValue.requirementDigest, adversarial: true, disposition: "pass", evidence: [fx.artifacts.receipt.ref], authority: "verification-observation-only" }, "receiptDigest");
  const readinessValue = evaluateDesktopMergeReadiness({ requirement: fx.values.requirementValue, implementerTaskId: "TASK-LIVE-MEMORY", testDisposition: "pass", reviewDisposition: "pass", adversarialReview: { reviewerTaskId: "TASK-INDEPENDENT-REVIEW", subjectDigest: fx.values.taskPlanValue.planDigest, disposition: "pass" } });
  const review = loaded(reviewValue, "REVIEW-RECEIPT-LIVE-MEMORY");
  const readiness = loaded(readinessValue, "MERGE-READINESS-LIVE-MEMORY");
  const integrationValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopChangeIntegrationRecord", integrationId: "INTEGRATION-LIVE-MEMORY", runId: fx.values.planValue.runId, workItemId: "WI-DO-LIVE-MEMORY", taskPlan: fx.artifacts.taskPlan.ref, mergeReadiness: readiness.ref, implementationCommit: REVISION, targetBranch: "codex/test", conflicts: [], outcome: "integrated" }, "integrationDigest");
  const integration = loaded(integrationValue, integrationValue.integrationId);
  const invocation = { invocationId: "DESKTOP-APPROVED", module: { id: "desktop-orchestration", version: "0.1.0", operation: "project-run" } };
  const prepared = await fx.graph.prepare({ projectId: "devrelay", invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome: "integrated", outputs: {}, evidence: [], diagnostics: [] }, loadedInputs: { taskPlan: [fx.artifacts.taskPlan], taskReceipt: [fx.artifacts.receipt], requirement: [fx.artifacts.requirement], review: [review], readiness: [readiness], recovery: [fx.artifacts.recovery], integration: [integration] }, baseGraph: fx.graph.captureBase() });
  const merged = await fx.graph.mergePrepared(prepared);
  assert.equal(merged.snapshot.nodes.some(({ scope, kind, stableId }) => scope === "desktop-orchestration/candidate" && kind === "work-item" && stableId === "WI-DO-LIVE-MEMORY"), true);
  assert.equal(merged.snapshot.nodes.some(({ scope, kind, stableId }) => scope === "desktop-orchestration/approved" && kind === "integrated-change-record" && stableId === integrationValue.integrationId), true);
  assert.equal(diagnoseTraceabilityGraph(merged.snapshot).some(({ code }) => code === "TG_DANGLING_EDGE"), false);
  const impact = queryTraceabilityGraph(merged.snapshot, { start: { kind: "acceptance-criterion", stableId: "AC-DO-TRACEABILITY-001", authority: "approved", scope: "requirements/baseline" }, direction: "outgoing" });
  assert.equal(impact.nodes.some(({ stableId }) => stableId === integrationValue.integrationId), true);
  const provenance = queryTraceabilityGraph(merged.snapshot, { start: { kind: "integrated-change-record", stableId: integrationValue.integrationId, authority: "approved", scope: "desktop-orchestration/approved" }, direction: "incoming" });
  assert.equal(provenance.nodes.some(({ stableId }) => stableId === "AC-DO-TRACEABILITY-001"), true);
});

test("Desktop orchestration traceability rejects stale, self-reviewed, and adapter-authored facts", async () => {
  const fx = await fixture();
  const stale = structuredClone(fx.artifacts.receipt.value);
  stale.planDigest = canonicalJsonDigest({ substituted: true });
  stale.receiptDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(stale).filter(([key]) => key !== "receiptDigest")));
  const staleLoaded = loaded(stale, "STALE-RECEIPT");
  const invocation = { invocationId: "DESKTOP-STALE", module: { id: "desktop-orchestration", version: "0.1.0", operation: "project-run" } };
  await assert.rejects(() => fx.graph.prepare({ projectId: "devrelay", invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome: "planned", outputs: {}, evidence: [], diagnostics: [] }, loadedInputs: { plan: [fx.artifacts.plan], taskPlans: [fx.artifacts.taskPlan], leases: [fx.artifacts.lease], receipts: [staleLoaded], requirements: [fx.artifacts.requirement], recovery: [fx.artifacts.recovery], conclusions: [fx.artifacts.conclusion] }, baseGraph: fx.graph.captureBase() }), /stale task-plan lineage/u);
  const selfReview = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopReviewReceipt", runId: fx.values.planValue.runId, workItemId: "WI-DO-LIVE-MEMORY", implementerTaskId: "TASK-LIVE-MEMORY", reviewerTaskId: "TASK-LIVE-MEMORY", subjectDigest: fx.values.taskPlanValue.planDigest, requirementDigest: fx.values.requirementValue.requirementDigest, adversarial: true, disposition: "pass", evidence: [fx.artifacts.receipt.ref], authority: "verification-observation-only" }, "receiptDigest");
  assert.throws(() => validateDesktopOrchestrationArtifact(selfReview), /self-review/u);
  const readinessValue = evaluateDesktopMergeReadiness({ requirement: fx.values.requirementValue, implementerTaskId: "TASK-LIVE-MEMORY", testDisposition: "pass", reviewDisposition: "pass", adversarialReview: { reviewerTaskId: "TASK-INDEPENDENT-REVIEW", subjectDigest: fx.values.taskPlanValue.planDigest, disposition: "pass" } });
  const readiness = loaded(readinessValue, "MERGE-READINESS-NEGATIVE");
  const integrationValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopChangeIntegrationRecord", integrationId: "INTEGRATION-NEGATIVE", runId: fx.values.planValue.runId, workItemId: "WI-DO-LIVE-MEMORY", taskPlan: fx.artifacts.taskPlan.ref, mergeReadiness: readiness.ref, implementationCommit: REVISION, targetBranch: "codex/test", conflicts: [], outcome: "integrated" }, "integrationDigest");
  const integration = loaded(integrationValue, integrationValue.integrationId);
  for (const mutation of [
    { subjectDigest: canonicalJsonDigest({ unrelated: true }) },
    { implementerTaskId: "TASK-UNRELATED" },
    { runId: "RUN-UNRELATED" },
  ]) {
    const reviewBody = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopReviewReceipt", runId: fx.values.planValue.runId, workItemId: "WI-DO-LIVE-MEMORY", implementerTaskId: "TASK-LIVE-MEMORY", reviewerTaskId: "TASK-INDEPENDENT-REVIEW", subjectDigest: fx.values.taskPlanValue.planDigest, requirementDigest: fx.values.requirementValue.requirementDigest, adversarial: true, disposition: "pass", evidence: [fx.artifacts.receipt.ref], authority: "verification-observation-only", ...mutation };
    const forged = loaded(seal(reviewBody, "receiptDigest"), `FORGED-${Object.keys(mutation)[0]}`);
    const approvedInvocation = { invocationId: `DESKTOP-FORGED-${Object.keys(mutation)[0]}`, module: { id: "desktop-orchestration", version: "0.1.0", operation: "project-run" } };
    await assert.rejects(() => fx.graph.prepare({ projectId: "devrelay", invocation: approvedInvocation, invocationFingerprint: canonicalJsonDigest(approvedInvocation), moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: approvedInvocation.invocationId, status: "completed", outcome: "integrated", outputs: {}, evidence: [], diagnostics: [] }, loadedInputs: { taskPlan: [fx.artifacts.taskPlan], taskReceipt: [fx.artifacts.receipt], requirement: [fx.artifacts.requirement], review: [forged], readiness: [readiness], recovery: [fx.artifacts.recovery], integration: [integration] }, baseGraph: fx.graph.captureBase() }), /review receipt is not an independent pass/u);
  }
  const adapterInvocation = { invocationId: "ADAPTER-AUTHORED", module: { id: "chatgpt.desktop-adapter", version: "1.0.0", operation: "project-run" } };
  await assert.rejects(() => fx.graph.prepare({ projectId: "devrelay", invocation: adapterInvocation, invocationFingerprint: canonicalJsonDigest(adapterInvocation), moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: adapterInvocation.invocationId, status: "completed", outcome: "planned", outputs: { evidence: [fx.artifacts.receipt.ref] }, evidence: [], diagnostics: [] }, loadedOutputs: { evidence: [fx.artifacts.receipt] }, baseGraph: fx.graph.captureBase() }), /no traceability contributor matches/u);
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  CrossCuttingCompositionError,
  createCrossCuttingCompositionPlan,
  executeCrossCuttingBoundary,
} from "../src/cross-cutting-composition.mjs";
import {
  QualityPolicyError,
  createQualityPolicyCandidate,
  createQualityPolicyContext,
  evaluateQualityEvidence,
  promoteQualityPolicyBaseline,
  resolveQualityObligations,
} from "../src/quality-policy.mjs";
import {
  WorkContinuityError,
  claimWorkAttempt,
  createDurableWorkContinuityStore,
  createWorkContinuityIndex,
  createWorkFingerprintInput,
  deriveWorkFingerprint,
  findExactWorkReuse,
  findSimilarWorkCandidates,
  reconcileWorkContinuity,
  transitionWorkAttempt,
} from "../src/work-continuity.mjs";
import {
  assessProjectProductivity,
  createProjectControlSourceBundle,
  createProjectControlSnapshot,
  verifyProjectControlSnapshot,
} from "../src/project-control.mjs";
import { resolveWorkflowProfile } from "../src/workflow-profiles.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../src/desktop-project-memory-bootstrap.mjs";
import { createDesktopTaskPlan } from "../src/desktop-task-adapter.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createDesktopOrchestrationPlan } from "../src/desktop-orchestration.mjs";
import { createDesktopOperatorSnapshot, renderDesktopOperatorSnapshot } from "../src/desktop-operator-view.mjs";

const digest = (value) => canonicalJsonDigest({ value });
const publishedQualityModule = JSON.parse(readFileSync(new URL("../examples/modules/quality-policy.module.json", import.meta.url), "utf8"));
const binding = (overrides = {}) => ({
  id: "quality",
  boundary: "before-task-dispatch",
  moduleId: "quality-policy",
  moduleVersion: "0.1.0",
  operationId: "resolve-obligations",
  inputPorts: ["work-item"],
  outputPorts: ["quality-resolution"],
  dependsOn: [],
  configurationDigest: digest("config"),
  grantDigest: digest("grant"),
  failureBehavior: "stop",
  enabled: true,
  ...overrides,
});

function definitionsFor(bindings) {
  const definitions = new Map();
  for (const item of bindings) {
    const key = `${item.moduleId}@${item.moduleVersion}`;
    if (!definitions.has(key)) definitions.set(key, { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleDefinition", metadata: { id: item.moduleId, version: item.moduleVersion }, operations: [] });
    const definition = definitions.get(key);
    if (!definition.operations.some(({ id }) => id === item.operationId)) definition.operations.push({ id: item.operationId, inputs: item.inputPorts.map((name) => ({ name, required: true })), outputs: item.outputPorts.map((name) => ({ name })) });
  }
  return [...definitions.values()];
}
const composition = ({ bindings, availablePorts = [] }) => createCrossCuttingCompositionPlan({ bindings, availablePorts, moduleDefinitions: definitionsFor(bindings) });

test("cross-cutting bindings resolve deterministically and execute only at their declared boundary", async () => {
  const continuity = binding({ id: "continuity", moduleId: "work-continuity", operationId: "decide-reuse", inputPorts: ["quality-resolution"], outputPorts: ["reuse-decision"], dependsOn: ["quality"] });
  const left = composition({ bindings: [continuity, binding()], availablePorts: ["work-item"] });
  const right = composition({ bindings: [binding(), continuity], availablePorts: ["work-item"] });
  assert.equal(left.planDigest, right.planDigest);
  assert.deepEqual(left.bindings.map(({ id }) => id), ["quality", "continuity"]);
  const invoked = [];
  const result = await executeCrossCuttingBoundary({
    plan: left,
    boundary: "before-task-dispatch",
    artifacts: { "work-item": { id: "WI-1" } },
    invoke(item) {
      invoked.push(item.moduleId);
      return item.id === "quality" ? { "quality-resolution": { pass: true } } : { "reuse-decision": { decision: "execute" } };
    },
  });
  assert.deepEqual(invoked, ["quality-policy", "work-continuity"]);
  assert.equal(result.receipts.every(({ status }) => status === "pass"), true);
});

test("cross-cutting composition rejects cycles, missing ports, and ambiguous producers", () => {
  assert.throws(() => composition({ bindings: [binding({ dependsOn: ["later"] }), binding({ id: "later", dependsOn: ["quality"] })], availablePorts: ["work-item"] }), (error) => error instanceof CrossCuttingCompositionError && error.code === "DR7006");
  assert.throws(() => composition({ bindings: [binding({ inputPorts: ["hidden-context"] })] }), (error) => error instanceof CrossCuttingCompositionError && error.code === "DR7007");
  assert.throws(() => composition({ bindings: [binding(), binding({ id: "duplicate-producer", moduleId: "project-control" })], availablePorts: ["work-item"] }), (error) => error instanceof CrossCuttingCompositionError && error.code === "DR7008");
});

test("cross-cutting composition binds exact ModuleDefinition and operation contracts", () => {
  const exact = publishedQualityModule.operations.find(({ id }) => id === "resolve-obligations");
  const item = binding({ inputPorts: exact.inputs.map(({ name }) => name), outputPorts: exact.outputs.map(({ name }) => name) });
  const plan = createCrossCuttingCompositionPlan({ bindings: [item], availablePorts: item.inputPorts, moduleDefinitions: [publishedQualityModule] });
  assert.equal(plan.bindings[0].moduleDefinitionDigest, canonicalJsonDigest(publishedQualityModule));
  assert.equal(plan.bindings[0].operationContractDigest, canonicalJsonDigest(exact));
  assert.throws(() => createCrossCuttingCompositionPlan({ bindings: [binding()], availablePorts: ["work-item"], moduleDefinitions: [publishedQualityModule] }), (error) => error instanceof CrossCuttingCompositionError && error.code === "DR7011");
});

test("Desktop orchestration binds the exact generic cross-cutting plan without Module-specific routing", () => {
  const crossCuttingPlan = composition({ bindings: [binding()], availablePorts: ["work-item"] });
  const plan = createDesktopOrchestrationPlan({ runId: "RUN-QC", projectId: "devrelay", horizonDigest: digest("horizon"), startingRevision: "a".repeat(40), workItems: [{ id: "WI-QC", dependencies: [] }], crossCuttingPlan });
  assert.equal(plan.crossCuttingPlanDigest, crossCuttingPlan.planDigest);
  assert.equal(plan.crossCuttingPlan.bindings[0].moduleId, "quality-policy");
});

function qualityFixture() {
  const candidate = createQualityPolicyCandidate({
    policyId: "QP-DEVRELAY",
    version: "1.0.0",
    sourceRefs: ["AC-QC-QUALITY-BASELINE-001"],
    rules: [{
      id: "RULE-HIGH-RISK",
      priority: 100,
      appliesTo: { riskLevels: ["high", "critical"] },
      obligations: [{ id: "independent-review", lane: "review", evidenceKinds: ["review/adversarial"], minimumPassing: 1, independent: true }],
    }, {
      id: "RULE-DEFAULT",
      priority: 0,
      appliesTo: {},
      obligations: [{ id: "focused-test", lane: "focused", evidenceKinds: ["test/focused"], minimumPassing: 1 }],
    }],
  });
  return promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval", authority: "QualityPolicyGate", decision: "approve", candidateDigest: candidate.candidateDigest } });
}

test("quality policy promotion is approval-bound and resolution merges profile, risk, and project rules", () => {
  const baseline = qualityFixture();
  const resolution = resolveQualityObligations({ baseline, workflowProfile: resolveWorkflowProfile({ profileName: "quick" }), riskContext: { level: "high" }, workItem: { id: "WI-1", type: "code-change" }, changedSurfaces: ["core"], technologies: ["node"], acceptanceCriteria: ["AC-1"] });
  assert.deepEqual(resolution.appliedRuleIds, ["RULE-DEFAULT", "RULE-HIGH-RISK"]);
  assert.ok(resolution.obligations.some(({ id }) => id === "independent-review"));
  assert.equal(resolution.authority.approvesWork, false);
  const blocked = evaluateQualityEvidence({ resolution, evidence: [{ kind: "review/adversarial", status: "pass", independent: false, digest: digest("review") }] });
  assert.equal(blocked.decision, "block");
  const evidence = resolution.obligations.map((obligation) => ({ kind: obligation.evidenceKinds[0], status: "pass", independent: true, producerIdentity: "reviewer", digest: digest(obligation.id) }));
  assert.equal(evaluateQualityEvidence({ resolution, evidence, changeProducerIdentities: ["implementer"] }).decision, "satisfied");
  const context = createQualityPolicyContext({ riskContext: { level: "high", sourceRefs: ["RISK"] }, changedSurfaces: ["core"], technologies: ["node"], acceptanceCriteria: ["AC-1"] });
  assert.equal(resolveQualityObligations({ baseline, workflowProfile: resolveWorkflowProfile({ profileName: "quick" }), context, workItem: { id: "WI-1", type: "code-change" } }).qualityPolicyContextDigest, context.contextDigest);
  assert.throws(() => resolveQualityObligations({ baseline, workflowProfile: { ...resolveWorkflowProfile(), description: "tampered" }, context, workItem: { id: "WI-1" } }), (error) => error instanceof QualityPolicyError && error.code === "DR7104");
  assert.throws(() => resolveQualityObligations({ baseline, workflowProfile: resolveWorkflowProfile(), context: { ...context, contextDigest: digest("tampered") }, workItem: { id: "WI-1" } }), (error) => error instanceof QualityPolicyError && error.code === "DR7104");
});

test("quality candidates cannot be promoted through stale or substituted approval", () => {
  const candidate = createQualityPolicyCandidate({ policyId: "QP", version: "1.0.0", rules: [{ id: "R", obligations: [{ id: "O", lane: "test", evidenceKinds: ["test/pass"] }] }] });
  assert.throws(() => promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval", authority: "Gate", decision: "approve", candidateDigest: digest("wrong") } }), (error) => error instanceof QualityPolicyError && error.code === "DR7103");
  assert.throws(() => createQualityPolicyCandidate({ policyId: "QP", version: "1.0.0", rules: [{ id: "R", obligations: [{ id: "O", lane: "test", evidenceKinds: [] }] }] }), (error) => error instanceof QualityPolicyError && error.code === "DR7101");
});

test("quality evidence counts only unique digest-bound evidence and exact waiver approvals", () => {
  const candidate = createQualityPolicyCandidate({ policyId: "QP", version: "1.0.0", rules: [{ id: "R", obligations: [{ id: "O", lane: "test", evidenceKinds: ["test/pass"], minimumPassing: 2 }] }] });
  const baseline = promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval", authority: "QualityPolicyGate", decision: "approve", candidateDigest: candidate.candidateDigest } });
  const resolution = resolveQualityObligations({ baseline, workflowProfile: resolveWorkflowProfile(), workItem: { id: "WI" } });
  const duplicated = { kind: "test/pass", status: "pass", digest: digest("same") };
  assert.equal(evaluateQualityEvidence({ resolution, evidence: [duplicated, duplicated, { kind: "test/pass", status: "pass", digest: "invalid" }] }).decision, "block");
  const waiverBody = { apiVersion: "devrelay.dev/v1alpha1", kind: "QualityPolicyWaiverApproval", authority: "project-owner", decision: "approve", resolutionDigest: resolution.resolutionDigest, obligationId: "O", rationale: "Accepted bounded exception" };
  const waiver = { ...waiverBody, approvalDigest: canonicalJsonDigest(waiverBody) };
  const workflowEvidence = resolution.obligations.filter(({ id }) => id !== "O").map((obligation) => ({ kind: obligation.evidenceKinds[0], status: "pass", digest: digest(obligation.id) }));
  assert.equal(evaluateQualityEvidence({ resolution, evidence: workflowEvidence, waivers: [waiver] }).decision, "satisfied");
  assert.equal(evaluateQualityEvidence({ resolution, waivers: [{ ...waiver, approvalDigest: digest("stale") }] }).decision, "block");
});

function fingerprint() {
  return deriveWorkFingerprint(createWorkFingerprintInput({
    projectId: "devrelay",
    requirementsBaselineDigest: digest("requirements"),
    projectOverviewBaselineDigest: digest("overview"),
    workItem: { id: "WI-1", type: "code-change", deliverable: "module" },
    targetRevision: "abc123",
    dependencyClosure: [{ id: "WI-0", digest: digest("dependency") }],
    assignment: { specialistId: "node-specialist", contractDigest: digest("assignment") },
    qualityResolutionDigest: digest("quality"),
    inputs: [{ artifactId: "INPUT", digest: digest("input") }],
    implementationConfigurationDigest: digest("implementation"),
  }));
}

test("work fingerprint input is digest-bound and rejects hidden context drift", () => {
  const input = createWorkFingerprintInput(fingerprint().material);
  assert.equal(deriveWorkFingerprint(input).fingerprint, input.inputDigest);
  assert.throws(() => deriveWorkFingerprint({ ...input, inputDigest: digest("substituted") }), (error) => error instanceof WorkContinuityError && error.code === "DR7201");
});

test("work continuity uses CAS leases and exact-only automatic reuse", () => {
  const workFingerprint = fingerprint();
  const claimed = claimWorkAttempt({ index: createWorkContinuityIndex(), expectedRevision: 0, workFingerprint, attemptId: "ATTEMPT-1", owner: "desktop", targetRevision: "abc123", qualityResolutionDigest: digest("quality"), leaseExpiresAt: 200 });
  assert.throws(() => claimWorkAttempt({ index: claimed.index, expectedRevision: 1, workFingerprint, attemptId: "ATTEMPT-2", owner: "desktop", targetRevision: "abc123", qualityResolutionDigest: digest("quality"), leaseExpiresAt: 300 }), (error) => error instanceof WorkContinuityError && error.code === "DR7206");
  let index = transitionWorkAttempt({ index: claimed.index, expectedRevision: 1, attemptId: "ATTEMPT-1", fromStatus: "prepared", toStatus: "dispatched" });
  index = transitionWorkAttempt({ index, expectedRevision: 2, attemptId: "ATTEMPT-1", fromStatus: "dispatched", toStatus: "running" });
  index = transitionWorkAttempt({ index, expectedRevision: 3, attemptId: "ATTEMPT-1", fromStatus: "running", toStatus: "completed", receiptDigest: digest("receipt"), resultDigest: digest("result"), evidenceDigest: digest("evidence") });
  const verifiedArtifactDigests = [digest("receipt"), digest("result"), digest("evidence")];
  assert.equal(findExactWorkReuse({ index, workFingerprint, targetRevision: "abc123", qualityResolutionDigest: digest("quality"), verifiedArtifactDigests }).decision, "reuse-exact");
  assert.equal(findExactWorkReuse({ index, workFingerprint, targetRevision: "abc123", qualityResolutionDigest: digest("quality"), verifiedArtifactDigests: verifiedArtifactDigests.slice(1) }).decision, "execute");
  assert.throws(() => findExactWorkReuse({ index, workFingerprint, targetRevision: "changed", qualityResolutionDigest: digest("quality"), verifiedArtifactDigests }), (error) => error instanceof WorkContinuityError && error.code === "DR7203");
  const similar = deriveWorkFingerprint({ ...workFingerprint.material, workItem: { ...workFingerprint.material.workItem, deliverable: "changed" } });
  assert.equal(findSimilarWorkCandidates({ index, workFingerprint: similar }).automaticReuseAllowed, false);
  assert.throws(() => findExactWorkReuse({ index, workFingerprint: { ...workFingerprint, fingerprint: digest("tampered") }, targetRevision: "abc123", qualityResolutionDigest: digest("quality"), verifiedArtifactDigests }), (error) => error instanceof WorkContinuityError && error.code === "DR7203");
  assert.throws(() => claimWorkAttempt({ index: createWorkContinuityIndex(), expectedRevision: 0, workFingerprint, attemptId: "ATTEMPT-X", owner: "desktop", targetRevision: "changed", qualityResolutionDigest: digest("quality"), leaseExpiresAt: 300 }), (error) => error instanceof WorkContinuityError && error.code === "DR7203");
  assert.throws(() => createWorkContinuityIndex({ records: [{ attemptId: "invalid" }] }), (error) => error instanceof WorkContinuityError && error.code === "DR7202");
});

test("uncertain work is reconciled and never declared safe to repeat", () => {
  const claimed = claimWorkAttempt({ index: createWorkContinuityIndex(), expectedRevision: 0, workFingerprint: fingerprint(), attemptId: "ATTEMPT-1", owner: "desktop", targetRevision: "abc123", qualityResolutionDigest: digest("quality"), leaseExpiresAt: 10 });
  const reconciliation = reconcileWorkContinuity({ index: claimed.index, now: 11 });
  assert.equal(reconciliation.items[0].disposition, "reconciliation-required");
  assert.equal(reconciliation.items[0].repeatAllowed, false);
  assert.deepEqual(reconciliation.safeToDispatchFingerprints, []);
});

test("work continuity index persists through LocalHostStorage restart with exact checkpoint bytes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devrelay-continuity-"));
  let storage = createLocalHostStorage({ rootDirectory: root });
  try {
    let durable = createDurableWorkContinuityStore({ storage, projectId: "devrelay" });
    const claimed = claimWorkAttempt({ index: durable.read().state.index, expectedRevision: 0, workFingerprint: fingerprint(), attemptId: "ATTEMPT-PERSIST", owner: "desktop", targetRevision: "abc123", qualityResolutionDigest: digest("quality"), leaseExpiresAt: Date.now() + 60_000 });
    durable.commit({ expectedHostVersion: 0, expectedIndexRevision: 0, transition: { operation: "claim", attemptId: "ATTEMPT-PERSIST" }, nextIndex: claimed.index });
    storage.close();
    storage = createLocalHostStorage({ rootDirectory: root });
    durable = createDurableWorkContinuityStore({ storage, projectId: "devrelay" });
    assert.equal(durable.read().state.index.records[0].attemptId, "ATTEMPT-PERSIST");
    assert.equal(storage.verifyIntegrity().artifacts, "ok");
  } finally {
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("DesktopTaskPlan binds exact memory, quality, and continuity identity into dispatch idempotency", () => {
  const revision = "a".repeat(40);
  const root = path.resolve(new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
  const baseline = qualityFixture();
  const qualityResolution = resolveQualityObligations({ baseline, workflowProfile: resolveWorkflowProfile(), workItem: { id: "WI-QC-1", type: "code-change" } });
  const workFingerprint = deriveWorkFingerprint({ projectId: "devrelay", requirementsBaselineDigest: digest("requirements"), projectOverviewBaselineDigest: digest("overview"), workItem: { id: "WI-QC-1", type: "code-change" }, targetRevision: revision, assignment: { profile: "implementation" }, qualityResolutionDigest: qualityResolution.resolutionDigest, implementationConfigurationDigest: digest("implementation") });
  const workContinuityDecision = findExactWorkReuse({ index: createWorkContinuityIndex(), workFingerprint, targetRevision: revision, qualityResolutionDigest: qualityResolution.resolutionDigest });
  const lease = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorktreeLease", attemptId: "ATT-QC-1", runId: "RUN-QC-1", workItemId: "WI-QC-1", revision, workspace: "C:/worktrees/ATT-QC-1", status: "active", cleanupDisposition: "retain" };
  const plan = createDesktopTaskPlan({ runId: "RUN-QC-1", workItem: { id: "WI-QC-1" }, projectId: "devrelay", startingRevision: revision, worktreeLease: lease, assignment: { profile: "implementation" }, executor: { id: "chatgpt.desktop" }, promptArtifact: { artifactId: "PROMPT-QC", digest: digest("prompt"), schema: "https://devrelay.dev/test/v1", mediaType: "application/json", uri: "memory://qc/prompt" }, memoryBootstrap: loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId: "ATT-QC-1", repositoryRevision: revision }), qualityResolution, workFingerprint, workContinuityDecision });
  assert.equal(plan.qualityResolutionDigest, qualityResolution.resolutionDigest);
  assert.equal(plan.workFingerprintDigest, workFingerprint.fingerprint);
  assert.equal(plan.workContinuityDecisionDigest, workContinuityDecision.decisionDigest);
  assert.notEqual(plan.idempotencyKey, createDesktopTaskPlan({ runId: "RUN-QC-1", workItem: { id: "WI-QC-1" }, projectId: "devrelay", startingRevision: revision, worktreeLease: lease, assignment: { profile: "implementation" }, executor: { id: "chatgpt.desktop" }, promptArtifact: { artifactId: "PROMPT-QC", digest: digest("prompt"), schema: "https://devrelay.dev/test/v1", mediaType: "application/json", uri: "memory://qc/prompt" }, memoryBootstrap: loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId: "ATT-QC-1", repositoryRevision: revision }) }).idempotencyKey);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-QC-1", workItem: { id: "WI-QC-1" }, projectId: "devrelay", startingRevision: revision, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: { artifactId: "P", digest: digest("p"), schema: "https://devrelay.dev/test/v1", mediaType: "application/json", uri: "memory://qc/p" }, memoryBootstrap: loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId: "ATT-QC-1", repositoryRevision: revision }), qualityResolution, workFingerprint: { ...workFingerprint, fingerprint: digest("drift") }, workContinuityDecision }), /work fingerprint digest drifted/u);
  assert.throws(() => createDesktopTaskPlan({ runId: "RUN-QC-1", workItem: { id: "WI-QC-1" }, projectId: "devrelay", startingRevision: revision, worktreeLease: lease, assignment: {}, executor: {}, promptArtifact: { artifactId: "P", digest: digest("p"), schema: "https://devrelay.dev/test/v1", mediaType: "application/json", uri: "memory://qc/p" }, memoryBootstrap: loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId: "ATT-QC-1", repositoryRevision: revision }), qualityResolution }), /must be bound together/u);
});

test("project control is deterministic, read-only, and surfaces inconsistent source observations", () => {
  const input = {
    projectId: "devrelay",
    lifecycle: { phase: "work-execution", baselineDigest: digest("lifecycle") },
    workItems: [{ id: "WI-2", status: "ready" }, { id: "WI-1", status: "completed" }],
    dependencies: [{ id: "EDGE-1", from: "WI-1", to: "WI-MISSING" }],
    qualityAssessments: [{ id: "QA-1", decision: "block" }],
    continuityRecords: [{ id: "WC-1", decision: "reuse-exact" }],
    sourceRefs: [{ id: "SRC-1", digest: digest("source") }],
  };
  const left = createProjectControlSnapshot(input);
  const bundle = createProjectControlSourceBundle({ ...input, workItems: [...input.workItems].reverse() });
  const right = createProjectControlSnapshot(bundle);
  assert.equal(left.snapshotDigest, right.snapshotDigest);
  assert.equal(verifyProjectControlSnapshot(left), true);
  assert.deepEqual(left.frontier, ["WI-2"]);
  assert.deepEqual(left.diagnostics.map(({ code }) => code), ["quality-obligations-missing", "unknown-dependency-endpoint"]);
  const productivity = assessProjectProductivity({ snapshot: left, measurements: [{ operation: "snapshot", durationMilliseconds: 2 }, { operation: "snapshot", durationMilliseconds: 5 }] });
  assert.equal(productivity.p95Milliseconds, 5);
  assert.equal(productivity.universalPerformanceClaim, false);
  assert.throws(() => createProjectControlSnapshot({ ...bundle, bundleDigest: digest("drift") }), /source bundle digest drifted/u);
  assert.throws(() => createProjectControlSnapshot({ projectId: "devrelay", lifecycle: {}, continuityRecords: null }), /continuityRecords must be an array/u);
  const orchestrationPlan = createDesktopOrchestrationPlan({ runId: "RUN-CONTROL", projectId: "devrelay", horizonDigest: digest("horizon"), startingRevision: "a".repeat(40), workItems: [{ id: "WI-2", dependencies: [] }] });
  const operator = createDesktopOperatorSnapshot({ orchestrationRun: { kind: "LocalHostRunState", version: 1, state: { plan: orchestrationPlan, workState: { "WI-2": { status: "pending", receipts: [] } }, blockers: [], recovery: "clean" } }, projectControlSnapshot: left });
  assert.equal(operator.projectControl.snapshotDigest, left.snapshotDigest);
  assert.match(renderDesktopOperatorSnapshot(operator), /Project control/u);
});

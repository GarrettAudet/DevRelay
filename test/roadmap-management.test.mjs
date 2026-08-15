import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  ROADMAP_ARTIFACT_CONTRACTS,
  validateRoadmapArtifact,
} from "../src/roadmap-management-artifact-validator.mjs";
import {
  createRoadmapIntakeCandidate,
  createRoadmapManagementRuntime,
  createRoadmapNotInitialized,
  createRoadmapPriorityPolicy,
  evaluateRoadmapPriority,
  renderRoadmapMarkdown,
} from "../src/roadmap-management.mjs";
import { promoteRoadmapBaseline } from "../src/roadmap-gate.mjs";
import {
  assertSessionContextReceipt,
  createSessionContextSnapshot,
  executeSessionBootstrap,
  refreshSessionContext,
} from "../src/session-bootstrap.mjs";
import { roadmapTraceabilityContributor } from "../src/roadmap-traceability-contributor.mjs";

const API = "devrelay.dev/v1alpha1";
const D = `sha256:${"a".repeat(64)}`;
const REVISION = "b".repeat(40);
const genericRef = (artifactId, digest = D, schema = "https://devrelay.dev/test/v1", mediaType = "application/json") => ({
  artifactId,
  schema,
  mediaType,
  digest,
  uri: `memory://devrelay/${artifactId}`,
});
const sourceRef = (role, artifact = genericRef(role.toUpperCase())) => ({ role, artifact });
const factors = (overrides = {}) => ({
  strategicAlignment: 0.9,
  userValue: 0.8,
  urgency: 0.7,
  riskReduction: 0.6,
  effort: 0.5,
  dependencies: 0.4,
  confidence: 1,
  ...overrides,
});
const policy = createRoadmapPriorityPolicy({
  policyId: "ROADMAP-PRIORITY-V1",
  weights: {
    strategicAlignment: 0.25,
    userValue: 0.2,
    urgency: 0.15,
    riskReduction: 0.15,
    effort: 0.1,
    dependencies: 0.05,
    confidence: 0.1,
  },
});
const policyRef = genericRef("ROADMAP-PRIORITY-V1");
const requirementsRef = genericRef("REQ-BASELINE-1");

function artifactRef(value, contract, uri = `memory://devrelay/${value.kind}.json`) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const identity = {
    RoadmapIntakeCandidate: value.candidateId,
    RoadmapDraft: value.draftId,
    RoadmapChangeSetDraft: value.changeSetId,
    RoadmapBaseline: value.baselineId,
    RoadmapGateApproval: value.approvalId,
  }[value.kind];
  return {
    bytes,
    ref: {
      artifactId: identity,
      schema: contract.schema,
      mediaType: contract.mediaType,
      digest: sha256Digest(bytes),
      uri,
    },
  };
}

function intake() {
  return createRoadmapIntakeCandidate({
    candidateId: "RM-CANDIDATE-001",
    title: "Govern the product roadmap",
    purpose: "Capture, evaluate, and prioritize net-new initiatives without losing provenance.",
    requirementsBaseline: requirementsRef,
    contextBindings: [sourceRef("requirements")],
  });
}

function checkpointStore() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, structuredClone(value)); },
  };
}

async function initialCandidate() {
  let calls = 0;
  const checkpoints = checkpointStore();
  const runtime = createRoadmapManagementRuntime({
    proposer: {
      id: "native-structured-roadmap-proposer",
      version: "0.1.0",
      async propose(request) {
        calls += 1;
        return request.nativeProposal;
      },
    },
  });
  const request = {
    operation: "triage-candidate",
    intakeCandidate: intake(),
    comparison: { closureConfidence: 0.99 },
    factors: factors(),
    priorityPolicy: policy,
    priorityPolicyRef: policyRef,
    sourceRefs: [sourceRef("requirements")],
    checkpoints,
  };
  const first = await runtime.execute(request);
  const replay = await runtime.execute(request);
  return { first, replay, calls };
}

function approvedPromotion(changeSet, checkpointDigest = D) {
  const change = artifactRef(changeSet, ROADMAP_ARTIFACT_CONTRACTS.RoadmapChangeSetDraft);
  const approval = {
    apiVersion: API,
    kind: "RoadmapGateApproval",
    approvalId: "RM-APPROVAL-001",
    authority: "project-owner",
    decision: "approve",
    candidate: change.ref,
    currentBaselineDisposition: "RoadmapNotInitialized",
    terminalCheckpointDigest: checkpointDigest,
    policyVersion: "1.0.0",
  };
  const approvalLoaded = artifactRef(approval, ROADMAP_ARTIFACT_CONTRACTS.RoadmapGateApproval);
  const promoted = promoteRoadmapBaseline({
    changeSet,
    changeSetRef: change.ref,
    changeSetBytes: change.bytes,
    approval,
    approvalRef: approvalLoaded.ref,
    approvalBytes: approvalLoaded.bytes,
    terminalCheckpointDigest: checkpointDigest,
    priorityPolicyRef: policyRef,
    sourceRefs: [sourceRef("requirements")],
  });
  return { promoted, change, approval, approvalLoaded };
}

test("RoadmapManagement publishes a valid module and replaceable native proposer", async () => {
  const moduleDefinition = JSON.parse(await readFile(new URL("../examples/modules/roadmap-management.module.json", import.meta.url), "utf8"));
  const pluginDefinition = JSON.parse(await readFile(new URL("../examples/plugins/native-structured-roadmap-proposer.plugin.json", import.meta.url), "utf8"));
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [{ definition: pluginDefinition, adapter: { async invoke() { throw new Error("not exercised"); } } }],
  });
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 1);
  assert.deepEqual(moduleDefinition.operations.map(({ id }) => id), ["triage-candidate", "review-roadmap", "reprioritize"]);
  assert.equal(moduleDefinition.operations.every(({ extensionPorts }) => extensionPorts.length === 1 && extensionPorts[0].role === "proposer"), true);
});

test("native RoadmapManagement is deterministic, exactly disposed, and checkpoint-replayed", async () => {
  const { first, replay, calls } = await initialCandidate();
  assert.equal(first.outcome, "decomposed");
  assert.equal(first.draft.initiatives.length, 1);
  assert.equal(first.draft.initiatives[0].recommendation, "keep");
  assert.equal(first.draft.initiatives[0].status, "kept");
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.changeSet, first.changeSet);
  assert.equal(calls, 1);
  assert.equal(renderRoadmapMarkdown({ baselineId: "ROADMAP-1", version: "1.0.0", initiatives: first.draft.initiatives }).includes("Govern the product roadmap"), true);
});

test("priority evaluation and native dispositions are explicit and deterministic", async () => {
  assert.deepEqual(evaluateRoadmapPriority({ policy, factors: factors() }), evaluateRoadmapPriority({ policy, factors: factors() }));
  const current = (await initialCandidate()).first.draft.initiatives;
  const runtime = createRoadmapManagementRuntime();
  const common = {
    operation: "triage-candidate",
    intakeCandidate: intake(),
    currentBaseline: { initiatives: current },
    currentBaselineRef: genericRef("ROADMAP-CURRENT"),
    comparison: { closureConfidence: 0.99 },
    factors: factors(),
    priorityPolicy: policy,
    priorityPolicyRef: policyRef,
    sourceRefs: [sourceRef("requirements")],
  };
  const merged = await runtime.execute(common);
  assert.equal(merged.draft.initiatives.some(({ recommendation }) => recommendation === "merge"), true);
  const { currentBaselineRef: _currentBaselineRef, ...withoutBaselineRef } = common;
  const deferred = await runtime.execute({ ...withoutBaselineRef, currentBaseline: { initiatives: [] }, comparison: { closureConfidence: 0.98 } });
  assert.equal(deferred.draft.initiatives[0].recommendation, "defer");
  assert.throws(() => createRoadmapPriorityPolicy({ policyId: "BAD", weights: { strategicAlignment: 1 } }), /exactly/u);
  assert.throws(() => createRoadmapIntakeCandidate({ candidateId: "X", title: "", purpose: "x", requirementsBaseline: requirementsRef, contextBindings: [sourceRef("requirements")] }), /invalid/u);
});

test("RoadmapGate alone promotes exact approved bytes and emits a refresh requirement", async () => {
  const { first } = await initialCandidate();
  const { promoted, approval, approvalLoaded, change } = approvedPromotion(first.changeSet);
  validateRoadmapArtifact(promoted.baseline, { ref: promoted.baselineRef });
  assert.equal(promoted.baseline.version, "1.0.0");
  assert.equal(promoted.refreshRequired, true);
  assert.equal(promoted.baseline.projectionDigest, sha256Digest(promoted.projectionBytes));
  assert.match(promoted.projection, /^# Roadmap\n/u);
  assert.throws(() => promoteRoadmapBaseline({
    changeSet: first.changeSet,
    changeSetRef: change.ref,
    changeSetBytes: change.bytes,
    approval: { ...approval, terminalCheckpointDigest: `sha256:${"f".repeat(64)}` },
    approvalRef: approvalLoaded.ref,
    approvalBytes: approvalLoaded.bytes,
    terminalCheckpointDigest: D,
    priorityPolicyRef: policyRef,
    sourceRefs: [sourceRef("requirements")],
  }), /invalid|checkpoint|exact raw JSON/u);
});

function contextFixture({ taskId = "TASK-1", roadmapDisposition = "initialized", createdAt = "2026-08-15T12:00:00Z" } = {}) {
  const roles = [
    "project-overview",
    "project-overview-projection",
    "lifecycle-status",
    "requirements-baseline",
    "architecture-baseline",
    "contract-baseline",
    "work-breakdown-baseline",
    "work-dependency-baseline",
    ...(roadmapDisposition === "initialized" ? ["roadmap", "roadmap-projection"] : []),
  ];
  const byteMap = new Map();
  const bindings = roles.map((role) => {
    const bytes = Buffer.from(`context:${role}`, "utf8");
    const artifact = genericRef(`CTX-${role.toUpperCase()}`, sha256Digest(bytes));
    byteMap.set(artifact.digest, bytes);
    return { role, artifact, artifactVersion: "1.0.0" };
  });
  const snapshot = createSessionContextSnapshot({
    projectId: "PROJECT-1",
    taskId,
    workspaceId: "WORKSPACE-1",
    repositoryRevision: REVISION,
    bindings,
    roadmapDisposition,
    createdAt,
  });
  const artifactResolver = async (artifact) => ({ bytes: byteMap.get(artifact.digest) });
  return { snapshot, bindings, artifactResolver };
}

test("fresh-task bootstrap validates every digest and refreshes at a changed Module boundary", async () => {
  const initial = contextFixture();
  const receipt = await executeSessionBootstrap({
    snapshot: initial.snapshot,
    artifactResolver: initial.artifactResolver,
    expectedProjectId: "PROJECT-1",
    expectedTaskId: "TASK-1",
    expectedWorkspaceId: "WORKSPACE-1",
    expectedRepositoryRevision: REVISION,
    durationMs: 4,
  });
  assert.equal(receipt.outcome, "pass");
  assert.equal(assertSessionContextReceipt({ receipt, snapshot: initial.snapshot, currentBindings: initial.bindings, currentRepositoryRevision: REVISION }), true);
  assert.throws(() => assertSessionContextReceipt({ receipt, snapshot: initial.snapshot, currentBindings: initial.bindings, currentRepositoryRevision: "c".repeat(40) }), /stale/u);

  const next = contextFixture({ createdAt: "2026-08-15T12:05:00Z" });
  const refreshed = await refreshSessionContext({
    priorReceipt: receipt,
    nextSnapshot: next.snapshot,
    artifactResolver: next.artifactResolver,
    expectedProjectId: "PROJECT-1",
    expectedTaskId: "TASK-1",
    expectedWorkspaceId: "WORKSPACE-1",
    expectedRepositoryRevision: REVISION,
    cache: "warm",
  });
  assert.notEqual(refreshed.snapshot.digest, receipt.snapshot.digest);
  assert.equal(refreshed.cache, "warm");
});

test("missing or substituted context fails closed while a missing roadmap is explicit", async () => {
  const missing = contextFixture({ taskId: "TASK-NO-ROADMAP", roadmapDisposition: "RoadmapNotInitialized" });
  const noRoadmap = await executeSessionBootstrap({
    snapshot: missing.snapshot,
    artifactResolver: missing.artifactResolver,
    expectedProjectId: "PROJECT-1",
    expectedTaskId: "TASK-NO-ROADMAP",
    expectedWorkspaceId: "WORKSPACE-1",
    expectedRepositoryRevision: REVISION,
  });
  assert.equal(noRoadmap.outcome, "RoadmapNotInitialized");
  assert.equal(createRoadmapNotInitialized("PROJECT-1").nextOperation, "establish-baseline");

  const current = contextFixture({ taskId: "TASK-BAD" });
  const failed = await executeSessionBootstrap({
    snapshot: current.snapshot,
    artifactResolver: async () => Buffer.from("substituted", "utf8"),
    expectedProjectId: "PROJECT-1",
    expectedTaskId: "TASK-BAD",
    expectedWorkspaceId: "WORKSPACE-1",
    expectedRepositoryRevision: REVISION,
  });
  assert.equal(failed.outcome, "fail");
  assert.equal(failed.moduleExecutionAllowed, false);
  assert.throws(() => assertSessionContextReceipt({ receipt: failed, snapshot: current.snapshot, currentBindings: current.bindings, currentRepositoryRevision: REVISION }), /does not allow/u);
});

test("trusted roadmap traceability projects only approved baseline containment", async () => {
  const { first } = await initialCandidate();
  const { promoted } = approvedPromotion(first.changeSet);
  const context = {
    invocation: { module: { id: "roadmap-gate", operation: "promote-baseline" } },
    moduleResult: { status: "completed", outcome: "promoted" },
    loadedOutputs: {
      "roadmap-baseline": [{ value: promoted.baseline, bytes: promoted.baselineBytes, ref: promoted.baselineRef }],
    },
  };
  assert.equal(roadmapTraceabilityContributor.match(context), true);
  const projection = await roadmapTraceabilityContributor.project(context);
  assert.equal(projection.nodes.length, 2);
  assert.equal(projection.edges.length, 1);
  assert.equal(projection.edges[0].kind, "contains");
  assert.equal(projection.nodes.every(({ kind }) => kind === "artifact-reference"), true);
});
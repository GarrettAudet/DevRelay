import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareLocalWorkExecution, prepareLocalWorkDispatch, prepareLocalWorkExecutionHandoff, verifyLocalWorkExecutionHandoff } from "../src/local-work-execution-preparation.mjs";
import { prepareLocalWorkQualityHandoff } from "../src/local-work-quality-handoff.mjs";
import { createQualityPolicyCandidate, promoteQualityPolicyBaseline, createQualityPolicyContext } from "../src/quality-policy.mjs";
import { resolveWorkflowProfile } from "../src/workflow-profiles.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createDurableWorkContinuityStore } from "../src/work-continuity.mjs";
import { claimLocalWorkContinuity } from "../src/local-work-continuity.mjs";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  WorkExecutionRuntimeError,
  createCanonicalWorkExecutionInput,
  createInMemoryWorkExecutionCheckpointStore,
  deriveRunnableFrontierProof,
  executeWorkItem,
  prepareWorkExecutionInvocation,
  loadWorkExecutionInput,
} from "../src/work-execution-runtime.mjs";

const API = "devrelay.dev/v1alpha1";
const D = `sha256:${"d".repeat(64)}`;
const E = `sha256:${"e".repeat(64)}`;
const ref = (
  artifactId,
  digest = D,
  schema = "https://devrelay.dev/test/v1",
  mediaType = "application/json",
) => ({ artifactId, schema, mediaType, digest, uri: `memory://${artifactId}` });
const bodySeal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const listSeal = (value, field, material) => ({
  ...value,
  [field]: canonicalJsonDigest(material),
});
const valueFrom = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

function loaded(value, artifactId, schema, mediaType) {
  return createCanonicalWorkExecutionInput({
    value,
    ref: ref(artifactId, D, schema, mediaType),
  });
}

function loadedFile(relativePath, artifactId, schema, mediaType) {
  const bytes = readFileSync(new URL(relativePath, import.meta.url));
  return loadWorkExecutionInput({
    bytes,
    ref: ref(artifactId, sha256Digest(bytes), schema, mediaType),
  });
}

function fixture({ workItemId = "WI-REL-WORK-EXECUTION-RUNTIME", linkedOverview = false } = {}) {
  let workBreakdown = loadedFile(
    "../project/history/work-breakdown/1.8.0/work-breakdown-baseline.json",
    "WBB-WB-DOGFOOD",
    "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
    "application/vnd.devrelay.work-breakdown-baseline+json",
  );
  let dependencies = loaded(
    valueFrom("../project/history/work-dependency/WDB-REL-RELEASE-HARDENING-R3/1.0.3/work-dependency-baseline.json"),
    "WDB-REL-RELEASE-HARDENING-R3",
    "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
    "application/vnd.devrelay.work-dependency-baseline+json",
  );
  const assignment = loaded(
    valueFrom("../project/history/specialist-assignment/SAB-2B5DB52B6A0CB2EA/specialist-assignment-baseline.json"),
    "SAB-2B5DB52B6A0CB2EA",
    "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1",
    "application/vnd.devrelay.specialist-assignment-baseline+json",
  );
  const projectOverview = loaded(
    valueFrom("../project/project-overview-baseline.json"),
    "project-overview-baseline-devrelay-v1-v0.10-release-hardening-001",
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  );
  if (linkedOverview) {
    // Synthetic linked fixture, not a promotion of modified historical work.
    const work = structuredClone(workBreakdown.value);
    work.inputBindings.find(entry => entry.role === "project-overview-baseline").artifact = projectOverview.ref;
    workBreakdown = createCanonicalWorkExecutionInput({ value: work, ref: workBreakdown.ref });
    dependencies = createCanonicalWorkExecutionInput({ value: { ...dependencies.value, workBreakdownBaseline: workBreakdown.ref }, ref: dependencies.ref });
  }
  const repository = loaded(
    valueFrom("../dogfood/v0.10-release-hardening/repository-snapshot.json"),
    "repository-snapshot-devrelay-a38d2ff",
    "https://devrelay.dev/artifacts/repository-snapshot/v1",
    "application/vnd.devrelay.repository-snapshot+json",
  );
  const completions = loaded(
    listSeal(
      { apiVersion: API, kind: "IntegratedCompletionFactSet", facts: [] },
      "factsDigest",
      [],
    ),
    "ICFS-REL-EMPTY",
    "https://devrelay.dev/artifacts/integrated-completion-fact-set/v1",
    "application/vnd.devrelay.integrated-completion-fact-set+json",
  );
  const policyValue = bodySeal(
    {
      apiVersion: API,
      kind: "ExecutionPolicy",
      policyId: "POL-REL-WE",
      version: "1.0.0",
      timeoutMilliseconds: 120_000,
      allowedPermissions: [
        { kind: "filesystem.write", scope: { values: ["src/**", "test/**"] } },
        { kind: "process.spawn", scope: { values: ["node"] } },
      ],
      outputPolicy: {
        maxEvidenceBytes: 10_000_000,
        maxNativeArtifactBytes: 10_000_000,
      },
    },
    "policyDigest",
  );
  const policy = loaded(
    policyValue,
    policyValue.policyId,
    "https://devrelay.dev/artifacts/execution-policy/v1",
    "application/vnd.devrelay.execution-policy+json",
  );
  const approvedAssignment = assignment.value.assignments.find(
    ({ workItemRef }) => workItemRef === workItemId,
  );
  assert.ok(approvedAssignment, `missing fixture assignment for ${workItemId}`);
  const permissionDemands =
    workItemId === "WI-REL-WORK-EXECUTION-RUNTIME"
      ? [
          { kind: "filesystem.write", scope: { values: ["src/**", "test/**"] } },
          { kind: "process.spawn", scope: { values: ["node"] } },
        ]
      : [{ kind: "process.spawn", scope: { values: ["node"] } }];
  const bindingValue = bodySeal(
    {
      apiVersion: API,
      kind: "ExecutionBinding",
      bindingId: `BIND-${workItemId}`,
      workItemId,
      specialistProfileId: approvedAssignment.specialistProfileRef,
      assignmentBaseline: assignment.ref,
      executor: { id: "executor.chatgpt-desktop", version: "1.0.0" },
      requiredCapabilities: approvedAssignment.capabilityCoverage,
      requiredTools: approvedAssignment.requiredTools,
      permissionDemands,
      executionPolicy: policy.ref,
      configurationDigest: D,
    },
    "bindingDigest",
  );
  const binding = loaded(
    bindingValue,
    bindingValue.bindingId,
    "https://devrelay.dev/artifacts/execution-binding/v1",
    "application/vnd.devrelay.execution-binding+json",
  );
  let readinessProof;
  try {
    readinessProof = deriveRunnableFrontierProof({
      workItemId,
      workBreakdownBaseline: workBreakdown,
      workDependencyBaseline: dependencies,
      integratedCompletionFacts: completions,
    }).proof;
  } catch (error) {
    if (!(error instanceof WorkExecutionRuntimeError) || error.code !== "DR4064") {
      throw error;
    }
    readinessProof = bodySeal(
      {
        apiVersion: API,
        kind: "RunnableFrontierProof",
        workItemId,
        workBreakdownBaseline: workBreakdown.ref,
        workDependencyBaseline: dependencies.ref,
        dependencyGraphDigest: dependencies.value.graphDigest,
        prerequisiteCompletionFacts: [],
      },
      "readinessDigest",
    );
  }
  const runnableFrontierProof = loaded(
    readinessProof,
    `READY-${workItemId}`,
    "https://devrelay.dev/artifacts/runnable-frontier-proof/v1",
    "application/vnd.devrelay.runnable-frontier-proof+json",
  );
  return {
    input: {
      workBreakdownBaseline: workBreakdown,
      workDependencyBaseline: dependencies,
      integratedCompletionFacts: completions,
      runnableFrontierProof,
      specialistAssignmentBaseline: assignment,
      executionBinding: binding,
      executionPolicy: policy,
      projectOverviewBaseline: projectOverview,
      repositorySnapshot: repository,
    },
    workItemId,
  };
}

function executor(calls, bindingDigest) {
  return {
    id: "executor.chatgpt-desktop",
    version: "1.0.0",
    async execute(invocation) {
      calls.push(invocation);
      const raw = {
        apiVersion: API,
        kind: "RawExecutorResult",
        attemptId: invocation.attemptId,
        invocationFingerprint: invocation.invocationFingerprint,
        bindingDigest,
        executor: { id: this.id, version: this.version },
        terminalState: "proposed",
        mutations: [
          {
            operation: "create",
            path: "src/work-execution-runtime.mjs",
            beforeDigest: null,
            afterDigest: E,
          },
        ],
        evidence: [ref("EV-WE-RUNTIME")],
        diagnostics: [],
        nativeArtifacts: [],
      };
      return Buffer.from(`${canonicalJson(raw)}\n`, "utf8");
    },
  };
}

test("local host prepares exact execution inputs from queue and rejects caller completion overrides", async () => {
  const f = fixture();
  const body = { baselines: Object.fromEntries(["workBreakdownBaseline", "workDependencyBaseline", "specialistAssignmentBaseline", "projectOverviewBaseline"].map(name => [name, f.input[name].ref])),
    readyWorkItemIds: [f.workItemId], proofs: [f.input.runnableFrontierProof.value], factSet: f.input.integratedCompletionFacts.value };
  const readiness = { ...body, readinessDigest: canonicalJsonDigest(body) };
  let loads = 0;
  const request = { readiness, attemptId: "ATT-LOCAL-READY", workItemId: f.workItemId,
    executionBindingRef: f.input.executionBinding.ref, executionPolicyRef: f.input.executionPolicy.ref,
    repositorySnapshotRef: f.input.repositorySnapshot.ref, workspaceBaseDigest: D, executorConfigurationDigest: D,
    loadArtifact: ref => { loads++; return Object.values(f.input).find(item => item.ref.digest === ref.digest)?.bytes; } };
  const prepared = await prepareLocalWorkExecution(request);
  assert.equal(loads, 7);
  assert.deepEqual(prepared.input.workBreakdownBaseline.bytes, f.input.workBreakdownBaseline.bytes);
  assert.deepEqual(prepared.readinessProof, f.input.runnableFrontierProof.value);
  const calls = [];
  const executed = await executeWorkItem({ ...request, input: prepared.input,
    executor: executor(calls, f.input.executionBinding.value.bindingDigest), checkpoints: createInMemoryWorkExecutionCheckpointStore() });
  assert.deepEqual(prepared.invocation, executed.invocation);
  await assert.rejects(prepareLocalWorkExecution({ ...request, completedWorkItemIds: [] }), /undeclared/);
  await assert.rejects(prepareLocalWorkExecution({ ...request, workItemId: "WI-NOT-READY" }), /exact ready queue/);
  const changedBody = { ...body, proofs: [] };
  await assert.rejects(prepareLocalWorkExecution({ ...request, readiness: { ...changedBody, readinessDigest: canonicalJsonDigest(changedBody) } }), /one exact readiness proof/);
});

test("dispatch preparation binds quality and execution into an attempt-independent fingerprint", async t => {
  const f = fixture({ linkedOverview: true });
  const body = { baselines: Object.fromEntries(["workBreakdownBaseline", "workDependencyBaseline", "specialistAssignmentBaseline", "projectOverviewBaseline"].map(name => [name, f.input[name].ref])),
    readyWorkItemIds: [f.workItemId], proofs: [f.input.runnableFrontierProof.value], factSet: f.input.integratedCompletionFacts.value };
  const readiness = { ...body, readinessDigest: canonicalJsonDigest(body) };
  const candidate = createQualityPolicyCandidate({ policyId: "QP-DISPATCH", version: "1.0.0",
    rules: [{ id: "TEST", obligations: [{ id: "test", lane: "test", evidenceKinds: ["test/pass"] }] }] });
  const policyValue = promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval", authority: "fixture-owner", decision: "approve", candidateDigest: candidate.candidateDigest } });
  const owner = "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json";
  const policy = loaded(policyValue, policyValue.policyId, owner, "application/json");
  const work = f.input.workBreakdownBaseline.value.workItems.find(item => item.id === f.workItemId);
  const context = loaded(createQualityPolicyContext({ acceptanceCriteria: work["acceptance-criterion-refs"] }), "QC-DISPATCH", owner, "application/json");
  const loadArtifact = ref => [...Object.values(f.input), policy, context].find(item => item.ref.digest === ref.digest)?.bytes;
  const qualityHandoff = await prepareLocalWorkQualityHandoff({ readiness, loadArtifact, workflowProfile: resolveWorkflowProfile({ profileName: "quick" }),
    submission: { kind: "DesktopWorkQualitySubmission", readinessDigest: readiness.readinessDigest, workItemId: f.workItemId,
      qualityPolicy: { path: "policy.json", ref: policy.ref }, qualityContext: { path: "context.json", ref: context.ref }, artifacts: [] } });
  const executionRequest = { readiness, attemptId: "ATT-DISPATCH-ONE", workItemId: f.workItemId,
    executionBindingRef: f.input.executionBinding.ref, executionPolicyRef: f.input.executionPolicy.ref,
    repositorySnapshotRef: f.input.repositorySnapshot.ref, workspaceBaseDigest: D, executorConfigurationDigest: D, loadArtifact };
  const first = await prepareLocalWorkDispatch({ projectId: "devrelay", executionRequest, qualityHandoff });
  const second = await prepareLocalWorkDispatch({ projectId: "devrelay", executionRequest: { ...executionRequest, attemptId: "ATT-DISPATCH-TWO" }, qualityHandoff });
  assert.equal(first.workFingerprint.fingerprint, second.workFingerprint.fingerprint);
  assert.notEqual(first.invocation.invocationFingerprint, second.invocation.invocationFingerprint);
  assert.equal(first.workFingerprint.material.workItem.type, work["work-type"]);
  const changed = await prepareLocalWorkDispatch({ projectId: "devrelay", executionRequest: { ...executionRequest, workspaceBaseDigest: E }, qualityHandoff });
  assert.notEqual(changed.workFingerprint.fingerprint, first.workFingerprint.fingerprint);
  const submission = { kind: "DesktopWorkExecutionSubmission", readinessDigest: readiness.readinessDigest,
    qualityPreparationDigest: qualityHandoff.preparationDigest, workItemId: f.workItemId, attemptId: executionRequest.attemptId,
    executionBinding: { path: "binding.json", ref: executionRequest.executionBindingRef },
    executionPolicy: { path: "execution-policy.json", ref: executionRequest.executionPolicyRef },
    repositorySnapshot: { path: "repository.json", ref: executionRequest.repositorySnapshotRef },
    workspaceBaseDigest: D, executorConfigurationDigest: D };
  const handoffRequest = { projectId: "devrelay", submission, readiness, qualityHandoff, loadArtifact };
  const handoff = await prepareLocalWorkExecutionHandoff(handoffRequest);
  assert.equal(handoff.record.dispatchAuthorized, false);
  assert.deepEqual((await verifyLocalWorkExecutionHandoff({ ...handoffRequest, record: handoff.record })).record, handoff.record);
  await assert.rejects(prepareLocalWorkExecutionHandoff({ ...handoffRequest, submission: { ...submission, completed: true } }), /closed contract/);
  await assert.rejects(prepareLocalWorkExecutionHandoff({ ...handoffRequest, submission: { ...submission, qualityPreparationDigest: E } }), /quality preparation differs/);
  const tampered = structuredClone(handoff.record); tampered.artifacts.invocation.bytesBase64 = Buffer.from("{}").toString("base64");
  await assert.rejects(verifyLocalWorkExecutionHandoff({ ...handoffRequest, record: tampered }), /exact derivation/);
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-prepared-claim-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  let store = createDurableWorkContinuityStore({ storage, projectId: "devrelay" });
  const claim = claimLocalWorkContinuity({ store, workFingerprint: first.workFingerprint,
    attemptId: first.invocation.attemptId, owner: "fixture-desktop", now: 100, leaseExpiresAt: 200,
    expectedHostVersion: 0, expectedIndexRevision: 0 });
  assert.equal(claim.hostVersion, 1);
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  store = createDurableWorkContinuityStore({ storage, projectId: "devrelay" });
  for (const preparation of [second, changed]) {
    assert.throws(() => claimLocalWorkContinuity({ store, workFingerprint: preparation.workFingerprint,
      attemptId: "ATT-COMPETING", owner: "fixture-desktop", now: 300, leaseExpiresAt: 400,
      expectedHostVersion: 1, expectedIndexRevision: 1 }), /requires recovery or completion/);
  }
  assert.equal(store.read().version, 1);
  assert.equal(store.read().state.index.records.length, 1);
  assert.equal(store.read().state.index.records[0].fingerprint, first.workFingerprint.fingerprint);
});

test("exact v0.10 baselines execute one ready item and replay without a second executor call", async () => {
  const { input, workItemId } = fixture();
  const calls = [];
  const checkpoints = createInMemoryWorkExecutionCheckpointStore();
  const args = {
    attemptId: "ATT-REL-WE-RUNTIME-001",
    workItemId,
    input,
    workspaceBaseDigest: D,
    executor: executor(calls, input.executionBinding.value.bindingDigest),
    executorConfigurationDigest: D,
    checkpoints,
  };
  const prepared = prepareWorkExecutionInvocation(args);
  assert.equal(calls.length, 0);
  const first = await executeWorkItem(args);
  assert.deepEqual(prepared.invocation, first.invocation);
  assert.deepEqual(prepared.readinessProof, first.readinessProof);
  const replay = await executeWorkItem(args);
  assert.equal(first.outcome, "proposed");
  assert.equal(first.executorCalls, 1);
  assert.equal(first.replayed, false);
  assert.equal(replay.executorCalls, 0);
  assert.equal(replay.replayed, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(replay.attempt, first.attempt);
  assert.deepEqual(replay.changeSet, first.changeSet);
  const exactRawBytes = Buffer.from(first.checkpoint.rawBytesBase64, "base64");
  assert.equal(first.attempt.result.digest, sha256Digest(exactRawBytes));
  assert.equal(exactRawBytes.at(-1), 0x0a);
  assert.equal(first.readinessProof.prerequisiteCompletionFacts.length, 0);
  assert.equal(first.invocation.workItem.id, workItemId);
});

test("blocked work, stale policy, executor substitution, and attempt identity reuse fail closed", async () => {
  const blocked = fixture({ workItemId: "WI-REL-PACKAGE" });
  const blockedCalls = [];
  await assert.rejects(
    executeWorkItem({
      attemptId: "ATT-BLOCKED",
      workItemId: blocked.workItemId,
      input: blocked.input,
      workspaceBaseDigest: D,
      executor: executor(blockedCalls, blocked.input.executionBinding.value.bindingDigest),
      executorConfigurationDigest: D,
      checkpoints: createInMemoryWorkExecutionCheckpointStore(),
    }),
    (error) => error instanceof WorkExecutionRuntimeError && error.code === "DR4064",
  );
  assert.equal(blockedCalls.length, 0);

  const stale = fixture();
  stale.input.executionBinding.value.executionPolicy.digest = E;
  await assert.rejects(
    executeWorkItem({
      attemptId: "ATT-STALE",
      workItemId: stale.workItemId,
      input: stale.input,
      workspaceBaseDigest: D,
      executor: executor([], stale.input.executionBinding.value.bindingDigest),
      executorConfigurationDigest: D,
      checkpoints: createInMemoryWorkExecutionCheckpointStore(),
    }),
    /bindingDigest does not bind canonical material|exact ExecutionPolicy/,
  );

  const substituted = fixture();
  const calls = [];
  await assert.rejects(
    executeWorkItem({
      attemptId: "ATT-SUB",
      workItemId: substituted.workItemId,
      input: substituted.input,
      workspaceBaseDigest: D,
      executor: { ...executor(calls, substituted.input.executionBinding.value.bindingDigest), id: "executor.substituted" },
      executorConfigurationDigest: D,
      checkpoints: createInMemoryWorkExecutionCheckpointStore(),
    }),
    /configured executor does not match/,
  );
  assert.equal(calls.length, 0);

  const exact = fixture();
  const exactCalls = [];
  const checkpoints = createInMemoryWorkExecutionCheckpointStore();
  const common = {
    attemptId: "ATT-IMMUTABLE",
    workItemId: exact.workItemId,
    input: exact.input,
    workspaceBaseDigest: D,
    executor: executor(exactCalls, exact.input.executionBinding.value.bindingDigest),
    executorConfigurationDigest: D,
    checkpoints,
  };
  await executeWorkItem(common);
  await assert.rejects(
    executeWorkItem({ ...common, workspaceBaseDigest: E }),
    (error) => error instanceof WorkExecutionRuntimeError && error.code === "DR4065",
  );
  assert.equal(exactCalls.length, 1);
});

test("executor failures become immutable failed attempts and never claim a change set", async () => {
  const { input, workItemId } = fixture();
  const failed = await executeWorkItem({
    attemptId: "ATT-FAIL",
    workItemId,
    input,
    workspaceBaseDigest: D,
    executorConfigurationDigest: D,
    checkpoints: createInMemoryWorkExecutionCheckpointStore(),
    executor: {
      id: "executor.chatgpt-desktop",
      version: "1.0.0",
      async execute() {
        throw new Error("bounded executor failure");
      },
    },
  });
  assert.equal(failed.outcome, "execution_failed");
  assert.equal(failed.attempt.status, "failed");
  assert.equal(failed.changeSet, undefined);
  assert.equal(failed.diagnostics[0].code, "EXECUTOR_FAILED");
});


test("invalid executor bytes are preserved, normalized to a failed attempt, and replayed without another call", async () => {
  const { input, workItemId } = fixture();
  const invalidBytes = Buffer.from('{"graphUpdate":true}\n', "utf8");
  let calls = 0;
  const checkpoints = createInMemoryWorkExecutionCheckpointStore();
  const args = {
    attemptId: "ATT-INVALID-OUTPUT",
    workItemId,
    input,
    workspaceBaseDigest: D,
    executorConfigurationDigest: D,
    checkpoints,
    executor: {
      id: "executor.chatgpt-desktop",
      version: "1.0.0",
      async execute() {
        calls += 1;
        return invalidBytes;
      },
    },
  };
  const first = await executeWorkItem(args);
  const replay = await executeWorkItem(args);
  assert.equal(first.outcome, "execution_failed");
  assert.equal(first.attempt.status, "failed");
  assert.equal(first.attempt.result.digest, sha256Digest(invalidBytes));
  assert.equal(first.diagnostics[0].code, "INVALID_EXECUTOR_OUTPUT");
  assert.equal(first.changeSet, undefined);
  assert.equal(replay.replayed, true);
  assert.equal(replay.executorCalls, 0);
  assert.deepEqual(replay.attempt, first.attempt);
  assert.equal(calls, 1);
});

test("retry creates a new attempt only when exact predecessor bytes match immutable lineage", async () => {
  const { input, workItemId } = fixture();
  const failed = await executeWorkItem({
    attemptId: "ATT-PREDECESSOR",
    workItemId,
    input,
    workspaceBaseDigest: D,
    executorConfigurationDigest: D,
    checkpoints: createInMemoryWorkExecutionCheckpointStore(),
    executor: {
      id: "executor.chatgpt-desktop",
      version: "1.0.0",
      async execute() {
        throw new Error("retryable failure");
      },
    },
  });
  const predecessor = loaded(
    failed.attempt,
    failed.attempt.attemptId,
    "https://devrelay.dev/artifacts/execution-attempt/v1",
    "application/vnd.devrelay.execution-attempt+json",
  );
  const retryValue = bodySeal(
    {
      apiVersion: API,
      kind: "RetryLineage",
      attemptId: "ATT-RETRY",
      predecessorAttempt: {
        artifactId: failed.attempt.attemptId,
        digest: failed.attempt.attemptDigest,
      },
      reason: "failure",
    },
    "retryDigest",
  );
  const retryArtifact = loaded(
    retryValue,
    "RETRY-ATT-RETRY",
    "https://devrelay.dev/artifacts/retry-lineage/v1",
    "application/vnd.devrelay.retry-lineage+json",
  );
  const retryLineage = { ...retryArtifact, predecessor };
  const calls = [];
  const retried = await executeWorkItem({
    attemptId: "ATT-RETRY",
    workItemId,
    input,
    workspaceBaseDigest: D,
    executor: executor(calls, input.executionBinding.value.bindingDigest),
    executorConfigurationDigest: D,
    checkpoints: createInMemoryWorkExecutionCheckpointStore(),
    retryLineage,
  });
  assert.equal(retried.outcome, "proposed");
  assert.deepEqual(retried.attempt.predecessorAttempt, retryValue.predecessorAttempt);
  assert.equal(calls.length, 1);

  const substituted = {
    ...retryLineage,
    predecessor: {
      ...predecessor,
      value: { ...predecessor.value, attemptId: "ATT-SUBSTITUTED" },
    },
  };
  await assert.rejects(
    executeWorkItem({
      attemptId: "ATT-RETRY",
      workItemId,
      input,
      workspaceBaseDigest: D,
      executor: executor([], input.executionBinding.value.bindingDigest),
      executorConfigurationDigest: D,
      checkpoints: createInMemoryWorkExecutionCheckpointStore(),
      retryLineage: substituted,
    }),
    /attemptDigest does not bind canonical material|stale or substituted/,
  );
});

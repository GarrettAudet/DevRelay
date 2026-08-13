import { TextDecoder } from "node:util";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "./content-digest.mjs";
import { validateProjectOverviewArtifact } from "./project-overview-artifact-validator.mjs";
import { validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "./work-dependency-artifact-validator.mjs";
import { validateWorkExecutionArtifact } from "./work-execution-artifact-validator.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const RAW_SCHEMA = "https://devrelay.dev/artifacts/raw-executor-result/v1";
const RAW_MEDIA_TYPE = "application/vnd.devrelay.raw-executor-result+json";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export class WorkExecutionRuntimeError extends Error {
  constructor(message, code = "DR4061") {
    super(`work execution runtime: ${message}`);
    this.name = "WorkExecutionRuntimeError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new WorkExecutionRuntimeError(message, code);
};
const clone = (value) => structuredClone(value);
const body = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const list = (value, field, material) => ({
  ...value,
  [field]: canonicalJsonDigest(material),
});
const refKey = (ref) =>
  [ref?.artifactId, ref?.schema, ref?.mediaType, ref?.digest].join("\u0000");
const sameRef = (left, right) => refKey(left) === refKey(right);
const sortStrings = (values) => [...values].sort((left, right) => left.localeCompare(right, "en"));
const sameStrings = (left, right) =>
  canonicalJson(sortStrings(left)) === canonicalJson(sortStrings(right));

function rawBytes(bytes, label) {
  if (!(bytes instanceof Uint8Array)) fail(`${label} bytes must be a Uint8Array`);
  return Buffer.from(bytes);
}

export function loadWorkExecutionInput({ bytes, ref, label = "artifact" }) {
  const exactBytes = rawBytes(bytes, label);
  if (!ref || typeof ref.artifactId !== "string" || !DIGEST.test(ref.digest ?? "")) {
    fail(`${label} reference is invalid`);
  }
  if (sha256Digest(exactBytes) !== ref.digest) fail(`${label} raw-byte digest changed`, "DR4063");
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(exactBytes));
  } catch {
    fail(`${label} is not valid UTF-8 JSON`, "DR4063");
  }
  return Object.freeze({ value, bytes: exactBytes, ref: clone(ref) });
}

export function createCanonicalWorkExecutionInput({ value, ref }) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const resolvedRef = { ...clone(ref), digest: sha256Digest(bytes) };
  return loadWorkExecutionInput({ bytes, ref: resolvedRef });
}

function validateRepositorySnapshot(snapshot) {
  if (
    snapshot?.apiVersion !== API_VERSION ||
    snapshot.kind !== "RepositorySnapshot" ||
    typeof snapshot.repository !== "string" ||
    snapshot.repository.length === 0 ||
    !COMMIT.test(snapshot.revision ?? "") ||
    !DIGEST.test(snapshot.treeDigest ?? "") ||
    !Array.isArray(snapshot.includedPaths) ||
    !Array.isArray(snapshot.excludedPaths)
  ) {
    fail("repository snapshot is not canonical");
  }
}

function validateLoadedInputs(input) {
  const required = [
    "workBreakdownBaseline",
    "workDependencyBaseline",
    "integratedCompletionFacts",
    "runnableFrontierProof",
    "specialistAssignmentBaseline",
    "executionBinding",
    "executionPolicy",
    "projectOverviewBaseline",
    "repositorySnapshot",
  ];
  for (const name of required) {
    const loaded = input[name];
    if (!loaded?.value || !loaded?.ref || !(loaded.bytes instanceof Uint8Array)) {
      fail(`${name} must be an exact loaded artifact`);
    }
    if (sha256Digest(loaded.bytes) !== loaded.ref.digest) {
      fail(`${name} bytes changed after loading`, "DR4063");
    }
  }
  validateWorkBreakdownArtifact(input.workBreakdownBaseline.value, {
    ref: input.workBreakdownBaseline.ref,
  });
  validateWorkDependencyArtifact(input.workDependencyBaseline.value);
  validateWorkExecutionArtifact(input.integratedCompletionFacts.value);
  validateSpecialistAssignmentArtifact(input.specialistAssignmentBaseline.value);
  validateWorkExecutionArtifact(input.executionBinding.value);
  validateWorkExecutionArtifact(input.executionPolicy.value);
  validateProjectOverviewArtifact(input.projectOverviewBaseline.value);
  validateRepositorySnapshot(input.repositorySnapshot.value);
}

export function deriveRunnableFrontierProof({
  workItemId,
  workBreakdownBaseline,
  workDependencyBaseline,
  integratedCompletionFacts,
}) {
  const breakdown = workBreakdownBaseline.value;
  const dependencies = workDependencyBaseline.value;
  const completions = integratedCompletionFacts.value;
  if (!sameRef(dependencies.workBreakdownBaseline, workBreakdownBaseline.ref)) {
    fail("WorkDependencyBaseline does not bind the exact WorkBreakdownBaseline", "DR4063");
  }
  const workItem = breakdown.workItems.find(({ id }) => id === workItemId);
  if (!workItem) fail(`work item ${workItemId} is absent from WorkBreakdownBaseline`);
  if (!dependencies.nodes.includes(workItemId)) fail(`work item ${workItemId} is absent from the dependency DAG`);
  const byWorkItem = new Map();
  for (const fact of completions.facts) {
    if (!dependencies.nodes.includes(fact.workItemId)) fail(`completion fact ${fact.workItemId} is outside the DAG`);
    if (byWorkItem.has(fact.workItemId)) fail(`completion fact ${fact.workItemId} is duplicated`);
    byWorkItem.set(fact.workItemId, fact);
  }
  if (byWorkItem.has(workItemId)) fail(`work item ${workItemId} is already integrated`);
  const prerequisites = dependencies.edges
    .filter(({ dependentId }) => dependentId === workItemId)
    .map(({ prerequisiteId }) => prerequisiteId)
    .sort((left, right) => left.localeCompare(right, "en"));
  const prerequisiteCompletionFacts = prerequisites.map((id) => {
    const fact = byWorkItem.get(id);
    if (!fact) fail(`work item ${workItemId} is blocked by ${id}`, "DR4064");
    return clone(fact);
  });
  const proof = body(
    {
      apiVersion: API_VERSION,
      kind: "RunnableFrontierProof",
      workItemId,
      workBreakdownBaseline: clone(workBreakdownBaseline.ref),
      workDependencyBaseline: clone(workDependencyBaseline.ref),
      dependencyGraphDigest: dependencies.graphDigest,
      prerequisiteCompletionFacts,
    },
    "readinessDigest",
  );
  validateWorkExecutionArtifact(proof);
  return Object.freeze({ proof, workItem: clone(workItem) });
}

function permissionAllowed(demand, allowed) {
  const candidate = allowed.find(({ kind }) => kind === demand.kind);
  if (!candidate) return false;
  const allowedValues = new Set(candidate.scope.values);
  return demand.scope.values.every((value) => allowedValues.has(value));
}

export function validateExecutionBinding({
  binding,
  policy,
  assignmentBaseline,
  workItem,
  executorConfigurationDigest,
}) {
  validateWorkExecutionArtifact(binding.value);
  validateWorkExecutionArtifact(policy.value);
  const bindingValue = binding.value;
  const policyValue = policy.value;
  if (bindingValue.workItemId !== workItem.id) fail("ExecutionBinding work item changed");
  if (!sameRef(bindingValue.assignmentBaseline, assignmentBaseline.ref)) {
    fail("ExecutionBinding does not bind the exact SpecialistAssignmentBaseline", "DR4063");
  }
  if (
    bindingValue.executionPolicy.artifactId !== policyValue.policyId ||
    bindingValue.executionPolicy.digest !== policy.ref.digest
  ) {
    fail("ExecutionBinding does not bind the exact ExecutionPolicy", "DR4063");
  }
  const assignment = assignmentBaseline.value.assignments.find(
    ({ workItemRef }) => workItemRef === workItem.id,
  );
  if (!assignment) fail("approved SpecialistAssignmentBaseline has no assignment for the work item");
  if (assignment.specialistProfileRef !== bindingValue.specialistProfileId) {
    fail("ExecutionBinding substituted the approved specialist profile");
  }
  if (!sameStrings(bindingValue.requiredCapabilities, assignment.capabilityCoverage)) {
    fail("ExecutionBinding capability coverage changed");
  }
  if (!sameStrings(bindingValue.requiredTools, assignment.requiredTools)) {
    fail("ExecutionBinding required tools changed");
  }
  if (
    executorConfigurationDigest !== undefined &&
    bindingValue.configurationDigest !== executorConfigurationDigest
  ) {
    fail("executor configuration digest changed", "DR4063");
  }
  for (const demand of bindingValue.permissionDemands) {
    if (!permissionAllowed(demand, policyValue.allowedPermissions)) {
      fail(`permission demand ${demand.kind} is not allowed by ExecutionPolicy`);
    }
  }
  return assignment;
}

function invocationRef(loaded) {
  return clone(loaded.ref);
}

export function assembleExecutorInvocation({
  attemptId,
  workItem,
  readinessProof,
  input,
  workspaceBaseDigest,
  retryLineage,
}) {
  if (!DIGEST.test(workspaceBaseDigest ?? "")) fail("workspaceBaseDigest is invalid");
  const authoritativeInputs = [
    ["work-breakdown-baseline", input.workBreakdownBaseline],
    ["work-dependency-baseline", input.workDependencyBaseline],
    ["integrated-completion-facts", input.integratedCompletionFacts],
    ["specialist-assignment-baseline", input.specialistAssignmentBaseline],
    ["execution-policy", input.executionPolicy],
  ].map(([name, loaded]) => ({ name, artifact: invocationRef(loaded) }));
  const value = {
    apiVersion: API_VERSION,
    kind: "ExecutorInvocation",
    attemptId,
    workItem: clone(workItem),
    authoritativeInputs,
    readinessProof: clone(readinessProof.ref),
    executionBinding: invocationRef(input.executionBinding),
    executionPolicy: invocationRef(input.executionPolicy),
    projectOverviewBaseline: invocationRef(input.projectOverviewBaseline),
    repositorySnapshot: invocationRef(input.repositorySnapshot),
    ...(retryLineage ? { retryLineage: invocationRef(retryLineage) } : {}),
    workspaceBaseDigest,
  };
  const invocation = body(value, "invocationFingerprint");
  validateWorkExecutionArtifact(invocation);
  return invocation;
}

function canonicalRef(value, artifactId, schema, mediaType) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    bytes,
    ref: { artifactId, schema, mediaType, digest: sha256Digest(bytes) },
  };
}

function diagnosticForThrown(invocation, error) {
  const interrupted = error?.name === "AbortError" || error?.code === "ABORT_ERR";
  const diagnostic = {
    apiVersion: API_VERSION,
    kind: "ExecutionDiagnostic",
    attemptId: invocation.attemptId,
    code: interrupted ? "EXECUTOR_INTERRUPTED" : "EXECUTOR_FAILED",
    severity: "error",
    message: String(error?.message ?? error ?? "executor failed"),
  };
  validateWorkExecutionArtifact(diagnostic);
  const artifact = canonicalRef(
    diagnostic,
    `DIAG-${invocation.attemptId}`,
    "https://devrelay.dev/artifacts/execution-diagnostic/v1",
    "application/vnd.devrelay.execution-diagnostic+json",
  );
  return { diagnostic, artifact, terminalState: interrupted ? "interrupted" : "failed" };
}

function diagnosticForInvalidOutput(invocation, error) {
  const diagnostic = {
    apiVersion: API_VERSION,
    kind: "ExecutionDiagnostic",
    attemptId: invocation.attemptId,
    code: "INVALID_EXECUTOR_OUTPUT",
    severity: "error",
    message: String(error?.message ?? error ?? "executor output is invalid"),
  };
  validateWorkExecutionArtifact(diagnostic);
  const artifact = canonicalRef(
    diagnostic,
    `DIAG-INVALID-${invocation.attemptId}`,
    "https://devrelay.dev/artifacts/execution-diagnostic/v1",
    "application/vnd.devrelay.execution-diagnostic+json",
  );
  return { diagnostic, artifact, terminalState: "failed" };
}

function syntheticRawResult(invocation, binding, thrown) {
  return {
    apiVersion: API_VERSION,
    kind: "RawExecutorResult",
    attemptId: invocation.attemptId,
    invocationFingerprint: invocation.invocationFingerprint,
    bindingDigest: binding.bindingDigest,
    executor: clone(binding.executor),
    terminalState: thrown.terminalState,
    mutations: [],
    evidence: [],
    diagnostics: [thrown.artifact.ref],
    nativeArtifacts: [],
  };
}

function validateCheckpoint(value, invocation) {
  if (
    value?.apiVersion !== API_VERSION ||
    value.kind !== "WorkExecutionCheckpoint" ||
    value.attemptId !== invocation.attemptId ||
    value.invocationFingerprint !== invocation.invocationFingerprint ||
    !new Set(["prepared", "recorded"]).has(value.state)
  ) {
    fail("work execution checkpoint is invalid", "DR4065");
  }
  if (value.state === "recorded") {
    const bytes = Buffer.from(value.rawBytesBase64, "base64");
    if (sha256Digest(bytes) !== value.rawDigest) fail("checkpointed raw executor bytes changed", "DR4065");
  }
  return value;
}

export function createInMemoryWorkExecutionCheckpointStore() {
  const values = new Map();
  return Object.freeze({
    async get(key) {
      return values.has(key) ? clone(values.get(key)) : undefined;
    },
    async claim(key, prepared) {
      if (values.has(key)) return { acquired: false, value: clone(values.get(key)) };
      values.set(key, clone(prepared));
      return { acquired: true, value: clone(prepared) };
    },
    async complete(key, preparedDigest, recorded) {
      const current = values.get(key);
      if (!current || canonicalJsonDigest(current) !== preparedDigest || current.state !== "prepared") {
        fail("checkpoint prepared state changed before completion", "DR4065");
      }
      values.set(key, clone(recorded));
      return clone(recorded);
    },
  });
}

export function createWorkExecutionCheckpointController({ executor } = {}) {
  if (!executor || typeof executor.execute !== "function") fail("executor.execute is required");
  if (typeof executor.id !== "string" || typeof executor.version !== "string") {
    fail("executor identity is required");
  }
  return Object.freeze({
    async execute({ invocation, binding, checkpoints }) {
      if (!checkpoints || typeof checkpoints.get !== "function" || typeof checkpoints.claim !== "function" || typeof checkpoints.complete !== "function") {
        fail("durable claim/complete checkpoint storage is required", "DR4065");
      }
      if (executor.id !== binding.executor.id || executor.version !== binding.executor.version) {
        fail("configured executor does not match ExecutionBinding");
      }
      const key = `work-execution/${invocation.attemptId}`;
      const existing = await checkpoints.get(key);
      if (existing) {
        validateCheckpoint(existing, invocation);
        if (existing.state === "prepared") fail("a prepared effect checkpoint requires host reconciliation", "DR4066");
        const rawBytes = Buffer.from(existing.rawBytesBase64, "base64");
        const normalizedBytes = Buffer.from(
          existing.normalizedResultBytesBase64 ?? existing.rawBytesBase64,
          "base64",
        );
        const rawResult = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(normalizedBytes),
        );
        validateWorkExecutionArtifact(rawResult, {
          invocation,
          binding,
          bindingRef: invocation.executionBinding,
        });
        return { key, checkpoint: existing, rawBytes, rawResult, replayed: true, executorCalls: 0, diagnostics: existing.diagnostics ?? [] };
      }
      const prepared = {
        apiVersion: API_VERSION,
        kind: "WorkExecutionCheckpoint",
        state: "prepared",
        attemptId: invocation.attemptId,
        invocationFingerprint: invocation.invocationFingerprint,
        bindingDigest: binding.bindingDigest,
      };
      const preparedDigest = canonicalJsonDigest(prepared);
      const claim = await checkpoints.claim(key, prepared);
      if (!claim.acquired) {
        validateCheckpoint(claim.value, invocation);
        fail("another host owns the prepared effect checkpoint", "DR4066");
      }
      let rawResult;
      let exactRawBytes;
      let diagnostics = [];
      try {
        const produced = await executor.execute(clone(invocation));
        exactRawBytes = rawBytes(produced, "raw executor result");
      } catch (error) {
        const thrown = diagnosticForThrown(invocation, error);
        diagnostics = [thrown.diagnostic];
        rawResult = syntheticRawResult(invocation, binding, thrown);
        exactRawBytes = Buffer.from(canonicalJson(rawResult), "utf8");
      }
      if (rawResult === undefined) {
        try {
          rawResult = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(exactRawBytes),
          );
          validateWorkExecutionArtifact(rawResult, {
            invocation,
            binding,
            bindingRef: invocation.executionBinding,
          });
        } catch (error) {
          const invalid = diagnosticForInvalidOutput(invocation, error);
          diagnostics = [invalid.diagnostic];
          rawResult = syntheticRawResult(invocation, binding, invalid);
        }
      } else {
        validateWorkExecutionArtifact(rawResult, {
          invocation,
          binding,
          bindingRef: invocation.executionBinding,
        });
      }
      const normalizedResultBytes = Buffer.from(canonicalJson(rawResult), "utf8");
      const recorded = {
        ...prepared,
        state: "recorded",
        rawDigest: sha256Digest(exactRawBytes),
        rawBytesBase64: exactRawBytes.toString("base64"),
        normalizedResultBytesBase64: normalizedResultBytes.toString("base64"),
        diagnostics,
      };
      await checkpoints.complete(key, preparedDigest, recorded);
      return { key, checkpoint: recorded, rawBytes: exactRawBytes, rawResult, replayed: false, executorCalls: 1, diagnostics };
    },
  });
}

export function assembleWorkExecutionResult({ invocation, binding, checkpointResult, retryLineage }) {
  const raw = checkpointResult.rawResult;
  const rawArtifact = {
    artifactId: `RAW-${invocation.attemptId}`,
    schema: RAW_SCHEMA,
    mediaType: RAW_MEDIA_TYPE,
    digest: sha256Digest(checkpointResult.rawBytes),
  };
  const attemptValue = {
    apiVersion: API_VERSION,
    kind: "ExecutionAttempt",
    attemptId: invocation.attemptId,
    workItemId: invocation.workItem.id,
    invocationFingerprint: invocation.invocationFingerprint,
    bindingDigest: binding.bindingDigest,
    result: rawArtifact,
    status: raw.terminalState,
    ...(retryLineage ? { predecessorAttempt: clone(retryLineage.value.predecessorAttempt) } : {}),
  };
  const attempt = body(attemptValue, "attemptDigest");
  validateWorkExecutionArtifact(attempt);
  const traceability = body(
    {
      apiVersion: API_VERSION,
      kind: "ExecutionTraceabilityCandidate",
      attempt: { artifactId: attempt.attemptId, digest: attempt.attemptDigest },
      workItemId: invocation.workItem.id,
      authority: "candidate",
      scope: "work-execution/attempt",
    },
    "traceabilityDigest",
  );
  validateWorkExecutionArtifact(traceability);
  if (raw.terminalState !== "proposed") {
    const outcome = raw.terminalState === "failed" ? "execution_failed" : raw.terminalState === "unable-to-proceed" ? "unable_to_proceed" : "interrupted";
    return Object.freeze({ outcome, attempt, traceability, diagnostics: clone(checkpointResult.diagnostics) });
  }
  const changeSet = list(
    { apiVersion: API_VERSION, kind: "ChangeSetDraft", attemptId: invocation.attemptId, mutations: clone(raw.mutations) },
    "changeDigest",
    raw.mutations,
  );
  const evidenceBundle = list(
    { apiVersion: API_VERSION, kind: "ExecutionEvidenceBundle", attemptId: invocation.attemptId, evidence: clone(raw.evidence) },
    "evidenceDigest",
    raw.evidence,
  );
  validateWorkExecutionArtifact(changeSet);
  validateWorkExecutionArtifact(evidenceBundle);
  return Object.freeze({ outcome: "proposed", attempt, changeSet, evidenceBundle, traceability, diagnostics: clone(checkpointResult.diagnostics) });
}

function validateRetryLineage(retryLineage, attemptId) {
  if (
    !retryLineage?.value ||
    !retryLineage?.ref ||
    !(retryLineage.bytes instanceof Uint8Array) ||
    sha256Digest(retryLineage.bytes) !== retryLineage.ref.digest
  ) {
    fail("RetryLineage must be an exact loaded artifact", "DR4063");
  }
  validateWorkExecutionArtifact(retryLineage.value);
  if (retryLineage.value.attemptId !== attemptId) {
    fail("RetryLineage attempt does not match invocation");
  }
  const predecessor = retryLineage.predecessor;
  if (
    !predecessor?.value ||
    !predecessor?.ref ||
    !(predecessor.bytes instanceof Uint8Array) ||
    sha256Digest(predecessor.bytes) !== predecessor.ref.digest
  ) {
    fail("RetryLineage requires the exact loaded predecessor attempt", "DR4063");
  }
  validateWorkExecutionArtifact(predecessor.value);
  if (
    predecessor.value.kind !== "ExecutionAttempt" ||
    predecessor.value.attemptId === attemptId ||
    retryLineage.value.predecessorAttempt.artifactId !== predecessor.value.attemptId ||
    retryLineage.value.predecessorAttempt.digest !== predecessor.value.attemptDigest
  ) {
    fail("RetryLineage predecessor is stale or substituted", "DR4063");
  }
}

export async function executeWorkItem({
  attemptId,
  workItemId,
  input,
  workspaceBaseDigest,
  executor,
  executorConfigurationDigest,
  checkpoints,
  retryLineage,
}) {
  validateLoadedInputs(input);
  if (retryLineage) validateRetryLineage(retryLineage, attemptId);
  const readiness = deriveRunnableFrontierProof({
    workItemId,
    workBreakdownBaseline: input.workBreakdownBaseline,
    workDependencyBaseline: input.workDependencyBaseline,
    integratedCompletionFacts: input.integratedCompletionFacts,
  });
  validateWorkExecutionArtifact(input.runnableFrontierProof.value);
  if (
    input.runnableFrontierProof.value.kind !== "RunnableFrontierProof" ||
    canonicalJsonDigest(input.runnableFrontierProof.value) !==
      canonicalJsonDigest(readiness.proof)
  ) {
    fail(
      "supplied RunnableFrontierProof does not match Core-derived readiness",
      "DR4064",
    );
  }
  validateExecutionBinding({
    binding: input.executionBinding,
    policy: input.executionPolicy,
    assignmentBaseline: input.specialistAssignmentBaseline,
    workItem: readiness.workItem,
    executorConfigurationDigest,
  });
  const invocation = assembleExecutorInvocation({
    attemptId,
    workItem: readiness.workItem,
    readinessProof: input.runnableFrontierProof,
    input,
    workspaceBaseDigest,
    retryLineage,
  });
  const controller = createWorkExecutionCheckpointController({ executor });
  const checkpointResult = await controller.execute({
    invocation,
    binding: input.executionBinding.value,
    checkpoints,
  });
  const assembled = assembleWorkExecutionResult({
    invocation,
    binding: input.executionBinding.value,
    checkpointResult,
    retryLineage,
  });
  return Object.freeze({
    ...assembled,
    invocation,
    readinessProof: readiness.proof,
    checkpoint: clone(checkpointResult.checkpoint),
    replayed: checkpointResult.replayed,
    executorCalls: checkpointResult.executorCalls,
  });
}

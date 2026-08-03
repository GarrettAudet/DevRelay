import { architectureRuntimeArtifactContracts } from "./architecture-runtime-contracts.mjs";
import {
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  validateTraceabilityGraphSnapshot,
} from "./traceability-artifact-validator.mjs";
import {
  sameWorkBreakdownArtifactRef,
  validateWorkBreakdownArtifact,
  validateWorkBreakdownCandidateAgainstInputs,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
  WORK_BREAKDOWN_ARTIFACT_SCHEMAS,
} from "./work-breakdown-artifact-validator.mjs";

const REPOSITORY_SNAPSHOT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
  mediaType: "application/vnd.devrelay.repository-snapshot+json",
});

const STATE_PORTS = Object.freeze({
  "requirements-baseline": "requirementsBaseline",
  "project-overview-baseline": "projectOverviewBaseline",
  "architecture-baseline": "architectureBaseline",
  "contract-disposition": "contractDisposition",
  "capability-catalog": "capabilityCatalog",
  "repository-context": "repositoryContext",
  "current-repository-snapshot": "currentRepositorySnapshot",
  "current-work-breakdown-baseline": "currentWorkBreakdownBaseline",
  "approved-change-package": "approvedChangePackage",
});

const OPERATION_PORTS = Object.freeze({
  "establish-breakdown": Object.freeze([
    "requirements-baseline",
    "project-overview-baseline",
    "architecture-baseline",
    "contract-disposition",
    "capability-catalog",
    "repository-context",
  ]),
  "decompose-change": Object.freeze([
    "requirements-baseline",
    "project-overview-baseline",
    "architecture-baseline",
    "contract-disposition",
    "capability-catalog",
    "current-repository-snapshot",
    "current-work-breakdown-baseline",
    "approved-change-package",
  ]),
});

const BINDABLE_INPUTS = new Set([
  "project-work-breakdown-state",
  ...Object.keys(STATE_PORTS),
  "clarification-request",
  "clarification-responses",
  "continuation",
  "revision-request",
]);

function fail(message) {
  throw new Error(`work-breakdown runtime lineage failed: ${message}`);
}

function oneLoaded(group, port) {
  const entries = group?.[port];
  return entries?.length === 1 ? entries[0] : undefined;
}

function requireLoaded(group, port, label = "runtime") {
  const loaded = oneLoaded(group, port);
  if (!loaded) fail(`${label} requires exactly one ${port} artifact`);
  return loaded;
}

function refKey(ref) {
  return [ref?.artifactId, ref?.schema, ref?.mediaType, ref?.digest].join(
    "\u0000",
  );
}

function sameRef(left, right) {
  return refKey(left) === refKey(right);
}

function assertRef(label, actual, expected) {
  if (!sameRef(actual, expected)) {
    fail(`${label} does not match the exact content-addressed artifact`);
  }
}

function assertSchemaMedia(loaded, contract, label) {
  if (
    loaded.ref.schema !== contract.schema ||
    loaded.ref.mediaType !== contract.mediaType
  ) {
    fail(
      `${label} must pair schema ${contract.schema} with media type ${contract.mediaType}`,
    );
  }
}

function assertRepositoryPair(context) {
  const repository = oneLoaded(context.loadedInputs, "repository-context");
  if (!repository) return;
  if (repository.value.kind === "RepositorySnapshot") {
    assertSchemaMedia(repository, REPOSITORY_SNAPSHOT, "repository-context");
    return;
  }
  if (repository.value.kind === "ApprovedNotApplicable") {
    assertSchemaMedia(
      repository,
      WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedNotApplicable,
      "repository-context",
    );
    if (repository.value.purpose !== "repository-context") {
      fail("repository-context ApprovedNotApplicable has the wrong purpose");
    }
    return;
  }
  fail("repository-context is not a supported union member");
}

function inputBindingsMap(bindings) {
  return new Map(bindings.map((entry) => [entry.role, entry.artifact]));
}

function assertCurrentInputBindings(bindings, context, label) {
  const expected = Object.entries(context.loadedInputs ?? {})
    .filter(([port, values]) => BINDABLE_INPUTS.has(port) && values.length === 1)
    .map(([port]) => port);
  const actual = inputBindingsMap(bindings);
  if (
    actual.size !== expected.length ||
    [...actual.keys()].some((port) => !expected.includes(port))
  ) {
    fail(`${label} does not bind the exact current invocation inputs`);
  }
  for (const port of expected) {
    assertRef(
      `${label} input ${port}`,
      actual.get(port),
      requireLoaded(context.loadedInputs, port, label).ref,
    );
  }
}

function assertSourceInvocation(source, context, label) {
  const producer = context.producer;
  if (
    !producer ||
    source.invocationId !== context.invocation.invocationId ||
    source.invocationId !== producer.invocationId ||
    source.invocationFingerprint !== producer.invocationFingerprint ||
    source.stepInvocationDigest !== producer.stepInvocationDigest ||
    source.plugin?.id !== producer.plugin?.id ||
    source.plugin?.version !== producer.plugin?.version
  ) {
    fail(`${label} source invocation does not match the current producer`);
  }
}

function assertClarificationIssuance(context) {
  const request = requireLoaded(
    context.loadedArtifacts,
    "clarification-requests",
    "clarification issuance",
  );
  const continuation = requireLoaded(
    context.loadedArtifacts,
    "continuation",
    "clarification issuance",
  );
  if (
    request.value.kind !== "WorkBreakdownClarificationRequestSet" ||
    continuation.value.kind !== "WorkBreakdownContinuation"
  ) {
    fail("clarification issuance returned the wrong artifact kinds");
  }
  assertSourceInvocation(request.value.sourceInvocation, context, "request");
  assertSourceInvocation(
    continuation.value.sourceInvocation,
    context,
    "continuation",
  );
  if (
    request.value.operation !== context.invocation.module.operation ||
    continuation.value.operation !== context.invocation.module.operation
  ) {
    fail("clarification artifacts do not bind the selected operation");
  }
  assertCurrentInputBindings(request.value.inputBindings, context, "request");
  assertCurrentInputBindings(
    continuation.value.inputBindings,
    context,
    "continuation",
  );
  assertRef(
    "continuation clarification request",
    continuation.value.clarificationRequest,
    request.ref,
  );
}

function assertOriginalBindings(bindings, context, label) {
  const actual = inputBindingsMap(bindings);
  const required = [
    "project-work-breakdown-state",
    ...OPERATION_PORTS[context.invocation.module.operation],
  ];
  for (const port of required) {
    const loaded = requireLoaded(context.loadedInputs, port, label);
    assertRef(`${label} input ${port}`, actual.get(port), loaded.ref);
  }
}

function assertClarificationResponses(request, response) {
  const questions = new Map(
    request.questions.map((question) => [question.id, question]),
  );
  const responses = new Map();
  for (const entry of response.responses) {
    if (!questions.has(entry.questionId)) {
      fail(`clarification response answers unknown ${entry.questionId}`);
    }
    responses.set(entry.questionId, entry);
  }
  for (const question of questions.values()) {
    if (question.blocking && !responses.has(question.id)) {
      fail(`blocking clarification question ${question.id} is unanswered`);
    }
  }
}

function assertCheckpointOutput(checkpoint, port, expected) {
  const refs = checkpoint.moduleResult?.outputs?.[port];
  if (!Array.isArray(refs) || refs.length !== 1) {
    fail(`clarification source checkpoint has invalid ${port} output`);
  }
  assertRef(`clarification checkpoint ${port}`, refs[0], expected);
}

async function assertClarificationResume(context) {
  const request = requireLoaded(
    context.loadedInputs,
    "clarification-request",
    "clarification resume",
  );
  const response = requireLoaded(
    context.loadedInputs,
    "clarification-responses",
    "clarification resume",
  );
  const continuation = requireLoaded(
    context.loadedInputs,
    "continuation",
    "clarification resume",
  );
  assertRef(
    "clarification response request",
    response.value.clarificationRequest,
    request.ref,
  );
  assertRef(
    "continuation request",
    continuation.value.clarificationRequest,
    request.ref,
  );
  if (
    continuation.value.operation !== context.invocation.module.operation ||
    request.value.operation !== context.invocation.module.operation
  ) {
    fail("clarification resume operation does not match the invocation");
  }
  if (
    continuation.value.sourceInvocation.plugin.id !==
      context.invocation.plugin.id ||
    continuation.value.sourceInvocation.plugin.version !==
      context.invocation.plugin.version
  ) {
    fail("clarification resume changed the configured plug-in");
  }
  assertOriginalBindings(request.value.inputBindings, context, "request");
  assertOriginalBindings(
    continuation.value.inputBindings,
    context,
    "continuation",
  );
  assertClarificationResponses(request.value, response.value);
  if (typeof context.loadCheckpoint !== "function") {
    fail("clarification resume requires source checkpoint lookup");
  }
  const source = continuation.value.sourceInvocation;
  const checkpoint = await context.loadCheckpoint(source.stepInvocationDigest);
  if (
    !checkpoint ||
    checkpoint.kind !== "ModuleStepResult" ||
    checkpoint.disposition !== "terminal" ||
    checkpoint.invocationId !== source.invocationId ||
    checkpoint.invocationFingerprint !== source.invocationFingerprint ||
    checkpoint.stepInvocationDigest !== source.stepInvocationDigest ||
    checkpoint.plugin?.id !== source.plugin.id ||
    checkpoint.plugin?.version !== source.plugin.version ||
    checkpoint.moduleResult?.status !== "completed" ||
    checkpoint.moduleResult?.outcome !== "needs_clarification"
  ) {
    fail("clarification source checkpoint identity is invalid");
  }
  assertCheckpointOutput(checkpoint, "clarification-requests", request.ref);
  assertCheckpointOutput(checkpoint, "continuation", continuation.ref);
}

async function loadArchitectureModelAttachment(context, loadedInputs) {
  const architecture = oneLoaded(
    loadedInputs ?? context.loadedInputs,
    "architecture-baseline",
  );
  const section = architecture?.value?.sections?.architectureModel;
  if (section?.mode !== "attached") return undefined;
  if (typeof context.loadArtifact !== "function") {
    fail("attached architecture model requires an exact artifact-record loader");
  }
  const loaded = await context.loadArtifact(section.artifact);
  assertRef("attached architecture model", loaded?.ref, section.artifact);
  return loaded;
}

async function assertApprovedChangeTraceability(value, context) {
  if (typeof context.loadArtifact !== "function") {
    fail("approved change traceability requires an exact artifact-record loader");
  }
  const snapshots = new Map();
  for (const traceabilityRef of value.traceabilityRefs) {
    const key = refKey(traceabilityRef.artifact);
    let snapshot = snapshots.get(key);
    if (!snapshot) {
      const loaded = await context.loadArtifact(traceabilityRef.artifact);
      assertRef(
        "approved change traceability snapshot",
        loaded?.ref,
        traceabilityRef.artifact,
      );
      assertSchemaMedia(
        loaded,
        {
          schema: TRACEABILITY_GRAPH_SCHEMA,
          mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
        },
        "approved change traceability snapshot",
      );
      validateTraceabilityGraphSnapshot(loaded.value);
      snapshot = new Set(loaded.value.nodes.map(({ nodeId }) => nodeId));
      snapshots.set(key, snapshot);
    }
    if (!snapshot.has(traceabilityRef.nodeId)) {
      fail(
        `approved change traceability node ${traceabilityRef.nodeId} is not present in its exact snapshot`,
      );
    }
  }
}

async function assertRevisionRequest(value, context) {
  if (typeof context.loadArtifact !== "function") {
    fail("revision request requires an exact artifact-record loader");
  }
  const candidate = await context.loadArtifact(value.candidate);
  assertRef("revision request candidate", candidate?.ref, value.candidate);
  const operation = context.invocation.module.operation;
  const expectedKind =
    operation === "establish-breakdown"
      ? "WorkBreakdownDraft"
      : "WorkBreakdownChangeSetDraft";
  if (
    candidate.value.kind !== expectedKind ||
    candidate.value.operation !== operation
  ) {
    fail(`revision request candidate must be a ${expectedKind} for ${operation}`);
  }
  validateWorkBreakdownArtifact(candidate.value, { ref: candidate.ref });
  const candidateInputs = { ...context.loadedInputs };
  delete candidateInputs["revision-request"];
  validateWorkBreakdownCandidateAgainstInputs({
    candidate: candidate.value,
    operation,
    loadedInputs: candidateInputs,
    architectureModelAttachment: await loadArchitectureModelAttachment(
      context,
      candidateInputs,
    ),
  });
  const gateEvidence = await context.loadArtifact(value.gateEvidence);
  assertRef("revision request gate evidence", gateEvidence?.ref, value.gateEvidence);
}

async function validateWorkBreakdownRuntimeArtifact(value, context) {
  validateWorkBreakdownArtifact(value, context);
  if (value.kind === "ProjectWorkBreakdownState") {
    assertRepositoryPair(context);
  }
  if (
    context.phase === "output" &&
    (value.kind === "WorkBreakdownDraft" ||
      value.kind === "WorkBreakdownChangeSetDraft")
  ) {
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: value,
      operation: context.invocation.module.operation,
      loadedInputs: context.loadedInputs,
      architectureModelAttachment: await loadArchitectureModelAttachment(
        context,
      ),
    });
  }
  if (
    context.phase === "input" &&
    value.kind === "ApprovedChangePackage"
  ) {
    await assertApprovedChangeTraceability(value, context);
  }
  if (
    context.phase === "input" &&
    value.kind === "WorkBreakdownRevisionRequest"
  ) {
    await assertRevisionRequest(value, context);
  }
  if (
    context.phase === "output" &&
    (value.kind === "WorkBreakdownClarificationRequestSet" ||
      value.kind === "WorkBreakdownContinuation")
  ) {
    assertClarificationIssuance(context);
  }
  if (
    context.phase === "input" &&
    value.kind === "WorkBreakdownContinuation"
  ) {
    await assertClarificationResume(context);
  }
  return value;
}

function driftResult(invocationId, messages) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId,
    status: "completed",
    outcome: "baseline_drift",
    outputs: {},
    evidence: [],
    diagnostics: [
      {
        severity: "error",
        code: "WB_BASELINE_DRIFT",
        message: messages.sort().join("; "),
      },
    ],
  };
}

function recordRefDrift(messages, label, actual, expected) {
  if (!sameRef(actual, expected)) messages.push(`${label} changed`);
}

function collectStateDrift(context) {
  const messages = [];
  const operation = context.invocation.module.operation;
  const state = oneLoaded(
    context.loadedInputs,
    "project-work-breakdown-state",
  );
  if (!state) return ["project work-breakdown state is missing"];
  const expectedState =
    operation === "establish-breakdown" ? "unbaselined" : "baselined";
  if (state.value.state !== expectedState) {
    messages.push(`state is ${state.value.state}, expected ${expectedState}`);
  }
  for (const port of OPERATION_PORTS[operation] ?? []) {
    const loaded = oneLoaded(context.loadedInputs, port);
    if (!loaded) {
      messages.push(`${port} is missing`);
      continue;
    }
    recordRefDrift(
      messages,
      `state ${STATE_PORTS[port]}`,
      state.value[STATE_PORTS[port]],
      loaded.ref,
    );
  }
  const architecture = oneLoaded(
    context.loadedInputs,
    "architecture-baseline",
  );
  recordRefDrift(
    messages,
    "architecture baseline requirements baseline",
    architecture?.value?.requirementsBaseline,
    oneLoaded(context.loadedInputs, "requirements-baseline")?.ref,
  );
  recordRefDrift(
    messages,
    "architecture baseline project overview baseline",
    architecture?.value?.projectOverviewBaseline,
    oneLoaded(context.loadedInputs, "project-overview-baseline")?.ref,
  );
  if (operation !== "decompose-change") return messages;
  const change = oneLoaded(context.loadedInputs, "approved-change-package");
  if (!change) return messages;
  for (const [property, port] of [
    ["requirementsBaseline", "requirements-baseline"],
    ["projectOverviewBaseline", "project-overview-baseline"],
    ["architectureBaseline", "architecture-baseline"],
    ["contractDisposition", "contract-disposition"],
  ]) {
    recordRefDrift(
      messages,
      `approved change target ${property}`,
      change.value.target[property],
      oneLoaded(context.loadedInputs, port)?.ref,
    );
  }
  const baseline = oneLoaded(
    context.loadedInputs,
    "current-work-breakdown-baseline",
  );
  const baselineBindings = baseline
    ? inputBindingsMap(baseline.value.inputBindings)
    : new Map();
  for (const [property, port] of [
    ["requirementsBaseline", "requirements-baseline"],
    ["projectOverviewBaseline", "project-overview-baseline"],
    ["architectureBaseline", "architecture-baseline"],
    ["contractDisposition", "contract-disposition"],
  ]) {
    recordRefDrift(
      messages,
      `approved change pre-change ${property}`,
      change.value.preChange[property],
      baselineBindings.get(port),
    );
  }
  recordRefDrift(
    messages,
    "approved change current work-breakdown baseline",
    change.value.currentWorkBreakdownBaseline,
    baseline?.ref,
  );
  const repository = oneLoaded(
    context.loadedInputs,
    "current-repository-snapshot",
  );
  recordRefDrift(
    messages,
    "approved change current repository",
    change.value.currentRepository.artifact,
    repository?.ref,
  );
  if (
    repository &&
    (change.value.currentRepository.revision !== repository.value.revision ||
      change.value.currentRepository.treeDigest !== repository.value.treeDigest)
  ) {
    messages.push("approved change repository revision or tree digest changed");
  }
  return messages;
}

export const WORK_BREAKDOWN_INPUT_GUARD = Object.freeze({
  id: "work-breakdown-baseline-drift",
  version: "0.1.0",
  outcomes: Object.freeze(["baseline_drift"]),
  evaluate(context) {
    const messages = collectStateDrift(context);
    return messages.length === 0
      ? undefined
      : driftResult(context.invocation.invocationId, messages);
  },
});

export function workBreakdownRuntimeArtifactContracts() {
  const contracts = [
    ...architectureRuntimeArtifactContracts(),
    ...WORK_BREAKDOWN_ARTIFACT_SCHEMAS.map((schema) => ({
      schema,
      validate: validateWorkBreakdownRuntimeArtifact,
      ...(schema ===
      WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ProjectWorkBreakdownState.schema
        ? { inputGuard: WORK_BREAKDOWN_INPUT_GUARD }
        : {}),
    })),
  ];
  return [
    ...new Map(contracts.map((contract) => [contract.schema, contract])).values(),
  ];
}

export function evaluateWorkBreakdownInputDrift(context) {
  const messages = collectStateDrift(context);
  return immutableDriftMessages(messages);
}

function immutableDriftMessages(messages) {
  return Object.freeze([...messages].sort());
}

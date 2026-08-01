import { canonicalJsonDigest } from "./content-digest.mjs";
import { projectOverviewRuntimeArtifactContracts } from "./project-overview-runtime-contracts.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";
import { validateSharedArtifact } from "./shared-artifact-validator.mjs";

const NATIVE_SOURCE_SCHEMA =
  "https://devrelay.dev/artifacts/native-source-bundle/v1";

const REQUIREMENTS_SCHEMAS = Object.freeze([
  "https://devrelay.dev/artifacts/goal/v1",
  "https://devrelay.dev/artifacts/project-context/v1",
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "https://devrelay.dev/artifacts/requirements-draft/v1",
  "https://devrelay.dev/artifacts/requirements-change-set/v1",
  "https://devrelay.dev/artifacts/clarification-request-set/v1",
  "https://devrelay.dev/artifacts/clarification-response-set/v1",
  "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
]);

const BASE_INPUT_PORTS = Object.freeze([
  ["goal", "goal"],
  ["project-context", "project-context"],
  ["repository-snapshot", "repository-snapshot"],
  ["requirements-baseline", "requirements-baseline"],
  ["project-overview-baseline", "project-overview-baseline"],
]);

function fail(message) {
  throw new Error(`requirements runtime lineage failed: ${message}`);
}

function oneLoaded(loaded, port) {
  const entries = loaded?.[port];
  return entries?.length === 1 ? entries[0] : undefined;
}

function samePointer(left, right) {
  return left?.artifactId === right?.artifactId && left?.digest === right?.digest;
}

function assertPointer(label, actual, expected) {
  if (!samePointer(actual, expected)) {
    fail(`${label} does not match the exact runtime artifact`);
  }
}

function expectedBaseInputs(context) {
  return new Map(
    BASE_INPUT_PORTS.flatMap(([role, port]) => {
      const loaded = oneLoaded(context.loadedInputs, port);
      return loaded === undefined ? [] : [[role, loaded.ref]];
    }),
  );
}

function assertBaseInputs(baseInputs, context, owner) {
  const requirementsBaseline = oneLoaded(
    context.loadedInputs,
    "requirements-baseline",
  );
  const projectOverviewBaseline = oneLoaded(
    context.loadedInputs,
    "project-overview-baseline",
  );
  if (Boolean(requirementsBaseline) !== Boolean(projectOverviewBaseline)) {
    fail(
      `${owner} requires requirements-baseline and project-overview-baseline together`,
    );
  }
  const expected = expectedBaseInputs(context);
  if (baseInputs.length !== expected.size) {
    fail(`${owner} base inputs are not the exact invocation lineage`);
  }
  const seen = new Set();
  for (const { role, artifact } of baseInputs) {
    if (seen.has(role) || !expected.has(role)) {
      fail(`${owner} base input ${role} is duplicate or undeclared`);
    }
    seen.add(role);
    assertPointer(`${owner} base input ${role}`, artifact, expected.get(role));
  }
}

function baseInputPointer(baseInputs, role) {
  return baseInputs.find((entry) => entry.role === role)?.artifact;
}

function uniqueBy(values, keyOf, label) {
  const seen = new Set();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) {
      fail(`${label} contains duplicate ${key}`);
    }
    seen.add(key);
  }
  return seen;
}

function assertDraftLineage(draft, context) {
  const goal = oneLoaded(context.loadedInputs, "goal");
  const projectContext = oneLoaded(context.loadedInputs, "project-context");
  if (!goal || !projectContext) {
    fail("requirements draft requires loaded goal and project context");
  }
  assertBaseInputs(draft.baseInputs, context, "requirements draft");
  assertPointer("requirements draft goal", draft.goal, goal.ref);
  assertPointer(
    "requirements draft project context",
    draft.projectContext,
    projectContext.ref,
  );
  assertPointer(
    "requirements draft goal/baseInputs consistency",
    draft.goal,
    baseInputPointer(draft.baseInputs, "goal"),
  );
  assertPointer(
    "requirements draft projectContext/baseInputs consistency",
    draft.projectContext,
    baseInputPointer(draft.baseInputs, "project-context"),
  );
  assertProjectLifecycle(
    draft.requirements,
    projectContext.value,
    "requirements draft",
  );
  assertCitationClosure(draft, context, "requirements draft", true);
}

function collectSourceRefs(value, collected = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectSourceRefs(entry, collected);
    }
    return collected;
  }
  if (value === null || typeof value !== "object") {
    return collected;
  }
  if (Array.isArray(value.sourceRefs)) {
    for (const sourceRef of value.sourceRefs) {
      collected.push(sourceRef);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "sourceRefs") {
      collectSourceRefs(child, collected);
    }
  }
  return collected;
}

function addAllowedRole(allowed, artifact, role) {
  const key = pointerKey(artifact);
  const roles = allowed.get(key) ?? new Set();
  roles.add(role);
  allowed.set(key, roles);
}

function assertCitationClosure(
  value,
  context,
  owner,
  allowNativeSources,
  additionalSourceRefs = [],
) {
  const allowed = new Map();
  for (const [role, artifact] of expectedBaseInputs(context)) {
    addAllowedRole(allowed, artifact, role);
  }
  for (const sourceRef of additionalSourceRefs) {
    addAllowedRole(allowed, sourceRef.artifact, sourceRef.role);
  }
  if (allowNativeSources) {
    for (const loaded of context.loadedArtifacts?.["native-source-bundle"] ?? []) {
      for (const source of loaded.value.sources) {
        addAllowedRole(allowed, source.artifact, source.role);
      }
    }
  }
  for (const sourceRef of collectSourceRefs(value)) {
    const roles = allowed.get(pointerKey(sourceRef.artifact));
    if (!roles) {
      fail(
        `${owner} cites evidence that is neither an exact base input nor an allowed native source`,
      );
    }
    if (!roles.has(sourceRef.role)) {
      fail(
        `${owner} source reference role ${sourceRef.role} does not match the exact runtime evidence role`,
      );
    }
  }
}

function assertProjectLifecycle(body, projectContext, owner) {
  if (body.currentStatus.lifecycle !== projectContext.lifecycle) {
    fail(
      `${owner} current status lifecycle does not match the exact project context`,
    );
  }
}

function changedSections(current, replacement) {
  return Object.keys(replacement)
    .filter(
      (section) =>
        canonicalJsonDigest(current[section]) !==
        canonicalJsonDigest(replacement[section]),
    )
    .sort();
}

function assertExactChangedSections(actual, expected) {
  if (
    actual.length !== expected.length ||
    actual.some((section, index) => section !== expected[index])
  ) {
    fail(
      "requirements change-set changedSections do not exactly describe the replacement",
    );
  }
}

function assertChangeSetLineage(changeSet, context) {
  assertBaseInputs(changeSet.baseInputs, context, "requirements change set");
  const baseline = oneLoaded(context.loadedInputs, "requirements-baseline");
  const projectContext = oneLoaded(context.loadedInputs, "project-context");
  if (!baseline || !projectContext) {
    fail(
      "requirements change set requires the loaded baseline and project context",
    );
  }
  assertPointer(
    "requirements change-set baseline",
    changeSet.baseline,
    baseline.ref,
  );
  assertPointer(
    "requirements change-set baseline/baseInputs consistency",
    changeSet.baseline,
    baseInputPointer(changeSet.baseInputs, "requirements-baseline"),
  );

  const current = baseline.value.requirements;
  const currentDigest = canonicalJsonDigest(current);
  if (changeSet.expectedRequirementsDigest !== currentDigest) {
    fail("requirements change-set expected requirements digest is stale");
  }
  const replacementDigest = canonicalJsonDigest(changeSet.replacement);
  if (replacementDigest === currentDigest) {
    fail("requirements change-set replacement is an exact no-op");
  }
  assertExactChangedSections(
    changeSet.changedSections,
    changedSections(current, changeSet.replacement),
  );
  assertProjectLifecycle(
    changeSet.replacement,
    projectContext.value,
    "requirements change-set replacement",
  );
  assertCitationClosure(
    changeSet,
    context,
    "requirements change set",
    true,
    collectSourceRefs(baseline.value),
  );
}

function questionMap(request) {
  const questions = new Map();
  for (const question of request.questions) {
    if (questions.has(question.id)) {
      fail(`clarification request contains duplicate ${question.id}`);
    }
    questions.set(question.id, question);
  }
  return questions;
}

function assertQuestionIds(request, continuation) {
  const questions = questionMap(request);
  const unresolved = uniqueBy(
    continuation.unresolvedQuestionIds,
    (id) => id,
    "clarification continuation unresolved questions",
  );
  if (
    questions.size !== unresolved.size ||
    [...questions.keys()].some((id) => !unresolved.has(id))
  ) {
    fail(
      "clarification request questions do not match continuation unresolved questions",
    );
  }
  return questions;
}

function assertAnswer(question, answer) {
  if (question.responseType === "free-text") {
    if (typeof answer !== "string") {
      fail(`clarification answer for ${question.id} must be free text`);
    }
    return;
  }
  if (question.responseType === "boolean") {
    if (typeof answer !== "boolean") {
      fail(`clarification answer for ${question.id} must be boolean`);
    }
    return;
  }
  if (question.responseType === "single-choice") {
    if (typeof answer !== "string" || !question.options.includes(answer)) {
      fail(`clarification answer for ${question.id} is not a declared choice`);
    }
    return;
  }
  if (
    !Array.isArray(answer) ||
    answer.some((choice) => !question.options.includes(choice))
  ) {
    fail(`clarification answer for ${question.id} is not a declared choice set`);
  }
}

function assertResponseSet(request, response) {
  const questions = questionMap(request);
  const responses = new Map();
  for (const entry of response.responses) {
    if (responses.has(entry.questionId)) {
      fail(`clarification responses contain duplicate ${entry.questionId}`);
    }
    const question = questions.get(entry.questionId);
    if (!question) {
      fail(`clarification response answers unknown ${entry.questionId}`);
    }
    assertAnswer(question, entry.answer);
    responses.set(entry.questionId, entry);
  }
  for (const question of questions.values()) {
    if (question.blocking && !responses.has(question.id)) {
      fail(`blocking clarification question ${question.id} is unanswered`);
    }
  }
}

function clarificationTriad(context) {
  const request = oneLoaded(context.loadedInputs, "clarification-request");
  const response = oneLoaded(context.loadedInputs, "clarification-responses");
  const continuation = oneLoaded(context.loadedInputs, "continuation");
  const present = [request, response, continuation].filter(Boolean).length;
  if (present === 0) {
    return undefined;
  }
  if (present !== 3) {
    fail("clarification resume requires the exact request/response/continuation triad");
  }
  return { request, response, continuation };
}

function assertPlugin(label, actual, expected) {
  if (
    actual?.id !== expected?.id ||
    actual?.version !== expected?.version
  ) {
    fail(`${label} does not match the exact configured plug-in`);
  }
}

function assertCheckpointOutput(checkpoint, port, expected) {
  const refs = checkpoint.moduleResult?.outputs?.[port];
  if (!Array.isArray(refs) || refs.length !== 1) {
    fail(`clarification source checkpoint has invalid ${port} outputs`);
  }
  assertPointer(`clarification source checkpoint ${port}`, refs[0], expected);
}

async function assertSourceCheckpoint(request, continuation, context) {
  const source = continuation.value.sourceInvocation;
  if (typeof context.loadCheckpoint !== "function") {
    fail("clarification resume requires checkpoint lookup support");
  }
  const checkpoint = await context.loadCheckpoint(source.stepInvocationDigest);
  if (!checkpoint) {
    fail("clarification source checkpoint is missing");
  }
  if (
    checkpoint.kind !== "ModuleStepResult" ||
    checkpoint.disposition !== "terminal" ||
    checkpoint.step !== "single-adapter" ||
    checkpoint.invocationId !== source.invocationId ||
    checkpoint.invocationFingerprint !== source.invocationFingerprint ||
    checkpoint.chainFingerprint !== source.invocationFingerprint ||
    checkpoint.stepInvocationDigest !== source.stepInvocationDigest
  ) {
    fail("clarification source checkpoint identity is invalid");
  }
  assertPlugin("clarification source checkpoint plug-in", checkpoint.plugin, source.plugin);
  if (
    checkpoint.moduleResult?.invocationId !== source.invocationId ||
    checkpoint.moduleResult?.status !== "completed" ||
    checkpoint.moduleResult?.outcome !== "needs_clarification"
  ) {
    fail("clarification source checkpoint is not a completed clarification result");
  }
  assertCheckpointOutput(
    checkpoint,
    "clarification-requests",
    request.ref,
  );
  assertCheckpointOutput(
    checkpoint,
    "continuation",
    continuation.ref,
  );
}

async function assertClarificationResume(context) {
  const triad = clarificationTriad(context);
  if (!triad) {
    return;
  }
  const { request, response, continuation } = triad;
  assertBaseInputs(request.value.baseInputs, context, "clarification request");
  assertBaseInputs(
    continuation.value.baseInputs,
    context,
    "clarification continuation",
  );
  assertPointer(
    "clarification continuation request",
    continuation.value.clarificationRequest,
    request.ref,
  );
  assertPointer(
    "clarification response request",
    response.value.request,
    request.ref,
  );
  assertQuestionIds(request.value, continuation.value);
  assertResponseSet(request.value, response.value);
  assertCitationClosure(
    continuation.value,
    context,
    "clarification continuation",
    false,
  );
  await assertSourceCheckpoint(request, continuation, context);
}

function outputArtifact(context, port) {
  return oneLoaded(context.loadedArtifacts, port);
}

function assertSourceInvocation(continuation, context) {
  const source = continuation.sourceInvocation;
  const producer = context.producer;
  if (
    !producer ||
    source.invocationId !== context.invocation.invocationId ||
    source.invocationId !== producer.invocationId ||
    source.invocationFingerprint !== producer.invocationFingerprint ||
    source.stepInvocationDigest !== producer.stepInvocationDigest
  ) {
    fail("clarification continuation source invocation is not the current invocation");
  }
  assertPlugin(
    "clarification continuation source plug-in",
    source.plugin,
    producer.plugin,
  );
}

function assertClarificationIssuance(context) {
  const request = outputArtifact(context, "clarification-requests");
  const continuation = outputArtifact(context, "continuation");
  if (!request || !continuation) {
    fail("clarification issuance requires request and continuation outputs");
  }
  assertBaseInputs(request.value.baseInputs, context, "clarification request");
  assertBaseInputs(
    continuation.value.baseInputs,
    context,
    "clarification continuation",
  );
  assertPointer(
    "clarification continuation request",
    continuation.value.clarificationRequest,
    request.ref,
  );
  assertQuestionIds(request.value, continuation.value);
  assertCitationClosure(
    continuation.value,
    context,
    "clarification continuation",
    false,
  );
  assertSourceInvocation(continuation.value, context);
}

function pointerKey(pointer) {
  return `${pointer.artifactId}\u0000${pointer.digest}`;
}

function portableSourcePath(path) {
  if (
    path !== path.normalize("NFC") ||
    /[\u0000-\u001f\u007f-\u009f]/.test(path) ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    /[:*?"<>|]/.test(path)
  ) {
    fail(`native source path ${JSON.stringify(path)} is not portable`);
  }
  const segments = path.split("/");
  const windowsReservedName =
    /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/iu;
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        windowsReservedName.test(segment),
    )
  ) {
    fail(`native source path ${JSON.stringify(path)} is ambiguous`);
  }
  return path.toLowerCase();
}

async function assertNativeSourceLineage(bundle, context) {
  const configuredPlugin = context.producer?.plugin ?? context.invocation.plugin;
  assertPlugin("native source bundle plug-in", bundle.plugin, configuredPlugin);
  const config = context.invocation.config;
  if (
    bundle.tool.name !== config.toolName ||
    bundle.tool.version !== config.toolVersion ||
    bundle.operation !== config.nativeOperation
  ) {
    fail("native source tool identity or operation does not match invocation config");
  }
  const configuredSchema = config.schema;
  if (
    (configuredSchema === undefined && bundle.schema !== undefined) ||
    (configuredSchema !== undefined && bundle.schema !== configuredSchema)
  ) {
    fail("native source schema does not match invocation config");
  }

  const expected = Object.entries(context.loadedArtifacts ?? {}).flatMap(
    ([port, artifacts]) =>
      port === "native-source-bundle"
        ? []
        : artifacts.map(({ ref }) => ref),
  );
  const expectedKeys = uniqueBy(
    expected,
    pointerKey,
    "current non-native outputs",
  );
  const actualKeys = uniqueBy(
    bundle.canonicalOutputs,
    pointerKey,
    "native source canonical outputs",
  );
  if (
    expectedKeys.size === 0 ||
    expectedKeys.size !== actualKeys.size ||
    [...expectedKeys].some((key) => !actualKeys.has(key))
  ) {
    fail(
      "native source canonical outputs do not match the exact current non-native outputs",
    );
  }

  if (typeof context.loadBytes !== "function") {
    fail("native source verification requires raw artifact loading support");
  }
  uniqueBy(
    bundle.sources,
    ({ artifact }) => artifact.artifactId,
    "native source artifact identities",
  );
  uniqueBy(
    bundle.sources,
    ({ artifact }) => pointerKey(artifact),
    "native source artifact references",
  );
  uniqueBy(
    bundle.sources,
    ({ path }) => portableSourcePath(path),
    "native source paths",
  );
  for (const source of bundle.sources) {
    await context.loadBytes(source.artifact);
  }
}

async function validateRequirementsRuntimeArtifact(value, context) {
  validateRequirementsArtifact(value);

  if (
    context.phase === "input" &&
    value.kind === "RequirementsGatheringContinuation"
  ) {
    await assertClarificationResume(context);
  }
  if (context.phase !== "output") {
    return value;
  }
  if (value.kind === "RequirementsDraft") {
    assertDraftLineage(value, context);
  } else if (value.kind === "RequirementsChangeSet") {
    assertChangeSetLineage(value, context);
  } else if (
    value.kind === "ClarificationRequestSet" ||
    value.kind === "RequirementsGatheringContinuation"
  ) {
    assertClarificationIssuance(context);
  }
  return value;
}

async function validateNativeSourceRuntimeArtifact(value, context) {
  validateSharedArtifact(value);
  if (context.phase === "output") {
    await assertNativeSourceLineage(value, context);
  }
  return value;
}

export function requirementsRuntimeArtifactContracts() {
  const contracts = [
    ...REQUIREMENTS_SCHEMAS.map((schema) => ({
      schema,
      validate: validateRequirementsRuntimeArtifact,
    })),
    {
      schema: NATIVE_SOURCE_SCHEMA,
      validate: validateNativeSourceRuntimeArtifact,
    },
    ...projectOverviewRuntimeArtifactContracts(),
  ];
  return [...new Map(contracts.map((contract) => [contract.schema, contract])).values()];
}

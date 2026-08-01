import { validateArchitectureArtifact } from "./architecture-artifact-validator.mjs";

export class ArchitectureHandoffValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArchitectureHandoffValidationError";
    this.code = "DR2850";
  }
}

function fail(message) {
  throw new ArchitectureHandoffValidationError(
    `architecture clarification handoff is invalid: ${message}`,
  );
}

function oneInput(invocation, name) {
  const values = invocation.inputs?.[name];
  if (!Array.isArray(values) || values.length !== 1) {
    fail(`invocation input ${name} must contain exactly one artifact`);
  }
  return values[0];
}

function samePointer(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function inputPointers(invocation) {
  const expected = new Map();
  for (const role of [
    "project-architecture-state",
    "requirements-baseline",
    "project-overview-baseline",
    "project-context",
    "repository-snapshot",
    "current-architecture-snapshot",
    "architecture-baseline",
  ]) {
    if (invocation.inputs?.[role]) {
      expected.set(role, oneInput(invocation, role));
    }
  }
  return expected;
}

function assertBaseInputs(label, baseInputs, expected) {
  if (baseInputs.length !== expected.size) {
    fail(`${label} base inputs do not match the invocation`);
  }
  const seen = new Set();
  for (const { role, artifact } of baseInputs) {
    if (seen.has(role)) {
      fail(`${label} repeats base input ${role}`);
    }
    seen.add(role);
    if (!expected.has(role) || !samePointer(artifact, expected.get(role))) {
      fail(`${label} base input ${role} does not match the invocation`);
    }
  }
}

function assertAnswer(question, answer) {
  switch (question.responseType) {
    case "free-text":
      if (typeof answer !== "string" || answer.length === 0) {
        fail(`question ${question.id} requires a non-empty text answer`);
      }
      return;
    case "boolean":
      if (typeof answer !== "boolean") {
        fail(`question ${question.id} requires a boolean answer`);
      }
      return;
    case "single-choice":
      if (
        typeof answer !== "string" ||
        !question.options.includes(answer)
      ) {
        fail(`question ${question.id} requires one declared option`);
      }
      return;
    case "multiple-choice":
      if (
        !Array.isArray(answer) ||
        answer.length === 0 ||
        answer.some((value) => !question.options.includes(value))
      ) {
        fail(`question ${question.id} requires declared option values`);
      }
      return;
    default:
      fail(`question ${question.id} has an unsupported response type`);
  }
}

function assertIssuanceLineage({
  invocation,
  clarificationRequestRef,
  clarificationRequest,
  continuationRef,
  continuation,
}) {
  if (clarificationRequest.requestSetId !== clarificationRequestRef.artifactId) {
    fail("loaded clarification request does not match its output ref");
  }
  if (continuation.continuationId !== continuationRef.artifactId) {
    fail("loaded continuation does not match its output ref");
  }
  if (
    clarificationRequest.operation !== invocation.module.operation ||
    continuation.operation !== clarificationRequest.operation
  ) {
    fail("clarification issuance disagrees with the invocation operation");
  }
  if (continuation.activeStage !== clarificationRequest.activeStage) {
    fail("clarification issuance disagrees on active stage");
  }

  const expectedInputs = inputPointers(invocation);
  assertBaseInputs(
    "clarification request",
    clarificationRequest.baseInputs,
    expectedInputs,
  );
  assertBaseInputs(
    "continuation",
    continuation.baseInputs,
    expectedInputs,
  );
  const stateRef = expectedInputs.get("project-architecture-state");
  if (
    !samePointer(clarificationRequest.projectArchitectureState, stateRef) ||
    !samePointer(continuation.projectArchitectureState, stateRef)
  ) {
    fail("clarification issuance does not bind the exact project state");
  }

  const questions = new Set(
    clarificationRequest.questions.map(({ id }) => id),
  );
  const unresolved = new Set(continuation.unresolvedQuestionIds);
  if (
    unresolved.size !== questions.size ||
    [...questions].some((questionId) => !unresolved.has(questionId))
  ) {
    fail("continuation question IDs do not match the emitted request");
  }
}

export function validateArchitectureClarificationIssuance({
  invocation,
  clarificationRequestRef,
  clarificationRequest,
  continuationRef,
  continuation,
}) {
  try {
    validateArchitectureArtifact(clarificationRequest);
    validateArchitectureArtifact(continuation);
  } catch (error) {
    fail(error.message);
  }
  assertIssuanceLineage({
    invocation,
    clarificationRequestRef,
    clarificationRequest,
    continuationRef,
    continuation,
  });
  return {
    clarificationRequest,
    continuation,
  };
}

export function validateArchitectureClarificationHandoff({
  invocation,
  clarificationRequest,
  clarificationResponse,
  continuation,
}) {
  try {
    validateArchitectureArtifact(clarificationRequest);
    validateArchitectureArtifact(clarificationResponse);
    validateArchitectureArtifact(continuation);
  } catch (error) {
    fail(error.message);
  }

  const requestRef = oneInput(invocation, "clarification-request");
  const responseRef = oneInput(invocation, "clarification-responses");
  const continuationRef = oneInput(invocation, "continuation");
  if (clarificationRequest.requestSetId !== requestRef.artifactId) {
    fail("loaded clarification request does not match its invocation ref");
  }
  if (clarificationResponse.responseSetId !== responseRef.artifactId) {
    fail("loaded clarification response does not match its invocation ref");
  }
  if (continuation.continuationId !== continuationRef.artifactId) {
    fail("loaded continuation does not match its invocation ref");
  }
  if (!samePointer(clarificationResponse.request, requestRef)) {
    fail("response does not bind the exact clarification request");
  }

  for (const artifact of [clarificationResponse, continuation]) {
    if (artifact.operation !== clarificationRequest.operation) {
      fail("clarification artifacts disagree on operation");
    }
    if (artifact.activeStage !== clarificationRequest.activeStage) {
      fail("clarification artifacts disagree on active stage");
    }
  }

  const expectedInputs = inputPointers(invocation);
  assertBaseInputs(
    "clarification request",
    clarificationRequest.baseInputs,
    expectedInputs,
  );
  assertBaseInputs(
    "continuation",
    continuation.baseInputs,
    expectedInputs,
  );

  const stateRef = expectedInputs.get("project-architecture-state");
  if (
    !samePointer(clarificationRequest.projectArchitectureState, stateRef) ||
    !samePointer(continuation.projectArchitectureState, stateRef)
  ) {
    fail("clarification checkpoint does not bind the exact project state");
  }

  const questions = new Map(
    clarificationRequest.questions.map((question) => [
      question.id,
      question,
    ]),
  );
  const unresolved = new Set(continuation.unresolvedQuestionIds);
  if (
    unresolved.size !== questions.size ||
    [...questions.keys()].some((questionId) => !unresolved.has(questionId))
  ) {
    fail("continuation question IDs do not match the request");
  }

  const answered = new Set();
  for (const { questionId, answer } of clarificationResponse.responses) {
    const question = questions.get(questionId);
    if (!question) {
      fail(`response references unknown question ${questionId}`);
    }
    if (answered.has(questionId)) {
      fail(`response repeats question ${questionId}`);
    }
    assertAnswer(question, answer);
    answered.add(questionId);
  }

  for (const question of questions.values()) {
    if (question.blocking && !answered.has(question.id)) {
      fail(`blocking question ${question.id} is unanswered`);
    }
  }

  return {
    clarificationRequest,
    clarificationResponse,
    continuation,
  };
}

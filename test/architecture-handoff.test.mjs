import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArchitectureHandoffValidationError,
  validateArchitectureClarificationHandoff,
} from "../src/architecture-handoff-validator.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [clarificationRequest, clarificationResponse, continuation] =
  await Promise.all([
    readJson(
      "examples/artifacts/architecture-clarification-request-001.json",
    ),
    readJson(
      "examples/artifacts/architecture-clarification-response-001.json",
    ),
    readJson("examples/artifacts/architecture-continuation-001.json"),
  ]);

const pointer = (
  artifactId,
  schema,
  mediaType,
  digestCharacter,
) => ({
  artifactId,
  schema,
  mediaType,
  digest: `sha256:${digestCharacter.repeat(64)}`,
  uri: `file:///workspace/.devrelay/artifacts/${artifactId}.json`,
});

const invocation = {
  inputs: {
    ...Object.fromEntries(
      clarificationRequest.baseInputs.map(({ role, artifact }) => [
        role,
        [structuredClone(artifact)],
      ]),
    ),
    "clarification-request": [
      structuredClone(clarificationResponse.request),
    ],
    "clarification-responses": [
      pointer(
        "architecture-clarification-response-001",
        "https://devrelay.dev/artifacts/architecture-clarification-response-set/v1",
        "application/vnd.devrelay.architecture-clarification-response-set+json",
        "5",
      ),
    ],
    continuation: [
      pointer(
        "architecture-continuation-001",
        "https://devrelay.dev/artifacts/architecture-design-continuation/v1",
        "application/vnd.devrelay.architecture-design-continuation+json",
        "6",
      ),
    ],
  },
};

function validate(overrides = {}) {
  return validateArchitectureClarificationHandoff({
    invocation,
    clarificationRequest,
    clarificationResponse,
    continuation,
    ...overrides,
  });
}

function expectHandoffError(overrides) {
  assert.throws(
    () => validate(overrides),
    ArchitectureHandoffValidationError,
  );
}

test("clarification request, response, and continuation form one exact handoff", () => {
  assert.equal(validate().continuation, continuation);
});

test("loaded checkpoint artifacts must match invocation references", () => {
  const swappedRequest = structuredClone(clarificationRequest);
  swappedRequest.requestSetId = "architecture-clarification-request-other";
  expectHandoffError({ clarificationRequest: swappedRequest });

  const swappedResponse = structuredClone(clarificationResponse);
  swappedResponse.responseSetId =
    "architecture-clarification-response-other";
  expectHandoffError({ clarificationResponse: swappedResponse });

  const swappedContinuation = structuredClone(continuation);
  swappedContinuation.continuationId = "architecture-continuation-other";
  expectHandoffError({ continuation: swappedContinuation });
});

test("checkpoint artifacts bind exact base inputs and project state", () => {
  const staleRequest = structuredClone(clarificationRequest);
  staleRequest.baseInputs[0].artifact.digest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  expectHandoffError({ clarificationRequest: staleRequest });

  const staleContinuation = structuredClone(continuation);
  staleContinuation.projectArchitectureState.digest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  expectHandoffError({ continuation: staleContinuation });
});

test("response binds the exact clarification request", () => {
  const wrongDigest = structuredClone(clarificationResponse);
  wrongDigest.request.digest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  expectHandoffError({ clarificationResponse: wrongDigest });

  const wrongUri = structuredClone(clarificationResponse);
  wrongUri.request.uri =
    "file:///workspace/.devrelay/artifacts/a-different-request.json";
  assert.equal(
    validate({ clarificationResponse: wrongUri }).clarificationResponse,
    wrongUri,
    "storage location is not content identity",
  );
});

test("operation and active stage remain stable across the checkpoint", () => {
  const wrongOperation = structuredClone(clarificationResponse);
  wrongOperation.operation = "design-change";
  expectHandoffError({ clarificationResponse: wrongOperation });

  const wrongStage = structuredClone(continuation);
  wrongStage.activeStage = "modeler";
  wrongStage.completedStages = [
    {
      step: "designer",
      plugin: {
        id: "spec-kit-plan",
        version: "0.1.0",
      },
      outputs: {
        "architecture-designer-working": [
          pointer(
            "architecture-designer-working-001",
            "https://devrelay.dev/artifacts/architecture-designer-working/v1",
            "application/vnd.devrelay.architecture-designer-working+json",
            "f",
          ),
        ],
      },
    },
  ];
  expectHandoffError({ continuation: wrongStage });
});

test("continuation question IDs exactly match the request", () => {
  const mismatched = structuredClone(continuation);
  mismatched.unresolvedQuestionIds = ["Q-OTHER"];
  expectHandoffError({ continuation: mismatched });
});

test("responses reject unknown questions and invalid answer shapes", () => {
  const unknownQuestion = structuredClone(clarificationResponse);
  unknownQuestion.responses[0].questionId = "Q-OTHER";
  expectHandoffError({ clarificationResponse: unknownQuestion });

  const invalidOption = structuredClone(clarificationResponse);
  invalidOption.responses[0].answer = "Undeclared owner";
  expectHandoffError({ clarificationResponse: invalidOption });
});

test("every blocking question must be answered", () => {
  const noAnswers = structuredClone(clarificationResponse);
  noAnswers.responses = [
    {
      questionId: "Q-OPTIONAL",
      answer: "Optional note",
    },
  ];
  const requestWithOptional = structuredClone(clarificationRequest);
  requestWithOptional.questions.push({
    id: "Q-OPTIONAL",
    prompt: "Provide an optional note.",
    rationale: "The note may refine but does not block the design.",
    blocking: false,
    responseType: "free-text",
    options: [],
  });
  const continuationWithOptional = structuredClone(continuation);
  continuationWithOptional.unresolvedQuestionIds.push("Q-OPTIONAL");

  expectHandoffError({
    clarificationRequest: requestWithOptional,
    clarificationResponse: noAnswers,
    continuation: continuationWithOptional,
  });
});

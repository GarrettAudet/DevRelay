import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

const requirementsArtifactValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL(
        "../contracts/requirements-gathering-artifacts.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  [
    JSON.parse(
      readFileSync(
        new URL("../contracts/shared-artifacts.schema.json", import.meta.url),
        "utf8",
      ),
    ),
  ],
);

export class ArtifactValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactValidationError";
    this.code = "DR1800";
  }
}

function identityFailure(message) {
  throw new ArtifactValidationError(
    `requirements artifact is invalid: ${message}`,
  );
}

function uniqueIds(values, idOf, label) {
  const seen = new Set();
  for (const value of values) {
    const id = idOf(value);
    if (seen.has(id)) {
      identityFailure(`${label} contains duplicate stable ID ${id}`);
    }
    seen.add(id);
  }
  return seen;
}

function uniqueValues(values, valueOf, label) {
  const seen = new Set();
  for (const value of values) {
    const normalized = valueOf(value);
    if (seen.has(normalized)) {
      identityFailure(`${label} contains duplicate value ${normalized}`);
    }
    seen.add(normalized);
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalStrings(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (compareText(values[index - 1], values[index]) >= 0) {
      identityFailure(
        `${label} must be strictly lexically sorted with no duplicates`,
      );
    }
  }
}

function sourceRefKey(sourceRef) {
  return [
    sourceRef.role,
    sourceRef.artifact.artifactId,
    sourceRef.artifact.digest,
    sourceRef.location ?? "",
  ].join("\u0000");
}

function assertCanonicalSourceRefs(sourceRefs, label) {
  const keys = sourceRefs.map(sourceRefKey);
  assertCanonicalStrings(keys, label);
}

function assertCanonicalRecords(values, label) {
  assertCanonicalStrings(
    values.map(({ id }) => id),
    label,
  );
}

const REQUIREMENTS_RECORD_COLLECTIONS = Object.freeze([
  "businessObjectives",
  "successMetrics",
  "stakeholders",
  "users",
  "capabilities",
  "userJourneys",
  "userStories",
  "acceptanceCriteria",
  "nonFunctionalRequirements",
  "constraints",
  "scope",
  "nonGoals",
  "terminology",
  "assumptions",
]);

const REQUIREMENTS_STRING_SETS = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "dependencies",
  "deliverables",
  "interests",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

function assertCanonicalNestedCollections(value, label, field) {
  if (Array.isArray(value)) {
    if (field === "sourceRefs") {
      assertCanonicalSourceRefs(value, label);
    } else if (REQUIREMENTS_STRING_SETS.has(field)) {
      assertCanonicalStrings(value, label);
    } else if (field === "steps") {
      for (let index = 0; index < value.length; index += 1) {
        if (value[index].sequence !== index + 1) {
          identityFailure(`${label} must be ordered by contiguous sequence`);
        }
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      assertCanonicalNestedCollections(
        value[index],
        `${label}[${index}]`,
        undefined,
      );
    }
    return;
  }
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) {
      identityFailure(`${label} must use Unicode NFC normalization`);
    }
    if (value.includes("\r")) {
      identityFailure(`${label} must use LF-only line endings`);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertCanonicalNestedCollections(child, `${label}.${key}`, key);
  }
}

function assertCanonicalRequirementsBody(body, label) {
  for (const field of REQUIREMENTS_RECORD_COLLECTIONS) {
    assertCanonicalRecords(body[field], `${label} ${field}`);
  }
  assertCanonicalNestedCollections(body, label, undefined);
}

function assertClosedReferences(values, allowed, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      identityFailure(`${label} contains duplicate reference ${value}`);
    }
    seen.add(value);
    if (!allowed.has(value)) {
      identityFailure(`${label} references unknown stable ID ${value}`);
    }
  }
}

function indexById(values, label) {
  uniqueIds(values, ({ id }) => id, label);
  return new Map(values.map((value) => [value.id, value]));
}

export function normativeRequirementIds(body) {
  return Object.freeze([
    ...body.userStories.map(({ id }) => id),
    ...body.nonFunctionalRequirements.map(({ id }) => id),
    ...body.constraints.map(({ id }) => id),
  ]);
}

function validateRequirementsBody(body, label, { enforceCoverage = true } = {}) {
  assertCanonicalRequirementsBody(body, label);
  const objectives = indexById(
    body.businessObjectives,
    `${label} business objectives`,
  );
  const metrics = indexById(body.successMetrics, `${label} success metrics`);
  const stakeholders = indexById(body.stakeholders, `${label} stakeholders`);
  const users = indexById(body.users, `${label} users`);
  const capabilities = indexById(body.capabilities, `${label} capabilities`);
  const journeys = indexById(body.userJourneys, `${label} user journeys`);
  const stories = indexById(body.userStories, `${label} user stories`);
  const criteria = indexById(
    body.acceptanceCriteria,
    `${label} acceptance criteria`,
  );
  const nfrs = indexById(
    body.nonFunctionalRequirements,
    `${label} non-functional requirements`,
  );
  const constraints = indexById(body.constraints, `${label} constraints`);
  indexById(body.scope, `${label} scope items`);
  indexById(body.nonGoals, `${label} non-goals`);
  indexById(body.terminology, `${label} terminology`);
  uniqueIds(body.assumptions, ({ id }) => id, `${label} assumptions`);
  uniqueValues(
    body.terminology,
    ({ term }) => term.normalize("NFC").toLocaleLowerCase("en-US"),
    `${label} terminology`,
  );

  for (const objective of objectives.values()) {
    assertClosedReferences(
      objective.stakeholderIds,
      stakeholders,
      `${label} business objective ${objective.id} stakeholders`,
    );
  }
  for (const metric of metrics.values()) {
    assertClosedReferences(
      metric.businessObjectiveIds,
      objectives,
      `${label} success metric ${metric.id} business objectives`,
    );
  }
  for (const user of users.values()) {
    assertClosedReferences(
      user.stakeholderIds,
      stakeholders,
      `${label} user ${user.id} stakeholders`,
    );
  }
  for (const capability of capabilities.values()) {
    assertClosedReferences(
      capability.businessObjectiveIds,
      objectives,
      `${label} capability ${capability.id} business objectives`,
    );
    assertClosedReferences(
      capability.userIds,
      users,
      `${label} capability ${capability.id} users`,
    );
  }
  for (const journey of journeys.values()) {
    assertClosedReferences(
      [journey.userId],
      users,
      `${label} user journey ${journey.id} user`,
    );
    assertClosedReferences(
      journey.capabilityIds,
      capabilities,
      `${label} user journey ${journey.id} capabilities`,
    );
    for (const capabilityId of journey.capabilityIds) {
      if (!capabilities.get(capabilityId).userIds.includes(journey.userId)) {
        identityFailure(
          `${label} user journey ${journey.id} user is not an audience member of capability ${capabilityId}`,
        );
      }
    }
    const sequences = uniqueIds(
      journey.steps,
      ({ sequence }) => sequence,
      `${label} user journey ${journey.id} steps`,
    );
    for (let sequence = 1; sequence <= sequences.size; sequence += 1) {
      if (!sequences.has(sequence)) {
        identityFailure(
          `${label} user journey ${journey.id} steps are not contiguous from 1`,
        );
      }
    }
  }

  const usedCriteria = new Set();
  const referencedJourneys = new Set();
  for (const story of stories.values()) {
    assertClosedReferences(
      [story.userId],
      users,
      `${label} user story ${story.id} user`,
    );
    assertClosedReferences(
      [story.capabilityId],
      capabilities,
      `${label} user story ${story.id} capability`,
    );
    if (!capabilities.get(story.capabilityId).userIds.includes(story.userId)) {
      identityFailure(
        `${label} user story ${story.id} user is not an audience member of capability ${story.capabilityId}`,
      );
    }
    assertClosedReferences(
      story.userJourneyIds,
      journeys,
      `${label} user story ${story.id} journeys`,
    );
    assertClosedReferences(
      story.acceptanceCriterionIds,
      criteria,
      `${label} user story ${story.id} acceptance criteria`,
    );
    for (const journeyId of story.userJourneyIds) {
      const journey = journeys.get(journeyId);
      if (
        journey.userId !== story.userId ||
        !journey.capabilityIds.includes(story.capabilityId)
      ) {
        identityFailure(
          `${label} user story ${story.id} is incompatible with journey ${journeyId}`,
        );
      }
      referencedJourneys.add(journeyId);
    }
    for (const criterionId of story.acceptanceCriterionIds) {
      usedCriteria.add(criterionId);
    }
  }

  const applicabilityReferences = (requirement, owner) => {
    if (requirement.applicability.level === "capabilities") {
      assertClosedReferences(
        requirement.applicability.capabilityIds,
        capabilities,
        `${label} ${owner} ${requirement.id} applicability`,
      );
    }
    assertClosedReferences(
      requirement.acceptanceCriterionIds,
      criteria,
      `${label} ${owner} ${requirement.id} acceptance criteria`,
    );
    for (const criterionId of requirement.acceptanceCriterionIds) {
      usedCriteria.add(criterionId);
    }
  };
  for (const nfr of nfrs.values()) {
    applicabilityReferences(nfr, "non-functional requirement");
  }
  for (const constraint of constraints.values()) {
    applicabilityReferences(constraint, "constraint");
  }

  uniqueIds(
    normativeRequirementIds(body).map((id) => ({ id })),
    ({ id }) => id,
    `${label} normative requirements`,
  );

  if (!enforceCoverage) {
    return;
  }

  if (!body.capabilities.some(({ key }) => key)) {
    identityFailure(`${label} does not identify a key capability`);
  }
  if (body.nonGoals.length === 0) {
    identityFailure(`${label} does not define a non-goal`);
  }
  for (const stakeholderId of stakeholders.keys()) {
    const objectiveCovered = body.businessObjectives.some(({ stakeholderIds }) =>
      stakeholderIds.includes(stakeholderId),
    );
    const userCovered = body.users.some(({ stakeholderIds }) =>
      stakeholderIds.includes(stakeholderId),
    );
    if (!objectiveCovered && !userCovered) {
      identityFailure(`${label} stakeholder ${stakeholderId} is orphaned`);
    }
  }
  for (const userId of users.keys()) {
    const capabilityCovered = body.capabilities.some(({ userIds }) =>
      userIds.includes(userId),
    );
    const journeyCovered = body.userJourneys.some(
      ({ userId: journeyUserId }) => journeyUserId === userId,
    );
    const storyCovered = body.userStories.some(
      ({ userId: storyUserId }) => storyUserId === userId,
    );
    if (!capabilityCovered && !journeyCovered && !storyCovered) {
      identityFailure(`${label} user ${userId} is orphaned`);
    }
  }
  for (const objectiveId of objectives.keys()) {
    if (
      !body.successMetrics.some(({ businessObjectiveIds }) =>
        businessObjectiveIds.includes(objectiveId),
      )
    ) {
      identityFailure(`${label} objective ${objectiveId} has no success metric`);
    }
    if (
      !body.capabilities.some(({ businessObjectiveIds }) =>
        businessObjectiveIds.includes(objectiveId),
      )
    ) {
      identityFailure(`${label} objective ${objectiveId} has no capability`);
    }
  }
  for (const capability of capabilities.values()) {
    const journeyCovered = body.userJourneys.some(({ capabilityIds }) =>
      capabilityIds.includes(capability.id),
    );
    const storyCovered = body.userStories.some(
      ({ capabilityId }) => capabilityId === capability.id,
    );
    if (capability.audience === "user-facing" && (!journeyCovered || !storyCovered)) {
      identityFailure(
        `${label} user-facing capability ${capability.id} lacks journey or story coverage`,
      );
    }
    if (capability.audience === "internal") {
      const qualityCovered = [
        ...body.nonFunctionalRequirements,
        ...body.constraints,
      ].some(
        ({ applicability }) =>
          applicability.level === "project" ||
          applicability.capabilityIds.includes(capability.id),
      );
      if (!storyCovered && !qualityCovered) {
        identityFailure(
          `${label} internal capability ${capability.id} lacks normative coverage`,
        );
      }
    }
  }
  for (const journeyId of journeys.keys()) {
    if (!referencedJourneys.has(journeyId)) {
      identityFailure(`${label} user journey ${journeyId} has no user story`);
    }
  }
  for (const criterionId of criteria.keys()) {
    if (!usedCriteria.has(criterionId)) {
      identityFailure(`${label} acceptance criterion ${criterionId} is orphaned`);
    }
  }
}

function validateArtifactIdentities(artifact) {
  switch (artifact.kind) {
    case "RequirementsDraft":
      validateRequirementsBody(artifact.requirements, "requirements draft");
      break;
    case "RequirementsBaseline":
      validateRequirementsBody(artifact.requirements, "requirements baseline");
      break;
    case "RequirementsChangeSet": {
      validateRequirementsBody(
        artifact.replacement,
        "requirements change-set replacement",
      );
      const sorted = [...artifact.changedSections].sort();
      if (
        sorted.some(
          (section, index) => section !== artifact.changedSections[index],
        )
      ) {
        identityFailure(
          "requirements change-set changedSections must be lexically sorted",
        );
      }
      break;
    }
    case "RequirementsGatheringContinuation":
      validateRequirementsBody(
        artifact.workingRequirements,
        "requirements continuation working state",
        { enforceCoverage: false },
      );
      break;
    case "ClarificationRequestSet":
      uniqueIds(
        artifact.questions,
        ({ id }) => id,
        "clarification request questions",
      );
      break;
    case "ClarificationResponseSet":
      uniqueIds(
        artifact.responses,
        ({ questionId }) => questionId,
        "clarification responses",
      );
      break;
    default:
      break;
  }
}

function samePointer(left, right) {
  return left?.artifactId === right?.artifactId && left?.digest === right?.digest;
}

function compareSemanticVersions(left, right) {
  const leftParts = left.split(".").map((part) => BigInt(part));
  const rightParts = right.split(".").map((part) => BigInt(part));
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

function exactChangedSections(current, replacement) {
  return Object.keys(replacement)
    .filter(
      (section) =>
        canonicalJsonDigest(current[section]) !==
        canonicalJsonDigest(replacement[section]),
    )
    .sort();
}

function assertExactSectionList(actual, expected) {
  if (
    actual.length !== expected.length ||
    actual.some((section, index) => section !== expected[index])
  ) {
    identityFailure(
      "requirements change-set changedSections do not exactly describe the approved replacement",
    );
  }
}

export function validateRequirementsBaselinePromotion({
  candidate,
  candidateRef,
  baseline,
  previousBaseline,
  previousBaselineRef,
}) {
  validateRequirementsArtifact(candidate);
  validateRequirementsArtifact(baseline);

  if (!samePointer(baseline.approvedCandidate, candidateRef)) {
    identityFailure(
      "requirements baseline approvedCandidate does not match the exact approved candidate",
    );
  }

  const expectedBody =
    candidate.kind === "RequirementsDraft"
      ? candidate.requirements
      : candidate.kind === "RequirementsChangeSet"
        ? candidate.replacement
        : undefined;
  if (expectedBody === undefined) {
    identityFailure(
      "requirements baseline can be promoted only from RequirementsDraft or RequirementsChangeSet",
    );
  }
  const blockingAssumption = expectedBody.assumptions.find(
    ({ status, blocking }) => status === "unconfirmed" && blocking,
  );
  if (blockingAssumption) {
    identityFailure(
      "requirements baseline cannot promote unconfirmed blocking assumption " +
        blockingAssumption.id,
    );
  }
  if (
    canonicalJsonDigest(baseline.requirements) !==
    canonicalJsonDigest(expectedBody)
  ) {
    identityFailure(
      "requirements baseline body is not the exact approved candidate body",
    );
  }

  if (candidate.kind === "RequirementsDraft") {
    if (
      previousBaseline !== undefined ||
      previousBaselineRef !== undefined ||
      baseline.supersedes !== undefined
    ) {
      identityFailure(
        "initial requirements baseline promotion must not supersede a baseline",
      );
    }
    return baseline;
  }

  if (previousBaseline === undefined || previousBaselineRef === undefined) {
    identityFailure(
      "requirements change promotion requires the exact previous baseline",
    );
  }
  validateRequirementsArtifact(previousBaseline);
  if (!samePointer(candidate.baseline, previousBaselineRef)) {
    identityFailure(
      "requirements change-set does not target the exact previous baseline",
    );
  }
  if (!samePointer(baseline.supersedes, previousBaselineRef)) {
    identityFailure(
      "requirements baseline supersedes does not match the exact previous baseline",
    );
  }
  if (baseline.baselineId === previousBaseline.baselineId) {
    identityFailure("requirements change promotion must create a new baseline ID");
  }
  if (compareSemanticVersions(baseline.version, previousBaseline.version) <= 0) {
    identityFailure(
      "requirements change promotion new baseline version must be strictly greater",
    );
  }

  const previousDigest = canonicalJsonDigest(previousBaseline.requirements);
  if (candidate.expectedRequirementsDigest !== previousDigest) {
    identityFailure(
      "requirements change-set expected requirements digest is stale",
    );
  }
  if (canonicalJsonDigest(candidate.replacement) === previousDigest) {
    identityFailure("requirements change-set replacement is an exact no-op");
  }
  assertExactSectionList(
    candidate.changedSections,
    exactChangedSections(previousBaseline.requirements, candidate.replacement),
  );
  return baseline;
}

export function validateRequirementsArtifact(artifact) {
  if (!requirementsArtifactValidator(artifact)) {
    throw new ArtifactValidationError(
      `requirements artifact is invalid: ${validationDetail(
        requirementsArtifactValidator,
      )}`,
    );
  }

  validateArtifactIdentities(artifact);
  return artifact;
}

import {
  buildWorkingRequirements as buildUnsortedRequirements,
  goal,
  projectContext,
  questions,
} from "./work-dependency-clarification-data.raw.mjs";

export { goal, projectContext, questions };

const sortedCollectionKeys = new Set([
  "acceptanceCriteria",
  "assumptions",
  "businessObjectives",
  "capabilities",
  "constraints",
  "nonFunctionalRequirements",
  "nonGoals",
  "scope",
  "stakeholders",
  "successMetrics",
  "terminology",
  "userJourneys",
  "userStories",
  "users",
]);

const sortedStringArrayKeys = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "deliverables",
  "dependencies",
  "interests",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

function compareText(left, right) {
  return left.localeCompare(right, "en", { sensitivity: "variant" });
}

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (sortedCollectionKeys.has(key)) {
      return entries.sort((left, right) => compareText(left.id, right.id));
    }
    if (
      sortedStringArrayKeys.has(key) &&
      entries.every((entry) => typeof entry === "string")
    ) {
      return entries.sort(compareText);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      canonicalize(child, childKey),
    ]),
  );
}

export function buildWorkingRequirements(makeSourceRefs) {
  return canonicalize(buildUnsortedRequirements(makeSourceRefs));
}

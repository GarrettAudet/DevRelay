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

const mergeRecordKeys = [...sortedCollectionKeys];
const mergeStringKeys = [
  "deliverables",
  "dependencies",
  "requiredEvidence",
  "risks",
];

function compareText(left, right) {
  return left.localeCompare(right, "en", { sensitivity: "variant" });
}

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compareText(
          [
            left.role,
            left.artifact.artifactId,
            left.artifact.digest,
            left.location ?? "",
          ].join("\u0000"),
          [
            right.role,
            right.artifact.artifactId,
            right.artifact.digest,
            right.location ?? "",
          ].join("\u0000"),
        ),
      );
    }
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

function rebaseSourceRefs(value, sourceRefs) {
  if (Array.isArray(value)) {
    return value.map((entry) => rebaseSourceRefs(entry, sourceRefs));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "sourceRefs"
        ? structuredClone(sourceRefs)
        : rebaseSourceRefs(child, sourceRefs),
    ]),
  );
}

export function buildWorkingRequirements(makeSourceRefs) {
  return canonicalize(buildUnsortedRequirements(makeSourceRefs));
}

export function mergeProjectRequirements(
  projectBaseline,
  moduleChange,
  baselineSourceRefs,
) {
  projectBaseline = rebaseSourceRefs(projectBaseline, baselineSourceRefs);
  const merged = {
    ...projectBaseline,
    purpose: projectBaseline.purpose,
    currentStatus: moduleChange.currentStatus,
  };
  for (const key of mergeRecordKeys) {
    merged[key] = [...projectBaseline[key], ...moduleChange[key]];
  }
  for (const key of mergeStringKeys) {
    merged[key] = [...new Set([...projectBaseline[key], ...moduleChange[key]])];
  }
  const sourceRefs = new Map();
  for (const sourceRef of [
    ...projectBaseline.sourceRefs,
    ...moduleChange.sourceRefs,
  ]) {
    sourceRefs.set(
      [
        sourceRef.role,
        sourceRef.artifact.artifactId,
        sourceRef.artifact.digest,
        sourceRef.location ?? "",
      ].join("\u0000"),
      sourceRef,
    );
  }
  merged.sourceRefs = [...sourceRefs.values()];
  return canonicalize(merged);
}

import { canonicalJsonDigest } from "./content-digest.mjs";

export const PROJECT_OVERVIEW_SECTIONS = Object.freeze([
  "purpose",
  "businessObjectives",
  "users",
  "keyCapabilities",
  "successMetrics",
  "scope",
  "nonGoals",
  "constraints",
  "nonFunctionalRequirements",
  "terminology",
  "currentStatus",
]);

const PROJECTION_SPECIFICATION = Object.freeze({
  id: "devrelay.requirements-to-project-overview",
  version: "1.0.0",
  source: "RequirementsBody",
  sections: PROJECT_OVERVIEW_SECTIONS,
  rules: Object.freeze({
    purpose: "purpose",
    businessObjectives: "businessObjectives sorted by id",
    users: "users sorted by id",
    keyCapabilities: "capabilities where key=true, sorted by id",
    successMetrics: "successMetrics sorted by id",
    scope: "scope sorted by id",
    nonGoals: "nonGoals sorted by id",
    constraints: "constraints sorted by id",
    nonFunctionalRequirements: "nonFunctionalRequirements sorted by id",
    terminology: "terminology sorted by id",
    currentStatus: "currentStatus",
  }),
});

const RENDERER_SPECIFICATION = Object.freeze({
  id: "devrelay.project-overview.markdown",
  version: "1.0.0",
  path: "ProjectOverview.md",
  mediaType: "text/markdown; charset=utf-8",
  encoding: "UTF-8 without BOM",
  normalization: "NFC",
  lineEndings: "LF",
  terminalNewline: true,
  businessObjectiveDetails: Object.freeze([
    "priority",
    "stakeholderIds",
    "statement",
  ]),
  headings: Object.freeze([
    "Purpose",
    "Business Objectives",
    "Users",
    "Key Capabilities",
    "Success Metrics",
    "Scope",
    "Non-Goals",
    "Constraints",
    "Non-Functional Requirements",
    "Terminology",
    "Current Status",
  ]),
});

export const PROJECT_OVERVIEW_PROJECTION = Object.freeze({
  id: PROJECTION_SPECIFICATION.id,
  version: PROJECTION_SPECIFICATION.version,
  contractDigest: canonicalJsonDigest(PROJECTION_SPECIFICATION),
});

export const PROJECT_OVERVIEW_RENDERER = Object.freeze({
  id: RENDERER_SPECIFICATION.id,
  version: RENDERER_SPECIFICATION.version,
  contractDigest: canonicalJsonDigest(RENDERER_SPECIFICATION),
});

export const PROJECT_OVERVIEW_DOCUMENT = Object.freeze({
  path: RENDERER_SPECIFICATION.path,
  mediaType: RENDERER_SPECIFICATION.mediaType,
  schema: "https://devrelay.dev/artifacts/project-overview-markdown/v1",
});

function fail(message) {
  throw new TypeError(`project overview projection failed: ${message}`);
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
  return value;
}

function normalizeString(value) {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

function normalizeJson(value) {
  if (typeof value === "string") {
    return normalizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeJson(child)]),
    );
  }
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedStrings(values) {
  return [...values].map(normalizeString).sort(compareText);
}

function sourceRefKey(sourceRef) {
  const artifact = sourceRef.artifact ?? {};
  return [
    sourceRef.role ?? "",
    artifact.artifactId ?? "",
    artifact.digest ?? "",
    sourceRef.location ?? "",
  ].join("\u0000");
}

function normalizeSourceRefs(sourceRefs) {
  return requireArray(sourceRefs, "sourceRefs")
    .map(normalizeJson)
    .sort((left, right) => compareText(sourceRefKey(left), sourceRefKey(right)));
}

function normalizeRecord(record) {
  const normalized = normalizeJson(requireRecord(record, "record"));
  if (Array.isArray(normalized.sourceRefs)) {
    normalized.sourceRefs = normalizeSourceRefs(normalized.sourceRefs);
  }
  for (const field of [
    "acceptanceCriterionIds",
    "aliases",
    "businessObjectiveIds",
    "capabilityIds",
    "needs",
    "stakeholderIds",
    "userIds",
  ]) {
    if (Array.isArray(normalized[field])) {
      normalized[field] = sortedStrings(normalized[field]);
    }
  }
  if (
    normalized.applicability?.level === "capabilities" &&
    Array.isArray(normalized.applicability.capabilityIds)
  ) {
    normalized.applicability = {
      ...normalized.applicability,
      capabilityIds: sortedStrings(normalized.applicability.capabilityIds),
    };
  }
  return normalized;
}

function sortedRecords(records, label) {
  return requireArray(records, label)
    .map(normalizeRecord)
    .sort((left, right) => compareText(left.id, right.id));
}

export function canonicalizeProjectOverviewBody(overview) {
  requireRecord(overview, "overview");
  for (const section of PROJECT_OVERVIEW_SECTIONS) {
    if (!Object.hasOwn(overview, section)) {
      fail(`overview is missing ${section}`);
    }
  }
  return {
    purpose: normalizeRecord(overview.purpose),
    businessObjectives: sortedRecords(
      overview.businessObjectives,
      "businessObjectives",
    ),
    users: sortedRecords(overview.users, "users"),
    keyCapabilities: sortedRecords(
      overview.keyCapabilities,
      "keyCapabilities",
    ),
    successMetrics: sortedRecords(overview.successMetrics, "successMetrics"),
    scope: sortedRecords(overview.scope, "scope"),
    nonGoals: sortedRecords(overview.nonGoals, "nonGoals"),
    constraints: sortedRecords(overview.constraints, "constraints"),
    nonFunctionalRequirements: sortedRecords(
      overview.nonFunctionalRequirements,
      "nonFunctionalRequirements",
    ),
    terminology: sortedRecords(overview.terminology, "terminology"),
    currentStatus: normalizeRecord(overview.currentStatus),
  };
}

export function deriveProjectOverview(requirementsBody) {
  requireRecord(requirementsBody, "requirements body");
  for (const field of [
    "purpose",
    "businessObjectives",
    "users",
    "capabilities",
    "successMetrics",
    "scope",
    "nonGoals",
    "constraints",
    "nonFunctionalRequirements",
    "terminology",
    "currentStatus",
  ]) {
    if (!Object.hasOwn(requirementsBody, field)) {
      fail(`requirements body is missing ${field}`);
    }
  }
  return canonicalizeProjectOverviewBody({
    purpose: requirementsBody.purpose,
    businessObjectives: requirementsBody.businessObjectives,
    users: requirementsBody.users,
    keyCapabilities: requireArray(
      requirementsBody.capabilities,
      "capabilities",
    ).filter(({ key }) => key === true),
    successMetrics: requirementsBody.successMetrics,
    scope: requirementsBody.scope,
    nonGoals: requirementsBody.nonGoals,
    constraints: requirementsBody.constraints,
    nonFunctionalRequirements: requirementsBody.nonFunctionalRequirements,
    terminology: requirementsBody.terminology,
    currentStatus: requirementsBody.currentStatus,
  });
}

export function diffProjectOverviewSections(baseline, candidate) {
  const left = canonicalizeProjectOverviewBody(baseline);
  const right = canonicalizeProjectOverviewBody(candidate);
  return PROJECT_OVERVIEW_SECTIONS.filter(
    (section) =>
      canonicalJsonDigest(left[section]) !== canonicalJsonDigest(right[section]),
  );
}

function inline(value) {
  return normalizeString(String(value))
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[\\`*_[\]<>#]/gu, "\\$&");
}

function identifiers(values) {
  return values.length === 0
    ? "none"
    : values.map((value) => `\`${inline(value)}\``).join(", ");
}

function appendEmptyOrItems(lines, values, render) {
  if (values.length === 0) {
    lines.push("_None._");
    return;
  }
  for (const value of values) {
    render(value, lines);
  }
}

function appendDetail(lines, label, value) {
  lines.push(`  - ${label}: ${value}`);
}

function applicabilityText(applicability) {
  if (applicability.level === "project") {
    return "project";
  }
  return `capabilities ${identifiers(applicability.capabilityIds)}`;
}

function heading(lines, name) {
  lines.push(`## ${name}`, "");
}

export function renderProjectOverviewMarkdown(overview) {
  const value = canonicalizeProjectOverviewBody(overview);
  const lines = ["# Project Overview", ""];

  heading(lines, "Purpose");
  lines.push(inline(value.purpose.statement), "");

  heading(lines, "Business Objectives");
  appendEmptyOrItems(lines, value.businessObjectives, (entry, target) => {
    target.push(
      `- **\`${inline(entry.id)}\`** [${inline(entry.priority)}] ${inline(entry.statement)}`,
    );
    appendDetail(target, "Stakeholders", identifiers(entry.stakeholderIds));
  });
  lines.push("");

  heading(lines, "Users");
  appendEmptyOrItems(lines, value.users, (entry, target) => {
    target.push(
      `- **${inline(entry.name)}** (\`${inline(entry.id)}\`): ${inline(entry.description)}`,
    );
    appendDetail(target, "Needs", entry.needs.map(inline).join("; ") || "none");
    appendDetail(
      target,
      "Stakeholders",
      identifiers(entry.stakeholderIds),
    );
  });
  lines.push("");

  heading(lines, "Key Capabilities");
  appendEmptyOrItems(lines, value.keyCapabilities, (entry, target) => {
    target.push(
      `- **${inline(entry.name)}** (\`${inline(entry.id)}\`): ${inline(entry.description)}`,
    );
    appendDetail(target, "Priority", inline(entry.priority));
    appendDetail(target, "Audience", inline(entry.audience));
    appendDetail(
      target,
      "Business objectives",
      identifiers(entry.businessObjectiveIds),
    );
    appendDetail(target, "Users", identifiers(entry.userIds));
  });
  lines.push("");

  heading(lines, "Success Metrics");
  appendEmptyOrItems(lines, value.successMetrics, (entry, target) => {
    target.push(`- **${inline(entry.name)}** (\`${inline(entry.id)}\`)`);
    appendDetail(target, "Measure", inline(entry.measure));
    appendDetail(target, "Target", inline(entry.target));
    appendDetail(
      target,
      "Measurement method",
      inline(entry.measurementMethod),
    );
    if (entry.evaluationWindow !== undefined) {
      appendDetail(target, "Evaluation window", inline(entry.evaluationWindow));
    }
    appendDetail(
      target,
      "Business objectives",
      identifiers(entry.businessObjectiveIds),
    );
  });
  lines.push("");

  heading(lines, "Scope");
  appendEmptyOrItems(lines, value.scope, (entry, target) => {
    target.push(`- **\`${inline(entry.id)}\`** ${inline(entry.statement)}`);
  });
  lines.push("");

  heading(lines, "Non-Goals");
  appendEmptyOrItems(lines, value.nonGoals, (entry, target) => {
    target.push(`- **\`${inline(entry.id)}\`** ${inline(entry.statement)}`);
    if (entry.rationale !== undefined) {
      appendDetail(target, "Rationale", inline(entry.rationale));
    }
  });
  lines.push("");

  heading(lines, "Constraints");
  appendEmptyOrItems(lines, value.constraints, (entry, target) => {
    target.push(
      `- **\`${inline(entry.id)}\`** [${inline(entry.category)}; ${applicabilityText(entry.applicability)}] ${inline(entry.statement)}`,
    );
    if (entry.rationale !== undefined) {
      appendDetail(target, "Rationale", inline(entry.rationale));
    }
    appendDetail(
      target,
      "Acceptance criteria",
      identifiers(entry.acceptanceCriterionIds),
    );
  });
  lines.push("");

  heading(lines, "Non-Functional Requirements");
  appendEmptyOrItems(
    lines,
    value.nonFunctionalRequirements,
    (entry, target) => {
      target.push(
        `- **\`${inline(entry.id)}\`** [${inline(entry.category)}; ${inline(entry.priority)}; ${applicabilityText(entry.applicability)}] ${inline(entry.statement)}`,
      );
      appendDetail(target, "Measure", inline(entry.measure));
      appendDetail(target, "Target", inline(entry.target));
      appendDetail(
        target,
        "Acceptance criteria",
        identifiers(entry.acceptanceCriterionIds),
      );
    },
  );
  lines.push("");

  heading(lines, "Terminology");
  appendEmptyOrItems(lines, value.terminology, (entry, target) => {
    target.push(
      `- **${inline(entry.term)}** (\`${inline(entry.id)}\`): ${inline(entry.definition)}`,
    );
    if (entry.aliases.length > 0) {
      appendDetail(target, "Aliases", entry.aliases.map(inline).join(", "));
    }
  });
  lines.push("");

  heading(lines, "Current Status");
  lines.push(`- Lifecycle: ${inline(value.currentStatus.lifecycle)}`);
  lines.push(`- Phase: ${inline(value.currentStatus.phase)}`);
  lines.push(`- Summary: ${inline(value.currentStatus.summary)}`, "");

  return `${lines.join("\n").replace(/\n+$/u, "")}\n`.normalize("NFC");
}

export function renderProjectOverviewMarkdownBytes(overview) {
  return Buffer.from(renderProjectOverviewMarkdown(overview), "utf8");
}

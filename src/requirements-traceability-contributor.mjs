import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const REQUIREMENTS_MODULE = Object.freeze({
  id: "requirements-gathering",
  version: "0.1.0",
  operation: "gather",
});
const ARCHITECTURE_MODULE = Object.freeze({
  id: "architecture-design",
  version: "0.1.0",
});
const WORK_BREAKDOWN_MODULE = Object.freeze({
  id: "work-breakdown",
  version: "0.1.0",
});
const CANDIDATE_OUTCOMES = new Set(["drafted", "change_set_drafted"]);
const WORK_BREAKDOWN_OBSERVER_OUTCOMES = new Set(["decomposed"]);
const CONTROL_OUTCOMES = new Set([
  "needs_clarification",
  "unable_to_proceed",
]);
const REQUIREMENTS_NODE_KINDS = Object.freeze([
  "acceptance-criterion",
  "business-objective",
  "business-scope",
  "capability",
  "non-functional-requirement",
  "project",
  "requirement-constraint",
  "stakeholder",
  "success-metric",
  "user",
  "user-journey",
  "user-story",
]);
const REQUIREMENTS_EDGE_KINDS = Object.freeze([
  "accepted-by",
  "applies-to",
  "contains",
  "defines",
  "exercised-by",
  "measured-by",
  "owned-by",
  "performed-by",
  "projects",
  "realized-by",
  "represents",
  "serves",
  "specified-by",
]);
const EMPTY_OWNERSHIP_KINDS = Object.freeze([]);

function ownership(scope, authority, nodeKinds, edgeKinds) {
  return deepFreeze({ scope, authority, nodeKinds, edgeKinds });
}

function fail(message) {
  throw new TypeError(`requirements traceability contributor: ${message}`);
}

function deepFreeze(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

function isModule(context, expected) {
  const module = context?.invocation?.module;
  return (
    module?.id === expected.id &&
    module.version === expected.version &&
    (expected.operation === undefined || module.operation === expected.operation)
  );
}

function observesApprovedRequirements(context) {
  const module = context?.invocation?.module;
  return (
    isModule(context, ARCHITECTURE_MODULE) ||
    (isModule(context, WORK_BREAKDOWN_MODULE) &&
      new Set(["establish-breakdown", "decompose-change"]).has(
        module?.operation,
      ) &&
      hasOutcome(context, WORK_BREAKDOWN_OBSERVER_OUTCOMES))
  );
}

function hasOutcome(context, outcomes) {
  return (
    context?.moduleResult?.status === "completed" &&
    outcomes.has(context.moduleResult.outcome)
  );
}

function oneLoaded(context, group, port) {
  const entries = context?.[group]?.[port];
  if (!Array.isArray(entries) || entries.length !== 1) {
    fail(`${group}.${port} must contain exactly one loaded artifact`);
  }
  const loaded = entries[0];
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    loaded.ref === null ||
    typeof loaded.ref !== "object" ||
    loaded.value === null ||
    typeof loaded.value !== "object" ||
    typeof loaded.ref.artifactId !== "string" ||
    typeof loaded.ref.digest !== "string"
  ) {
    fail(`${group}.${port} does not contain a valid loaded artifact`);
  }
  return loaded;
}

function hasLoaded(context, group, port) {
  const entries = context?.[group]?.[port];
  return Array.isArray(entries) && entries.length === 1;
}

function artifactStableId(ref) {
  return canonicalJsonDigest({
    schema: ref.schema,
    artifactId: ref.artifactId,
    digest: ref.digest,
  });
}

function artifactEndpoint(ref) {
  return { kind: "artifact-reference", stableId: artifactStableId(ref) };
}

function semanticEndpoint(kind, stableId, authority, scope) {
  return Object.fromEntries(
    Object.entries({ kind, stableId, authority, scope }).filter(
      ([, value]) => value !== undefined,
    ),
  );
}

function sourceLocator(loaded, jsonPointer, entity) {
  return {
    artifact: {
      artifactId: loaded.ref.artifactId,
      digest: loaded.ref.digest,
    },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function pointerSegment(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointer(base, ...segments) {
  return `${base}${segments.map((value) => `/${pointerSegment(value)}`).join("")}`;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined),
  );
}

function artifactNode(loaded) {
  return {
    kind: "artifact-reference",
    stableId: artifactStableId(loaded.ref),
    label: loaded.ref.artifactId,
    attributes: { artifact: structuredClone(loaded.ref) },
    sourceLocators: [sourceLocator(loaded, "", loaded.value)],
  };
}

function semanticNode(
  kind,
  stableId,
  label,
  loaded,
  jsonPointer,
  entity,
  attributes = {},
) {
  if (typeof stableId !== "string" || stableId.length === 0) {
    fail(`${kind} node has no stable ID`);
  }
  if (typeof label !== "string" || label.length === 0) {
    fail(`${kind} ${stableId} has no label`);
  }
  return {
    kind,
    stableId,
    label,
    attributes: compact(attributes),
    sourceLocators: [sourceLocator(loaded, jsonPointer, entity)],
  };
}

function assertionKey(value) {
  return canonicalJson(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function edgeIdentity(edge) {
  return canonicalJson({
    kind: edge.kind,
    source: edge.source,
    target: edge.target,
    qualifier: edge.qualifier ?? "",
  });
}

function addEdge(edges, edge) {
  const key = edgeIdentity(edge);
  const existing = edges.get(key);
  if (!existing) {
    edges.set(key, edge);
    return;
  }
  if (existing.rationale !== edge.rationale) {
    fail(`duplicate edge ${key} has conflicting rationale`);
  }
  const locators = new Map(
    [...existing.sourceLocators, ...edge.sourceLocators].map((locator) => [
      assertionKey(locator),
      locator,
    ]),
  );
  existing.sourceLocators = [...locators.values()].sort((left, right) =>
    compareText(assertionKey(left), assertionKey(right)),
  );
}

function relate(
  edges,
  kind,
  source,
  target,
  rationale,
  loaded,
  jsonPointer,
  entity,
) {
  addEdge(edges, {
    kind,
    source,
    target,
    rationale,
    sourceLocators: [sourceLocator(loaded, jsonPointer, entity)],
  });
}

function selectCandidate(context) {
  if (context.moduleResult.outcome === "drafted") {
    const requirements = oneLoaded(context, "loadedOutputs", "requirements-draft");
    const overview = oneLoaded(
      context,
      "loadedOutputs",
      "project-overview-draft",
    );
    if (
      requirements.value.kind !== "RequirementsDraft" ||
      overview.value.kind !== "ProjectOverviewDraft"
    ) {
      fail("drafted outcome does not contain the published draft pair");
    }
    return {
      requirements,
      overview,
      body: requirements.value.requirements,
      bodyPointer: "/requirements",
      overviewRequirementField: "requirementsDraft",
    };
  }
  if (context.moduleResult.outcome === "change_set_drafted") {
    const requirements = oneLoaded(
      context,
      "loadedOutputs",
      "requirements-change-set",
    );
    const overview = oneLoaded(
      context,
      "loadedOutputs",
      "project-overview-change-set-draft",
    );
    if (
      requirements.value.kind !== "RequirementsChangeSet" ||
      overview.value.kind !== "ProjectOverviewChangeSetDraft"
    ) {
      fail("change outcome does not contain the published change pair");
    }
    return {
      requirements,
      overview,
      body: requirements.value.replacement,
      bodyPointer: "/replacement",
      overviewRequirementField: "requirementsChangeSet",
    };
  }
  fail(`outcome ${JSON.stringify(context.moduleResult.outcome)} is not projectable`);
}

function selectApprovedInputs(context) {
  const requirements = oneLoaded(
    context,
    "loadedInputs",
    "requirements-baseline",
  );
  const overview = oneLoaded(
    context,
    "loadedInputs",
    "project-overview-baseline",
  );
  if (
    requirements.value.kind !== "RequirementsBaseline" ||
    overview.value.kind !== "ProjectOverviewBaseline"
  ) {
    fail("module inputs do not contain the approved requirements baseline pair");
  }
  return {
    requirements,
    overview,
    body: requirements.value.requirements,
    bodyPointer: "/requirements",
    overviewRequirementField: "requirementsBaseline",
  };
}

function addContainedEntity(
  nodes,
  edges,
  requirements,
  jsonPointer,
  entity,
  kind,
  label,
  attributes,
) {
  nodes.push(
    semanticNode(
      kind,
      entity.id,
      label,
      requirements,
      jsonPointer,
      entity,
      attributes,
    ),
  );
  relate(
    edges,
    "contains",
    artifactEndpoint(requirements.ref),
    semanticEndpoint(kind, entity.id),
    "The requirements artifact contains this canonical typed entity.",
    requirements,
    jsonPointer,
    entity,
  );
}

async function projectSelected(context, selected, { includeBusinessScope = false } = {}) {
  if (typeof context.projectId !== "string" || context.projectId.length === 0) {
    fail("context.projectId must be a non-empty string");
  }
  const { requirements, overview, body, bodyPointer } = selected;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    fail("requirements artifact has no canonical requirements body");
  }
  const overviewBody = overview.value.overview;
  if (
    overviewBody === null ||
    typeof overviewBody !== "object" ||
    Array.isArray(overviewBody)
  ) {
    fail("ProjectOverview artifact has no overview body");
  }

  const nodes = [
    artifactNode(requirements),
    artifactNode(overview),
    semanticNode(
      "project",
      context.projectId,
      overviewBody.purpose?.statement ?? context.projectId,
      overview,
      "/overview",
      overviewBody,
      { projectId: context.projectId },
    ),
  ];
  const edges = new Map();

  relate(
    edges,
    "projects",
    artifactEndpoint(overview.ref),
    artifactEndpoint(requirements.ref),
    "ProjectOverview is the deterministic projection of this requirements artifact.",
    overview,
    pointer("", selected.overviewRequirementField),
    overview.value[selected.overviewRequirementField],
  );
  relate(
    edges,
    "contains",
    artifactEndpoint(overview.ref),
    semanticEndpoint("project", context.projectId),
    "The ProjectOverview artifact contains the compact project projection.",
    overview,
    "/overview",
    overviewBody,
  );

  const indexes = new Map();
  const collections = [
    ["businessObjectives", "business-objective", (item) => item.statement, (item) => ({ priority: item.priority })],
    ["successMetrics", "success-metric", (item) => item.name, (item) => compact({ measure: item.measure, target: item.target, measurementMethod: item.measurementMethod, evaluationWindow: item.evaluationWindow })],
    ["stakeholders", "stakeholder", (item) => item.name, (item) => ({ role: item.role, category: item.category })],
    ["users", "user", (item) => item.name, (item) => ({ description: item.description })],
    ["capabilities", "capability", (item) => item.name, (item) => ({ audience: item.audience, key: item.key, priority: item.priority })],
    ["userJourneys", "user-journey", (item) => item.name, (item) => ({ trigger: item.trigger, outcome: item.outcome })],
    ["userStories", "user-story", (item) => item.need, (item) => ({ benefit: item.benefit, priority: item.priority })],
    ["acceptanceCriteria", "acceptance-criterion", (item) => item.statement, (item) => ({ verification: item.verification })],
    ["nonFunctionalRequirements", "non-functional-requirement", (item) => item.statement, (item) => ({ category: item.category, measure: item.measure, target: item.target, priority: item.priority })],
    ["constraints", "requirement-constraint", (item) => item.statement, (item) => compact({ category: item.category, rationale: item.rationale })],
  ];

  for (const [field, kind, labelFor, attributesFor] of collections) {
    if (!Array.isArray(body[field])) fail(`${field} must be an array`);
    const index = new Map();
    for (const [position, entity] of body[field].entries()) {
      if (index.has(entity.id)) fail(`${field} repeats ${entity.id}`);
      const jsonPointer = pointer(bodyPointer, field, position);
      index.set(entity.id, { entity, jsonPointer });
      addContainedEntity(
        nodes,
        edges,
        requirements,
        jsonPointer,
        entity,
        kind,
        labelFor(entity),
        attributesFor(entity),
      );
    }
    indexes.set(field, index);
  }

  if (includeBusinessScope) {
    if (!Array.isArray(body.scope)) fail("scope must be an array");
    const seenIds = new Set();
    for (const [position, scope] of body.scope.entries()) {
      if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
        fail(`scope/${position} must be a typed scope record`);
      }
      if (typeof scope.id !== "string" || scope.id.length === 0) {
        fail(`scope/${position}.id must be a non-empty string`);
      }
      if (typeof scope.statement !== "string" || scope.statement.length === 0) {
        fail(`scope/${position}.statement must be a non-empty string`);
      }
      if (!Array.isArray(scope.sourceRefs)) {
        fail(`scope/${position}.sourceRefs must be an array`);
      }
      if (seenIds.has(scope.id)) fail(`scope repeats ${scope.id}`);
      seenIds.add(scope.id);
      const jsonPointer = pointer(bodyPointer, "scope", position);
      nodes.push(semanticNode(
        "business-scope",
        scope.id,
        scope.statement,
        requirements,
        jsonPointer,
        scope,
        { statement: scope.statement, sourceRefs: structuredClone(scope.sourceRefs) },
      ));
      relate(
        edges,
        "defines",
        semanticEndpoint("project", context.projectId),
        semanticEndpoint("business-scope", scope.id),
        "The approved project defines this exact in-scope business commitment.",
        requirements,
        jsonPointer,
        scope,
      );
    }
  }

  const known = (field, id) => {
    const found = indexes.get(field)?.get(id);
    if (!found) fail(`${field} does not contain referenced ID ${id}`);
    return found;
  };

  for (const { entity, jsonPointer } of indexes.get("businessObjectives").values()) {
    relate(edges, "defines", semanticEndpoint("project", context.projectId), semanticEndpoint("business-objective", entity.id), "The project defines this business objective.", requirements, jsonPointer, entity);
    for (const [position, stakeholderId] of entity.stakeholderIds.entries()) {
      known("stakeholders", stakeholderId);
      relate(edges, "owned-by", semanticEndpoint("business-objective", entity.id), semanticEndpoint("stakeholder", stakeholderId), "The objective is owned by this declared stakeholder.", requirements, pointer(jsonPointer, "stakeholderIds", position), stakeholderId);
    }
  }

  for (const { entity, jsonPointer } of indexes.get("successMetrics").values()) {
    for (const [position, objectiveId] of entity.businessObjectiveIds.entries()) {
      known("businessObjectives", objectiveId);
      relate(edges, "measured-by", semanticEndpoint("business-objective", objectiveId), semanticEndpoint("success-metric", entity.id), "The success metric measures this business objective.", requirements, pointer(jsonPointer, "businessObjectiveIds", position), objectiveId);
    }
  }

  for (const { entity, jsonPointer } of indexes.get("users").values()) {
    for (const [position, stakeholderId] of entity.stakeholderIds.entries()) {
      known("stakeholders", stakeholderId);
      relate(edges, "represents", semanticEndpoint("user", entity.id), semanticEndpoint("stakeholder", stakeholderId), "The user persona represents this stakeholder group.", requirements, pointer(jsonPointer, "stakeholderIds", position), stakeholderId);
    }
  }

  for (const { entity, jsonPointer } of indexes.get("capabilities").values()) {
    for (const [position, objectiveId] of entity.businessObjectiveIds.entries()) {
      known("businessObjectives", objectiveId);
      relate(edges, "realized-by", semanticEndpoint("business-objective", objectiveId), semanticEndpoint("capability", entity.id), "The capability realizes this business objective.", requirements, pointer(jsonPointer, "businessObjectiveIds", position), objectiveId);
    }
    for (const [position, userId] of entity.userIds.entries()) {
      known("users", userId);
      relate(edges, "serves", semanticEndpoint("capability", entity.id), semanticEndpoint("user", userId), "The capability serves this declared user.", requirements, pointer(jsonPointer, "userIds", position), userId);
    }
  }

  for (const { entity, jsonPointer } of indexes.get("userJourneys").values()) {
    known("users", entity.userId);
    relate(edges, "performed-by", semanticEndpoint("user-journey", entity.id), semanticEndpoint("user", entity.userId), "The user journey is performed by this declared user.", requirements, pointer(jsonPointer, "userId"), entity.userId);
    for (const [position, capabilityId] of entity.capabilityIds.entries()) {
      known("capabilities", capabilityId);
      relate(edges, "exercised-by", semanticEndpoint("capability", capabilityId), semanticEndpoint("user-journey", entity.id), "The user journey exercises this capability.", requirements, pointer(jsonPointer, "capabilityIds", position), capabilityId);
    }
  }

  for (const { entity, jsonPointer } of indexes.get("userStories").values()) {
    known("capabilities", entity.capabilityId);
    known("users", entity.userId);
    relate(edges, "specified-by", semanticEndpoint("capability", entity.capabilityId), semanticEndpoint("user-story", entity.id), "The user story specifies behavior for this capability.", requirements, pointer(jsonPointer, "capabilityId"), entity.capabilityId);
    relate(edges, "performed-by", semanticEndpoint("user-story", entity.id), semanticEndpoint("user", entity.userId), "The user story is expressed for this declared user.", requirements, pointer(jsonPointer, "userId"), entity.userId);
    for (const [position, criterionId] of entity.acceptanceCriterionIds.entries()) {
      known("acceptanceCriteria", criterionId);
      relate(edges, "accepted-by", semanticEndpoint("user-story", entity.id), semanticEndpoint("acceptance-criterion", criterionId), "The acceptance criterion verifies this user story.", requirements, pointer(jsonPointer, "acceptanceCriterionIds", position), criterionId);
    }
  }

  for (const [field, kind] of [
    ["nonFunctionalRequirements", "non-functional-requirement"],
    ["constraints", "requirement-constraint"],
  ]) {
    for (const { entity, jsonPointer } of indexes.get(field).values()) {
      if (entity.applicability.level === "project") {
        relate(edges, "defines", semanticEndpoint("project", context.projectId), semanticEndpoint(kind, entity.id), "The project defines this project-scoped requirement.", requirements, pointer(jsonPointer, "applicability"), entity.applicability);
        relate(edges, "applies-to", semanticEndpoint(kind, entity.id), semanticEndpoint("project", context.projectId), "The requirement applies to the whole project.", requirements, pointer(jsonPointer, "applicability"), entity.applicability);
      } else {
        for (const [position, capabilityId] of entity.applicability.capabilityIds.entries()) {
          known("capabilities", capabilityId);
          relate(edges, "applies-to", semanticEndpoint(kind, entity.id), semanticEndpoint("capability", capabilityId), "The requirement applies to this capability.", requirements, pointer(jsonPointer, "applicability", "capabilityIds", position), capabilityId);
        }
      }
      for (const [position, criterionId] of entity.acceptanceCriterionIds.entries()) {
        known("acceptanceCriteria", criterionId);
        relate(edges, "accepted-by", semanticEndpoint(kind, entity.id), semanticEndpoint("acceptance-criterion", criterionId), "The acceptance criterion verifies this requirement.", requirements, pointer(jsonPointer, "acceptanceCriterionIds", position), criterionId);
      }
    }
  }

  return {
    horizon: "requirements",
    nodes: nodes.sort((left, right) => compareText(assertionKey(left), assertionKey(right))),
    edges: [...edges.values()].sort((left, right) => compareText(assertionKey(left), assertionKey(right))),
  };
}

async function projectCandidate(context) {
  if (!isModule(context, REQUIREMENTS_MODULE) || !hasOutcome(context, CANDIDATE_OUTCOMES)) {
    fail("candidate projector called for a nonmatching execution");
  }
  return projectSelected(context, selectCandidate(context));
}

async function projectApprovedBaseline(context) {
  if (!observesApprovedRequirements(context)) {
    fail("baseline observer called for a nonmatching execution");
  }
  return projectSelected(context, selectApprovedInputs(context), { includeBusinessScope: true });
}

async function projectControl(context) {
  if (!isModule(context, REQUIREMENTS_MODULE) || !hasOutcome(context, CONTROL_OUTCOMES)) {
    fail("control projector called for a nonmatching execution");
  }
  return {
    horizon: "requirements",
    nodes: [],
    edges: [],
    reason: `RequirementsGathering outcome ${context.moduleResult.outcome} has no canonical requirements candidate to project.`,
  };
}

export function createRequirementsTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.requirements-candidate", version: "1.0.0" }),
    match: (context) => isModule(context, REQUIREMENTS_MODULE) && hasOutcome(context, CANDIDATE_OUTCOMES),
    scope: "requirements/candidate",
    authority: "candidate",
    ownership: ownership(
      "requirements/candidate",
      "candidate",
      REQUIREMENTS_NODE_KINDS,
      REQUIREMENTS_EDGE_KINDS,
    ),
    project: projectCandidate,
  });
}

export function createRequirementsBaselineObserverContributor() {
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.requirements-baseline-observer", version: "1.0.0" }),
    match: (context) =>
      observesApprovedRequirements(context) &&
      hasLoaded(context, "loadedInputs", "requirements-baseline") &&
      hasLoaded(context, "loadedInputs", "project-overview-baseline"),
    scope: "requirements/baseline",
    authority: "approved",
    ownership: ownership(
      "requirements/baseline",
      "approved",
      REQUIREMENTS_NODE_KINDS,
      REQUIREMENTS_EDGE_KINDS,
    ),
    project: projectApprovedBaseline,
  });
}

export function createRequirementsControlTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.requirements-control", version: "1.0.0" }),
    match: (context) => isModule(context, REQUIREMENTS_MODULE) && hasOutcome(context, CONTROL_OUTCOMES),
    scope: "requirements/clarification",
    authority: "candidate",
    ownership: ownership(
      "requirements/clarification",
      "candidate",
      EMPTY_OWNERSHIP_KINDS,
      EMPTY_OWNERSHIP_KINDS,
    ),
    project: projectControl,
  });
}

export const requirementsTraceabilityContributor = createRequirementsTraceabilityContributor();
export const requirementsBaselineObserverContributor = createRequirementsBaselineObserverContributor();
export const requirementsControlTraceabilityContributor = createRequirementsControlTraceabilityContributor();
export const requirementsTraceabilityContributors = Object.freeze([
  requirementsTraceabilityContributor,
  requirementsBaselineObserverContributor,
  requirementsControlTraceabilityContributor,
]);

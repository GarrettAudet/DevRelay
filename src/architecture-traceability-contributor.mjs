import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const MODULE = Object.freeze({ id: "architecture-design", version: "0.1.0" });
const WORK_BREAKDOWN_MODULE = Object.freeze({
  id: "work-breakdown",
  version: "0.1.0",
});
const SUCCESS_OUTCOMES = new Set(["baseline_drafted", "change_set_drafted"]);
const WORK_BREAKDOWN_OBSERVER_OUTCOMES = new Set(["decomposed"]);
const CONTROL_OUTCOMES = new Set([
  "needs_clarification",
  "unable_to_proceed",
]);
const REQUIREMENTS_SCOPE = "requirements/baseline";

const TARGET_KIND = Object.freeze({
  "technical-design": "technical-design",
  element: "architecture-element",
  relationship: "architecture-relationship",
  view: "architecture-view",
  interface: "interface-intent",
  constraint: "architecture-constraint",
  decision: "decision-record",
  change: "architecture-change",
});
const ARCHITECTURE_NODE_KINDS = Object.freeze([
  "architecture-change",
  "architecture-constraint",
  "architecture-element",
  "architecture-relationship",
  "architecture-view",
  "decision-record",
  "interface-intent",
  "technical-design",
]);
const ARCHITECTURE_EDGE_KINDS = Object.freeze([
  "affects",
  "contains",
  "derived-from",
  "designed-by",
  "source-endpoint",
  "supersedes",
  "target-endpoint",
]);
const EMPTY_OWNERSHIP_KINDS = Object.freeze([]);

function fail(message) {
  throw new TypeError(`architecture traceability contributor: ${message}`);
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

function ownership(scope, authority, nodeKinds, edgeKinds) {
  return deepFreeze({ scope, authority, nodeKinds, edgeKinds });
}

function sameModule(context) {
  const module = context?.invocation?.module;
  return (
    module?.id === MODULE.id &&
    module.version === MODULE.version &&
    new Set(["establish-baseline", "design-change"]).has(module.operation)
  );
}

function isWorkBreakdownModule(context) {
  const module = context?.invocation?.module;
  return (
    module?.id === WORK_BREAKDOWN_MODULE.id &&
    module.version === WORK_BREAKDOWN_MODULE.version &&
    new Set(["establish-breakdown", "decompose-change"]).has(module.operation)
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
  return compact({ kind, stableId, authority, scope });
}

function requirementEndpoint(requirementId) {
  let kind;
  if (requirementId.startsWith("US-")) kind = "user-story";
  else if (requirementId.startsWith("NFR-")) kind = "non-functional-requirement";
  else if (requirementId.startsWith("CON-")) kind = "requirement-constraint";
  else fail(`unsupported normative requirement ID ${requirementId}`);
  return semanticEndpoint(kind, requirementId, "approved", REQUIREMENTS_SCOPE);
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

function edgeIdentity(edge) {
  return canonicalJson({
    kind: edge.kind,
    source: edge.source,
    target: edge.target,
    qualifier: edge.qualifier ?? "",
  });
}

function mergeLocators(...groups) {
  const locators = new Map();
  for (const locator of groups.flat()) {
    locators.set(assertionKey(locator), locator);
  }
  return [...locators.values()].sort((left, right) =>
    assertionKey(left).localeCompare(assertionKey(right), "en"),
  );
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
  existing.sourceLocators = mergeLocators(
    existing.sourceLocators,
    edge.sourceLocators,
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
  extraLocators = [],
) {
  addEdge(edges, {
    kind,
    source,
    target,
    rationale,
    sourceLocators: mergeLocators(
      [sourceLocator(loaded, jsonPointer, entity)],
      extraLocators,
    ),
  });
}

function sameRef(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left.schema === right.schema &&
    left.mediaType === right.mediaType &&
    left.digest === right.digest &&
    left.uri === right.uri
  );
}

async function resolveSection(context, candidate, name) {
  const section = candidate.value.sections?.[name];
  if (section?.mode === "embedded") {
    return {
      loaded: candidate,
      content: section.content,
      pointerBase: pointer("/sections", name, "content"),
      parentPointer: pointer("/sections", name),
      attached: false,
    };
  }
  if (section?.mode !== "attached" || section.artifact === undefined) {
    fail(`section ${name} is absent or invalid`);
  }
  if (typeof context.resolveArtifact !== "function") {
    fail(`attached section ${name} requires context.resolveArtifact`);
  }
  const loaded = await context.resolveArtifact(structuredClone(section.artifact));
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    !sameRef(loaded.ref, section.artifact) ||
    loaded.value === null ||
    typeof loaded.value !== "object"
  ) {
    fail(`attached section ${name} did not resolve to its exact artifact`);
  }
  return {
    loaded,
    content: loaded.value,
    pointerBase: "",
    parentPointer: pointer("/sections", name, "artifact"),
    attached: true,
    parentArtifact: section.artifact,
  };
}

function selectCandidate(context) {
  if (context.moduleResult.outcome === "baseline_drafted") {
    const loaded = oneLoaded(context, "loadedOutputs", "architecture-draft");
    if (loaded.value.kind !== "ArchitectureDraft") {
      fail("baseline outcome does not contain ArchitectureDraft");
    }
    return loaded;
  }
  if (context.moduleResult.outcome === "change_set_drafted") {
    const loaded = oneLoaded(
      context,
      "loadedOutputs",
      "architecture-change-set-draft",
    );
    if (loaded.value.kind !== "ArchitectureChangeSetDraft") {
      fail("change outcome does not contain ArchitectureChangeSetDraft");
    }
    return loaded;
  }
  fail(`outcome ${JSON.stringify(context.moduleResult.outcome)} is not projectable`);
}

function targetKey(kind, id) {
  return `${kind}\u0000${id}`;
}

function addUniqueNode(nodes, node) {
  const key = `${node.kind}\u0000${node.stableId}`;
  const existing = nodes.get(key);
  if (existing && canonicalJsonDigest(existing) !== canonicalJsonDigest(node)) {
    fail(`node ${node.kind}:${node.stableId} is projected inconsistently`);
  }
  nodes.set(key, existing ?? node);
}

async function projectSelectedArchitecture(
  context,
  { candidate, requirements, requirementsField, traceability, currentRequirementIds },
) {
  const nodes = new Map();
  const edges = new Map();
  const targetEndpoints = new Map();
  const citations = new Map();
  addUniqueNode(nodes, artifactNode(candidate));
  addUniqueNode(nodes, artifactNode(requirements));

  relate(
    edges,
    "derived-from",
    artifactEndpoint(candidate.ref),
    artifactEndpoint(requirements.ref),
    "The architecture candidate is derived from this exact approved requirements baseline.",
    candidate,
    pointer("", requirementsField),
    candidate.value[requirementsField],
  );

  const sections = {};
  for (const name of [
    "technicalDesign",
    "architectureModel",
    "diagrams",
    "interfaceIntent",
    "architectureConstraints",
    "decisionRecords",
  ]) {
    const section = await resolveSection(context, candidate, name);
    sections[name] = section;
    if (section.attached) {
      addUniqueNode(nodes, artifactNode(section.loaded));
      relate(
        edges,
        "contains",
        artifactEndpoint(candidate.ref),
        artifactEndpoint(section.loaded.ref),
        `The architecture candidate attaches the canonical ${name} artifact.`,
        candidate,
        section.parentPointer,
        section.parentArtifact,
      );
    }
  }

  const rememberCitations = (traceKind, id, entity, loaded, basePointer) => {
    const ids = entity.sourceRequirementIds ?? [];
    for (const [position, requirementId] of ids.entries()) {
      if (currentRequirementIds && !currentRequirementIds.has(requirementId)) {
        continue;
      }
      const key = `${requirementId}\u0000${targetKey(traceKind, id)}`;
      const locator = sourceLocator(
        loaded,
        pointer(basePointer, "sourceRequirementIds", position),
        requirementId,
      );
      const prior = citations.get(key) ?? [];
      citations.set(key, mergeLocators(prior, [locator]));
    }
  };

  const addArchitectureNode = (
    traceKind,
    kind,
    stableId,
    label,
    loaded,
    jsonPointer,
    entity,
    attributes,
  ) => {
    addUniqueNode(
      nodes,
      semanticNode(
        kind,
        stableId,
        label,
        loaded,
        jsonPointer,
        entity,
        attributes,
      ),
    );
    targetEndpoints.set(
      targetKey(traceKind, stableId),
      semanticEndpoint(kind, stableId),
    );
    rememberCitations(traceKind, stableId, entity, loaded, jsonPointer);
    relate(
      edges,
      "contains",
      artifactEndpoint(loaded.ref),
      semanticEndpoint(kind, stableId),
      "The canonical architecture artifact contains this typed entity.",
      loaded,
      jsonPointer,
      entity,
    );
  };

  const technical = sections.technicalDesign;
  addArchitectureNode(
    "technical-design",
    "technical-design",
    technical.content.technicalDesignId,
    technical.content.objective,
    technical.loaded,
    technical.pointerBase,
    technical.content,
    {
      problemSummary: technical.content.problemSummary,
      solutionSummary: technical.content.solutionSummary,
    },
  );

  const model = sections.architectureModel;
  const elements = new Map();
  for (const [position, entity] of model.content.elements.entries()) {
    const jsonPointer = pointer(model.pointerBase, "elements", position);
    elements.set(entity.id, { entity, jsonPointer });
    addArchitectureNode(
      "element",
      "architecture-element",
      entity.id,
      entity.name,
      model.loaded,
      jsonPointer,
      entity,
      compact({
        type: entity.type,
        description: entity.description,
        technology: entity.technology,
      }),
    );
  }
  for (const { entity, jsonPointer } of elements.values()) {
    if (entity.parentId !== undefined) {
      if (!elements.has(entity.parentId)) fail(`element ${entity.id} has unknown parent`);
      relate(edges, "contains", semanticEndpoint("architecture-element", entity.parentId), semanticEndpoint("architecture-element", entity.id), "The parent architecture element contains this child element.", model.loaded, pointer(jsonPointer, "parentId"), entity.parentId);
    }
  }

  const relationships = new Map();
  for (const [position, entity] of model.content.relationships.entries()) {
    const jsonPointer = pointer(model.pointerBase, "relationships", position);
    relationships.set(entity.id, { entity, jsonPointer });
    addArchitectureNode(
      "relationship",
      "architecture-relationship",
      entity.id,
      entity.description,
      model.loaded,
      jsonPointer,
      entity,
      compact({ interactionStyle: entity.interactionStyle, technology: entity.technology }),
    );
    if (!elements.has(entity.sourceElementId) || !elements.has(entity.targetElementId)) {
      fail(`relationship ${entity.id} has an unknown endpoint`);
    }
    relate(edges, "source-endpoint", semanticEndpoint("architecture-relationship", entity.id), semanticEndpoint("architecture-element", entity.sourceElementId), "The relationship starts at this architecture element.", model.loaded, pointer(jsonPointer, "sourceElementId"), entity.sourceElementId);
    relate(edges, "target-endpoint", semanticEndpoint("architecture-relationship", entity.id), semanticEndpoint("architecture-element", entity.targetElementId), "The relationship ends at this architecture element.", model.loaded, pointer(jsonPointer, "targetElementId"), entity.targetElementId);
  }

  const diagrams = sections.diagrams;
  for (const [position, entity] of diagrams.content.views.entries()) {
    addArchitectureNode(
      "view",
      "architecture-view",
      entity.viewKey,
      entity.title,
      diagrams.loaded,
      pointer(diagrams.pointerBase, "views", position),
      entity,
      { type: entity.type, purpose: entity.purpose },
    );
  }

  const interfaces = sections.interfaceIntent;
  for (const [position, entity] of interfaces.content.interfaces.entries()) {
    addArchitectureNode(
      "interface",
      "interface-intent",
      entity.id,
      entity.name,
      interfaces.loaded,
      pointer(interfaces.pointerBase, "interfaces", position),
      entity,
      {
        purpose: entity.purpose,
        ownerBoundary: entity.ownerBoundary,
        interactionStyle: entity.interactionStyle,
      },
    );
  }

  const constraints = sections.architectureConstraints;
  for (const [position, entity] of constraints.content.constraints.entries()) {
    addArchitectureNode(
      "constraint",
      "architecture-constraint",
      entity.id,
      entity.statement,
      constraints.loaded,
      pointer(constraints.pointerBase, "constraints", position),
      entity,
      {
        category: entity.category,
        strength: entity.strength,
        verificationIntent: entity.verificationIntent,
      },
    );
  }

  const decisions = sections.decisionRecords;
  const decisionIndex = new Map();
  for (const [position, entity] of decisions.content.decisions.entries()) {
    const jsonPointer = pointer(decisions.pointerBase, "decisions", position);
    decisionIndex.set(entity.id, { entity, jsonPointer });
    addArchitectureNode(
      "decision",
      "decision-record",
      entity.id,
      entity.title,
      decisions.loaded,
      jsonPointer,
      entity,
      { status: entity.status, format: entity.format },
    );
  }
  for (const { entity, jsonPointer } of decisionIndex.values()) {
    for (const [position, target] of entity.affectedTargets.entries()) {
      const targetEndpoint = targetEndpoints.get(targetKey(target.kind, target.id));
      if (!targetEndpoint) fail(`decision ${entity.id} has unknown target ${target.kind}:${target.id}`);
      relate(edges, "affects", semanticEndpoint("decision-record", entity.id), targetEndpoint, "The architecture decision affects this declared target.", decisions.loaded, pointer(jsonPointer, "affectedTargets", position), target);
    }
    for (const [position, supersededId] of entity.supersedesDecisionIds.entries()) {
      if (!decisionIndex.has(supersededId)) fail(`decision ${entity.id} supersedes unknown decision ${supersededId}`);
      relate(edges, "supersedes", semanticEndpoint("decision-record", entity.id), semanticEndpoint("decision-record", supersededId), "The architecture decision supersedes this prior decision.", decisions.loaded, pointer(jsonPointer, "supersedesDecisionIds", position), supersededId);
    }
  }

  for (const field of [
    "elementChanges",
    "relationshipChanges",
    "viewChanges",
    "interfaceChanges",
    "constraintChanges",
    "decisionChanges",
  ]) {
    for (const [position, entity] of (candidate.value.changes?.[field] ?? []).entries()) {
      const jsonPointer = pointer("/changes", field, position);
      addArchitectureNode(
        "change",
        "architecture-change",
        entity.changeId,
        entity.rationale,
        candidate,
        jsonPointer,
        entity,
        compact({
          operation: entity.operation,
          entityKind: entity.entityKind,
          entityId: entity.entityId ?? entity.decisionId,
          compatibilityImpact: entity.compatibilityImpact,
        }),
      );
    }
  }

  const tdEndpoint = semanticEndpoint(
    "technical-design",
    technical.content.technicalDesignId,
  );
  for (const [position, interfaceId] of technical.content.interfaceIntentIds.entries()) {
    if (!targetEndpoints.has(targetKey("interface", interfaceId))) fail(`technical design references unknown interface ${interfaceId}`);
    relate(edges, "contains", tdEndpoint, semanticEndpoint("interface-intent", interfaceId), "The technical design contains this interface intent.", technical.loaded, pointer(technical.pointerBase, "interfaceIntentIds", position), interfaceId);
  }
  for (const [position, constraintId] of technical.content.constraintIds.entries()) {
    if (!targetEndpoints.has(targetKey("constraint", constraintId))) fail(`technical design references unknown constraint ${constraintId}`);
    relate(edges, "contains", tdEndpoint, semanticEndpoint("architecture-constraint", constraintId), "The technical design contains this architecture constraint.", technical.loaded, pointer(technical.pointerBase, "constraintIds", position), constraintId);
  }

  if (Array.isArray(traceability)) {
    const tracedTargets = new Set();
    for (const [tracePosition, trace] of traceability.entries()) {
      if (trace.disposition === "no-architecture-impact") {
        const stableId = `NO-ARCHITECTURE-IMPACT-${trace.requirementId}`;
        const tracePointer = pointer("/traceability", tracePosition);
        addUniqueNode(
          nodes,
          semanticNode(
            "architecture-change",
            stableId,
            `No architecture impact for ${trace.requirementId}`,
            candidate,
            tracePointer,
            trace,
            { disposition: trace.disposition, rationale: trace.rationale },
          ),
        );
        relate(
          edges,
          "contains",
          artifactEndpoint(candidate.ref),
          semanticEndpoint("architecture-change", stableId),
          "The architecture candidate records this explicit no-impact disposition.",
          candidate,
          tracePointer,
          trace,
        );
        relate(
          edges,
          "designed-by",
          requirementEndpoint(trace.requirementId),
          semanticEndpoint("architecture-change", stableId),
          trace.rationale,
          candidate,
          tracePointer,
          trace,
        );
        continue;
      }
      for (const [targetPosition, target] of trace.targets.entries()) {
        const mappedKind = TARGET_KIND[target.kind];
        const endpoint = targetEndpoints.get(targetKey(target.kind, target.id));
        if (!mappedKind || !endpoint) {
          fail(`traceability references unknown target ${target.kind}:${target.id}`);
        }
        const traceKey = `${trace.requirementId}\u0000${targetKey(target.kind, target.id)}`;
        tracedTargets.add(traceKey);
        relate(
          edges,
          "designed-by",
          requirementEndpoint(trace.requirementId),
          endpoint,
          trace.rationale,
          candidate,
          pointer("/traceability", tracePosition, "targets", targetPosition),
          target,
          citations.get(traceKey) ?? [],
        );
      }
    }
    for (const citationKey of citations.keys()) {
      if (!tracedTargets.has(citationKey)) {
        const [requirementId, traceKind, targetId] = citationKey.split("\u0000");
        fail(`sourceRequirementIds citation ${requirementId} -> ${traceKind}:${targetId} is absent from exhaustive traceability`);
      }
    }
  } else {
    for (const [citationKey, sourceLocators] of citations.entries()) {
      const [requirementId, traceKind, targetId] = citationKey.split("\u0000");
      const endpoint = targetEndpoints.get(targetKey(traceKind, targetId));
      if (!endpoint) {
        fail(`approved baseline citation references unknown target ${traceKind}:${targetId}`);
      }
      addEdge(edges, {
        kind: "designed-by",
        source: requirementEndpoint(requirementId),
        target: endpoint,
        rationale: "The approved architecture baseline declares this target as driven by the approved requirement.",
        sourceLocators,
      });
    }
  }

  return {
    horizon: "architecture",
    nodes: [...nodes.values()].sort((left, right) => assertionKey(left).localeCompare(assertionKey(right), "en")),
    edges: [...edges.values()].sort((left, right) => assertionKey(left).localeCompare(assertionKey(right), "en")),
  };
}

async function projectArchitecture(context) {
  if (!sameModule(context) || !hasOutcome(context, SUCCESS_OUTCOMES)) {
    fail("candidate projector called for a nonmatching execution");
  }
  const candidate = selectCandidate(context);
  const requirements = oneLoaded(
    context,
    "loadedInputs",
    "requirements-baseline",
  );
  if (requirements.value.kind !== "RequirementsBaseline") {
    fail("ArchitectureDesign input is not a RequirementsBaseline");
  }
  return projectSelectedArchitecture(context, {
    candidate,
    requirements,
    requirementsField:
      candidate.value.kind === "ArchitectureDraft"
        ? "requirementsBaseline"
        : "targetRequirementsBaseline",
    traceability: candidate.value.traceability,
  });
}

async function projectApprovedBaseline(context) {
  if (
    !isWorkBreakdownModule(context) ||
    !hasOutcome(context, WORK_BREAKDOWN_OBSERVER_OUTCOMES)
  ) {
    fail("approved baseline observer called for a nonmatching execution");
  }
  const baseline = oneLoaded(context, "loadedInputs", "architecture-baseline");
  const requirements = oneLoaded(
    context,
    "loadedInputs",
    "requirements-baseline",
  );
  if (
    baseline.value.kind !== "ArchitectureBaseline" ||
    requirements.value.kind !== "RequirementsBaseline"
  ) {
    fail("WorkBreakdown inputs do not contain approved architecture and requirements baselines");
  }
  if (!sameRef(baseline.value.requirementsBaseline, requirements.ref)) {
    fail("ArchitectureBaseline does not bind the exact loaded RequirementsBaseline");
  }
  const currentRequirementIds = new Set(
    [
      "businessObjectives", "successMetrics", "stakeholders", "users",
      "capabilities", "userJourneys", "userStories", "acceptanceCriteria",
      "nonFunctionalRequirements", "constraints",
    ].flatMap((field) =>
      (requirements.value.requirements[field] ?? []).map(({ id }) => id),
    ),
  );

  return projectSelectedArchitecture(context, {
    candidate: baseline,
    requirements,
    requirementsField: "requirementsBaseline",
    traceability: undefined,
    currentRequirementIds,
  });
}

async function projectControl(context) {
  if (!sameModule(context) || !hasOutcome(context, CONTROL_OUTCOMES)) {
    fail("control projector called for a nonmatching execution");
  }
  return {
    horizon: "architecture",
    nodes: [],
    edges: [],
    reason: `ArchitectureDesign outcome ${context.moduleResult.outcome} has no canonical architecture candidate to project.`,
  };
}

export function createArchitectureTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.architecture-candidate", version: "1.0.0" }),
    match: (context) => sameModule(context) && hasOutcome(context, SUCCESS_OUTCOMES),
    scope: "architecture/candidate",
    authority: "candidate",
    ownership: ownership(
      "architecture/candidate",
      "candidate",
      ARCHITECTURE_NODE_KINDS,
      ARCHITECTURE_EDGE_KINDS,
    ),
    project: projectArchitecture,
  });
}

export function createArchitectureBaselineObserverContributor() {
  return Object.freeze({
    metadata: deepFreeze({
      id: "devrelay.architecture-baseline-observer",
      version: "1.0.0",
    }),
    match: (context) =>
      isWorkBreakdownModule(context) &&
      hasOutcome(context, WORK_BREAKDOWN_OBSERVER_OUTCOMES) &&
      hasLoaded(context, "loadedInputs", "architecture-baseline") &&
      hasLoaded(context, "loadedInputs", "requirements-baseline"),
    scope: "architecture/baseline",
    authority: "approved",
    ownership: ownership(
      "architecture/baseline",
      "approved",
      ARCHITECTURE_NODE_KINDS,
      ARCHITECTURE_EDGE_KINDS,
    ),
    project: projectApprovedBaseline,
  });
}

export function createArchitectureControlTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.architecture-control", version: "1.0.0" }),
    match: (context) => sameModule(context) && hasOutcome(context, CONTROL_OUTCOMES),
    scope: "architecture/clarification",
    authority: "candidate",
    ownership: ownership(
      "architecture/clarification",
      "candidate",
      EMPTY_OWNERSHIP_KINDS,
      EMPTY_OWNERSHIP_KINDS,
    ),
    project: projectControl,
  });
}

export const architectureTraceabilityContributor = createArchitectureTraceabilityContributor();
export const architectureBaselineObserverContributor = createArchitectureBaselineObserverContributor();
export const architectureControlTraceabilityContributor = createArchitectureControlTraceabilityContributor();
export const architectureTraceabilityContributors = Object.freeze([
  architectureTraceabilityContributor,
  architectureBaselineObserverContributor,
  architectureControlTraceabilityContributor,
]);

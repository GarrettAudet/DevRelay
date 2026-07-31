import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

const architectureArtifactSchema = JSON.parse(
  readFileSync(
    new URL(
      "../contracts/architecture-design-artifacts.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const architectureArtifactValidator = compileArtifactSchema(
  architectureArtifactSchema,
);

const SECTION_IDS = Object.freeze({
  technicalDesign: "technicalDesignId",
  architectureModel: "modelId",
  diagrams: "diagramSetId",
  interfaceIntent: "interfaceIntentSetId",
  architectureConstraints: "constraintSetId",
  decisionRecords: "decisionRecordSetId",
  nativeArtifacts: "nativeArtifactSetId",
});

const SECTION_DEFINITIONS = Object.freeze({
  technicalDesign: "technicalDesign",
  architectureModel: "architectureModel",
  diagrams: "architectureDiagramSet",
  interfaceIntent: "interfaceIntentSet",
  architectureConstraints: "architectureConstraintSet",
  decisionRecords: "decisionRecordSet",
  nativeArtifacts: "nativeArtifactSet",
});

const sectionContentValidators = Object.freeze(
  Object.fromEntries(
    Object.entries(SECTION_DEFINITIONS).map(([name, definition]) => [
      name,
      compileArtifactSchema({
        $schema: architectureArtifactSchema.$schema,
        $id: architectureArtifactSchema.$id,
        $ref: `${architectureArtifactSchema.$id}#/$defs/${definition}`,
        $defs: architectureArtifactSchema.$defs,
      }),
    ]),
  ),
);

const CHANGE_COLLECTION_KINDS = Object.freeze({
  elementChanges: "element",
  relationshipChanges: "relationship",
  viewChanges: "view",
  interfaceChanges: "interface",
  constraintChanges: "constraint",
});

const STAGE_PREFIXES = Object.freeze({
  designer: [],
  modeler: ["designer"],
  "decision-recorder": ["designer", "modeler"],
});

export class ArchitectureArtifactValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArchitectureArtifactValidationError";
    this.code = "DR2800";
  }
}

function fail(message) {
  throw new ArchitectureArtifactValidationError(
    `architecture artifact is invalid: ${message}`,
  );
}

function samePointer(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function assertPointer(label, actual, expected) {
  if (!samePointer(actual, expected)) {
    fail(`${label} does not match the exact content-addressed artifact`);
  }
}

function assertUnique(items, label, key = ({ id }) => id) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) {
      fail(`${label} contains duplicate identifier ${value}`);
    }
    seen.add(value);
  }
  return seen;
}

function validateAssumptions(assumptions, label, allowBlocking) {
  assertUnique(assumptions, `${label} assumptions`);
  if (!allowBlocking) {
    const unresolved = assumptions.find(
      ({ blocking, status }) => blocking && status === "unconfirmed",
    );
    if (unresolved) {
      fail(`${label} contains unresolved blocking assumption ${unresolved.id}`);
    }
  }
}

function validateBaseInputs(baseInputs, operation, projectStatePointer) {
  const roles = assertUnique(baseInputs, "baseInputs", ({ role }) => role);
  for (const required of [
    "project-architecture-state",
    "requirements-baseline",
    "project-context",
  ]) {
    if (!roles.has(required)) {
      fail(`baseInputs is missing required role ${required}`);
    }
  }

  const stateInput = baseInputs.find(
    ({ role }) => role === "project-architecture-state",
  );
  assertPointer(
    "projectArchitectureState",
    projectStatePointer,
    stateInput.artifact,
  );

  if (operation === "establish-baseline") {
    if (roles.has("architecture-baseline")) {
      fail("establish-baseline cannot receive an architecture baseline");
    }
    if (
      roles.has("current-architecture-snapshot") &&
      !roles.has("repository-snapshot")
    ) {
      fail(
        "a current architecture snapshot requires its repository snapshot",
      );
    }
  } else {
    if (!roles.has("architecture-baseline")) {
      fail("design-change requires the exact architecture baseline");
    }
    if (roles.has("current-architecture-snapshot")) {
      fail("design-change cannot use a discovery snapshot as authority");
    }
  }
}

function resolveSection(section, name, options) {
  if (!section) {
    return undefined;
  }
  if (section.mode === "embedded") {
    return section.content;
  }
  if (!options.resolveAttached) {
    return undefined;
  }

  const content = options.resolveAttached(section.artifact);
  if (!content || typeof content !== "object") {
    fail(`attached ${name} could not be resolved`);
  }
  const digest = canonicalJsonDigest(content);
  if (digest !== section.artifact.digest) {
    fail(`attached ${name} content does not match its digest`);
  }
  const idField = SECTION_IDS[name];
  if (content[idField] !== section.contentId) {
    fail(`attached ${name} content does not match contentId`);
  }
  const contentValidator = sectionContentValidators[name];
  if (!contentValidator(content)) {
    fail(
      `attached ${name} content is invalid: ${validationDetail(
        contentValidator,
      )}`,
    );
  }
  return content;
}

function sectionIdentity(section, name, options) {
  const content = resolveSection(section, name, options);
  return content?.[SECTION_IDS[name]] ?? section?.contentId;
}

function sectionDigest(section, name, options) {
  const content = resolveSection(section, name, options);
  return content
    ? canonicalJsonDigest(content)
    : section?.mode === "attached"
      ? section.artifact.digest
      : undefined;
}

function emptyIndex() {
  return {
    "technical-design": new Set(),
    element: new Set(),
    relationship: new Set(),
    view: new Set(),
    interface: new Set(),
    constraint: new Set(),
    decision: new Set(),
    change: new Set(),
  };
}

function requireKnown(index, kind, id, location, enforce = true) {
  if (enforce && !index[kind].has(id)) {
    fail(`${location} references unknown ${kind} ${id}`);
  }
}

function addRequirementCitation(citations, requirementIds, kind, id) {
  for (const requirementId of requirementIds ?? []) {
    const targets = citations.get(requirementId) ?? new Set();
    targets.add(`${kind}:${id}`);
    citations.set(requirementId, targets);
  }
}

function validateArchitectureModel(model, index, citations) {
  if (!model) {
    return;
  }
  const elementIds = assertUnique(model.elements, "architecture elements");
  const relationshipIds = assertUnique(
    model.relationships,
    "architecture relationships",
  );

  for (const element of model.elements) {
    index.element.add(element.id);
    addRequirementCitation(
      citations,
      element.sourceRequirementIds,
      "element",
      element.id,
    );
    if (element.parentId) {
      requireKnown(
        { element: elementIds },
        "element",
        element.parentId,
        `element ${element.id}`,
      );
      if (element.parentId === element.id) {
        fail(`element ${element.id} cannot be its own parent`);
      }
    }
  }

  for (const relationship of model.relationships) {
    index.relationship.add(relationship.id);
    requireKnown(
      { element: elementIds },
      "element",
      relationship.sourceElementId,
      `relationship ${relationship.id}`,
    );
    requireKnown(
      { element: elementIds },
      "element",
      relationship.targetElementId,
      `relationship ${relationship.id}`,
    );
    addRequirementCitation(
      citations,
      relationship.sourceRequirementIds,
      "relationship",
      relationship.id,
    );
  }

  for (const element of model.elements) {
    const ancestry = new Set([element.id]);
    let parentId = element.parentId;
    while (parentId) {
      if (ancestry.has(parentId)) {
        fail(`element hierarchy contains a cycle at ${parentId}`);
      }
      ancestry.add(parentId);
      parentId = model.elements.find(({ id }) => id === parentId)?.parentId;
    }
  }

  return { elementIds, relationshipIds };
}

function validateDiagrams(
  diagrams,
  model,
  modelSection,
  index,
  options,
) {
  if (!diagrams) {
    return;
  }
  assertUnique(diagrams.views, "diagram views", ({ viewKey }) => viewKey);
  const expectedModelId = sectionIdentity(
    modelSection,
    "architectureModel",
    options,
  );
  const expectedModelDigest = sectionDigest(
    modelSection,
    "architectureModel",
    options,
  );
  if (diagrams.architectureModelId !== expectedModelId) {
    fail("diagram set does not bind the selected architecture model ID");
  }
  if (diagrams.architectureModelDigest !== expectedModelDigest) {
    fail("diagram set does not bind the exact architecture model digest");
  }

  const elementIds = model
    ? new Set(model.elements.map(({ id }) => id))
    : undefined;
  const relationshipIds = model
    ? new Set(model.relationships.map(({ id }) => id))
    : undefined;
  for (const view of diagrams.views) {
    index.view.add(view.viewKey);
    if (view.scopeElementId) {
      requireKnown(
        { element: elementIds ?? new Set() },
        "element",
        view.scopeElementId,
        `view ${view.viewKey}`,
        Boolean(elementIds),
      );
    }
    for (const elementId of view.elementIds) {
      requireKnown(
        { element: elementIds ?? new Set() },
        "element",
        elementId,
        `view ${view.viewKey}`,
        Boolean(elementIds),
      );
    }
    for (const relationshipId of view.relationshipIds) {
      requireKnown(
        { relationship: relationshipIds ?? new Set() },
        "relationship",
        relationshipId,
        `view ${view.viewKey}`,
        Boolean(relationshipIds),
      );
    }
    if (view.dynamicSteps) {
      assertUnique(
        view.dynamicSteps,
        `view ${view.viewKey} dynamic step orders`,
        ({ order }) => order,
      );
      for (const step of view.dynamicSteps) {
        requireKnown(
          { relationship: relationshipIds ?? new Set() },
          "relationship",
          step.relationshipId,
          `view ${view.viewKey} step ${step.order}`,
          Boolean(relationshipIds),
        );
      }
    }
  }
}

function validateInterfaces(interfaces, model, index, citations) {
  if (!interfaces) {
    return;
  }
  assertUnique(interfaces.interfaces, "interface intents");
  const elementIds = model
    ? new Set(model.elements.map(({ id }) => id))
    : undefined;
  for (const intent of interfaces.interfaces) {
    index.interface.add(intent.id);
    requireKnown(
      { element: elementIds ?? new Set() },
      "element",
      intent.providerElementId,
      `interface ${intent.id}`,
      Boolean(elementIds),
    );
    for (const consumerId of intent.consumerElementIds) {
      requireKnown(
        { element: elementIds ?? new Set() },
        "element",
        consumerId,
        `interface ${intent.id}`,
        Boolean(elementIds),
      );
    }
    addRequirementCitation(
      citations,
      intent.sourceRequirementIds,
      "interface",
      intent.id,
    );
  }
}

function validateConstraints(constraints, index, citations, modelResolved) {
  if (!constraints) {
    return;
  }
  assertUnique(constraints.constraints, "architecture constraints");
  for (const constraint of constraints.constraints) {
    index.constraint.add(constraint.id);
    for (const target of constraint.appliesTo) {
      const enforce =
        target.kind === "interface"
          ? index.interface.size > 0
          : modelResolved;
      requireKnown(
        index,
        target.kind,
        target.id,
        `constraint ${constraint.id}`,
        enforce,
      );
    }
    addRequirementCitation(
      citations,
      constraint.sourceRequirementIds,
      "constraint",
      constraint.id,
    );
  }
}

function validateDecisions(decisions, index, citations) {
  if (!decisions) {
    return;
  }
  assertUnique(decisions.decisions, "decision records");
  for (const decision of decisions.decisions) {
    index.decision.add(decision.id);
    const options = assertUnique(
      decision.consideredOptions,
      `decision ${decision.id} options`,
    );
    if (!options.has(decision.outcome.chosenOptionId)) {
      fail(
        `decision ${decision.id} chooses unknown option ` +
          decision.outcome.chosenOptionId,
      );
    }
    for (const target of decision.affectedTargets) {
      const enforce =
        target.kind === "view"
          ? index.view.size > 0
          : target.kind === "interface"
            ? index.interface.size > 0
            : target.kind === "constraint"
              ? index.constraint.size > 0
              : index.element.size > 0;
      requireKnown(
        index,
        target.kind,
        target.id,
        `decision ${decision.id}`,
        enforce,
      );
    }
    addRequirementCitation(
      citations,
      decision.sourceRequirementIds,
      "decision",
      decision.id,
    );
  }
}

function validateNativeArtifacts(nativeArtifacts) {
  if (!nativeArtifacts) {
    return;
  }
  assertUnique(nativeArtifacts.entries, "native artifacts");
  assertUnique(
    nativeArtifacts.entries,
    "native artifact logical identities",
    ({ artifact }) => `${artifact.artifactId}:${artifact.digest}`,
  );
}

function validateTechnicalDesign(
  technicalDesign,
  interfaces,
  constraints,
  index,
  citations,
) {
  if (!technicalDesign) {
    return;
  }
  index["technical-design"].add(technicalDesign.technicalDesignId);
  const interfaceIds = interfaces
    ? new Set(interfaces.interfaces.map(({ id }) => id))
    : undefined;
  const constraintIds = constraints
    ? new Set(constraints.constraints.map(({ id }) => id))
    : undefined;
  for (const interfaceId of technicalDesign.interfaceIntentIds) {
    requireKnown(
      { interface: interfaceIds ?? new Set() },
      "interface",
      interfaceId,
      `technical design ${technicalDesign.technicalDesignId}`,
      Boolean(interfaceIds),
    );
  }
  for (const constraintId of technicalDesign.constraintIds) {
    requireKnown(
      { constraint: constraintIds ?? new Set() },
      "constraint",
      constraintId,
      `technical design ${technicalDesign.technicalDesignId}`,
      Boolean(constraintIds),
    );
  }
  addRequirementCitation(
    citations,
    technicalDesign.sourceRequirementIds,
    "technical-design",
    technicalDesign.technicalDesignId,
  );
}

function validateTraceability(traceability, index, citations) {
  assertUnique(
    traceability,
    "traceability",
    ({ requirementId }) => requirementId,
  );
  const byRequirement = new Map(
    traceability.map((entry) => [entry.requirementId, entry]),
  );

  for (const entry of traceability) {
    const targets = assertUnique(
      entry.targets,
      `traceability ${entry.requirementId} targets`,
      ({ kind, id }) => `${kind}:${id}`,
    );
    for (const target of entry.targets) {
      requireKnown(
        index,
        target.kind,
        target.id,
        `traceability ${entry.requirementId}`,
      );
    }
    if (entry.disposition === "no-architecture-impact" && targets.size > 0) {
      fail(
        `traceability ${entry.requirementId} has targets despite no impact`,
      );
    }
  }

  for (const [requirementId, citedTargets] of citations) {
    const trace = byRequirement.get(requirementId);
    if (!trace) {
      fail(
        `requirement ${requirementId} is cited without traceability`,
      );
    }
    if (trace.disposition !== "designed") {
      fail(
        `requirement ${requirementId} is cited but marked no architecture impact`,
      );
    }
    const traced = new Set(
      trace.targets.map(({ kind, id }) => `${kind}:${id}`),
    );
    for (const citedTarget of citedTargets) {
      if (!traced.has(citedTarget)) {
        fail(
          `traceability ${requirementId} omits cited target ${citedTarget}`,
        );
      }
    }
  }
}

function validateSections(
  sections,
  traceability,
  options,
  { partial = false, changes } = {},
) {
  const index = emptyIndex();
  const citations = new Map();
  const technicalDesignId = sectionIdentity(
    sections.technicalDesign,
    "technicalDesign",
    options,
  );
  if (technicalDesignId) {
    index["technical-design"].add(technicalDesignId);
  }
  const model = resolveSection(
    sections.architectureModel,
    "architectureModel",
    options,
  );
  const diagrams = resolveSection(sections.diagrams, "diagrams", options);
  const interfaces = resolveSection(
    sections.interfaceIntent,
    "interfaceIntent",
    options,
  );
  const constraints = resolveSection(
    sections.architectureConstraints,
    "architectureConstraints",
    options,
  );
  const decisions = resolveSection(
    sections.decisionRecords,
    "decisionRecords",
    options,
  );
  const technicalDesign = resolveSection(
    sections.technicalDesign,
    "technicalDesign",
    options,
  );
  const nativeArtifacts = resolveSection(
    sections.nativeArtifacts,
    "nativeArtifacts",
    options,
  );

  validateArchitectureModel(model, index, citations);
  validateDiagrams(
    diagrams,
    model,
    sections.architectureModel,
    index,
    options,
  );
  validateInterfaces(interfaces, model, index, citations);
  validateConstraints(constraints, index, citations, Boolean(model));
  validateDecisions(decisions, index, citations);
  validateTechnicalDesign(
    technicalDesign,
    interfaces,
    constraints,
    index,
    citations,
  );
  validateNativeArtifacts(nativeArtifacts);

  if (changes) {
    for (const [collectionName, expectedKind] of Object.entries(
      CHANGE_COLLECTION_KINDS,
    )) {
      for (const change of changes[collectionName]) {
        if (change.entityKind !== expectedKind) {
          fail(
            `${collectionName} contains ${change.entityKind} change ` +
              change.changeId,
          );
        }
        index.change.add(change.changeId);
        addRequirementCitation(
          citations,
          change.sourceRequirementIds,
          "change",
          change.changeId,
        );
      }
    }
    for (const change of changes.decisionChanges) {
      index.change.add(change.changeId);
      addRequirementCitation(
        citations,
        change.sourceRequirementIds,
        "change",
        change.changeId,
      );
    }
  }

  if (!partial || traceability.length > 0) {
    validateTraceability(traceability, index, citations);
  }
  return { index, decisions, sections };
}

function validateProjectArchitectureState(artifact) {
  switch (artifact.state) {
    case "greenfield-unbaselined":
      if (
        artifact.projectLifecycle !== "greenfield" ||
        artifact.repositorySnapshot ||
        artifact.currentArchitectureSnapshot ||
        artifact.architectureBaseline
      ) {
        fail("greenfield-unbaselined state contains contradictory facts");
      }
      return;
    case "existing-undiscovered":
      if (
        artifact.projectLifecycle !== "existing" ||
        !artifact.repositorySnapshot ||
        artifact.currentArchitectureSnapshot ||
        artifact.architectureBaseline
      ) {
        fail("existing-undiscovered state contains contradictory facts");
      }
      return;
    case "existing-discovered-unbaselined":
      if (
        artifact.projectLifecycle !== "existing" ||
        !artifact.repositorySnapshot ||
        !artifact.currentArchitectureSnapshot ||
        artifact.architectureBaseline
      ) {
        fail(
          "existing-discovered-unbaselined state contains contradictory facts",
        );
      }
      return;
    case "baselined":
      if (!artifact.architectureBaseline) {
        fail("baselined state omits its architecture baseline");
      }
  }
}

function validateDraft(artifact, options) {
  validateAssumptions(artifact.assumptions, "architecture draft", false);
  const result = validateSections(
    artifact.sections,
    artifact.traceability,
    options,
  );

  if (artifact.currentArchitectureSnapshot) {
    if (artifact.discoveryReconciliation.length === 0) {
      fail("existing-project draft omits discovery reconciliation");
    }
    assertUnique(
      artifact.discoveryReconciliation,
      "discovery reconciliation",
      ({ observedKind, observedId }) => `${observedKind}:${observedId}`,
    );
    for (const item of artifact.discoveryReconciliation) {
      if (item.disposition === "unresolved") {
        fail(
          `discovery reconciliation leaves ${item.observedId} unresolved`,
        );
      }
      const hasTarget = ["retained", "replaced"].includes(item.disposition);
      if (hasTarget && !item.targetId) {
        fail(
          `discovery reconciliation ${item.observedId} requires targetId`,
        );
      }
      if (!hasTarget && item.targetId) {
        fail(
          `discovery reconciliation ${item.observedId} cannot have targetId`,
        );
      }
      if (item.targetId) {
        requireKnown(
          result.index,
          item.observedKind,
          item.targetId,
          `discovery reconciliation ${item.observedId}`,
        );
      }
    }
  } else if (artifact.discoveryReconciliation.length > 0) {
    fail("greenfield draft cannot contain discovery reconciliation");
  }

  for (const decision of result.decisions?.decisions ?? []) {
    if (decision.status !== "proposed") {
      fail(`draft decision ${decision.id} must remain proposed`);
    }
  }
}

function allChanges(changes) {
  return Object.values(changes).flat();
}

function validateChangeSet(artifact, options) {
  validateAssumptions(
    artifact.assumptions,
    "architecture change set",
    false,
  );
  if (artifact.baseArchitectureDigest !== artifact.baseArchitectureBaseline.digest) {
    fail("baseArchitectureDigest does not match the exact baseline pointer");
  }

  const changes = allChanges(artifact.changes);
  assertUnique(changes, "architecture changes", ({ changeId }) => changeId);
  if (artifact.changeDisposition === "architecture-change") {
    if (changes.length === 0) {
      fail("architecture-change disposition requires a semantic change");
    }
  } else if (changes.length > 0) {
    fail("no-architecture-change disposition cannot contain changes");
  }

  const result = validateSections(
    artifact.sections,
    artifact.traceability,
    options,
    { changes: artifact.changes },
  );

  for (const [collectionName, targetKind] of Object.entries(
    CHANGE_COLLECTION_KINDS,
  )) {
    for (const change of artifact.changes[collectionName]) {
      const existsInTarget = result.index[targetKind].has(change.entityId);
      if (change.operation === "remove" && existsInTarget) {
        fail(
          `removed ${targetKind} ${change.entityId} remains in target architecture`,
        );
      }
      if (change.operation !== "remove" && !existsInTarget) {
        fail(
          `${change.operation} ${targetKind} ${change.entityId} is absent ` +
            "from target architecture",
        );
      }
    }
  }

  const decisions = new Map(
    (result.decisions?.decisions ?? []).map((decision) => [
      decision.id,
      decision,
    ]),
  );
  for (const change of artifact.changes.decisionChanges) {
    const candidateId =
      change.operation === "supersede"
        ? change.replacementDecisionId
        : change.decisionId;
    if (change.operation !== "deprecate") {
      const candidate = decisions.get(candidateId);
      if (!candidate || candidate.status !== "proposed") {
        fail(`decision change ${change.changeId} lacks a proposed MADR`);
      }
      if (
        change.operation === "supersede" &&
        !candidate.supersedesDecisionIds.includes(change.decisionId)
      ) {
        fail(
          `superseding decision ${candidate.id} does not name ` +
            change.decisionId,
        );
      }
    }
  }
}

function validateBaseline(artifact, options) {
  const result = validateSections(artifact.sections, [], options, {
    partial: true,
  });
  for (const decision of result.decisions?.decisions ?? []) {
    if (decision.status === "proposed") {
      fail(`baseline contains unapproved proposed decision ${decision.id}`);
    }
  }
}

function validateSnapshot(artifact, options) {
  validateSections(
    {
      architectureModel: artifact.architectureModel,
      diagrams: artifact.diagrams,
      interfaceIntent: artifact.interfaceIntent,
      architectureConstraints: artifact.architectureConstraints,
      decisionRecords: artifact.decisionRecords,
      nativeArtifacts: artifact.nativeArtifacts,
    },
    [],
    options,
    { partial: true },
  );
  assertUnique(artifact.gaps, "discovery gaps");
}

function validateDesignerWorkingArtifact(artifact, options) {
  validateBaseInputs(
    artifact.baseInputs,
    artifact.operation,
    artifact.projectArchitectureState,
  );
  validateAssumptions(
    artifact.assumptions,
    "designer working artifact",
    true,
  );
  validateSections(
    {
      technicalDesign: artifact.technicalDesign,
      interfaceIntent: artifact.interfaceIntent,
      architectureConstraints: artifact.architectureConstraints,
      nativeArtifacts: artifact.nativeArtifacts,
    },
    [],
    options,
    { partial: true },
  );
}

function validateModelerWorkingArtifact(artifact, options) {
  validateSections(
    {
      architectureModel: artifact.architectureModel,
      diagrams: artifact.diagrams,
      nativeArtifacts: artifact.nativeArtifacts,
    },
    [],
    options,
    { partial: true },
  );
}

function validateClarificationRequest(artifact) {
  validateBaseInputs(
    artifact.baseInputs,
    artifact.operation,
    artifact.projectArchitectureState,
  );
  assertUnique(artifact.questions, "clarification questions");
  if (!artifact.questions.some(({ blocking }) => blocking)) {
    fail("clarification request contains no blocking question");
  }
}

function validateContinuation(artifact, options) {
  validateBaseInputs(
    artifact.baseInputs,
    artifact.operation,
    artifact.projectArchitectureState,
  );
  const expectedKind =
    artifact.operation === "establish-baseline"
      ? "ArchitectureDraftPartial"
      : "ArchitectureChangeSetDraftPartial";
  if (artifact.workingPrimary.kind !== expectedKind) {
    fail(
      `continuation operation ${artifact.operation} contradicts ` +
        artifact.workingPrimary.kind,
    );
  }
  const expectedStages = STAGE_PREFIXES[artifact.activeStage];
  const actualStages = artifact.completedStages.map(({ step }) => step);
  if (
    actualStages.length !== expectedStages.length ||
    actualStages.some((stage, index) => stage !== expectedStages[index])
  ) {
    fail(
      `completedStages is not the required prefix for ${artifact.activeStage}`,
    );
  }
  validateAssumptions(
    artifact.workingPrimary.assumptions,
    "continuation",
    true,
  );
  validateSections(
    artifact.workingPrimary.sections,
    artifact.workingPrimary.traceability,
    options,
    { partial: true },
  );
}

export function validateArchitectureArtifact(artifact, options = {}) {
  if (!architectureArtifactValidator(artifact)) {
    throw new ArchitectureArtifactValidationError(
      `architecture artifact is invalid: ${validationDetail(
        architectureArtifactValidator,
      )}`,
    );
  }

  switch (artifact.kind) {
    case "ProjectArchitectureState":
      validateProjectArchitectureState(artifact);
      break;
    case "CurrentArchitectureSnapshot":
      validateSnapshot(artifact, options);
      break;
    case "ArchitectureBaseline":
      validateBaseline(artifact, options);
      break;
    case "ArchitectureDraft":
      validateDraft(artifact, options);
      break;
    case "ArchitectureChangeSetDraft":
      validateChangeSet(artifact, options);
      break;
    case "ArchitectureClarificationRequestSet":
      validateClarificationRequest(artifact);
      break;
    case "ArchitectureClarificationResponseSet":
      assertUnique(
        artifact.responses,
        "clarification responses",
        ({ questionId }) => questionId,
      );
      break;
    case "ArchitectureDesignContinuation":
      validateContinuation(artifact, options);
      break;
    case "ArchitectureDesignerWorkingArtifact":
      validateDesignerWorkingArtifact(artifact, options);
      break;
    case "ArchitectureModelerWorkingArtifact":
      validateModelerWorkingArtifact(artifact, options);
  }
  return artifact;
}

export function validateArchitectureDiscoveryHandoff({
  projectArchitectureState,
  projectArchitectureStateRef,
  currentArchitectureSnapshot,
}) {
  validateArchitectureArtifact(projectArchitectureState);
  validateArchitectureArtifact(currentArchitectureSnapshot);
  if (projectArchitectureState.state !== "existing-undiscovered") {
    fail("architecture discovery requires existing-undiscovered state");
  }
  assertPointer(
    "discovery project context",
    currentArchitectureSnapshot.projectContext,
    projectArchitectureState.projectContext,
  );
  assertPointer(
    "discovery repository snapshot",
    currentArchitectureSnapshot.repositorySnapshot,
    projectArchitectureState.repositorySnapshot,
  );
  assertPointer(
    "discovery input project state",
    currentArchitectureSnapshot.projectArchitectureState,
    projectArchitectureStateRef,
  );
  return { projectArchitectureState, currentArchitectureSnapshot };
}

function observedIds(snapshot, options) {
  const result = [];
  const content = {
    model: resolveSection(
      snapshot.architectureModel,
      "architectureModel",
      options,
    ),
    diagrams: resolveSection(snapshot.diagrams, "diagrams", options),
    interfaces: resolveSection(
      snapshot.interfaceIntent,
      "interfaceIntent",
      options,
    ),
    constraints: resolveSection(
      snapshot.architectureConstraints,
      "architectureConstraints",
      options,
    ),
    decisions: resolveSection(
      snapshot.decisionRecords,
      "decisionRecords",
      options,
    ),
  };
  for (const element of content.model?.elements ?? []) {
    result.push(`element:${element.id}`);
  }
  for (const relationship of content.model?.relationships ?? []) {
    result.push(`relationship:${relationship.id}`);
  }
  for (const view of content.diagrams?.views ?? []) {
    result.push(`view:${view.viewKey}`);
  }
  for (const intent of content.interfaces?.interfaces ?? []) {
    result.push(`interface:${intent.id}`);
  }
  for (const constraint of content.constraints?.constraints ?? []) {
    result.push(`constraint:${constraint.id}`);
  }
  for (const decision of content.decisions?.decisions ?? []) {
    result.push(`decision:${decision.id}`);
  }
  return result;
}

export function validateArchitectureDraftAgainstState({
  projectArchitectureState,
  projectArchitectureStateRef,
  architectureDraft,
  currentArchitectureSnapshot,
  options = {},
}) {
  validateArchitectureArtifact(projectArchitectureState);
  validateArchitectureArtifact(architectureDraft, options);
  if (
    ![
      "greenfield-unbaselined",
      "existing-discovered-unbaselined",
    ].includes(projectArchitectureState.state)
  ) {
    fail("establish-baseline received a non-establishable project state");
  }
  assertPointer(
    "draft project architecture state",
    architectureDraft.projectArchitectureState,
    projectArchitectureStateRef,
  );
  assertPointer(
    "draft project context",
    architectureDraft.projectContext,
    projectArchitectureState.projectContext,
  );
  assertPointer(
    "draft requirements baseline",
    architectureDraft.requirementsBaseline,
    projectArchitectureState.requirementsBaseline,
  );

  if (projectArchitectureState.state === "existing-discovered-unbaselined") {
    if (!currentArchitectureSnapshot) {
      fail("existing project draft requires the loaded discovery snapshot");
    }
    validateArchitectureArtifact(currentArchitectureSnapshot, options);
    assertPointer(
      "draft discovery snapshot",
      architectureDraft.currentArchitectureSnapshot,
      projectArchitectureState.currentArchitectureSnapshot,
    );
    assertPointer(
      "draft repository snapshot",
      architectureDraft.repositorySnapshot,
      projectArchitectureState.repositorySnapshot,
    );
    const reconciled = new Set(
      architectureDraft.discoveryReconciliation.map(
        ({ observedKind, observedId }) => `${observedKind}:${observedId}`,
      ),
    );
    for (const observed of observedIds(currentArchitectureSnapshot, options)) {
      if (!reconciled.has(observed)) {
        fail(`discovery reconciliation omits observed ${observed}`);
      }
    }
  }
  return { projectArchitectureState, architectureDraft };
}

export function validateArchitectureChangeSetAgainstState({
  projectArchitectureState,
  projectArchitectureStateRef,
  architectureChangeSet,
  options = {},
}) {
  validateArchitectureArtifact(projectArchitectureState);
  validateArchitectureArtifact(architectureChangeSet, options);
  if (projectArchitectureState.state !== "baselined") {
    fail("design-change requires baselined project state");
  }
  assertPointer(
    "change-set project architecture state",
    architectureChangeSet.projectArchitectureState,
    projectArchitectureStateRef,
  );
  assertPointer(
    "change-set architecture baseline",
    architectureChangeSet.baseArchitectureBaseline,
    projectArchitectureState.architectureBaseline,
  );
  assertPointer(
    "change-set requirements baseline",
    architectureChangeSet.targetRequirementsBaseline,
    projectArchitectureState.requirementsBaseline,
  );
  assertPointer(
    "change-set project context",
    architectureChangeSet.projectContext,
    projectArchitectureState.projectContext,
  );
  return { projectArchitectureState, architectureChangeSet };
}


function architectureEntityMaps(sections, options) {
  const model = resolveSection(
    sections.architectureModel,
    "architectureModel",
    options,
  );
  const diagrams = resolveSection(sections.diagrams, "diagrams", options);
  const interfaces = resolveSection(
    sections.interfaceIntent,
    "interfaceIntent",
    options,
  );
  const constraints = resolveSection(
    sections.architectureConstraints,
    "architectureConstraints",
    options,
  );
  const decisions = resolveSection(
    sections.decisionRecords,
    "decisionRecords",
    options,
  );
  return {
    element: model
      ? new Map(model.elements.map((entity) => [entity.id, entity]))
      : undefined,
    relationship: model
      ? new Map(model.relationships.map((entity) => [entity.id, entity]))
      : undefined,
    view: diagrams
      ? new Map(diagrams.views.map((entity) => [entity.viewKey, entity]))
      : undefined,
    interface: interfaces
      ? new Map(interfaces.interfaces.map((entity) => [entity.id, entity]))
      : undefined,
    constraint: constraints
      ? new Map(constraints.constraints.map((entity) => [entity.id, entity]))
      : undefined,
    decision: decisions
      ? new Map(decisions.decisions.map((entity) => [entity.id, entity]))
      : undefined,
  };
}

function requireResolvedEntityMap(maps, kind, label) {
  const map = maps[kind];
  if (!map) {
    fail(`${label} requires resolved ${kind} content`);
  }
  return map;
}

function assertEntityDigest(label, entity, expectedDigest) {
  if (canonicalJsonDigest(entity) !== expectedDigest) {
    fail(`${label} does not match its declared canonical digest`);
  }
}

export function validateArchitectureChangeSetAgainstBaseline({
  architectureBaseline,
  architectureBaselineRef,
  architectureChangeSet,
  options = {},
}) {
  validateArchitectureArtifact(architectureBaseline, options);
  validateArchitectureArtifact(architectureChangeSet, options);
  assertPointer(
    "change-set architecture baseline",
    architectureChangeSet.baseArchitectureBaseline,
    architectureBaselineRef,
  );

  if (architectureChangeSet.changeDisposition === "no-architecture-change") {
    for (const sectionName of Object.keys(SECTION_IDS)) {
      const baselineDigest = sectionDigest(
        architectureBaseline.sections[sectionName],
        sectionName,
        options,
      );
      const targetDigest = sectionDigest(
        architectureChangeSet.sections[sectionName],
        sectionName,
        options,
      );
      if (baselineDigest !== targetDigest) {
        fail(
          `no-architecture-change target diverges in section ${sectionName}`,
        );
      }
    }
    return { architectureBaseline, architectureChangeSet };
  }

  const baseMaps = architectureEntityMaps(
    architectureBaseline.sections,
    options,
  );
  const targetMaps = architectureEntityMaps(
    architectureChangeSet.sections,
    options,
  );
  for (const [collectionName, kind] of Object.entries(
    CHANGE_COLLECTION_KINDS,
  )) {
    const base = requireResolvedEntityMap(
      baseMaps,
      kind,
      "change-set baseline verification",
    );
    const target = requireResolvedEntityMap(
      targetMaps,
      kind,
      "change-set target verification",
    );
    for (const change of architectureChangeSet.changes[collectionName]) {
      const before = base.get(change.entityId);
      const after = target.get(change.entityId);
      if (change.operation === "add") {
        if (before || !after) {
          fail(`add change ${change.changeId} has contradictory entity state`);
        }
        assertEntityDigest(
          `add change ${change.changeId} target`,
          after,
          change.targetDigest,
        );
      } else if (change.operation === "modify") {
        if (!before || !after) {
          fail(
            `modify change ${change.changeId} requires base and target entities`,
          );
        }
        assertEntityDigest(
          `modify change ${change.changeId} base`,
          before,
          change.expectedBaseDigest,
        );
        assertEntityDigest(
          `modify change ${change.changeId} target`,
          after,
          change.targetDigest,
        );
        if (change.expectedBaseDigest === change.targetDigest) {
          fail(`modify change ${change.changeId} does not change content`);
        }
      } else {
        if (!before || after) {
          fail(
            `remove change ${change.changeId} has contradictory entity state`,
          );
        }
        assertEntityDigest(
          `remove change ${change.changeId} base`,
          before,
          change.expectedBaseDigest,
        );
      }
    }
  }

  const baseDecisions = requireResolvedEntityMap(
    baseMaps,
    "decision",
    "decision change verification",
  );
  const targetDecisions = requireResolvedEntityMap(
    targetMaps,
    "decision",
    "decision change verification",
  );
  for (const change of architectureChangeSet.changes.decisionChanges) {
    if (change.operation === "add") {
      if (
        baseDecisions.has(change.decisionId) ||
        targetDecisions.get(change.decisionId)?.status !== "proposed"
      ) {
        fail(`decision add ${change.changeId} is not a new proposed MADR`);
      }
      continue;
    }
    const baseDecision = baseDecisions.get(change.decisionId);
    if (!baseDecision) {
      fail(`decision change ${change.changeId} references unknown base MADR`);
    }
    assertEntityDigest(
      `decision change ${change.changeId} base`,
      baseDecision,
      change.expectedBaseDigest,
    );
    if (change.operation === "supersede") {
      const replacement = targetDecisions.get(
        change.replacementDecisionId,
      );
      if (
        replacement?.status !== "proposed" ||
        !replacement.supersedesDecisionIds.includes(change.decisionId)
      ) {
        fail(
          `decision change ${change.changeId} lacks its proposed replacement`,
        );
      }
    }
  }
  return { architectureBaseline, architectureChangeSet };
}

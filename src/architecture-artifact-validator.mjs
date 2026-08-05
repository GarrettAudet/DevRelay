import { readFileSync } from "node:fs";

import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { normativeRequirementIds } from "./requirements-artifact-validator.mjs";
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

const SECTION_ARTIFACT_CONTRACTS = Object.freeze({
  technicalDesign: Object.freeze({
    schema: "https://devrelay.dev/artifacts/technical-design/v1",
    mediaType: "application/vnd.devrelay.technical-design+json",
  }),
  architectureModel: Object.freeze({
    schema: "https://devrelay.dev/artifacts/architecture-model/v1",
    mediaType: "application/vnd.devrelay.architecture-model+json",
  }),
  diagrams: Object.freeze({
    schema: "https://devrelay.dev/artifacts/architecture-diagram-set/v1",
    mediaType: "application/vnd.devrelay.architecture-diagram-set+json",
  }),
  interfaceIntent: Object.freeze({
    schema: "https://devrelay.dev/artifacts/interface-intent-set/v1",
    mediaType: "application/vnd.devrelay.interface-intent-set+json",
  }),
  architectureConstraints: Object.freeze({
    schema: "https://devrelay.dev/artifacts/architecture-constraint-set/v1",
    mediaType: "application/vnd.devrelay.architecture-constraint-set+json",
  }),
  decisionRecords: Object.freeze({
    schema: "https://devrelay.dev/artifacts/architecture-decision-record-set/v1",
    mediaType: "application/vnd.devrelay.architecture-decision-record-set+json",
  }),
  nativeArtifacts: Object.freeze({
    schema: "https://devrelay.dev/artifacts/native-artifact-set/v1",
    mediaType: "application/vnd.devrelay.native-artifact-set+json",
  }),
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
    "project-overview-baseline",
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

function decodeAttachedRecord(record, section, name) {
  if (
    !record ||
    typeof record !== "object" ||
    !samePointer(record.ref, section.artifact) ||
    (!Buffer.isBuffer(record.bytes) && !(record.bytes instanceof Uint8Array))
  ) {
    fail(`attached ${name} did not resolve to its verified artifact record`);
  }
  const contract = SECTION_ARTIFACT_CONTRACTS[name];
  if (
    record.ref.schema !== contract.schema ||
    record.ref.mediaType !== contract.mediaType
  ) {
    fail(`attached ${name} uses the wrong schema or media type`);
  }
  const bytes = Buffer.from(record.bytes);
  if (sha256Digest(bytes) !== section.artifact.digest) {
    fail(`attached ${name} bytes do not match its digest`);
  }
  let parsed;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes),
    );
  } catch (error) {
    fail(`attached ${name} is not valid UTF-8 JSON: ${error.message}`);
  }
  if (canonicalJsonDigest(parsed) !== canonicalJsonDigest(record.value)) {
    fail(`attached ${name} verified value does not match its raw bytes`);
  }
  return parsed;
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

  const content = decodeAttachedRecord(
    options.resolveAttached(section.artifact),
    section,
    name,
  );
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

/**
 * Resolve the architecture model through the same content-addressed section
 * verification used by the ArchitectureDesign validator. Callers that accept
 * attached sections must supply an exact verified artifact record through
 * resolveAttached; this function never performs host I/O or consults ambient
 * process state.
 */
export function resolveVerifiedArchitectureModelContent(
  architectureArtifact,
  options = {},
) {
  const section = architectureArtifact?.sections?.architectureModel;
  if (!section) {
    fail("architecture artifact has no architectureModel section");
  }
  const content = resolveSection(section, "architectureModel", options);
  if (content === undefined) {
    fail("attached architectureModel requires its exact artifact record");
  }
  return content;
}

function sectionIdentity(section, name, options) {
  const content = resolveSection(section, name, options);
  return content?.[SECTION_IDS[name]] ?? section?.contentId;
}

function sectionDigest(section, name, options) {
  if (section?.mode === "attached") {
    resolveSection(section, name, options);
    return section.artifact.digest;
  }
  const content = resolveSection(section, name, options);
  return content ? canonicalJsonDigest(content) : undefined;
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

function validateConstraints(
  constraints,
  index,
  citations,
  resolvedKinds,
) {
  if (!constraints) {
    return;
  }
  assertUnique(constraints.constraints, "architecture constraints");
  for (const constraint of constraints.constraints) {
    index.constraint.add(constraint.id);
    for (const target of constraint.appliesTo) {
      requireKnown(
        index,
        target.kind,
        target.id,
        `constraint ${constraint.id}`,
        resolvedKinds[target.kind] === true,
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

function validateDecisions(
  decisions,
  index,
  citations,
  resolvedKinds,
) {
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
      requireKnown(
        index,
        target.kind,
        target.id,
        `decision ${decision.id}`,
        resolvedKinds[target.kind] === true,
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

function nativeSectionEntityIds(sectionName, content) {
  if (!content) {
    return undefined;
  }
  const ids = new Set([content[SECTION_IDS[sectionName]]]);
  const collections = {
    architectureModel: ["elements", "relationships"],
    diagrams: ["views"],
    interfaceIntent: ["interfaces"],
    architectureConstraints: ["constraints"],
    decisionRecords: ["decisions"],
    nativeArtifacts: ["entries"],
  };
  for (const collection of collections[sectionName] ?? []) {
    for (const entity of content[collection] ?? []) {
      ids.add(entity.id ?? entity.viewKey);
    }
  }
  return ids;
}

function mappingPointerMatchesSection(pointer, sectionName) {
  return (
    pointer === `/${sectionName}` ||
    pointer.startsWith(`/${sectionName}/`) ||
    pointer === `/sections/${sectionName}` ||
    pointer.startsWith(`/sections/${sectionName}/`)
  );
}

function decodeJsonPointerToken(token) {
  let decoded = "";
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character !== "~") {
      decoded += character;
      continue;
    }
    const escape = token[index + 1];
    if (escape === "0") {
      decoded += "~";
    } else if (escape === "1") {
      decoded += "/";
    } else {
      return undefined;
    }
    index += 1;
  }
  return decoded;
}

function jsonPointerResolves(rootValue, pointer) {
  if (pointer === "") {
    return true;
  }
  if (!pointer.startsWith("/")) {
    return false;
  }
  let current = rootValue;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = decodeJsonPointerToken(rawToken);
    if (
      token === undefined ||
      current === null ||
      typeof current !== "object"
    ) {
      return false;
    }
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        return false;
      }
      const index = Number(token);
      if (index >= current.length) {
        return false;
      }
      current = current[index];
    } else {
      if (!Object.hasOwn(current, token)) {
        return false;
      }
      current = current[token];
    }
  }
  return true;
}

function validateNativeArtifacts(
  nativeArtifacts,
  resolvedSections,
  declaredSections,
) {
  if (!nativeArtifacts) {
    return;
  }
  assertUnique(nativeArtifacts.entries, "native artifacts");
  assertUnique(
    nativeArtifacts.entries,
    "native artifact logical identities",
    ({ artifact }) => `${artifact.artifactId}:${artifact.digest}`,
  );
  const idsBySection = new Map(
    Object.entries(resolvedSections).map(([name, content]) => [
      name,
      nativeSectionEntityIds(name, content),
    ]),
  );
  const pointerRoot = {
    ...resolvedSections,
    sections: resolvedSections,
  };
  for (const entry of nativeArtifacts.entries) {
    if (
      entry.disposition === "generated" &&
      entry.canonicalMappings.length === 0
    ) {
      fail(
        `generated native artifact ${entry.id} has no canonical mapping`,
      );
    }
    if (
      entry.disposition === "unmapped" &&
      (entry.canonicalMappings.length > 0 || entry.warnings.length === 0)
    ) {
      fail(
        `unmapped native artifact ${entry.id} must have no mappings and an explanatory warning`,
      );
    }
    for (const mapping of entry.canonicalMappings) {
      const known = idsBySection.get(mapping.section);
      if (!declaredSections[mapping.section]) {
        fail(
          `native artifact ${entry.id} maps absent section ${mapping.section}`,
        );
      }
      if (known) {
        for (const entityId of mapping.entityIds) {
          if (!known.has(entityId)) {
            fail(
              `native artifact ${entry.id} maps unknown ${mapping.section} entity ${entityId}`,
            );
          }
        }
      }
      for (const pointer of mapping.jsonPointers) {
        if (
          !mappingPointerMatchesSection(pointer, mapping.section) ||
          (known && !jsonPointerResolves(pointerRoot, pointer))
        ) {
          fail(
            `native artifact ${entry.id} has invalid ${mapping.section} JSON pointer ${pointer}`,
          );
        }
      }
    }
  }
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

function validateTraceability(
  traceability,
  index,
  citations,
  approvedRequirementIds,
  resolvedTargetKinds,
  { allowHistoricalCitations = false } = {},
) {
  assertUnique(
    traceability,
    "traceability",
    ({ requirementId }) => requirementId,
  );
  const byRequirement = new Map(
    traceability.map((entry) => [entry.requirementId, entry]),
  );
  if (approvedRequirementIds) {
    for (const requirementId of byRequirement.keys()) {
      if (!approvedRequirementIds.has(requirementId)) {
        fail(`traceability references unapproved requirement ${requirementId}`);
      }
    }
    for (const requirementId of approvedRequirementIds) {
      if (!byRequirement.has(requirementId)) {
        fail(`traceability omits approved requirement ${requirementId}`);
      }
    }
    for (const requirementId of citations.keys()) {
      if (
        !approvedRequirementIds.has(requirementId) &&
        !allowHistoricalCitations
      ) {
        fail(`architecture cites unapproved requirement ${requirementId}`);
      }
    }
  }

  for (const entry of traceability) {
    const targets = assertUnique(
      entry.targets,
      `traceability ${entry.requirementId} targets`,
      ({ kind, id }) => `${kind}:${id}`,
    );
    const citedTargets = citations.get(entry.requirementId) ?? new Set();
    for (const target of entry.targets) {
      requireKnown(
        index,
        target.kind,
        target.id,
        `traceability ${entry.requirementId}`,
      );
      const key = `${target.kind}:${target.id}`;
      if (
        entry.disposition === "designed" &&
        resolvedTargetKinds[target.kind] === true &&
        !citedTargets.has(key)
      ) {
        fail(
          `traceability ${entry.requirementId} declares target ${key} without a matching sourceRequirementIds citation`,
        );
      }
    }
    if (entry.disposition === "no-architecture-impact" && targets.size > 0) {
      fail(
        `traceability ${entry.requirementId} has targets despite no impact`,
      );
    }
    if (
      entry.disposition === "already-designed" &&
      targets.size === 0
    ) {
      fail(
        `traceability ${entry.requirementId} has no baseline target despite already-designed disposition`,
      );
    }
  }

  for (const [requirementId, citedTargets] of citations) {
    if (
      allowHistoricalCitations &&
      !byRequirement.has(requirementId) &&
      (!approvedRequirementIds ||
        !approvedRequirementIds.has(requirementId))
    ) {
      continue;
    }
    const trace = byRequirement.get(requirementId);
    if (!trace) {
      fail(
        `requirement ${requirementId} is cited without traceability`,
      );
    }
    if (trace.disposition !== "designed") {
      fail(
        `requirement ${requirementId} is cited but marked ${trace.disposition}`,
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
  { partial = false, changes, approvedRequirementIds } = {},
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
  validateConstraints(constraints, index, citations, {
    element: Boolean(model),
    relationship: Boolean(model),
    interface: Boolean(interfaces),
  });
  validateDecisions(decisions, index, citations, {
    element: Boolean(model),
    view: Boolean(diagrams),
    interface: Boolean(interfaces),
    constraint: Boolean(constraints),
  });
  validateTechnicalDesign(
    technicalDesign,
    interfaces,
    constraints,
    index,
    citations,
  );
  validateNativeArtifacts(nativeArtifacts, {
    technicalDesign,
    architectureModel: model,
    diagrams,
    interfaceIntent: interfaces,
    architectureConstraints: constraints,
    decisionRecords: decisions,
    nativeArtifacts,
  }, sections);

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
        if (approvedRequirementIds) {
          for (const requirementId of change.sourceRequirementIds) {
            if (!approvedRequirementIds.has(requirementId)) {
              fail(
                `change ${change.changeId} cites unapproved requirement ${requirementId}`,
              );
            }
          }
        }
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
      if (approvedRequirementIds) {
        for (const requirementId of change.sourceRequirementIds) {
          if (!approvedRequirementIds.has(requirementId)) {
            fail(
              `change ${change.changeId} cites unapproved requirement ${requirementId}`,
            );
          }
        }
      }
      addRequirementCitation(
        citations,
        change.sourceRequirementIds,
        "change",
        change.changeId,
      );
    }
  }

  if (!partial || traceability.length > 0) {
    validateTraceability(
      traceability,
      index,
      citations,
      approvedRequirementIds,
      {
        "technical-design": Boolean(technicalDesign),
        element: Boolean(model),
        relationship: Boolean(model),
        view: Boolean(diagrams),
        interface: Boolean(interfaces),
        constraint: Boolean(constraints),
        decision: Boolean(decisions),
        change: Boolean(changes),
      },
      {
        allowHistoricalCitations: Boolean(changes),
      },
    );
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
    case "baselined": {
      const repositoryRequired = artifact.projectLifecycle === "existing";
      if (
        !artifact.architectureBaseline ||
        Boolean(artifact.repositorySnapshot) !== repositoryRequired
      ) {
        fail("baselined state contains contradictory lifecycle facts");
      }
      return;
    }
  }
}

function validateDraft(artifact, options) {
  validateAssumptions(artifact.assumptions, "architecture draft", false);
  const result = validateSections(
    artifact.sections,
    artifact.traceability,
    options,
    {
      approvedRequirementIds: options.approvedRequirementIds,
    },
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
    {
      changes: artifact.changes,
      approvedRequirementIds: options.approvedRequirementIds,
    },
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
  repositorySnapshot,
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
  if (
    !repositorySnapshot ||
    currentArchitectureSnapshot.repositoryRevision.revision !==
      repositorySnapshot.revision ||
    currentArchitectureSnapshot.repositoryRevision.treeDigest !==
      repositorySnapshot.treeDigest
  ) {
    fail("discovery snapshot repository revision does not match its source");
  }
  return {
    projectArchitectureState,
    repositorySnapshot,
    currentArchitectureSnapshot,
  };
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
  requirementsBaseline,
  architectureDraft,
  currentArchitectureSnapshot,
  options = {},
}) {
  const requirementIds = new Set(
    normativeRequirementIds(requirementsBaseline.requirements),
  );
  const candidateOptions = {
    ...options,
    approvedRequirementIds: requirementIds,
  };
  validateArchitectureArtifact(projectArchitectureState);
  validateArchitectureArtifact(architectureDraft, candidateOptions);
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
  assertPointer(
    "draft project overview baseline",
    architectureDraft.projectOverviewBaseline,
    projectArchitectureState.projectOverviewBaseline,
  );

  if (projectArchitectureState.state === "greenfield-unbaselined") {
    if (
      architectureDraft.repositorySnapshot ||
      architectureDraft.currentArchitectureSnapshot
    ) {
      fail("greenfield draft cannot claim repository or discovery provenance");
    }
  }

  if (projectArchitectureState.state === "existing-discovered-unbaselined") {
    if (!currentArchitectureSnapshot) {
      fail("existing project draft requires the loaded discovery snapshot");
    }
    validateArchitectureArtifact(currentArchitectureSnapshot, options);
    const blockingGap = currentArchitectureSnapshot.gaps.find(
      ({ blocking }) => blocking,
    );
    if (blockingGap) {
      fail(
        `discovery snapshot retains blocking gap ${blockingGap.id}; clarification is required`,
      );
    }
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
    const observed = new Set(
      observedIds(currentArchitectureSnapshot, options),
    );
    for (const observedId of observed) {
      if (!reconciled.has(observedId)) {
        fail(`discovery reconciliation omits observed ${observedId}`);
      }
    }
    for (const reconciledId of reconciled) {
      if (!observed.has(reconciledId)) {
        fail(
          `discovery reconciliation includes unobserved ${reconciledId}`,
        );
      }
    }
  }
  return { projectArchitectureState, architectureDraft };
}

export function validateArchitectureChangeSetAgainstState({
  projectArchitectureState,
  projectArchitectureStateRef,
  requirementsBaseline,
  architectureChangeSet,
  options = {},
}) {
  const requirementIds = new Set(
    normativeRequirementIds(requirementsBaseline.requirements),
  );
  const candidateOptions = {
    ...options,
    approvedRequirementIds: requirementIds,
  };
  validateArchitectureArtifact(projectArchitectureState);
  validateArchitectureArtifact(architectureChangeSet, candidateOptions);
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
    "change-set project overview baseline",
    architectureChangeSet.targetProjectOverviewBaseline,
    projectArchitectureState.projectOverviewBaseline,
  );
  assertPointer(
    "change-set project context",
    architectureChangeSet.projectContext,
    projectArchitectureState.projectContext,
  );
  const stateRepository = projectArchitectureState.repositorySnapshot;
  const candidateRepository = architectureChangeSet.repositorySnapshot;
  if (Boolean(stateRepository) !== Boolean(candidateRepository)) {
    fail("change-set repository provenance presence does not match project state");
  }
  if (stateRepository) {
    assertPointer(
      "change-set repository snapshot",
      candidateRepository,
      stateRepository,
    );
  }
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

function expectedEntityDifferences(base, target) {
  const expected = new Map();
  for (const id of new Set([...base.keys(), ...target.keys()])) {
    const before = base.get(id);
    const after = target.get(id);
    if (!before) {
      expected.set(id, "add");
    } else if (!after) {
      expected.set(id, "remove");
    } else if (canonicalJsonDigest(before) !== canonicalJsonDigest(after)) {
      expected.set(id, "modify");
    }
  }
  return expected;
}

function validateExhaustiveEntityChanges(
  collectionName,
  kind,
  changes,
  base,
  target,
) {
  const byEntity = new Map();
  for (const change of changes) {
    if (byEntity.has(change.entityId)) {
      fail(
        `${collectionName} repeats ${kind} ${change.entityId}`,
      );
    }
    byEntity.set(change.entityId, change);
  }
  const expected = expectedEntityDifferences(base, target);
  for (const [entityId, operation] of expected) {
    const declared = byEntity.get(entityId);
    if (!declared) {
      fail(
        `${collectionName} omits ${operation} for changed ${kind} ${entityId}`,
      );
    }
    if (declared.operation !== operation) {
      fail(
        `${collectionName} declares ${declared.operation} for ${kind} ${entityId}; expected ${operation}`,
      );
    }
  }
  for (const entityId of byEntity.keys()) {
    if (!expected.has(entityId)) {
      fail(`${collectionName} declares unchanged ${kind} ${entityId}`);
    }
  }
}

function consumeDecisionDifference(expected, decisionId, operation, label) {
  if (expected.get(decisionId) !== operation) {
    fail(`${label} does not match the ${operation} decision delta`);
  }
  expected.delete(decisionId);
}

const BASELINE_REUSABLE_TARGET_KINDS = Object.freeze([
  "element",
  "relationship",
  "interface",
  "constraint",
  "decision",
]);

function validateBaselineRequirementReuse({
  baseMaps,
  targetMaps,
  architectureChangeSet,
  approvedRequirementIds,
}) {
  if (!approvedRequirementIds) {
    return;
  }

  for (const kind of BASELINE_REUSABLE_TARGET_KINDS) {
    const base = requireResolvedEntityMap(
      baseMaps,
      kind,
      "historical requirement citation verification",
    );
    const target = requireResolvedEntityMap(
      targetMaps,
      kind,
      "historical requirement citation verification",
    );
    for (const [entityId, entity] of target) {
      const historicalIds = (entity.sourceRequirementIds ?? []).filter(
        (requirementId) => !approvedRequirementIds.has(requirementId),
      );
      if (historicalIds.length === 0) {
        continue;
      }
      const baselineEntity = base.get(entityId);
      if (
        !baselineEntity ||
        canonicalJsonDigest(baselineEntity) !== canonicalJsonDigest(entity)
      ) {
        fail(
          `${kind} ${entityId} changes while retaining historical requirement citation ${historicalIds[0]}`,
        );
      }
    }
  }

  for (const entry of architectureChangeSet.traceability) {
    if (entry.disposition !== "already-designed") {
      continue;
    }
    for (const targetRef of entry.targets) {
      if (!BASELINE_REUSABLE_TARGET_KINDS.includes(targetRef.kind)) {
        fail(
          `already-designed traceability ${entry.requirementId} targets non-reusable ${targetRef.kind}:${targetRef.id}`,
        );
      }
      const before = baseMaps[targetRef.kind]?.get(targetRef.id);
      const after = targetMaps[targetRef.kind]?.get(targetRef.id);
      if (
        !before ||
        !after ||
        canonicalJsonDigest(before) !== canonicalJsonDigest(after)
      ) {
        fail(
          `already-designed traceability ${entry.requirementId} does not target an unchanged baseline entity ${targetRef.kind}:${targetRef.id}`,
        );
      }
    }
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
  validateBaselineRequirementReuse({
    baseMaps,
    targetMaps,
    architectureChangeSet,
    approvedRequirementIds: options.approvedRequirementIds,
  });
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
    const declaredChanges =
      architectureChangeSet.changes[collectionName];
    for (const change of declaredChanges) {
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
    validateExhaustiveEntityChanges(
      collectionName,
      kind,
      declaredChanges,
      base,
      target,
    );
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
  const expectedDecisionChanges = expectedEntityDifferences(
    baseDecisions,
    targetDecisions,
  );
  const changedDecisionIds = new Set();
  for (const change of architectureChangeSet.changes.decisionChanges) {
    if (changedDecisionIds.has(change.decisionId)) {
      fail(`decision changes repeat ${change.decisionId}`);
    }
    changedDecisionIds.add(change.decisionId);
    if (change.operation === "add") {
      if (
        baseDecisions.has(change.decisionId) ||
        targetDecisions.get(change.decisionId)?.status !== "proposed"
      ) {
        fail(`decision add ${change.changeId} is not a new proposed MADR`);
      }
      consumeDecisionDifference(
        expectedDecisionChanges,
        change.decisionId,
        "add",
        `decision add ${change.changeId}`,
      );
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
      const superseded = targetDecisions.get(change.decisionId);
      if (
        superseded?.status !== "superseded" ||
        replacement?.status !== "proposed" ||
        baseDecisions.has(change.replacementDecisionId) ||
        !replacement.supersedesDecisionIds.includes(change.decisionId)
      ) {
        fail(
          `decision change ${change.changeId} lacks its superseded source and proposed replacement`,
        );
      }
      consumeDecisionDifference(
        expectedDecisionChanges,
        change.decisionId,
        "modify",
        `decision supersede ${change.changeId}`,
      );
      consumeDecisionDifference(
        expectedDecisionChanges,
        change.replacementDecisionId,
        "add",
        `decision supersede ${change.changeId}`,
      );
    } else {
      if (targetDecisions.get(change.decisionId)?.status !== "deprecated") {
        fail(
          `decision deprecate ${change.changeId} does not produce a deprecated MADR`,
        );
      }
      consumeDecisionDifference(
        expectedDecisionChanges,
        change.decisionId,
        "modify",
        `decision deprecate ${change.changeId}`,
      );
    }
  }
  if (expectedDecisionChanges.size > 0) {
    const [decisionId, operation] = expectedDecisionChanges.entries().next()
      .value;
    fail(`decision changes omit ${operation} for ${decisionId}`);
  }
  return { architectureBaseline, architectureChangeSet };
}

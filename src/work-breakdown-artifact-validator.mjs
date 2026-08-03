import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { resolveVerifiedArchitectureModelContent } from "./architecture-artifact-validator.mjs";
import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

const CONTRACT_URI =
  "https://devrelay.dev/contracts/work-breakdown-artifacts.schema.json";
const artifactValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/work-breakdown-artifacts.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export const WORK_BREAKDOWN_ARTIFACT_CONTRACTS = Object.freeze({
  ProjectWorkBreakdownState: Object.freeze({
    schema: "https://devrelay.dev/artifacts/project-work-breakdown-state/v1",
    mediaType: "application/vnd.devrelay.project-work-breakdown-state+json",
  }),
  ContractDisposition: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-disposition/v1",
    mediaType: "application/vnd.devrelay.contract-disposition+json",
  }),
  ApprovedNotApplicable: Object.freeze({
    schema: "https://devrelay.dev/artifacts/approved-not-applicable/v1",
    mediaType: "application/vnd.devrelay.approved-not-applicable+json",
  }),
  CapabilityCatalog: Object.freeze({
    schema: "https://devrelay.dev/artifacts/capability-catalog/v1",
    mediaType: "application/vnd.devrelay.capability-catalog+json",
  }),
  ApprovedChangePackage: Object.freeze({
    schema: "https://devrelay.dev/artifacts/approved-change-package/v1",
    mediaType: "application/vnd.devrelay.approved-change-package+json",
  }),
  WorkBreakdownDraft: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-breakdown-draft/v1",
    mediaType: "application/vnd.devrelay.work-breakdown-draft+json",
  }),
  WorkBreakdownChangeSetDraft: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-breakdown-change-set-draft/v1",
    mediaType:
      "application/vnd.devrelay.work-breakdown-change-set-draft+json",
  }),
  WorkBreakdownBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
    mediaType: "application/vnd.devrelay.work-breakdown-baseline+json",
  }),
  WorkBreakdownClarificationRequestSet: Object.freeze({
    schema:
      "https://devrelay.dev/artifacts/work-breakdown-clarification-request-set/v1",
    mediaType:
      "application/vnd.devrelay.work-breakdown-clarification-request-set+json",
  }),
  WorkBreakdownClarificationResponseSet: Object.freeze({
    schema:
      "https://devrelay.dev/artifacts/work-breakdown-clarification-response-set/v1",
    mediaType:
      "application/vnd.devrelay.work-breakdown-clarification-response-set+json",
  }),
  WorkBreakdownContinuation: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-breakdown-continuation/v1",
    mediaType: "application/vnd.devrelay.work-breakdown-continuation+json",
  }),
  WorkBreakdownRevisionRequest: Object.freeze({
    schema:
      "https://devrelay.dev/artifacts/work-breakdown-revision-request/v1",
    mediaType:
      "application/vnd.devrelay.work-breakdown-revision-request+json",
  }),
});

export const WORK_BREAKDOWN_ARTIFACT_SCHEMAS = Object.freeze(
  Object.values(WORK_BREAKDOWN_ARTIFACT_CONTRACTS).map(({ schema }) => schema),
);

const REPOSITORY_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
  mediaType: "application/vnd.devrelay.repository-snapshot+json",
});

const INPUT_BINDING_PROPERTIES = Object.freeze({
  "requirements-baseline": "requirementsBaseline",
  "project-overview-baseline": "projectOverviewBaseline",
  "architecture-baseline": "architectureBaseline",
  "contract-disposition": "contractDisposition",
  "repository-context": "repositoryContext",
  "current-repository-snapshot": "currentRepositorySnapshot",
  "capability-catalog": "capabilityCatalog",
  "current-work-breakdown-baseline": "currentWorkBreakdownBaseline",
  "approved-change-package": "approvedChangePackage",
});

const COMMON_INPUTS = Object.freeze([
  "project-work-breakdown-state",
  "requirements-baseline",
  "project-overview-baseline",
  "architecture-baseline",
  "contract-disposition",
  "capability-catalog",
]);

const OPERATION_INPUTS = Object.freeze({
  "establish-breakdown": Object.freeze([
    ...COMMON_INPUTS,
    "repository-context",
  ]),
  "decompose-change": Object.freeze([
    ...COMMON_INPUTS,
    "current-repository-snapshot",
    "current-work-breakdown-baseline",
    "approved-change-package",
  ]),
});

const CONTROL_INPUTS = Object.freeze([
  "clarification-request",
  "clarification-responses",
  "continuation",
  "revision-request",
]);

export class WorkBreakdownArtifactValidationError extends Error {
  constructor(message) {
    super(`work-breakdown artifact is invalid: ${message}`);
    this.name = "WorkBreakdownArtifactValidationError";
    this.code = "DR2600";
  }
}

function fail(message) {
  throw new WorkBreakdownArtifactValidationError(message);
}

function immutableCopy(value) {
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function refKey(ref) {
  return [
    ref?.artifactId,
    ref?.schema,
    ref?.mediaType,
    ref?.digest,
  ].join("\u0000");
}

export function sameWorkBreakdownArtifactRef(left, right) {
  return refKey(left) === refKey(right);
}

function assertRef(label, actual, expected) {
  if (!sameWorkBreakdownArtifactRef(actual, expected)) {
    fail(`${label} does not match the exact content-addressed artifact`);
  }
}

function uniqueBy(values, keyOf, label) {
  const seen = new Set();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) fail(`${label} contains duplicate ${key}`);
    seen.add(key);
  }
  return seen;
}

function stableId(value) {
  switch (value?.kind) {
    case "ProjectWorkBreakdownState":
      return value.stateId;
    case "ContractDisposition":
      return value.dispositionId;
    case "ApprovedNotApplicable":
      return value.approvalId;
    case "CapabilityCatalog":
      return value.catalogId;
    case "ApprovedChangePackage":
      return value.packageId;
    case "WorkBreakdownDraft":
      return value.draftId;
    case "WorkBreakdownChangeSetDraft":
      return value.changeSetId;
    case "WorkBreakdownBaseline":
      return value.baselineId;
    case "WorkBreakdownClarificationRequestSet":
      return value.requestSetId;
    case "WorkBreakdownClarificationResponseSet":
      return value.responseSetId;
    case "WorkBreakdownContinuation":
      return value.continuationId;
    case "WorkBreakdownRevisionRequest":
      return value.revisionRequestId;
    default:
      return undefined;
  }
}

function assertContextRef(value, context) {
  if (context?.ref === undefined) return;
  const contract = WORK_BREAKDOWN_ARTIFACT_CONTRACTS[value.kind];
  if (!contract) fail(`kind ${value.kind} has no published artifact contract`);
  if (
    context.ref.schema !== contract.schema ||
    context.ref.mediaType !== contract.mediaType
  ) {
    fail(
      `${value.kind} ref must pair schema ${contract.schema} with media type ${contract.mediaType}`,
    );
  }
  if (context.ref.artifactId !== stableId(value)) {
    fail(`${value.kind} ref does not identify its stable artifact ID`);
  }
}

function validateInputBindings(bindings, label) {
  uniqueBy(bindings, ({ role }) => role, `${label} input bindings`);
}

function validateWorkItem(item, label) {
  uniqueBy(item.deliverables, ({ id }) => id, `${label} deliverables`);
  uniqueBy(
    item["verification-plan"].checks,
    ({ id }) => id,
    `${label} verification checks`,
  );
  uniqueBy(
    item["dependency-hints"],
    (hint) => `${hint["work-item-ref"]}\u0000${hint.relation}`,
    `${label} dependency hints`,
  );
  if (
    item["acceptance-criterion-refs"].length === 0 &&
    item["architecture-refs"].length === 0 &&
    item["contract-refs"].length === 0
  ) {
    fail(`${label} must reference at least one authorized scope item`);
  }
  uniqueBy(
    item["source-refs"],
    (source) => `${source.role}\u0000${refKey(source.artifact)}\u0000${source.jsonPointer}`,
    `${label} source refs`,
  );
}

function validateCandidateLocal(candidate) {
  validateInputBindings(candidate.inputBindings, candidate.kind);
  uniqueBy(
    candidate.coverageDispositions,
    (entry) => `${entry.scopeKind}\u0000${entry.scopeRef}`,
    `${candidate.kind} coverage dispositions`,
  );
  uniqueBy(
    candidate.sourceRefs,
    (source) => `${source.role}\u0000${refKey(source.artifact)}\u0000${source.jsonPointer}`,
    `${candidate.kind} source refs`,
  );
  uniqueBy(
    candidate.nativeArtifacts,
    refKey,
    `${candidate.kind} native artifacts`,
  );
  if (candidate.kind === "WorkBreakdownDraft") {
    uniqueBy(candidate.workItems, ({ id }) => id, "work items");
    for (const item of candidate.workItems) {
      validateWorkItem(item, `work item ${item.id}`);
    }
  } else {
    uniqueBy(
      candidate.changes,
      (change) => change.workItemId ?? change.workItem.id,
      "work-item changes",
    );
    for (const change of candidate.changes) {
      if (change.workItem) {
        validateWorkItem(change.workItem, `work item ${change.workItem.id}`);
      }
      if (
        change.operation === "update" &&
        change.workItem.id !== change.workItemId
      ) {
        fail("update must preserve the stable work-item ID");
      }
    }
  }
}

function validateBaselineLocal(baseline) {
  validateInputBindings(baseline.inputBindings, "WorkBreakdownBaseline");
  uniqueBy(baseline.workItems, ({ id }) => id, "baseline work items");
  for (const item of baseline.workItems) {
    validateWorkItem(item, `baseline work item ${item.id}`);
  }
  uniqueBy(
    baseline.coverageDispositions,
    (entry) => `${entry.scopeKind}\u0000${entry.scopeRef}`,
    "baseline coverage dispositions",
  );
  for (const entry of baseline.coverageDispositions) {
    if (entry.disposition === "no-work-required") {
      if (
        entry.approval.scopeKind !== entry.scopeKind ||
        entry.approval.scopeRef !== entry.scopeRef
      ) {
        fail("no-work baseline approval does not bind its exact scope");
      }
    }
  }
  assertFullResultCoverage(
    baseline.coverageDispositions,
    baseline.workItems,
    "WorkBreakdownBaseline",
  );
}

export function validateWorkBreakdownArtifact(artifact, context = {}) {
  if (!artifactValidator(artifact)) {
    fail(`${validationDetail(artifactValidator)} (${CONTRACT_URI})`);
  }
  assertContextRef(artifact, context);
  switch (artifact.kind) {
    case "ContractDisposition":
      if (artifact.contractTargets) {
        uniqueBy(
          artifact.contractTargets,
          ({ id }) => id,
          "contract targets",
        );
      }
      break;
    case "CapabilityCatalog":
      uniqueBy(artifact.capabilities, ({ id }) => id, "capabilities");
      break;
    case "ApprovedChangePackage":
      uniqueBy(
        artifact.traceabilityRefs,
        ({ nodeId }) => nodeId,
        "approved change traceability refs",
      );
      break;
    case "WorkBreakdownDraft":
    case "WorkBreakdownChangeSetDraft":
      validateCandidateLocal(artifact);
      break;
    case "WorkBreakdownBaseline":
      validateBaselineLocal(artifact);
      break;
    case "WorkBreakdownClarificationRequestSet":
      validateInputBindings(artifact.inputBindings, artifact.kind);
      uniqueBy(artifact.questions, ({ id }) => id, "clarification questions");
      break;
    case "WorkBreakdownClarificationResponseSet":
      uniqueBy(
        artifact.responses,
        ({ questionId }) => questionId,
        "clarification responses",
      );
      break;
    case "WorkBreakdownContinuation":
      validateInputBindings(artifact.inputBindings, artifact.kind);
      break;
  }
  return artifact;
}

function loadedOne(loadedInputs, port) {
  const entries = loadedInputs?.[port];
  return entries?.length === 1 ? entries[0] : undefined;
}

function requireLoaded(loadedInputs, port) {
  const loaded = loadedOne(loadedInputs, port);
  if (!loaded) fail(`runtime inputs require exactly one ${port} artifact`);
  return loaded;
}

function assertSchemaMediaPair(loaded, expected, label) {
  if (
    loaded.ref.schema !== expected.schema ||
    loaded.ref.mediaType !== expected.mediaType
  ) {
    fail(
      `${label} ref must pair schema ${expected.schema} with media type ${expected.mediaType}`,
    );
  }
}

function assertRepositoryLoaded(loaded, allowNotApplicable, label) {
  if (loaded.value.kind === "RepositorySnapshot") {
    assertSchemaMediaPair(loaded, REPOSITORY_CONTRACT, label);
    return;
  }
  if (allowNotApplicable && loaded.value.kind === "ApprovedNotApplicable") {
    assertSchemaMediaPair(
      loaded,
      WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedNotApplicable,
      label,
    );
    if (loaded.value.purpose !== "repository-context") {
      fail(`${label} ApprovedNotApplicable has the wrong purpose`);
    }
    return;
  }
  fail(
    `${label} must be ${allowNotApplicable ? "RepositorySnapshot or repository-context ApprovedNotApplicable" : "RepositorySnapshot"}`,
  );
}

export function validateProjectWorkBreakdownStateAgainstInputs({
  state,
  operation,
  loadedInputs,
}) {
  validateWorkBreakdownArtifact(state);
  const expectedState =
    operation === "establish-breakdown" ? "unbaselined" : "baselined";
  if (state.state !== expectedState) {
    fail(`${operation} requires ProjectWorkBreakdownState ${expectedState}`);
  }
  for (const port of OPERATION_INPUTS[operation] ?? []) {
    if (port === "project-work-breakdown-state") continue;
    const loaded = requireLoaded(loadedInputs, port);
    const property = INPUT_BINDING_PROPERTIES[port];
    assertRef(`state ${property}`, state[property], loaded.ref);
  }
  assertArchitectureBaselineUpstreamAlignment(loadedInputs);
  const contract = requireLoaded(loadedInputs, "contract-disposition");
  assertSchemaMediaPair(
    contract,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ContractDisposition,
    "contract-disposition",
  );
  validateWorkBreakdownArtifact(contract.value, { ref: contract.ref });
  const catalog = requireLoaded(loadedInputs, "capability-catalog");
  assertSchemaMediaPair(
    catalog,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.CapabilityCatalog,
    "capability-catalog",
  );
  validateWorkBreakdownArtifact(catalog.value, { ref: catalog.ref });
  if (operation === "establish-breakdown") {
    assertRepositoryLoaded(
      requireLoaded(loadedInputs, "repository-context"),
      true,
      "repository-context",
    );
  } else {
    assertRepositoryLoaded(
      requireLoaded(loadedInputs, "current-repository-snapshot"),
      false,
      "current-repository-snapshot",
    );
    const baseline = requireLoaded(
      loadedInputs,
      "current-work-breakdown-baseline",
    );
    validateWorkBreakdownArtifact(baseline.value, { ref: baseline.ref });
    const changePackage = requireLoaded(
      loadedInputs,
      "approved-change-package",
    );
    validateWorkBreakdownArtifact(changePackage.value, {
      ref: changePackage.ref,
    });
  }
  return state;
}

function bindingMap(bindings) {
  return new Map(bindings.map((binding) => [binding.role, binding.artifact]));
}

function assertCandidateInputBindings(candidate, operation, loadedInputs) {
  const required = [
    ...OPERATION_INPUTS[operation],
    ...CONTROL_INPUTS.filter((port) => loadedOne(loadedInputs, port)),
  ];
  const expected = new Set(required);
  const actual = bindingMap(candidate.inputBindings);
  if (
    actual.size !== expected.size ||
    [...actual.keys()].some((role) => !expected.has(role))
  ) {
    fail(`${candidate.kind} inputBindings do not close over exact runtime inputs`);
  }
  for (const role of expected) {
    assertRef(
      `${candidate.kind} input binding ${role}`,
      actual.get(role),
      requireLoaded(loadedInputs, role).ref,
    );
  }
}

function requirementIds(requirementsBaseline) {
  return new Set(
    requirementsBaseline?.requirements?.acceptanceCriteria?.map(({ id }) => id) ??
      [],
  );
}

function architectureElementIds(
  architectureLoaded,
  architectureModelAttachment,
) {
  const architectureBaseline = architectureLoaded.value;
  const section = architectureBaseline?.sections?.architectureModel;
  const content = resolveVerifiedArchitectureModelContent(
    architectureBaseline,
    section?.mode === "attached"
      ? {
          resolveAttached(ref) {
            return architectureModelAttachment &&
              sameWorkBreakdownArtifactRef(
                ref,
                architectureModelAttachment.ref,
              )
              ? architectureModelAttachment
              : undefined;
          },
        }
      : {},
  );
  return new Set(
    content.elements.map(({ id }) => id),
  );
}

function contractIds(contractDisposition) {
  return new Set(
    contractDisposition.mode === "baseline"
      ? contractDisposition.contractTargets.map(({ id }) => id)
      : [],
  );
}

function universeFromInputs(
  operation,
  loadedInputs,
  architectureModelAttachment,
) {
  const requirements = requireLoaded(
    loadedInputs,
    "requirements-baseline",
  ).value;
  const architecture = requireLoaded(
    loadedInputs,
    "architecture-baseline",
  );
  const contracts = requireLoaded(
    loadedInputs,
    "contract-disposition",
  ).value;
  const full = {
    "acceptance-criterion": requirementIds(requirements),
    architecture: architectureElementIds(
      architecture,
      architectureModelAttachment,
    ),
    contract: contractIds(contracts),
  };
  if (operation === "establish-breakdown") return full;
  const approved = requireLoaded(
    loadedInputs,
    "approved-change-package",
  ).value.authorizedScope;
  const scoped = {
    "acceptance-criterion": new Set(approved.acceptanceCriteria),
    architecture: new Set(approved.architecture),
    contract: new Set(approved.contracts),
  };
  const previous = {
    "acceptance-criterion": new Set(),
    architecture: new Set(),
    contract: new Set(),
  };
  const currentBaseline = requireLoaded(
    loadedInputs,
    "current-work-breakdown-baseline",
  ).value;
  for (const disposition of currentBaseline.coverageDispositions) {
    previous[disposition.scopeKind].add(disposition.scopeRef);
  }
  for (const item of currentBaseline.workItems) {
    for (const [kind, id] of workItemRefs(item)) previous[kind].add(id);
  }
  for (const kind of Object.keys(scoped)) {
    for (const id of scoped[kind]) {
      if (!full[kind].has(id) && !previous[kind].has(id)) {
        fail(`approved change authorizes unknown ${kind} ${id}`);
      }
    }
  }
  return scoped;
}

function workItemRefs(item) {
  return [
    ...item["acceptance-criterion-refs"].map((id) => [
      "acceptance-criterion",
      id,
    ]),
    ...item["architecture-refs"].map((id) => ["architecture", id]),
    ...item["contract-refs"].map((id) => ["contract", id]),
  ];
}

function resolveJsonPointer(value, pointer) {
  if (pointer === "") return true;
  let current = value;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, token)
    ) {
      return false;
    }
    current = current[token];
  }
  return true;
}

function assertSourceRefs(sourceRefs, loadedInputs, label) {
  for (const source of sourceRefs) {
    const roleInputs = loadedInputs?.[source.role];
    if (!Array.isArray(roleInputs) || roleInputs.length === 0) {
      fail(`${label} source role ${source.role} is not a loaded invocation input`);
    }
    const loaded = roleInputs.find(({ ref }) =>
      sameWorkBreakdownArtifactRef(ref, source.artifact),
    );
    if (!loaded) {
      fail(
        `${label} source role ${source.role} does not contain the exact referenced artifact`,
      );
    }
    if (!resolveJsonPointer(loaded.value, source.jsonPointer)) {
      fail(`${label} contains unresolved JSON pointer ${source.jsonPointer}`);
    }
  }
}

function assertWorkItems({
  workItems,
  universe,
  catalog,
  loadedInputs,
  validateReferences = true,
}) {
  const capabilities = new Set(catalog.capabilities.map(({ id }) => id));
  for (const item of workItems) {
    if (validateReferences) {
      for (const [kind, id] of workItemRefs(item)) {
        if (!universe[kind].has(id)) {
          fail(`work item ${item.id} contains unscoped ${kind} ref ${id}`);
        }
      }
    }
    for (const capability of item["required-capabilities"]) {
      if (!capabilities.has(capability)) {
        fail(`work item ${item.id} requires unknown capability ${capability}`);
      }
    }
    assertSourceRefs(
      item["source-refs"],
      loadedInputs,
      `work item ${item.id}`,
    );
  }
}

function coverageKey(kind, ref) {
  return `${kind}\u0000${ref}`;
}

function assertFullResultCoverage(coverage, workItems, label) {
  const dispositions = new Map(
    coverage.map((entry) => [
      coverageKey(entry.scopeKind, entry.scopeRef),
      entry,
    ]),
  );
  const items = new Map(workItems.map((item) => [item.id, item]));
  for (const entry of coverage) {
    if (entry.disposition !== "planned") continue;
    for (const itemId of entry.workItemRefs) {
      const item = items.get(itemId);
      if (!item) {
        fail(`${label} planned coverage references missing work item ${itemId}`);
      }
      if (
        !workItemRefs(item).some(
          ([kind, id]) => kind === entry.scopeKind && id === entry.scopeRef,
        )
      ) {
        fail(
          `${label} planned coverage ${entry.scopeKind} ${entry.scopeRef} is not reciprocally declared by ${itemId}`,
        );
      }
    }
  }
  for (const item of workItems) {
    for (const [kind, id] of workItemRefs(item)) {
      const disposition = dispositions.get(coverageKey(kind, id));
      if (
        disposition?.disposition !== "planned" ||
        !disposition.workItemRefs.includes(item.id)
      ) {
        fail(
          `${label} work item ${item.id} lacks reciprocal planned coverage for ${kind} ${id}`,
        );
      }
    }
  }
}
function assertCoverage({
  coverage,
  universe,
  workItems,
  referencingItems = workItems,
}) {
  const expected = new Set();
  for (const [kind, ids] of Object.entries(universe)) {
    for (const id of ids) expected.add(coverageKey(kind, id));
  }
  const actual = new Map(
    coverage.map((entry) => [
      coverageKey(entry.scopeKind, entry.scopeRef),
      entry,
    ]),
  );
  if (
    actual.size !== expected.size ||
    [...actual.keys()].some((key) => !expected.has(key))
  ) {
    fail("coverage dispositions do not exactly cover authorized scope");
  }
  const items = new Map(workItems.map((item) => [item.id, item]));
  for (const entry of coverage) {
    if (entry.disposition !== "planned") continue;
    for (const itemId of entry.workItemRefs) {
      const item = items.get(itemId);
      if (!item) fail(`coverage references unknown work item ${itemId}`);
      if (
        !workItemRefs(item).some(
          ([kind, id]) => kind === entry.scopeKind && id === entry.scopeRef,
        )
      ) {
        fail(
          `planned coverage ${entry.scopeKind} ${entry.scopeRef} is not declared by ${itemId}`,
        );
      }
    }
  }
  for (const item of referencingItems) {
    for (const [kind, id] of workItemRefs(item)) {
      const disposition = actual.get(coverageKey(kind, id));
      if (
        disposition?.disposition !== "planned" ||
        !disposition.workItemRefs.includes(item.id)
      ) {
        fail(`work item ${item.id} is not linked from planned coverage ${id}`);
      }
    }
  }
}

function assertApprovedChangeLineage(loadedInputs) {
  const change = requireLoaded(
    loadedInputs,
    "approved-change-package",
  ).value;
  const targetMap = {
    requirementsBaseline: "requirements-baseline",
    projectOverviewBaseline: "project-overview-baseline",
    architectureBaseline: "architecture-baseline",
    contractDisposition: "contract-disposition",
  };
  for (const [property, port] of Object.entries(targetMap)) {
    assertRef(
      `ApprovedChangePackage target ${property}`,
      change.target[property],
      requireLoaded(loadedInputs, port).ref,
    );
  }
  const currentBaseline = requireLoaded(
    loadedInputs,
    "current-work-breakdown-baseline",
  );
  const baselineInputs = bindingMap(currentBaseline.value.inputBindings);
  for (const [property, port] of Object.entries(targetMap)) {
    const baselineRef = baselineInputs.get(port);
    if (!baselineRef) {
      fail(`current WorkBreakdownBaseline is missing input binding ${port}`);
    }
    assertRef(
      `ApprovedChangePackage preChange ${property}`,
      change.preChange[property],
      baselineRef,
    );
  }
  assertRef(
    "ApprovedChangePackage currentWorkBreakdownBaseline",
    change.currentWorkBreakdownBaseline,
    currentBaseline.ref,
  );
  const repository = requireLoaded(
    loadedInputs,
    "current-repository-snapshot",
  );
  assertRef(
    "ApprovedChangePackage current repository",
    change.currentRepository.artifact,
    repository.ref,
  );
  if (
    change.currentRepository.revision !== repository.value.revision ||
    change.currentRepository.treeDigest !== repository.value.treeDigest
  ) {
    fail("ApprovedChangePackage repository revision or tree digest drifted");
  }
}

function assertArchitectureBaselineUpstreamAlignment(loadedInputs) {
  const architecture = requireLoaded(
    loadedInputs,
    "architecture-baseline",
  ).value;
  assertRef(
    "ArchitectureBaseline requirementsBaseline",
    architecture.requirementsBaseline,
    requireLoaded(loadedInputs, "requirements-baseline").ref,
  );
  assertRef(
    "ArchitectureBaseline projectOverviewBaseline",
    architecture.projectOverviewBaseline,
    requireLoaded(loadedInputs, "project-overview-baseline").ref,
  );
}

export function applyWorkBreakdownChangeSet({
  baseline,
  baselineRef,
  changeSet,
}) {
  validateWorkBreakdownArtifact(baseline);
  validateWorkBreakdownArtifact(changeSet);
  assertRef("change set currentBaseline", changeSet.currentBaseline, baselineRef);
  const items = new Map(baseline.workItems.map((item) => [item.id, item]));
  const changes = [...changeSet.changes].sort((left, right) => {
    const leftId = left.workItemId ?? left.workItem.id;
    const rightId = right.workItemId ?? right.workItem.id;
    return compareText(leftId, rightId);
  });
  for (const change of changes) {
    const id = change.workItemId ?? change.workItem.id;
    const existing = items.get(id);
    if (change.operation === "add") {
      if (existing) fail(`add target ${id} already exists`);
      items.set(id, change.workItem);
      continue;
    }
    if (!existing) fail(`${change.operation} target ${id} does not exist`);
    if (canonicalJsonDigest(existing) !== change.priorItemDigest) {
      fail(`${change.operation} target ${id} prior digest is stale`);
    }
    if (change.operation === "update") items.set(id, change.workItem);
    else items.delete(id);
  }
  const workItems = [...items.values()].sort((left, right) =>
    compareText(left.id, right.id),
  );
  const dispositions = new Map(
    baseline.coverageDispositions.map((entry) => [
      coverageKey(entry.scopeKind, entry.scopeRef),
      entry,
    ]),
  );
  for (const entry of changeSet.coverageDispositions) {
    dispositions.set(coverageKey(entry.scopeKind, entry.scopeRef), entry);
  }
  const coverageDispositions = [...dispositions.values()].sort(
    (left, right) =>
      compareText(
        coverageKey(left.scopeKind, left.scopeRef),
        coverageKey(right.scopeKind, right.scopeRef),
      ),
  );
  assertFullResultCoverage(
    coverageDispositions,
    workItems,
    "applied WorkBreakdown change",
  );
  return immutableCopy({
    workItems,
    coverageDispositions,
    workItemsDigest: canonicalJsonDigest(workItems),
  });
}

export function validateWorkBreakdownCandidateAgainstInputs({
  candidate,
  operation,
  loadedInputs,
  architectureModelAttachment,
}) {
  validateWorkBreakdownArtifact(candidate);
  const expectedKind =
    operation === "establish-breakdown"
      ? "WorkBreakdownDraft"
      : "WorkBreakdownChangeSetDraft";
  if (candidate.kind !== expectedKind || candidate.operation !== operation) {
    fail(`${operation} requires one ${expectedKind}`);
  }
  const state = requireLoaded(
    loadedInputs,
    "project-work-breakdown-state",
  ).value;
  validateProjectWorkBreakdownStateAgainstInputs({
    state,
    operation,
    loadedInputs,
  });
  assertCandidateInputBindings(candidate, operation, loadedInputs);
  if (operation === "decompose-change") assertApprovedChangeLineage(loadedInputs);
  const universe = universeFromInputs(
    operation,
    loadedInputs,
    architectureModelAttachment,
  );
  const catalog = requireLoaded(loadedInputs, "capability-catalog").value;
  let workItems;
  let changedItems;
  if (operation === "establish-breakdown") {
    workItems = candidate.workItems;
    changedItems = workItems;
  } else {
    const baseline = requireLoaded(
      loadedInputs,
      "current-work-breakdown-baseline",
    );
    assertRef("change set currentBaseline", candidate.currentBaseline, baseline.ref);
    const applied = applyWorkBreakdownChangeSet({
      baseline: baseline.value,
      baselineRef: baseline.ref,
      changeSet: candidate,
    });
    if (candidate.resultingWorkItemsDigest !== applied.workItemsDigest) {
      fail("change set resultingWorkItemsDigest does not bind the full result");
    }
    workItems = applied.workItems;
    changedItems = candidate.changes
      .filter((change) => change.workItem)
      .map((change) => change.workItem);
  }
  assertWorkItems({
    workItems: changedItems,
    universe,
    catalog,
    loadedInputs,
    validateReferences: true,
  });
  assertSourceRefs(candidate.sourceRefs, loadedInputs, candidate.kind);
  assertCoverage({
    coverage: candidate.coverageDispositions,
    universe,
    workItems,
    referencingItems: changedItems,
  });
  return candidate;
}

function materializeNoWorkApprovals(
  coverage,
  candidateRef,
  noWorkApprovals,
) {
  const approvals = new Map();
  for (const approval of noWorkApprovals ?? []) {
    const expectedKeys = [
      "authority",
      "candidate",
      "scopeKind",
      "scopeRef",
      "evidence",
    ].sort();
    if (
      approval === null ||
      typeof approval !== "object" ||
      Array.isArray(approval) ||
      Object.keys(approval).sort().join("\u0000") !==
        expectedKeys.join("\u0000")
    ) {
      fail("no-work approval must be one closed Gate-owned approval proof");
    }
    if (approval.authority !== "work-breakdown-gate") {
      fail("no-work approval has spoofed authority");
    }
    assertRef("no-work approval candidate", approval.candidate, candidateRef);
    const key = coverageKey(approval.scopeKind, approval.scopeRef);
    if (approvals.has(key)) fail(`duplicate no-work approval for ${key}`);
    if (
      typeof approval.evidence?.digest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(approval.evidence.digest)
    ) {
      fail("no-work approval evidence is not content addressed");
    }
    approvals.set(key, approval);
  }
  const expected = new Set(
    coverage
      .filter(({ disposition }) => disposition === "no-work-required")
      .map(({ scopeKind, scopeRef }) => coverageKey(scopeKind, scopeRef)),
  );
  if (
    approvals.size !== expected.size ||
    [...approvals.keys()].some((key) => !expected.has(key))
  ) {
    fail("no-work approvals do not exactly cover proposed no-work dispositions");
  }
  return coverage.map((entry) =>
    entry.disposition === "no-work-required"
      ? { ...entry, approval: approvals.get(coverageKey(entry.scopeKind, entry.scopeRef)) }
      : entry,
  );
}

function compareSemver(left, right) {
  const l = left.split(".").map(Number);
  const r = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (l[index] !== r[index]) return l[index] - r[index];
  }
  return 0;
}

export function validateWorkBreakdownBaselinePromotion({
  candidate,
  candidateRef,
  baseline,
  previousBaseline,
  previousBaselineRef,
  noWorkApprovals = [],
}) {
  validateWorkBreakdownArtifact(candidate, { ref: candidateRef });
  validateWorkBreakdownArtifact(baseline);
  assertRef("baseline approvedCandidate", baseline.approvedCandidate, candidateRef);
  if (
    canonicalJsonDigest(baseline.inputBindings) !==
      canonicalJsonDigest(candidate.inputBindings) ||
    canonicalJsonDigest(baseline.sourceRefs) !==
      canonicalJsonDigest(candidate.sourceRefs)
  ) {
    fail("baseline does not preserve candidate input and source lineage");
  }
  let expectedItems;
  let expectedCoverage;
  const approvedCandidateCoverage = materializeNoWorkApprovals(
    candidate.coverageDispositions,
    candidateRef,
    noWorkApprovals,
  );
  if (candidate.kind === "WorkBreakdownDraft") {
    if (previousBaseline !== undefined || previousBaselineRef !== undefined) {
      fail("initial baseline promotion cannot include a previous baseline");
    }
    expectedItems = [...candidate.workItems].sort((left, right) =>
      compareText(left.id, right.id),
    );
    expectedCoverage = [...approvedCandidateCoverage].sort((left, right) =>
      compareText(
        coverageKey(left.scopeKind, left.scopeRef),
        coverageKey(right.scopeKind, right.scopeRef),
      ),
    );
  } else {
    if (!previousBaseline || !previousBaselineRef) {
      fail("change promotion requires the exact current baseline");
    }
    validateWorkBreakdownArtifact(previousBaseline, { ref: previousBaselineRef });
    assertRef("candidate currentBaseline", candidate.currentBaseline, previousBaselineRef);
    const applied = applyWorkBreakdownChangeSet({
      baseline: previousBaseline,
      baselineRef: previousBaselineRef,
      changeSet: candidate,
    });
    expectedItems = applied.workItems;
    const dispositions = new Map(
      previousBaseline.coverageDispositions.map((entry) => [
        coverageKey(entry.scopeKind, entry.scopeRef),
        entry,
      ]),
    );
    for (const entry of approvedCandidateCoverage) {
      dispositions.set(coverageKey(entry.scopeKind, entry.scopeRef), entry);
    }
    expectedCoverage = [...dispositions.values()].sort((left, right) =>
      compareText(
        coverageKey(left.scopeKind, left.scopeRef),
        coverageKey(right.scopeKind, right.scopeRef),
      ),
    );
    if (compareSemver(baseline.version, previousBaseline.version) <= 0) {
      fail("changed baseline semantic version must advance");
    }
  }
  if (
    canonicalJsonDigest(baseline.workItems) !==
      canonicalJsonDigest(expectedItems) ||
    canonicalJsonDigest(baseline.coverageDispositions) !==
      canonicalJsonDigest(expectedCoverage)
  ) {
    fail("baseline is not the exact deterministic candidate result");
  }
  for (const entry of baseline.coverageDispositions) {
    if (
      entry.disposition === "no-work-required" &&
      !sameWorkBreakdownArtifactRef(entry.approval.candidate, candidateRef) &&
      (!previousBaseline ||
        !previousBaseline.coverageDispositions.some(
          (previous) =>
            previous.disposition === "no-work-required" &&
            previous.scopeKind === entry.scopeKind &&
            previous.scopeRef === entry.scopeRef &&
            canonicalJsonDigest(previous) === canonicalJsonDigest(entry),
        ))
    ) {
      fail("baseline contains stale or unbound no-work approval");
    }
  }
  return immutableCopy(baseline);
}

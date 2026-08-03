import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import {
  applyWorkBreakdownChangeSet,
  validateWorkBreakdownArtifact,
} from "./work-breakdown-artifact-validator.mjs";

const MODULE = Object.freeze({ id: "work-breakdown", version: "0.1.0" });
const OPERATIONS = new Set(["establish-breakdown", "decompose-change"]);
const SUCCESS_OUTCOMES = new Set(["decomposed"]);
const COMPLETED_CONTROL_OUTCOMES = new Set([
  "needs_clarification",
  "baseline_drift",
  "unable_to_proceed",
]);
const FAILED_CONTROL_OUTCOMES = new Set(["execution_failed"]);

const WORK_BREAKDOWN_SCOPE = "work-breakdown/candidate";
const REQUIREMENTS_SCOPE = "requirements/baseline";
const ARCHITECTURE_SCOPE = "architecture/baseline";
const CONTRACT_SCOPE = "contracts/baseline";

const WORK_BREAKDOWN_NODE_KINDS = Object.freeze(["work-item"]);
const WORK_BREAKDOWN_EDGE_KINDS = Object.freeze([
  "implementation-planned-by",
  "planned-by",
  "realization-planned-by",
]);
const CONTRACT_NODE_KINDS = Object.freeze(["contract"]);
const EMPTY_KINDS = Object.freeze([]);

function fail(message) {
  throw new TypeError(`work-breakdown traceability contributor: ${message}`);
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
    OPERATIONS.has(module.operation)
  );
}

function hasSuccessOutcome(context) {
  return (
    context?.moduleResult?.status === "completed" &&
    SUCCESS_OUTCOMES.has(context.moduleResult.outcome)
  );
}

function hasControlOutcome(context) {
  const result = context?.moduleResult;
  return Boolean(
    result &&
      ((result.status === "completed" &&
        COMPLETED_CONTROL_OUTCOMES.has(result.outcome)) ||
        (result.status === "failed" &&
          FAILED_CONTROL_OUTCOMES.has(result.outcome))),
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
  return `${base}${segments
    .map((value) => `/${pointerSegment(value)}`)
    .join("")}`;
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

function artifactStableId(ref) {
  return canonicalJsonDigest({
    schema: ref.schema,
    artifactId: ref.artifactId,
    digest: ref.digest,
  });
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

function locatorKey(locator) {
  return canonicalJson(locator);
}

function mergeLocators(...groups) {
  const locators = new Map();
  for (const locator of groups.flat()) {
    locators.set(locatorKey(locator), locator);
  }
  return [...locators.values()].sort((left, right) =>
    locatorKey(left).localeCompare(locatorKey(right), "en"),
  );
}

function endpoint(kind, stableId, authority, scope) {
  return { kind, stableId, authority, scope };
}

function workItemEndpoint(stableId) {
  return endpoint("work-item", stableId, "candidate", WORK_BREAKDOWN_SCOPE);
}

function approvedEndpoint(kind, stableId, scope) {
  return endpoint(kind, stableId, "approved", scope);
}

function boundedLabel(value, fallback) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  const codePoints = [...value];
  if (codePoints.length <= 1024) return value;
  return `${codePoints.slice(0, 1021).join("")}...`;
}

function itemSource(loaded, jsonPointer, item, additionalLocators = []) {
  return {
    item,
    loaded,
    jsonPointer,
    locators: mergeLocators(
      [sourceLocator(loaded, jsonPointer, item)],
      additionalLocators,
    ),
  };
}

function selectDraft(context) {
  const candidate = oneLoaded(
    context,
    "loadedOutputs",
    "work-breakdown-draft",
  );
  validateWorkBreakdownArtifact(candidate.value, { ref: candidate.ref });
  if (
    candidate.value.kind !== "WorkBreakdownDraft" ||
    candidate.value.operation !== "establish-breakdown"
  ) {
    fail("establish-breakdown did not return WorkBreakdownDraft");
  }
  return {
    candidate,
    items: candidate.value.workItems.map((item, position) =>
      itemSource(candidate, pointer("/workItems", position), item),
    ),
  };
}

function resultSourceIndex(candidate, baseline, applied) {
  const origins = new Map(
    baseline.value.workItems.map((item, position) => [
      item.id,
      itemSource(baseline, pointer("/workItems", position), item),
    ]),
  );
  for (const [position, change] of candidate.value.changes.entries()) {
    if (change.operation === "retire") {
      origins.delete(change.workItemId);
      continue;
    }
    origins.set(
      change.workItem.id,
      itemSource(
        candidate,
        pointer("/changes", position, "workItem"),
        change.workItem,
      ),
    );
  }
  const resultDigestLocator = sourceLocator(
    candidate,
    "/resultingWorkItemsDigest",
    candidate.value.resultingWorkItemsDigest,
  );
  return applied.workItems.map((item) => {
    const origin = origins.get(item.id);
    if (!origin || canonicalJsonDigest(origin.item) !== canonicalJsonDigest(item)) {
      fail(`applied work item ${item.id} has no exact source`);
    }
    return itemSource(origin.loaded, origin.jsonPointer, item, [
      resultDigestLocator,
    ]);
  });
}

function selectChange(context) {
  const candidate = oneLoaded(
    context,
    "loadedOutputs",
    "work-breakdown-change-set-draft",
  );
  const baseline = oneLoaded(
    context,
    "loadedInputs",
    "current-work-breakdown-baseline",
  );
  validateWorkBreakdownArtifact(candidate.value, { ref: candidate.ref });
  validateWorkBreakdownArtifact(baseline.value, { ref: baseline.ref });
  if (
    candidate.value.kind !== "WorkBreakdownChangeSetDraft" ||
    candidate.value.operation !== "decompose-change" ||
    baseline.value.kind !== "WorkBreakdownBaseline"
  ) {
    fail("decompose-change did not return a change set over a work baseline");
  }
  const applied = applyWorkBreakdownChangeSet({
    baseline: baseline.value,
    baselineRef: baseline.ref,
    changeSet: candidate.value,
  });
  if (candidate.value.resultingWorkItemsDigest !== applied.workItemsDigest) {
    fail("change set resultingWorkItemsDigest does not bind the applied result");
  }
  return {
    candidate,
    items: resultSourceIndex(candidate, baseline, applied),
  };
}

function selectCandidate(context) {
  const operation = context.invocation.module.operation;
  if (operation === "establish-breakdown") return selectDraft(context);
  if (operation === "decompose-change") return selectChange(context);
  fail(`unsupported operation ${JSON.stringify(operation)}`);
}

function projectWorkItem(source) {
  return {
    kind: "work-item",
    stableId: source.item.id,
    label: boundedLabel(source.item.objective, source.item.id),
    attributes: { workItem: structuredClone(source.item) },
    sourceLocators: source.locators,
  };
}

function referenceLocators(source, field, position) {
  return mergeLocators(
    [
      sourceLocator(
        source.loaded,
        pointer(source.jsonPointer, field, position),
        source.item[field][position],
      ),
    ],
    source.locators.filter(
      ({ jsonPointer }) => jsonPointer === "/resultingWorkItemsDigest",
    ),
  );
}

function planningEdges(source) {
  const target = workItemEndpoint(source.item.id);
  const edges = [];
  const mappings = [
    {
      field: "acceptance-criterion-refs",
      kind: "planned-by",
      sourceKind: "acceptance-criterion",
      scope: REQUIREMENTS_SCOPE,
      rationale:
        "The approved acceptance criterion is planned by this candidate work item.",
    },
    {
      field: "architecture-refs",
      kind: "implementation-planned-by",
      sourceKind: "architecture-element",
      scope: ARCHITECTURE_SCOPE,
      rationale:
        "Implementation of the approved architecture element is planned by this candidate work item.",
    },
    {
      field: "contract-refs",
      kind: "realization-planned-by",
      sourceKind: "contract",
      scope: CONTRACT_SCOPE,
      rationale:
        "Realization of the approved contract is planned by this candidate work item.",
    },
  ];
  for (const mapping of mappings) {
    for (const [position, stableId] of source.item[mapping.field].entries()) {
      edges.push({
        kind: mapping.kind,
        source: approvedEndpoint(mapping.sourceKind, stableId, mapping.scope),
        target,
        rationale: mapping.rationale,
        sourceLocators: referenceLocators(source, mapping.field, position),
      });
    }
  }
  return edges;
}

async function projectCandidate(context) {
  if (!sameModule(context) || !hasSuccessOutcome(context)) {
    fail("candidate projector called for a nonmatching execution");
  }
  const selected = selectCandidate(context);
  const nodes = [
    artifactNode(selected.candidate),
    ...selected.items.map(projectWorkItem),
  ];
  const edges = selected.items.flatMap(planningEdges);
  return {
    horizon: "implementation",
    nodes: nodes.sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), "en"),
    ),
    edges: edges.sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), "en"),
    ),

  };
}

async function projectContractDisposition(context) {
  if (!sameModule(context) || !hasSuccessOutcome(context)) {
    fail("contract observer called for a nonmatching execution");
  }
  const disposition = oneLoaded(
    context,
    "loadedInputs",
    "contract-disposition",
  );
  validateWorkBreakdownArtifact(disposition.value, { ref: disposition.ref });
  if (disposition.value.kind !== "ContractDisposition") {
    fail("contract-disposition input is not ContractDisposition");
  }
  const dispositionNode = artifactNode(disposition);
  if (disposition.value.mode === "not-applicable") {
    return {
      horizon: "contracts",
      nodes: [dispositionNode],
      edges: [],

    };
  }
  if (disposition.value.mode !== "baseline") {
    fail(`unsupported contract disposition mode ${disposition.value.mode}`);
  }
  return {
    horizon: "contracts",
    nodes: [
      dispositionNode,
      ...disposition.value.contractTargets.map((target, position) => ({
        kind: "contract",
        stableId: target.id,
        label: boundedLabel(target.description, target.id),
        attributes: {
          contractKind: target.kind,
          contractBaseline: structuredClone(disposition.value.contractBaseline),
        },
        sourceLocators: [
          sourceLocator(
            disposition,
            pointer("/contractTargets", position),
            target,
          ),
        ],
      })),
    ]
      .sort((left, right) =>
        canonicalJson(left).localeCompare(canonicalJson(right), "en"),
      ),
    edges: [],
  };
}

async function projectControl(context) {
  if (!sameModule(context) || !hasControlOutcome(context)) {
    fail("control projector called for a nonmatching execution");
  }
  return {
    horizon: "implementation",
    nodes: [],
    edges: [],
    reason: `WorkBreakdown outcome ${context.moduleResult.outcome} has no canonical work candidate to project.`,
  };
}

export function createWorkBreakdownTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({
      id: "devrelay.work-breakdown-candidate",
      version: "1.0.0",
    }),
    match: (context) => sameModule(context) && hasSuccessOutcome(context),
    scope: WORK_BREAKDOWN_SCOPE,
    authority: "candidate",
    ownership: ownership(
      WORK_BREAKDOWN_SCOPE,
      "candidate",
      WORK_BREAKDOWN_NODE_KINDS,
      WORK_BREAKDOWN_EDGE_KINDS,
    ),
    project: projectCandidate,
  });
}

export function createContractDispositionObserverContributor() {
  return Object.freeze({
    metadata: deepFreeze({
      id: "devrelay.contract-disposition-observer",
      version: "1.0.0",
    }),
    match: (context) =>
      sameModule(context) &&
      hasSuccessOutcome(context) &&
      hasLoaded(context, "loadedInputs", "contract-disposition"),
    scope: CONTRACT_SCOPE,
    authority: "approved",
    ownership: ownership(
      CONTRACT_SCOPE,
      "approved",
      CONTRACT_NODE_KINDS,
      EMPTY_KINDS,
    ),
    project: projectContractDisposition,
  });
}

export function createWorkBreakdownControlTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({
      id: "devrelay.work-breakdown-control",
      version: "1.0.0",
    }),
    match: (context) => sameModule(context) && hasControlOutcome(context),
    scope: "work-breakdown/control",
    authority: "candidate",
    ownership: ownership(
      "work-breakdown/control",
      "candidate",
      EMPTY_KINDS,
      EMPTY_KINDS,
    ),
    project: projectControl,
  });
}

export const workBreakdownTraceabilityContributor =
  createWorkBreakdownTraceabilityContributor();
export const contractDispositionObserverContributor =
  createContractDispositionObserverContributor();
export const workBreakdownControlTraceabilityContributor =
  createWorkBreakdownControlTraceabilityContributor();
export const workBreakdownTraceabilityContributors = Object.freeze([
  contractDispositionObserverContributor,
  workBreakdownTraceabilityContributor,
  workBreakdownControlTraceabilityContributor,
]);

import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateWorkDependencyArtifact } from "./work-dependency-artifact-validator.mjs";

const MODULE = Object.freeze({ id: "work-dependency-gate", version: "0.1.0" });
const OPERATION = "promote-baseline";
const SCOPE = "work-dependency/baseline";
const WORK_BREAKDOWN_SCOPE = "work-breakdown/candidate";

function fail(message) {
  throw new TypeError(`work-dependency traceability contributor: ${message}`);
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function matches(context) {
  const module = context?.invocation?.module;
  return Boolean(
    module?.id === MODULE.id &&
      module.version === MODULE.version &&
      module.operation === OPERATION &&
      context?.moduleResult?.status === "completed" &&
      context.moduleResult.outcome === "promoted",
  );
}

function oneBaseline(context) {
  const entries = context?.loadedOutputs?.["work-dependency-baseline"];
  if (!Array.isArray(entries) || entries.length !== 1) {
    fail("loadedOutputs.work-dependency-baseline must contain exactly one artifact");
  }
  const loaded = entries[0];
  validateWorkDependencyArtifact(loaded.value, { ref: loaded.ref });
  if (loaded.value.kind !== "WorkDependencyBaseline") {
    fail("Gate output is not a WorkDependencyBaseline");
  }
  return loaded;
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
    stableId: canonicalJsonDigest({
      schema: loaded.ref.schema,
      artifactId: loaded.ref.artifactId,
      digest: loaded.ref.digest,
    }),
    label: loaded.ref.artifactId,
    attributes: { artifact: structuredClone(loaded.ref) },
    sourceLocators: [sourceLocator(loaded, "", loaded.value)],
  };
}

function workItemEndpoint(stableId) {
  return {
    kind: "work-item",
    stableId,
    authority: "candidate",
    scope: WORK_BREAKDOWN_SCOPE,
  };
}

async function project(context) {
  if (!matches(context)) fail("project called for a nonmatching execution");
  const baseline = oneBaseline(context);
  const edges = baseline.value.edges.map((edge, position) => ({
    kind: "prerequisite-for",
    source: workItemEndpoint(edge.prerequisiteId),
    target: workItemEndpoint(edge.dependentId),
    rationale:
      "The approved WorkDependencyBaseline establishes the source WorkItem as a prerequisite for the downstream WorkItem.",
    sourceLocators: [sourceLocator(baseline, `/edges/${position}`, edge)],
  }));
  return {
    horizon: "implementation",
    nodes: [artifactNode(baseline)],
    edges: edges.sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), "en"),
    ),
    ...(edges.length === 0
      ? { reason: "The approved static DAG contains no dependency edges." }
      : {}),
  };
}

export function createWorkDependencyBaselineTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({
      id: "devrelay.work-dependency-baseline",
      version: "1.0.0",
    }),
    match: matches,
    scope: SCOPE,
    authority: "approved",
    ownership: immutable({
      scope: SCOPE,
      authority: "approved",
      nodeKinds: [],
      edgeKinds: ["prerequisite-for"],
    }),
    project,
  });
}

export const workDependencyBaselineTraceabilityContributor =
  createWorkDependencyBaselineTraceabilityContributor();

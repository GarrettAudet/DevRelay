import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateRoadmapArtifact } from "./roadmap-management-artifact-validator.mjs";

const SCOPE = "roadmap/baseline";
const fail = (message) => { throw new TypeError(`roadmap traceability contributor: ${message}`); };
const immutable = (value) => Object.freeze(structuredClone(value));
const locator = (loaded, jsonPointer, entity) => ({ artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer, entityDigest: canonicalJsonDigest(entity) });
const endpoint = (stableId) => ({ kind: "artifact-reference", stableId, authority: "approved", scope: SCOPE });

function matches(context) {
  const module = context?.invocation?.module;
  return Boolean(
    module?.id === "roadmap-gate" &&
    module.operation === "promote-baseline" &&
    context?.moduleResult?.status === "completed" &&
    context.moduleResult.outcome === "promoted",
  );
}

function baseline(context) {
  const entries = context?.loadedOutputs?.["roadmap-baseline"];
  if (!Array.isArray(entries) || entries.length !== 1) fail("exactly one roadmap-baseline output is required");
  validateRoadmapArtifact(entries[0].value, { ref: entries[0].ref });
  return entries[0];
}

function baselineNode(loaded) {
  const stableId = canonicalJsonDigest({ schema: loaded.ref.schema, artifactId: loaded.ref.artifactId, digest: loaded.ref.digest });
  return {
    kind: "artifact-reference",
    stableId,
    label: `${loaded.value.baselineId} ${loaded.value.version}`,
    attributes: { artifact: structuredClone(loaded.ref), artifactKind: "RoadmapBaseline" },
    sourceLocators: [locator(loaded, "", loaded.value)],
  };
}

function initiativeNode(loaded, initiative, position) {
  const digest = canonicalJsonDigest(initiative);
  const artifact = {
    artifactId: initiative.id,
    schema: "https://devrelay.dev/artifacts/roadmap-initiative/v1",
    mediaType: "application/vnd.devrelay.roadmap-initiative+json",
    digest,
    uri: `${loaded.ref.uri}#/initiatives/${position}`,
  };
  return {
    kind: "artifact-reference",
    stableId: canonicalJsonDigest({ schema: artifact.schema, artifactId: artifact.artifactId, digest }),
    label: initiative.title,
    attributes: { artifact, artifactKind: "RoadmapInitiative", status: initiative.status, recommendation: initiative.recommendation, weightedScore: initiative.priority.weightedScore },
    sourceLocators: [locator(loaded, `/initiatives/${position}`, initiative)],
  };
}

async function project(context) {
  if (!matches(context)) fail("project called for a nonmatching execution");
  const loaded = baseline(context);
  const root = baselineNode(loaded);
  const initiatives = loaded.value.initiatives.map((initiative, position) => initiativeNode(loaded, initiative, position));
  const nodes = [root, ...initiatives].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en"));
  const edges = initiatives.map((node, position) => ({
    kind: "contains",
    source: endpoint(root.stableId),
    target: endpoint(node.stableId),
    rationale: "The approved RoadmapBaseline contains this governed initiative and its current disposition.",
    sourceLocators: [locator(loaded, `/initiatives/${position}`, loaded.value.initiatives[position])],
  })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en"));
  return { horizon: "planning", nodes, edges, ...(edges.length === 0 ? { reason: "The approved roadmap contains no initiatives." } : {}) };
}

export function createRoadmapTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.roadmap-baseline", version: "1.0.0" }),
    match: matches,
    scope: SCOPE,
    authority: "approved",
    ownership: immutable({ scope: SCOPE, authority: "approved", nodeKinds: ["artifact-reference"], edgeKinds: ["contains"] }),
    project,
  });
}

export const roadmapTraceabilityContributor = createRoadmapTraceabilityContributor();

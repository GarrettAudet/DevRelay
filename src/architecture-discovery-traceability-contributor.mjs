import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

const MODULE = Object.freeze({ id: "architecture-discovery", version: "0.1.0", operation: "discover" });
const SCOPE = "architecture-discovery/observational";
const AUTHORITY = "candidate";

const fail = (message) => {
  throw new TypeError(`architecture-discovery traceability contributor: ${message}`);
};

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
      module.operation === MODULE.operation &&
      context?.moduleResult?.status === "completed" &&
      context.moduleResult.outcome === "discovered",
  );
}

function oneLoaded(context, port) {
  const entries = context?.loadedOutputs?.[port];
  if (!Array.isArray(entries) || entries.length !== 1) {
    fail(`loadedOutputs.${port} must contain exactly one artifact`);
  }
  return entries[0];
}

function sameRef(left, right) {
  return left?.artifactId === right?.artifactId && left?.digest === right?.digest;
}

function sourceLocator(loaded, jsonPointer, entity) {
  return {
    artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function artifactStableId(ref) {
  return canonicalJsonDigest({
    ...(ref.schema === undefined ? {} : { schema: ref.schema }),
    artifactId: ref.artifactId,
    digest: ref.digest,
  });
}

function artifactEndpoint(ref) {
  return { kind: "artifact-reference", stableId: artifactStableId(ref) };
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

function edge(kind, source, target, rationale, loaded, pointer, entity) {
  return {
    kind,
    source,
    target,
    rationale,
    sourceLocators: [sourceLocator(loaded, pointer, entity)],
  };
}

async function resolveValidated(context, ref, expectedKind) {
  if (typeof context.resolveArtifact !== "function") fail("a trusted artifact resolver is required");
  const loaded = await context.resolveArtifact(ref);
  if (!sameRef(loaded.ref, ref)) fail(`resolver substituted ${ref.artifactId}`);
  validateArchitectureDiscoveryArtifact(loaded.value);
  if (loaded.value.kind !== expectedKind) fail(`${ref.artifactId} is not ${expectedKind}`);
  return loaded;
}

async function project(context) {
  if (!matches(context)) fail("project called for a nonmatching execution");
  const snapshot = oneLoaded(context, "current-architecture-snapshot");
  validateArchitectureDiscoveryArtifact(snapshot.value);
  if (snapshot.value.kind !== "CurrentArchitectureSnapshot") {
    fail("current-architecture-snapshot is not a CurrentArchitectureSnapshot");
  }
  if (snapshot.value.authority !== "observational") fail("snapshot authority is not observational");

  const repository = await context.resolveArtifact(snapshot.value.repositorySnapshot);
  if (!sameRef(repository.ref, snapshot.value.repositorySnapshot)) fail("repository snapshot was substituted");
  const observations = await Promise.all(
    snapshot.value.observations.map((ref) => resolveValidated(context, ref, "ArchitectureObservation")),
  );
  const gaps = await Promise.all(
    snapshot.value.gaps.map((ref) => resolveValidated(context, ref, "ArchitectureDiscoveryGap")),
  );
  for (const observation of observations) {
    if (!sameRef(observation.value.repositorySnapshot, snapshot.value.repositorySnapshot)) {
      fail(`observation ${observation.value.observationId} targets another repository snapshot`);
    }
  }

  const evidenceRefs = new Map();
  for (const observation of observations) {
    for (const source of observation.value.finding.sources) {
      evidenceRefs.set(`${source.artifact.artifactId}\u0000${source.artifact.digest}`, source.artifact);
    }
  }
  for (const gap of gaps) {
    for (const source of gap.value.sources) {
      evidenceRefs.set(`${source.artifact.artifactId}\u0000${source.artifact.digest}`, source.artifact);
    }
  }
  const evidence = await Promise.all([...evidenceRefs.values()].map((ref) => context.resolveArtifact(ref)));

  const nodes = [snapshot, repository, ...observations, ...gaps, ...evidence]
    .map(artifactNode)
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
  const edges = [
    edge("derived-from", artifactEndpoint(snapshot.ref), artifactEndpoint(repository.ref),
      "The observational current-architecture snapshot is derived from this exact repository snapshot.", snapshot, "/repositorySnapshot", snapshot.value.repositorySnapshot),
    ...observations.map((loaded, index) => edge("contains", artifactEndpoint(snapshot.ref), artifactEndpoint(loaded.ref),
      "The observational current-architecture snapshot contains this validated discovery observation.", snapshot, `/observations/${index}`, snapshot.value.observations[index])),
    ...gaps.map((loaded, index) => edge("contains", artifactEndpoint(snapshot.ref), artifactEndpoint(loaded.ref),
      "The observational current-architecture snapshot preserves this explicit discovery gap.", snapshot, `/gaps/${index}`, snapshot.value.gaps[index])),
    ...observations.flatMap((loaded) => loaded.value.finding.sources.map((source, index) => edge("derived-from", artifactEndpoint(loaded.ref), artifactEndpoint(source.artifact),
      "The validated discovery observation is derived from this exact source evidence.", loaded, `/finding/sources/${index}`, source))),
    ...gaps.flatMap((loaded) => loaded.value.sources.map((source, index) => edge("derived-from", artifactEndpoint(loaded.ref), artifactEndpoint(source.artifact),
      "The explicit discovery gap is derived from this exact source evidence.", loaded, `/sources/${index}`, source))),
  ].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));

  return { horizon: "architecture", nodes, edges };
}

export function createArchitectureDiscoveryTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.architecture-discovery-observational", version: "1.0.0" }),
    match: matches,
    scope: SCOPE,
    authority: AUTHORITY,
    ownership: immutable({ scope: SCOPE, authority: AUTHORITY, nodeKinds: [], edgeKinds: ["contains", "derived-from"] }),
    project,
  });
}

export const architectureDiscoveryTraceabilityContributor = createArchitectureDiscoveryTraceabilityContributor();

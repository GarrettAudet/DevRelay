import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { loadOwnedJsonArtifact } from "./loaded-json-artifact-integrity.mjs";

export class WorkDependencySnapshotError extends Error {
  constructor(message) {
    super(`work dependency snapshot is invalid: ${message}`);
    this.name = "WorkDependencySnapshotError";
    this.code = "DR3020";
  }
}

function fail(message) {
  throw new WorkDependencySnapshotError(message);
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

function sameRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.schema === right.schema &&
      left.mediaType === right.mediaType &&
      left.digest === right.digest,
  );
}

function validateLoaded(loaded, label) {
  try {
    return {
      ref: immutable(loaded.ref),
      bytes: Buffer.from(loaded.bytes),
      value: loadOwnedJsonArtifact(loaded, label),
    };
  } catch (error) {
    fail(error.message);
  }
}

function resolvePointer(value, pointer) {
  if (pointer === "") return value;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    fail(`selector ${JSON.stringify(pointer)} is not a JSON Pointer`);
  }
  let current = value;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, token)
    ) {
      fail(`selector ${pointer} does not resolve`);
    }
    current = current[token];
  }
  return current;
}

function validateVersionPin(slice, source) {
  const pin = slice.sourceVersion;
  if (
    pin === null ||
    typeof pin !== "object" ||
    typeof pin.kind !== "string" ||
    typeof pin.value !== "string"
  ) {
    fail(`context slice ${slice.id} has an invalid sourceVersion`);
  }
  const actual = {
    "artifact-version": source.value?.version,
    "repository-commit": source.value?.revision,
    "content-digest": source.ref.digest,
  }[pin.kind];
  if (actual === undefined || actual !== pin.value) {
    fail(`context slice ${slice.id} source version or commit drifted`);
  }
}

export async function buildWorkBreakdownAnalysisSnapshot({
  workBreakdown,
  projectOverview,
  contextSliceSet,
  resolveArtifact,
}) {
  workBreakdown = validateLoaded(workBreakdown, "workBreakdown");
  projectOverview = validateLoaded(projectOverview, "projectOverview");
  contextSliceSet = validateLoaded(contextSliceSet, "contextSliceSet");
  validateWorkBreakdownArtifact(workBreakdown.value, { ref: workBreakdown.ref });
  if (workBreakdown.value.kind !== "WorkBreakdownBaseline") {
    fail("workBreakdown must be a WorkBreakdownBaseline");
  }
  if (projectOverview.value.kind !== "ProjectOverviewBaseline") {
    fail("projectOverview must be a ProjectOverviewBaseline");
  }
  if (
    contextSliceSet.value?.kind !== "ContextSliceSet" ||
    !Array.isArray(contextSliceSet.value.slices)
  ) {
    fail("contextSliceSet must be a ContextSliceSet");
  }
  if (typeof resolveArtifact !== "function") {
    fail("resolveArtifact is required for declared context verification");
  }
  const workItemIds = workBreakdown.value.workItems.map(({ id }) => id).sort();
  const knownWorkItems = new Set(workItemIds);
  const seenSlices = new Set();
  const admittedSlices = [];
  for (const slice of [...contextSliceSet.value.slices].sort((a, b) =>
    a.id.localeCompare(b.id, "en"),
  )) {
    if (
      typeof slice.id !== "string" ||
      !/^CTX-[A-Z0-9-]+$/u.test(slice.id) ||
      seenSlices.has(slice.id)
    ) {
      fail("context slices require unique CTX IDs");
    }
    seenSlices.add(slice.id);
    if (typeof slice.purpose !== "string" || slice.purpose.length === 0) {
      fail(`context slice ${slice.id} requires a purpose`);
    }
    if (
      !Array.isArray(slice.coveredRefs) ||
      slice.coveredRefs.length === 0 ||
      slice.coveredRefs.some((id) => !knownWorkItems.has(id))
    ) {
      fail(`context slice ${slice.id} has missing or unknown coveredRefs`);
    }
    const source = validateLoaded(
      await resolveArtifact(structuredClone(slice.sourceArtifact)),
      `context slice ${slice.id} source`,
    );
    if (!sameRef(source.ref, slice.sourceArtifact)) {
      fail(`context slice ${slice.id} resolved another source artifact`);
    }
    if (source.value?.kind !== slice.sourceKind) {
      fail(`context slice ${slice.id} sourceKind does not match the source artifact`);
    }
    validateVersionPin(slice, source);
    const extractedContent = resolvePointer(source.value, slice.selector);
    const extractedContentDigest = canonicalJsonDigest(extractedContent);
    if (slice.extractedContentDigest !== extractedContentDigest) {
      fail(`context slice ${slice.id} extracted content drifted`);
    }
    admittedSlices.push({
      id: slice.id,
      purpose: slice.purpose,
      sourceArtifact: structuredClone(slice.sourceArtifact),
      sourceKind: slice.sourceKind,
      sourceVersion: structuredClone(slice.sourceVersion),
      selector: slice.selector,
      extractedContentDigest,
      coveredRefs: [...slice.coveredRefs].sort(),
      extractedContent: structuredClone(extractedContent),
    });
  }

  const material = {
    workBreakdownBaseline: structuredClone(workBreakdown.ref),
    projectOverviewBaseline: structuredClone(projectOverview.ref),
    contextSliceSet: structuredClone(contextSliceSet.ref),
    workItems: structuredClone(workBreakdown.value.workItems),
    contextSlices: admittedSlices,
  };
  const snapshot = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownAnalysisSnapshot",
    snapshotId: `WDAS-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    workItemIds,
    workItemsDigest: canonicalJsonDigest(workBreakdown.value.workItems),
    contentDigest: canonicalJsonDigest(material),
  };
  return immutable(snapshot);
}

export function createContextSlice({
  id,
  purpose,
  source,
  sourceKind,
  sourceVersion,
  selector,
  coveredRefs,
}) {
  source = validateLoaded(source, `context slice ${id} source`);
  const extracted = resolvePointer(source.value, selector);
  return immutable({
    id,
    purpose,
    sourceArtifact: structuredClone(source.ref),
    sourceKind,
    sourceVersion: structuredClone(sourceVersion),
    selector,
    extractedContentDigest: canonicalJsonDigest(extracted),
    coveredRefs: [...coveredRefs].sort(),
  });
}

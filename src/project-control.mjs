import { canonicalJsonDigest } from "./content-digest.mjs";

export class ProjectControlError extends Error {
  constructor(message, code = "DR7300") {
    super(`project control: ${message}`);
    this.name = "ProjectControlError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ProjectControlError(message, code); };
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
const stableIdentity = (value) => value.id ?? value.workItemId ?? value.artifactId ?? value.digest ?? canonicalJsonDigest(value);
const byId = (left, right) => stableIdentity(left).localeCompare(stableIdentity(right));
const list = (value, label) => {
  if (!Array.isArray(value)) fail(`${label} must be an array`, "DR7301");
  return structuredClone(value).sort(byId);
};

function normalizeSources({ projectId, lifecycle, workItems = [], dependencies = [], assignments = [], taskObservations = [], worktreeObservations = [], qualityAssessments = [], continuityRecords = [], verificationResults = [], traceabilityDiagnostics = [], roadmapRefs = [], memoryRefs = [], sourceRefs = [] } = {}) {
  if (typeof projectId !== "string" || !projectId || !lifecycle || typeof lifecycle !== "object") fail("projectId and lifecycle are required", "DR7301");
  return {
    projectId,
    lifecycle: structuredClone(lifecycle),
    workItems: list(workItems, "workItems"),
    dependencies: list(dependencies, "dependencies"),
    assignments: list(assignments, "assignments"),
    taskObservations: list(taskObservations, "taskObservations"),
    worktreeObservations: list(worktreeObservations, "worktreeObservations"),
    qualityAssessments: list(qualityAssessments, "qualityAssessments"),
    continuityRecords: list(continuityRecords, "continuityRecords"),
    verificationResults: list(verificationResults, "verificationResults"),
    traceabilityDiagnostics: list(traceabilityDiagnostics, "traceabilityDiagnostics"),
    roadmapRefs: list(roadmapRefs, "roadmapRefs"),
    memoryRefs: list(memoryRefs, "memoryRefs"),
    sourceRefs: list(sourceRefs, "sourceRefs"),
  };
}

export function createProjectControlSourceBundle(input = {}) {
  const material = normalizeSources(input);
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectControlSourceBundle", ...material, bundleDigest: canonicalJsonDigest(material) });
}

export function createProjectControlSnapshot(input = {}) {
  let sources;
  if (input?.kind === "ProjectControlSourceBundle") {
    const { apiVersion, kind, bundleDigest, ...material } = input;
    void apiVersion; void kind;
    if (!DIGEST.test(bundleDigest) || bundleDigest !== canonicalJsonDigest(material)) fail("source bundle digest drifted", "DR7302");
    sources = normalizeSources(material);
  } else {
    sources = normalizeSources(input);
  }
  const { projectId, lifecycle, workItems: items, dependencies: dependencyItems, assignments: assignmentItems, taskObservations: taskItems, worktreeObservations: worktreeItems, qualityAssessments: qualityItems, continuityRecords: continuityItems, verificationResults: verificationItems, traceabilityDiagnostics: traceItems, roadmapRefs, memoryRefs, sourceRefs } = sources;
  const itemIds = new Set(items.map(({ id }) => id));
  const diagnostics = [];
  for (const edge of dependencyItems) {
    if (!itemIds.has(edge.from) || !itemIds.has(edge.to)) diagnostics.push({ code: "unknown-dependency-endpoint", sourceRef: edge.id ?? `${edge.from}->${edge.to}` });
  }
  for (const assessment of qualityItems) {
    if (assessment.decision === "block") diagnostics.push({ code: "quality-obligations-missing", sourceRef: assessment.assessmentDigest ?? assessment.id });
  }
  for (const item of traceItems) diagnostics.push({ code: item.code ?? "traceability-diagnostic", sourceRef: item.sourceRef ?? item.id });
  const completed = items.filter(({ status }) => status === "completed").length;
  const blocked = items.filter(({ status }) => status === "blocked").length;
  const exactReuse = continuityItems.filter(({ disposition, decision }) => disposition === "reuse-exact" || decision === "reuse-exact").length;
  const material = {
    projectId,
    lifecycle: structuredClone(lifecycle),
    frontier: items.filter(({ status }) => status === "ready").map(({ id }) => id).sort(),
    counts: { total: items.length, completed, blocked, remaining: items.length - completed },
    dependencyHealth: { edgeCount: dependencyItems.length, invalidEndpointCount: diagnostics.filter(({ code }) => code === "unknown-dependency-endpoint").length },
    qualityHealth: { assessmentCount: qualityItems.length, blockedCount: diagnostics.filter(({ code }) => code === "quality-obligations-missing").length },
    continuity: { recordCount: continuityItems.length, exactReuseCount: exactReuse },
    observations: { assignments: assignmentItems.length, tasks: taskItems.length, worktrees: worktreeItems.length, verificationResults: verificationItems.length },
    diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code) || String(a.sourceRef).localeCompare(String(b.sourceRef))),
    references: { roadmap: roadmapRefs, memory: memoryRefs, sources: sourceRefs },
    authority: { readOnly: true, gates: false, readiness: false, integration: false, memoryPromotion: false, graphActivation: false },
  };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectControlSnapshot", ...material, snapshotDigest: canonicalJsonDigest(material) });
}

export function verifyProjectControlSnapshot(snapshot) {
  if (!snapshot || snapshot.kind !== "ProjectControlSnapshot") fail("snapshot is required", "DR7302");
  const { apiVersion, kind, snapshotDigest, ...material } = snapshot;
  void apiVersion; void kind;
  if (!DIGEST.test(snapshotDigest) || snapshotDigest !== canonicalJsonDigest(material)) fail("snapshot digest drifted", "DR7302");
  if (!snapshot.authority.readOnly || Object.entries(snapshot.authority).some(([key, value]) => key !== "readOnly" && value !== false)) fail("snapshot acquired authority", "DR7303");
  return true;
}

export function assessProjectProductivity({ snapshot, measurements = [] } = {}) {
  verifyProjectControlSnapshot(snapshot);
  if (!Array.isArray(measurements)) fail("measurements must be an array", "DR7301");
  const values = measurements.map((item) => {
    if (!Number.isFinite(item.durationMilliseconds) || item.durationMilliseconds < 0 || typeof item.operation !== "string" || !item.operation) fail("measurement is invalid", "DR7301");
    return structuredClone(item);
  }).sort((a, b) => a.operation.localeCompare(b.operation) || a.durationMilliseconds - b.durationMilliseconds);
  const durations = values.map(({ durationMilliseconds }) => durationMilliseconds).sort((a, b) => a - b);
  const percentile = (ratio) => durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * ratio) - 1)] : null;
  const material = {
    projectControlSnapshotDigest: snapshot.snapshotDigest,
    sampleCount: values.length,
    p50Milliseconds: percentile(0.5),
    p95Milliseconds: percentile(0.95),
    measurements: values,
    scope: "local-observation-only",
    universalPerformanceClaim: false,
  };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectProductivityAssessment", ...material, assessmentDigest: canonicalJsonDigest(material) });
}

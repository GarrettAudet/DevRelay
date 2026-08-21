import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { ROADMAP_ARTIFACT_CONTRACTS, validateRoadmapArtifact } from "./roadmap-management-artifact-validator.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const REQUIRED_ROLES = Object.freeze([
  "project-overview",
  "project-overview-projection",
  "project-memory-baseline",
  "current-synopsis",
  "traceability-context",
  "lifecycle-status",
]);

export class SessionBootstrapError extends Error {
  constructor(message, diagnostics = []) {
    super(`session bootstrap failed: ${message}`);
    this.name = "SessionBootstrapError";
    this.code = "DR5230";
    this.diagnostics = [...diagnostics];
  }
}

const fail = (message, diagnostics) => { throw new SessionBootstrapError(message, diagnostics); };
const withDigest = (value) => ({ ...value, contentDigest: canonicalJsonDigest(value) });
const refForSnapshot = (snapshot) => {
  const bytes = Buffer.from(canonicalJson(snapshot), "utf8");
  return {
    artifactId: snapshot.snapshotId,
    ...ROADMAP_ARTIFACT_CONTRACTS.SessionContextSnapshot,
    digest: sha256Digest(bytes),
    uri: `memory://devrelay/session-context/${encodeURIComponent(snapshot.snapshotId)}.json`,
  };
};

function sortedBindings(bindings) {
  const sorted = structuredClone(bindings).sort((a, b) => a.role.localeCompare(b.role, "en"));
  const seen = new Set();
  for (const binding of sorted) {
    if (seen.has(binding.role)) fail(`context role ${binding.role} is duplicated`);
    seen.add(binding.role);
  }
  return sorted;
}

export function createSessionContextSnapshot({
  projectId,
  taskId,
  workspaceId,
  repositoryRevision,
  bindings,
  roadmapDisposition,
  createdAt,
}) {
  const sorted = sortedBindings(bindings);
  const roles = new Set(sorted.map(({ role }) => role));
  for (const role of REQUIRED_ROLES) if (!roles.has(role)) fail(`required context role ${role} is missing`);
  if (roadmapDisposition === "initialized" && (!roles.has("roadmap") || !roles.has("roadmap-projection"))) fail("initialized project lacks roadmap baseline or projection context");
  if (roadmapDisposition === "RoadmapNotInitialized" && (roles.has("roadmap") || roles.has("roadmap-projection"))) fail("RoadmapNotInitialized cannot include roadmap baseline or projection bindings");
  const material = {
    apiVersion: API_VERSION,
    kind: "SessionContextSnapshot",
    snapshotId: `SESSION-${canonicalJsonDigest({ projectId, taskId, workspaceId, repositoryRevision, bindings: sorted, roadmapDisposition, createdAt }).slice(7, 23).toUpperCase()}`,
    projectId,
    taskId,
    workspaceId,
    repositoryRevision,
    bindings: sorted,
    roadmapDisposition,
    createdAt,
  };
  const snapshot = withDigest(material);
  validateRoadmapArtifact(snapshot);
  return Object.freeze(snapshot);
}

export async function executeSessionBootstrap({
  snapshot,
  artifactResolver,
  expectedProjectId,
  expectedTaskId,
  expectedWorkspaceId,
  expectedRepositoryRevision,
  cache = "cold",
  durationMs = 0,
}) {
  validateRoadmapArtifact(snapshot);
  const diagnostics = [];
  if (snapshot.projectId !== expectedProjectId) diagnostics.push("project identity mismatch");
  if (snapshot.taskId !== expectedTaskId) diagnostics.push("task identity mismatch");
  if (snapshot.workspaceId !== expectedWorkspaceId) diagnostics.push("workspace identity mismatch");
  if (snapshot.repositoryRevision !== expectedRepositoryRevision) diagnostics.push("repository revision mismatch");
  const validatedBindings = [];
  for (const binding of snapshot.bindings) {
    try {
      const loaded = await artifactResolver(binding.artifact);
      const rawBytes = Buffer.isBuffer(loaded) || ArrayBuffer.isView(loaded)
        ? loaded
        : loaded?.bytes;
      if (!Buffer.isBuffer(rawBytes) && !ArrayBuffer.isView(rawBytes)) {
        throw new Error("artifact bytes unavailable");
      }
      const bytes = Buffer.from(rawBytes.buffer ?? rawBytes, rawBytes.byteOffset ?? 0, rawBytes.byteLength ?? rawBytes.length);
      if (sha256Digest(bytes) !== binding.artifact.digest) throw new Error("artifact digest mismatch");
      validatedBindings.push(structuredClone(binding));
    } catch (error) {
      diagnostics.push(`${binding.role}: ${error.message}`);
    }
  }
  const outcome = diagnostics.length > 0
    ? "fail"
    : snapshot.roadmapDisposition === "RoadmapNotInitialized"
      ? "RoadmapNotInitialized"
      : "pass";
  const snapshotRef = refForSnapshot(snapshot);
  const material = {
    apiVersion: API_VERSION,
    kind: "SessionContextReceipt",
    receiptId: `SESSION-RECEIPT-${canonicalJsonDigest({ snapshotRef, outcome, durationMs, cache, diagnostics }).slice(7, 23).toUpperCase()}`,
    snapshot: snapshotRef,
    projectId: snapshot.projectId,
    taskId: snapshot.taskId,
    workspaceId: snapshot.workspaceId,
    repositoryRevision: snapshot.repositoryRevision,
    roadmapDisposition: snapshot.roadmapDisposition,
    outcome,
    durationMs,
    cache,
    validatedBindings,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    moduleExecutionAllowed: outcome !== "fail",
  };
  const receipt = withDigest(material);
  validateRoadmapArtifact(receipt);
  return Object.freeze(receipt);
}

export function assertSessionContextReceipt({ receipt, snapshot, currentBindings, currentRepositoryRevision }) {
  validateRoadmapArtifact(snapshot);
  validateRoadmapArtifact(receipt);
  if (receipt.outcome === "fail" || !receipt.moduleExecutionAllowed) fail("session receipt does not allow module execution", receipt.diagnostics);
  const snapshotRef = refForSnapshot(snapshot);
  if (receipt.snapshot.digest !== snapshotRef.digest || receipt.snapshot.artifactId !== snapshot.snapshotId) fail("receipt does not bind the exact snapshot");
  if (receipt.repositoryRevision !== currentRepositoryRevision) fail("receipt repository revision is stale");
  const expected = sortedBindings(currentBindings);
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(snapshot.bindings)) fail("session context is stale after a baseline or Gate change");
  return true;
}

export async function refreshSessionContext({ priorReceipt, nextSnapshot, ...execution }) {
  validateRoadmapArtifact(priorReceipt);
  const refreshed = await executeSessionBootstrap({ snapshot: nextSnapshot, ...execution });
  if (refreshed.outcome === "fail") fail("next-boundary context refresh failed", refreshed.diagnostics);
  if (refreshed.snapshot.digest === priorReceipt.snapshot.digest) fail("refresh did not produce a new bound context snapshot");
  return refreshed;
}

export const DEVRELAY_SESSION_REQUIRED_CONTEXT_ROLES = REQUIRED_ROLES;

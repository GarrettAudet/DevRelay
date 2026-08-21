import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  loadProjectMemoryArtifact,
  routeProjectMemoryOperation,
} from "./project-memory.mjs";
import {
  validateProjectMemoryArtifact,
  withProjectMemoryContentDigest,
} from "./project-memory-artifact-validator.mjs";

export class ProjectMemoryContextError extends Error {
  constructor(message, code = "DR5330") {
    super(`project memory context failed: ${message}`);
    this.name = "ProjectMemoryContextError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ProjectMemoryContextError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const sameRef = (a, b) => a?.artifactId === b?.artifactId && a?.schema === b?.schema && a?.mediaType === b?.mediaType && a?.digest === b?.digest && a?.uri === b?.uri;

function verifyLoaded(loaded, expected, label) {
  if (!loaded || (!Buffer.isBuffer(loaded.bytes) && !ArrayBuffer.isView(loaded.bytes))) fail(`${label} loader must return raw bytes`, "DR5331");
  const bytes = Buffer.from(loaded.bytes);
  if (!sameRef(loaded.ref, expected) || sha256Digest(bytes) !== expected.digest) {
    fail(`${label} bytes or identity drifted`, "DR5331");
  }
  return { ...loaded, bytes };
}

export function createProjectMemorySessionState({ projectId, sessionId, taskId, status, baseline, graphCheckpoint, lastCheckpointDigest, updatedAt, abandonmentRationale } = {}) {
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectMemorySessionState",
    stateId: `PMSS-${canonicalJsonDigest({ projectId, sessionId, taskId }).slice(7, 23).toUpperCase()}`,
    projectId,
    sessionId,
    taskId,
    status,
    baseline: structuredClone(baseline),
    graphCheckpoint: structuredClone(graphCheckpoint),
    lastCheckpointDigest,
    updatedAt,
    ...(abandonmentRationale ? { abandonmentRationale } : {}),
  }));
}

export function createProjectMemoryContextBootstrap({ loadArtifact, runtime, clock = () => new Date().toISOString() } = {}) {
  if (typeof loadArtifact !== "function" || typeof runtime?.execute !== "function") fail("loadArtifact and runtime.execute are required");
  return Object.freeze({
    async load(request) {
      const route = routeProjectMemoryOperation({
        requestedOperation: request.operation ?? "load-context",
        currentSession: request.currentSession,
        taskId: request.taskId,
        contextStale: request.contextStale,
      });
      if (route.outcome === "blocked") return route;
      const order = [];
      const synopsis = verifyLoaded(await loadArtifact(request.synopsisProjection, "synopsis"), request.synopsisProjection, "synopsis");
      order.push("current-synopsis");
      const baselineLoaded = verifyLoaded(await loadArtifact(request.projectMemoryBaseline, "baseline"), request.projectMemoryBaseline, "baseline");
      order.push("project-memory-baseline");
      const traceLoaded = verifyLoaded(await loadArtifact(request.traceabilityProjection, "traceability"), request.traceabilityProjection, "traceability projection");
      order.push("traceability-context");
      const baselineValue = baselineLoaded.value ?? JSON.parse(baselineLoaded.bytes);
      const traceValue = traceLoaded.value ?? JSON.parse(traceLoaded.bytes);
      validateProjectMemoryArtifact(baselineValue, { ref: baselineLoaded.ref });
      validateProjectMemoryArtifact(traceValue, { ref: traceLoaded.ref });
      const result = await runtime.execute({
        ...request,
        requestedOperation: route.operation,
        projectMemoryBaseline: loadProjectMemoryArtifact(baselineValue, baselineLoaded.ref.uri),
        traceabilityProjection: loadProjectMemoryArtifact(traceValue, traceLoaded.ref.uri),
        synopsisProjection: synopsis.ref,
      });
      const receipt = immutable({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ProjectMemoryContextLoadReceipt",
        receiptId: `PMCLR-${canonicalJsonDigest({ taskId: request.taskId, execution: result.executionFingerprint, order }).slice(7, 23).toUpperCase()}`,
        taskId: request.taskId,
        workspaceId: request.workspaceId,
        repositoryRevision: request.repositoryRevision,
        operation: route.operation,
        loadOrder: order,
        bindings: [synopsis.ref, baselineLoaded.ref, traceLoaded.ref],
        cache: request.cache ?? "cold",
        durationMs: request.durationMs ?? 0,
        loadedAt: clock(),
        outcome: "pass",
        contentDigest: canonicalJsonDigest({ taskId: request.taskId, operation: route.operation, order, bindings: [synopsis.ref, baselineLoaded.ref, traceLoaded.ref] }),
      });
      return immutable({ outcome: "pass", route, bundle: result.context, providerReceipt: result.providerReceipt, receipt, replayed: result.replayed });
    },
  });
}

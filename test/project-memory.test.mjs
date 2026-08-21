import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  assembleMemoryContext,
  createInMemoryProjectMemoryCheckpointStore,
  createInMemoryProjectMemoryStore,
  createMemoryUpdateCandidate,
  createProjectMemoryRuntime,
  loadProjectMemoryArtifact,
  projectMemoryNamespace,
  resolveMemoryChangeRoutes,
  retrieveNativeProjectMemory,
  routeProjectMemoryOperation,
  verifyNativeMemoryEquivalence,
} from "../src/project-memory.mjs";
import { withProjectMemoryContentDigest } from "../src/project-memory-artifact-validator.mjs";

const D = `sha256:${"a".repeat(64)}`;
const D2 = `sha256:${"b".repeat(64)}`;
const at = "2026-08-20T12:00:00Z";
const ref = (artifactId, overrides = {}) => ({
  artifactId,
  schema: "https://devrelay.dev/artifacts/test/v1",
  mediaType: "application/json",
  digest: D,
  uri: `devrelay://test/${artifactId}`,
  ...overrides,
});
const sourceRef = (artifactId) => ({
  role: "test-source",
  artifact: ref(artifactId),
});
const record = (id, statement, effectiveAt = at, overrides = {}) => ({
  id,
  category: "direction",
  statement,
  authority: "approved-project",
  status: "active",
  effectiveAt,
  domain: "project-memory",
  sourceRefs: [sourceRef(`SOURCE-${id}`)],
  ...overrides,
});
const graphCheckpoint = ref("GRAPH-1");
const baselineValue = withProjectMemoryContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectMemoryBaseline",
  baselineId: "PMB-1",
  projectId: "devrelay",
  version: "1.0.0",
  approvedCandidate: ref("MUC-0"),
  records: [
    record("MEM-DIRECTION", "Keep the orchestration deterministic."),
    record(
      "MEM-STATUS",
      "ProjectMemory implementation is active.",
      "2026-08-20T13:00:00Z",
      { category: "status", authority: "validated-status", domain: "execution" },
    ),
  ],
  graphCheckpoint,
  projectionDigest: D,
  approvalEvidence: [ref("APPROVAL-1")],
  sourceRefs: [sourceRef("SOURCE-BASELINE")],
});
const baseline = loadProjectMemoryArtifact(baselineValue);
const traceValue = withProjectMemoryContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityContextProjection",
  projectionId: "TRACE-PROJECTION-1",
  graphCheckpoint,
  graphVersion: "1.6.0",
  scope: ["WI-PM-NATIVE-ENGINE"],
  lifecyclePosition: "work-execution",
  nodes: [
    {
      id: "WI-PM-NATIVE-ENGINE",
      kind: "work-item",
      label: "Native engine",
      sourceRefs: [sourceRef("SOURCE-WORK")],
    },
  ],
  edges: [],
  diagnostics: [],
});
const trace = loadProjectMemoryArtifact(traceValue);
const synopsisRef = ref("CURRENT-SYNOPSIS", {
  schema: "https://devrelay.dev/artifacts/current-synopsis/v1",
  mediaType: "text/markdown",
});

test("namespaces are deterministic, scoped, and reject implicit hierarchy", () => {
  assert.equal(
    projectMemoryNamespace({
      projectId: "devrelay",
      sessionId: "S-1",
      moduleId: "work-execution",
      invocationId: "INV-1",
    }),
    "project/devrelay/session/S-1/module/work-execution/invocation/INV-1",
  );
  assert.throws(
    () => projectMemoryNamespace({ projectId: "../escape" }),
    /safe non-empty identity/u,
  );
  assert.throws(
    () => projectMemoryNamespace({ projectId: "devrelay", moduleId: "module" }),
    /requires sessionId/u,
  );
});

test("routing blocks a fresh task behind an unconcluded session", () => {
  assert.deepEqual(
    routeProjectMemoryOperation({
      requestedOperation: "load-context",
      taskId: "NEW",
      currentSession: { sessionId: "S-OLD", taskId: "OLD", status: "open" },
    }),
    {
      operation: "recovery-required",
      outcome: "blocked",
      allowedActions: ["resume", "conclude", "abandon"],
      blockingSessionId: "S-OLD",
    },
  );
  assert.deepEqual(
    routeProjectMemoryOperation({
      requestedOperation: "load-context",
      taskId: "TASK",
      contextStale: true,
    }),
    { operation: "refresh-context", outcome: "routed" },
  );
});

test("candidate construction is byte-stable and cross-domain deltas route to their owners", () => {
  const changes = [
    {
      changeId: "CHANGE-REQ",
      disposition: "add",
      qualitative: true,
      domain: "requirements",
      proposedMemory: record("MEM-REQ", "A requirement changed.", at, {
        authority: "approved-domain",
        domain: "requirements",
      }),
      rationale: "The task discovered a requirements delta.",
      sourceRefs: [sourceRef("SOURCE-REQ")],
    },
    {
      changeId: "CHANGE-STATUS",
      disposition: "add",
      qualitative: false,
      domain: "execution",
      proposedMemory: record("MEM-EXEC", "The work item completed.", at, {
        category: "status",
        authority: "validated-status",
        domain: "execution",
      }),
      rationale: "Validated execution evidence records completion.",
      sourceRefs: [sourceRef("SOURCE-EXEC")],
    },
  ];
  const request = {
    projectId: "devrelay",
    sessionId: "S-1",
    taskId: "TASK-1",
    baseBaseline: baseline.ref,
    baseGraphCheckpoint: graphCheckpoint,
    producerType: "main",
    changes,
    sourceRefs: [sourceRef("SOURCE-CANDIDATE")],
  };
  const first = createMemoryUpdateCandidate(request);
  const second = createMemoryUpdateCandidate(request);
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(resolveMemoryChangeRoutes(first), [
    {
      changeId: "CHANGE-REQ",
      domain: "requirements",
      blocking: true,
      nextModule: "requirements-gathering",
      reason:
        "The proposed memory delta changes authoritative requirements state and must be resolved by its owning Module and Gate.",
    },
    {
      changeId: "CHANGE-STATUS",
      domain: "execution",
      blocking: false,
      nextModule: "project-memory-gate",
      reason: "The proposed delta remains within ProjectMemoryGate authority.",
    },
  ]);
});

test("native retrieval is deterministic and preserves exact citations", () => {
  const first = retrieveNativeProjectMemory({
    baseline: baselineValue,
    query: "deterministic orchestration",
  });
  const second = retrieveNativeProjectMemory({
    baseline: baselineValue,
    query: "deterministic orchestration",
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first.items.map(({ memoryId }) => memoryId), ["MEM-DIRECTION"]);
  assert.equal(first.citations[0].sourceRef.artifact.artifactId, "SOURCE-MEM-DIRECTION");
});

test("native equivalence fails closed when any active identity is omitted", () => {
  const result = verifyNativeMemoryEquivalence({
    baseline: baselineValue,
    items: [{ memoryId: "MEM-DIRECTION" }],
  });
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.missingMemoryIds, ["MEM-STATUS"]);
});

test("context assembly gives approved authority precedence over newer session and provider claims", () => {
  const retrieval = retrieveNativeProjectMemory({
    baseline: baselineValue,
    query: "",
  });
  const receiptValue = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "MemoryProviderReceipt",
    receiptId: "MPR-1",
    providerId: "devrelay.native-project-memory",
    providerVersion: "1.0.0",
    operation: "retrieve",
    namespace: "project/devrelay/session/S-1/module/work-execution/invocation/INV-1",
    configurationDigest: D,
    inputCheckpoints: [baseline.ref, trace.ref],
    queryDigest: D2,
    commandFingerprint: D,
    outcome: "native-equivalent",
    durationMs: 0,
    replayed: false,
    citations: retrieval.citations,
    outputDigest: canonicalJsonDigest(retrieval.items),
  });
  const receipt = loadProjectMemoryArtifact(receiptValue);
  const bundle = assembleMemoryContext({
    projectId: "devrelay",
    sessionId: "S-1",
    taskId: "TASK-1",
    moduleInvocationId: "INV-1",
    projectMemoryBaseline: baseline,
    synopsisProjection: synopsisRef,
    traceabilityProjection: trace,
    providerReceipt: receipt,
    providerItems: [
      {
        memoryId: "MEM-DIRECTION",
        statement: "A provider tried to replace authority.",
        authorityRank: 2,
        effectiveAt: "2026-08-20T15:00:00Z",
        sourceRefs: [sourceRef("PROVIDER")],
      },
    ],
    sessionItems: [
      {
        memoryId: "MEM-DIRECTION",
        statement: "A recent session tried to replace authority.",
        authorityRank: 1,
        effectiveAt: "2026-08-20T16:00:00Z",
        sourceRefs: [sourceRef("SESSION")],
      },
    ],
  });
  assert.equal(bundle.items[0].memoryId, "MEM-STATUS");
  assert.equal(
    bundle.items.find(({ memoryId }) => memoryId === "MEM-DIRECTION").statement,
    "Keep the orchestration deterministic.",
  );
  assert.ok(bundle.items.every(({ authorityRank }) => authorityRank === 0));
});

test("the native store preserves immutable history and enforces head CAS", () => {
  const store = createInMemoryProjectMemoryStore();
  assert.deepEqual(store.putBaseline(baseline), baseline.ref);
  assert.deepEqual(store.head("devrelay"), baseline.ref);
  assert.deepEqual(store.history("devrelay"), [baseline.ref]);
  assert.throws(
    () => store.putBaseline(baseline, { ...baseline.ref, digest: D2 }),
    /head changed/u,
  );
  assert.equal(store.get(baseline.ref.digest).bytes.equals(baseline.bytes), true);
});

test("runtime checkpoints provider output and replay invokes zero providers", async () => {
  let calls = 0;
  const native = retrieveNativeProjectMemory({ baseline: baselineValue, query: "" });
  const runtime = createProjectMemoryRuntime({
    checkpoints: createInMemoryProjectMemoryCheckpointStore(),
    provider: {
      id: "mem0.local",
      version: "1.0.0",
      configurationDigest: D,
      async retrieve() {
        calls += 1;
        return native;
      },
    },
  });
  const request = {
    executionId: "PM-EXEC-1",
    requestedOperation: "load-context",
    projectId: "devrelay",
    sessionId: "S-1",
    taskId: "TASK-1",
    moduleId: "work-execution",
    moduleInvocationId: "INV-1",
    projectMemoryBaseline: baseline,
    synopsisProjection: synopsisRef,
    traceabilityProjection: trace,
    query: "",
  };
  const first = await runtime.execute(request);
  const replay = await runtime.execute(request);
  assert.equal(first.outcome, "context-loaded");
  assert.equal(first.providerCalls, 1);
  assert.equal(replay.replayed, true);
  assert.equal(replay.providerCalls, 0);
  assert.equal(calls, 1);
  assert.equal(first.context.ref.digest, replay.context.ref.digest);
  assert.equal(first.checkpoint.checkpointDigest, replay.checkpoint.checkpointDigest);
});

test("provider failure proceeds only through a complete verified native equivalent", async () => {
  let calls = 0;
  const runtime = createProjectMemoryRuntime({
    provider: {
      id: "mem0.local",
      version: "1.0.0",
      configurationDigest: D,
      async retrieve() {
        calls += 1;
        throw new Error("Mem0 unavailable");
      },
    },
  });
  const result = await runtime.execute({
    executionId: "PM-EXEC-FALLBACK",
    requestedOperation: "load-context",
    projectId: "devrelay",
    sessionId: "S-1",
    taskId: "TASK-1",
    moduleId: "work-execution",
    moduleInvocationId: "INV-1",
    projectMemoryBaseline: baseline,
    synopsisProjection: synopsisRef,
    traceabilityProjection: trace,
    query: "anything",
  });
  assert.equal(calls, 1);
  assert.equal(result.providerReceipt.value.outcome, "native-equivalent");
  assert.match(result.context.value.diagnostics[0], /Mem0 unavailable/u);
  assert.deepEqual(
    result.context.value.items.map(({ memoryId }) => memoryId).sort(),
    ["MEM-DIRECTION", "MEM-STATUS"],
  );
});

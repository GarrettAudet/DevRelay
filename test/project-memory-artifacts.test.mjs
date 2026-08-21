import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  PROJECT_MEMORY_ARTIFACT_CONTRACTS,
  validateProjectMemoryArtifact,
  withProjectMemoryContentDigest,
} from "../src/project-memory-artifact-validator.mjs";

const DIGEST = `sha256:${"1".repeat(64)}`;
const DIGEST_2 = `sha256:${"2".repeat(64)}`;
const at = "2026-08-20T12:00:00Z";

const ref = (artifactId, contract = {}) => ({
  artifactId,
  schema: contract.schema ?? "https://devrelay.dev/artifacts/example/v1",
  mediaType: contract.mediaType ?? "application/json",
  digest: DIGEST,
  uri: `devrelay://test/${artifactId}`,
});
const sourceRef = (artifactId = "SOURCE-1") => ({
  role: "test-source",
  artifact: ref(artifactId),
});
const record = (id, overrides = {}) => ({
  id,
  category: "direction",
  statement: `Approved direction ${id}`,
  authority: "approved-project",
  status: "active",
  effectiveAt: at,
  domain: "project-memory",
  sourceRefs: [sourceRef(`SOURCE-${id}`)],
  ...overrides,
});
const baselineMaterial = (records = [record("MEM-1")]) => ({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectMemoryBaseline",
  baselineId: "PMB-001",
  projectId: "devrelay",
  version: "1.0.0",
  approvedCandidate: ref("MUC-001"),
  records,
  graphCheckpoint: ref("GRAPH-1"),
  projectionDigest: DIGEST,
  approvalEvidence: [ref("APPROVAL-1")],
  sourceRefs: [sourceRef()],
});
const baseline = (records) => withProjectMemoryContentDigest(baselineMaterial(records));
const candidateMaterial = (changes, overrides = {}) => ({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "MemoryUpdateCandidate",
  candidateId: "MUC-001",
  projectId: "devrelay",
  sessionId: "SESSION-1",
  taskId: "TASK-1",
  baseBaseline: ref("PMB-BASE"),
  baseGraphCheckpoint: ref("GRAPH-BASE"),
  producerType: "main",
  changes,
  sourceRefs: [sourceRef()],
  ...overrides,
});
const candidate = (changes, overrides) =>
  withProjectMemoryContentDigest(candidateMaterial(changes, overrides));
const addChange = {
  changeId: "CHANGE-1",
  disposition: "add",
  qualitative: true,
  domain: "project-memory",
  proposedMemory: record("MEM-2"),
  rationale: "This direction was explicitly approved.",
  sourceRefs: [sourceRef()],
};

test("ProjectMemory baseline has strict content-addressed identity", () => {
  const value = baseline();
  assert.equal(validateProjectMemoryArtifact(value), value);
  assert.equal(
    validateProjectMemoryArtifact(value, {
      ref: ref(value.baselineId, PROJECT_MEMORY_ARTIFACT_CONTRACTS.ProjectMemoryBaseline),
    }),
    value,
  );
  assert.throws(
    () => validateProjectMemoryArtifact({ ...value, projectId: "substituted" }),
    /contentDigest does not bind canonical content/u,
  );
});

test("candidate dispositions enforce explicit target and proposal semantics", () => {
  assert.equal(validateProjectMemoryArtifact(candidate([addChange])).kind, "MemoryUpdateCandidate");
  const replacement = {
    ...addChange,
    changeId: "CHANGE-2",
    disposition: "replace",
    targetMemoryId: "MEM-1",
  };
  assert.equal(validateProjectMemoryArtifact(candidate([replacement])).kind, "MemoryUpdateCandidate");
  assert.throws(
    () => {
      const { targetMemoryId: _targetMemoryId, ...withoutTarget } = replacement;
      return validateProjectMemoryArtifact(candidate([withoutTarget]));
    },
    /schema|requires targetMemoryId/u,
  );
  const retain = {
    changeId: "CHANGE-3",
    disposition: "retain",
    qualitative: true,
    domain: "project-memory",
    targetMemoryId: "MEM-1",
    rationale: "The approved direction remains current.",
    sourceRefs: [sourceRef()],
  };
  assert.equal(validateProjectMemoryArtifact(candidate([retain])).kind, "MemoryUpdateCandidate");
});

test("workers are candidate-only and bind a parent task", () => {
  assert.throws(
    () => validateProjectMemoryArtifact(candidate([addChange], { producerType: "worker" })),
    /parentTaskId/u,
  );
  const worker = candidate([addChange], {
    producerType: "worker",
    parentTaskId: "PARENT-1",
  });
  assert.equal(validateProjectMemoryArtifact(worker), worker);
});

test("candidate validation detects baseline and graph drift", () => {
  const value = candidate([addChange]);
  assert.throws(
    () =>
      validateProjectMemoryArtifact(value, {
        currentBaselineRef: { ...value.baseBaseline, digest: DIGEST_2 },
      }),
    /baseBaseline has drifted/u,
  );
  assert.throws(
    () =>
      validateProjectMemoryArtifact(value, {
        currentGraphCheckpoint: { ...value.baseGraphCheckpoint, digest: DIGEST_2 },
      }),
    /baseGraphCheckpoint has drifted/u,
  );
});

test("ProjectMemoryGate approval dispositions every exact candidate change", () => {
  const memoryCandidate = candidate([addChange]);
  const candidateRef = ref(
    memoryCandidate.candidateId,
    PROJECT_MEMORY_ARTIFACT_CONTRACTS.MemoryUpdateCandidate,
  );
  const approval = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectMemoryGateApproval",
    approvalId: "PM-APPROVAL-1",
    authority: "project-owner",
    candidate: candidateRef,
    baseBaseline: memoryCandidate.baseBaseline,
    decisions: [{ changeId: "CHANGE-1", decision: "approve" }],
    terminalCheckpointDigest: DIGEST,
    policyVersion: "project-memory-gate/1.0.0",
  });
  assert.equal(
    validateProjectMemoryArtifact(approval, {
      candidate: memoryCandidate,
      candidateRef,
    }),
    approval,
  );
  const incomplete = withProjectMemoryContentDigest({ ...approval, decisions: [] });
  assert.throws(
    () =>
      validateProjectMemoryArtifact(incomplete, {
        candidate: memoryCandidate,
        candidateRef,
      }),
    /every candidate change/u,
  );
});

test("provider retrieval receipts require contiguous citations and failure diagnostics", () => {
  const provider = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "MemoryProviderReceipt",
    receiptId: "PROVIDER-RECEIPT-1",
    providerId: "mem0.local",
    providerVersion: "1.0.0",
    operation: "retrieve",
    namespace: "project/devrelay/session/1",
    configurationDigest: DIGEST,
    inputCheckpoints: [ref("PMB-1"), ref("GRAPH-1")],
    queryDigest: DIGEST_2,
    commandFingerprint: DIGEST,
    outcome: "pass",
    durationMs: 4,
    replayed: false,
    citations: [{ rank: 1, sourceRef: sourceRef(), score: 1 }],
    outputDigest: DIGEST,
  });
  assert.equal(validateProjectMemoryArtifact(provider), provider);
  assert.throws(
    () => validateProjectMemoryArtifact(withProjectMemoryContentDigest({ ...provider, citations: [] })),
    /lacks citations/u,
  );
  const failed = withProjectMemoryContentDigest({
    ...provider,
    outcome: "fail",
    citations: [],
    diagnostics: ["provider unavailable"],
  });
  assert.equal(validateProjectMemoryArtifact(failed), failed);
});

test("trace projections reject orphaned endpoints", () => {
  const projection = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "TraceabilityContextProjection",
    projectionId: "TRACE-PROJECTION-1",
    graphCheckpoint: ref("GRAPH-1"),
    graphVersion: "1.6.0",
    scope: ["WI-PM-ARTIFACT-CONTRACTS"],
    lifecyclePosition: "work-execution",
    nodes: [
      { id: "AC-1", kind: "acceptance-criterion", label: "criterion", sourceRefs: [sourceRef()] },
      { id: "WI-1", kind: "work-item", label: "work", sourceRefs: [sourceRef()] },
    ],
    edges: [{ id: "EDGE-1", from: "AC-1", kind: "planned-by", to: "WI-1" }],
    diagnostics: [],
  });
  assert.equal(validateProjectMemoryArtifact(projection), projection);
  const orphan = withProjectMemoryContentDigest({
    ...projection,
    edges: [{ id: "EDGE-1", from: "AC-1", kind: "planned-by", to: "MISSING" }],
  });
  assert.throws(() => validateProjectMemoryArtifact(orphan), /omitted node/u);
});

test("context bundles enforce authority before recency", () => {
  const item = (memoryId, authorityRank, effectiveAt) => ({
    memoryId,
    statement: memoryId,
    authorityRank,
    effectiveAt,
    sourceRefs: [sourceRef(memoryId)],
  });
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "MemoryContextBundle",
    bundleId: "MCB-1",
    projectId: "devrelay",
    sessionId: "SESSION-1",
    taskId: "TASK-1",
    moduleInvocationId: "INV-1",
    projectMemoryBaseline: ref("PMB-1"),
    synopsisProjection: ref("SYNOPSIS-1"),
    traceabilityProjection: ref("TRACE-1"),
    providerReceipt: ref("PROVIDER-1"),
    items: [
      item("APPROVED-NEW", 0, "2026-08-20T12:00:00Z"),
      item("APPROVED-OLD", 0, "2026-08-19T12:00:00Z"),
      item("SESSION", 1, "2026-08-20T13:00:00Z"),
    ],
    freshness: "fresh",
    diagnostics: [],
  };
  assert.equal(validateProjectMemoryArtifact(withProjectMemoryContentDigest(material)).kind, "MemoryContextBundle");
  assert.throws(
    () =>
      validateProjectMemoryArtifact(
        withProjectMemoryContentDigest({ ...material, items: [...material.items].reverse() }),
      ),
    /authority-before-recency|recency ordering/u,
  );
});

test("synopsis receipts prove complete active-memory coverage", () => {
  const memoryBaseline = baseline([
    record("MEM-1"),
    record("MEM-2", { status: "retained" }),
    record("MEM-3", { status: "superseded" }),
  ]);
  const receipt = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "SynopsisProjectionReceipt",
    receiptId: "SYNOPSIS-RECEIPT-1",
    baseline: ref("PMB-001"),
    projection: ref("CURRENT-SYNOPSIS"),
    projectionDigest: DIGEST,
    coverageIds: ["MEM-1", "MEM-2"],
    format: "utf8-nfc-lf",
  });
  assert.equal(validateProjectMemoryArtifact(receipt, { baseline: memoryBaseline }), receipt);
  assert.throws(
    () =>
      validateProjectMemoryArtifact(
        withProjectMemoryContentDigest({ ...receipt, coverageIds: ["MEM-1"] }),
        { baseline: memoryBaseline },
      ),
    /active or retained memory record/u,
  );
});

test("conclusion and conclude receipts bind worker parents and provider synchronization", () => {
  const conclusion = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "SessionConclusion",
    conclusionId: "CONCLUSION-1",
    projectId: "devrelay",
    sessionId: "SESSION-1",
    taskId: "WORKER-1",
    producerType: "worker",
    parentTaskId: "PARENT-1",
    startingBaseline: ref("PMB-1"),
    startingGraphCheckpoint: ref("GRAPH-1"),
    contextReceipt: ref("CONTEXT-1"),
    completedArtifacts: [ref("CHANGE-SET-1")],
    evidence: [ref("TEST-1")],
    pendingDecisions: [],
    memoryCandidate: ref("MUC-1"),
  });
  assert.equal(validateProjectMemoryArtifact(conclusion), conclusion);

  const provider = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "MemoryProviderReceipt",
    receiptId: "SYNC-1",
    providerId: "mem0.local",
    providerVersion: "1.0.0",
    operation: "synchronize",
    namespace: "project/devrelay",
    configurationDigest: DIGEST,
    inputCheckpoints: [ref("PMB-2")],
    commandFingerprint: DIGEST,
    outcome: "pass",
    durationMs: 2,
    replayed: false,
    citations: [],
    outputDigest: DIGEST,
  });
  const providerRef = ref(
    provider.receiptId,
    PROJECT_MEMORY_ARTIFACT_CONTRACTS.MemoryProviderReceipt,
  );
  const concluded = withProjectMemoryContentDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ConcludeReceipt",
    receiptId: "CONCLUDE-1",
    projectId: "devrelay",
    sessionId: "SESSION-1",
    taskId: "WORKER-1",
    conclusion: ref("CONCLUSION-1"),
    inputBaseline: ref("PMB-1"),
    resultBaseline: ref("PMB-2"),
    inputGraphCheckpoint: ref("GRAPH-1"),
    resultGraphCheckpoint: ref("GRAPH-2"),
    deltaDigest: DIGEST,
    synopsisDigest: DIGEST_2,
    providerSyncReceipt: providerRef,
    resultingCheckpointDigest: DIGEST,
    outcome: "concluded",
    replayed: false,
  });
  assert.equal(
    validateProjectMemoryArtifact(concluded, { providerReceipt: provider, providerReceiptRef: providerRef }),
    concluded,
  );
  assert.throws(
    () =>
      validateProjectMemoryArtifact(
        concluded,
        {
          providerReceipt: { ...provider, outcome: "fail" },
          providerReceiptRef: providerRef,
        },
      ),
    /without verified provider synchronization/u,
  );
});

test("session state requires explicit rationale only for abandonment", () => {
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectMemorySessionState",
    stateId: "PM-SESSION-STATE-1",
    projectId: "devrelay",
    sessionId: "SESSION-1",
    taskId: "TASK-1",
    status: "open",
    baseline: ref("PMB-1"),
    graphCheckpoint: ref("GRAPH-1"),
    lastCheckpointDigest: DIGEST,
    updatedAt: at,
  };
  assert.equal(validateProjectMemoryArtifact(withProjectMemoryContentDigest(material)).kind, "ProjectMemorySessionState");
  const abandoned = withProjectMemoryContentDigest({
    ...material,
    status: "abandoned",
    abandonmentRationale: "The owner explicitly abandoned the interrupted task.",
  });
  assert.equal(validateProjectMemoryArtifact(abandoned), abandoned);
});

test("content digests are canonical and stable", () => {
  const value = baseline();
  const { contentDigest, ...material } = value;
  assert.equal(contentDigest, canonicalJsonDigest(material));
});

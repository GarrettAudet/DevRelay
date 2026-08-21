import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.env.MEM0_TELEMETRY = "false";

import {
  createDevRelay,
  createLocalHost,
  defineModule,
  definePlugin,
} from "devrelay";
import {
  canonicalJson,
  canonicalJsonDigest,
  createMem0ProjectMemoryAdapter,
  createMemoryUpdateCandidate,
  createProjectMemoryContextBootstrap,
  createProjectMemoryConclusionCoordinator,
  createProjectMemoryGateApproval,
  createProjectMemoryRuntime,
  createProviderExecutionAttestation,
  createSessionConclusion,
  createSessionContextSnapshot,
  executeSessionBootstrap,
  loadProjectMemoryArtifact,
  renderCurrentSynopsis,
  sha256Digest,
  withProjectMemoryContentDigest,
} from "devrelay/advanced";

const API = "devrelay.dev/v1alpha1";
const mem0Entry = process.env.DEVRELAY_MEM0_ENTRY;
assert.ok(mem0Entry, "DEVRELAY_MEM0_ENTRY is required");
const mem0Version = "3.1.6";
const mem0Bytes = fs.readFileSync(mem0Entry);
const mem0ExecutableDigest = sha256Digest(mem0Bytes);
const networkAttempts = [];
globalThis.fetch = async (...request) => {
  networkAttempts.push(String(request[0]));
  throw new Error("network is denied by the PM-001 local provider policy");
};
const { Memory } = await import(pathToFileURL(mem0Entry));

const digest = (character) => `sha256:${character.repeat(64)}`;
const ref = (artifactId, overrides = {}) => ({
  artifactId,
  schema: "https://devrelay.dev/artifacts/windows-e2e/v1",
  mediaType: "application/json",
  digest: digest("a"),
  uri: `memory://devrelay/windows-e2e/${artifactId}`,
  ...overrides,
});
const sourceRef = (artifactId) => ({ role: "windows-e2e", artifact: ref(artifactId) });
const graphCheckpoint = ref("GRAPH-PM-E2E-001");
const at = "2026-08-21T16:00:00.000Z";
const record = (id, statement, overrides = {}) => ({
  id,
  category: "direction",
  statement,
  authority: "approved-project",
  status: "active",
  effectiveAt: at,
  domain: "project-memory",
  sourceRefs: [sourceRef(`SOURCE-${id}`)],
  ...overrides,
});

const baselineValue = withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "ProjectMemoryBaseline",
  baselineId: "PMB-WINDOWS-E2E-001",
  projectId: "devrelay",
  version: "1.0.0",
  approvedCandidate: ref("MUC-PREEXISTING"),
  records: [
    record("MEM-PM-DIRECTION", "ProjectMemory is deterministic, local-first, and approval-gated."),
    record("MEM-PM-STATUS", "The Windows end-to-end frontier is active.", {
      category: "status",
      authority: "validated-status",
      domain: "execution",
    }),
  ],
  graphCheckpoint,
  projectionDigest: canonicalJsonDigest(["MEM-PM-DIRECTION", "MEM-PM-STATUS"]),
  approvalEvidence: [ref("APPROVAL-PM-SEED")],
  sourceRefs: [sourceRef("SOURCE-PM-SEED")],
});
let activeBaseline = loadProjectMemoryArtifact(baselineValue);
let activeSynopsis = renderCurrentSynopsis(baselineValue);
const traceValue = withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "TraceabilityContextProjection",
  projectionId: "TCP-WINDOWS-E2E-001",
  graphCheckpoint,
  graphVersion: "1.6.0",
  scope: ["WI-PM-WINDOWS-E2E"],
  lifecyclePosition: "work-execution",
  nodes: [{
    id: "WI-PM-WINDOWS-E2E",
    kind: "work-item",
    label: "ProjectMemory Windows end-to-end",
    sourceRefs: [sourceRef("SOURCE-WI-PM-WINDOWS-E2E")],
  }],
  edges: [],
  diagnostics: [],
});
const trace = loadProjectMemoryArtifact(traceValue);

class DeterministicEmbeddings {
  constructor(dimension = 64) {
    this.embeddingDimension = dimension;
  }
  vector(text) {
    const values = Array(this.embeddingDimension).fill(0);
    const tokens = String(text).normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (const token of tokens) {
      let hash = 2166136261;
      for (const character of token) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      values[hash % values.length] += 1;
    }
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
    return values.map((value) => value / magnitude);
  }
  async embedQuery(text) { return this.vector(text); }
  async embedDocuments(texts) { return texts.map((text) => this.vector(text)); }
}

const mem0Database = process.env.DEVRELAY_MEM0_DATABASE
  ?? join(tmpdir(), `devrelay-pm001-e2e-${process.pid}-${Date.now()}.db`);
const memory = new Memory({
  version: "v1.1",
  disableHistory: true,
  embedder: {
    provider: "langchain",
    config: { model: new DeterministicEmbeddings(), embeddingDims: 64 },
  },
  vectorStore: {
    provider: "memory",
    config: { collectionName: "devrelay-pm001", dimension: 64, dbPath: mem0Database },
  },
  llm: {
    provider: "langchain",
    config: {
      model: {
        modelId: "devrelay-local-no-inference",
        async invoke() { return { content: "{}" }; },
      },
    },
  },
});

const observer = {
  id: "chatgpt-desktop.windows",
  version: "1.0.0",
  configurationDigest: canonicalJsonDigest({ platform: process.platform, runtime: process.version }),
  authority: "host-trusted-observer",
};
const providerAttestation = {
  providerId: "mem0",
  version: mem0Version,
  available: true,
  executableDigest: mem0ExecutableDigest,
};
const sdkIds = new Map();
let providerCalls = 0;
const hostExecute = async (command) => {
  providerCalls += 1;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const storageNamespace = command.namespace.split("/").slice(0, 2).join("/");
  let items = [];
  let citations = [];
  if (command.operation === "add") {
    for (const memoryRecord of command.records) {
      const added = await memory.add(memoryRecord.statement, {
        userId: storageNamespace,
        infer: false,
        metadata: {
          memoryId: memoryRecord.id,
          statement: memoryRecord.statement,
          effectiveAt: memoryRecord.effectiveAt,
          sourceRefs: JSON.stringify(memoryRecord.sourceRefs),
        },
      });
      sdkIds.set(memoryRecord.id, added.results[0].id);
    }
  } else if (command.operation === "update") {
    for (const change of command.records) {
      if (change.targetMemoryId && sdkIds.has(change.targetMemoryId)) {
        await memory.delete(sdkIds.get(change.targetMemoryId));
        sdkIds.delete(change.targetMemoryId);
      }
      const memoryRecord = change.proposedMemory ?? change;
      const added = await memory.add(memoryRecord.statement, {
        userId: storageNamespace,
        infer: false,
        metadata: {
          memoryId: memoryRecord.id,
          statement: memoryRecord.statement,
          effectiveAt: memoryRecord.effectiveAt,
          sourceRefs: JSON.stringify(memoryRecord.sourceRefs),
        },
      });
      sdkIds.set(memoryRecord.id, added.results[0].id);
    }
  } else if (command.operation === "search") {
    const result = await memory.search(command.query || "project memory", {
      filters: { user_id: storageNamespace },
      topK: 256,
      threshold: 0,
    });
    items = result.results.map(({ metadata }) => ({
      memoryId: metadata.memoryId,
      statement: metadata.statement,
      effectiveAt: metadata.effectiveAt,
      sourceRefs: JSON.parse(metadata.sourceRefs),
    }));
    citations = result.results.map(({ metadata, score }, index) => ({
      rank: index + 1,
      sourceRef: JSON.parse(metadata.sourceRefs)[0],
      score: Number((score ?? 0).toFixed(12)),
    }));
  } else if (command.operation === "delete") {
    for (const memoryId of command.records) {
      if (sdkIds.has(memoryId)) await memory.delete(sdkIds.get(memoryId));
    }
  }
  const rawBytes = Buffer.from(canonicalJson({ operation: command.operation, requestedNamespace: command.namespace, storageNamespace, items, citations }), "utf8");
  const completedAt = new Date().toISOString();
  const stdoutDigest = sha256Digest(rawBytes);
  const stderrDigest = sha256Digest(Buffer.alloc(0));
  return {
    exitCode: 0,
    providerVersion: mem0Version,
    networkUsed: false,
    durationMs: performance.now() - started,
    items,
    citations,
    rawBytes,
    attestation: createProviderExecutionAttestation({
      attestationId: `PEA-PM-E2E-${command.operation.toUpperCase()}-${providerCalls}`,
      binding: { id: "mem0", version: mem0Version, configurationDigest: command.configurationDigest },
      capability: `project-memory.${command.operation}`,
      request: command.requestRef,
      tool: { name: "mem0", version: mem0Version },
      command: {
        executable: "node:mem0ai/oss",
        arguments: [command.operation, command.namespace],
        workingDirectoryDigest: canonicalJsonDigest({ cwd: process.cwd() }),
      },
      execution: { startedAt, completedAt, exitCode: 0, stdoutDigest, stderrDigest },
      nativeArtifacts: [{ artifactId: `MEM0-NATIVE-${providerCalls}`, digest: stdoutDigest }],
      observer,
      maturity: "live-conformant",
    }),
  };
};
const adapter = createMem0ProjectMemoryAdapter({
  hostExecute,
  attestation: providerAttestation,
  trustedObserver: observer,
  configuration: { store: "local", allowNetwork: false, allowSourceTransmission: false },
});
const namespace = "project/devrelay";
const initialIndex = await adapter.proposeIndex({ namespace, records: baselineValue.records });
assert.equal(initialIndex.nativeReceipt.providerVersion, mem0Version);
assert.equal(initialIndex.nativeReceipt.networkUsed, false);

const artifacts = new Map();
const register = (loaded) => artifacts.set(loaded.ref.digest, loaded);
register(activeBaseline);
register(trace);
artifacts.set(activeSynopsis.ref.digest, { ref: activeSynopsis.ref, bytes: activeSynopsis.bytes });
const runtime = createProjectMemoryRuntime({ provider: adapter });
const bootstrap = createProjectMemoryContextBootstrap({
  loadArtifact: async (artifact) => artifacts.get(artifact.digest),
  runtime,
  clock: () => "2026-08-21T16:05:00.000Z",
});
const baseLoadRequest = {
  executionId: "PM-E2E-LOAD-FRESH",
  operation: "load-context",
  projectId: "devrelay",
  sessionId: "SESSION-PM-E2E",
  taskId: "TASK-PM-E2E-PARENT",
  workspaceId: "WORKSPACE-PM-E2E",
  repositoryRevision: "c".repeat(40),
  moduleId: "work-execution",
  moduleInvocationId: "INV-PM-E2E-FRESH",
  projectMemoryBaseline: activeBaseline.ref,
  synopsisProjection: activeSynopsis.ref,
  traceabilityProjection: trace.ref,
  query: "deterministic local project memory",
};
const fresh = await bootstrap.load(baseLoadRequest);
assert.equal(fresh.outcome, "pass");
assert.deepEqual(fresh.receipt.loadOrder, [
  "current-synopsis",
  "project-memory-baseline",
  "traceability-context",
]);
assert.equal(fresh.providerReceipt.value.providerId, "mem0");
assert.equal(fresh.bundle.value.items.some(({ memoryId }) => memoryId === "MEM-PM-DIRECTION"), true);

const nextStatus = record("MEM-PM-STATUS-COMPLETE", "The Windows end-to-end frontier is complete.", {
  category: "status",
  authority: "validated-status",
  domain: "execution",
});
const workerCandidateValue = createMemoryUpdateCandidate({
  projectId: "devrelay",
  sessionId: "SESSION-PM-E2E",
  taskId: "TASK-PM-E2E-WORKER",
  baseBaseline: activeBaseline.ref,
  baseGraphCheckpoint: graphCheckpoint,
  producerType: "worker",
  parentTaskId: "TASK-PM-E2E-PARENT",
  changes: [{
    changeId: "CHANGE-PM-E2E-STATUS",
    disposition: "replace",
    qualitative: false,
    domain: "execution",
    targetMemoryId: "MEM-PM-STATUS",
    proposedMemory: nextStatus,
    rationale: "Validated end-to-end evidence completed the final frontier.",
    sourceRefs: [sourceRef("SOURCE-PM-E2E-RESULT")],
  }],
  sourceRefs: [sourceRef("SOURCE-PM-E2E-WORKER")],
});
const workerCandidate = loadProjectMemoryArtifact(workerCandidateValue);
const workerConclusionValue = createSessionConclusion({
  projectId: "devrelay",
  sessionId: "SESSION-PM-E2E",
  taskId: "TASK-PM-E2E-WORKER",
  producerType: "worker",
  parentTaskId: "TASK-PM-E2E-PARENT",
  startingBaseline: activeBaseline.ref,
  startingGraphCheckpoint: graphCheckpoint,
  contextReceipt: ref(fresh.receipt.receiptId, { digest: canonicalJsonDigest(fresh.receipt) }),
  completedArtifacts: [ref("WINDOWS-E2E-EXECUTION")],
  evidence: [ref("WINDOWS-E2E-EVIDENCE")],
  pendingDecisions: [],
  memoryCandidate: workerCandidate.ref,
});
assert.equal(workerConclusionValue.parentTaskId, "TASK-PM-E2E-PARENT");
const approvalValue = createProjectMemoryGateApproval({
  candidate: workerCandidateValue,
  candidateRef: workerCandidate.ref,
  terminalCheckpointDigest: fresh.providerReceipt.value.contentDigest,
  decisions: [{ changeId: "CHANGE-PM-E2E-STATUS", decision: "approve", rationale: "Exact worker status delta approved." }],
});
const sync = await adapter.proposeUpdate({ namespace, records: workerCandidateValue.changes });
const providerSyncValue = withProjectMemoryContentDigest({
  apiVersion: API,
  kind: "MemoryProviderReceipt",
  receiptId: "MPR-PM-E2E-SYNC",
  providerId: "mem0",
  providerVersion: mem0Version,
  operation: "synchronize",
  namespace,
  configurationDigest: adapter.configurationDigest,
  inputCheckpoints: [activeBaseline.ref, workerCandidate.ref],
  commandFingerprint: sync.nativeReceipt.commandFingerprint,
  outcome: "pass",
  durationMs: sync.nativeReceipt.durationMs,
  replayed: false,
  citations: [],
  outputDigest: canonicalJsonDigest(workerCandidateValue.changes),
});
const providerSync = loadProjectMemoryArtifact(providerSyncValue);
let commits = 0;
let conclusionState;
const coordinator = createProjectMemoryConclusionCoordinator({
  commitAtomic: async ({ expectedBaseline, baseline, synopsis, proof }) => {
    assert.equal(expectedBaseline.digest, activeBaseline.ref.digest);
    commits += 1;
    conclusionState = { baseline, synopsis, proof };
    return { committed: true };
  },
});
const conclusion = await coordinator.conclude({
  conclusion: workerConclusionValue,
  candidate: workerCandidateValue,
  candidateRef: workerCandidate.ref,
  approval: approvalValue,
  baseBaseline: activeBaseline.value,
  baseBaselineRef: activeBaseline.ref,
  providerSyncReceipt: providerSyncValue,
  providerSyncReceiptRef: providerSync.ref,
  resultGraphCheckpoint: graphCheckpoint,
  sourceRefs: [sourceRef("SOURCE-PM-E2E-CONCLUDE")],
});
const conclusionReplay = await coordinator.conclude({
  conclusion: workerConclusionValue,
  candidate: workerCandidateValue,
  candidateRef: workerCandidate.ref,
  approval: approvalValue,
  baseBaseline: activeBaseline.value,
  baseBaselineRef: activeBaseline.ref,
  providerSyncReceipt: providerSyncValue,
  providerSyncReceiptRef: providerSync.ref,
  resultGraphCheckpoint: graphCheckpoint,
  sourceRefs: [sourceRef("SOURCE-PM-E2E-CONCLUDE")],
});
assert.equal(conclusion.outcome, "concluded");
assert.equal(conclusionReplay.replayed, true);
assert.equal(commits, 1);
assert.match(conclusionState.synopsis.bytes.toString("utf8"), /Windows end-to-end frontier is complete/u);
activeBaseline = conclusionState.baseline;
activeSynopsis = conclusionState.synopsis;
register(activeBaseline);
artifacts.set(activeSynopsis.ref.digest, { ref: activeSynopsis.ref, bytes: activeSynopsis.bytes });

const resumedRequest = {
  ...baseLoadRequest,
  executionId: "PM-E2E-LOAD-RESUMED",
  taskId: "TASK-PM-E2E-RESTARTED",
  sessionId: "SESSION-PM-E2E-RESTARTED",
  moduleInvocationId: "INV-PM-E2E-RESTARTED",
  projectMemoryBaseline: activeBaseline.ref,
  synopsisProjection: activeSynopsis.ref,
  query: "Windows end-to-end frontier complete",
};
const restarted = await bootstrap.load(resumedRequest);
const resumed = await bootstrap.load(resumedRequest);
assert.equal(restarted.outcome, "pass");
assert.equal(resumed.replayed, true);
assert.equal(restarted.bundle.value.items.some(({ memoryId }) => memoryId === "MEM-PM-STATUS-COMPLETE"), true);

const sessionArtifacts = new Map();
const sessionBindings = [];
for (const role of [
  "project-overview",
  "project-overview-projection",
  "lifecycle-status",
  "roadmap",
  "roadmap-projection",
]) {
  const bytes = Buffer.from(`${role}\n`, "utf8");
  const artifact = ref(`SESSION-${role.toUpperCase()}`, { digest: sha256Digest(bytes) });
  sessionArtifacts.set(artifact.digest, bytes);
  sessionBindings.push({ role, artifact, artifactVersion: "1.0.0" });
}
for (const [role, loaded] of [
  ["project-memory-baseline", activeBaseline],
  ["current-synopsis", { ref: activeSynopsis.ref, bytes: activeSynopsis.bytes }],
  ["traceability-context", trace],
]) {
  sessionArtifacts.set(loaded.ref.digest, loaded.bytes);
  sessionBindings.push({ role, artifact: loaded.ref, artifactVersion: "1.0.0" });
}
const facadeEvents = [];
const services = {
  async bootstrap(input) {
    facadeEvents.push("project-memory:start");
    await bootstrap.load({ ...resumedRequest, executionId: `FACADE-${input.taskId}`, taskId: input.taskId, sessionId: `SESSION-${input.taskId}`, moduleInvocationId: `INV-${input.taskId}` });
    facadeEvents.push("project-memory:complete");
    const snapshot = createSessionContextSnapshot({
      projectId: "devrelay",
      taskId: input.taskId,
      workspaceId: "WORKSPACE-PM-E2E",
      repositoryRevision: "c".repeat(40),
      bindings: sessionBindings,
      roadmapDisposition: "initialized",
      createdAt: "2026-08-21T16:30:00.000Z",
    });
    const receipt = await executeSessionBootstrap({
      snapshot,
      artifactResolver: async (artifact) => sessionArtifacts.get(artifact.digest),
      expectedProjectId: "devrelay",
      expectedTaskId: input.taskId,
      expectedWorkspaceId: "WORKSPACE-PM-E2E",
      expectedRepositoryRevision: "c".repeat(40),
    });
    facadeEvents.push("session-context:complete");
    return receipt;
  },
  async run() { return { outcome: "pass", artifact: activeBaseline.ref }; },
  async resume() { return { outcome: "pass", checkpoint: conclusion.receipt.resultingCheckpointDigest }; },
  async verify() { return { outcome: "pass", evidence: ref("FACADE-VERIFY") }; },
  async inspect() { return { outcome: "pass", baseline: activeBaseline.ref }; },
  async conclude() { return { outcome: "concluded", receipt: loadProjectMemoryArtifact(conclusion.receipt).ref }; },
};
const localHost = createLocalHost({
  platform: "win32",
  services,
  grants: [{ kind: "process.spawn", values: ["node"] }],
});
const relay = createDevRelay({
  projectId: "devrelay",
  host: localHost,
  modules: [defineModule({ id: "project.memory", version: "1.0.0", operations: ["load", "conclude"] })],
  plugins: [definePlugin({ id: "mem0.project-memory", version: mem0Version, capabilities: ["project-memory.retrieve"], maturity: "live-conformant", configurationDigest: adapter.configurationDigest })],
});
const facadeRun = await relay.run({ taskId: "TASK-PM-E2E-FACADE", goal: "Resume the accepted PM-001 project state." });
assert.equal(facadeRun.outputs.outcome, "pass");
assert.deepEqual(facadeEvents.slice(0, 3), ["project-memory:start", "project-memory:complete", "session-context:complete"]);
assert.equal(networkAttempts.length, 0);

const summary = {
  apiVersion: API,
  kind: "Pm001InstalledWindowsDesktopE2eReceipt",
  platform: process.platform,
  nodeVersion: process.version,
  packageVersion: "0.10.0-rc.3",
  provider: {
    id: "mem0",
    version: mem0Version,
    executableDigest: mem0ExecutableDigest,
    configurationDigest: adapter.configurationDigest,
    maturity: "live-conformant",
    calls: providerCalls,
    networkAttempts: networkAttempts.length,
    telemetryDisabled: process.env.MEM0_TELEMETRY === "false",
  },
  freshTask: {
    context: fresh.bundle.ref,
    receiptId: fresh.receipt.receiptId,
    loadOrder: fresh.receipt.loadOrder,
  },
  worker: {
    candidate: workerCandidate.ref,
    parentTaskId: workerConclusionValue.parentTaskId,
  },
  conclusion: {
    outcome: conclusion.outcome,
    resultBaseline: activeBaseline.ref,
    synopsis: activeSynopsis.ref,
    receipt: loadProjectMemoryArtifact(conclusion.receipt).ref,
    atomicCommits: commits,
    replayed: conclusionReplay.replayed,
  },
  restart: {
    outcome: restarted.outcome,
    context: restarted.bundle.ref,
    zeroCallReplay: resumed.replayed,
  },
  facade: {
    outcome: facadeRun.outputs.outcome,
    bootstrapOrder: facadeEvents,
  },
};
summary.receiptDigest = canonicalJsonDigest(summary);
process.stdout.write(`${canonicalJson(summary)}\n`);

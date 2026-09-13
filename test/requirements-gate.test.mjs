import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { commitLocalRequirementsGate, verifyLocalRequirementsGate, activateLocalRequirementsGate, verifyLocalRequirementsActivation } from "../src/local-host-requirements-gate.mjs";
import { createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { createLocalHostTraceabilityStore } from "../src/local-host-traceability.mjs";
import { createRequirementsActivationTraceabilityContributor, requirementsTraceabilityContributor } from "../src/requirements-traceability-contributor.mjs";
import { createLocalRequirementsContextHandoff } from "../src/local-requirements-context.mjs";
import { createSessionContextSnapshot, executeSessionBootstrap } from "../src/session-bootstrap.mjs";
import { materializeLocalRequirementsContext, verifyLocalRequirementsContextFiles } from "../src/local-context-materialization.mjs";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";
import {
  RequirementsGateValidationError,
  validateRequirementsGatePromotion,
} from "../src/requirements-gate.mjs";

const root = new URL("../", import.meta.url);
const clone = (value) => structuredClone(value);
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });

async function document(relativePath) {
  const bytes = await readFile(new URL(relativePath, root));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

const [
  moduleDocument,
  pluginDocument,
  initialInvocationDocument,
  changeInvocationDocument,
  initialResultDocument,
  changeResultDocument,
  goalDocument,
  changeGoalDocument,
  contextDocument,
  repositoryDocument,
  requirementsDraftDocument,
  requirementsBaselineOneDocument,
  requirementsBaselineTwoDocument,
  requirementsChangeDocument,
  overviewDraftDocument,
  overviewBaselineOneDocument,
  overviewBaselineTwoDocument,
  overviewChangeDocument,
  nativeInitialDocument,
  nativeChangeDocument,
  overviewMarkdownOne,
  overviewMarkdownTwo,
  nativeInitialBytes,
  nativeChangeBytes,
] = await Promise.all([
  document("examples/modules/requirements-gathering.module.json"),
  document("examples/plugins/openspec.plugin.json"),
  document("examples/invocations/requirements-openspec.invocation.json"),
  document("examples/invocations/requirements-openspec-change-set.invocation.json"),
  document("examples/results/requirements-openspec.result.json"),
  document("examples/results/requirements-openspec-change-set.result.json"),
  document("examples/artifacts/goal-001.json"),
  document("examples/artifacts/goal-change-001.json"),
  document("examples/artifacts/project-context-001.json"),
  document("examples/artifacts/repository-snapshot-001.json"),
  document("examples/artifacts/requirements-draft-001.json"),
  document("examples/artifacts/requirements-baseline-001.json"),
  document("examples/artifacts/requirements-baseline-002.json"),
  document("examples/artifacts/requirements-change-set-001.json"),
  document("examples/artifacts/project-overview-draft-001.json"),
  document("examples/artifacts/project-overview-baseline-001.json"),
  document("examples/artifacts/project-overview-baseline-002.json"),
  document("examples/artifacts/project-overview-change-set-draft-001.json"),
  document("examples/artifacts/native-source-bundle-001.json"),
  document("examples/artifacts/native-source-bundle-change-001.json"),
  readFile(new URL("examples/artifacts/ProjectOverview.md", root)),
  readFile(
    new URL("examples/artifacts/project-overview-change/ProjectOverview.md", root),
  ),
  readFile(new URL("examples/native/openspec/proposal.md", root)),
  readFile(new URL("examples/native/openspec/change-proposal.md", root)),
]);

const jsonDocuments = new Map([
  ["goal-001", goalDocument],
  ["goal-change-001", changeGoalDocument],
  ["project-context-001", contextDocument],
  ["repository-snapshot-001", repositoryDocument],
  ["requirements-draft-001", requirementsDraftDocument],
  ["requirements-baseline-001", requirementsBaselineOneDocument],
  ["requirements-baseline-002", requirementsBaselineTwoDocument],
  ["requirements-change-set-001", requirementsChangeDocument],
  ["project-overview-draft-001", overviewDraftDocument],
  ["project-overview-baseline-001", overviewBaselineOneDocument],
  ["project-overview-baseline-002", overviewBaselineTwoDocument],
  ["project-overview-change-set-draft-001", overviewChangeDocument],
  ["native-source-openspec-001", nativeInitialDocument],
  ["native-source-openspec-change-001", nativeChangeDocument],
]);

function baseArtifactStore() {
  const values = new Map(
    [...jsonDocuments].map(([artifactId, entry]) => [
      artifactId,
      Buffer.from(entry.bytes),
    ]),
  );
  values.set("project-overview-md-001", Buffer.from(overviewMarkdownOne));
  values.set("project-overview-md-002", Buffer.from(overviewMarkdownTwo));
  values.set("openspec-proposal-001", Buffer.from(nativeInitialBytes));
  values.set("openspec-change-proposal-001", Buffer.from(nativeChangeBytes));
  return values;
}

function refForDocument(entry, artifactId, schema, mediaType) {
  return {
    artifactId,
    schema,
    mediaType,
    digest: sha256Digest(entry.bytes),
    uri: `artifact://requirements-gate/${artifactId}`,
  };
}

const requirementsBaselineOneRef = refForDocument(
  requirementsBaselineOneDocument,
  "requirements-baseline-001",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const requirementsBaselineTwoRef = refForDocument(
  requirementsBaselineTwoDocument,
  "requirements-baseline-002",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const overviewBaselineOneRef = refForDocument(
  overviewBaselineOneDocument,
  "project-overview-baseline-001",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);
const overviewBaselineTwoRef = refForDocument(
  overviewBaselineTwoDocument,
  "project-overview-baseline-002",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);

function checkpointStore() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

function harness(kind, { execute = true } = {}) {
  const initial = kind === "initial";
  const invocation = clone(
    initial ? initialInvocationDocument.value : changeInvocationDocument.value,
  );
  const result = clone(
    initial ? initialResultDocument.value : changeResultDocument.value,
  );
  const store = baseArtifactStore();
  const checkpoints = checkpointStore();
  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [moduleDocument.value],
    plugins: [
      {
        definition: pluginDocument.value,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return result;
          },
        },
      },
    ],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });
  const artifacts = {
    async load(ref) {
      const bytes = store.get(ref.artifactId);
      if (!bytes) throw new Error(`missing artifact ${ref.artifactId}`);
      return Buffer.from(bytes);
    },
  };
  return {
    invocation,
    result,
    registry,
    artifacts,
    checkpoints,
    store,
    execute,
    calls: () => adapterCalls,
  };
}

async function verifiedPromotion(kind, { runId } = {}) {
  const runtime = harness(kind);
  if (runId) runtime.invocation.runId = runId;
  await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  const checkpointReplay = await runtime.registry.verifyCheckpointedExecution(
    runtime.invocation,
    {
      artifacts: runtime.artifacts,
      checkpoints: runtime.checkpoints,
    },
  );
  assert.equal(runtime.calls(), 1, "checkpoint verification must not invoke");
  const initial = kind === "initial";
  const approvalBytes = await readFile(new URL(initial ? "examples/artifacts/requirements-approval-001.md" : "examples/artifacts/requirements-change-approval-001.md", root));
  const approvalId = initial ? "requirements-approval-001" : "requirements-change-approval-001";
  return {
    runtime,
    request: {
      checkpointReplay,
      approvalEvidence: [{ ref: {
        artifactId: approvalId, digest: sha256Digest(approvalBytes),
        schema: "https://devrelay.dev/artifacts/requirements-approval-evidence/v1",
        mediaType: "text/markdown", uri: `fixture://requirements-gate/${approvalId}`,
      }, bytes: approvalBytes }],
      requirementsBaseline: clone(
        initial
          ? requirementsBaselineOneDocument.value
          : requirementsBaselineTwoDocument.value,
      ),
      requirementsBaselineRef: clone(
        initial ? requirementsBaselineOneRef : requirementsBaselineTwoRef,
      ),
      requirementsBaselineBytes: Buffer.from(
        initial
          ? requirementsBaselineOneDocument.bytes
          : requirementsBaselineTwoDocument.bytes,
      ),
      projectOverviewBaseline: clone(
        initial ? overviewBaselineOneDocument.value : overviewBaselineTwoDocument.value,
      ),
      projectOverviewBaselineRef: clone(
        initial ? overviewBaselineOneRef : overviewBaselineTwoRef,
      ),
      projectOverviewBaselineBytes: Buffer.from(
        initial ? overviewBaselineOneDocument.bytes : overviewBaselineTwoDocument.bytes,
      ),
      projectOverviewMarkdownBytes: Buffer.from(
        initial ? overviewMarkdownOne : overviewMarkdownTwo,
      ),
    },
  };
}

test("local host atomically persists the owning Gate's exact pair and revalidates replay", async (t) => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-requirements-gate-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const { runtime, request } = await verifiedPromotion("initial");
  const invoke = (value = request) => commitLocalRequirementsGate({ storage, namespace: "requirements-test", request: value });
  const first = invoke();
  assert.equal(first.replayed, false);
  assert.equal(first.committed.commitPayload.requirementsBaseline.bytesBase64, requirementsBaselineOneDocument.bytes.toString("base64"));
  assert.equal(first.committed.commitPayload.projectOverviewBaseline.bytesBase64, overviewBaselineOneDocument.bytes.toString("base64"));
  assert.equal(first.committed.projectOverviewMarkdown.bytesBase64, overviewMarkdownOne.toString("base64"));
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  const again = invoke();
  assert.equal(again.replayed, true);
  assert.deepEqual(again.committed, first.committed);
  assert.equal(runtime.calls(), 1);
  const verify = (record = again.committed, checkpointReplay = request.checkpointReplay) => verifyLocalRequirementsGate({ record, checkpointReplay });
  assert.equal(verify().commitDigest, first.committed.commitDigest);
  assert.throws(() => verify(again.committed, clone(request.checkpointReplay)));
  for (const mutate of [
    (value) => { value.lifecycleComplete = true; },
    (value) => { value.invocationDigest = `sha256:${"f".repeat(64)}`; },
    (value) => { value.commitPayload.requirementsBaseline.byteLength += 1; },
    (value) => { value.projectOverviewMarkdown.bytesBase64 += "\n"; },
    (value) => { value.unapproved = true; },
    (value) => { value.approvalEvidence[0].bytesBase64 = Buffer.from("changed approval").toString("base64"); },
  ]) {
    const changed = clone(again.committed);
    mutate(changed);
    assert.throws(() => verify(changed));
  }
  assert.throws(() => invoke({ ...request, checkpointReplay: clone(request.checkpointReplay) }));
  assert.throws(() => invoke({ ...request, requirementsBaselineBytes: Buffer.from("{}") }));
  assert.throws(() => invoke({ ...request, approvalEvidence: [] }), /complete approval evidence/);
  assert.throws(() => invoke({ ...request, approvalEvidence: [...request.approvalEvidence, ...request.approvalEvidence] }), /complete approval evidence/);
  assert.throws(() => invoke({ ...request, approvalEvidence: [{ ...request.approvalEvidence[0], bytes: Buffer.from("unapproved") }] }), /evidence bytes drifted/);
  assert.throws(() => invoke({ ...request, approvalEvidence: [{ ...request.approvalEvidence[0], ref: { ...request.approvalEvidence[0].ref, artifactId: "another-approval" } }] }), /paired baseline citation/);
  assert.equal(storage.listRuns({ prefix: "local-checkpoint:" }).length, 1);
});

test("failed pair publication exposes neither baseline and can retry without the adapter", async (t) => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-requirements-gate-failure-"));
  const storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const { runtime, request } = await verifiedPromotion("initial");
  const interrupted = { ...storage, initializeRun() { throw new Error("simulated publication interruption"); } };
  assert.throws(() => commitLocalRequirementsGate({ storage: interrupted, namespace: "requirements-test", request }), /publication interruption/);
  assert.equal(storage.listRuns({ prefix: "local-checkpoint:" }).length, 0);
  const recovered = commitLocalRequirementsGate({ storage, namespace: "requirements-test", request });
  assert.equal(recovered.replayed, false);
  assert.equal(storage.listRuns({ prefix: "local-checkpoint:" }).length, 1);
  assert.equal(runtime.calls(), 1);
});

test("Gate activation checkpoints before merge and recovers the exact approved graph after restart", async (t) => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-gate-activation-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const { runtime, request } = await verifiedPromotion("initial");
  const record = commitLocalRequirementsGate({ storage, namespace: "gate", request }).committed;
  const createGraph = () => createTraceabilityGraphService({ projectId: "auth-product", graphId: "gate-graph",
    contributors: [requirementsTraceabilityContributor, createRequirementsActivationTraceabilityContributor()],
    store: createLocalHostTraceabilityStore({ storage, namespace: "graph", graphId: "gate-graph" }) });
  let graph = createGraph();
  const args = () => ({ storage, namespace: "gate", graph, checkpointReplay: request.checkpointReplay, record,
    resolveArtifact: async (ref) => ({ ref, bytes: await runtime.artifacts.load(ref) }) });
  await assert.rejects(activateLocalRequirementsGate({ ...args(), graph: { ...graph,
    mergePrepared() { throw new Error("simulated interruption before graph merge"); } } }), /interruption before graph merge/);
  assert.ok(storage.listRuns({ prefix: "local-checkpoint:" }).some(({ state }) => state.key === `requirements-activation:${record.commitDigest}`));
  const competing = await verifiedPromotion("initial", { runId: "competing-requirements-run" });
  const competingRecord = commitLocalRequirementsGate({ storage, namespace: "competing-gate", request: competing.request }).committed;
  const competingArgs = () => ({ ...args(), checkpointReplay: competing.request.checkpointReplay, record: competingRecord });
  await assert.rejects(activateLocalRequirementsGate(competingArgs()), /current pair or pending Gate/);
  storage.close(); storage = createLocalHostStorage({ rootDirectory }); graph = createGraph();
  await assert.rejects(activateLocalRequirementsGate({ ...args(), graph: { ...graph,
    async mergePrepared(prepared) { await graph.mergePrepared(prepared); throw new Error("interruption after graph merge"); } } }), /interruption after graph merge/);
  assert.equal(storage.listRuns({ prefix: "requirements-head:" })[0].state.pendingCommit, record.commitDigest);
  const activated = await activateLocalRequirementsGate(args());
  assert.equal(storage.listRuns({ prefix: "requirements-head:" })[0].state.pendingCommit, null);
  const again = await activateLocalRequirementsGate(args());
  assert.deepEqual(again, activated);
  const revision = graph.captureBase().snapshot.revision;
  await assert.rejects(activateLocalRequirementsGate(competingArgs()), /current pair or pending Gate/);
  assert.equal(graph.captureBase().snapshot.revision, revision);
  assert.equal(runtime.calls(), 1);
  const snapshot = graph.captureBase().snapshot;
  assert.ok(snapshot.nodes.some(({ kind, authority }) => kind === "business-objective" && authority === "approved"));
  assert.ok(snapshot.nodes.some(({ kind, authority }) => kind === "business-objective" && authority === "candidate"));
  const prepared = createLocalHostCheckpointStore({ storage, namespace: "gate" }).get(`requirements-activation:${record.commitDigest}`);
  assert.ok(prepared.update.sourceArtifacts.some(({ artifactId }) => artifactId === "requirements-approval-001"));
  storage.close(); storage = createLocalHostStorage({ rootDirectory, readOnly: true }); graph = createGraph();
  assert.deepEqual(await verifyLocalRequirementsActivation(args()), activated);
});

test("requirements context handoff binds the current pair and retains invalidated work as history", async (t) => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-context-handoff-"));
  const storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const { runtime, request } = await verifiedPromotion("change");
  const record = commitLocalRequirementsGate({ storage, namespace: "gate", request }).committed;
  const graph = createTraceabilityGraphService({ projectId: "auth-product", graphId: "handoff-graph",
    contributors: [requirementsTraceabilityContributor, createRequirementsActivationTraceabilityContributor()],
    store: createLocalHostTraceabilityStore({ storage, namespace: "graph", graphId: "handoff-graph" }) });
  const gateArgs = { storage, namespace: "gate", graph, checkpointReplay: request.checkpointReplay, record,
    resolveArtifact: async (ref) => ({ ref, bytes: await runtime.artifacts.load(ref) }) };
  const contextBytes = Buffer.from("explicit context fixture");
  const contextRef = { artifactId: "context-fixture", digest: sha256Digest(contextBytes), schema: "https://example.test/context/v1", mediaType: "text/plain", uri: "fixture://context" };
  const roles = ["project-memory-baseline", "current-synopsis", "traceability-context", "lifecycle-status", "ready-frontier"];
  const priorSnapshot = createSessionContextSnapshot({ projectId: "auth-product", taskId: "handoff-task", workspaceId: "handoff-workspace",
    repositoryRevision: "0".repeat(40), createdAt: "2026-09-14T00:00:00Z", roadmapDisposition: "RoadmapNotInitialized",
    bindings: [...roles.map((role) => ({ role, artifact: contextRef, artifactVersion: "fixture" })),
      { role: "requirements-baseline", artifact: request.checkpointReplay.loadedInputs["requirements-baseline"][0].ref, artifactVersion: "1.0.0" },
      { role: "project-overview", artifact: request.checkpointReplay.loadedInputs["project-overview-baseline"][0].ref, artifactVersion: "1.0.0" },
      { role: "project-overview-projection", artifact: contextRef, artifactVersion: "fixture" }] });
  const artifactResolver = (ref) => ref.artifactId === contextRef.artifactId ? contextBytes : runtime.artifacts.load(ref);
  const priorReceipt = await executeSessionBootstrap({ snapshot: priorSnapshot, artifactResolver,
    expectedProjectId: priorSnapshot.projectId, expectedTaskId: priorSnapshot.taskId,
    expectedWorkspaceId: priorSnapshot.workspaceId, expectedRepositoryRevision: priorSnapshot.repositoryRevision });
  const args = { ...gateArgs, priorSnapshot, priorReceipt, artifactResolver, createdAt: "2026-09-14T01:00:00Z" };
  await assert.rejects(createLocalRequirementsContextHandoff(args), /activation checkpoint is missing/);
  await activateLocalRequirementsGate(gateArgs);
  const handoff = await createLocalRequirementsContextHandoff(args);
  assert.deepEqual(await createLocalRequirementsContextHandoff(args), handoff);
  assert.equal(handoff.snapshot.bindings.find(({ role }) => role === "requirements-baseline").artifact.artifactId, "requirements-baseline-002");
  assert.deepEqual(handoff.snapshot.bindings.find(({ role }) => role === "traceability-context").artifact, contextRef);
  assert.equal(handoff.snapshot.bindings.some(({ role }) => role === "ready-frontier"), false);
  assert.equal(handoff.invalidatedBindings[0].role, "ready-frontier");
  assert.equal(priorSnapshot.bindings.some(({ role }) => role === "ready-frontier"), true);
  assert.equal(handoff.lifecycleComplete, false);
  assert.equal(Object.isFrozen(handoff.snapshot.bindings), true);
  assert.equal(handoff.receipt.outcome, "RoadmapNotInitialized");
  await assert.rejects(createLocalRequirementsContextHandoff({ ...args, artifactResolver: () => Buffer.from("drifted") }), /context refresh failed/);
  const missingHead = { ...storage, readRun(id) {
    if (id.startsWith("requirements-head:")) throw Object.assign(new Error("missing head"), { code: "DR4920" });
    return storage.readRun(id);
  } };
  await assert.rejects(createLocalRequirementsContextHandoff({ ...args, storage: missingHead }), /activated requirements head is missing/);
  // Publication-only fixture; the separate CLI test proves actual next-host init.
  const file = { path: "declared-fixture.json", digest: contextRef.digest };
  const configuration = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLocalHostConfiguration",
    projectId: priorSnapshot.projectId, taskId: priorSnapshot.taskId, workspaceRoot: rootDirectory,
    stateDirectory: "publication", graphId: graph.graphId, sessionSnapshot: file, memoryManifest: "memory.json",
    memorySessionState: file, contractSet: "requirements", modules: [file], plugins: [file],
    artifacts: [{ path: file.path, ref: contextRef }], grants: [{ kind: "filesystem.read", values: ["."] }, { kind: "filesystem.write", values: ["publication"] }] };
  const resolvePath = (relative) => join(rootDirectory, relative);
  assert.throws(() => materializeLocalRequirementsContext({ configuration, handoff,
    resolvePath: (relative, kind) => { if (kind === "filesystem.write") throw new Error("write grant denied"); return resolvePath(relative); } }), /write grant denied/);
  assert.equal(existsSync(join(rootDirectory, "publication")), false);
  let configurationWrites = 0;
  assert.throws(() => materializeLocalRequirementsContext({ configuration, handoff,
    resolvePath: (relative, kind) => {
      if (relative.endsWith("host.json") && kind === "filesystem.write" && ++configurationWrites === 2) throw new Error("interrupted before configuration publication");
      return resolvePath(relative);
    } }), /interrupted before configuration publication/);
  assert.equal(existsSync(join(rootDirectory, "publication", "contexts", handoff.handoffDigest.slice(7), "host.json")), false);
  const publication = materializeLocalRequirementsContext({ configuration, handoff, resolvePath });
  assert.deepEqual(materializeLocalRequirementsContext({ configuration, handoff, resolvePath }), publication);
  assert.deepEqual(verifyLocalRequirementsContextFiles({ configuration, handoff,
    resolvePath: (relative, kind) => { assert.equal(kind, "filesystem.read"); return resolvePath(relative); } }), publication);
  const nextConfiguration = JSON.parse(readFileSync(publication.configurationPath));
  const projected = nextConfiguration.artifacts.find(({ ref }) => ref.artifactId.startsWith("OVERVIEW-"));
  writeFileSync(resolvePath(projected.path), "unexpected replacement");
  assert.throws(() => materializeLocalRequirementsContext({ configuration, handoff, resolvePath }), /conflicts with existing bytes/);
  assert.equal(readFileSync(resolvePath(projected.path), "utf8"), "unexpected replacement");
});

function rebindBaselineDocument(request, field) {
  const bytes = Buffer.from(
    `${JSON.stringify(request[field], null, 2)}\n`,
    "utf8",
  );
  request[`${field}Bytes`] = bytes;
  request[`${field}Ref`].digest = sha256Digest(bytes);
}

test("checkpoint-only verification requires proof and never invokes an adapter", async () => {
  const runtime = harness("initial");
  await assert.rejects(
    () =>
      runtime.registry.verifyCheckpointedExecution(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    (error) => error.code === "DR2213" && /exact terminal checkpoint/.test(error.message),
  );
  assert.equal(runtime.calls(), 0);
});

test("gate returns one immutable pair from an exact checkpoint replay", async () => {
  const { request } = await verifiedPromotion("initial");
  const result = validateRequirementsGatePromotion(request);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requirementsBaseline), true);
  assert.deepEqual(result.requirementsBaselineRef, requirementsBaselineOneRef);
  assert.deepEqual(result.projectOverviewBaselineRef, overviewBaselineOneRef);
  assert.equal(Object.isFrozen(result.commitPayload), true);
  assert.equal(
    result.commitPayload.requirementsBaseline.bytesBase64,
    requirementsBaselineOneDocument.bytes.toString("base64"),
  );
  assert.equal(
    result.commitPayload.projectOverviewBaseline.bytesBase64,
    overviewBaselineOneDocument.bytes.toString("base64"),
  );
});

test("gate promotes a version-aligned change pair from its exact prior pair", async () => {
  const { request } = await verifiedPromotion("change");
  const result = validateRequirementsGatePromotion(request);
  assert.equal(result.requirementsBaseline.version, "2.0.0");
  assert.equal(result.projectOverviewBaseline.version, "2.0.0");
  assert.deepEqual(
    result.projectOverviewBaseline.supersedes,
    pointer(overviewBaselineOneRef),
  );
});

test("gate rejects a forged or serialized checkpoint receipt", async () => {
  const { request } = await verifiedPromotion("initial");
  const forged = clone(request);
  forged.checkpointReplay = clone(request.checkpointReplay);
  assert.throws(
    () => validateRequirementsGatePromotion(forged),
    (error) =>
      error instanceof RequirementsGateValidationError &&
      /verified checkpoint replay receipt/.test(error.message),
  );
});

test("gate requires aligned versions and exactly matching approval evidence", async () => {
  const versionMismatch = (await verifiedPromotion("initial")).request;
  versionMismatch.projectOverviewBaseline.version = "1.0.1";
  rebindBaselineDocument(versionMismatch, "projectOverviewBaseline");
  assert.throws(
    () => validateRequirementsGatePromotion(versionMismatch),
    /semantic versions do not match/,
  );

  const evidenceMismatch = (await verifiedPromotion("initial")).request;
  evidenceMismatch.projectOverviewBaseline.approvalEvidence[0] = {
    artifactId: "different-approval",
    digest: `sha256:${"f".repeat(64)}`,
  };
  rebindBaselineDocument(evidenceMismatch, "projectOverviewBaseline");
  assert.throws(
    () => validateRequirementsGatePromotion(evidenceMismatch),
    /exactly matching approvalEvidence/,
  );
});

test("gate content-binds both promoted baseline objects to exact raw bytes", async () => {
  const forgedRef = (await verifiedPromotion("initial")).request;
  forgedRef.requirementsBaselineRef.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(
    () => validateRequirementsGatePromotion(forgedRef),
    /bytes do not match their ArtifactRef digest/,
  );

  const staleObject = (await verifiedPromotion("initial")).request;
  const changed = clone(staleObject.requirementsBaseline);
  changed.version = "9.9.9";
  staleObject.requirementsBaselineBytes = Buffer.from(
    `${JSON.stringify(changed, null, 2)}\n`,
    "utf8",
  );
  staleObject.requirementsBaselineRef.digest = sha256Digest(
    staleObject.requirementsBaselineBytes,
  );
  assert.throws(
    () => validateRequirementsGatePromotion(staleObject),
    /object does not match the exact raw JSON artifact/,
  );

  const malformed = (await verifiedPromotion("initial")).request;
  malformed.projectOverviewBaselineBytes = Buffer.from("{}\n", "utf8");
  malformed.projectOverviewBaselineRef.digest = sha256Digest(
    malformed.projectOverviewBaselineBytes,
  );
  assert.throws(
    () => validateRequirementsGatePromotion(malformed),
    /bytes do not contain a ProjectOverviewBaseline/,
  );
});

test("gate rejects baseline reuse and tampered ProjectOverview.md bytes", async () => {
  const reused = (await verifiedPromotion("change")).request;
  reused.projectOverviewBaseline.baselineId = "project-overview-baseline-001";
  reused.projectOverviewBaselineRef.artifactId = "project-overview-baseline-001";
  rebindBaselineDocument(reused, "projectOverviewBaseline");
  assert.throws(
    () => validateRequirementsGatePromotion(reused),
    /new overview baseline ID/,
  );

  const tampered = (await verifiedPromotion("initial")).request;
  tampered.projectOverviewMarkdownBytes = Buffer.from("tampered", "utf8");
  assert.throws(
    () => validateRequirementsGatePromotion(tampered),
    /bytes do not match their declared digest/,
  );
});

test("contradictory candidate lineage cannot produce a promotable receipt", async () => {
  const runtime = harness("initial");
  const draft = clone(requirementsDraftDocument.value);
  draft.baseInputs[0].artifact = {
    artifactId: "different-goal",
    digest: `sha256:${"0".repeat(64)}`,
  };
  const draftBytes = Buffer.from(`${JSON.stringify(draft, null, 2)}\n`, "utf8");
  const draftRef = clone(runtime.result.outputs["requirements-draft"][0]);
  draftRef.digest = sha256Digest(draftBytes);
  runtime.store.set(draftRef.artifactId, draftBytes);

  const overview = clone(overviewDraftDocument.value);
  overview.requirementsDraft = pointer(draftRef);
  const overviewBytes = Buffer.from(`${JSON.stringify(overview, null, 2)}\n`, "utf8");
  const overviewRef = clone(runtime.result.outputs["project-overview-draft"][0]);
  overviewRef.digest = sha256Digest(overviewBytes);
  runtime.store.set(overviewRef.artifactId, overviewBytes);

  const native = clone(nativeInitialDocument.value);
  native.canonicalOutputs = [pointer(draftRef), pointer(overviewRef)];
  const nativeBytes = Buffer.from(`${JSON.stringify(native, null, 2)}\n`, "utf8");
  const nativeRef = clone(runtime.result.outputs["native-source-bundle"][0]);
  nativeRef.digest = sha256Digest(nativeBytes);
  runtime.store.set(nativeRef.artifactId, nativeBytes);

  runtime.result.outputs = {
    "requirements-draft": [draftRef],
    "project-overview-draft": [overviewRef],
    "native-source-bundle": [nativeRef],
  };
  runtime.result.evidence[0].artifact = clone(nativeRef);

  await assert.rejects(
    () =>
      runtime.registry.execute(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    /requirements draft base input goal/,
  );
  assert.equal(runtime.checkpoints.values.size, 0);
  await assert.rejects(
    () =>
      runtime.registry.verifyCheckpointedExecution(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    (error) => error.code === "DR2213",
  );
  assert.equal(runtime.calls(), 1, "verification must not retry the failed adapter");
});

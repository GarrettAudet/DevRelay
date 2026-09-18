import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { deriveLocalIntegrationCompletion } from "../src/local-integration-completion.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { initializeLocalCompletionLedger, readLocalCompletionLedger, appendLocalCompletion } from "../src/local-completion-ledger.mjs";
import { deriveLocalWorkReadiness, assertLocalCompletionSnapshotCurrent } from "../src/local-work-readiness.mjs";
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { prepareLocalWorkQueue, assertLocalWorkQueueCurrent, createLocalHostLeaseKeeper } from "../src/local-host-recovery.mjs";

const apiVersion = "devrelay.dev/v1alpha1";
const D = `sha256:${"a".repeat(64)}`;
const C = "1".repeat(40), N = "2".repeat(40);
const pointer = ref => ({ artifactId: ref.artifactId, digest: ref.digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(
  Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));

// Synthetic integration result inside genuine Core checkpoint/replay. This
// exercises the completion boundary, not native Git or human acceptance.
async function fixture(mutate = () => {}, mutateResult = () => {}, withPlanning = false) {
  const module = read("examples/modules/change-integration.module.json");
  const plugin = read("examples/plugins/local-git-integration.plugin.json");
  const operation = module.operations[0];
  const artifacts = new Map();
  function loaded(value, artifactId, port) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`);
    const ref = { artifactId, schema: port?.schema ?? "https://devrelay.dev/evidence/v1",
      mediaType: port?.mediaTypes[0] ?? "application/json", digest: sha256Digest(bytes), uri: `memory://${artifactId}` };
    artifacts.set(ref.digest, bytes);
    return { value, ref };
  }
  const input = (value, id, name) => loaded(value, id, operation.inputs.find(port => port.name === name));
  const output = (value, id, name) => loaded(value, id, operation.outputs.find(port => port.name === name));
  const overview = input({ apiVersion, kind: "ProjectOverviewBaseline", baselineId: "POB" }, "POB", "project-overview-baseline");
  const workBaseline = withPlanning ? read("examples/artifacts/work-breakdown-baseline-auth-001.json") : null;
  const workValue = workBaseline?.workItems[0] ?? { id: "WI-ONE", objective: "Fixture only" };
  const work = loaded(workValue, workValue.id);
  const baselines = Object.fromEntries(["requirementsBaseline", "architectureBaseline", "contractDisposition",
    "workBreakdownBaseline", "workDependencyBaseline", "specialistAssignmentBaseline"].map(role => [role, loaded({ role }, role).ref]));
  baselines.projectOverviewBaseline = overview.ref;
  if (withPlanning) {
    const contract = name => ({ schema: `https://devrelay.dev/artifacts/${name}/v1`, mediaTypes: [`application/vnd.devrelay.${name}+json`] });
    baselines.workBreakdownBaseline = loaded(workBaseline, workBaseline.baselineId, contract("work-breakdown-baseline")).ref;
    const nodes = workBaseline.workItems.map(item => item.id).sort();
    const evidence = loaded({ purpose: "Synthetic dependency evidence" }, "DEP-EVIDENCE").ref;
    const edges = nodes.slice(1).map((id, index) => ({ id: `DEP-${index}`, prerequisiteId: nodes[0], dependentId: id,
      rationale: "Fixture prerequisite", evidence: [{ artifact: evidence }], policyDisposition: "allow" }));
    const dependency = { apiVersion, kind: "WorkDependencyBaseline", baselineId: "WDB-COMPLETION", version: "1.0.0",
      approvedCandidate: evidence, workBreakdownBaseline: baselines.workBreakdownBaseline, nodes, edges,
      graphDigest: canonicalJsonDigest({ nodes, edges }), topologicalOrder: nodes,
      policyEvidence: evidence, consistencyEvidence: evidence, approvalEvidence: [evidence], sourceRefs: [] };
    baselines.workDependencyBaseline = loaded(dependency, dependency.baselineId, contract("work-dependency-baseline")).ref;
  }
  const subjectValue = seal({ apiVersion, kind: "VerifiedWorkItemSubject", subjectId: "SUB",
    workItem: pointer(work.ref), changeSet: { artifactId: "CHANGE", digest: D },
    verificationGateApproval: { artifactId: "GATE", digest: D }, verificationEvidence: [{ artifactId: "VE", digest: D }] }, "subjectDigest");
  const bindingValue = seal({ apiVersion, kind: "IntegrationInputBinding", bindingId: "BIND",
    subject: { artifactId: "SUB", digest: subjectValue.subjectDigest },
    baselines: Object.fromEntries(Object.entries(baselines).map(([role, ref]) => [role, pointer(ref)])),
    target: { repositorySnapshot: { artifactId: "PRE", digest: D }, ref: "refs/heads/main", expectedCommit: C },
    integrationPolicy: { artifactId: "POLICY", digest: D }, adapter: { id: "integration.local", version: "1.0.0", configurationDigest: D },
    permissionDemands: [{ kind: "process.spawn", scope: { values: ["git"] } }], idempotencyKey: "CI-ONE" }, "bindingDigest");
  const recordValue = seal({ apiVersion, kind: "IntegratedChangeRecord", recordId: "REC",
    subject: { artifactId: "SUB", digest: subjectValue.subjectDigest }, plan: { artifactId: "PLAN", digest: D },
    preState: { ref: "refs/heads/main", commit: C, treeDigest: D },
    postState: { ref: "refs/heads/main", commit: N, treeDigest: D }, integrationEvidence: [{ artifactId: "NATIVE", digest: D }] }, "recordDigest");
  const state = { subjectValue, bindingValue, recordValue, baselines };
  mutate(state);
  const subject = input(state.subjectValue, "SUB", "verified-work-item-subject");
  const binding = input(state.bindingValue, "BIND", "integration-input-binding");
  const record = output(state.recordValue, "REC", "integrated-change-record");
  const snapshot = output({ apiVersion, kind: "RepositorySnapshot", repository: "fixture", revision: N, treeDigest: D,
    includedPaths: [], excludedPaths: [] }, "POST", "repository-snapshot");
  const invocation = { apiVersion, kind: "ModuleInvocation", invocationId: "CI-COMPLETION", runId: "RUN-CI", nodeId: "NODE-CI",
    module: { id: "change-integration", version: "0.1.0", operation: "integrate-change" },
    plugin: { id: "local-git-integration", version: "0.1.0" },
    inputs: { "project-overview-baseline": [overview.ref], "verified-work-item-subject": [subject.ref], "integration-input-binding": [binding.ref] },
    options: {}, config: { repositoryPath: "C:/fixture", gitExecutable: "git", timeoutMs: 1000, maxOutputBytes: 1024 },
    grants: [{ kind: "filesystem.read", scope: "C:/fixture" }, { kind: "filesystem.write", scope: "C:/fixture" }, { kind: "process.spawn", scope: "git" }] };
  const result = { apiVersion, kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome: "integrated",
    outputs: { "integrated-change-record": [record.ref], "repository-snapshot": [snapshot.ref] }, diagnostics: [], evidence: [
      { kind: "change-integration/native-effect", subject: "REC", status: "pass", artifact: record.ref },
      { kind: "change-integration/post-state", subject: "POST", status: "pass", artifact: snapshot.ref }] };
  mutateResult(result);
  let calls = 0;
  const registry = createModuleRegistry({ modules: [module], plugins: [{ definition: plugin, adapter: { invoke: async () => { calls++; return result; } } }],
    artifactContracts: [...new Set([...operation.inputs, ...operation.outputs].map(port => port.schema))].map(schema => ({ schema, validate: value => value })) });
  const checkpoints = new Map();
  const context = { artifacts: { load: async ref => Buffer.from(artifacts.get(ref.digest)) },
    checkpoints: { get: async key => checkpoints.get(key), put: async (key, value) => checkpoints.set(key, value) } };
  await registry.execute(invocation, context);
  const replay = await registry.verifyCheckpointedExecution(invocation, context);
  return { request: { checkpointReplay: replay, workItemRef: work.ref, baselines }, calls: () => calls, record, snapshot,
    replay: () => registry.verifyCheckpointedExecution(invocation, context), loadArtifact: context.artifacts.load };
}

test("completion requires genuine replay and preserves exact output references with zero-call replay", async () => {
  const f = await fixture();
  const fact = deriveLocalIntegrationCompletion(f.request);
  assert.deepEqual(fact, { workItemId: "WI-ONE", authority: "approved", integrationRef: f.record.ref, evidence: [f.record.ref, f.snapshot.ref] });
  const replay = await f.replay();
  assert.deepEqual(deriveLocalIntegrationCompletion({ ...f.request, checkpointReplay: replay }), fact);
  assert.equal(f.calls(), 1);
  assert.throws(() => deriveLocalIntegrationCompletion({ ...f.request, checkpointReplay: structuredClone(replay) }), /verified checkpoint replay receipt/);
  assert.throws(() => deriveLocalIntegrationCompletion({ checkpointReplay: { outcome: "integrated" } }), /verified checkpoint replay receipt/);
});

test("completion rejects substituted work, omitted baselines, and every stale baseline", async () => {
  const { request } = await fixture();
  assert.throws(() => deriveLocalIntegrationCompletion({ ...request, workItemRef: { ...request.workItemRef, digest: D } }), /approved work item/);
  const missing = structuredClone(request.baselines); delete missing.requirementsBaseline;
  assert.throws(() => deriveLocalIntegrationCompletion({ ...request, baselines: missing }), /seven baseline/);
  const partial = structuredClone(request.baselines); delete partial.architectureBaseline.uri;
  assert.throws(() => deriveLocalIntegrationCompletion({ ...request, baselines: partial }), /full artifact/);
  for (const role of Object.keys(request.baselines)) {
    const baselines = structuredClone(request.baselines); baselines[role].digest = D;
    assert.throws(() => deriveLocalIntegrationCompletion({ ...request, baselines }), /activated lineage/);
  }
});

test("a genuine non-integrated replay is not work completion", async () => {
  const f = await fixture(() => {}, result => {
    result.outcome = "baseline-drift"; result.outputs = {}; result.evidence = [];
    result.diagnostics = [{ code: "CI_BASELINE_DRIFT", severity: "error", message: "Fixture target changed." }];
  });
  assert.throws(() => deriveLocalIntegrationCompletion(f.request), /completed ChangeIntegration/);
});

test("schema-valid but contradictory integration records cannot unlock dependent work", async () => {
  for (const mutation of [
    value => { value.subject = { artifactId: "OTHER", digest: D }; },
    value => { value.preState.commit = N; },
    value => { value.postState.ref = "refs/heads/other"; },
    value => { value.postState.commit = C; },
  ]) {
    const f = await fixture(state => { mutation(state.recordValue); state.recordValue = seal(state.recordValue, "recordDigest"); });
    assert.throws(() => deriveLocalIntegrationCompletion(f.request), /lineage differs/);
  }
});

test("durable completion survives storage reopen, refuses implicit empty history and deduplicates replay", async t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-completion-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const f = await fixture();
  const request = () => ({ storage, namespace: "fixture", baselines: f.request.baselines, verifyIntegration: f.replay });
  await assert.rejects(readLocalCompletionLedger(request()), /does not exist/);
  initializeLocalCompletionLedger(request());
  assert.equal((await readLocalCompletionLedger(request())).factSet.facts.length, 0);
  const appended = await appendLocalCompletion({ ...request(), ...f.request, expectedVersion: 0 });
  assert.equal(appended.version, 1);
  assert.equal(appended.factSet.facts.length, 1);
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  const { replayed: wasReplay, ...snapshot } = appended;
  assert.equal(wasReplay, false);
  assert.deepEqual(await readLocalCompletionLedger(request()), snapshot);
  const repeated = await appendLocalCompletion({ ...request(), ...f.request, expectedVersion: 0 });
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.version, 1);
  assert.equal(storage.readTransitionJournal(appended.runId).length, 1);
  initializeLocalCompletionLedger(request());
  assert.equal((await readLocalCompletionLedger(request())).factSet.facts.length, 1);
  await assert.rejects(readLocalCompletionLedger({ ...request(), verifyIntegration: async () => structuredClone(await f.replay()) }), /verified checkpoint replay receipt/);
  assert.equal(f.calls(), 1);
});

test("completion append rolls back interrupted publication and rejects stale writes and truncated history", async t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-completion-crash-"));
  let interrupt = false;
  const storage = createLocalHostStorage({ rootDirectory, failureInjector: ({ boundary }) => {
    if (interrupt && boundary === "after-state-update-before-journal") throw new Error("simulated completion crash");
  } });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const f = await fixture();
  const request = { storage, namespace: "fixture", baselines: f.request.baselines, verifyIntegration: f.replay };
  initializeLocalCompletionLedger(request);
  await assert.rejects(appendLocalCompletion({ ...request, ...f.request, expectedVersion: 1 }), /stale expected ledger/);
  await assert.rejects(appendLocalCompletion({ ...request, ...f.request, expectedVersion: 0,
    verifyIntegration: async () => structuredClone(await f.replay()) }), /verified checkpoint replay receipt/);
  assert.equal((await readLocalCompletionLedger(request)).version, 0);
  interrupt = true;
  await assert.rejects(appendLocalCompletion({ ...request, ...f.request, expectedVersion: 0 }), /simulated completion crash/);
  interrupt = false;
  const empty = await readLocalCompletionLedger(request);
  assert.equal(empty.version, 0);
  assert.equal(storage.readTransitionJournal(empty.runId).length, 0);
  const committed = await appendLocalCompletion({ ...request, ...f.request, expectedVersion: 0 });
  assert.equal(committed.version, 1);
  const lease = storage.acquireLease({ runId: committed.runId, owner: "corrupt-fixture", expectedVersion: 1 });
  storage.commitTransition({ runId: committed.runId, expectedVersion: 1, leaseToken: lease.token,
    transition: { kind: "ForgedReset" }, nextState: empty.state });
  storage.releaseLease({ runId: committed.runId, leaseToken: lease.token });
  await assert.rejects(readLocalCompletionLedger(request), /history is incomplete/);
});

test("readiness advances only from durable integration, survives reopen and rejects completion overrides", async t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-readiness-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const f = await fixture(() => {}, () => {}, true);
  const request = () => ({ storage, namespace: "readiness", baselines: f.request.baselines,
    verifyIntegration: f.replay, loadArtifact: f.loadArtifact });
  initializeLocalCompletionLedger(request());
  const initial = await deriveLocalWorkReadiness(request());
  assert.deepEqual(initial.readyWorkItemIds, ["WI-AUTH-CORE"]);
  assert.equal(initial.dispositions.filter(item => item.status === "blocked").length, 3);
  assert.equal(initial.proofs[0].prerequisiteCompletionFacts.length, 0);
  await assert.rejects(deriveLocalWorkReadiness({ ...request(), completedWorkItemIds: ["WI-AUTH-CORE"] }), /undeclared readiness input/);
  await appendLocalCompletion({ ...request(), ...f.request, expectedVersion: 0 });
  assert.throws(() => assertLocalCompletionSnapshotCurrent({ ...request(), ...initial }), /snapshot is stale/);
  const after = await deriveLocalWorkReadiness(request());
  assert.deepEqual(after.readyWorkItemIds, ["WI-AUTH-FAILURE-TESTS", "WI-AUTH-OPERATIONS", "WI-AUTH-PERFORMANCE"]);
  assert.equal(after.dispositions.find(item => item.workItemId === "WI-AUTH-CORE").status, "completed");
  assert.equal(after.proofs.every(proof => proof.prerequisiteCompletionFacts[0].workItemId === "WI-AUTH-CORE"), true);
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  assert.deepEqual(await deriveLocalWorkReadiness(request()), after);
  assert.equal(f.calls(), 1);
});

test("readiness rejects byte drift and a completion committed while its inputs are loading", async t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-readiness-race-"));
  const storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const f = await fixture(() => {}, () => {}, true);
  const request = { storage, namespace: "readiness-race", baselines: f.request.baselines,
    verifyIntegration: f.replay, loadArtifact: f.loadArtifact };
  initializeLocalCompletionLedger(request);
  await assert.rejects(deriveLocalWorkReadiness({ ...request, loadArtifact: async ref => {
    const bytes = await f.loadArtifact(ref);
    return Buffer.concat([bytes, Buffer.from(" ")]);
  } }), error => error.code === "DR2103");
  let committed = false;
  await assert.rejects(deriveLocalWorkReadiness({ ...request, loadArtifact: async ref => {
    if (!committed) {
      committed = true;
      await appendLocalCompletion({ ...request, ...f.request, expectedVersion: 0 });
    }
    return f.loadArtifact(ref);
  } }), /snapshot is stale/);
  const fresh = await deriveLocalWorkReadiness(request);
  assert.equal(fresh.ledgerVersion, 1);
  assert.equal(fresh.readyWorkItemIds.includes("WI-AUTH-CORE"), false);
});

for (const interruptedAt of ["ledger", "readiness", "parent-commit"]) {
  test(`queue recovery after ${interruptedAt} interruption reopens exact records and advances parent once`, async t => {
    const f = await fixture(() => {}, () => {}, true);
    const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-queue-recovery-"));
    let now = 1000, interrupt = true;
    let storage = createLocalHostStorage({ rootDirectory, clock: () => now,
      failureInjector({ boundary, runId }) {
        if (interrupt && interruptedAt === "parent-commit" && runId === "parent" && boundary === "before-state-commit") now = 121_000;
      } });
    t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
    storage.initializeRun({ runId: "parent", state: { status: "assignment-baseline-activated" } });
    const scheduler = { setInterval() { return 1; }, clearInterval() {} };
    const keeper = createLocalHostLeaseKeeper({ storage, scheduler, runId: "parent", owner: "first", expectedVersion: 0 });
    const namespace = "queue-recovery";
    const request = { namespace, baselines: f.request.baselines, verifyIntegration: f.replay, loadArtifact: f.loadArtifact };
    const durableRecords = createLocalHostCheckpointStore({ storage, namespace });
    const records = { ...durableRecords, put(key, value) {
      const result = durableRecords.put(key, value);
      if (interrupt && interruptedAt === "readiness") { now = 121_000; throw new Error("interrupted readiness"); }
      return result;
    } };
    const interruptedStorage = { ...storage, initializeRun(input) {
      const result = storage.initializeRun(input);
      if (interrupt && interruptedAt === "ledger" && input.runId.startsWith("completion-ledger:")) {
        now = 121_000; throw new Error("interrupted ledger");
      }
      return result;
    } };
    await assert.rejects(async () => {
      const queue = await prepareLocalWorkQueue({ ...request, storage: interruptedStorage, records });
      keeper.assertCurrent();
      storage.commitTransition({ runId: "parent", expectedVersion: 0, leaseToken: keeper.lease.token,
        transition: { kind: "queue" }, nextState: { status: "work-queue-prepared", workReadinessKey: queue.workReadinessKey } });
    }, interruptedAt === "parent-commit" ? { code: "DR4924" } : /interrupted/);
    assert.equal(storage.readRun("parent").version, 0);
    assert.deepEqual(storage.readTransitionJournal("parent"), []);
    storage.close(); interrupt = false;
    storage = createLocalHostStorage({ rootDirectory, clock: () => now });
    const successor = createLocalHostLeaseKeeper({ storage, scheduler, runId: "parent", owner: "successor", expectedVersion: 0 });
    assert.throws(() => storage.releaseLease({ runId: "parent", leaseToken: keeper.lease.token }), { code: "DR4924" });
    const recoveredRecords = createLocalHostCheckpointStore({ storage, namespace });
    const recoveredRequest = { ...request, storage, records: recoveredRecords };
    const recovered = await prepareLocalWorkQueue(recoveredRequest);
    assert.equal(recovered.readiness.ledgerVersion, 0);
    assert.equal(storage.listRuns({ prefix: "completion-ledger:" }).length, 1);
    assertLocalWorkQueueCurrent({ ...recoveredRequest, readiness: recovered.readiness });
    successor.assertCurrent();
    storage.commitTransition({ runId: "parent", expectedVersion: 0, leaseToken: successor.lease.token,
      transition: { kind: "queue" }, nextState: { status: "work-queue-prepared", workReadinessKey: recovered.workReadinessKey } });
    successor.close();
    assert.deepEqual(await prepareLocalWorkQueue(recoveredRequest), recovered);
    assert.equal(storage.readTransitionJournal("parent").length, 1);
    assert.equal(f.calls(), 1, "queue recovery cannot repeat the integration adapter");
  });
}

test("queue recovery reconciles a completed ledger without resetting or duplicating completion", async t => {
  const f = await fixture(() => {}, () => {}, true);
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-queue-completed-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const request = { namespace: "queue-completed", baselines: f.request.baselines, verifyIntegration: f.replay, loadArtifact: f.loadArtifact };
  let records = createLocalHostCheckpointStore({ storage, namespace: request.namespace });
  const stale = await prepareLocalWorkQueue({ ...request, storage, records });
  await appendLocalCompletion({ ...request, ...f.request, storage, expectedVersion: 0 });
  assert.throws(() => assertLocalWorkQueueCurrent({ ...request, storage, records, readiness: stale.readiness }), /snapshot is stale/);
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  records = createLocalHostCheckpointStore({ storage, namespace: request.namespace });
  const recovered = await prepareLocalWorkQueue({ ...request, storage, records });
  assert.equal(recovered.readiness.ledgerVersion, 1);
  assert.notEqual(recovered.workReadinessKey, stale.workReadinessKey);
  const completed = await appendLocalCompletion({ ...request, ...f.request, storage, expectedVersion: 0 });
  assert.equal(completed.replayed, true);
  assert.equal(completed.state.entries.length, 1);
  assert.equal(storage.readTransitionJournal(completed.runId).length, 1);
  assert.equal(f.calls(), 1);
});

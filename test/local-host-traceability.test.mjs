import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostTraceabilityStore } from "../src/local-host-traceability.mjs";
import { createTraceabilityGraphService } from "../src/traceability-graph.mjs";

function fixture(t, options = {}) {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-durable-graph-"));
  const storage = createLocalHostStorage({ rootDirectory, ...options });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const connect = (source = storage, namespace = "test") => {
    const store = createLocalHostTraceabilityStore({ storage: source, namespace, graphId: "test-graph" });
    const service = createTraceabilityGraphService({ graphId: "test-graph", projectId: "test-project", store, contributors: [] });
    return { store, service };
  };
  return { rootDirectory, storage, connect, ...connect() };
}

function prepare(service, id = "one", baseGraph = service.captureBase()) {
  const invocation = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleInvocation", invocationId: id,
    runId: "fixture", nodeId: id, module: { id: "fixture", version: "1.0.0", operation: "check" }, inputs: {}, options: {},
  };
  return service.prepare({
    baseGraph, invocation, invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: id, status: "completed", outcome: "checked", outputs: {}, evidence: [], diagnostics: [] },
    loadedInputs: {}, loadedOutputs: {},
  });
}

test("graph heads, exact receipts, history, and namespace isolation survive reopened storage", async (t) => {
  const fx = fixture(t);
  const initial = fx.service.captureBase();
  const first = await prepare(fx.service);
  const firstResult = await fx.service.mergePrepared(first);
  const second = await prepare(fx.service, "two");
  await fx.service.mergePrepared(second);
  fx.storage.close();
  const storage = createLocalHostStorage({ rootDirectory: fx.rootDirectory });
  try {
    const { store, service } = fx.connect(storage);
    assert.equal(service.captureBase().revision, 2);
    assert.deepEqual(store.receipt(first.updateRef), firstResult);
    assert.equal(store.isAncestor(initial.ref, service.captureBase().ref), true);
    assert.deepEqual(store.load(initial.ref).bytes, initial.bytes);
    assert.equal(Object.isFrozen(store.receipt(first.updateRef).receipt), true);
    assert.equal(fx.connect(storage, "other").service.captureBase().revision, 0);
    assert.throws(() => store.capture("other-graph"), { code: "DR4941" });
    assert.throws(() => store.load({ ...initial.ref, uri: "memory://substituted" }), { code: "DR4941" });
    assert.throws(() => store.receipt({ ...first.updateRef, uri: "memory://substituted" }), { code: "DR4941" });
    assert.equal(service.assertApplied(first.updateRef).resultGraphRef.digest, firstResult.snapshotRef.digest);
  } finally { storage.close(); }
});

for (const boundary of ["before-state-update", "after-state-update-before-journal", "before-state-commit"]) {
  test(`graph head and receipt both roll back at ${boundary}`, async (t) => {
    let interrupt = true;
    const fx = fixture(t, { failureInjector(event) {
      if (interrupt && event.boundary === boundary) throw new Error("interrupted transaction");
    } });
    const prepared = await prepare(fx.service);
    await assert.rejects(fx.service.mergePrepared(prepared), /interrupted transaction/u);
    assert.equal(fx.service.captureBase().revision, 0);
    assert.equal(fx.store.receipt(prepared.updateRef), undefined);
    interrupt = false;
    const result = await fx.service.mergePrepared(prepared);
    assert.equal(result.snapshot.revision, 1);
    assert.deepEqual(await fx.service.mergePrepared(prepared), result);
    assert.equal(fx.service.captureBase().revision, 1);
  });
}

test("stale-head and interleaved commits do not lose updates or duplicate receipts", async (t) => {
  const fx = fixture(t);
  const otherStorage = createLocalHostStorage({ rootDirectory: fx.rootDirectory });
  try {
    const other = fx.connect(otherStorage);
    const base = fx.service.captureBase();
    const left = await prepare(fx.service, "left", base);
    const right = await prepare(other.service, "right", base);
    const first = await fx.service.mergePrepared(left);
    const second = await other.service.mergePrepared(right);
    assert.equal(second.snapshot.revision, 2);
    assert.deepEqual(await other.service.mergePrepared(left), first);
    assert.equal(fx.store.commit({ graphId: "test-graph", expectedHead: base.ref, artifacts: [], updateRef: { ...left.updateRef, digest: `sha256:${"f".repeat(64)}` }, result: first }), undefined);
    assert.equal(fx.service.captureBase().revision, 2);
    assert.deepEqual(fx.store.receipt(right.updateRef), second);
  } finally { otherStorage.close(); }
});

test("graph pointers and corrupt content fail closed rather than reverting to genesis", async (t) => {
  const fx = fixture(t);
  await fx.service.mergePrepared(await prepare(fx.service));
  const run = fx.storage.listRuns({ prefix: "local-traceability:" })[0];
  const database = new DatabaseSync(fx.storage.databasePath);
  try {
    database.prepare("UPDATE runs SET state_json = ? WHERE run_id = ?").run(canonicalJson({ ...run.state, graphId: "substituted" }), run.runId);
    assert.throws(() => fx.service.captureBase(), { code: "DR4941" });
    database.prepare("UPDATE runs SET state_json = ? WHERE run_id = ?").run(canonicalJson(run.state), run.runId);
    const journal = fx.storage.readTransitionJournal(run.runId)[0];
    database.prepare("UPDATE transition_journal SET transition_json = ? WHERE entry_id = ?").run(canonicalJson({ ...journal.transition, id: `sha256:${"f".repeat(64)}` }), journal.entryId);
    assert.throws(() => fx.service.captureBase(), { code: "DR4941" });
    database.prepare("UPDATE transition_journal SET transition_json = ? WHERE entry_id = ?").run(canonicalJson(journal.transition), journal.entryId);
    const checkpoint = fx.storage.listRuns({ prefix: "local-checkpoint:" })[0].state.artifact;
    const digest = checkpoint.digest.slice(7);
    writeFileSync(join(fx.rootDirectory, "artifacts", "sha256", digest.slice(0, 2), digest.slice(2)), "corrupt");
    assert.throws(() => fx.storage.verifyIntegrity(), { code: "DR4919" });
  } finally { database.close(); }
});

for (const graphMode of ["normal", "before-commit", "after-commit"]) {
  test(`actual Core effect and graph recover in fresh processes: ${graphMode}`, (t) => {
    const fx = fixture(t);
    fx.storage.close();
    const script = fileURLToPath(new URL("./fixtures/local-host-checkpoint-replay.mjs", import.meta.url));
    const invoke = (mode) => {
      const child = spawnSync(process.execPath, [script, fx.rootDirectory, mode, graphMode], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };
    const first = invoke("execute");
    const recovered = invoke("replay");
    const repeated = invoke("replay");
    assert.equal(first.adapterCalls, 1);
    assert.equal(recovered.adapterCalls, 0);
    assert.equal(repeated.adapterCalls, 0);
    assert.equal(first.interrupted, graphMode !== "normal");
    assert.equal(first.graphRevision, graphMode === "before-commit" ? 0 : 1);
    assert.equal(recovered.graphRevision, 1);
    assert.deepEqual(recovered.updateRef, first.updateRef);
    assert.deepEqual(repeated.applicationProof, recovered.applicationProof);
    assert.equal(repeated.graphDigest, recovered.graphDigest);
    assert.equal(first.resultDigest, recovered.resultDigest);
    assert.equal(recovered.receiptKind, "VerifiedCheckpointReplayReceipt");
    assert.equal(readFileSync(join(fx.rootDirectory, "adapter-calls.txt"), "utf8"), "1");
  });
}

for (const [graphMode, exitCode] of [["crash-before-commit", 86], ["crash-after-commit", 87]]) {
  test(`abrupt process exit leaves recoverable exact graph state: ${graphMode}`, (t) => {
    const fx = fixture(t);
    fx.storage.close();
    const script = fileURLToPath(new URL("./fixtures/local-host-checkpoint-replay.mjs", import.meta.url));
    const invoke = (mode) => spawnSync(process.execPath, [script, fx.rootDirectory, mode, graphMode], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    const terminated = invoke("execute");
    assert.ifError(terminated.error);
    assert.equal(terminated.status, exitCode, terminated.stderr);
    const recoveryStorage = createLocalHostStorage({ rootDirectory: fx.rootDirectory, clock: () => 1000 });
    try {
      const graphRun = recoveryStorage.listRuns({ prefix: "local-traceability:" }).find(({ state }) => state.graphId === "durable-restart-proof");
      assert.equal(graphRun.version, graphMode === "crash-before-commit" ? 0 : 1);
      assert.ok(graphRun.lease);
      assert.throws(() => recoveryStorage.acquireLease({ runId: graphRun.runId, expectedVersion: graphRun.version, owner: "other-owner" }), { code: "DR4924" });
    } finally { recoveryStorage.close(); }
    const recovered = invoke("replay");
    assert.ifError(recovered.error);
    assert.equal(recovered.status, 0, recovered.stderr);
    const result = JSON.parse(recovered.stdout);
    const repeated = invoke("replay");
    assert.ifError(repeated.error);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(result.adapterCalls, 0);
    assert.equal(result.graphRevision, 1);
    assert.deepEqual(JSON.parse(repeated.stdout).applicationProof, result.applicationProof);
    assert.equal(readFileSync(join(fx.rootDirectory, "adapter-calls.txt"), "utf8"), "1");
  });
}

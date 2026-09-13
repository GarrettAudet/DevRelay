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
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";

function fixture(t) {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-durable-checkpoints-"));
  const storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  return { rootDirectory, storage, store: createLocalHostCheckpointStore({ storage, namespace: "core/run-1" }) };
}
const code = (expected) => (error) => error?.code === expected;

test("the versioned checkpoint wire contract is closed and requires exact identities", () => {
  const schema = JSON.parse(readFileSync(new URL("../contracts/local-host-checkpoint.schema.json", import.meta.url)));
  const validate = compileArtifactSchema(schema);
  const valid = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalHostCheckpoint", namespace: "run", key: "step", value: { status: "recorded" } };
  assert.equal(validate(valid), true);
  assert.equal(validate({ ...valid, value: null }), true);
  for (const invalid of [
    { ...valid, authority: "approved" }, { ...valid, apiVersion: "other" },
    { ...valid, kind: "GateApproval" }, { ...valid, namespace: "" },
    { ...valid, key: 42 }, { ...valid, value: undefined },
  ]) assert.equal(validate(invalid), false);
});

test("durable checkpoints preserve exact JSON, idempotency and namespace isolation", (t) => {
  const { storage, store } = fixture(t);
  assert.equal(store.get("missing"), undefined);
  const value = { result: { list: [1, null, false, "é"] }, outcome: "recorded" };
  assert.deepEqual(store.put("step:1", value), value);
  value.result.list[0] = 9;
  assert.equal(store.get("step:1").result.list[0], 1);
  assert.throws(() => { store.get("step:1").result.list.push(3); }, TypeError);
  assert.deepEqual(store.put("step:1", { outcome: "recorded", result: { list: [1, null, false, "é"] } }), store.get("step:1"));
  assert.throws(() => store.put("step:1", { outcome: "different" }), code("DR4932"));
  assert.deepEqual(store.putIfAbsent("step:1", { outcome: "different" }), store.get("step:1"));
  const other = createLocalHostCheckpointStore({ storage, namespace: "other/run-1" });
  assert.equal(other.get("step:1"), undefined);
  other.put("step:1", null);
  assert.equal(other.get("step:1"), null);
  assert.equal(storage.listRuns().length, 2);
  assert.equal(storage.verifyIntegrity().database, "ok");
});

test("unsupported data fails before persistence and never executes getters/toJSON", (t) => {
  const { storage, store } = fixture(t);
  let calls = 0;
  const accessor = Object.defineProperty({}, "secret", { enumerable: true, get() { calls++; return "value"; } });
  const cycle = {}; cycle.self = cycle;
  const hidden = Object.defineProperty({}, "x", { value: 1 });
  const customArray = []; Object.setPrototypeOf(customArray, { map() { calls++; return []; } });
  for (const value of [undefined, NaN, Infinity, 1n, () => {}, new Date(), new Map(), Buffer.from("x"),
    { x: undefined }, { toJSON() { calls++; return {}; } }, accessor, cycle, hidden, customArray,
    { [Symbol("x")]: 1 }, Array(1)]) {
    assert.throws(() => store.put("invalid", value), code("DR4930"));
  }
  assert.equal(calls, 0);
  assert.deepEqual(storage.listRuns(), []);
  assert.throws(() => store.get(""), code("DR4930"));
  assert.throws(() => createLocalHostCheckpointStore({ storage, namespace: "" }), code("DR4930"));
});

test("a competing immutable insertion returns the exact durable winner", (t) => {
  const { storage } = fixture(t);
  const winner = createLocalHostCheckpointStore({ storage, namespace: "race" });
  let raced = false;
  const contender = createLocalHostCheckpointStore({
    namespace: "race",
    storage: {
      ...storage,
      initializeRun(input) {
        if (!raced) { raced = true; winner.put("key", { writer: "winner" }); }
        return storage.initializeRun(input);
      },
    },
  });
  assert.deepEqual(contender.putIfAbsent("key", { writer: "contender" }), { writer: "winner" });
  assert.throws(() => contender.put("key", { writer: "contender" }), code("DR4932"));
  assert.deepEqual(winner.get("key"), { writer: "winner" });
});

test("a failed pointer commit is not visible as a completed checkpoint", (t) => {
  const { storage, store } = fixture(t);
  const failed = createLocalHostCheckpointStore({
    namespace: "core/run-1",
    storage: { ...storage, initializeRun() { throw new Error("simulated storage failure"); } },
  });
  assert.throws(() => failed.put("key", { effect: "observed" }), /simulated storage failure/u);
  assert.equal(store.get("key"), undefined);
  assert.deepEqual(store.put("key", { effect: "observed" }), { effect: "observed" });
});

test("corrupt CAS bytes and pointer substitution are errors, not cache misses", (t) => {
  const { rootDirectory, storage, store } = fixture(t);
  store.put("bytes", { ok: true });
  const run = storage.listRuns()[0];
  const hex = run.artifactRefs[0].digest.slice(7);
  writeFileSync(join(rootDirectory, "artifacts", "sha256", hex.slice(0, 2), hex.slice(2)), "corrupted");
  assert.throws(() => store.get("bytes"), code("DR4919"));
  store.put("pointer", { ok: true });
  const runId = `local-checkpoint:${canonicalJsonDigest({ namespace: "core/run-1", key: "pointer" }).slice(7)}`;
  const original = storage.readRun(runId);
  const database = new DatabaseSync(join(rootDirectory, "state.sqlite"));
  try {
    database.prepare("UPDATE runs SET state_json = ? WHERE run_id = ?")
      .run(canonicalJson({ ...original.state, namespace: "substituted" }), runId);
    assert.throws(() => store.get("pointer"), code("DR4931"));
  } finally { database.close(); }
});

test("real Core checkpoint verification survives a new process without invoking its fixture adapter", (t) => {
  const { rootDirectory, storage } = fixture(t);
  storage.close();
  const script = fileURLToPath(new URL("./fixtures/local-host-checkpoint-replay.mjs", import.meta.url));
  const invoke = (mode) => {
    const child = spawnSync(process.execPath, [script, rootDirectory, mode], {
      encoding: "utf8", windowsHide: true, timeout: 30_000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const first = invoke("execute");
  const second = invoke("replay");
  assert.equal(first.adapterCalls, 1);
  assert.equal(second.adapterCalls, 0);
  assert.equal(second.receiptKind, "VerifiedCheckpointReplayReceipt");
  assert.equal(first.resultDigest, second.resultDigest);
  assert.equal(readFileSync(join(rootDirectory, "adapter-calls.txt"), "utf8"), "1");
});

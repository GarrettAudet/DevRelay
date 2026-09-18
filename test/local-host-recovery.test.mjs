import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostLeaseKeeper } from "../src/local-host-recovery.mjs";

function fixture(t) {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-host-recovery-"));
  let now = 1000;
  let scheduled;
  const storage = createLocalHostStorage({ rootDirectory, clock: () => now });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  storage.initializeRun({ runId: "parent", state: { status: "prepared" } });
  const scheduler = {
    setInterval(callback, interval) { assert.equal(interval, 10_000); scheduled = callback; return 1; },
    clearInterval(timer) { assert.equal(timer, 1); scheduled = undefined; },
  };
  return { storage, scheduler, setTime(value) { now = value; }, heartbeat() { scheduled?.(); },
    scheduled: () => scheduled, keep: () => createLocalHostLeaseKeeper({ storage, scheduler,
      runId: "parent", owner: "worker", expectedVersion: 0 }) };
}

test("controlled host heartbeat renews beyond the original deadline without changing lease duration", t => {
  const f = fixture(t);
  const keeper = f.keep();
  const token = keeper.lease.token;
  for (const now of [11_000, 111_000, 211_000]) {
    f.setTime(now); f.heartbeat();
    assert.deepEqual(f.storage.readRun("parent").lease, { owner: "worker", token, expiresAt: now + 120_000 });
  }
  keeper.assertCurrent();
  f.storage.commitTransition({ runId: "parent", expectedVersion: 0, leaseToken: token,
    transition: { kind: "finish" }, nextState: { status: "done" } });
  keeper.close(); keeper.close();
  assert.equal(f.scheduled(), undefined);
  assert.equal(f.storage.readRun("parent").lease, null);
  assert.equal(f.storage.readTransitionJournal("parent").length, 1);
});

test("missed heartbeat fails closed and stale cleanup preserves successor ownership", t => {
  const f = fixture(t);
  const keeper = f.keep();
  f.setTime(121_000); f.heartbeat();
  assert.throws(() => keeper.throwIfFailed(), { code: "DR4924" });
  assert.throws(() => keeper.assertCurrent(), { code: "DR4924" });
  const successor = f.storage.acquireLease({ runId: "parent", owner: "successor", expectedVersion: 0 });
  const before = f.storage.readRun("parent");
  assert.throws(() => keeper.assertCurrent(), { code: "DR4924" });
  assert.throws(() => f.storage.commitTransition({ runId: "parent", expectedVersion: 0,
    leaseToken: keeper.lease.token, transition: {}, nextState: { status: "unauthorized" } }), { code: "DR4924" });
  keeper.close();
  assert.deepEqual(f.storage.readRun("parent"), before);
  assert.equal(f.storage.readRun("parent").lease.token, successor.token);
  assert.deepEqual(f.storage.readTransitionJournal("parent"), []);
});

test("foreground ownership check detects expiry even when the scheduler has not fired", t => {
  const f = fixture(t);
  const keeper = f.keep();
  f.setTime(121_000);
  assert.throws(() => keeper.assertCurrent(), { code: "DR4924" });
  keeper.close();
  assert.equal(f.storage.readRun("parent").version, 0);
});

test("scheduler setup failure releases the acquired lease", t => {
  const f = fixture(t);
  assert.throws(() => createLocalHostLeaseKeeper({ storage: f.storage, runId: "parent", owner: "worker",
    expectedVersion: 0, scheduler: { setInterval() { throw new Error("scheduler unavailable"); }, clearInterval() {} } }), /scheduler unavailable/);
  assert.equal(f.storage.readRun("parent").lease, null);
});

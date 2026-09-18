import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";

test("lease renewal preserves ownership and never revives expiry or a stale version", t => {
  let now = 1000;
  const root = mkdtempSync(join(tmpdir(), "devrelay-lease-renewal-"));
  const storage = createLocalHostStorage({ rootDirectory: root, clock: () => now });
  t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
  storage.initializeRun({ runId: "lease", state: { stage: 0 } });
  const lease = storage.acquireLease({ runId: "lease", owner: "first", expectedVersion: 0, durationMilliseconds: 100 });
  now += 80;
  const renewed = storage.renewLease({ runId: "lease", leaseToken: lease.token, expectedVersion: 0, durationMilliseconds: 100 });
  assert.equal(renewed.token, lease.token);
  assert.equal(renewed.expiresAt, 1180);
  now = 1120;
  assert.throws(() => storage.acquireLease({ runId: "lease", owner: "other", expectedVersion: 0 }), /active lease/);
  for (const update of [{ leaseToken: "wrong" }, { expectedVersion: 1 }, { durationMilliseconds: 0 }]) {
    assert.throws(() => storage.renewLease({ runId: "lease", leaseToken: lease.token, expectedVersion: 0, ...update }), /renewal/);
  }
  storage.commitTransition({ runId: "lease", expectedVersion: 0, leaseToken: lease.token, transition: { kind: "advance" }, nextState: { stage: 1 } });
  assert.throws(() => storage.renewLease({ runId: "lease", leaseToken: lease.token, expectedVersion: 0 }), /renewal/);
  now = 1180;
  assert.throws(() => storage.renewLease({ runId: "lease", leaseToken: lease.token, expectedVersion: 1 }), /renewal/);
  const successor = storage.acquireLease({ runId: "lease", owner: "other", expectedVersion: 1 });
  assert.throws(() => storage.renewLease({ runId: "lease", leaseToken: lease.token, expectedVersion: 1 }), /renewal/);
  assert.throws(() => storage.releaseLease({ runId: "lease", leaseToken: lease.token }), { code: "DR4924" });
  assert.deepEqual(storage.readRun("lease").lease, successor);
  storage.releaseLease({ runId: "lease", leaseToken: successor.token });
});

test("same-owner acquisitions in one clock tick never reuse a stale token", t => {
  const root = mkdtempSync(join(tmpdir(), "devrelay-lease-token-"));
  const storage = createLocalHostStorage({ rootDirectory: root, clock: () => 1000 });
  t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
  storage.initializeRun({ runId: "lease", state: {} });
  const request = { runId: "lease", owner: "same-worker", expectedVersion: 0 };
  const first = storage.acquireLease(request);
  storage.releaseLease({ runId: "lease", leaseToken: first.token });
  const successor = storage.acquireLease(request);
  assert.notEqual(first.token, successor.token);
  assert.throws(() => storage.releaseLease({ runId: "lease", leaseToken: first.token }), { code: "DR4924" });
  assert.throws(() => storage.renewLease({ runId: "lease", leaseToken: first.token, expectedVersion: 0 }), { code: "DR4924" });
  assert.deepEqual(storage.readRun("lease").lease, successor);
});

for (const stoppedAt of ["before-state-update", "after-state-update-before-journal", "before-state-commit"]) {
  test(`expiry at ${stoppedAt} rolls back parent state and journal together`, t => {
    let now = 1000;
    const root = mkdtempSync(join(tmpdir(), "devrelay-lease-commit-"));
    const storage = createLocalHostStorage({ rootDirectory: root, clock: () => now,
      failureInjector({ boundary }) { if (boundary === stoppedAt) now = 1100; } });
    t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
    storage.initializeRun({ runId: "parent", state: { status: "prepared" } });
    const lease = storage.acquireLease({ runId: "parent", owner: "worker", expectedVersion: 0, durationMilliseconds: 100 });
    assert.throws(() => storage.commitTransition({ runId: "parent", expectedVersion: 0, leaseToken: lease.token,
      transition: { kind: "finish" }, nextState: { status: "done" } }), { code: "DR4924" });
    assert.equal(storage.readRun("parent").version, 0);
    assert.deepEqual(storage.readRun("parent").state, { status: "prepared" });
    assert.deepEqual(storage.readTransitionJournal("parent"), []);
  });
}

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
  storage.releaseLease({ runId: "lease", leaseToken: successor.token });
});

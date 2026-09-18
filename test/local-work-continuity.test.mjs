import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createDurableWorkContinuityStore, deriveWorkFingerprint, transitionWorkAttempt } from "../src/work-continuity.mjs";
import { claimLocalWorkContinuity, recoverLocalWorkContinuityClaim, verifyLocalWorkContinuityClaim } from "../src/local-work-continuity.mjs";

const digest = label => canonicalJsonDigest({ label });
const fingerprint = (overrides = {}) => deriveWorkFingerprint({ projectId: "fixture", requirementsBaselineDigest: digest("requirements"),
  projectOverviewBaselineDigest: digest("overview"), workItem: { id: "WI-ONE", type: "code-change" },
  targetRevision: "a".repeat(40), assignment: { specialistId: "fixture" }, qualityResolutionDigest: digest("quality"),
  inputs: [], implementationConfigurationDigest: digest("config"), ...overrides });
function fixture(t) {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-local-claim-"));
  let storage = createLocalHostStorage({ rootDirectory });
  let store = createDurableWorkContinuityStore({ storage, projectId: "fixture" });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  return { get storage() { return storage; }, get store() { return store; }, reopen() {
    storage.close(); storage = createLocalHostStorage({ rootDirectory });
    store = createDurableWorkContinuityStore({ storage, projectId: "fixture" });
  } };
}
const request = (store, overrides = {}) => ({ store, workFingerprint: fingerprint(), attemptId: "ATTEMPT-ONE", owner: "desktop",
  now: 100, leaseExpiresAt: 200, expectedHostVersion: 0, expectedIndexRevision: 0, ...overrides });

test("historical claim evidence survives expiry and completion without authorizing recovery", t => {
  const f = fixture(t);
  const original = claimLocalWorkContinuity(request(f.store));
  const historical = () => {
    const { now, ...input } = request(f.store);
    return { storage: f.storage, ...input };
  };
  assert.deepEqual(verifyLocalWorkContinuityClaim(historical()), original);
  assert.throws(() => verifyLocalWorkContinuityClaim({ ...historical(), now: 300 }), /undeclared/);
  assert.throws(() => recoverLocalWorkContinuityClaim({ ...historical(), now: 300 }), /expired/);
  for (const [fromStatus, toStatus] of [["prepared", "dispatched"], ["dispatched", "running"], ["running", "completed"]]) {
    const current = f.store.read();
    f.store.commit({ expectedHostVersion: current.version, expectedIndexRevision: current.state.index.revision,
      transition: { kind: "FixtureProgress", toStatus }, nextIndex: transitionWorkAttempt({ index: current.state.index,
        expectedRevision: current.state.index.revision, attemptId: "ATTEMPT-ONE", fromStatus, toStatus,
        ...(toStatus === "completed" ? { receiptDigest: digest("receipt"), resultDigest: digest("result"), evidenceDigest: digest("evidence") } : {}) }) });
    f.reopen();
    const before = f.store.read();
    assert.deepEqual(verifyLocalWorkContinuityClaim(historical()), original);
    assert.throws(() => recoverLocalWorkContinuityClaim({ ...historical(), now: 150 }), /reconciliation/);
    assert.deepEqual(f.store.read(), before);
  }
  for (const changes of [{ owner: "substituted" }, { leaseExpiresAt: 201 }, { expectedIndexRevision: 1 }]) {
    assert.throws(() => verifyLocalWorkContinuityClaim({ ...historical(), ...changes }));
  }
});

test("lost claim response recovers exact journaled claim after reopen without renewing or repeating work", t => {
  const f = fixture(t);
  const real = f.store;
  let original;
  const interrupted = { ...real, commit(args) {
    original = real.commit(args); throw new Error("fixture lost host response");
  } };
  assert.throws(() => claimLocalWorkContinuity(request(interrupted)), /lost host response/);
  f.reopen();
  const recovery = () => ({ storage: f.storage, ...request(f.store, { now: 150 }) });
  const recovered = recoverLocalWorkContinuityClaim(recovery());
  assert.equal(recovered.hostVersion, original.version);
  assert.equal(recovered.indexDigest, original.state.index.indexDigest);
  assert.equal(recovered.lease.leaseExpiresAt, 200);
  assert.equal(f.store.read().version, 1);
  for (const changes of [{ owner: "other" }, { leaseExpiresAt: 250 }, { now: 200 }, { expectedHostVersion: 1 }]) {
    assert.throws(() => recoverLocalWorkContinuityClaim({ ...recovery(), ...changes }));
  }
  const independentRequest = request(f.store, { attemptId: "ATTEMPT-INDEPENDENT",
    workFingerprint: fingerprint({ workItem: { id: "WI-INDEPENDENT", type: "test-change" } }),
    expectedHostVersion: 1, expectedIndexRevision: 1 });
  const independent = claimLocalWorkContinuity(independentRequest);
  assert.deepEqual(recoverLocalWorkContinuityClaim({ storage: f.storage, ...independentRequest }), independent);
  assert.deepEqual(recoverLocalWorkContinuityClaim(recovery()), recovered);
  assert.equal(f.store.read().version, 2);
  const head = f.store.read();
  f.store.commit({ expectedHostVersion: 2, expectedIndexRevision: 2, transition: { kind: "FixtureQuarantine" },
    nextIndex: transitionWorkAttempt({ index: head.state.index, expectedRevision: 2, attemptId: "ATTEMPT-ONE", fromStatus: "prepared", toStatus: "quarantined" }) });
  assert.throws(() => recoverLocalWorkContinuityClaim(recovery()), /reconciliation required/);
  assert.equal(f.store.read().version, 3);
});

test("same work stays exclusive across changed fingerprints, expiry and storage restart", t => {
  const f = fixture(t);
  const claim = claimLocalWorkContinuity(request(f.store));
  assert.equal(claim.hostVersion, 1);
  f.reopen();
  for (const changes of [{ implementationConfigurationDigest: digest("changed-config") },
    { targetRevision: "b".repeat(40) }, { qualityResolutionDigest: digest("changed-quality") }, { assignment: { specialistId: "other" } }]) {
    assert.throws(() => claimLocalWorkContinuity(request(f.store, { workFingerprint: fingerprint(changes), attemptId: "ATTEMPT-TWO",
      now: 300, leaseExpiresAt: 400, expectedHostVersion: 1, expectedIndexRevision: 1 })), /requires recovery or completion/);
  }
  assert.equal(f.store.read().version, 1);
});

test("quarantine never silently releases a work item; independent work can still be claimed", t => {
  const f = fixture(t);
  claimLocalWorkContinuity(request(f.store));
  const current = f.store.read();
  const nextIndex = transitionWorkAttempt({ index: current.state.index, expectedRevision: 1,
    attemptId: "ATTEMPT-ONE", fromStatus: "prepared", toStatus: "quarantined" });
  f.store.commit({ expectedHostVersion: 1, expectedIndexRevision: 1, transition: { kind: "FixtureQuarantine" }, nextIndex });
  assert.throws(() => claimLocalWorkContinuity(request(f.store, { attemptId: "ATTEMPT-TWO", expectedHostVersion: 2, expectedIndexRevision: 2 })), /requires recovery/);
  const independent = claimLocalWorkContinuity(request(f.store, { attemptId: "ATTEMPT-INDEPENDENT",
    workFingerprint: fingerprint({ workItem: { id: "WI-TWO", type: "test-change" } }), expectedHostVersion: 2, expectedIndexRevision: 2 }));
  assert.equal(independent.hostVersion, 3);
});

test("claim rejects stale, cross-project, expired and undeclared requests without advancing state", t => {
  const f = fixture(t);
  for (const [changes, pattern] of [[{ expectedHostVersion: 1 }, /stale/], [{ leaseExpiresAt: 100 }, /future/],
    [{ workFingerprint: fingerprint({ projectId: "other" }) }, /exact project/], [{ completed: true }, /undeclared/]]) {
    assert.throws(() => claimLocalWorkContinuity(request(f.store, changes)), pattern);
  }
  assert.equal(f.store.read().version, 0);
});

test("independent connections reject a claim raced after its initial readiness read", t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-local-claim-race-"));
  const firstStorage = createLocalHostStorage({ rootDirectory });
  const secondStorage = createLocalHostStorage({ rootDirectory });
  t.after(() => {
    firstStorage.close(); secondStorage.close();
    rmSync(rootDirectory, { recursive: true, force: true });
  });
  const first = createDurableWorkContinuityStore({ storage: firstStorage, projectId: "fixture" });
  const second = createDurableWorkContinuityStore({ storage: secondStorage, projectId: "fixture" });
  // Deterministic interleaving: both callers have observed revision zero, then
  // another SQLite connection wins before the first caller attempts its commit.
  const interleaved = {
    runId: first.runId,
    read: () => first.read(),
    commit(input) {
      claimLocalWorkContinuity(request(second, { attemptId: "ATTEMPT-WINNER",
        workFingerprint: fingerprint({ implementationConfigurationDigest: digest("other-config") }) }));
      return first.commit(input);
    },
  };
  assert.throws(() => claimLocalWorkContinuity(request(interleaved)), /version drifted/);
  const persisted = first.read();
  assert.equal(persisted.version, 1);
  assert.equal(persisted.state.index.records.length, 1);
  assert.equal(persisted.state.index.records[0].attemptId, "ATTEMPT-WINNER");
  assert.deepEqual(second.read(), persisted);
  assert.throws(() => claimLocalWorkContinuity(request(first, {
    expectedHostVersion: 1, expectedIndexRevision: 1,
  })), /requires recovery or completion/);
});

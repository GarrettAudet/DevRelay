import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { activateLocalDiscoveryState, verifyLocalDiscoveryActivation, assertLocalArchitectureCurrentState, localArchitectureHeadId } from "../src/local-discovery-activation.mjs";

test("discovery activation and verification require genuine Core authority before storage access", async () => {
  let accesses = 0;
  const request = { checkpointReplay: {}, gate: {}, namespace: "fixture", loadArtifact: () => { accesses++; },
    storage: new Proxy({}, { get() { accesses++; throw new Error("storage must not be reached"); } }) };
  await assert.rejects(activateLocalDiscoveryState(request), /receipt|checkpoint/i);
  await assert.rejects(verifyLocalDiscoveryActivation({ ...request, activation: {} }), /receipt|checkpoint/i);
  assert.equal(accesses, 0);
});

test("pending architecture approval blocks progression across storage restart without changing the head", t => {
  const root = mkdtempSync(join(tmpdir(), "devrelay-architecture-pending-"));
  let storage = createLocalHostStorage({ rootDirectory: root });
  t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
  const state = { artifactId: "fixture-state", digest: canonicalJsonDigest({}), schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
    mediaType: "application/vnd.devrelay.project-architecture-state+json", uri: "artifact://fixture/state" };
  const namespace = "pending-recovery-fixture";
  const runId = localArchitectureHeadId(namespace);
  const pendingCommit = canonicalJsonDigest({ gate: "fixture-only" });
  const saved = storage.initializeRun({ runId,
    state: { kind: "LocalArchitectureHead", state, activationDigest: null, pendingCommit } });
  assert.throws(() => assertLocalArchitectureCurrentState({ storage, namespace, state }), /needs recovery/);
  assert.deepEqual(storage.readRun(runId), saved);
  storage.close();
  storage = createLocalHostStorage({ rootDirectory: root });
  assert.throws(() => assertLocalArchitectureCurrentState({ storage, namespace, state }), /needs recovery/);
  assert.deepEqual(storage.readRun(runId), saved);
  assert.equal(storage.readTransitionJournal(runId).length, 0);

  const clearNamespace = "explicit-clear-fixture";
  storage.initializeRun({ runId: localArchitectureHeadId(clearNamespace),
    state: { kind: "LocalArchitectureHead", state, activationDigest: null, pendingCommit: null } });
  assert.doesNotThrow(() => assertLocalArchitectureCurrentState({ storage, namespace: clearNamespace, state }));
  const malformedNamespace = "malformed-pending-fixture";
  storage.initializeRun({ runId: localArchitectureHeadId(malformedNamespace),
    state: { kind: "LocalArchitectureHead", state, activationDigest: null, pendingCommit: "unbound-approval" } });
  assert.throws(() => assertLocalArchitectureCurrentState({ storage, namespace: malformedNamespace, state }), /stale|substituted/);
});

test("architecture head guard rejects stale, substituted and malformed fixture heads", t => {
  const root = mkdtempSync(join(tmpdir(), "devrelay-architecture-head-"));
  const storage = createLocalHostStorage({ rootDirectory: root });
  t.after(() => { storage.close(); rmSync(root, { recursive: true, force: true }); });
  const state = { artifactId: "fixture-state", digest: canonicalJsonDigest({}), schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
    mediaType: "application/vnd.devrelay.project-architecture-state+json", uri: "artifact://fixture/state" };
  const namespace = "fixture-guard-only";
  const args = { storage, namespace, state };
  assert.doesNotThrow(() => assertLocalArchitectureCurrentState(args));
  storage.initializeRun({ runId: `architecture-head:${canonicalJsonDigest({ namespace })}`,
    state: { kind: "LocalArchitectureHead", state, activationDigest: null } });
  assert.doesNotThrow(() => assertLocalArchitectureCurrentState(args));
  for (const changed of [{ ...state, digest: canonicalJsonDigest({ stale: true }) }, { ...state, artifactId: "substituted" }]) {
    assert.throws(() => assertLocalArchitectureCurrentState({ ...args, state: changed }), /stale|substituted/);
  }
  const badNamespace = "malformed";
  storage.initializeRun({ runId: `architecture-head:${canonicalJsonDigest({ namespace: badNamespace })}`, state: { state } });
  assert.throws(() => assertLocalArchitectureCurrentState({ ...args, namespace: badNamespace }), /stale|substituted/);
});

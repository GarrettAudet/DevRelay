import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  assertEnvironmentAdapterMaturity,
  createEnvironmentAdapterCheckpointController,
  createEnvironmentAdapterInvocation,
  defineEnvironmentAdapterManifest,
  EnvironmentPreparationAdapterError,
  selectEnvironmentAdapter,
} from "../src/environment-preparation-adapters.mjs";
import { createProviderExecutionAttestation } from "../src/provider-execution-attestation.mjs";

const D = (value) => canonicalJsonDigest(value);
const evidence = (id) => ({ artifactId: id, schema: "https://devrelay.dev/evidence/environment-adapter/v1", mediaType: "application/json", digest: D(id), uri: `memory://fixture/${id}` });
const configurationDigest = D("configuration");
const observer = { id: "devrelay.desktop-host", version: "1.0.0", configurationDigest: D("observer"), authority: "host-trusted-observer" };
const readGrant = { kind: "filesystem.read", scope: "project:**", purpose: "Observe declared project state." };
const writeGrant = { kind: "filesystem.write", scope: "project:.devrelay/**", purpose: "Apply approved project-local configuration." };

const inventoryManifest = () => defineEnvironmentAdapterManifest({ id: "fixture.inventory", version: "1.0.0", capabilities: ["target-probe", "inventory"], permissionDemands: [readGrant], offlineDefault: true, configurationSchemaDigest: D("inventory-schema") });
const effectManifest = () => defineEnvironmentAdapterManifest({ id: "fixture.effect", version: "1.0.0", capabilities: ["configure"], permissionDemands: [writeGrant], offlineDefault: true, configurationSchemaDigest: D("effect-schema") });
const checkpoints = () => {
  const values = new Map();
  return { async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("overwrite"); values.set(key, value); } };
};

function inventoryInvocation() {
  const selection = selectEnvironmentAdapter({ catalog: [effectManifest(), inventoryManifest()], configuredAdapterId: "fixture.inventory", capability: "inventory", hostGrants: [readGrant] });
  return createEnvironmentAdapterInvocation({ invocationId: "EP-ADAPTER-INVENTORY-001", selection, request: { repository: evidence("REPOSITORY"), profile: evidence("PROFILE") }, configurationDigest });
}

test("manifests are deterministic, capability-oriented, offline by default, and content-addressed", () => {
  const first = inventoryManifest();
  const second = inventoryManifest();
  assert.deepEqual(first, second);
  assert.deepEqual(first.capabilities, ["inventory", "target-probe"]);
  assert.equal(first.offlineDefault, true);
  assert.throws(() => defineEnvironmentAdapterManifest({ id: "bad", version: "1", capabilities: ["gate"], configurationSchemaDigest: D("bad") }), EnvironmentPreparationAdapterError);
});

test("Core selection is configuration-driven and enforces exact capability grants", () => {
  const catalog = [inventoryManifest(), effectManifest()];
  assert.equal(selectEnvironmentAdapter({ catalog, configuredAdapterId: "fixture.inventory", capability: "inventory", hostGrants: [readGrant] }).manifest.id, "fixture.inventory");
  assert.throws(() => selectEnvironmentAdapter({ catalog, configuredAdapterId: "missing", capability: "inventory", hostGrants: [readGrant] }), /unavailable or ambiguous/);
  assert.throws(() => selectEnvironmentAdapter({ catalog, configuredAdapterId: "fixture.effect", capability: "inventory", hostGrants: [writeGrant] }), /does not provide/);
  assert.throws(() => selectEnvironmentAdapter({ catalog, configuredAdapterId: "fixture.inventory", capability: "inventory", hostGrants: [] }), /lacks exact host grants/);
});

test("fixture inventory adapter produces a bounded receipt and exact replay performs zero host calls", async () => {
  const invocation = inventoryInvocation();
  let calls = 0;
  const controller = createEnvironmentAdapterCheckpointController({
    manifest: inventoryManifest(),
    checkpoints: checkpoints(),
    async hostExecute(exact) {
      calls += 1;
      return { invocationFingerprint: exact.invocationFingerprint, status: "completed", observations: [{ checkId: "NODE", status: "pass", value: "22.0.0" }], nativeEvidence: [evidence("NATIVE")], diagnostics: [], fixture: true };
    },
  });
  const first = await controller.execute(invocation);
  const replay = await controller.execute(invocation);
  assert.equal(first.receipt.maturity, "fixture-conformant");
  assert.equal(replay.replayed, true);
  assert.equal(replay.hostCalls, 0);
  assert.equal(calls, 1);
  assert.deepEqual(first.receipt, replay.receipt);
});

test("contract-only unavailable adapters remain honest about maturity", async () => {
  const invocation = inventoryInvocation();
  const controller = createEnvironmentAdapterCheckpointController({ manifest: inventoryManifest(), checkpoints: checkpoints(), hostExecute: async () => ({ invocationFingerprint: invocation.invocationFingerprint, status: "unavailable", observations: [], nativeEvidence: [evidence("UNAVAILABLE")], diagnostics: [{ code: "NO-TOOL", severity: "warning", message: "Provider is not installed." }], fixture: false }) });
  const result = await controller.execute(invocation);
  assert.equal(result.receipt.maturity, "contract-defined");
  assert.throws(() => assertEnvironmentAdapterMaturity({ receipt: result.receipt, requiredMaturity: "fixture-conformant" }), /below/);
});

test("malformed, authority-expanding, and secret-bearing provider output is rejected", async () => {
  const invocation = inventoryInvocation();
  for (const raw of [
    { invocationFingerprint: invocation.invocationFingerprint, status: "completed", observations: [], nativeEvidence: [], diagnostics: [], fixture: true, gateDecision: "ready" },
    { invocationFingerprint: invocation.invocationFingerprint, status: "completed", observations: [], nativeEvidence: [], diagnostics: [], fixture: true, token: "secret" },
    { invocationFingerprint: D("other"), status: "completed", observations: [], nativeEvidence: [], diagnostics: [], fixture: true },
  ]) {
    const controller = createEnvironmentAdapterCheckpointController({ manifest: inventoryManifest(), checkpoints: checkpoints(), hostExecute: async () => raw });
    await assert.rejects(() => controller.execute(invocation), EnvironmentPreparationAdapterError);
  }
});

test("effect adapters use the same port but cannot expand exact grants", async () => {
  const manifest = effectManifest();
  const selection = selectEnvironmentAdapter({ catalog: [manifest], configuredAdapterId: manifest.id, capability: "configure", hostGrants: [writeGrant] });
  const invocation = createEnvironmentAdapterInvocation({ invocationId: "EP-ADAPTER-EFFECT-001", selection, request: { effect: evidence("EFFECT") }, configurationDigest });
  const controller = createEnvironmentAdapterCheckpointController({ manifest, checkpoints: checkpoints(), hostExecute: async () => ({ invocationFingerprint: invocation.invocationFingerprint, status: "completed", effectResult: { outcome: "no-change", grants: [writeGrant] }, nativeEvidence: [evidence("EFFECT-RECEIPT")], diagnostics: [], fixture: true }) });
  const result = await controller.execute(invocation);
  assert.equal(result.raw.effectResult.outcome, "no-change");
  assert.equal(result.receipt.capability, "configure");
});

test("trusted live execution attestation upgrades only the exact invocation", async () => {
  const invocation = inventoryInvocation();
  const requestRef = { artifactId: "REQUEST", digest: D("REQUEST") };
  const attestation = createProviderExecutionAttestation({
    attestationId: "PEA-EP-INVENTORY-001",
    binding: { id: "fixture.inventory", version: "1.0.0", configurationDigest },
    capability: "environment-preparation.inventory",
    request: requestRef,
    tool: { name: "fixture.inventory", version: "1.0.0" },
    command: { executable: "fixture-inventory.exe", arguments: ["--offline"], workingDirectoryDigest: D("cwd") },
    execution: { startedAt: "2026-08-21T12:00:00.000Z", completedAt: "2026-08-21T12:00:01.000Z", exitCode: 0, stdoutDigest: D("stdout"), stderrDigest: D("stderr") },
    nativeArtifacts: [{ artifactId: "LIVE-NATIVE", digest: D("LIVE-NATIVE") }],
    observer,
  });
  const controller = createEnvironmentAdapterCheckpointController({
    manifest: inventoryManifest(),
    checkpoints: checkpoints(),
    trustedObservers: [observer],
    hostExecute: async () => ({ invocationFingerprint: invocation.invocationFingerprint, status: "completed", observations: [], nativeEvidence: [evidence("LIVE-NATIVE")], diagnostics: [], fixture: false, executionAttestation: attestation }),
  });
  const result = await controller.execute(invocation);
  assert.equal(result.receipt.maturity, "live-conformant");
  assert.equal(assertEnvironmentAdapterMaturity({ receipt: result.receipt, requiredMaturity: "live-conformant" }), result.receipt);
});

test("changed configuration or adapter identity cannot reuse a checkpoint", async () => {
  const invocation = inventoryInvocation();
  const store = checkpoints();
  const controller = createEnvironmentAdapterCheckpointController({ manifest: inventoryManifest(), checkpoints: store, hostExecute: async () => ({ invocationFingerprint: invocation.invocationFingerprint, status: "completed", observations: [], nativeEvidence: [evidence("ONE")], diagnostics: [], fixture: true }) });
  await controller.execute(invocation);
  const changed = { ...invocation, configurationDigest: D("changed") };
  await assert.rejects(() => controller.execute(changed), /fingerprint drifted/);
});

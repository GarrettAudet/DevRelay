import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  createEnvironmentInventoryCheckpointController,
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  detectEnvironmentInventoryDrift,
  EnvironmentPreparationInventoryError,
  resolveEnvironmentProfileSet,
  routeEnvironmentPreparationOperation,
} from "../src/environment-preparation-profile-inventory.mjs";

const D = (value) => canonicalJsonDigest(value);
const ref = (id, digest = D(id)) => ({
  artifactId: id,
  schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`,
  mediaType: "application/json",
  digest,
  uri: `memory://fixture/${id}`,
});
const repository = ref("REPOSITORY");
const sourceRefs = [{ role: "approved-work-item", artifact: ref("WI-EP-PROFILE-INVENTORY") }];
const check = (id, observationKind, capability, required = true, constraint = "present") => ({
  id,
  capability,
  required,
  observationKind,
  constraint,
  freshnessSeconds: 300,
});

function profileSet() {
  return resolveEnvironmentProfileSet({
    profileSetId: "EPS-EP-001",
    version: "1.0.0",
    repository,
    hostProfile: {
      id: "PROFILE-DEVRELAY-HOST",
      layer: "devrelay-host",
      name: "ChatGPT Desktop Windows host",
      checks: [
        check("CHECK-OS", "os", "windows", true, "win32"),
        check("CHECK-ARCH", "architecture", "x64", true, "x64"),
        check("CHECK-NODE", "runtime", "node", true, ">=20.0.0"),
        check("CHECK-TOKEN", "environment-variable", "DEVRELAY_TEST_TOKEN"),
      ],
    },
    projectProfiles: [{
      id: "PROFILE-DEVRELAY-PROJECT",
      layer: "project-target",
      name: "DevRelay Node.js project",
      checks: [
        check("CHECK-PACKAGE", "filesystem", "package.json"),
        check("CHECK-NPM", "package-manager", "npm", true, ">=10.0.0"),
        check("CHECK-ATTESTATION", "attestation", "desktop-host", false),
      ],
    }],
    sourceRefs,
  });
}

function fixtureHost(overrides = {}) {
  return createNativeWindowsEnvironmentHost({
    platform: "win32",
    architecture: "x64",
    environment: { DEVRELAY_TEST_TOKEN: "must-never-appear" },
    repositoryRoot: process.cwd(),
    pathExists: () => true,
    attestations: { "desktop-host": { version: "1.0.0", digest: D("desktop"), expiresAt: "2027-01-01T00:00:00.000Z" } },
    spawn: (command) => ({ status: 0, stdout: command === "node" ? "v22.11.0\n" : "10.9.0\n", stderr: "" }),
    maturity: "fixture-conformant",
    ...overrides,
  });
}

function inventory(overrides = {}) {
  const profiles = profileSet();
  return createNativeWindowsEnvironmentInventory({
    inventoryId: "EPI-EP-001",
    profileSet: profiles,
    repository,
    host: fixtureHost(),
    observedAt: "2026-08-21T12:00:00.000Z",
    sourceRefs,
    ...overrides,
  });
}

test("profile resolution is deterministic, two-layer, closed, and globally unambiguous", () => {
  const first = profileSet();
  const second = profileSet();
  assert.deepEqual(first, second);
  assert.deepEqual(first.profiles.map(({ layer }) => layer), ["devrelay-host", "project-target"]);
  assert.throws(() => resolveEnvironmentProfileSet({
    profileSetId: "BAD",
    version: "1.0.0",
    repository,
    hostProfile: { id: "HOST", layer: "devrelay-host", name: "host", checks: [check("DUP", "os", "windows")] },
    projectProfiles: [{ id: "PROJECT", layer: "project-target", name: "project", checks: [check("DUP", "tool", "node")] }],
    sourceRefs,
  }), EnvironmentPreparationInventoryError);
});

test("Core routes from exact state and rejects drift without a baseline", () => {
  assert.equal(routeEnvironmentPreparationOperation({}), "establish-environment");
  assert.equal(routeEnvironmentPreparationOperation({ environmentBaseline: {} }), "prepare-frontier");
  assert.equal(routeEnvironmentPreparationOperation({ environmentBaseline: {}, readinessReceipt: {} }), "revalidate-frontier");
  assert.equal(routeEnvironmentPreparationOperation({ environmentBaseline: {}, driftDetected: true }), "remediate-drift");
  assert.throws(() => routeEnvironmentPreparationOperation({ driftDetected: true }), /without an approved environment baseline/);
});

test("native Windows inventory covers every check and emits exact redacted evidence", () => {
  const result = inventory();
  assert.equal(result.inventory.observations.length, 7);
  assert.equal(result.rawEvidence.length, 7);
  assert.equal(result.inventory.diagnostics.length, 0);
  assert.equal(result.inventory.adapter.id, "native.windows-environment-inventory");
  const secret = result.inventory.observations.find(({ checkId }) => checkId === "CHECK-TOKEN");
  assert.deepEqual({ sensitivity: secret.sensitivity, present: secret.present, value: secret.value }, { sensitivity: "secret-presence", present: true, value: undefined });
  assert.equal(JSON.stringify(result).includes("must-never-appear"), false);
  assert.equal(result.inventory.fingerprint, inventory().inventory.fingerprint);
});

test("version mismatch, malformed output, expired attestation, and unsupported targets fail closed", () => {
  const profiles = profileSet();
  const badVersions = fixtureHost({ spawn: () => ({ status: 0, stdout: "not-a-version\n", stderr: "" }) });
  const malformed = createNativeWindowsEnvironmentInventory({ inventoryId: "BAD-VERSION", profileSet: profiles, repository, host: badVersions, observedAt: "2026-08-21T12:00:00.000Z", sourceRefs });
  assert.equal(malformed.inventory.observations.find(({ checkId }) => checkId === "CHECK-NODE").status, "unknown");
  assert.ok(malformed.inventory.diagnostics.some(({ checkId }) => checkId === "CHECK-NODE"));
  const expiredHost = fixtureHost({ attestations: { "desktop-host": { version: "1.0.0", digest: D("old"), expiresAt: "2026-01-01T00:00:00.000Z" } } });
  const expired = createNativeWindowsEnvironmentInventory({ inventoryId: "EXPIRED", profileSet: profiles, repository, host: expiredHost, observedAt: "2026-08-21T12:00:00.000Z", sourceRefs });
  assert.equal(expired.inventory.observations.find(({ checkId }) => checkId === "CHECK-ATTESTATION").status, "fail");
  assert.throws(() => createNativeWindowsEnvironmentHost({ platform: "linux" }), /cannot attest host platform/);
});

test("filesystem checks cannot escape the repository boundary", () => {
  const profiles = resolveEnvironmentProfileSet({
    profileSetId: "ESCAPE",
    version: "1.0.0",
    repository,
    hostProfile: { id: "HOST", layer: "devrelay-host", name: "host", checks: [check("OS", "os", "windows", true, "win32")] },
    projectProfiles: [{ id: "PROJECT", layer: "project-target", name: "project", checks: [check("ESCAPE-CHECK", "filesystem", "../secret.txt")] }],
    sourceRefs,
  });
  const result = createNativeWindowsEnvironmentInventory({ inventoryId: "ESCAPE", profileSet: profiles, repository, host: fixtureHost(), observedAt: "2026-08-21T12:00:00.000Z", sourceRefs });
  assert.equal(result.inventory.observations.find(({ checkId }) => checkId === "ESCAPE-CHECK").status, "unknown");
  assert.ok(result.inventory.diagnostics.some(({ checkId }) => checkId === "ESCAPE-CHECK"));
});

test("checkpoint replay performs zero additional inventory calls and rejects changed inputs", async () => {
  const values = new Map();
  let calls = 0;
  const controller = createEnvironmentInventoryCheckpointController({
    adapter: async (request) => { calls += 1; return inventory(request); },
    checkpoints: {
      async get(key) { return values.get(key); },
      async put(key, value) { if (values.has(key)) throw new Error("overwrite"); values.set(key, value); },
    },
  });
  const request = { inventoryId: "EPI-EP-001", profileSet: profileSet(), repository, host: fixtureHost(), observedAt: "2026-08-21T12:00:00.000Z", sourceRefs, adapterConfigurationDigest: D("fixture") };
  const first = await controller.execute(request);
  const replay = await controller.execute(request);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.adapterCalls, 0);
  assert.equal(calls, 1);
  await assert.rejects(() => controller.execute({ ...request, observedAt: "2026-08-21T12:00:01.000Z" }), /fingerprint differs/);
});

test("drift compares stable redacted inventory fingerprints", () => {
  const current = inventory().inventory;
  assert.equal(detectEnvironmentInventoryDrift({ baselineFingerprint: current.fingerprint, inventory: current }).driftDetected, false);
  assert.equal(detectEnvironmentInventoryDrift({ baselineFingerprint: D("prior"), inventory: current }).driftDetected, true);
});

test("real Windows host path performs an offline native observation", { skip: process.platform !== "win32" }, () => {
  const profiles = resolveEnvironmentProfileSet({
    profileSetId: "LIVE-WINDOWS",
    version: "1.0.0",
    repository,
    hostProfile: { id: "HOST", layer: "devrelay-host", name: "host", checks: [check("OS", "os", "windows", true, "win32"), check("ARCH", "architecture", process.arch, true, process.arch)] },
    projectProfiles: [{ id: "PROJECT", layer: "project-target", name: "project", checks: [check("PACKAGE", "filesystem", "package.json")] }],
    sourceRefs,
  });
  const result = createNativeWindowsEnvironmentInventory({ inventoryId: "LIVE-WINDOWS", profileSet: profiles, repository, host: createNativeWindowsEnvironmentHost({ repositoryRoot: process.cwd() }), observedAt: "2026-08-21T12:00:00.000Z", sourceRefs });
  assert.equal(result.inventory.adapter.maturity, "live-conformant");
  assert.ok(result.inventory.observations.every(({ status }) => status === "pass"));
});

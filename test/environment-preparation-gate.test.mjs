import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  approveEnvironmentVerificationCandidate,
  buildEnvironmentVerificationCandidate,
  createEnvironmentGateCheckpointController,
  createInMemoryEnvironmentReadinessStore,
  environmentPreparationArtifactRef,
  EnvironmentPreparationGateError,
  promoteEnvironmentGate,
} from "../src/environment-preparation-gate.mjs";
import {
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  resolveEnvironmentProfileSet,
} from "../src/environment-preparation-profile-inventory.mjs";

const D = (value) => canonicalJsonDigest(value);
const ref = (id, digest = D(id)) => ({ artifactId: id, schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`, mediaType: "application/json", digest, uri: `memory://fixture/${id}` });
const repository = ref("REPOSITORY");
const assignmentBaseline = ref("ASSIGNMENT");
const upstreamBaselines = [ref("ARCHITECTURE"), ref("CONTRACTS"), ref("REQUIREMENTS"), ref("WORK-BREAKDOWN"), ref("WORK-DEPENDENCY")];
const sourceRefs = [{ role: "approved-work-item", artifact: ref("WI-EP-GATE-READINESS") }];

function fixtures({ requiredPath = true, optionalPath = false, nodeVersion = "v22.0.0", freshnessSeconds = 300 } = {}) {
  const profileSet = resolveEnvironmentProfileSet({
    profileSetId: "EPS-GATE",
    version: "1.0.0",
    repository,
    hostProfile: {
      id: "HOST",
      layer: "devrelay-host",
      name: "Windows host",
      checks: [
        { id: "OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds },
        { id: "NODE", capability: "node", required: true, observationKind: "runtime", constraint: ">=20.0.0", freshnessSeconds },
      ],
    },
    projectProfiles: [{
      id: "PROJECT",
      layer: "project-target",
      name: "DevRelay",
      checks: [
        { id: "REQUIRED-PATH", capability: "required.json", required: true, observationKind: "filesystem", constraint: "present", freshnessSeconds },
        { id: "OPTIONAL-PATH", capability: "optional.json", required: false, observationKind: "filesystem", constraint: "present", freshnessSeconds },
      ],
    }],
    sourceRefs,
  });
  const host = createNativeWindowsEnvironmentHost({
    platform: "win32",
    architecture: "x64",
    repositoryRoot: process.cwd(),
    maturity: "fixture-conformant",
    pathExists: (path) => path.endsWith("required.json") ? requiredPath : optionalPath,
    spawn: () => ({ status: 0, stdout: `${nodeVersion}\n`, stderr: "" }),
  });
  const inventory = createNativeWindowsEnvironmentInventory({ inventoryId: `INV-${D({ requiredPath, optionalPath, nodeVersion, freshnessSeconds }).slice(7, 19)}`, profileSet, repository, host, observedAt: "2026-08-21T12:00:00.000Z", sourceRefs }).inventory;
  return { profileSet, inventory };
}

function request(options = {}) {
  const { profileSet, inventory } = fixtures(options.fixture);
  return {
    candidateId: options.candidateId ?? "EVC-EP-001",
    operation: options.operation ?? "prepare-frontier",
    repository,
    upstreamBaselines,
    profileSet,
    inventory,
    effectReceipts: [],
    frontierId: "FRONTIER-EP-001-004",
    workItemIds: ["WI-EP-GATE-READINESS", "WI-EP-OPTIONAL-ADAPTERS"],
    assignmentBaseline,
    executionAttemptId: "ATT-EP-FRONTIER-004",
    evaluatedAt: options.evaluatedAt ?? "2026-08-21T12:01:00.000Z",
    expectedEnvironmentFingerprint: options.expectedEnvironmentFingerprint,
    unableToProceed: options.unableToProceed,
    sourceRefs,
  };
}

test("required pass plus optional warning is ready", () => {
  const candidate = buildEnvironmentVerificationCandidate(request());
  assert.equal(candidate.proposedOutcome, "ready");
  assert.equal(candidate.checks.find(({ checkId }) => checkId === "OPTIONAL-PATH").status, "warning");
  assert.ok(candidate.checks.filter(({ required }) => required).every(({ status }) => status === "pass"));
});

test("required fail, unknown, expiry, baseline drift, and unavailable facts route to closed outcomes", () => {
  assert.equal(buildEnvironmentVerificationCandidate(request({ fixture: { requiredPath: false } })).proposedOutcome, "remediation-required");
  assert.equal(buildEnvironmentVerificationCandidate(request({ fixture: { nodeVersion: "not-semver" } })).proposedOutcome, "needs-clarification");
  assert.equal(buildEnvironmentVerificationCandidate(request({ fixture: { freshnessSeconds: 30 }, evaluatedAt: "2026-08-21T12:01:00.000Z" })).proposedOutcome, "needs-clarification");
  assert.equal(buildEnvironmentVerificationCandidate(request({ expectedEnvironmentFingerprint: D("old") })).proposedOutcome, "baseline-drift");
  assert.equal(buildEnvironmentVerificationCandidate(request({ unableToProceed: true })).proposedOutcome, "unable-to-proceed");
});

test("candidate binds exact repository, profiles, inventory, baselines, assignment, frontier, and attempt", () => {
  const first = buildEnvironmentVerificationCandidate(request());
  const changed = buildEnvironmentVerificationCandidate({ ...request({ candidateId: "EVC-CHANGED" }), executionAttemptId: "ATT-OTHER" });
  assert.notEqual(first.fingerprint, changed.fingerprint);
  assert.throws(() => buildEnvironmentVerificationCandidate({ ...request(), repository: ref("OTHER") }), /substitutes the exact profile set or repository/);
});

test("only Core emits a Gate approval matching the exact candidate outcome", () => {
  const candidate = buildEnvironmentVerificationCandidate(request());
  const approval = approveEnvironmentVerificationCandidate({ candidate, terminalCheckpointDigest: D("checkpoint"), policyVersion: "1.0.0" });
  assert.equal(approval.authority, "devrelay-core");
  assert.equal(approval.decision, "ready");
  assert.equal(approval.candidate.digest, candidate.contentDigest);
});

function promoted() {
  const input = request();
  const candidate = buildEnvironmentVerificationCandidate(input);
  const approval = approveEnvironmentVerificationCandidate({ candidate, terminalCheckpointDigest: D("checkpoint"), policyVersion: "1.0.0" });
  return { input, candidate, approval, result: promoteEnvironmentGate({
    proofId: "EP-PROMOTION-001",
    baselineId: "EP-BASELINE-001",
    baselineVersion: "1.0.0",
    candidate,
    approval,
    profileSet: input.profileSet,
    inventory: input.inventory,
    assignmentBaseline,
    workItemIds: input.workItemIds,
    issuedAt: "2026-08-21T12:01:00.000Z",
    expiresAt: "2026-08-21T12:06:00.000Z",
    policyVersion: "1.0.0",
    graphCheckpoint: ref("GRAPH"),
    sourceRefs,
  }) };
}

test("promotion returns one baseline, one single-use readiness receipt, and one checkpoint proof", () => {
  const { result } = promoted();
  assert.equal(result.baseline.kind, "EnvironmentBaseline");
  assert.ok(result.baseline.hostFingerprint.startsWith("sha256:"));
  assert.deepEqual(Object.keys(result.baseline.targetFingerprints), ["PROJECT"]);
  assert.equal(result.readiness.singleUse, true);
  assert.equal(result.readiness.consumed, false);
  assert.equal(result.proof.status, "promoted");
});

test("non-ready candidates cannot establish baselines or readiness", () => {
  const input = request({ fixture: { requiredPath: false } });
  const candidate = buildEnvironmentVerificationCandidate(input);
  const approval = approveEnvironmentVerificationCandidate({ candidate, terminalCheckpointDigest: D("checkpoint"), policyVersion: "1.0.0" });
  assert.throws(() => promoteEnvironmentGate({ proofId: "BAD", baselineId: "BAD", baselineVersion: "1.0.0", candidate, approval, profileSet: input.profileSet, inventory: input.inventory, assignmentBaseline, workItemIds: input.workItemIds, issuedAt: "2026-08-21T12:01:00.000Z", expiresAt: "2026-08-21T12:06:00.000Z", policyVersion: "1.0.0", graphCheckpoint: ref("GRAPH"), sourceRefs }), /only an exact ready/);
});

test("readiness consumption is exact, single-use, and rejects expiry or substitution", () => {
  const { result } = promoted();
  const store = createInMemoryEnvironmentReadinessStore();
  store.put(result.readiness);
  const exact = { receiptId: result.readiness.receiptId, repository, frontierId: result.readiness.frontierId, workItemIds: result.readiness.workItemIds, assignmentBaseline, executionAttemptId: result.readiness.executionAttemptId, fingerprint: result.readiness.fingerprint, consumedAt: "2026-08-21T12:02:00.000Z" };
  const proof = store.consume(exact);
  assert.equal(proof.receipt.digest, result.readiness.contentDigest);
  assert.throws(() => store.consume(exact), /already consumed/);

  const replacement = createInMemoryEnvironmentReadinessStore();
  replacement.put(result.readiness);
  assert.throws(() => replacement.consume({ ...exact, frontierId: "OTHER" }), /does not bind/);
  const expired = createInMemoryEnvironmentReadinessStore();
  expired.put(result.readiness);
  assert.throws(() => expired.consume({ ...exact, consumedAt: "2026-08-21T12:07:00.000Z" }), /expired/);
});

test("Gate checkpoint replay performs zero evaluations and changed inputs cannot reuse identity", async () => {
  const values = new Map();
  const controller = createEnvironmentGateCheckpointController({ checkpoints: { async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("overwrite"); values.set(key, value); } } });
  const exact = request();
  const first = await controller.execute(exact);
  const replay = await controller.execute(exact);
  assert.equal(first.evaluationCalls, 1);
  assert.equal(replay.evaluationCalls, 0);
  assert.equal(replay.replayed, true);
  assert.deepEqual(first.candidate, replay.candidate);
  await assert.rejects(() => controller.execute({ ...exact, executionAttemptId: "CHANGED" }), /checkpoint fingerprint differs/);
});

test("environment artifact references bind published contract identity", () => {
  const candidate = buildEnvironmentVerificationCandidate(request());
  const reference = environmentPreparationArtifactRef(candidate);
  assert.equal(reference.artifactId, candidate.candidateId);
  assert.equal(reference.digest, candidate.contentDigest);
  assert.throws(() => environmentPreparationArtifactRef({ kind: "Unknown" }), EnvironmentPreparationGateError);
});

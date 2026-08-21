import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  createEnvironmentPreparedDesktopCoordinator,
  EnvironmentPreparedDesktopError,
  renderEnvironmentRemediationPlan,
  summarizeEnvironmentReadiness,
} from "../src/environment-preparation-desktop.mjs";
import { createEnvironmentRemediationPlan } from "../src/environment-preparation-effects.mjs";
import {
  approveEnvironmentVerificationCandidate,
  buildEnvironmentVerificationCandidate,
  createInMemoryEnvironmentReadinessStore,
  environmentPreparationArtifactRef,
  promoteEnvironmentGate,
} from "../src/environment-preparation-gate.mjs";
import {
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  resolveEnvironmentProfileSet,
} from "../src/environment-preparation-profile-inventory.mjs";

const digest = (value) => canonicalJsonDigest(value);
const ref = (id) => ({
  artifactId: id,
  schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`,
  mediaType: "application/json",
  digest: digest(id),
  uri: `memory://fixture/${id}`,
});
const repository = ref("REPOSITORY");
const assignmentBaseline = ref("ASSIGNMENT");
const sourceRefs = [{ role: "approved-work-item", artifact: ref("WI-EP-DESKTOP-INTEGRATION") }];

function preparedArtifacts({ nodeVersion = "v24.0.0" } = {}) {
  const profileSet = resolveEnvironmentProfileSet({
    profileSetId: "EPS-DESKTOP",
    version: "1.0.0",
    repository,
    hostProfile: {
      id: "HOST",
      layer: "devrelay-host",
      name: "Windows Desktop host",
      checks: [{ id: "OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds: 300 }],
    },
    projectProfiles: [{
      id: "PROJECT",
      layer: "project-target",
      name: "DevRelay",
      checks: [{ id: "NODE", capability: "node", required: true, observationKind: "runtime", constraint: ">=22.0.0", freshnessSeconds: 300 }],
    }],
    sourceRefs,
  });
  const host = createNativeWindowsEnvironmentHost({
    platform: "win32",
    architecture: "x64",
    repositoryRoot: process.cwd(),
    maturity: "fixture-conformant",
    spawn: () => ({ status: 0, stdout: `${nodeVersion}\n`, stderr: "" }),
  });
  const inventory = createNativeWindowsEnvironmentInventory({
    inventoryId: "INV-DESKTOP",
    profileSet,
    repository,
    host,
    observedAt: "2026-08-21T12:00:00.000Z",
    sourceRefs,
  }).inventory;
  const request = {
    candidateId: "EVC-DESKTOP",
    operation: "prepare-frontier",
    repository,
    upstreamBaselines: [ref("REQUIREMENTS"), ref("ARCHITECTURE")],
    profileSet,
    inventory,
    effectReceipts: [],
    frontierId: "FRONTIER-005",
    workItemIds: ["WI-EP-DESKTOP-INTEGRATION", "WI-EP-TRACEABILITY"],
    assignmentBaseline,
    executionAttemptId: "ATT-005",
    evaluatedAt: "2026-08-21T12:01:00.000Z",
    sourceRefs,
  };
  const candidate = buildEnvironmentVerificationCandidate(request);
  const approval = approveEnvironmentVerificationCandidate({
    candidate,
    terminalCheckpointDigest: digest("checkpoint"),
    policyVersion: "1.0.0",
  });
  const promoted = candidate.proposedOutcome === "ready" ? promoteEnvironmentGate({
    proofId: "PROOF-DESKTOP",
    baselineId: "BASE-DESKTOP",
    baselineVersion: "1.0.0",
    candidate,
    approval,
    profileSet,
    inventory,
    assignmentBaseline,
    workItemIds: request.workItemIds,
    issuedAt: "2026-08-21T12:01:00.000Z",
    expiresAt: "2026-08-21T12:06:00.000Z",
    policyVersion: "1.0.0",
    graphCheckpoint: ref("GRAPH"),
    sourceRefs,
  }) : {};
  return { request, candidate, approval, ...promoted };
}

test("Desktop execution cannot begin until exact single-use environment readiness is consumed", async () => {
  const artifacts = preparedArtifacts();
  let preparedCalls = 0;
  let executionCalls = 0;
  const coordinator = createEnvironmentPreparedDesktopCoordinator({
    environmentRuntime: { async prepareFrontier() { return artifacts; } },
    readinessStore: createInMemoryEnvironmentReadinessStore(),
    executionCoordinator: {
      prepare(request) { preparedCalls += 1; return { runId: request.runId, phase: "prepared" }; },
      async execute() { executionCalls += 1; return { outcome: "recorded" }; },
    },
  });
  const preparation = await coordinator.prepareFrontier(artifacts.request);
  assert.equal(preparation.summary.outcome, "ready");
  assert.equal(preparedCalls, 0);
  const result = await coordinator.executePrepared({
    preparationId: preparation.preparationId,
    consumedAt: "2026-08-21T12:02:00.000Z",
    executionRequest: { runId: "RUN-005", attemptId: "ATT-005" },
  });
  assert.equal(result.outcome, "recorded");
  assert.equal(preparedCalls, 1);
  assert.equal(executionCalls, 1);
  await assert.rejects(
    () => coordinator.executePrepared({ preparationId: preparation.preparationId, consumedAt: "2026-08-21T12:03:00.000Z", executionRequest: { runId: "RUN-005", attemptId: "ATT-005" } }),
    EnvironmentPreparedDesktopError,
  );
});

test("Desktop binding rejects a substituted execution attempt before any execution side effect", async () => {
  const artifacts = preparedArtifacts();
  let calls = 0;
  const coordinator = createEnvironmentPreparedDesktopCoordinator({
    environmentRuntime: { async prepareFrontier() { return artifacts; } },
    readinessStore: createInMemoryEnvironmentReadinessStore(),
    executionCoordinator: { prepare() { calls += 1; }, async execute() { calls += 1; } },
  });
  const preparation = await coordinator.prepareFrontier(artifacts.request);
  await assert.rejects(
    () => coordinator.executePrepared({ preparationId: preparation.preparationId, consumedAt: "2026-08-21T12:02:00.000Z", executionRequest: { runId: "RUN", attemptId: "OTHER" } }),
    /differs from the ready environment/u,
  );
  assert.equal(calls, 0);
});

test("non-ready or substituted Gate material never enters the Desktop preparation store", async () => {
  const artifacts = preparedArtifacts();
  const coordinator = createEnvironmentPreparedDesktopCoordinator({
    environmentRuntime: { async prepareFrontier() { return { ...artifacts, approval: { ...artifacts.approval, decision: "baseline-drift" } }; } },
    readinessStore: createInMemoryEnvironmentReadinessStore(),
    executionCoordinator: { prepare() {}, async execute() {} },
  });
  await assert.rejects(() => coordinator.prepareFrontier(artifacts.request), /contentDigest|exact Core-approved ready candidate/u);
});

test("readiness summaries are compact, deterministic, and omit secret values", () => {
  const artifacts = preparedArtifacts();
  const first = summarizeEnvironmentReadiness(artifacts);
  const second = summarizeEnvironmentReadiness(artifacts);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("stdout"), false);
  assert.equal(first.checks.length, 2);
});

test("remediation rendering exposes effects, impact, grants, rollback, checks, and evidence before approval", () => {
  const artifacts = preparedArtifacts({ nodeVersion: "unavailable" });
  const plan = createEnvironmentRemediationPlan({
    planId: "PLAN-DESKTOP",
    profileSet: artifacts.request.profileSet,
    inventory: artifacts.request.inventory,
    effectCatalog: [{
      checkId: "NODE",
      effectId: "EFFECT-NODE",
      effect: {
        capability: "configure",
        scope: "project-local",
        description: "Pin the project Node runtime.",
        impact: "Writes one project-local version file.",
        grants: [{ kind: "filesystem.write", scope: "project/.node-version", purpose: "Pin Node" }],
        rollback: { supported: true, procedure: "Restore the previous file." },
        requiredEvidence: ["file-hash", "node-version"],
      },
    }],
    sourceRefs,
  });
  const rendered = renderEnvironmentRemediationPlan(plan);
  for (const expected of ["EFFECT-NODE", "project-local", "Impact:", "filesystem.write", "Rollback:", "file-hash"]) {
    assert.match(rendered, new RegExp(expected));
  }
});

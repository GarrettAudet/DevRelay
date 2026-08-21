import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  TRACEABILITY_VOCABULARY_V1_7,
  approveEnvironmentVerificationCandidate,
  buildEnvironmentVerificationCandidate,
  canonicalJson,
  canonicalJsonDigest,
  createEnvironmentEffectCoordinator,
  createEnvironmentGateCheckpointController,
  createEnvironmentPreparationTraceabilityContributor,
  createEnvironmentPreparedDesktopCoordinator,
  createEnvironmentRemediationApproval,
  createEnvironmentRemediationPlan,
  createInMemoryEnvironmentEffectCheckpointStore,
  createInMemoryEnvironmentReadinessStore,
  createInMemoryTraceabilityStore,
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  createTraceabilityGraphService,
  detectEnvironmentInventoryDrift,
  environmentPreparationArtifactRef,
  promoteEnvironmentGate,
  renderEnvironmentRemediationPlan,
  resolveEnvironmentProfileSet,
  routeEnvironmentPreparationOperation,
  sha256Digest,
} from "devrelay/advanced";

const API = "devrelay.dev/v1alpha1";
assert.equal(process.platform, "win32", "EP-001 release dogfood requires Windows");

const projectRoot = resolve("project-under-test");
const configurationPath = resolve(projectRoot, ".devrelay/environment-ready.json");
rmSync(projectRoot, { recursive: true, force: true });
mkdirSync(projectRoot, { recursive: true });

const D = (value) => canonicalJsonDigest(value);
const ref = (artifactId, digest = D(artifactId)) => ({
  artifactId,
  schema: `https://devrelay.dev/artifacts/${artifactId.toLowerCase()}/v1`,
  mediaType: "application/json",
  digest,
  uri: `memory://devrelay/ep001/windows-e2e/${artifactId}`,
});
const repository = ref("REPOSITORY-EP-E2E", D({ projectRoot: "project-under-test" }));
const assignmentBaseline = ref("ASSIGNMENT-EP-E2E");
const upstreamBaselines = [
  ref("REQUIREMENTS-EP-E2E"),
  ref("ARCHITECTURE-EP-E2E"),
  ref("CONTRACTS-EP-E2E"),
  ref("WORK-BREAKDOWN-EP-E2E"),
  ref("WORK-DEPENDENCY-EP-E2E"),
];
const sourceRefs = [{ role: "approved-work-item", artifact: ref("WI-EP-WINDOWS-E2E") }];
const projectGrant = {
  kind: "filesystem.write",
  scope: "project:.devrelay/environment-ready.json",
  purpose: "Create the approved project-local environment marker.",
};

const profileSet = resolveEnvironmentProfileSet({
  profileSetId: "EPS-EP-WINDOWS-E2E",
  version: "1.0.0",
  repository,
  hostProfile: {
    id: "HOST-WINDOWS-DESKTOP",
    layer: "devrelay-host",
    name: "ChatGPT/Codex Desktop Windows host",
    checks: [
      { id: "HOST-OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds: 900 },
      { id: "HOST-NODE", capability: "node", required: true, observationKind: "runtime", constraint: ">=22.0.0", freshnessSeconds: 900 },
    ],
  },
  projectProfiles: [{
    id: "PROJECT-DEVRELAY-E2E",
    layer: "project-target",
    name: "Installed-package consumer",
    checks: [{
      id: "PROJECT-READY-MARKER",
      capability: ".devrelay/environment-ready.json",
      required: true,
      observationKind: "filesystem",
      constraint: "present",
      freshnessSeconds: 900,
    }],
  }],
  sourceRefs,
});

const nativeHost = createNativeWindowsEnvironmentHost({ repositoryRoot: projectRoot });
const inventoryRuns = [];
function observe(inventoryId, observedAt) {
  const result = createNativeWindowsEnvironmentInventory({
    inventoryId,
    profileSet,
    repository,
    host: nativeHost,
    observedAt,
    sourceRefs,
  });
  inventoryRuns.push(result);
  return result;
}

const initial = observe("INV-EP-E2E-INITIAL", "2026-08-21T17:00:00.000Z");
const initialGap = buildEnvironmentVerificationCandidate({
  candidateId: "EVC-EP-E2E-GAP",
  operation: "establish-environment",
  repository,
  upstreamBaselines,
  profileSet,
  inventory: initial.inventory,
  effectReceipts: [],
  frontierId: "FRONTIER-EP-001-007",
  workItemIds: ["WI-EP-WINDOWS-E2E"],
  assignmentBaseline,
  executionAttemptId: "ATT-EP-E2E-001",
  evaluatedAt: "2026-08-21T17:00:30.000Z",
  sourceRefs,
});
assert.equal(initialGap.proposedOutcome, "remediation-required");

const effectCatalog = [{
  checkId: "PROJECT-READY-MARKER",
  effectId: "CREATE-EP-READY-MARKER",
  effect: {
    capability: "configure",
    scope: "project-local",
    description: "Create the project-local DevRelay environment marker.",
    impact: "Writes one declared file under .devrelay in the project.",
    grants: [projectGrant],
    rollback: { supported: true, procedure: "Remove the marker or restore its exact prior bytes." },
    requiredEvidence: ["environment-preparation/file-change", "environment-preparation/file-hash"],
  },
}];

let effectCalls = 0;
let recoverySequence = 0;
let latestRecovered;
const effectAdapter = {
  id: "native.project-local-environment-effect",
  version: "1.0.0",
  async apply(_effect, { currentFingerprint }) {
    effectCalls += 1;
    const before = existsSync(configurationPath) ? readFileSync(configurationPath) : undefined;
    const bytes = Buffer.from(`${canonicalJson({ prepared: true, profileSet: profileSet.contentDigest })}\n`, "utf8");
    mkdirSync(dirname(configurationPath), { recursive: true });
    writeFileSync(configurationPath, bytes);
    recoverySequence += 1;
    latestRecovered = observe(
      `INV-EP-E2E-RECOVERED-${recoverySequence}`,
      recoverySequence === 1 ? "2026-08-21T17:01:00.000Z" : "2026-08-21T17:04:00.000Z",
    );
    const fileDigest = sha256Digest(bytes);
    return {
      outcome: before?.equals(bytes) ? "no-change" : "applied",
      beforeFingerprint: currentFingerprint,
      afterFingerprint: latestRecovered.inventory.fingerprint,
      durationMs: 1,
      rollbackState: "available",
      evidence: [ref(`FILE-EP-E2E-${recoverySequence}`, fileDigest)],
      diagnostics: [],
    };
  },
  async rollback(_effect, raw) {
    rmSync(configurationPath, { force: true });
    return { outcome: "completed", afterFingerprint: raw.beforeFingerprint, evidence: [ref("ROLLBACK-EP-E2E")], diagnostics: [] };
  },
};
const effectCoordinator = createEnvironmentEffectCoordinator({
  adapter: effectAdapter,
  checkpoints: createInMemoryEnvironmentEffectCheckpointStore(),
});

async function remediate({ planId, approvalId, baseInventory }) {
  const plan = createEnvironmentRemediationPlan({
    planId,
    profileSet,
    inventory: baseInventory,
    effectCatalog,
    sourceRefs,
  });
  assert.equal(plan.effects.length, 1);
  const rendered = renderEnvironmentRemediationPlan(plan);
  for (const required of ["project-local", "filesystem.write", "Rollback:", "file-hash"]) assert.match(rendered, new RegExp(required, "u"));
  const approval = createEnvironmentRemediationApproval({ approvalId, plan });
  const request = {
    plan,
    effectId: plan.effects[0].id,
    approval,
    hostGrants: plan.effects[0].grants,
    currentFingerprint: plan.baseFingerprint,
  };
  const applied = await effectCoordinator.execute(request);
  const replay = await effectCoordinator.execute(request);
  assert.equal(applied.effectCalls, 1);
  assert.equal(replay.effectCalls, 0);
  assert.equal(replay.receipt.contentDigest, applied.receipt.contentDigest);
  assert.equal(latestRecovered.inventory.fingerprint, applied.receipt.afterFingerprint);
  return { plan, rendered, approval, applied, replay, inventory: latestRecovered };
}

const establishment = await remediate({
  planId: "PLAN-EP-E2E-ESTABLISH",
  approvalId: "APPROVAL-EP-E2E-ESTABLISH",
  baseInventory: initial.inventory,
});

function gateRequest({ candidateId, operation, inventory, effectReceipts, attemptId, evaluatedAt, expectedEnvironmentFingerprint }) {
  return {
    candidateId,
    operation,
    repository,
    upstreamBaselines,
    profileSet,
    inventory,
    effectReceipts: effectReceipts.map((value) => ({ value, ref: environmentPreparationArtifactRef(value) })),
    frontierId: "FRONTIER-EP-001-007",
    workItemIds: ["WI-EP-WINDOWS-E2E"],
    assignmentBaseline,
    executionAttemptId: attemptId,
    evaluatedAt,
    ...(expectedEnvironmentFingerprint ? { expectedEnvironmentFingerprint } : {}),
    sourceRefs,
  };
}

function promote({ request, candidate, approval, suffix, issuedAt, expiresAt }) {
  return promoteEnvironmentGate({
    proofId: `PROOF-EP-E2E-${suffix}`,
    baselineId: `BASELINE-EP-E2E-${suffix}`,
    baselineVersion: suffix === "INITIAL" ? "1.0.0" : "1.0.1",
    candidate,
    approval,
    profileSet,
    inventory: request.inventory,
    assignmentBaseline,
    workItemIds: request.workItemIds,
    issuedAt,
    expiresAt,
    policyVersion: "1.0.0",
    graphCheckpoint: ref(`GRAPH-EP-E2E-${suffix}`),
    sourceRefs,
  });
}

const initialRequest = gateRequest({
  candidateId: "EVC-EP-E2E-INITIAL-READY",
  operation: "establish-environment",
  inventory: establishment.inventory.inventory,
  effectReceipts: [establishment.applied.receipt],
  attemptId: "ATT-EP-E2E-001",
  evaluatedAt: "2026-08-21T17:02:00.000Z",
});
const initialCandidate = buildEnvironmentVerificationCandidate(initialRequest);
const initialApproval = approveEnvironmentVerificationCandidate({ candidate: initialCandidate, terminalCheckpointDigest: D("CHECKPOINT-INITIAL"), policyVersion: "1.0.0" });
const initialPromotion = promote({ request: initialRequest, candidate: initialCandidate, approval: initialApproval, suffix: "INITIAL", issuedAt: "2026-08-21T17:02:00.000Z", expiresAt: "2026-08-21T17:12:00.000Z" });

let activePreparation = { ...initialPromotion, candidate: initialCandidate, approval: initialApproval, readinessRef: environmentPreparationArtifactRef(initialPromotion.readiness) };
let preparedCalls = 0;
let executionCalls = 0;
const desktop = createEnvironmentPreparedDesktopCoordinator({
  environmentRuntime: { async prepareFrontier() { return activePreparation; } },
  readinessStore: createInMemoryEnvironmentReadinessStore(),
  executionCoordinator: {
    prepare(request) { preparedCalls += 1; return { runId: request.runId, phase: "prepared" }; },
    async execute(runId) { executionCalls += 1; return { outcome: "recorded", runId }; },
  },
});
const firstPreparation = await desktop.prepareFrontier(initialRequest);
const firstExecution = await desktop.executePrepared({
  preparationId: firstPreparation.preparationId,
  consumedAt: "2026-08-21T17:02:30.000Z",
  executionRequest: { runId: "RUN-EP-E2E-001", attemptId: "ATT-EP-E2E-001" },
});
assert.equal(firstExecution.outcome, "recorded");

rmSync(configurationPath, { force: true });
const drifted = observe("INV-EP-E2E-DRIFT", "2026-08-21T17:03:00.000Z");
const drift = detectEnvironmentInventoryDrift({
  baselineFingerprint: establishment.inventory.inventory.fingerprint,
  inventory: drifted.inventory,
});
assert.equal(drift.driftDetected, true);
assert.equal(routeEnvironmentPreparationOperation({ environmentBaseline: initialPromotion.baseline, driftDetected: true }), "remediate-drift");
const driftRequest = gateRequest({
  candidateId: "EVC-EP-E2E-DRIFT",
  operation: "remediate-drift",
  inventory: drifted.inventory,
  effectReceipts: [],
  attemptId: "ATT-EP-E2E-002",
  evaluatedAt: "2026-08-21T17:03:30.000Z",
  expectedEnvironmentFingerprint: establishment.inventory.inventory.fingerprint,
});
const driftCandidate = buildEnvironmentVerificationCandidate(driftRequest);
const driftApproval = approveEnvironmentVerificationCandidate({ candidate: driftCandidate, terminalCheckpointDigest: D("CHECKPOINT-DRIFT"), policyVersion: "1.0.0" });
assert.equal(driftCandidate.proposedOutcome, "baseline-drift");
activePreparation = { candidate: driftCandidate, approval: driftApproval };
await assert.rejects(() => desktop.prepareFrontier(driftRequest));
assert.equal(preparedCalls, 1);
assert.equal(executionCalls, 1);
const blockedBeforeExecution = preparedCalls === 1 && executionCalls === 1;

const recovery = await remediate({
  planId: "PLAN-EP-E2E-RECOVERY",
  approvalId: "APPROVAL-EP-E2E-RECOVERY",
  baseInventory: drifted.inventory,
});
assert.equal(recovery.inventory.inventory.fingerprint, establishment.inventory.inventory.fingerprint);
const resumeRequest = gateRequest({
  candidateId: "EVC-EP-E2E-RESUME-READY",
  operation: "revalidate-frontier",
  inventory: recovery.inventory.inventory,
  effectReceipts: [recovery.applied.receipt],
  attemptId: "ATT-EP-E2E-002",
  evaluatedAt: "2026-08-21T17:05:00.000Z",
});
const gateCheckpoints = new Map();
const gateController = createEnvironmentGateCheckpointController({ checkpoints: {
  async get(key) { return gateCheckpoints.get(key); },
  async put(key, value) { if (gateCheckpoints.has(key)) throw new Error("immutable gate checkpoint overwrite"); gateCheckpoints.set(key, value); },
} });
const gated = await gateController.execute(resumeRequest);
const gateReplay = await gateController.execute(resumeRequest);
assert.equal(gated.candidate.proposedOutcome, "ready");
assert.equal(gateReplay.evaluationCalls, 0);
const resumeApproval = approveEnvironmentVerificationCandidate({ candidate: gated.candidate, terminalCheckpointDigest: D("CHECKPOINT-RESUME"), policyVersion: "1.0.0" });
const resumePromotion = promote({ request: resumeRequest, candidate: gated.candidate, approval: resumeApproval, suffix: "RESUME", issuedAt: "2026-08-21T17:05:00.000Z", expiresAt: "2026-08-21T17:15:00.000Z" });
activePreparation = { ...resumePromotion, candidate: gated.candidate, approval: resumeApproval, readinessRef: environmentPreparationArtifactRef(resumePromotion.readiness) };
const resumedPreparation = await desktop.prepareFrontier(resumeRequest);
const resumedExecution = await desktop.executePrepared({
  preparationId: resumedPreparation.preparationId,
  consumedAt: "2026-08-21T17:06:00.000Z",
  executionRequest: { runId: "RUN-EP-E2E-002", attemptId: "ATT-EP-E2E-002" },
});
assert.equal(resumedExecution.outcome, "recorded");
assert.equal(preparedCalls, 2);
assert.equal(executionCalls, 2);

const rawLoaded = (value, artifactId = value.profileSetId ?? value.candidateId ?? value.approvalId ?? value.receiptId ?? value.id) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: { ...ref(artifactId), digest: sha256Digest(bytes) } };
};
function seedContributor(id, nodes, scope, authority = "candidate", edges = []) {
  return Object.freeze({
    metadata: { id, version: "1.0.0" },
    match: (context) => context.invocation.module.id === id,
    authority,
    scope,
    ownership: { authority, scope, nodeKinds: [...new Set(nodes.map(({ kind }) => kind))], edgeKinds: [...new Set(edges.map(({ kind }) => kind))] },
    async project(context) {
      const loaded = context.loadedOutputs.seed[0];
      const sourceLocators = [{ artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer: "", entityDigest: D(loaded.value) }];
      return { horizon: "implementation", nodes: nodes.map((node) => ({ ...node, sourceLocators })), edges: edges.map((edge) => ({ ...edge, sourceLocators })) };
    },
  });
}
const requirementsSeed = seedContributor("seed-ep-requirements", [
  { kind: "business-objective", stableId: "BO-EP-E2E-001", label: "Safe deterministic Windows execution", attributes: {} },
  { kind: "capability", stableId: "CAP-EP-E2E-001", label: "Prepare and verify the execution environment", attributes: {} },
  { kind: "user-story", stableId: "US-EP-E2E-001", label: "As a Desktop user, I can prepare the exact environment before execution", attributes: {} },
  { kind: "acceptance-criterion", stableId: "AC-EP-E2E-001", label: "Windows installed-package environment readiness", attributes: {} },
], "requirements/baseline", "approved", [
  { kind: "realized-by", source: { kind: "business-objective", stableId: "BO-EP-E2E-001", authority: "approved", scope: "requirements/baseline" }, target: { kind: "capability", stableId: "CAP-EP-E2E-001", authority: "approved", scope: "requirements/baseline" }, rationale: "The environment capability realizes the safe-execution objective." },
  { kind: "specified-by", source: { kind: "capability", stableId: "CAP-EP-E2E-001", authority: "approved", scope: "requirements/baseline" }, target: { kind: "user-story", stableId: "US-EP-E2E-001", authority: "approved", scope: "requirements/baseline" }, rationale: "The user story specifies the environment capability." },
  { kind: "accepted-by", source: { kind: "user-story", stableId: "US-EP-E2E-001", authority: "approved", scope: "requirements/baseline" }, target: { kind: "acceptance-criterion", stableId: "AC-EP-E2E-001", authority: "approved", scope: "requirements/baseline" }, rationale: "The criterion accepts the user story." },
]);
const architectureSeed = seedContributor("seed-ep-architecture", [{ kind: "architecture-element", stableId: "EL-EP-GATE", label: "EnvironmentVerification Gate", attributes: {} }], "architecture/baseline", "approved", [{
  kind: "designed-by",
  source: { kind: "user-story", stableId: "US-EP-E2E-001", authority: "approved", scope: "requirements/baseline" },
  target: { kind: "architecture-element", stableId: "EL-EP-GATE", authority: "approved", scope: "architecture/baseline" },
  rationale: "The Gate architecture realizes the approved environment user story.",
}]);
const workSeed = seedContributor("seed-ep-work", [{ kind: "work-item", stableId: "WI-EP-WINDOWS-E2E", label: "EP-001 Windows E2E", attributes: {} }], "work-breakdown/candidate", "candidate", [{
  kind: "planned-by",
  source: { kind: "acceptance-criterion", stableId: "AC-EP-E2E-001", authority: "approved", scope: "requirements/baseline" },
  target: { kind: "work-item", stableId: "WI-EP-WINDOWS-E2E", authority: "candidate", scope: "work-breakdown/candidate" },
  rationale: "The approved Windows installed-package acceptance criterion is planned by this work item.",
}]);
const attemptSeed = seedContributor("seed-ep-attempts", [
  { kind: "execution-attempt", stableId: "ATT-EP-E2E-001", label: "Initial execution", attributes: {} },
  { kind: "execution-attempt", stableId: "ATT-EP-E2E-002", label: "Resumed execution", attributes: {} },
], "work-execution/attempt");
const environmentContributor = createEnvironmentPreparationTraceabilityContributor();
const graph = createTraceabilityGraphService({
  graphId: "ep-001-windows-e2e",
  projectId: "devrelay",
  store: createInMemoryTraceabilityStore(),
  vocabulary: TRACEABILITY_VOCABULARY_V1_7,
  contributors: [requirementsSeed, architectureSeed, workSeed, attemptSeed, environmentContributor],
});
async function mergeSeed(id, nodes) {
  const seed = rawLoaded({ apiVersion: API, kind: "Seed", id, nodes }, `SEED-${id}`);
  const invocation = { invocationId: id, module: { id, version: "1.0.0", operation: "seed" } };
  const moduleResult = { invocationId: id, status: "completed", outcome: "seeded", outputs: { seed: [seed.ref] }, evidence: [] };
  const prepared = await graph.prepare({ baseGraph: graph.captureBase(), invocation, invocationFingerprint: D(invocation), moduleResult, loadedOutputs: { seed: [seed] } });
  await graph.mergePrepared(prepared);
}
await mergeSeed("seed-ep-requirements", ["BO-EP-E2E-001", "CAP-EP-E2E-001", "US-EP-E2E-001", "AC-EP-E2E-001"]);
await mergeSeed("seed-ep-architecture", ["EL-EP-GATE"]);
await mergeSeed("seed-ep-work", ["WI-EP-WINDOWS-E2E"]);
await mergeSeed("seed-ep-attempts", ["ATT-EP-E2E-001", "ATT-EP-E2E-002"]);
const loadedOutputs = {
  profileSet: [rawLoaded(profileSet)],
  candidate: [rawLoaded(gated.candidate)],
  approval: [rawLoaded(resumeApproval)],
  readiness: [rawLoaded(resumePromotion.readiness)],
};
const traceInvocation = { invocationId: "EP-E2E-TRACE", module: { id: "environment-preparation", version: "1.0.0", operation: "revalidate-frontier" } };
const traceResult = {
  invocationId: traceInvocation.invocationId,
  status: "completed",
  outcome: "ready",
  outputs: Object.fromEntries(Object.entries(loadedOutputs).map(([key, [entry]]) => [key, [entry.ref]])),
  evidence: [],
};
const tracePrepared = await graph.prepare({ baseGraph: graph.captureBase(), invocation: traceInvocation, invocationFingerprint: D(traceInvocation), moduleResult: traceResult, loadedOutputs });
const traceMerged = await graph.mergePrepared(tracePrepared);
assert.equal(traceMerged.receipt.disposition, "merged");
assert.equal(traceMerged.receipt.diagnostics.some(({ blocking }) => blocking), false, canonicalJson(traceMerged.receipt.diagnostics));

const receipt = {
  apiVersion: API,
  kind: "Ep001InstalledWindowsDesktopE2eReceipt",
  platform: process.platform,
  nodeVersion: process.version,
  host: { application: "ChatGPT Desktop", executor: "Codex", operatingSystem: "Windows" },
  packageImport: "devrelay/advanced",
  profileSet: environmentPreparationArtifactRef(profileSet),
  initialGap: { outcome: initialGap.proposedOutcome, fingerprint: initial.inventory.fingerprint },
  establishment: {
    plan: environmentPreparationArtifactRef(establishment.plan),
    approvalDigest: establishment.approval.approvalDigest,
    effect: environmentPreparationArtifactRef(establishment.applied.receipt),
    replayEffectCalls: establishment.replay.effectCalls,
    renderedPlanDigest: sha256Digest(Buffer.from(establishment.rendered, "utf8")),
  },
  firstExecution: {
    readiness: environmentPreparationArtifactRef(initialPromotion.readiness),
    environmentReadiness: firstExecution.environmentReadiness,
    outcome: firstExecution.outcome,
  },
  drift: {
    detected: drift.driftDetected,
    route: "remediate-drift",
    blockedOutcome: driftCandidate.proposedOutcome,
    blockedBeforeExecution,
    driftFingerprint: drifted.inventory.fingerprint,
  },
  recovery: {
    plan: environmentPreparationArtifactRef(recovery.plan),
    approvalDigest: recovery.approval.approvalDigest,
    effect: environmentPreparationArtifactRef(recovery.applied.receipt),
    rollback: recovery.plan.effects[0].rollback,
    replayEffectCalls: recovery.replay.effectCalls,
    restoredFingerprint: recovery.inventory.inventory.fingerprint,
    gateReplayEvaluationCalls: gateReplay.evaluationCalls,
  },
  resumedExecution: {
    readiness: environmentPreparationArtifactRef(resumePromotion.readiness),
    environmentReadiness: resumedExecution.environmentReadiness,
    outcome: resumedExecution.outcome,
  },
  evidence: {
    grants: recovery.plan.effects[0].grants,
    rawObservationReceipts: inventoryRuns.flatMap(({ rawEvidence }) => rawEvidence.map(({ ref: artifact, value }) => ({ artifact, command: value.result, commandFingerprint: value.commandFingerprint }))),
    inventoryFingerprints: inventoryRuns.map(({ inventory }) => ({ inventoryId: inventory.inventoryId, fingerprint: inventory.fingerprint })),
    effectCalls,
  },
  traceability: {
    graph: traceMerged.snapshot,
    mergeReceipt: traceMerged.receipt,
    update: tracePrepared.update,
  },
  outcome: "pass",
};
receipt.receiptDigest = canonicalJsonDigest(receipt);
process.stdout.write(`${canonicalJson(receipt)}\n`);

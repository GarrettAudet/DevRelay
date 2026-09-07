import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateDesktopOrchestrationArtifact } from "./desktop-orchestration-artifact-validator.mjs";
import { bindPreparedDesktopProjectMemoryBootstrap } from "./desktop-project-memory-bootstrap.mjs";

export class DesktopTaskAdapterError extends Error {
  constructor(message, code = "DR6110") {
    super(`desktop task adapter: ${message}`);
    this.name = "DesktopTaskAdapterError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DesktopTaskAdapterError(message, code); };
const OPERATIONS = Object.freeze(["create", "inspect", "wait", "message", "handoff"]);
const preparedTaskPlans = new WeakSet();

function validateQualityContinuity(plan) {
  const present = [plan.qualityResolution, plan.workFingerprint, plan.workContinuityDecision].filter((value) => value !== undefined).length;
  if (present !== 0 && present !== 3) fail("quality resolution, work fingerprint, and work continuity decision must be bound together", "DR6111");
  if (!plan.qualityResolution) return;
  const qualityDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(plan.qualityResolution).filter(([key]) => !["apiVersion", "kind", "resolutionDigest"].includes(key))));
  const fingerprintDigest = canonicalJsonDigest(plan.workFingerprint.material);
  const continuityDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(plan.workContinuityDecision).filter(([key]) => !["apiVersion", "kind", "decisionDigest"].includes(key))));
  if (plan.qualityResolution.kind !== "QualityObligationResolution" || plan.qualityResolution.resolutionDigest !== qualityDigest || plan.qualityResolutionDigest !== qualityDigest) fail("quality resolution digest drifted", "DR6111");
  if (plan.workFingerprint.kind !== "WorkFingerprint" || plan.workFingerprint.fingerprint !== fingerprintDigest || plan.workFingerprintDigest !== fingerprintDigest) fail("work fingerprint digest drifted", "DR6111");
  if (plan.workContinuityDecision.kind !== "WorkReuseDecision" || plan.workContinuityDecision.decisionDigest !== continuityDigest || plan.workContinuityDecisionDigest !== continuityDigest) fail("work continuity decision digest drifted", "DR6111");
  if (plan.qualityResolution.workItemId !== plan.workItemId || plan.workFingerprint.material?.projectId !== plan.projectId || plan.workFingerprint.material?.workItem?.id !== plan.workItemId || plan.workFingerprint.material?.qualityResolutionDigest !== plan.qualityResolutionDigest || plan.workFingerprint.material?.targetRevision !== plan.startingRevision || plan.workContinuityDecision.fingerprint !== plan.workFingerprintDigest || plan.workContinuityDecision.qualityResolutionDigest !== plan.qualityResolutionDigest || plan.workContinuityDecision.targetRevision !== plan.startingRevision) fail("quality or continuity context does not bind the exact task", "DR6111");
}

function assertPlan(plan) {
  if (!preparedTaskPlans.has(plan)) fail("DesktopTaskPlan must be prepared or revalidated against its exact bootstrap receipt", "DR6111");
  try { validateDesktopOrchestrationArtifact(plan); } catch (error) { fail(error.message, "DR6111"); }
  for (const key of ["runId", "workItemId", "attemptId", "projectId", "startingRevision", "promptDigest", "idempotencyKey"] ) {
    if (typeof plan[key] !== "string" || !plan[key]) fail(`plan ${key} is required`);
  }
  const digest = plan.planDigest;
  const body = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "planDigest"));
  if (digest !== canonicalJsonDigest(body)) fail("task plan digest drifted", "DR6111");
  validateQualityContinuity(plan);
  return plan;
}

function preparePlan(plan, memoryBootstrap) {
  const memoryContext = bindPreparedDesktopProjectMemoryBootstrap(memoryBootstrap, { projectId: plan.projectId, repositoryRevision: plan.startingRevision });
  if (canonicalJsonDigest(memoryContext) !== plan.memoryContextDigest || canonicalJsonDigest(plan.memoryContext) !== plan.memoryContextDigest) fail("task plan does not bind the exact prepared ProjectMemory bootstrap", "DR6111");
  const prepared = Object.freeze(structuredClone(validateDesktopOrchestrationArtifact(plan)));
  validateQualityContinuity(prepared);
  preparedTaskPlans.add(prepared);
  return prepared;
}

export function createDesktopTaskPlan({ runId, workItem, projectId, startingRevision, worktreeLease, assignment, executor, grants = [], promptArtifact, memoryBootstrap, qualityResolution, workFingerprint, workContinuityDecision } = {}) {
  if (!workItem || typeof workItem.id !== "string") fail("work item is required");
  if (!worktreeLease || worktreeLease.workItemId !== workItem.id) fail("exact worktree lease is required");
  if (!promptArtifact || typeof promptArtifact.digest !== "string") fail("prompt artifact is required");
  const memoryContext = bindPreparedDesktopProjectMemoryBootstrap(memoryBootstrap, { projectId, repositoryRevision: startingRevision });
  const attemptId = worktreeLease.attemptId;
  const memoryContextDigest = canonicalJsonDigest(memoryContext);
  const qualityResolutionDigest = qualityResolution?.resolutionDigest;
  const workFingerprintDigest = workFingerprint?.fingerprint;
  const workContinuityDecisionDigest = workContinuityDecision?.decisionDigest;
  const qualityContinuityCount = [qualityResolution, workFingerprint, workContinuityDecision].filter((value) => value !== undefined).length;
  if (qualityContinuityCount !== 0 && qualityContinuityCount !== 3) fail("quality resolution, work fingerprint, and work continuity decision must be bound together", "DR6111");
  if (qualityResolution && (qualityResolution.kind !== "QualityObligationResolution" || canonicalJsonDigest(Object.fromEntries(Object.entries(qualityResolution).filter(([key]) => !["apiVersion", "kind", "resolutionDigest"].includes(key)))) !== qualityResolutionDigest)) fail("quality resolution digest drifted", "DR6111");
  if (workFingerprint && (workFingerprint.kind !== "WorkFingerprint" || canonicalJsonDigest(workFingerprint.material) !== workFingerprintDigest || workFingerprint.material?.projectId !== projectId || workFingerprint.material?.workItem?.id !== workItem.id || workFingerprint.material?.qualityResolutionDigest !== qualityResolutionDigest || workFingerprint.material?.targetRevision !== startingRevision)) fail("work fingerprint digest drifted or context was substituted", "DR6111");
  if (workContinuityDecision && (workContinuityDecision.kind !== "WorkReuseDecision" || canonicalJsonDigest(Object.fromEntries(Object.entries(workContinuityDecision).filter(([key]) => !["apiVersion", "kind", "decisionDigest"].includes(key)))) !== workContinuityDecisionDigest || workContinuityDecision.fingerprint !== workFingerprintDigest || workContinuityDecision.qualityResolutionDigest !== qualityResolutionDigest || workContinuityDecision.targetRevision !== startingRevision || qualityResolution.workItemId !== workItem.id)) fail("work continuity decision digest drifted or context was substituted", "DR6111");
  const idempotencyMaterial = { runId, workItemId: workItem.id, attemptId, startingRevision, promptDigest: promptArtifact.digest, memoryContextDigest };
  if (qualityResolution) Object.assign(idempotencyMaterial, { qualityResolutionDigest, workFingerprintDigest, workContinuityDecisionDigest });
  const idempotencyKey = canonicalJsonDigest(idempotencyMaterial);
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopTaskPlan",
    runId,
    workItemId: workItem.id,
    attemptId,
    projectId,
    startingRevision,
    worktreeLease: structuredClone(worktreeLease),
    assignment: structuredClone(assignment),
    executor: structuredClone(executor),
    grants: structuredClone(grants).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    promptArtifact: structuredClone(promptArtifact),
    promptDigest: promptArtifact.digest,
    memoryContext: structuredClone(memoryContext),
    memoryContextDigest,
    ...(qualityResolution ? {
      qualityResolution: structuredClone(qualityResolution),
      qualityResolutionDigest,
      workFingerprint: structuredClone(workFingerprint),
      workFingerprintDigest,
      workContinuityDecision: structuredClone(workContinuityDecision),
      workContinuityDecisionDigest,
    } : {}),
    idempotencyKey,
  };
  const prepared = Object.freeze(validateDesktopOrchestrationArtifact({ ...body, planDigest: canonicalJsonDigest(body) }));
  preparedTaskPlans.add(prepared);
  return prepared;
}

export function revalidateDesktopTaskPlan({ plan, memoryBootstrap } = {}) {
  if (!plan || plan.kind !== "DesktopTaskPlan") fail("DesktopTaskPlan is required for revalidation", "DR6111");
  return preparePlan(plan, memoryBootstrap);
}

export function createDesktopTaskAdapter({ providerId, providerVersion, handlers = {} } = {}) {
  if (typeof providerId !== "string" || !providerId || typeof providerVersion !== "string" || !providerVersion) fail("provider identity is required");
  for (const operation of OPERATIONS) if (typeof handlers[operation] !== "function") fail(`handler ${operation} is required`);
  const invoke = async (operation, { plan, taskId, input = {} } = {}) => {
    if (!OPERATIONS.includes(operation)) fail(`unsupported operation ${operation}`);
    assertPlan(plan);
    if (operation !== "create" && (typeof taskId !== "string" || !taskId)) fail("bound taskId is required");
    const request = Object.freeze({ operation, planDigest: plan.planDigest, taskId: taskId ?? null, input: structuredClone(input) });
    const observed = await handlers[operation](request, plan);
    if (!observed || typeof observed !== "object") fail("provider returned no receipt", "DR6112");
    const observedTaskId = observed.taskId ?? taskId;
    if (typeof observedTaskId !== "string" || !observedTaskId) fail("provider receipt lacks task identity", "DR6112");
    if (taskId && observedTaskId !== taskId) fail("provider substituted task identity", "DR6112");
    const body = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "DesktopTaskReceipt",
      provider: { id: providerId, version: providerVersion },
      operation,
      runId: plan.runId,
      workItemId: plan.workItemId,
      attemptId: plan.attemptId,
      planDigest: plan.planDigest,
      idempotencyKey: plan.idempotencyKey,
      taskId: observedTaskId,
      status: observed.status ?? "unknown",
      observation: structuredClone(observed.observation ?? {}),
      authority: "observation-only",
    };
    return Object.freeze({ ...body, receiptDigest: canonicalJsonDigest(body) });
  };
  return Object.freeze({
    id: providerId,
    version: providerVersion,
    authority: Object.freeze({ gates: false, readiness: false, graph: false, verification: false, integration: false }),
    invoke,
  });
}

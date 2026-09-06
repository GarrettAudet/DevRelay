import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateDesktopOrchestrationArtifact } from "./desktop-orchestration-artifact-validator.mjs";

export class DesktopTaskAdapterError extends Error {
  constructor(message, code = "DR6110") {
    super(`desktop task adapter: ${message}`);
    this.name = "DesktopTaskAdapterError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DesktopTaskAdapterError(message, code); };
const OPERATIONS = Object.freeze(["create", "inspect", "wait", "message", "handoff"]);

function assertPlan(plan) {
  if (!plan || plan.kind !== "DesktopTaskPlan") fail("validated DesktopTaskPlan is required");
  try { validateDesktopOrchestrationArtifact(plan); } catch (error) { fail(error.message, "DR6111"); }
  for (const key of ["runId", "workItemId", "attemptId", "projectId", "startingRevision", "promptDigest", "idempotencyKey"] ) {
    if (typeof plan[key] !== "string" || !plan[key]) fail(`plan ${key} is required`);
  }
  const digest = plan.planDigest;
  const body = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "planDigest"));
  if (digest !== canonicalJsonDigest(body)) fail("task plan digest drifted", "DR6111");
  return plan;
}

export function createDesktopTaskPlan({ runId, workItem, projectId, startingRevision, worktreeLease, assignment, executor, grants = [], promptArtifact, memoryContext } = {}) {
  if (!workItem || typeof workItem.id !== "string") fail("work item is required");
  if (!worktreeLease || worktreeLease.workItemId !== workItem.id) fail("exact worktree lease is required");
  if (!promptArtifact || typeof promptArtifact.digest !== "string") fail("prompt artifact is required");
  if (!memoryContext?.bootstrapReceipt || !memoryContext?.projectMemoryBaseline || !memoryContext?.synopsisProjection || !memoryContext?.graphCheckpoint) fail("exact ProjectMemory context is required");
  const attemptId = worktreeLease.attemptId;
  const memoryContextDigest = canonicalJsonDigest(memoryContext);
  const idempotencyKey = canonicalJsonDigest({ runId, workItemId: workItem.id, attemptId, startingRevision, promptDigest: promptArtifact.digest, memoryContextDigest });
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
    idempotencyKey,
  };
  return Object.freeze(validateDesktopOrchestrationArtifact({ ...body, planDigest: canonicalJsonDigest(body) }));
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

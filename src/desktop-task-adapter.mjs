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

function assertPlan(plan) {
  if (!preparedTaskPlans.has(plan)) fail("DesktopTaskPlan must be prepared or revalidated against its exact bootstrap receipt", "DR6111");
  try { validateDesktopOrchestrationArtifact(plan); } catch (error) { fail(error.message, "DR6111"); }
  for (const key of ["runId", "workItemId", "attemptId", "projectId", "startingRevision", "promptDigest", "idempotencyKey"] ) {
    if (typeof plan[key] !== "string" || !plan[key]) fail(`plan ${key} is required`);
  }
  const digest = plan.planDigest;
  const body = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "planDigest"));
  if (digest !== canonicalJsonDigest(body)) fail("task plan digest drifted", "DR6111");
  return plan;
}

function preparePlan(plan, memoryBootstrap) {
  const memoryContext = bindPreparedDesktopProjectMemoryBootstrap(memoryBootstrap, { projectId: plan.projectId, repositoryRevision: plan.startingRevision });
  if (canonicalJsonDigest(memoryContext) !== plan.memoryContextDigest || canonicalJsonDigest(plan.memoryContext) !== plan.memoryContextDigest) fail("task plan does not bind the exact prepared ProjectMemory bootstrap", "DR6111");
  const prepared = Object.freeze(structuredClone(validateDesktopOrchestrationArtifact(plan)));
  preparedTaskPlans.add(prepared);
  return prepared;
}

export function createDesktopTaskPlan({ runId, workItem, projectId, startingRevision, worktreeLease, assignment, executor, grants = [], promptArtifact, memoryBootstrap } = {}) {
  if (!workItem || typeof workItem.id !== "string") fail("work item is required");
  if (!worktreeLease || worktreeLease.workItemId !== workItem.id) fail("exact worktree lease is required");
  if (!promptArtifact || typeof promptArtifact.digest !== "string") fail("prompt artifact is required");
  const memoryContext = bindPreparedDesktopProjectMemoryBootstrap(memoryBootstrap, { projectId, repositoryRevision: startingRevision });
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

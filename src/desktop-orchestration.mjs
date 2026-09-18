import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { verifyCrossCuttingCompositionPlan } from "./cross-cutting-composition.mjs";
import { revalidateDesktopTaskPlan } from "./desktop-task-adapter.mjs";
import { validateDesktopOrchestrationArtifact } from "./desktop-orchestration-artifact-validator.mjs";

export class DesktopOrchestrationError extends Error {
  constructor(message, code = "DR6120") {
    super(`desktop orchestration: ${message}`);
    this.name = "DesktopOrchestrationError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DesktopOrchestrationError(message, code); };
const TERMINAL = new Set(["integrated", "concluded", "failed", "blocked", "quarantined", "abandoned"]);
const ACTIVE = new Set(["prepared", "dispatched", "running", "completed", "verified", "reviewed"]);
const TRANSITIONS = Object.freeze({
  pending: new Set(["prepared", "abandoned"]),
  prepared: new Set(["dispatched", "quarantined", "abandoned"]),
  dispatched: new Set(["running", "completed", "quarantined", "failed"]),
  running: new Set(["completed", "quarantined", "failed"]),
  completed: new Set(["verified", "quarantined", "failed"]),
  verified: new Set(["reviewed", "blocked", "quarantined"]),
  reviewed: new Set(["integrated", "blocked", "quarantined"]),
  integrated: new Set(["concluded"]),
});

function sortIds(values) { return [...new Set(values)].sort(); }
function validateWorkItems(workItems) {
  if (!Array.isArray(workItems) || workItems.length === 0) fail("workItems are required");
  const byId = new Map();
  for (const item of workItems) {
    if (!item || typeof item.id !== "string" || !item.id || !Array.isArray(item.dependencies)) fail("work item is malformed");
    if (byId.has(item.id)) fail(`duplicate work item ${item.id}`);
    byId.set(item.id, { ...structuredClone(item), dependencies: sortIds(item.dependencies) });
  }
  for (const item of byId.values()) for (const dependency of item.dependencies) if (!byId.has(dependency)) fail(`unknown dependency ${dependency}`);
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) fail("work dependency graph contains a cycle", "DR6121");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  return byId;
}

function assertOrchestrationPlan(plan) {
  if (plan?.kind !== "DesktopOrchestrationPlan") fail("orchestration plan is required");
  const { planDigest, ...body } = plan;
  if (planDigest !== canonicalJsonDigest(body)) fail("orchestration plan digest drifted", "DR6125");
  if ((plan.crossCuttingPlan === undefined) !== (plan.crossCuttingPlanDigest === undefined)) fail("cross-cutting plan binding is incomplete", "DR6125");
  if (plan.crossCuttingPlan) {
    verifyCrossCuttingCompositionPlan(plan.crossCuttingPlan);
    if (plan.crossCuttingPlan.planDigest !== plan.crossCuttingPlanDigest) fail("cross-cutting plan binding drifted", "DR6125");
  }
  return plan;
}

export function createDesktopOrchestrationPlan({ runId, projectId, horizonDigest, startingRevision, maxConcurrency = 3, workItems, crossCuttingPlan } = {}) {
  for (const [label, value] of Object.entries({ runId, projectId, horizonDigest, startingRevision })) if (typeof value !== "string" || !value) fail(`${label} is required`);
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8) fail("maxConcurrency must be between 1 and 8");
  const byId = validateWorkItems(workItems);
  if (crossCuttingPlan !== undefined) verifyCrossCuttingCompositionPlan(crossCuttingPlan);
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopOrchestrationPlan",
    runId,
    projectId,
    horizonDigest,
    startingRevision,
    maxConcurrency,
    workItems: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    readinessAuthority: "core-derived",
    ...(crossCuttingPlan ? { crossCuttingPlan: structuredClone(crossCuttingPlan), crossCuttingPlanDigest: crossCuttingPlan.planDigest } : {}),
  };
  return Object.freeze({ ...body, planDigest: canonicalJsonDigest(body) });
}

export function deriveDesktopReadyFrontier({ plan, workState = {} } = {}) {
  assertOrchestrationPlan(plan);
  const activeCount = Object.values(workState).filter((state) => ACTIVE.has(state.status)).length;
  const slots = Math.max(0, plan.maxConcurrency - activeCount);
  const ready = plan.workItems
    .filter((item) => (workState[item.id]?.status ?? "pending") === "pending")
    .filter((item) => item.dependencies.every((dependency) => ["integrated", "concluded"].includes(workState[dependency]?.status)))
    .map((item) => item.id)
    .sort()
    .slice(0, slots);
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopReadyFrontier",
    runId: plan.runId,
    planDigest: plan.planDigest,
    activeCount,
    availableSlots: slots,
    workItemIds: ready,
  };
  return Object.freeze({ ...body, frontierDigest: canonicalJsonDigest(body) });
}

export function createDesktopOrchestrationRuntime({ storage, owner = "desktop-orchestrator" } = {}) {
  if (!storage || typeof storage.initializeRun !== "function") fail("durable storage is required");
  const idFor = (runId) => `desktop-orchestration:${runId}`;
  const transition = (runId, operation, update, additionalRefs = []) => {
    const storageRunId = idFor(runId);
    const current = storage.readRun(storageRunId);
    const nextState = update(structuredClone(current.state));
    if (canonicalJsonDigest(nextState) === canonicalJsonDigest(current.state) && additionalRefs.length === 0) return current;
    const lease = storage.acquireLease({ runId: storageRunId, owner, expectedVersion: current.version });
    try {
      return storage.commitTransition({
        runId: storageRunId,
        expectedVersion: current.version,
        leaseToken: lease.token,
        transition: { operation, transitionDigest: canonicalJsonDigest({ operation, from: current.state, to: nextState }) },
        nextState,
        artifactRefs: [...current.artifactRefs, ...additionalRefs],
      });
    } finally {
      try { storage.releaseLease({ runId: storageRunId, leaseToken: lease.token }); } catch {}
    }
  };
  return Object.freeze({
    initialize(plan) {
      assertOrchestrationPlan(plan);
      const planRef = storage.putArtifact({ artifactId: `DESKTOP-PLAN-${plan.runId}`, bytes: Buffer.from(`${JSON.stringify(plan)}\n`), mediaType: "application/vnd.devrelay.desktop-orchestration-plan+json" });
      const workState = Object.fromEntries(plan.workItems.map(({ id }) => [id, { status: "pending", receipts: [] }]));
      return storage.initializeRun({ runId: idFor(plan.runId), state: { plan, workState, blockers: [], recovery: "clean" }, artifactRefs: [planRef] });
    },
    inspect(runId) { return storage.readRun(idFor(runId)); },
    frontier(runId) { const run = storage.readRun(idFor(runId)); return deriveDesktopReadyFrontier({ plan: run.state.plan, workState: run.state.workState }); },
    prepareTask({ plan, memoryBootstrap } = {}) {
      const prepared = revalidateDesktopTaskPlan({ plan, memoryBootstrap });
      const current = storage.readRun(idFor(prepared.runId));
      const parent = current.state.plan;
      if (prepared.projectId !== parent.projectId || prepared.startingRevision !== parent.startingRevision) fail("task differs from orchestration context", "DR6125");
      const work = current.state.workState[prepared.workItemId];
      if (!work) fail("task work item is absent", "DR6125");
      if (work.taskPlanRef) {
        const bytes = storage.getArtifact(work.taskPlanRef);
        if (bytes.toString("utf8") !== canonicalJson(prepared)) fail("work item already binds another task plan", "DR6125");
        return current;
      }
      const ref = storage.putArtifact({ artifactId: `DESKTOP-TASK-PLAN-${prepared.attemptId}`,
        mediaType: "application/vnd.devrelay.desktop-task-plan+json", bytes: Buffer.from(canonicalJson(prepared)) });
      return transition(prepared.runId, "prepare-task-plan", state => {
        const item = state.workState[prepared.workItemId];
        if (item.taskPlanRef || item.status !== "pending" ||
            !deriveDesktopReadyFrontier({ plan: state.plan, workState: state.workState }).workItemIds.includes(prepared.workItemId)) {
          fail("task preparation is outside the exact pending frontier", "DR6123");
        }
        item.taskPlanRef = ref;
        item.status = "prepared";
        return state;
      }, [ref]);
    },
    loadTaskPlan(runId, { workItemId, memoryBootstrap } = {}) {
      const current = storage.readRun(idFor(runId));
      const ref = current.state.workState[workItemId]?.taskPlanRef;
      if (!ref) fail("saved task plan is absent", "DR6125");
      const bytes = storage.getArtifact(ref);
      const plan = revalidateDesktopTaskPlan({ plan: JSON.parse(bytes), memoryBootstrap });
      if (canonicalJson(plan) !== bytes.toString("utf8") || plan.runId !== runId || plan.workItemId !== workItemId ||
          plan.projectId !== current.state.plan.projectId || plan.startingRevision !== current.state.plan.startingRevision) fail("saved task plan context differs", "DR6125");
      return plan;
    },
    reserveTaskDispatch({ plan, memoryBootstrap, provider } = {}) {
      const prepared = revalidateDesktopTaskPlan({ plan, memoryBootstrap });
      if (!provider || Object.keys(provider).some(key => !["id", "version"].includes(key)) ||
          typeof provider.id !== "string" || !provider.id || typeof provider.version !== "string" || !provider.version ||
          provider.id !== prepared.executor.id || (prepared.executor.version !== undefined && provider.version !== prepared.executor.version)) fail("dispatch provider differs from task executor", "DR6125");
      const saved = this.loadTaskPlan(prepared.runId, { workItemId: prepared.workItemId, memoryBootstrap });
      if (canonicalJsonDigest(saved) !== canonicalJsonDigest(prepared)) fail("dispatch requires the exact saved plan", "DR6125");
      return transition(prepared.runId, "reserve-task-dispatch", state => {
        const item = state.workState[prepared.workItemId];
        if (item.status !== "prepared" || item.dispatchReservation) fail("dispatch is already reserved or advanced; reconcile without repeating creation", "DR6126");
        item.dispatchReservation = { planDigest: prepared.planDigest, provider: structuredClone(provider), status: "reserved" };
        return state;
      });
    },
    recordTaskDispatch({ plan, memoryBootstrap, receipt } = {}) {
      const prepared = this.loadTaskPlan(plan.runId, { workItemId: plan.workItemId, memoryBootstrap });
      if (canonicalJsonDigest(prepared) !== canonicalJsonDigest(plan)) fail("dispatch result plan differs", "DR6125");
      validateDesktopOrchestrationArtifact(receipt);
      const current = storage.readRun(idFor(plan.runId));
      const item = current.state.workState[plan.workItemId];
      if (!item.dispatchReservation || receipt.kind !== "DesktopTaskReceipt" || receipt.operation !== "create" ||
          receipt.planDigest !== plan.planDigest || receipt.idempotencyKey !== plan.idempotencyKey ||
          receipt.runId !== plan.runId || receipt.workItemId !== plan.workItemId || receipt.attemptId !== plan.attemptId ||
          canonicalJsonDigest(receipt.provider) !== canonicalJsonDigest(item.dispatchReservation.provider)) fail("dispatch receipt differs from reservation", "DR6125");
      if (item.dispatchReservation.receipt) {
        if (canonicalJsonDigest(item.dispatchReservation.receipt) !== canonicalJsonDigest(receipt)) fail("dispatch receipt already bound", "DR6125");
        return current;
      }
      return transition(plan.runId, "record-task-dispatch", state => {
        const work = state.workState[plan.workItemId];
        if (work.status !== "prepared" || work.dispatchReservation?.status !== "reserved") fail("dispatch reservation advanced", "DR6126");
        work.dispatchReservation = { ...work.dispatchReservation, status: "recorded", receipt: structuredClone(receipt) };
        work.status = "dispatched";
        work.receipts.push(structuredClone(receipt));
        return state;
      });
    },
    record(runId, { workItemId, status, receipt } = {}) {
      return transition(runId, `record-${status}`, (state) => {
        const current = state.workState[workItemId];
        if (!current) fail(`unknown work item ${workItemId}`);
        if (current.taskPlanRef && status === "dispatched") fail("saved tasks require reserved dispatch receipt recording", "DR6124");
        if (current.taskPlanRef && ["running", "completed"].includes(status)) {
          validateDesktopOrchestrationArtifact(receipt);
          const dispatched = current.dispatchReservation?.receipt;
          if (!dispatched || receipt.kind !== "DesktopTaskReceipt" || !["inspect", "wait"].includes(receipt.operation) ||
              receipt.status !== status || receipt.taskId !== dispatched.taskId || receipt.planDigest !== dispatched.planDigest ||
              receipt.idempotencyKey !== dispatched.idempotencyKey || receipt.attemptId !== dispatched.attemptId ||
              receipt.runId !== runId || receipt.workItemId !== workItemId ||
              canonicalJsonDigest(receipt.provider) !== canonicalJsonDigest(dispatched.provider)) {
            fail("task progress requires the exact bound provider observation", "DR6124");
          }
        }
        if (current.status === status && receipt && current.receipts.some((value) => canonicalJsonDigest(value) === canonicalJsonDigest(receipt))) return state;
        if (TERMINAL.has(current.status) && current.status !== "integrated") fail("terminal work state cannot be rewritten", "DR6122");
        if (!TRANSITIONS[current.status]?.has(status)) fail(`invalid work transition ${current.status} -> ${status}`, "DR6122");
        if (status === "prepared") {
          const frontier = deriveDesktopReadyFrontier({ plan: state.plan, workState: state.workState });
          if (!frontier.workItemIds.includes(workItemId)) fail("work item is outside the exact ready frontier", "DR6123");
        }
        if (status !== "prepared" && status !== "abandoned" && (!receipt || typeof receipt !== "object")) fail(`${status} requires an exact receipt`, "DR6124");
        current.status = status;
        if (receipt) current.receipts.push(structuredClone(receipt));
        current.receipts.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return state;
      });
    },
    quarantine(runId, { workItemId, reason } = {}) {
      return transition(runId, "quarantine", (state) => {
        if (!state.workState[workItemId]) fail(`unknown work item ${workItemId}`);
        state.workState[workItemId].status = "quarantined";
        state.blockers = sortIds([...state.blockers, `${workItemId}:${reason}`]);
        state.recovery = "operator-action-required";
        return state;
      });
    },
    recover(runId) {
      const run = storage.readRun(idFor(runId));
      const uncertain = Object.entries(run.state.workState).filter(([, value]) => ["prepared", "dispatched", "running"].includes(value.status)).map(([id]) => id).sort();
      return Object.freeze({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "DesktopOrchestrationRecovery",
        runId,
        outcome: uncertain.length ? "reconciliation-required" : "recovered",
        uncertainWorkItemIds: uncertain,
        duplicateEffectsAllowed: false,
        stateVersion: run.version,
        recoveryDigest: canonicalJsonDigest({ runId, uncertain, version: run.version }),
      });
    },
  });
}

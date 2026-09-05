import { canonicalJsonDigest } from "./content-digest.mjs";

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

export function createDesktopOrchestrationPlan({ runId, projectId, horizonDigest, startingRevision, maxConcurrency = 3, workItems } = {}) {
  for (const [label, value] of Object.entries({ runId, projectId, horizonDigest, startingRevision })) if (typeof value !== "string" || !value) fail(`${label} is required`);
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8) fail("maxConcurrency must be between 1 and 8");
  const byId = validateWorkItems(workItems);
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
  };
  return Object.freeze({ ...body, planDigest: canonicalJsonDigest(body) });
}

export function deriveDesktopReadyFrontier({ plan, workState = {} } = {}) {
  if (plan?.kind !== "DesktopOrchestrationPlan") fail("orchestration plan is required");
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
  const transition = (runId, operation, update) => {
    const storageRunId = idFor(runId);
    const current = storage.readRun(storageRunId);
    const lease = storage.acquireLease({ runId: storageRunId, owner, expectedVersion: current.version });
    try {
      const nextState = update(structuredClone(current.state));
      return storage.commitTransition({
        runId: storageRunId,
        expectedVersion: current.version,
        leaseToken: lease.token,
        transition: { operation, transitionDigest: canonicalJsonDigest({ operation, from: current.state, to: nextState }) },
        nextState,
        artifactRefs: current.artifactRefs,
      });
    } finally {
      try { storage.releaseLease({ runId: storageRunId, leaseToken: lease.token }); } catch {}
    }
  };
  return Object.freeze({
    initialize(plan) {
      if (plan?.kind !== "DesktopOrchestrationPlan") fail("validated plan is required");
      const planRef = storage.putArtifact({ artifactId: `DESKTOP-PLAN-${plan.runId}`, bytes: Buffer.from(`${JSON.stringify(plan)}\n`), mediaType: "application/vnd.devrelay.desktop-orchestration-plan+json" });
      const workState = Object.fromEntries(plan.workItems.map(({ id }) => [id, { status: "pending", receipts: [] }]));
      return storage.initializeRun({ runId: idFor(plan.runId), state: { plan, workState, blockers: [], recovery: "clean" }, artifactRefs: [planRef] });
    },
    inspect(runId) { return storage.readRun(idFor(runId)); },
    frontier(runId) { const run = storage.readRun(idFor(runId)); return deriveDesktopReadyFrontier({ plan: run.state.plan, workState: run.state.workState }); },
    record(runId, { workItemId, status, receipt } = {}) {
      return transition(runId, `record-${status}`, (state) => {
        const current = state.workState[workItemId];
        if (!current) fail(`unknown work item ${workItemId}`);
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

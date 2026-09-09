import { canonicalJsonDigest } from "./content-digest.mjs";
import { deriveDesktopReadyFrontier } from "./desktop-orchestration.mjs";

export class HumanOrchestrationError extends Error {
  constructor(message, code = "DR7400") {
    super(`human orchestration: ${message}`);
    this.name = "HumanOrchestrationError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new HumanOrchestrationError(message, code); };
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TERMINAL = new Set(["integrated", "concluded", "failed", "blocked", "quarantined", "abandoned"]);
const COMPLETE = new Set(["integrated", "concluded"]);
const ACTIVE = new Set(["prepared", "dispatched", "running", "completed", "verified", "reviewed"]);
const ACTION_ROUTES = Object.freeze({
  message: "desktop-task-adapter",
  pause: "desktop-orchestrator",
  resume: "desktop-orchestrator",
  cancel: "desktop-orchestrator",
  retry: "desktop-orchestrator",
  handoff: "desktop-task-adapter",
  approve: "target-gate",
  reject: "target-gate",
  reprioritize: "work-dependency-analysis",
});
const TARGETS = Object.freeze({
  message: ["task", "work-item"],
  pause: ["run", "task", "work-item"],
  resume: ["run", "task", "work-item"],
  cancel: ["run", "task", "work-item"],
  retry: ["task", "work-item"],
  handoff: ["task"],
  approve: ["gate"],
  reject: ["gate"],
  reprioritize: ["run", "work-item"],
});

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
const clone = (value) => structuredClone(value);
const text = (value, label) => {
  if (typeof value !== "string" || !value) fail(`${label} is required`, "DR7401");
  return value;
};
const list = (value, label) => {
  if (!Array.isArray(value)) fail(`${label} must be an array`, "DR7401");
  return clone(value);
};
const byIdentity = (left, right) =>
  String(left.taskId ?? left.workItemId ?? left.approvalId ?? left.assessmentId ?? left.attemptId ?? left.sessionId ?? left.receiptId ?? canonicalJsonDigest(left))
    .localeCompare(String(right.taskId ?? right.workItemId ?? right.approvalId ?? right.assessmentId ?? right.attemptId ?? right.sessionId ?? right.receiptId ?? canonicalJsonDigest(right)));
const sorted = (value, label) => list(value, label).sort(byIdentity);

function assertRun(orchestrationRun) {
  if (orchestrationRun?.kind !== "LocalHostRunState" || orchestrationRun.state?.plan?.kind !== "DesktopOrchestrationPlan") {
    fail("a durable Desktop orchestration run is required", "DR7401");
  }
  return orchestrationRun;
}

function sourceMaterial({ projectId, orchestrationRun, taskObservations = [], worktreeLeases = [], memorySessions = [], approvals = [], qualityEvidence = [], interventionReceipts = [] } = {}) {
  text(projectId, "projectId");
  assertRun(orchestrationRun);
  return {
    projectId,
    orchestrationRun: clone(orchestrationRun),
    taskObservations: sorted(taskObservations, "taskObservations"),
    worktreeLeases: sorted(worktreeLeases, "worktreeLeases"),
    memorySessions: sorted(memorySessions, "memorySessions"),
    approvals: sorted(approvals, "approvals"),
    qualityEvidence: sorted(qualityEvidence, "qualityEvidence"),
    interventionReceipts: sorted(interventionReceipts, "interventionReceipts"),
  };
}

export function createHumanOrchestrationSourceBundle(input = {}) {
  const material = sourceMaterial(input);
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "HumanOrchestrationSourceBundle",
    ...material,
    bundleDigest: canonicalJsonDigest(material),
  });
}

function loadSourceBundle(bundle) {
  if (bundle?.kind !== "HumanOrchestrationSourceBundle") fail("source bundle is required", "DR7402");
  const { apiVersion, kind, bundleDigest, ...material } = bundle;
  void apiVersion; void kind;
  if (!DIGEST.test(bundleDigest) || canonicalJsonDigest(material) !== bundleDigest) fail("source bundle digest drifted", "DR7402");
  return sourceMaterial(material);
}

function taskTopology(observations) {
  const byId = new Map();
  for (const value of observations) {
    const taskId = text(value.taskId, "task observation taskId");
    if (byId.has(taskId)) fail(`duplicate task observation ${taskId}`, "DR7403");
    byId.set(taskId, {
      taskId,
      parentTaskId: value.parentTaskId ?? null,
      workItemId: value.workItemId ?? null,
      role: value.role ?? "worker",
      title: value.title ?? taskId,
      status: value.status ?? "unknown",
      needsAttention: value.needsAttention === true,
      summary: value.summary ?? null,
    });
  }
  for (const task of byId.values()) {
    if (task.parentTaskId !== null && !byId.has(task.parentTaskId)) fail(`task ${task.taskId} has unresolved parent ${task.parentTaskId}`, "DR7403");
  }
  const depth = new Map();
  const paths = new Map();
  const visit = (taskId, visiting = new Set()) => {
    if (depth.has(taskId)) return depth.get(taskId);
    if (visiting.has(taskId)) fail("task topology contains a cycle", "DR7403");
    visiting.add(taskId);
    const parent = byId.get(taskId).parentTaskId;
    const value = parent === null ? 0 : visit(parent, visiting) + 1;
    paths.set(taskId, parent === null ? [taskId] : [...paths.get(parent), taskId]);
    visiting.delete(taskId);
    depth.set(taskId, value);
    return value;
  };
  for (const taskId of [...byId.keys()].sort()) visit(taskId);
  return [...byId.values()]
    .map((task) => ({ ...task, depth: depth.get(task.taskId), path: paths.get(task.taskId) }))
    .sort((left, right) => left.path.join("\u0000").localeCompare(right.path.join("\u0000")));
}

function queueProjection(plan, workState, frontier) {
  return plan.workItems.map((item) => {
    const status = workState[item.id]?.status ?? "pending";
    const blockedBy = item.dependencies.filter((id) => !COMPLETE.has(workState[id]?.status)).sort();
    const disposition = frontier.workItemIds.includes(item.id)
      ? "ready"
      : ACTIVE.has(status)
        ? "active"
        : COMPLETE.has(status)
          ? "complete"
          : TERMINAL.has(status)
            ? "terminal"
            : blockedBy.length
              ? "waiting-on-dependencies"
              : "waiting-for-capacity";
    return {
      workItemId: item.id,
      status,
      dependencies: [...item.dependencies].sort(),
      blockedBy,
      disposition,
      receiptCount: workState[item.id]?.receipts?.length ?? 0,
    };
  }).sort((left, right) => left.workItemId.localeCompare(right.workItemId));
}

function approvalProjection(values) {
  return values.map((value) => ({
    approvalId: text(value.approvalId, "approvalId"),
    gateId: text(value.gateId, "gateId"),
    status: value.status ?? "pending",
    workItemId: value.workItemId ?? null,
    summary: value.summary ?? null,
  })).sort(byIdentity);
}

function qualityProjection(values) {
  const items = values.map((value) => ({
    assessmentId: text(value.assessmentId ?? value.receiptId ?? value.id, "quality evidence identity"),
    workItemId: value.workItemId ?? null,
    kind: value.kind ?? "quality-observation",
    disposition: value.disposition ?? value.outcome ?? value.status ?? "unknown",
    evidenceDigest: value.evidenceDigest ?? value.assessmentDigest ?? value.receiptDigest ?? null,
  })).sort(byIdentity);
  return {
    items,
    counts: Object.fromEntries([...new Set(items.map(({ disposition }) => disposition))].sort().map((disposition) => [disposition, items.filter((item) => item.disposition === disposition).length])),
  };
}

export function createHumanOrchestrationView(input = {}) {
  const sources = input?.kind === "HumanOrchestrationSourceBundle" ? loadSourceBundle(input) : sourceMaterial(input);
  const { projectId, orchestrationRun, taskObservations, worktreeLeases, memorySessions, approvals, qualityEvidence, interventionReceipts } = sources;
  const { plan, workState, blockers, recovery } = orchestrationRun.state;
  const frontier = deriveDesktopReadyFrontier({ plan, workState });
  const tasks = taskTopology(taskObservations);
  const workItemIds = new Set(plan.workItems.map(({ id }) => id));
  const taskIds = new Set(tasks.map(({ taskId }) => taskId));
  for (const task of tasks) if (task.workItemId !== null && !workItemIds.has(task.workItemId)) fail(`task ${task.taskId} references unknown work item ${task.workItemId}`, "DR7403");
  for (const lease of worktreeLeases) {
    if (!workItemIds.has(lease.workItemId)) fail(`worktree ${lease.attemptId} references unknown work item ${lease.workItemId}`, "DR7403");
    if (lease.taskId != null && !taskIds.has(lease.taskId)) fail(`worktree ${lease.attemptId} references unknown task ${lease.taskId}`, "DR7403");
  }
  for (const session of memorySessions) if (session.taskId != null && !taskIds.has(session.taskId)) fail(`memory session ${session.sessionId} references unknown task ${session.taskId}`, "DR7403");
  const approvalItems = approvalProjection(approvals);
  const quality = qualityProjection(qualityEvidence);
  const queue = queueProjection(plan, workState, frontier);
  const attention = [...new Set([
    ...blockers.map((value) => `blocker:${value}`),
    ...tasks.filter(({ needsAttention }) => needsAttention).map(({ taskId }) => `task:${taskId}`),
    ...approvalItems.filter(({ status }) => status === "pending").map(({ approvalId }) => `approval:${approvalId}`),
    ...queue.filter(({ status }) => ["blocked", "quarantined", "failed"].includes(status)).map(({ workItemId }) => `work:${workItemId}`),
  ])].sort();
  const material = {
    projectId,
    runId: plan.runId,
    planDigest: plan.planDigest,
    stateVersion: orchestrationRun.version,
    recovery,
    frontier: {
      workItemIds: [...frontier.workItemIds],
      activeCount: frontier.activeCount,
      availableSlots: frontier.availableSlots,
      frontierDigest: frontier.frontierDigest,
      authority: "core-derived",
    },
    queue,
    tasks,
    worktrees: worktreeLeases.map(({ attemptId, workItemId, taskId, status, workspace, observedRevision }) => ({ attemptId, workItemId, taskId: taskId ?? null, status, workspace: workspace ?? null, observedRevision: observedRevision ?? null })).sort(byIdentity),
    memory: memorySessions.map(({ sessionId, taskId, status, conclusionStatus, baselineDigest }) => ({ sessionId, taskId, status, conclusionStatus: conclusionStatus ?? "pending", baselineDigest: baselineDigest ?? null })).sort(byIdentity),
    approvals: approvalItems,
    quality,
    interventions: interventionReceipts.map(({ receiptId, requestId, action, outcome, route, replayed = false }) => ({ receiptId, requestId, action, outcome, route, replayed })).sort(byIdentity),
    blockers: [...blockers].sort(),
    attention,
    controls: Object.entries(ACTION_ROUTES).map(([action, route]) => ({ action, route, authority: "request-only" })),
    authority: {
      readOnly: true,
      readiness: false,
      gates: false,
      integration: false,
      memoryPromotion: false,
      graphActivation: false,
      taskMutation: false,
    },
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "HumanOrchestrationView",
    ...material,
    viewDigest: canonicalJsonDigest(material),
  });
}

export function verifyHumanOrchestrationView(view) {
  if (view?.kind !== "HumanOrchestrationView") fail("operator view is required", "DR7402");
  const { apiVersion, kind, viewDigest, ...material } = view;
  void apiVersion; void kind;
  if (!DIGEST.test(viewDigest) || viewDigest !== canonicalJsonDigest(material)) fail("operator view digest drifted", "DR7402");
  if (!view.authority.readOnly || Object.entries(view.authority).some(([key, value]) => key !== "readOnly" && value !== false)) fail("operator view acquired authority", "DR7404");
  return true;
}

export function renderHumanOrchestrationView(view) {
  verifyHumanOrchestrationView(view);
  const lines = [
    `# DevRelay operator view · ${view.projectId}`,
    "",
    `Run: ${view.runId} · state ${view.stateVersion} · recovery ${view.recovery}`,
    `Ready: ${view.frontier.workItemIds.join(", ") || "none"} · active ${view.frontier.activeCount} · slots ${view.frontier.availableSlots}`,
    "",
    "## Work queue",
    "",
    ...view.queue.map((item) => `- ${item.workItemId}: ${item.status} · ${item.disposition}${item.blockedBy.length ? ` · waits for ${item.blockedBy.join(", ")}` : ""}`),
    "",
    "## Agents",
    "",
    ...(view.tasks.length ? view.tasks.map((task) => `- ${"  ".repeat(task.depth)}${task.taskId}: ${task.status} · ${task.role} · ${task.title}`) : ["- None"]),
    "",
    "## Attention",
    "",
    ...(view.attention.length ? view.attention.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Quality and approvals",
    "",
    `- Quality observations: ${view.quality.items.length}`,
    `- Pending approvals: ${view.approvals.filter(({ status }) => status === "pending").length}`,
    `- Worktrees: ${view.worktrees.length}`,
    `- Memory sessions: ${view.memory.length}`,
    "",
    "Controls are typed requests only; Core, Gates, Verification, Integration, ProjectMemory, and TraceabilityGraph retain authority.",
    "",
  ];
  return lines.join("\n");
}

function requestMaterial(input = {}) {
  const action = text(input.action, "action");
  if (!ACTION_ROUTES[action]) fail(`unsupported action ${action}`, "DR7411");
  const runId = text(input.runId, "runId");
  if (!Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) fail("expectedStateVersion must be a non-negative integer", "DR7411");
  if (!DIGEST.test(input.snapshotDigest)) fail("snapshotDigest is required", "DR7411");
  const target = clone(input.target);
  if (!target || !TARGETS[action].includes(target.kind) || typeof target.id !== "string" || !target.id) fail(`action ${action} has an invalid target`, "DR7411");
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) fail("payload must be an object", "DR7411");
  if (action === "message" && (typeof input.payload.message !== "string" || !input.payload.message)) fail("message action requires payload.message", "DR7411");
  if (action === "handoff" && (typeof input.payload.destination !== "string" || !input.payload.destination)) fail("handoff action requires payload.destination", "DR7411");
  if (["approve", "reject"].includes(action) && !DIGEST.test(input.payload.subjectDigest)) fail(`${action} action requires payload.subjectDigest`, "DR7411");
  if (action === "reprioritize" && !Number.isSafeInteger(input.payload.priority)) fail("reprioritize action requires integer payload.priority", "DR7411");
  return {
    runId,
    expectedStateVersion: input.expectedStateVersion,
    snapshotDigest: input.snapshotDigest,
    requestedBy: text(input.requestedBy, "requestedBy"),
    requestedAt: text(input.requestedAt, "requestedAt"),
    action,
    target,
    reason: text(input.reason, "reason"),
    payload: clone(input.payload),
    route: ACTION_ROUTES[action],
    authority: "request-only",
  };
}

export function createHumanInterventionRequest(input = {}) {
  const material = requestMaterial({ payload: {}, ...input });
  const requestId = `HIR-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`;
  const body = { ...material, requestId };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "HumanInterventionRequest",
    ...body,
    requestDigest: canonicalJsonDigest(body),
  });
}

export function verifyHumanInterventionRequest(request) {
  if (request?.kind !== "HumanInterventionRequest") fail("intervention request is required", "DR7412");
  const { apiVersion, kind, requestDigest, requestId, ...material } = request;
  void apiVersion; void kind;
  const normalized = requestMaterial(material);
  if (requestId !== `HIR-${canonicalJsonDigest(normalized).slice(7, 23).toUpperCase()}`) fail("intervention request identity drifted", "DR7412");
  if (!DIGEST.test(requestDigest) || requestDigest !== canonicalJsonDigest({ ...normalized, requestId })) fail("intervention request digest drifted", "DR7412");
  return true;
}

function interventionReceipt({ request, observedStateVersion, outcome, observation = {}, replayed = false }) {
  const material = {
    receiptId: `HIRC-${request.requestDigest.slice(7, 23).toUpperCase()}`,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    runId: request.runId,
    action: request.action,
    route: request.route,
    expectedStateVersion: request.expectedStateVersion,
    observedStateVersion,
    outcome,
    observation: clone(observation),
    replayed,
    authority: "observation-only",
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "HumanInterventionReceipt",
    ...material,
    receiptDigest: canonicalJsonDigest(material),
  });
}

export function verifyHumanInterventionReceipt(receipt) {
  if (receipt?.kind !== "HumanInterventionReceipt") fail("intervention receipt is required", "DR7412");
  const { apiVersion, kind, receiptDigest, ...material } = receipt;
  void apiVersion; void kind;
  if (!DIGEST.test(receiptDigest) || receiptDigest !== canonicalJsonDigest(material)) fail("intervention receipt digest drifted", "DR7412");
  if (receipt.authority !== "observation-only") fail("intervention receipt acquired authority", "DR7413");
  return true;
}

export function createHumanOrchestrationController({ inspectRun, inspectView, handlers = {} } = {}) {
  if (typeof inspectRun !== "function" || typeof inspectView !== "function" || !handlers || typeof handlers !== "object") fail("inspectRun, inspectView, and handlers are required", "DR7421");
  const completed = new Map();
  return Object.freeze({
    async execute(request) {
      verifyHumanInterventionRequest(request);
      if (completed.has(request.requestDigest)) {
        const prior = completed.get(request.requestDigest);
        return immutable({ receipt: prior, replayed: true });
      }
      const run = await inspectRun(request.runId);
      assertRun(run);
      const view = await inspectView(request.runId);
      verifyHumanOrchestrationView(view);
      let receipt;
      if (run.version !== request.expectedStateVersion || view.stateVersion !== run.version || view.runId !== request.runId || view.viewDigest !== request.snapshotDigest) {
        const diagnostic = run.version !== request.expectedStateVersion || view.stateVersion !== run.version ? "state-version-drift" : "view-digest-drift";
        receipt = interventionReceipt({ request, observedStateVersion: run.version, outcome: "rejected-stale", observation: { diagnostic, observedViewDigest: view.viewDigest } });
      } else {
        const handler = handlers[request.route];
        if (typeof handler !== "function") {
          receipt = interventionReceipt({ request, observedStateVersion: run.version, outcome: "rejected-unsupported", observation: { diagnostic: "route-handler-unavailable" } });
        } else {
          try {
            const observation = await handler(clone(request), clone(run));
            receipt = interventionReceipt({ request, observedStateVersion: run.version, outcome: "dispatched", observation: observation ?? {} });
          } catch (error) {
            receipt = interventionReceipt({ request, observedStateVersion: run.version, outcome: "failed", observation: { code: error?.code ?? "DR7429", message: error?.message ?? "intervention failed" } });
          }
        }
      }
      completed.set(request.requestDigest, receipt);
      return immutable({ receipt, replayed: false });
    },
  });
}

export const HUMAN_ORCHESTRATION_ACTIONS = Object.freeze(Object.keys(ACTION_ROUTES));
export const HUMAN_ORCHESTRATION_ROUTES = ACTION_ROUTES;

import { canonicalJsonDigest } from "./content-digest.mjs";

export function createDesktopOperatorSnapshot({ orchestrationRun, worktreeLeases = [], memorySessions = [] } = {}) {
  if (orchestrationRun?.kind !== "LocalHostRunState" || orchestrationRun.state?.plan?.kind !== "DesktopOrchestrationPlan") {
    throw new TypeError("desktop operator view requires a durable orchestration run");
  }
  const { plan, workState, blockers, recovery } = orchestrationRun.state;
  const work = Object.entries(workState).sort(([left], [right]) => left.localeCompare(right)).map(([workItemId, value]) => ({
    workItemId,
    status: value.status,
    receiptCount: value.receipts.length,
  }));
  const statusCounts = Object.fromEntries([...new Set(work.map(({ status }) => status))].sort().map((status) => [status, work.filter((entry) => entry.status === status).length]));
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopOperatorSnapshot",
    runId: plan.runId,
    planDigest: plan.planDigest,
    stateVersion: orchestrationRun.version,
    lifecycleAuthority: "read-only-projection",
    work,
    statusCounts,
    worktrees: worktreeLeases.map(({ attemptId, workItemId, taskId, status, observedRevision }) => ({ attemptId, workItemId, taskId, status, observedRevision })).sort((a, b) => a.attemptId.localeCompare(b.attemptId)),
    memory: memorySessions.map(({ sessionId, taskId, status, conclusionStatus }) => ({ sessionId, taskId, status, conclusionStatus })).sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
    blockers: [...blockers].sort(),
    recovery,
  };
  return Object.freeze({ ...body, snapshotDigest: canonicalJsonDigest(body) });
}

export function renderDesktopOperatorSnapshot(snapshot) {
  if (snapshot?.kind !== "DesktopOperatorSnapshot") throw new TypeError("DesktopOperatorSnapshot is required");
  const lines = [
    `# DevRelay Desktop run ${snapshot.runId}`,
    "",
    `State version: ${snapshot.stateVersion}`,
    `Recovery: ${snapshot.recovery}`,
    "",
    "## Work",
    "",
    ...snapshot.work.map((item) => `- ${item.workItemId}: ${item.status} (${item.receiptCount} receipts)`),
    "",
    "## Worktrees",
    "",
    ...(snapshot.worktrees.length ? snapshot.worktrees.map((item) => `- ${item.attemptId}: ${item.status}; task ${item.taskId ?? "unbound"}`) : ["- None"]),
    "",
    "## Memory",
    "",
    ...(snapshot.memory.length ? snapshot.memory.map((item) => `- ${item.sessionId}: ${item.status}; conclusion ${item.conclusionStatus ?? "pending"}`) : ["- None"]),
    "",
    "## Blockers",
    "",
    ...(snapshot.blockers.length ? snapshot.blockers.map((item) => `- ${item}`) : ["- None"]),
    "",
  ];
  return lines.join("\n");
}

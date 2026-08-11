import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const HANDOFF_OUTCOMES = new Set(["pass", "fix", "clarify", "block"]);

export const CHATGPT_DESKTOP_TASK_SUPERVISOR = Object.freeze({
  id: "devrelay.chatgpt-desktop-task-supervisor",
  version: "1.0.0",
});

export class ChatGptDesktopTaskSupervisorError extends Error {
  constructor(message, code = "DR4120") {
    super(`ChatGPT Desktop task supervisor: ${message}`);
    this.name = "ChatGptDesktopTaskSupervisorError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ChatGptDesktopTaskSupervisorError(message, code); };
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const immutable = (value) => {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
};
const exactRef = (value, name) => {
  if (!value || typeof value.artifactId !== "string" || !DIGEST.test(value.digest ?? "")) fail(`${name} must be an exact artifact reference`);
  return { artifactId: value.artifactId, digest: value.digest, ...(value.mediaType && { mediaType: value.mediaType }), ...(value.schema && { schema: value.schema }), ...(value.uri && { uri: value.uri }) };
};
const bodyDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));

function validateBaseline(frontier, baseline) {
  if (frontier?.apiVersion !== API_VERSION || frontier.kind !== "ReadyFrontier" || frontier.authority !== "core-derived-readiness") fail("only a Core-derived ReadyFrontier may be launched", "DR4121");
  if (frontier.frontierDigest !== bodyDigest(frontier, "frontierDigest")) fail("ready frontier failed exact digest validation", "DR4121");
  if (frontier.derivation?.algorithm !== "approved-dag-plus-integrated-completion" || frontier.derivation.inputDigest !== canonicalJsonDigest({ workDependencyBaseline: frontier.workDependencyBaseline, completionFacts: frontier.completionFacts })) fail("ready frontier derivation is not bound to its exact inputs", "DR4121");
  const claimed = [...(frontier.readyWorkItemIds ?? [])].sort(compare);
  const derived = (frontier.dispositions ?? []).filter((item) => item.status === "ready").map((item) => item.workItemId).sort(compare);
  if (canonicalJsonDigest(claimed) !== canonicalJsonDigest(derived)) fail("ready frontier contradicts its dispositions", "DR4121");
  if (baseline?.kind !== "WorkDependencyBaseline" || frontier.workDependencyBaseline.artifactId !== baseline.baselineId || frontier.workDependencyBaseline.digest !== baseline.graphDigest && frontier.workDependencyBaseline.digest !== canonicalJsonDigest(baseline)) {
    fail("ready frontier is stale for the supplied WorkDependencyBaseline", "DR4121");
  }
  if (new Set(frontier.readyWorkItemIds).size !== frontier.readyWorkItemIds.length) fail("ready frontier contains duplicate work items", "DR4121");
}

function validateHandoff(value, expected) {
  const keys = ["apiVersion", "kind", "executionId", "workItemId", "outcome", "changedFiles", "verification", "evidence", "residualRisks", "notes"];
  if (!value || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail("terminal handoff is not the closed BootstrapWorkItemHandoff shape", "DR4124");
  if (value.apiVersion !== API_VERSION || value.kind !== "BootstrapWorkItemHandoff" || value.executionId !== expected.attemptId || value.workItemId !== expected.workItemId || !HANDOFF_OUTCOMES.has(value.outcome)) fail("terminal handoff identity or outcome is invalid", "DR4124");
  if (![value.changedFiles, value.verification, value.evidence, value.residualRisks].every(Array.isArray) || typeof value.notes !== "string") fail("terminal handoff collections are invalid", "DR4124");
  for (const item of value.verification) if (typeof item?.command !== "string" || !Number.isInteger(item.exitCode) || typeof item.summary !== "string") fail("terminal handoff verification is invalid", "DR4124");
  for (const item of value.evidence) if (typeof item?.kind !== "string" || typeof item.relativePath !== "string" || !DIGEST.test(item.digest ?? "")) fail("terminal handoff evidence is invalid", "DR4124");
  return immutable(value);
}

function mapBy(items, key, label) {
  if (!Array.isArray(items)) fail(`${label} must be an array`);
  const result = new Map();
  for (const item of items) {
    const id = item?.[key];
    if (typeof id !== "string" || result.has(id)) fail(`${label} contains a missing or duplicate identity`);
    result.set(id, item);
  }
  return result;
}

export function createChatGptDesktopTaskSupervisor({ appServerClient, runStore, persist, handoffLoader } = {}) {
  if (!appServerClient?.startTask || !appServerClient?.waitForTerminal || !appServerClient?.cancelTask) fail("appServerClient is required");
  const attempts = new Map();
  let sequence = 0;

  async function persistRecord(record, kind) {
    if (persist) return persist(immutable(record), kind);
    if (!runStore) return;
    const current = await runStore.load(record.runId);
    const content = current ? undefined : { artifactId: `${record.runId}:task-supervisor-state`, content: { owner: CHATGPT_DESKTOP_TASK_SUPERVISOR.id }, mediaType: "application/json" };
    const artifact = { artifactId: `${record.attemptId}:${kind}`, content: record, mediaType: "application/json" };
    const committed = await runStore.commit({
      runId: record.runId,
      requestId: `${record.attemptId}:${kind}:${++sequence}`,
      expectedRevision: current?.revision ?? 0,
      ...(content && { content }),
      ...(kind === "task-binding" ? { taskBindings: [artifact] } : { reports: [artifact] }),
    });
    if (committed.outcome !== "committed") fail(`run-store conflict while persisting ${kind}`, "DR4122");
    return committed;
  }

  function contextFor(workItemId, input, maps) {
    const workItem = maps.workItems.get(workItemId);
    const assignment = maps.assignments.get(workItemId);
    const taskContract = maps.taskContracts.get(workItemId);
    if (!workItem || !assignment || !taskContract) fail(`ready work item ${workItemId} lacks exact work, assignment, or task contract context`, "DR4121");
    const predecessorIds = input.workDependencyBaseline.edges.filter((edge) => edge.dependentId === workItemId).map((edge) => edge.prerequisiteId).sort(compare);
    const completionFacts = input.integratedCompletionFacts?.facts ?? input.integratedCompletionFacts ?? [];
    const facts = mapBy(completionFacts, "workItemId", "integrated completion facts");
    const predecessorCompletionFacts = predecessorIds.map((id) => facts.get(id) ?? fail(`ready work item ${workItemId} lacks integrated completion for ${id}`, "DR4121"));
    const material = {
      apiVersion: API_VERSION,
      kind: "DesktopTaskContextBundle",
      runId: input.runId,
      frontier: exactRef({ artifactId: input.frontier.frontierId, digest: input.frontier.frontierDigest }, "frontier"),
      workDependencyBaseline: exactRef(input.frontier.workDependencyBaseline, "workDependencyBaseline"),
      workItem: immutable(workItem),
      assignment: immutable(assignment),
      predecessorCompletionFacts: immutable(predecessorCompletionFacts),
      taskContract: exactRef(taskContract, "taskContract"),
      authority: Object.freeze({ readiness: false, approval: false, verification: false, integration: false, routing: false }),
    };
    return { ...material, contextDigest: bodyDigest(material, "contextDigest") };
  }

  async function superviseFrontier(input = {}) {
    if (typeof input.runId !== "string" || typeof input.workspacePath !== "string") fail("runId and workspacePath are required");
    validateBaseline(input.frontier, input.workDependencyBaseline);
    const maps = {
      workItems: mapBy(input.workBreakdownBaseline?.workItems, "id", "work items"),
      assignments: mapBy(input.specialistAssignmentBaseline?.assignments, "workItemRef", "assignments"),
      taskContracts: input.taskContracts instanceof Map ? input.taskContracts : new Map(Object.entries(input.taskContracts ?? {})),
    };
    const launches = [];
    for (const workItemId of [...input.frontier.readyWorkItemIds].sort(compare)) {
      const attemptId = input.attemptIds?.[workItemId] ?? `${input.runId}:${workItemId}`;
      if (attempts.has(attemptId)) fail(`attempt ${attemptId} was already launched`, "DR4123");
      const context = contextFor(workItemId, input, maps);
      const contextBytes = Buffer.from(canonicalJson(context), "utf8");
      const contextBundle = runStore ? await runStore.putArtifact({ artifactId: `${attemptId}:context`, content: contextBytes, digest: sha256Digest(contextBytes), mediaType: "application/json" }) : { artifactId: `${attemptId}:context`, digest: sha256Digest(contextBytes) };
      const taskContract = exactRef(maps.taskContracts.get(workItemId), "taskContract");
      const operation = { operation: "start", runId: input.runId, workItemId, attemptId, taskContract, workspacePath: input.workspacePath, contextBundle, permissionDemands: [...(input.permissionDemands?.[workItemId] ?? [])].sort(compare) };
      const lifecycle = await appServerClient.startTask(operation, input.appServerOptions?.[workItemId]);
      if (lifecycle.outputs?.attemptId !== attemptId || lifecycle.outputs.workItemId !== workItemId || lifecycle.outputs.runId !== input.runId) fail("app-server returned a crossed task identity", "DR4123");
      const binding = immutable({ apiVersion: API_VERSION, kind: "DesktopTaskBinding", runId: input.runId, workItemId, attemptId, taskContract, contextBundle, threadId: lifecycle.outputs.threadId, ...(lifecycle.outputs.turnId && { turnId: lifecycle.outputs.turnId }), frontier: { artifactId: input.frontier.frontierId, digest: input.frontier.frontierDigest } });
      await persistRecord(binding, "task-binding");
      attempts.set(attemptId, { operation: immutable(operation), binding, lifecycle, terminal: undefined, handoff: undefined });
      launches.push(binding);
    }
    return immutable(launches);
  }

  async function collectHandoff(attemptId, rawHandoff) {
    const attempt = attempts.get(attemptId);
    if (!attempt) fail(`attempt ${attemptId} is not supervised`, "DR4123");
    if (attempt.handoff) return attempt.handoff;
    const terminal = attempt.terminal ?? await appServerClient.waitForTerminal(attemptId);
    attempt.terminal = terminal;
    if (!TERMINAL.has(terminal.outputs?.state)) fail("task has not reached a terminal state", "DR4124");
    const raw = rawHandoff ?? await handoffLoader?.(terminal.outputs.terminalRawHandoff, attempt.binding);
    if (raw === undefined) fail("terminal raw handoff bytes are required", "DR4124");
    let parsed;
    try { parsed = JSON.parse(Buffer.isBuffer(raw) || raw instanceof Uint8Array ? Buffer.from(raw).toString("utf8") : typeof raw === "string" ? raw : canonicalJson(raw)); }
    catch { fail("terminal raw handoff is not JSON", "DR4124"); }
    const handoff = validateHandoff(parsed, attempt.operation);
    const record = immutable({ apiVersion: API_VERSION, kind: "DesktopTaskHandoffRecord", ...attempt.binding, terminalState: terminal.outputs.state, rawDigest: sha256Digest(Buffer.from(typeof raw === "string" ? raw : Buffer.isBuffer(raw) || raw instanceof Uint8Array ? raw : canonicalJson(raw))), handoff });
    await persistRecord(record, "task-handoff");
    attempt.handoff = record;
    return record;
  }

  async function cancelAttempt(attemptId) {
    const attempt = attempts.get(attemptId);
    if (!attempt) fail(`attempt ${attemptId} is not supervised`, "DR4123");
    return appServerClient.cancelTask({ ...attempt.operation, operation: "cancel", threadId: attempt.binding.threadId, turnId: attempt.binding.turnId });
  }

  function snapshot() { return immutable([...attempts.values()].map(({ binding, terminal, handoff }) => ({ binding, ...(terminal && { terminal }), ...(handoff && { handoff }) })).sort((a, b) => compare(a.binding.attemptId, b.binding.attemptId))); }
  return Object.freeze({ superviseFrontier, collectHandoff, cancelAttempt, snapshot });
}

import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const INTERFACE_INTENT_ID = "IF-DESKTOP-TASK-LIFECYCLE";
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export const CODEX_APP_SERVER_CLIENT = Object.freeze({
  id: "devrelay.chatgpt-desktop-app-server-client",
  version: "1.0.0",
  protocol: "codex-app-server-jsonrpc-jsonl",
});

export class CodexAppServerClientError extends Error {
  constructor(message, code = "DR4100", details) {
    super(`Codex app-server client failed: ${message}`);
    this.name = "CodexAppServerClientError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new CodexAppServerClientError(`${name} must be a non-empty string`, "DR4101");
  }
  return value;
}

function closedTaskIdentity(request) {
  return Object.freeze({
    runId: requiredString(request.runId, "runId"),
    workItemId: requiredString(request.workItemId, "workItemId"),
    attemptId: requiredString(request.attemptId, "attemptId"),
    taskContract: Object.freeze({ ...request.taskContract }),
  });
}

function diagnostic(code, message) {
  return Object.freeze({ code, message, severity: "error" });
}

function artifactRef(kind, identity, value) {
  const digest = canonicalJsonDigest(value);
  return Object.freeze({
    artifactId: `${identity.attemptId}:${kind}`,
    digest,
    mediaType: "application/json",
    schema: `https://devrelay.dev/evidence/chatgpt-desktop/${kind}/v1`,
    uri: `memory://devrelay/desktop-tasks/${encodeURIComponent(identity.attemptId)}/${kind}.json`,
  });
}

function taskState(status) {
  if (status === "inProgress") return "running";
  if (status === "interrupted") return "cancelled";
  if (["completed", "failed"].includes(status)) return status;
  throw new CodexAppServerClientError(`unsupported Codex turn status ${JSON.stringify(status)}`, "DR4102");
}

function validateLifecycleEnvelope(value) {
  const output = value?.outputs;
  if (value?.apiVersion !== API_VERSION || value?.interfaceIntentId !== INTERFACE_INTENT_ID || !value.inputs || !output) {
    throw new CodexAppServerClientError("task lifecycle envelope is incomplete", "DR4113");
  }
  for (const name of ["runId", "workItemId", "attemptId", "threadId"]) requiredString(output[name], `outputs.${name}`);
  if (!["created", "running", "interrupted", "completed", "failed", "cancelled"].includes(output.state)) {
    throw new CodexAppServerClientError("task lifecycle output state is invalid", "DR4113");
  }
  for (const ref of [output.eventCheckpoint, ...(TERMINAL.has(output.state) ? [output.terminalRawHandoff] : [])]) {
    if (!ref || typeof ref.artifactId !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(ref.digest ?? "")) {
      throw new CodexAppServerClientError("task lifecycle evidence reference is invalid", "DR4113");
    }
  }
  return value;
}

function assertIdentity(expected, actual) {
  for (const name of ["runId", "workItemId", "attemptId"]) {
    if (actual[name] !== expected[name]) {
      throw new CodexAppServerClientError(`${name} does not match the bound task identity`, "DR4103");
    }
  }
  if (canonicalJsonDigest(actual.taskContract) !== canonicalJsonDigest(expected.taskContract)) {
    throw new CodexAppServerClientError("taskContract does not match the bound task identity", "DR4103");
  }
}

export function createCodexAppServerProcess({ command = "codex", args = ["app-server", "--listen", "stdio://"], cwd, env } = {}) {
  const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  return { input: child.stdin, output: child.stdout, errors: child.stderr, close: () => child.kill(), process: child };
}

export function createChatGptDesktopAppServerClient(options = {}) {
  const transport = options.transport ?? createCodexAppServerProcess(options.process);
  if (!transport?.input?.write || !transport?.output) throw new CodexAppServerClientError("transport must expose input and output streams", "DR4104");

  const events = new EventEmitter();
  const pending = new Map();
  const tasks = new Map();
  const notificationHistory = [];
  const lines = createInterface({ input: transport.output, crlfDelay: Infinity });
  let nextId = 1;
  let initialized = false;
  let closed = false;

  function send(message) {
    if (closed) throw new CodexAppServerClientError("transport is closed", "DR4105");
    transport.input.write(`${canonicalJson(message)}\n`);
  }

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      send({ id, method, params });
    });
  }

  function checkpoint(task) {
    return artifactRef("app-server-event-checkpoint", task.identity, {
      identity: task.identity,
      requestEvidence: task.requestEvidence,
      responseEvidence: task.responseEvidence,
      events: task.events,
    });
  }

  function outputFor(task, state, terminalEvent, diagnostics = []) {
    const outputs = {
      ...task.identity,
      threadId: task.threadId,
      ...(task.turnId ? { turnId: task.turnId } : {}),
      state,
      eventCheckpoint: checkpoint(task),
      ...(TERMINAL.has(state) ? { terminalRawHandoff: artifactRef("terminal-raw-handoff", task.identity, terminalEvent) } : {}),
      diagnostics,
    };
    return validateLifecycleEnvelope({
      apiVersion: API_VERSION,
      interfaceIntentId: INTERFACE_INTENT_ID,
      inputs: task.operation,
      outputs,
    });
  }

  function recordNotification(message) {
    notificationHistory.push(message);
    const threadId = message.params?.threadId ?? message.params?.turn?.threadId;
    const turnId = message.params?.turnId ?? message.params?.turn?.id;
    for (const task of tasks.values()) {
      if (threadId && threadId !== task.threadId) continue;
      if (turnId && task.turnId && turnId !== task.turnId) continue;
      task.events.push(message);
      if (message.method === "turn/completed" && turnId === task.turnId) {
        const state = taskState(message.params?.turn?.status);
        const error = message.params?.turn?.error?.message;
        const result = outputFor(task, state, message, error ? [diagnostic("codex-turn-failed", error)] : []);
        task.terminal = result;
        task.resolveTerminal?.(result);
      }
    }
    events.emit("notification", message);
    events.emit(message.method, message.params);
  }

  lines.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); }
    catch (error) { events.emit("protocolError", new CodexAppServerClientError("received invalid JSON", "DR4106", error.message)); return; }
    if (Object.hasOwn(message, "id")) {
      const entry = pending.get(message.id);
      if (!entry) { events.emit("protocolError", new CodexAppServerClientError(`received response for unknown id ${message.id}`, "DR4107")); return; }
      pending.delete(message.id);
      if (message.error) entry.reject(new CodexAppServerClientError(`${entry.method}: ${message.error.message ?? "JSON-RPC error"}`, "DR4108", message.error));
      else entry.resolve({ result: message.result, raw: message });
      return;
    }
    if (typeof message.method === "string") recordNotification(message);
  });

  const failPending = (reason) => {
    closed = true;
    const error = new CodexAppServerClientError(reason, "DR4109");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    for (const task of tasks.values()) if (!task.terminal) task.rejectTerminal?.(error);
  };
  lines.on("close", () => failPending("transport closed"));
  transport.process?.once?.("error", (error) => failPending(error.message));

  async function initialize(clientInfo = options.clientInfo ?? { name: CODEX_APP_SERVER_CLIENT.id, title: "DevRelay", version: CODEX_APP_SERVER_CLIENT.version }) {
    if (initialized) return;
    const response = await request("initialize", { clientInfo, capabilities: options.capabilities ?? {} });
    send({ method: "initialized", params: {} });
    initialized = true;
    return response.result;
  }

  async function ensureInitialized() {
    if (!initialized) await initialize();
  }

  function bindTask(operation, threadId, turnId, requestMessage, responseMessages) {
    const identity = closedTaskIdentity(operation);
    const key = identity.attemptId;
    if (tasks.has(key)) throw new CodexAppServerClientError(`attemptId ${key} is already bound`, "DR4110");
    const task = {
      identity, operation: Object.freeze({ ...operation }), threadId, turnId,
      requestEvidence: requestMessage.map((value) => Object.freeze(value)),
      responseEvidence: responseMessages.map((value) => Object.freeze(value)), events: [], terminal: undefined,
    };
    task.terminalPromise = new Promise((resolve, reject) => { task.resolveTerminal = resolve; task.rejectTerminal = reject; });
    tasks.set(key, task);
    for (const message of notificationHistory) {
      const eventThreadId = message.params?.threadId ?? message.params?.turn?.threadId;
      const eventTurnId = message.params?.turnId ?? message.params?.turn?.id;
      if (eventThreadId && eventThreadId !== task.threadId) continue;
      if (eventTurnId && task.turnId && eventTurnId !== task.turnId) continue;
      task.events.push(message);
      if (message.method === "turn/completed" && eventTurnId === task.turnId) {
        const state = taskState(message.params?.turn?.status);
        const error = message.params?.turn?.error?.message;
        task.terminal = outputFor(task, state, message, error ? [diagnostic("codex-turn-failed", error)] : []);
        task.resolveTerminal(task.terminal);
      }
    }
    return task;
  }

  async function startTask(operation, { thread = {}, turn = {} } = {}) {
    await ensureInitialized();
    if (operation.operation !== "start") throw new CodexAppServerClientError("startTask requires operation=start", "DR4111");
    requiredString(operation.workspacePath, "workspacePath");
    closedTaskIdentity(operation);
    const threadRequest = { ...thread, cwd: operation.workspacePath, serviceName: thread.serviceName ?? CODEX_APP_SERVER_CLIENT.id };
    const started = await request("thread/start", threadRequest);
    const threadId = requiredString(started.result?.thread?.id, "thread/start result.thread.id");
    const input = turn.input ?? [{ type: "text", text: canonicalJson(operation) }];
    const turnRequest = { ...turn, threadId, input };
    const begun = await request("turn/start", turnRequest);
    const turnId = requiredString(begun.result?.turn?.id, "turn/start result.turn.id");
    const task = bindTask(operation, threadId, turnId,
      [{ method: "thread/start", params: threadRequest }, { method: "turn/start", params: turnRequest }],
      [started.raw, begun.raw]);
    return outputFor(task, "running", begun.raw);
  }

  async function existingTask(operation, method, { turn = {} } = {}) {
    await ensureInitialized();
    closedTaskIdentity(operation);
    requiredString(operation.threadId, "threadId");
    const resumed = await request(method, { threadId: operation.threadId });
    let begun;
    if (method === "thread/resume") {
      const input = turn.input ?? [{ type: "text", text: canonicalJson(operation) }];
      begun = await request("turn/start", { ...turn, threadId: operation.threadId, input });
    }
    const turnId = begun?.result?.turn?.id ?? operation.turnId;
    const task = bindTask(operation, operation.threadId, turnId,
      [{ method, params: { threadId: operation.threadId } }, ...(begun ? [{ method: "turn/start", params: { ...turn, threadId: operation.threadId, input: turn.input ?? [{ type: "text", text: canonicalJson(operation) }] } }] : [])],
      [resumed.raw, ...(begun ? [begun.raw] : [])]);
    return { task, output: outputFor(task, begun ? "running" : "created", begun?.raw ?? resumed.raw) };
  }

  async function resumeTask(operation, options) {
    if (operation.operation !== "resume") throw new CodexAppServerClientError("resumeTask requires operation=resume", "DR4111");
    return (await existingTask(operation, "thread/resume", options)).output;
  }

  async function inspectTask(operation) {
    if (operation.operation !== "inspect") throw new CodexAppServerClientError("inspectTask requires operation=inspect", "DR4111");
    await ensureInitialized();
    closedTaskIdentity(operation);
    const response = await request("thread/read", { threadId: operation.threadId, includeTurns: true });
    const turns = response.result?.thread?.turns ?? [];
    const latest = operation.turnId ? turns.find((value) => value.id === operation.turnId) : turns.at(-1);
    const state = latest ? taskState(latest.status) : "created";
    const task = bindTask(operation, operation.threadId, latest?.id ?? operation.turnId,
      [{ method: "thread/read", params: { threadId: operation.threadId, includeTurns: true } }], [response.raw]);
    if (TERMINAL.has(state)) task.terminal = outputFor(task, state, response.raw, latest?.error?.message ? [diagnostic("codex-turn-failed", latest.error.message)] : []);
    return task.terminal ?? outputFor(task, state, response.raw);
  }

  async function cancelTask(operation) {
    if (operation.operation !== "cancel") throw new CodexAppServerClientError("cancelTask requires operation=cancel", "DR4111");
    await ensureInitialized();
    closedTaskIdentity(operation);
    requiredString(operation.turnId, "turnId");
    const response = await request("turn/interrupt", { threadId: operation.threadId, turnId: operation.turnId });
    const task = bindTask(operation, operation.threadId, operation.turnId,
      [{ method: "turn/interrupt", params: { threadId: operation.threadId, turnId: operation.turnId } }], [response.raw]);
    return outputFor(task, "running", response.raw);
  }

  function waitForTerminal(attemptId) {
    const task = tasks.get(requiredString(attemptId, "attemptId"));
    if (!task) throw new CodexAppServerClientError(`attemptId ${attemptId} is not bound`, "DR4112");
    return task.terminal ?? task.terminalPromise;
  }

  function taskEvidence(attemptId) {
    const task = tasks.get(requiredString(attemptId, "attemptId"));
    if (!task) throw new CodexAppServerClientError(`attemptId ${attemptId} is not bound`, "DR4112");
    const value = { identity: task.identity, requests: task.requestEvidence, responses: task.responseEvidence, events: task.events };
    return Object.freeze({ value: Object.freeze(value), digest: canonicalJsonDigest(value) });
  }

  function assertBoundIdentity(attemptId, operation) {
    const task = tasks.get(attemptId);
    if (!task) throw new CodexAppServerClientError(`attemptId ${attemptId} is not bound`, "DR4112");
    assertIdentity(task.identity, operation);
    return true;
  }

  function close() { lines.close(); transport.close?.(); }

  return Object.freeze({ initialize, startTask, resumeTask, inspectTask, cancelTask, waitForTerminal, taskEvidence, assertBoundIdentity, on: events.on.bind(events), close });
}

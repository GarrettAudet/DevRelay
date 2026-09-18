import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDesktopProjectMemoryBootstrap } from "../../src/desktop-project-memory-bootstrap.mjs";
import { revalidateDesktopTaskPlan } from "../../src/desktop-task-adapter.mjs";

export const protocol = "devrelay.zeroshot-desktop/1";
const maximumBytes = 2 * 1024 * 1024;
export const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fail = (message) => { throw new Error(`Desktop broker: ${message}`); };
const safeRequestId = (id) => {
  if (typeof id !== "string" || !/^[1-9][0-9]{0,15}$/u.test(id)) fail("invalid request identity");
  return id;
};
export function readBytes(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > maximumBytes) fail("invalid or oversized file");
  const bytes = readFileSync(file);
  if (bytes.length > maximumBytes) fail("oversized file");
  return bytes;
}
const readJson = (file) => JSON.parse(readBytes(file).toString("utf8"));

export function publish(file, value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (bytes.length > maximumBytes) fail("oversized publication");
  if (existsSync(file)) {
    if (!readBytes(file).equals(bytes)) fail("immutable record conflict");
    return value;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx");
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try { linkSync(temporary, file); }
  catch (error) {
    if (error.code !== "EEXIST" || !readBytes(file).equals(bytes)) throw error;
  } finally { unlinkSync(temporary); }
  return value;
}

function requestContext(queueDirectory, requestId, { allowClosed = false } = {}) {
  const queue = path.resolve(queueDirectory);
  const id = safeRequestId(requestId);
  const file = (kind) => path.join(queue, kind, `${id}.json`);
  const configurationBytes = readBytes(path.join(queue, "configuration.json"));
  const configuration = JSON.parse(configurationBytes);
  const requestBytes = readBytes(file("requests"));
  const request = JSON.parse(requestBytes);
  if (request.protocol !== protocol || configuration.protocol !== protocol
      || request.requestId !== id || request.reference?.runId !== configuration.runId
      || String(request.reference?.execution) !== id
      || request.configurationDigest !== digest(configurationBytes)
      || path.resolve(request.workspace) !== path.resolve(configuration.workspace)) fail("request/configuration identity mismatch");
  if (!allowClosed && (existsSync(path.join(queue, "terminal.json")) || existsSync(file("cancelled"))
      || !Number.isSafeInteger(request.deadlineUnixMs) || Date.now() >= request.deadlineUnixMs)) fail("run or request is closed");
  if (!allowClosed) {
    const heartbeat = readJson(path.join(queue, "heartbeat.json"));
    if (!Number.isSafeInteger(heartbeat.pid) || !Number.isSafeInteger(heartbeat.lastSeenUnixMs)
        || heartbeat.lastSeenUnixMs > Date.now() + 1000 || Date.now() - heartbeat.lastSeenUnixMs > 10000) fail("engine heartbeat is stale; reconcile before dispatch");
    try { process.kill(heartbeat.pid, 0); } catch { fail("engine process is unavailable"); }
  }
  return { queue, id, file, configuration, request, requestDigest: digest(requestBytes) };
}

function loadPlan(context, planValue) {
  const { configuration, request } = context;
  const memoryBootstrap = loadDesktopProjectMemoryBootstrap({
    projectRoot: configuration.workspace, taskId: planValue.attemptId,
    repositoryRevision: configuration.submission.source.revision,
  });
  const plan = revalidateDesktopTaskPlan({ plan: planValue, memoryBootstrap });
  if (plan.runId !== configuration.runId || plan.workItemId !== `${configuration.runId}-node-${context.id}`
      || plan.attemptId !== `${configuration.runId}-execution-${context.id}`
      || plan.startingRevision !== configuration.submission.source.revision
      || path.resolve(plan.worktreeLease.workspace) !== path.resolve(configuration.workspace)
      || plan.promptDigest !== digest(Buffer.from(request.prompt, "utf8"))) fail("plan does not bind this exact request");
  return plan;
}

// Reservation precedes the native tool call. An interrupted reservation is
// uncertain work and is never silently re-dispatched by this broker.
export function claim(queueDirectory, requestId, planValue) {
  const context = requestContext(queueDirectory, requestId);
  const plan = loadPlan(context, planValue);
  if (existsSync(context.file("claims"))) fail("already reserved; reconcile the existing native task");
  publish(context.file("plans"), plan);
  const reservation = publish(context.file("claims"), {
    protocol, requestDigest: context.requestDigest, planDigest: plan.planDigest, claimId: randomUUID(),
  });
  return { reservation, request: context.request, plan };
}

export function bind(queueDirectory, requestId, agentId, nativeReceipt) {
  const context = requestContext(queueDirectory, requestId);
  const reservation = readJson(context.file("claims"));
  const plan = loadPlan(context, readJson(context.file("plans")));
  if (reservation.requestDigest !== context.requestDigest || reservation.planDigest !== plan.planDigest) fail("claim identity mismatch");
  if (typeof agentId !== "string" || !agentId || agentId.length > 256 || !nativeReceipt || typeof nativeReceipt !== "object") fail("actual native agent identity and receipt are required");
  return publish(context.file("receipts"), {
    protocol, requestDigest: context.requestDigest, planDigest: plan.planDigest,
    agentId, nativeReceipt, authority: "observation-only",
  });
}

export function respond(queueDirectory, requestId, agentId, finalText) {
  const context = requestContext(queueDirectory, requestId);
  const receipt = readJson(context.file("receipts"));
  const plan = loadPlan(context, readJson(context.file("plans")));
  if (receipt.agentId !== agentId || receipt.requestDigest !== context.requestDigest
      || receipt.planDigest !== plan.planDigest) fail("native completion identity mismatch");
  if (typeof finalText !== "string" || Buffer.byteLength(finalText) > maximumBytes) fail("invalid native final response");
  const final = JSON.parse(finalText);
  if (final === null || Array.isArray(final) || typeof final !== "object"
      || Object.keys(final).length !== 1 || !Object.hasOwn(final, "response")) fail("agent must return exactly {response: ...}");
  publish(path.join(context.queue, "finals", `${context.id}.json`), { agentId, finalText });
  return publish(context.file("responses"), {
    protocol, requestDigest: context.requestDigest, agentId, planDigest: plan.planDigest, response: final.response,
  });
}

export function status(queueDirectory) {
  const queue = path.resolve(queueDirectory);
  const terminalFile = path.join(queue, "terminal.json");
  const terminal = existsSync(terminalFile) ? readJson(terminalFile) : null;
  const requests = readdirSync(path.join(queue, "requests")).filter((file) => /^[1-9][0-9]*\.json$/u.test(file))
    .sort((left, right) => Number.parseInt(left) - Number.parseInt(right)).map((name) => {
      const context = requestContext(queue, name.slice(0, -5), { allowClosed: true });
      const receipt = existsSync(context.file("receipts")) ? readJson(context.file("receipts")) : null;
      const completed = existsSync(context.file("responses"));
      const closed = terminal !== null || existsSync(context.file("cancelled")) || Date.now() >= context.request.deadlineUnixMs;
      return { requestId: context.id, node: context.request.reference.node, role: context.request.role,
        state: completed ? "submitted" : closed ? "reconcile" : receipt ? "dispatched" : existsSync(context.file("claims")) ? "reserved" : "pending",
        agentId: receipt?.agentId ?? null, requestDigest: context.requestDigest };
    });
  return { terminal, requests };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, queue, id, argument, extra] = process.argv.slice(2);
    let result;
    if (command === "status") result = status(queue);
    else if (command === "claim") result = claim(queue, id, readJson(argument));
    else if (command === "bind") result = bind(queue, id, argument, readJson(extra));
    else if (command === "respond") result = respond(queue, id, argument, readBytes(extra).toString("utf8"));
    else fail("usage: broker.mjs status QUEUE | claim QUEUE ID PLAN | bind QUEUE ID AGENT RECEIPT | respond QUEUE ID AGENT FINAL");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

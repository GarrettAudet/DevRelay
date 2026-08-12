import { canonicalJson } from "./content-digest.mjs";

export const CHATGPT_DESKTOP_MCP_PROTOCOL_VERSION = "2025-06-18";
export const CHATGPT_DESKTOP_MCP_SERVER_INFO = Object.freeze({ name: "devrelay", version: "0.9.0" });

const OPERATIONS = Object.freeze([
  ["devrelay_create_run", "create-run", ["operation", "requestId", "runId", "expectedRevision", "goal", "circuit", "projectOverview", "policy"], "Create a content-addressed DevRelay run."],
  ["devrelay_inspect_run", "inspect-run", ["operation", "requestId", "runId", "expectedRevision", "reportPolicy"], "Inspect a run through the approved reporting policy."],
  ["devrelay_submit_clarification", "submit-clarification", ["operation", "requestId", "runId", "expectedRevision", "checkpoint", "answers"], "Submit answers bound to an exact clarification checkpoint."],
  ["devrelay_submit_gate_decision", "submit-gate-decision", ["operation", "requestId", "runId", "expectedRevision", "gateCandidate", "decision", "approvalEvidence"], "Submit a human Gate decision and its approval evidence."],
  ["devrelay_progress_run", "progress-run", ["operation", "requestId", "runId", "expectedRevision", "approvedPredecessor"], "Request progression from an exact approved predecessor."],
  ["devrelay_resume_run", "resume-run", ["operation", "requestId", "runId", "expectedRevision", "checkpoint", "checkpointDigest"], "Resume from an exact digest-bound checkpoint."],
  ["devrelay_get_evidence", "get-evidence", ["operation", "requestId", "runId", "expectedRevision", "evidenceId"], "Retrieve one evidence artifact from a run."],
  ["devrelay_list_runs", "list-runs", ["operation", "requestId"], "List privacy-safe persisted-run metadata.", ["limit", "cursor"]],
]);

const byToolName = new Map(OPERATIONS.map((entry) => [entry[0], entry]));
const digestSchema = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const idSchema = { type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" };
const refSchema = { type: "object", additionalProperties: false, required: ["artifactId", "digest"], properties: { artifactId: idSchema, digest: digestSchema, mediaType: { type: "string", minLength: 1 }, schema: { type: "string", minLength: 1 }, uri: { type: "string", minLength: 1 } } };
const fieldSchemas = {
  requestId: idSchema, runId: idSchema, expectedRevision: { type: "integer", minimum: 0 }, goal: { type: "string", minLength: 1 },
  circuit: refSchema, projectOverview: refSchema, policy: refSchema, reportPolicy: refSchema, checkpoint: refSchema,
  answers: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["questionId", "answer"], properties: { questionId: idSchema, answer: { type: "string", minLength: 1 } } } },
  gateCandidate: refSchema, decision: { enum: ["approve", "reject", "request-revision"] }, approvalEvidence: refSchema,
  approvedPredecessor: refSchema, checkpointDigest: digestSchema, evidenceId: idSchema,
  limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string", minLength: 1, maxLength: 1024 },
};
const inputSchema = (operation, required, optional = []) => ({ type: "object", additionalProperties: false, required, properties: Object.fromEntries([...required, ...optional].map((key) => [key, key === "operation" ? { const: operation } : fieldSchemas[key]])) });

export const CHATGPT_DESKTOP_MCP_TOOLS = Object.freeze(OPERATIONS.map(([name, operation, required, description, optional]) => Object.freeze({
  name,
  description,
  inputSchema: inputSchema(operation, required, optional),
})));

export class ChatGptDesktopMcpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ChatGptDesktopMcpError";
    this.code = code;
  }
}

const invalidParams = (message) => new ChatGptDesktopMcpError(-32602, message);

function validateRequest(operation, value) {
  const entry = OPERATIONS.find((item) => item[1] === operation);
  if (!entry || !plainObject(value)) throw invalidParams(`invalid ${operation} request`);
  if (operation === "list-runs") {
    allowedKeys(value, entry[2], entry[4], `${operation} request`);
    if (value.operation !== operation || !id(value.requestId) || ("limit" in value && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100)) || ("cursor" in value && !validCursor(value.cursor))) throw invalidParams(`invalid ${operation} request`);
    return;
  }
  exactKeys(value, entry[2], `${operation} request`);
  if (value.operation !== operation || !id(value.requestId) || !id(value.runId) || !nonnegativeInteger(value.expectedRevision)) throw invalidParams(`invalid ${operation} request identity`);
  const refs = entry[2].filter((key) => ["circuit", "projectOverview", "policy", "reportPolicy", "checkpoint", "gateCandidate", "approvalEvidence", "approvedPredecessor"].includes(key));
  if (refs.some((key) => !artifactRef(value[key]))) throw invalidParams(`invalid ${operation} artifact reference`);
  if (operation === "create-run" && !nonempty(value.goal)) throw invalidParams("invalid create-run goal");
  if (operation === "submit-clarification" && (!Array.isArray(value.answers) || value.answers.length === 0 || value.answers.some((answer) => !plainObject(answer) || !sameKeys(answer, ["questionId", "answer"]) || !id(answer.questionId) || !nonempty(answer.answer)))) throw invalidParams("invalid clarification answers");
  if (operation === "submit-gate-decision" && !["approve", "reject", "request-revision"].includes(value.decision)) throw invalidParams("invalid Gate decision");
  if (operation === "resume-run" && !digest(value.checkpointDigest)) throw invalidParams("invalid checkpoint digest");
  if (operation === "get-evidence" && !id(value.evidenceId)) throw invalidParams("invalid evidence identity");
}

function validateResponse(inputs, outputs) {
  if (inputs.operation === "list-runs") {
    const keys = ["requestId", "status", "runs", "diagnostics"];
    if (!plainObject(outputs) || !keys.every((key) => key in outputs) || Object.keys(outputs).some((key) => ![...keys, "nextCursor"].includes(key)) ||
        outputs.requestId !== inputs.requestId || outputs.status !== "completed" || !Array.isArray(outputs.runs) || outputs.runs.length > 100 || outputs.runs.some((item) => !runSummary(item)) ||
        !Array.isArray(outputs.diagnostics) || outputs.diagnostics.length > 100 || outputs.diagnostics.some((item) => !listDiagnostic(item)) || ("nextCursor" in outputs && !validCursor(outputs.nextCursor))) {
      throw new ChatGptDesktopMcpError(-32603, "Core returned an invalid Desktop list-runs response");
    }
    return outputs;
  }
  const keys = ["requestId", "runId", "revision", "status", "artifacts", "diagnostics", "nextAction"];
  if (!plainObject(outputs) || !keys.every((key) => key in outputs) || Object.keys(outputs).some((key) => ![...keys, "gateState"].includes(key)) ||
      outputs.requestId !== inputs.requestId || outputs.runId !== inputs.runId || !nonnegativeInteger(outputs.revision) ||
      !["completed", "clarification-required", "gate-required", "unable-to-proceed", "failed"].includes(outputs.status) ||
      !Array.isArray(outputs.artifacts) || outputs.artifacts.some((ref) => !artifactRef(ref)) || !Array.isArray(outputs.diagnostics) || outputs.diagnostics.some((item) => !diagnostic(item)) ||
      !nextAction(outputs.nextAction) || ("gateState" in outputs && !["not-applicable", "pending", "approved", "rejected", "revision-requested"].includes(outputs.gateState))) {
    throw new ChatGptDesktopMcpError(-32603, "Core returned an invalid Desktop response");
  }
  return outputs;
}

const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.length > 0;
const id = (value) => nonempty(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
const digest = (value) => typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
const nonnegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const sameKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const exactKeys = (value, keys, label) => { if (!sameKeys(value, keys)) throw invalidParams(`${label} contains missing or unsupported fields`); };
const allowedKeys = (value, required, optional, label) => { if (!required.every((key) => key in value) || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) throw invalidParams(`${label} contains missing or unsupported fields`); };
const validCursor = (value) => {
  if (typeof value !== "string" || value.length < 1 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/u.test(value)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return plainObject(decoded) && sameKeys(decoded, ["offset", "version"]) && Number.isSafeInteger(decoded.offset) && decoded.offset >= 0 && decoded.version === 1 && Buffer.from(canonicalJson(decoded), "utf8").toString("base64url") === value;
  } catch { return false; }
};
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value);
const runSummary = (value) => plainObject(value) && sameKeys(value, ["runId", "revision", "lifecycleState", "checkpoint", "recoveryStatus", "createdAt", "updatedAt"]) && id(value.runId) && Number.isInteger(value.revision) && value.revision >= 1 && ["created", "active", "clarification-required", "gate-required", "completed", "unable-to-proceed", "failed"].includes(value.lifecycleState) && (value.checkpoint === null || nonempty(value.checkpoint)) && ["current", "recovered"].includes(value.recoveryStatus) && timestamp(value.createdAt) && timestamp(value.updatedAt);
const listDiagnostic = (value) => plainObject(value) && ["code", "message", "severity"].every((key) => key in value) && Object.keys(value).every((key) => ["code", "message", "severity", "runId"].includes(key)) && id(value.code) && nonempty(value.message) && ["info", "warning", "error"].includes(value.severity) && (!("runId" in value) || id(value.runId));
const artifactRef = (value) => plainObject(value) && ["artifactId", "digest"].every((key) => key in value) && Object.keys(value).every((key) => ["artifactId", "digest", "mediaType", "schema", "uri"].includes(key)) && id(value.artifactId) && digest(value.digest) && ["mediaType", "schema", "uri"].every((key) => !(key in value) || nonempty(value[key]));
const diagnostic = (value) => plainObject(value) && ["code", "message", "severity"].every((key) => key in value) && Object.keys(value).every((key) => ["code", "message", "severity", "relatedArtifacts"].includes(key)) && id(value.code) && nonempty(value.message) && ["info", "warning", "error"].includes(value.severity) && (!("relatedArtifacts" in value) || (Array.isArray(value.relatedArtifacts) && value.relatedArtifacts.every(artifactRef)));
const nextAction = (value) => plainObject(value) && "kind" in value && Object.keys(value).every((key) => ["kind", "moduleId", "artifact"].includes(key)) && ["none", "clarification-required", "gate-decision-required", "progression-available", "resume-available", "evidence-available"].includes(value.kind) && (!("moduleId" in value) || id(value.moduleId)) && (!("artifact" in value) || artifactRef(value.artifact));

const success = (id, result) => ({ jsonrpc: "2.0", id, result });
const failure = (id, error) => ({ jsonrpc: "2.0", id: id ?? null, error: { code: error.code ?? -32603, message: error.message ?? "Internal error" } });

export function createChatGptDesktopMcpServer({ execute }) {
  if (typeof execute !== "function") throw new TypeError("execute must be a function");

  async function callTool(params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) throw invalidParams("tools/call params must be an object");
    const entry = byToolName.get(params.name);
    if (!entry) throw new ChatGptDesktopMcpError(-32601, `Unknown tool: ${String(params.name)}`);
    if (Object.keys(params).some((key) => key !== "name" && key !== "arguments")) throw invalidParams("tools/call contains unsupported fields");
    const [, operation] = entry;
    const inputs = structuredClone(params.arguments ?? {});
    validateRequest(operation, inputs);
    const outputs = await execute(Object.freeze(structuredClone(inputs)));
    validateResponse(inputs, outputs);
    return { content: [{ type: "text", text: canonicalJson(outputs) }], structuredContent: outputs, isError: false };
  }

  return Object.freeze({
    async handle(message) {
      const id = message?.id;
      try {
        if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
          throw new ChatGptDesktopMcpError(-32600, "Invalid JSON-RPC request");
        }
        if (message.method === "notifications/initialized") return undefined;
        if (message.method === "initialize") return success(id, { protocolVersion: CHATGPT_DESKTOP_MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: CHATGPT_DESKTOP_MCP_SERVER_INFO });
        if (message.method === "ping") return success(id, {});
        if (message.method === "tools/list") return success(id, { tools: CHATGPT_DESKTOP_MCP_TOOLS });
        if (message.method === "tools/call") return success(id, await callTool(message.params));
        throw new ChatGptDesktopMcpError(-32601, `Method not found: ${message.method}`);
      } catch (error) {
        return failure(id, error);
      }
    },
  });
}

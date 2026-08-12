import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CHATGPT_DESKTOP_MCP_PROTOCOL_VERSION,
  CHATGPT_DESKTOP_MCP_TOOLS,
  createChatGptDesktopMcpServer,
} from "../src/chatgpt-desktop-mcp-server.mjs";

const digest = (character = "a") => `sha256:${character.repeat(64)}`;
const ref = (artifactId, character = "a") => ({ artifactId, digest: digest(character) });
const base = { requestId: "REQ-1", runId: "RUN-1", expectedRevision: 0 };
const calls = [
  ["devrelay_create_run", { ...base, operation: "create-run", goal: "Ship it", circuit: ref("CIRCUIT"), projectOverview: ref("OVERVIEW", "b"), policy: ref("POLICY", "c") }],
  ["devrelay_inspect_run", { ...base, operation: "inspect-run", reportPolicy: ref("REPORT-POLICY") }],
  ["devrelay_submit_clarification", { ...base, operation: "submit-clarification", checkpoint: ref("CHECKPOINT"), answers: [{ questionId: "Q-1", answer: "Yes" }] }],
  ["devrelay_submit_gate_decision", { ...base, operation: "submit-gate-decision", gateCandidate: ref("GATE"), decision: "approve", approvalEvidence: ref("APPROVAL") }],
  ["devrelay_progress_run", { ...base, operation: "progress-run", approvedPredecessor: ref("PREDECESSOR") }],
  ["devrelay_resume_run", { ...base, operation: "resume-run", checkpoint: ref("CHECKPOINT"), checkpointDigest: digest("b") }],
  ["devrelay_get_evidence", { ...base, operation: "get-evidence", evidenceId: "EVIDENCE-1" }],
  ["devrelay_list_runs", { operation: "list-runs", requestId: "REQ-LIST" }],
];

const outputFor = (input) => input.operation === "list-runs"
  ? { requestId: input.requestId, status: "completed", runs: [], diagnostics: [] }
  : { requestId: input.requestId, runId: input.runId, revision: input.expectedRevision + 1, status: "completed", artifacts: [ref("RESULT")], gateState: "not-applicable", diagnostics: [], nextAction: { kind: "none" } };
const rpc = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("initialize and tools/list expose only the eight approved bounded commands", async () => {
  const server = createChatGptDesktopMcpServer({ execute: outputFor });
  const initialized = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(initialized.result.protocolVersion, CHATGPT_DESKTOP_MCP_PROTOCOL_VERSION);
  const listed = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(listed.result.tools, CHATGPT_DESKTOP_MCP_TOOLS);
  assert.deepEqual(listed.result.tools.map(({ name }) => name), calls.map(([name]) => name));
  assert.equal(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
});

test("every approved command validates before Core and validates the Core response", async () => {
  const observed = [];
  const server = createChatGptDesktopMcpServer({ execute: async (input) => { observed.push(input); return outputFor(input); } });
  for (let index = 0; index < calls.length; index += 1) {
    const [name, args] = calls[index];
    const response = await server.handle(rpc(index, name, args));
    assert.equal(response.result.isError, false);
    assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  }
  assert.deepEqual(observed, calls.map(([, args]) => args));

  const invalid = await server.handle(rpc(20, calls[0][0], { ...calls[0][1], callerSelectedRoute: "design-change" }));
  assert.equal(invalid.error.code, -32602);
  assert.equal(observed.length, calls.length, "invalid input must not reach Core");

  const badCore = createChatGptDesktopMcpServer({ execute: async () => ({ authority: "fabricated" }) });
  const invalidOutput = await badCore.handle(rpc(21, calls[1][0], calls[1][1]));
  assert.equal(invalidOutput.error.code, -32603);
});

test("unknown methods, tools, malformed calls, and caller-authored effect fields fail closed", async () => {
  let executions = 0;
  const server = createChatGptDesktopMcpServer({ execute: async (input) => { executions += 1; return outputFor(input); } });
  assert.equal((await server.handle({ jsonrpc: "2.0", id: 1, method: "route/select" })).error.code, -32601);
  assert.equal((await server.handle(rpc(2, "devrelay_shell", { command: "whoami" }))).error.code, -32601);
  assert.equal((await server.handle(rpc(3, calls[3][0], { ...calls[3][1], graphOperations: [] }))).error.code, -32602);
  assert.equal((await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: calls[0][0], arguments: calls[0][1], authority: "approved" } })).error.code, -32602);
  assert.equal(executions, 0);
});

test("equivalent calls and fresh server instances return byte-stable JSON", async () => {
  const one = createChatGptDesktopMcpServer({ execute: outputFor });
  const two = createChatGptDesktopMcpServer({ execute: outputFor });
  const args = calls[6][1];
  const reordered = { evidenceId: args.evidenceId, expectedRevision: args.expectedRevision, runId: args.runId, requestId: args.requestId, operation: args.operation };
  const first = await one.handle(rpc(7, calls[6][0], args));
  const replay = await one.handle(rpc(7, calls[6][0], reordered));
  const restarted = await two.handle(rpc(7, calls[6][0], reordered));
  assert.equal(JSON.stringify(first), JSON.stringify(replay));
  assert.equal(JSON.stringify(first), JSON.stringify(restarted));
});

test("list-runs validates its closed bounded pagination request", async () => {
  const observed = [];
  const server = createChatGptDesktopMcpServer({ execute: async (input) => { observed.push(input); return outputFor(input); } });
  assert.equal((await server.handle(rpc(30, "devrelay_list_runs", { operation: "list-runs", requestId: "REQ-LIST", limit: 1 }))).error, undefined);
  assert.equal((await server.handle(rpc(31, "devrelay_list_runs", { operation: "list-runs", requestId: "REQ-LIST", limit: 100 }))).error, undefined);
  for (const args of [
    { operation: "list-runs", requestId: "REQ-LIST", limit: 0 },
    { operation: "list-runs", requestId: "REQ-LIST", limit: 101 },
    { operation: "list-runs", requestId: "REQ-LIST", cursor: "not-a-cursor" },
    { operation: "list-runs", requestId: "REQ-LIST", route: "create-run" },
  ]) assert.equal((await server.handle(rpc(32, "devrelay_list_runs", args))).error.code, -32602);
  assert.equal(observed.length, 2);
});

test("STDIO transport processes MCP newline frames in order and survives parse errors", async (context) => {
  const transport = fileURLToPath(new URL("../src/chatgpt-desktop-mcp-transport.mjs", import.meta.url));
  const adapter = fileURLToPath(new URL("./fixtures/chatgpt-desktop-mcp/core-adapter.mjs", import.meta.url));
  const child = spawn(process.execPath, [transport], { env: { ...process.env, DEVRELAY_DESKTOP_CORE_MODULE: adapter }, stdio: ["pipe", "pipe", "pipe"] });
  context.after(() => child.kill());
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const received = [];
  lines.on("line", (line) => received.push(line));
  child.stdin.write("not-json\n");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
  child.stdin.write(`${JSON.stringify(rpc(2, calls[1][0], calls[1][1]))}\n`);
  while (received.length < 3) await once(lines, "line");
  assert.equal(JSON.parse(received[0]).error.code, -32700);
  assert.equal(JSON.parse(received[1]).result.protocolVersion, CHATGPT_DESKTOP_MCP_PROTOCOL_VERSION);
  assert.equal(JSON.parse(received[2]).result.structuredContent.status, "completed");
});

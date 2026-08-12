import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createChatGptDesktopRunStore } from "../src/chatgpt-desktop-run-store.mjs";

const transport = fileURLToPath(new URL("../src/chatgpt-desktop-mcp-transport.mjs", import.meta.url));
const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, ...(params && { params }) });

function start(runRoot) {
  const child = spawn(process.execPath, [transport], {
    env: { ...process.env, DEVRELAY_DESKTOP_RUN_ROOT: runRoot, DEVRELAY_DESKTOP_CORE_MODULE: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = [];
  lines.on("line", (line) => pending.shift()?.(JSON.parse(line)));
  const call = (message) => new Promise((resolve) => { pending.push(resolve); child.stdin.write(`${JSON.stringify(message)}\n`); });
  return { child, call };
}

test("production bootstrap initializes, lists tools and persisted runs, rejects malformed input, and survives restart", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "devrelay-mcp-bootstrap-"));
  const store = createChatGptDesktopRunStore({ rootPath: root });
  const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLifecycleRunState", runId: "RUN-BOOT", status: "completed" };
  await store.commit({ runId: "RUN-BOOT", requestId: "REQ-SEED", expectedRevision: 0, content: { artifactId: "STATE-BOOT", content: { ...state, stateDigest: canonicalJsonDigest(state) } } });

  let server = start(root);
  context.after(() => server.child.kill());
  const initialized = await server.call(rpc(1, "initialize", {}));
  assert.equal(initialized.result.serverInfo.name, "devrelay");
  const listed = await server.call(rpc(2, "tools/list"));
  assert.equal(listed.result.tools.some(({ name }) => name === "devrelay_list_runs"), true);
  const runs = await server.call(rpc(3, "tools/call", { name: "devrelay_list_runs", arguments: { operation: "list-runs", requestId: "REQ-LIST" } }));
  assert.deepEqual(runs.result.structuredContent.runs.map(({ runId }) => runId), ["RUN-BOOT"]);
  const malformed = await server.call(rpc(4, "tools/call", { name: "devrelay_list_runs", arguments: { operation: "list-runs", requestId: "REQ-BAD", repair: true } }));
  assert.equal(malformed.error.code, -32602);

  server.child.kill();
  await once(server.child, "exit");
  server = start(root);
  const restarted = await server.call(rpc(5, "tools/call", { name: "devrelay_list_runs", arguments: { operation: "list-runs", requestId: "REQ-RESTART" } }));
  assert.deepEqual(restarted.result.structuredContent.runs.map(({ runId }) => runId), ["RUN-BOOT"]);
});

test("production bootstrap fails closed with a bounded startup diagnostic when the run root is absent", async () => {
  const child = spawn(process.execPath, [transport], {
    env: { ...process.env, DEVRELAY_DESKTOP_RUN_ROOT: "", DEVRELAY_DESKTOP_CORE_MODULE: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(stderr, /^DEVRELAY_MCP_STARTUP_ERROR: DEVRELAY_DESKTOP_RUN_ROOT must identify the configured local run root\r?\n$/u);
});

test("production lifecycle composition cannot fabricate completion without stage bindings", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "devrelay-mcp-unbound-"));
  const store = createChatGptDesktopRunStore({ rootPath: root });
  const circuit = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLifecycleCircuit", stages: [{ id: "requirements", kind: "module" }] };
  const overview = { kind: "ProjectOverviewBaseline" };
  const policy = { kind: "ExecutionPolicy" };
  const refs = {};
  for (const [name, value] of Object.entries({ circuit, overview, policy })) refs[name] = await store.putArtifact({ artifactId: name.toUpperCase(), content: value });
  const server = start(root);
  context.after(() => server.child.kill());
  const response = await server.call(rpc(1, "tools/call", { name: "devrelay_create_run", arguments: {
    operation: "create-run", requestId: "REQ-CREATE", runId: "RUN-UNBOUND", expectedRevision: 0, goal: "Do not fabricate",
    circuit: refs.circuit, projectOverview: refs.overview, policy: refs.policy,
  } }));
  assert.equal(response.result.structuredContent.status, "unable-to-proceed");
  assert.equal(response.result.structuredContent.diagnostics[0].code, "DESKTOP_CAPABILITY_BLOCKED");
  assert.equal(response.result.structuredContent.artifacts.some(({ artifactId }) => artifactId === "DONE"), false);
});

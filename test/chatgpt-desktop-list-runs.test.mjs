import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createChatGptDesktopLifecycleController } from "../src/chatgpt-desktop-lifecycle-controller.mjs";
import { createChatGptDesktopMcpServer } from "../src/chatgpt-desktop-mcp-server.mjs";
import { createChatGptDesktopRunStore } from "../src/chatgpt-desktop-run-store.mjs";

const roots = [];
test.after(async () => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

const createRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "devrelay-list-runs-conformance-"));
  roots.push(root);
  return root;
};

const lifecycle = (runId, status = "running", secret = "") => {
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLifecycleRunState", runId, status, secret };
  return { ...body, stateDigest: canonicalJsonDigest(body) };
};

const revisionPath = (root, runId, revision = 1) => join(root, "runs", encodeURIComponent(runId), "revisions", `${String(revision).padStart(12, "0")}.json`);

async function seed(store, runId, { status = "running", secret = "", checkpoint } = {}) {
  return store.commit({
    runId,
    requestId: `REQ-${runId}`,
    expectedRevision: 0,
    content: { artifactId: `STATE-${runId}`, content: lifecycle(runId, status, secret), mediaType: "application/json" },
    ...(checkpoint && { checkpoint: { checkpointId: checkpoint, checkpointDigest: canonicalJsonDigest({ runId, checkpoint }) } }),
    reports: [{ artifactId: `EVIDENCE-${runId}`, content: `raw evidence ${secret}` }],
  });
}

function createHarness(store) {
  let writes = 0;
  const guardedStore = {
    load: (...args) => store.load(...args),
    listRuns: (...args) => store.listRuns(...args),
    getArtifact: (...args) => store.getArtifact(...args),
    commit: (...args) => { writes += 1; return store.commit(...args); },
    putArtifact: (...args) => { writes += 1; return store.putArtifact(...args); },
  };
  const controller = createChatGptDesktopLifecycleController({ runStore: guardedStore, loadArtifact: async () => undefined, executeStage: async () => undefined });
  const server = createChatGptDesktopMcpServer({ execute: controller.execute });
  let sequence = 0;
  const rawCall = (args) => server.handle({ jsonrpc: "2.0", id: ++sequence, method: "tools/call", params: { name: "devrelay_list_runs", arguments: args } });
  const call = async (args) => {
    const response = await rawCall(args);
    assert.equal(response.error, undefined, response.error?.message);
    assert.equal(response.result.isError, false);
    assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
    return response.result.structuredContent;
  };
  return { server, rawCall, call, writes: () => writes };
}

async function snapshot(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        const metadata = await stat(path);
        files.push({ path: path.slice(root.length), bytes: (await readFile(path)).toString("base64"), mtimeMs: metadata.mtimeMs });
      }
    }
  };
  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

test("lists exact safe latest-run metadata newest-first and remains byte-stable after restart", async () => {
  const root = await createRoot();
  const store = createChatGptDesktopRunStore({ rootPath: root });
  const secret = "PROMPT credential=top-secret source-content raw-evidence";
  await seed(store, "RUN-B", { status: "running", secret, checkpoint: "CP-B" });
  await seed(store, "RUN-A", { status: "completed", secret });
  await seed(store, "RUN-C", { status: "failed", secret });
  const newest = new Date("2026-08-11T12:00:00.000Z");
  const older = new Date("2026-08-10T12:00:00.000Z");
  await Promise.all(["RUN-A", "RUN-B"].map((runId) => utimes(revisionPath(root, runId), newest, newest)));
  await utimes(revisionPath(root, "RUN-C"), older, older);

  const first = await createHarness(store).call({ operation: "list-runs", requestId: "REQ-LIST" });
  assert.deepEqual(first.runs, [
    { runId: "RUN-A", revision: 1, lifecycleState: "completed", checkpoint: null, recoveryStatus: "current", createdAt: newest.toISOString(), updatedAt: newest.toISOString() },
    { runId: "RUN-B", revision: 1, lifecycleState: "active", checkpoint: "CP-B", recoveryStatus: "current", createdAt: newest.toISOString(), updatedAt: newest.toISOString() },
    { runId: "RUN-C", revision: 1, lifecycleState: "failed", checkpoint: null, recoveryStatus: "current", createdAt: older.toISOString(), updatedAt: older.toISOString() },
  ]);
  assert.deepEqual(first.diagnostics, []);
  assert.equal(JSON.stringify(first).includes(secret), false);
  const restarted = await createHarness(createChatGptDesktopRunStore({ rootPath: root })).call({ operation: "list-runs", requestId: "REQ-LIST" });
  assert.equal(JSON.stringify(restarted), JSON.stringify(first));
});

test("reports corruption without mutation or disclosure and recovers the latest valid history", async () => {
  const root = await createRoot();
  const store = createChatGptDesktopRunStore({ rootPath: root });
  const secret = "PRIVATE-PROMPT-CREDENTIAL-RAW-EVIDENCE";
  await seed(store, "RUN-RECOVER", { status: "gate-required", secret, checkpoint: "GATE-1" });
  await store.commit({ runId: "RUN-RECOVER", requestId: "REQ-RECOVER-2", expectedRevision: 1, content: { artifactId: "STATE-RECOVER-2", content: lifecycle("RUN-RECOVER", "completed", secret) } });
  await writeFile(revisionPath(root, "RUN-RECOVER", 2), `{corrupt ${secret}`, "utf8");
  const corrupt = await seed(store, "RUN-CORRUPT", { status: "completed", secret });
  await writeFile(join(root, "blobs", "sha256", corrupt.content.digest.slice(7)), secret, "utf8");
  await mkdir(join(root, "runs", "%invalid"), { recursive: true });
  const before = await snapshot(root);
  const harness = createHarness(store);
  const result = await harness.call({ operation: "list-runs", requestId: "REQ-CORRUPTION" });
  const after = await snapshot(root);

  assert.deepEqual(after, before);
  assert.equal(harness.writes(), 0);
  assert.deepEqual(result.runs.map(({ runId, revision, lifecycleState, checkpoint, recoveryStatus }) => ({ runId, revision, lifecycleState, checkpoint, recoveryStatus })), [
    { runId: "RUN-RECOVER", revision: 1, lifecycleState: "gate-required", checkpoint: "GATE-1", recoveryStatus: "recovered" },
  ]);
  assert.deepEqual(result.diagnostics, [
    { code: "DESKTOP_RUN_UNREADABLE", message: "A persisted run is unreadable.", severity: "warning" },
    { code: "DESKTOP_RUN_CORRUPT", message: "A persisted run is corrupt or unreadable.", severity: "warning", runId: "RUN-CORRUPT" },
  ]);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("MCP exposes one closed read-only list command and rejects authority-bearing or malformed inputs", async () => {
  const store = createChatGptDesktopRunStore({ rootPath: await createRoot() });
  const harness = createHarness(store);
  const listed = await harness.server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const tool = listed.result.tools.find(({ name }) => name === "devrelay_list_runs");
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ["operation", "requestId"]);
  assert.equal(tool.inputSchema.additionalProperties, false);

  for (const args of [
    { operation: "list-runs", requestId: "REQ", route: "create-run" },
    { operation: "list-runs", requestId: "REQ", gateDecision: "approve" },
    { operation: "list-runs", requestId: "REQ", graphOperations: [] },
    { operation: "list-runs", requestId: "REQ", repair: true },
    { operation: "list-runs", requestId: "REQ", limit: 0 },
    { operation: "list-runs", requestId: "REQ", limit: 101 },
    { operation: "list-runs", requestId: "REQ", cursor: "malformed" },
  ]) {
    const response = await harness.rawCall(args);
    assert.equal(response.error.code, -32602);
  }
  assert.equal(harness.writes(), 0);
});

test("paginates at default, minimum, maximum, continuation, and terminal bounds", async () => {
  const timestamp = "2026-08-11T00:00:00.000Z";
  const runs = Array.from({ length: 101 }, (_, index) => ({
    runId: `RUN-${String(index).padStart(3, "0")}`, revision: 1, lifecycleState: "active", checkpoint: null,
    recoveryStatus: "current", createdAt: timestamp, updatedAt: timestamp,
  }));
  let writes = 0;
  const store = {
    listRuns: async () => ({ runs, diagnostics: [] }), load: async () => undefined, getArtifact: async () => undefined,
    commit: async () => { writes += 1; }, putArtifact: async () => { writes += 1; },
  };
  const harness = createHarness(store);
  const defaultPage = await harness.call({ operation: "list-runs", requestId: "REQ-DEFAULT" });
  assert.equal(defaultPage.runs.length, 50);
  assert.ok(defaultPage.nextCursor);
  const replay = await harness.call({ operation: "list-runs", requestId: "REQ-DEFAULT" });
  assert.equal(JSON.stringify(replay), JSON.stringify(defaultPage));

  const continuation = await harness.call({ operation: "list-runs", requestId: "REQ-NEXT", cursor: defaultPage.nextCursor, limit: 50 });
  assert.equal(continuation.runs.length, 50);
  const terminal = await harness.call({ operation: "list-runs", requestId: "REQ-LAST", cursor: continuation.nextCursor, limit: 1 });
  assert.deepEqual(terminal.runs.map(({ runId }) => runId), ["RUN-100"]);
  assert.equal("nextCursor" in terminal, false);
  assert.equal((await harness.call({ operation: "list-runs", requestId: "REQ-MIN", limit: 1 })).runs.length, 1);
  assert.equal((await harness.call({ operation: "list-runs", requestId: "REQ-MAX", limit: 100 })).runs.length, 100);
  assert.equal(writes, 0);
  assert.equal(harness.writes(), 0);
});

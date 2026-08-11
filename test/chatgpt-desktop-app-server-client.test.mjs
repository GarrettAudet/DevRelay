import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createChatGptDesktopAppServerClient } from "../src/chatgpt-desktop-app-server-client.mjs";

const ref = (artifactId) => ({ artifactId, digest: canonicalJsonDigest({ artifactId }) });

function operation(kind, overrides = {}) {
  return {
    operation: kind,
    runId: "RUN-001",
    workItemId: "WI-DESKTOP-APP-SERVER",
    attemptId: `ATT-${kind.toUpperCase()}-001`,
    taskContract: ref("TASK-CONTRACT-001"),
    ...overrides,
  };
}

async function fixtureTransport(name) {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  let buffer = "";
  input.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      messages.push(JSON.parse(buffer.slice(0, newline)));
      buffer = buffer.slice(newline + 1);
    }
  });
  const lines = (await readFile(new URL(`fixtures/chatgpt-desktop-app-server/${name}`, import.meta.url), "utf8")).trim().split("\n");
  let cursor = 0;
  const pumpResponse = () => {
    while (cursor < lines.length) {
      const message = JSON.parse(lines[cursor]);
      if (Object.hasOwn(message, "id") && message.id > messages.filter((entry) => Object.hasOwn(entry, "id")).length) break;
      output.write(`${lines[cursor++]}\n`);
    }
  };
  input.on("data", () => queueMicrotask(pumpResponse));
  return { transport: { input, output, close() { output.end(); } }, messages, pumpResponse };
}

test("starts one bounded task and preserves request, response, event, and identity evidence", async () => {
  const fixture = await fixtureTransport("start-complete.jsonl");
  const client = createChatGptDesktopAppServerClient({ transport: fixture.transport });
  fixture.pumpResponse();
  const start = operation("start", {
    workspacePath: "C:\\repos\\DevRelay",
    contextBundle: ref("CONTEXT-001"),
    permissionDemands: ["filesystem.read", "filesystem.write"],
  });
  const running = await client.startTask(start, { thread: { model: "gpt-test" } });
  assert.equal(running.outputs.state, "running");
  assert.equal(running.outputs.threadId, "thr_fixture");
  const terminal = await client.waitForTerminal(start.attemptId);
  assert.equal(terminal.outputs.state, "completed");
  assert.equal(terminal.outputs.turnId, "turn_fixture");
  assert.match(terminal.outputs.eventCheckpoint.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(terminal.outputs.terminalRawHandoff.digest, /^sha256:[0-9a-f]{64}$/u);
  const evidence = client.taskEvidence(start.attemptId);
  assert.equal(evidence.value.identity.workItemId, start.workItemId);
  assert.equal(evidence.value.requests.length, 2);
  assert.equal(evidence.value.responses.length, 2);
  assert.equal(evidence.value.events.at(-1).method, "turn/completed");
  assert.equal(client.assertBoundIdentity(start.attemptId, start), true);
  assert.throws(() => client.assertBoundIdentity(start.attemptId, { ...start, workItemId: "WI-OTHER" }), /does not match/u);
  client.close();
});

test("resumes a stored thread, starts a new turn, and maps interruption to cancellation", async () => {
  const fixture = await fixtureTransport("resume-cancel.jsonl");
  const client = createChatGptDesktopAppServerClient({ transport: fixture.transport });
  fixture.pumpResponse();
  const resume = operation("resume", { threadId: "thr_fixture" });
  const running = await client.resumeTask(resume);
  assert.equal(running.outputs.state, "running");
  const terminal = await client.waitForTerminal(resume.attemptId);
  assert.equal(terminal.outputs.state, "cancelled");
  assert.equal(terminal.outputs.turnId, "turn_resumed");
  assert.deepEqual(fixture.messages.filter((message) => message.method).map((message) => message.method), ["initialize", "initialized", "thread/resume", "turn/start"]);
  client.close();
});

test("cancellation sends turn/interrupt and waits for the terminal notification", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const sent = [];
  input.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").trim().split("\n")) {
      const message = JSON.parse(line); sent.push(message);
      if (message.id === 1) output.write('{"id":1,"result":{}}\n');
      if (message.method === "turn/interrupt") {
        output.write(`{"id":${message.id},"result":{}}\n`);
        queueMicrotask(() => output.write('{"method":"turn/completed","params":{"threadId":"thr_fixture","turn":{"id":"turn_fixture","status":"interrupted","items":[]}}}\n'));
      }
    }
  });
  const client = createChatGptDesktopAppServerClient({ transport: { input, output, close() { output.end(); } } });
  const cancel = operation("cancel", { threadId: "thr_fixture", turnId: "turn_fixture" });
  const running = await client.cancelTask(cancel);
  assert.equal(running.outputs.state, "running");
  assert.equal((await client.waitForTerminal(cancel.attemptId)).outputs.state, "cancelled");
  assert.equal(sent.find((message) => message.method === "turn/interrupt").params.turnId, "turn_fixture");
  client.close();
});

test("fails closed on JSON-RPC errors and duplicate attempt identities", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").trim().split("\n")) {
      const message = JSON.parse(line);
      if (message.id === 1) output.write('{"id":1,"result":{}}\n');
      if (message.method === "thread/start") output.write(`{"id":${message.id},"error":{"code":-32602,"message":"invalid cwd"}}\n`);
    }
  });
  const client = createChatGptDesktopAppServerClient({ transport: { input, output, close() { output.end(); } } });
  await assert.rejects(client.startTask(operation("start", { workspacePath: "C:\\bad", contextBundle: ref("CTX"), permissionDemands: [] })), /invalid cwd/u);
  client.close();
});

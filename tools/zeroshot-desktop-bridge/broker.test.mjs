import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createDesktopTaskPlan } from "../../src/desktop-task-adapter.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../../src/desktop-project-memory-bootstrap.mjs";
import { bind, claim, digest, protocol, publish, respond, status } from "./broker.mjs";

const workspace = fileURLToPath(new URL("../../", import.meta.url));
const revision = "a".repeat(40);
function fixture(t) {
  const queue = mkdtempSync(path.join(tmpdir(), "zeroshot-broker-fixture-"));
  t.after(() => rmSync(queue, { recursive: true, force: true }));
  const configuration = { protocol, runId: "fixture", workspace, submission: { source: { revision } } };
  publish(path.join(queue, "configuration.json"), configuration);
  const request = { protocol, requestId: "1", reference: { runId: "fixture", execution: 1, node: "worker" },
    configurationDigest: digest(Buffer.from(JSON.stringify(configuration))), workspace, role: "worker", prompt: "Fixture only: no agent was run.", deadlineUnixMs: Date.now() + 60000 };
  publish(path.join(queue, "requests/1.json"), request);
  publish(path.join(queue, "heartbeat.json"), { pid: process.pid, lastSeenUnixMs: Date.now() });
  const plan = createDesktopTaskPlan({ runId: "fixture", workItem: { id: "fixture-node-1" }, projectId: "devrelay", startingRevision: revision,
    worktreeLease: { apiVersion: "devrelay.dev/v1alpha1", kind: "WorktreeLease", attemptId: "fixture-execution-1", runId: "fixture", workItemId: "fixture-node-1", revision, workspace, status: "active", cleanupDisposition: "retain" },
    assignment: { profile: "fixture" }, executor: { id: "fixture" },
    promptArtifact: { artifactId: "FIXTURE-PROMPT", schema: "https://devrelay.dev/test/v1", mediaType: "text/plain", digest: digest(Buffer.from(request.prompt)), uri: "memory://fixture/prompt" },
    memoryBootstrap: loadDesktopProjectMemoryBootstrap({ projectRoot: workspace, taskId: "fixture-execution-1", repositoryRevision: revision }),
  });
  return { queue, plan, request };
}

test("claim, native observation and response are bound to exact memory and request", (t) => {
  const { queue, plan } = fixture(t);
  assert.equal(status(queue).requests[0].state, "pending");
  claim(queue, "1", plan);
  assert.equal(status(queue).requests[0].state, "reserved");
  assert.throws(() => claim(queue, "1", plan), /already reserved/);
  bind(queue, "1", "fixture-agent", { kind: "fixture", explicitlySimulated: true });
  assert.equal(status(queue).requests[0].state, "dispatched");
  assert.throws(() => respond(queue, "1", "wrong-agent", '{"response":null}'), /identity mismatch/);
  const result = respond(queue, "1", "fixture-agent", '{"response":null}');
  assert.equal(result.planDigest, plan.planDigest);
  assert.equal(result.response, null);
  assert.equal(status(queue).requests[0].state, "submitted");
  assert.deepEqual(respond(queue, "1", "fixture-agent", '{"response":null}'), result);
  assert.throws(() => respond(queue, "1", "fixture-agent", '{"response":true}'), /immutable record conflict/);
});

test("uncertain native dispatch cannot be bound to a replacement agent", (t) => {
  const { queue, plan } = fixture(t);
  claim(queue, "1", plan);
  bind(queue, "1", "original", { explicitlySimulated: true });
  assert.throws(() => bind(queue, "1", "replacement", { explicitlySimulated: true }), /immutable record conflict/);
});

test("plan mutation, request substitution, path escape and stale heartbeat fail closed", (t) => {
  const { queue, plan, request } = fixture(t);
  assert.throws(() => claim(queue, "../1", plan), /invalid request identity/);
  assert.throws(() => claim(queue, "1", { ...plan, planDigest: digest("wrong") }), /digest/i);
  writeFileSync(path.join(queue, "requests/1.json"), JSON.stringify({ ...request, prompt: "substituted" }));
  assert.throws(() => claim(queue, "1", plan), /exact request/);
  writeFileSync(path.join(queue, "requests/1.json"), JSON.stringify(request));
  writeFileSync(path.join(queue, "heartbeat.json"), JSON.stringify({ pid: process.pid, lastSeenUnixMs: 1 }));
  assert.throws(() => claim(queue, "1", plan), /heartbeat is stale/);
});

test("cancelled and terminal requests cannot dispatch or accept late results", (t) => {
  const { queue, plan } = fixture(t);
  claim(queue, "1", plan);
  bind(queue, "1", "fixture-agent", { explicitlySimulated: true });
  publish(path.join(queue, "cancelled/1.json"), { reason: "fixture cancellation" });
  assert.throws(() => respond(queue, "1", "fixture-agent", '{"response":null}'), /closed/);
  assert.equal(status(queue).requests[0].state, "reconcile");
  publish(path.join(queue, "terminal.json"), { result: "fixture terminal" });
  assert.throws(() => claim(queue, "1", plan), /closed/);
});

test("raw agent final is preserved and only the explicit response envelope is accepted", (t) => {
  const { queue, plan } = fixture(t);
  claim(queue, "1", plan);
  bind(queue, "1", "fixture-agent", { explicitlySimulated: true });
  for (const invalid of ["null", "[]", "{}", '{"response":null,"extra":true}', "not JSON"]) {
    assert.throws(() => respond(queue, "1", "fixture-agent", invalid));
  }
  respond(queue, "1", "fixture-agent", '{"response":null}');
  assert.equal(JSON.parse(readFileSync(path.join(queue, "finals/1.json"))).finalText, '{"response":null}');
});

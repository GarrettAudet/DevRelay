import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createChatGptDesktopLifecycleController } from "../src/chatgpt-desktop-lifecycle-controller.mjs";
import { createChatGptDesktopMcpServer } from "../src/chatgpt-desktop-mcp-server.mjs";
import { createChatGptDesktopRunStore } from "../src/chatgpt-desktop-run-store.mjs";

const digest = (value) => canonicalJsonDigest(value);
const ref = (artifactId, value) => ({ artifactId, digest: digest(value) });
const overview = { kind: "ProjectOverviewBaseline", purpose: "fixture" };
const policy = { kind: "ExecutionPolicy", grants: [] };
const output = (id) => ({ artifactId: id, digest: digest({ id }) });

async function fixture(stages, executeStage, options = {}) {
  const circuit = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLifecycleCircuit", stages };
  const values = new Map([[digest(circuit), circuit], [digest(overview), overview], [digest(policy), policy]]);
  const runStore = createChatGptDesktopRunStore({ rootPath: await mkdtemp(join(tmpdir(), "devrelay-lifecycle-")) });
  const controller = createChatGptDesktopLifecycleController({ runStore, loadArtifact: async (artifact) => values.get(artifact.digest), executeStage, ...options });
  const server = createChatGptDesktopMcpServer({ execute: controller.execute });
  let sequence = 0;
  const call = async (name, args) => {
    const result = await server.handle({ jsonrpc: "2.0", id: ++sequence, method: "tools/call", params: { name, arguments: args } });
    assert.equal(result.error, undefined, result.error?.message);
    return result.result.structuredContent;
  };
  const base = { requestId: "REQ-1", runId: "RUN-1", expectedRevision: 0 };
  const create = () => call("devrelay_create_run", { ...base, operation: "create-run", goal: "Build it", circuit: ref("CIRCUIT", circuit), projectOverview: ref("OVERVIEW", overview), policy: ref("POLICY", policy) });
  return { call, create, controller };
}

test("complete lifecycle executes every module and Gate in circuit order", async () => {
  const observed = [];
  const f = await fixture([{ id: "requirements", kind: "module" }, { id: "requirements-gate", kind: "gate" }, { id: "architecture", kind: "module" }], async ({ stage }) => {
    observed.push(stage.id);
    return { status: "completed", artifacts: [output(stage.id)] };
  });
  const result = await f.create();
  assert.equal(result.status, "completed");
  assert.deepEqual(observed, ["requirements", "requirements-gate", "architecture"]);
  assert.equal(result.artifacts.some((item) => item.artifactId === "architecture"), true);
});

test("Gate and clarification pauses require exact artifact-bound decisions", async () => {
  const gateCandidate = output("GATE-CANDIDATE");
  const clarification = output("CLARIFICATION");
  const f = await fixture([{ id: "requirements", kind: "module" }, { id: "gate", kind: "gate" }], async ({ stage, clarification: answer, gateDecision }) => {
    if (stage.id === "requirements" && !answer) return { status: "clarification-required", checkpoint: clarification };
    if (stage.id === "gate" && !gateDecision) return { status: "gate-required", checkpoint: gateCandidate, gateState: "pending" };
    return { status: "completed", artifacts: [output(stage.id)] };
  });
  const first = await f.create();
  assert.equal(first.status, "clarification-required");
  const second = await f.call("devrelay_submit_clarification", { operation: "submit-clarification", requestId: "REQ-2", runId: "RUN-1", expectedRevision: 1, checkpoint: clarification, answers: [{ questionId: "Q-1", answer: "Yes" }] });
  assert.equal(second.status, "gate-required");
  const third = await f.call("devrelay_submit_gate_decision", { operation: "submit-gate-decision", requestId: "REQ-3", runId: "RUN-1", expectedRevision: 2, gateCandidate, decision: "approve", approvalEvidence: output("APPROVAL") });
  assert.equal(third.status, "completed");
  assert.equal((await f.controller.inspectState("RUN-1")).approvals[0].artifactId, "APPROVAL");
});

test("blocked run resumes only from its exact checkpoint", async () => {
  const checkpoint = output("CHECKPOINT");
  let blocked = true;
  const f = await fixture([{ id: "work", kind: "module" }], async ({ resume }) => {
    if (blocked && !resume) return { status: "unable-to-proceed", checkpoint, diagnostics: [{ code: "WAIT", severity: "warning", message: "Waiting" }] };
    blocked = false;
    return { status: "completed", artifacts: [output("DONE")] };
  });
  const first = await f.create();
  assert.equal(first.status, "unable-to-proceed");
  const resumed = await f.call("devrelay_resume_run", { operation: "resume-run", requestId: "REQ-2", runId: "RUN-1", expectedRevision: 1, checkpoint, checkpointDigest: checkpoint.digest });
  assert.equal(resumed.status, "completed");
});

test("failure is persisted truthfully and a repeating frontier advances once per request", async () => {
  const failed = await fixture([{ id: "broken", kind: "module" }], async () => { throw new Error("adapter crashed"); });
  const result = await failed.create();
  assert.equal(result.status, "failed");
  assert.match(result.diagnostics[0].message, /adapter crashed/u);

  let calls = 0;
  const repeating = await fixture([{ id: "one", kind: "module" }, { id: "two", kind: "module" }], async ({ stage }) => ({ status: "completed", artifacts: [output(stage.id)], stop: ++calls === 1 }));
  const paused = await repeating.create();
  assert.equal(paused.status, "completed");
  assert.equal(paused.nextAction.kind, "progression-available");
  const completed = await repeating.call("devrelay_progress_run", { operation: "progress-run", requestId: "REQ-2", runId: "RUN-1", expectedRevision: 1, approvedPredecessor: output("one") });
  assert.equal(completed.status, "completed");
  assert.equal(calls, 2);
});

test("list-runs returns a read-only privacy-safe page", async () => {
  const f = await fixture([{ id: "work", kind: "module" }], async () => ({ status: "completed", artifacts: [output("SENSITIVE-PROMPT-CANARY")] }));
  await f.create();
  const first = await f.call("devrelay_list_runs", { operation: "list-runs", requestId: "REQ-LIST", limit: 1 });
  assert.equal(first.status, "completed");
  assert.equal(first.runs.length, 1);
  assert.equal(first.runs[0].runId, "RUN-1");
  assert.equal(first.runs[0].lifecycleState, "completed");
  assert.equal(JSON.stringify(first).includes("SENSITIVE-PROMPT-CANARY"), false);
  assert.equal((await f.controller.inspectState("RUN-1")).runId, "RUN-1");
});

test("list-runs defaults to 50 and uses a deterministic opaque cursor without writes", async () => {
  let writes = 0;
  const runs = Array.from({ length: 51 }, (_, index) => ({ runId: `RUN-${String(index).padStart(2, "0")}`, revision: 1, lifecycleState: "active", checkpoint: null, recoveryStatus: "current", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }));
  const runStore = {
    load: async () => undefined,
    listRuns: async () => ({ runs, diagnostics: [{ code: "PRIVATE-CANARY", message: "sensitive source bytes", severity: "error" }] }),
    commit: async () => { writes += 1; },
    putArtifact: async () => { writes += 1; },
    getArtifact: async () => undefined,
  };
  const controller = createChatGptDesktopLifecycleController({ runStore, loadArtifact: async () => undefined, executeStage: async () => undefined });
  const first = await controller.execute({ operation: "list-runs", requestId: "REQ-1" });
  const replay = await controller.execute({ operation: "list-runs", requestId: "REQ-1" });
  assert.equal(first.runs.length, 50);
  assert.equal(first.nextCursor, replay.nextCursor);
  assert.equal(JSON.stringify(first).includes("sensitive source bytes"), false);
  const second = await controller.execute({ operation: "list-runs", requestId: "REQ-2", cursor: first.nextCursor });
  assert.deepEqual(second.runs.map(({ runId }) => runId), ["RUN-50"]);
  assert.equal("nextCursor" in second, false);
  assert.equal(writes, 0);
});

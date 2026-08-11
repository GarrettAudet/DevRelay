import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createChatGptDesktopTaskSupervisor } from "../src/chatgpt-desktop-task-supervisor.mjs";

const load = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const ref = (artifactId) => ({ artifactId, digest: canonicalJsonDigest({ artifactId }) });

async function fixture(overrides = {}) {
  const [frontier, workDependencyBaseline, workBreakdownBaseline, specialistAssignmentBaseline, integratedCompletionFacts] = await Promise.all([
    load("dogfood/chatgpt-desktop-runtime/execution/ready-frontier-current.json"),
    load("project/work-dependency-baseline.json"),
    load("project/work-breakdown-baseline.json"),
    load("project/specialist-assignment-baseline.json"),
    load("dogfood/chatgpt-desktop-runtime/execution/integrated-completion-facts.json"),
  ]);
  const calls = [];
  frontier.readyWorkItemIds = ["WI-DESKTOP-TASK-SUPERVISOR"];
  frontier.dispositions = [{ status: "ready", workItemId: "WI-DESKTOP-TASK-SUPERVISOR" }];
  frontier.workDependencyBaseline.digest = canonicalJsonDigest(workDependencyBaseline);
  frontier.derivation.inputDigest = canonicalJsonDigest({ workDependencyBaseline: frontier.workDependencyBaseline, completionFacts: frontier.completionFacts });
  const frontierBody = Object.fromEntries(Object.entries(frontier).filter(([key]) => !["apiVersion", "kind", "frontierDigest"].includes(key)));
  frontier.frontierDigest = canonicalJsonDigest(frontierBody);
  const terminals = new Map();
  const appServerClient = {
    async startTask(operation) {
      calls.push(["start", structuredClone(operation)]);
      const outputs = { runId: operation.runId, workItemId: operation.workItemId, attemptId: operation.attemptId, threadId: `thread-${operation.workItemId}`, turnId: `turn-${operation.workItemId}`, state: "running", eventCheckpoint: ref("EVENT"), diagnostics: [] };
      terminals.set(operation.attemptId, { apiVersion: "devrelay.dev/v1alpha1", interfaceIntentId: "IF-DESKTOP-TASK-LIFECYCLE", inputs: operation, outputs: { ...outputs, state: "completed", terminalRawHandoff: ref("RAW") } });
      return { apiVersion: "devrelay.dev/v1alpha1", interfaceIntentId: "IF-DESKTOP-TASK-LIFECYCLE", inputs: operation, outputs };
    },
    async waitForTerminal(attemptId) { calls.push(["wait", attemptId]); return terminals.get(attemptId); },
    async cancelTask(operation) { calls.push(["cancel", structuredClone(operation)]); return { outputs: { ...operation, state: "running" } }; },
  };
  const persisted = [];
  return {
    calls, persisted,
    supervisor: createChatGptDesktopTaskSupervisor({ appServerClient, persist: async (value, kind) => persisted.push([kind, value]) }),
    input: {
      runId: "RUN-DESKTOP", workspacePath: "C:\\repos\\DevRelay", frontier, workDependencyBaseline, workBreakdownBaseline, specialistAssignmentBaseline, integratedCompletionFacts,
      taskContracts: { "WI-DESKTOP-TASK-SUPERVISOR": ref("TASK-SUPERVISOR") },
      attemptIds: { "WI-DESKTOP-TASK-SUPERVISOR": "ATT-SUPERVISOR-001" },
      permissionDemands: { "WI-DESKTOP-TASK-SUPERVISOR": ["filesystem.write", "filesystem.read"] },
      ...overrides,
    },
  };
}

function handoff(overrides = {}) {
  return {
    apiVersion: "devrelay.dev/v1alpha1", kind: "BootstrapWorkItemHandoff", executionId: "ATT-SUPERVISOR-001", workItemId: "WI-DESKTOP-TASK-SUPERVISOR", outcome: "pass",
    changedFiles: ["src/chatgpt-desktop-task-supervisor.mjs"], verification: [{ command: "node --check src/chatgpt-desktop-task-supervisor.mjs", exitCode: 0, summary: "passed" }],
    evidence: [{ kind: "chatgpt-desktop/task-supervision", relativePath: "test/chatgpt-desktop-task-supervisor.test.mjs", digest: canonicalJsonDigest({ evidence: true }) }], residualRisks: ["none"], notes: "bounded implementation", ...overrides,
  };
}

test("launches exactly one task for the exact Core frontier and persists identity before handoff", async () => {
  const data = await fixture();
  const bindings = await data.supervisor.superviseFrontier(data.input);
  assert.equal(bindings.length, 1);
  assert.equal(data.calls.filter(([kind]) => kind === "start").length, 1);
  assert.deepEqual(data.calls[0][1].permissionDemands, ["filesystem.read", "filesystem.write"]);
  assert.equal(data.persisted[0][0], "task-binding");
  assert.equal(data.persisted[0][1].threadId, "thread-WI-DESKTOP-TASK-SUPERVISOR");
  assert.equal(data.persisted[0][1].frontier.digest, data.input.frontier.frontierDigest);
});

test("launches a multi-item frontier deterministically and rejects duplicates or a stale DAG", async () => {
  const data = await fixture();
  const second = structuredClone(data.input.workBreakdownBaseline.workItems.find((item) => item.id === "WI-DESKTOP-TASK-SUPERVISOR"));
  second.id = "WI-Z";
  data.input.workBreakdownBaseline.workItems.push(second);
  data.input.specialistAssignmentBaseline.assignments.push({ ...data.input.specialistAssignmentBaseline.assignments.find((item) => item.workItemRef === "WI-DESKTOP-TASK-SUPERVISOR"), workItemRef: "WI-Z" });
  data.input.taskContracts["WI-Z"] = ref("TASK-Z"); data.input.attemptIds["WI-Z"] = "ATT-Z";
  data.input.workDependencyBaseline.nodes.push("WI-Z");
  data.input.frontier.readyWorkItemIds.push("WI-Z"); data.input.frontier.dispositions.push({ workItemId: "WI-Z", status: "ready" });
  data.input.frontier.workDependencyBaseline.digest = canonicalJsonDigest(data.input.workDependencyBaseline);
  data.input.frontier.derivation.inputDigest = canonicalJsonDigest({ workDependencyBaseline: data.input.frontier.workDependencyBaseline, completionFacts: data.input.frontier.completionFacts });
  const body = Object.fromEntries(Object.entries(data.input.frontier).filter(([key]) => !["apiVersion", "kind", "frontierDigest"].includes(key)));
  data.input.frontier.frontierDigest = canonicalJsonDigest(body);
  const launched = await data.supervisor.superviseFrontier(data.input);
  assert.deepEqual(launched.map((item) => item.workItemId), ["WI-DESKTOP-TASK-SUPERVISOR", "WI-Z"]);
  await assert.rejects(() => data.supervisor.superviseFrontier(data.input), /already launched/u);
  const stale = await fixture(); stale.input.frontier.workDependencyBaseline.digest = canonicalJsonDigest({ stale: true });
  await assert.rejects(() => stale.supervisor.superviseFrontier(stale.input), /digest validation|stale/u);
  const missing = await fixture(); delete missing.input.taskContracts["WI-DESKTOP-TASK-SUPERVISOR"];
  await assert.rejects(() => missing.supervisor.superviseFrontier(missing.input), /lacks exact work, assignment, or task contract context/u);
});

test("accepts only a closed identity-bound handoff and preserves its raw digest", async () => {
  const data = await fixture(); await data.supervisor.superviseFrontier(data.input);
  const raw = canonicalJson(handoff());
  const record = await data.supervisor.collectHandoff("ATT-SUPERVISOR-001", raw);
  assert.equal(record.handoff.outcome, "pass");
  assert.match(record.rawDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(data.persisted.at(-1)[0], "task-handoff");
  const replay = await data.supervisor.collectHandoff("ATT-SUPERVISOR-001", canonicalJson(handoff({ outcome: "fix" })));
  assert.deepEqual(replay, record);
  const invalid = await fixture(); await invalid.supervisor.superviseFrontier(invalid.input);
  await assert.rejects(() => invalid.supervisor.collectHandoff("ATT-SUPERVISOR-001", canonicalJson(handoff({ workItemId: "WI-CROSSED" }))), /identity/u);
});

test("cancellation remains bound to the persisted thread and turn", async () => {
  const data = await fixture(); await data.supervisor.superviseFrontier(data.input);
  await data.supervisor.cancelAttempt("ATT-SUPERVISOR-001");
  const operation = data.calls.find(([kind]) => kind === "cancel")[1];
  assert.equal(operation.threadId, "thread-WI-DESKTOP-TASK-SUPERVISOR");
  assert.equal(operation.turnId, "turn-WI-DESKTOP-TASK-SUPERVISOR");
  assert.equal(operation.workItemId, "WI-DESKTOP-TASK-SUPERVISOR");
});

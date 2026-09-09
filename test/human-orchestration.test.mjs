import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HUMAN_ORCHESTRATION_ACTIONS,
  HUMAN_ORCHESTRATION_ROUTES,
  createDesktopOrchestrationPlan,
  createHumanInterventionRequest,
  createHumanOrchestrationController,
  createHumanOrchestrationSourceBundle,
  createHumanOrchestrationView,
  renderHumanOrchestrationView,
  validateHumanOrchestrationArtifact,
  verifyHumanInterventionReceipt,
  verifyHumanInterventionRequest,
  verifyHumanOrchestrationView,
} from "../src/index.mjs";
import { documentValidators, validationDetail } from "../src/schema-validation.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const json = (relative) => JSON.parse(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"));
const plan = createDesktopOrchestrationPlan({
  runId: "RUN-HO-1",
  projectId: "devrelay",
  horizonDigest: digest("a"),
  startingRevision: "75c9b3a312d24bff967e5c652385f529ffab4db0",
  maxConcurrency: 2,
  workItems: [
    { id: "WI-HO-1", dependencies: [] },
    { id: "WI-HO-2", dependencies: ["WI-HO-1"] },
    { id: "WI-HO-3", dependencies: [] },
  ],
});
const run = (version = 4) => ({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "LocalHostRunState",
  runId: "desktop-orchestration:RUN-HO-1",
  version,
  state: {
    plan,
    workState: {
      "WI-HO-1": { status: "running", receipts: [{ id: "R-1" }] },
      "WI-HO-2": { status: "pending", receipts: [] },
      "WI-HO-3": { status: "pending", receipts: [] },
    },
    blockers: ["WI-HO-1:review-needed"],
    recovery: "operator-action-required",
  },
  artifactRefs: [],
});

test("publishes a valid independently versioned cross-cutting Module contract", () => {
  const module = json("examples/modules/human-orchestration.module.json");
  assert.equal(documentValidators.moduleDefinition(module), true, validationDetail(documentValidators.moduleDefinition));
  assert.equal(module.metadata.id, "human-orchestration");
  assert.equal(module.metadata.version, "0.1.0");
  assert.deepEqual(module.operations.map(({ id }) => id), ["project-operator-view", "request-intervention"]);
});

test("projects one deterministic operator view across agents, queue, quality, worktrees, approvals, and memory", () => {
  const bundle = createHumanOrchestrationSourceBundle({
    projectId: "devrelay",
    orchestrationRun: run(),
    taskObservations: [
      { taskId: "TASK-ROOT", workItemId: "WI-HO-1", role: "implementer", title: "Implement", status: "running" },
      { taskId: "TASK-REVIEW", parentTaskId: "TASK-ROOT", workItemId: "WI-HO-1", role: "reviewer", title: "Review", status: "ready", needsAttention: true },
    ],
    worktreeLeases: [{ attemptId: "ATT-HO-1", workItemId: "WI-HO-1", taskId: "TASK-ROOT", status: "active", workspace: "C:/worktrees/ho-1", observedRevision: plan.startingRevision }],
    memorySessions: [{ sessionId: "SESSION-HO-1", taskId: "TASK-ROOT", status: "active", conclusionStatus: "pending", baselineDigest: digest("b") }],
    approvals: [{ approvalId: "APP-HO-1", gateId: "work-item-verification-gate", workItemId: "WI-HO-1", status: "pending", summary: "Review evidence" }],
    qualityEvidence: [{ assessmentId: "QA-HO-1", workItemId: "WI-HO-1", kind: "QualityAssessment", disposition: "pass", evidenceDigest: digest("c") }],
  });
  const view = createHumanOrchestrationView(bundle);

  assert.equal(validateHumanOrchestrationArtifact(bundle), bundle);
  assert.equal(validateHumanOrchestrationArtifact(view), view);
  assert.equal(verifyHumanOrchestrationView(view), true);
  assert.deepEqual(view.frontier.workItemIds, ["WI-HO-3"]);
  assert.equal(view.queue.find(({ workItemId }) => workItemId === "WI-HO-2").disposition, "waiting-on-dependencies");
  assert.equal(view.tasks.find(({ taskId }) => taskId === "TASK-REVIEW").depth, 1);
  assert.deepEqual(view.attention, ["approval:APP-HO-1", "blocker:WI-HO-1:review-needed", "task:TASK-REVIEW"]);
  assert.equal(view.authority.taskMutation, false);
  assert.match(renderHumanOrchestrationView(view), /Work queue/u);
  assert.match(renderHumanOrchestrationView(view), /TASK-REVIEW/u);
  assert.match(renderHumanOrchestrationView(view), /typed requests only/u);
});

test("fails closed on task topology and source drift", () => {
  assert.throws(() => createHumanOrchestrationView({
    projectId: "devrelay",
    orchestrationRun: run(),
    taskObservations: [{ taskId: "TASK-CHILD", parentTaskId: "TASK-MISSING" }],
  }), /unresolved parent/u);
  const bundle = createHumanOrchestrationSourceBundle({ projectId: "devrelay", orchestrationRun: run() });
  assert.throws(() => createHumanOrchestrationView({ ...bundle, projectId: "substituted" }), /digest drifted/u);
});

test("routes typed human requests with optimistic concurrency and exact replay", async () => {
  const view = createHumanOrchestrationView({ projectId: "devrelay", orchestrationRun: run() });
  const request = createHumanInterventionRequest({
    runId: "RUN-HO-1",
    expectedStateVersion: view.stateVersion,
    snapshotDigest: view.viewDigest,
    requestedBy: "owner",
    requestedAt: "2026-09-10T00:00:00.000Z",
    action: "message",
    target: { kind: "task", id: "TASK-ROOT" },
    reason: "Provide the failing review evidence.",
    payload: { message: "Please attach the exact test receipt." },
  });
  let dispatches = 0;
  const controller = createHumanOrchestrationController({
    inspectRun: async () => run(),
    inspectView: async () => view,
    handlers: {
      "desktop-task-adapter": async (input) => {
        dispatches += 1;
        return { taskId: input.target.id, status: "delivered" };
      },
    },
  });
  const first = await controller.execute(request);
  const replay = await controller.execute(request);

  assert.equal(validateHumanOrchestrationArtifact(request), request);
  assert.equal(validateHumanOrchestrationArtifact(first.receipt), first.receipt);
  assert.equal(verifyHumanInterventionRequest(request), true);
  assert.equal(verifyHumanInterventionReceipt(first.receipt), true);
  assert.equal(first.receipt.outcome, "dispatched");
  assert.equal(first.receipt.authority, "observation-only");
  assert.equal(replay.replayed, true);
  assert.equal(replay.receipt.receiptDigest, first.receipt.receiptDigest);
  assert.equal(dispatches, 1);
});

test("stale, unsupported, and authority-routed requests never bypass their handler", async () => {
  const stale = createHumanInterventionRequest({
    runId: "RUN-HO-1",
    expectedStateVersion: 3,
    snapshotDigest: digest("d"),
    requestedBy: "owner",
    requestedAt: "2026-09-10T00:00:00.000Z",
    action: "cancel",
    target: { kind: "work-item", id: "WI-HO-1" },
    reason: "Stop this attempt.",
  });
  const currentView = createHumanOrchestrationView({ projectId: "devrelay", orchestrationRun: run() });
  const noHandlers = createHumanOrchestrationController({ inspectRun: async () => run(), inspectView: async () => currentView });
  assert.equal((await noHandlers.execute(stale)).receipt.outcome, "rejected-stale");

  const gate = createHumanInterventionRequest({
    runId: "RUN-HO-1",
    expectedStateVersion: 4,
    snapshotDigest: currentView.viewDigest,
    requestedBy: "owner",
    requestedAt: "2026-09-10T00:00:00.000Z",
    action: "approve",
    target: { kind: "gate", id: "architecture-gate" },
    reason: "Approve the reviewed candidate.",
    payload: { subjectDigest: digest("f") },
  });
  assert.equal(gate.route, "target-gate");
  assert.equal((await noHandlers.execute(gate)).receipt.outcome, "rejected-unsupported");
  assert.throws(() => createHumanInterventionRequest({ ...gate, action: "approve", target: { kind: "task", id: "TASK-ROOT" } }), /invalid target/u);
});

test("declares and validates every typed action at its bounded authority route", () => {
  const cases = [
    ["message", "task", { message: "Report exact status." }, "desktop-task-adapter"],
    ["pause", "run", {}, "desktop-orchestrator"],
    ["resume", "work-item", {}, "desktop-orchestrator"],
    ["cancel", "task", {}, "desktop-orchestrator"],
    ["retry", "work-item", {}, "desktop-orchestrator"],
    ["handoff", "task", { destination: "reviewer" }, "desktop-task-adapter"],
    ["approve", "gate", { subjectDigest: digest("1") }, "target-gate"],
    ["reject", "gate", { subjectDigest: digest("2") }, "target-gate"],
    ["reprioritize", "work-item", { priority: 7 }, "work-dependency-analysis"],
  ];
  assert.deepEqual(HUMAN_ORCHESTRATION_ACTIONS, cases.map(([action]) => action));
  for (const [action, kind, payload, route] of cases) {
    const request = createHumanInterventionRequest({
      runId: "RUN-HO-1",
      expectedStateVersion: 4,
      snapshotDigest: digest("3"),
      requestedBy: "owner",
      requestedAt: "2026-09-10T00:00:00.000Z",
      action,
      target: { kind, id: `TARGET-${action}` },
      reason: `Exercise ${action}.`,
      payload,
    });
    assert.equal(request.route, route);
    assert.equal(HUMAN_ORCHESTRATION_ROUTES[action], route);
    assert.equal(verifyHumanInterventionRequest(request), true);
  }
});

test("rejects same-version view drift before dispatch", async () => {
  const original = createHumanOrchestrationView({ projectId: "devrelay", orchestrationRun: run() });
  const drifted = createHumanOrchestrationView({
    projectId: "devrelay",
    orchestrationRun: run(),
    qualityEvidence: [{ assessmentId: "QA-DRIFT", workItemId: "WI-HO-1", disposition: "fail" }],
  });
  const request = createHumanInterventionRequest({
    runId: original.runId,
    expectedStateVersion: original.stateVersion,
    snapshotDigest: original.viewDigest,
    requestedBy: "owner",
    requestedAt: "2026-09-10T00:00:00.000Z",
    action: "pause",
    target: { kind: "run", id: original.runId },
    reason: "Pause the observed run.",
  });
  let dispatches = 0;
  const controller = createHumanOrchestrationController({
    inspectRun: async () => run(),
    inspectView: async () => drifted,
    handlers: { "desktop-orchestrator": async () => { dispatches += 1; } },
  });
  const result = await controller.execute(request);
  assert.equal(result.receipt.outcome, "rejected-stale");
  assert.equal(result.receipt.observation.diagnostic, "view-digest-drift");
  assert.equal(dispatches, 0);
});

test("does not add HumanOrchestration product routing to generic composition or Desktop Core", () => {
  for (const relative of ["../src/cross-cutting-composition.mjs", "../src/desktop-orchestration.mjs"]) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /human-orchestration|HumanOrchestration/u);
  }
});

test("projects 1,000 work items and 1,000 task observations within the bounded local target", () => {
  const workItems = Array.from({ length: 1000 }, (_, index) => ({ id: `WI-SCALE-${String(index).padStart(4, "0")}`, dependencies: [] }));
  const scalePlan = createDesktopOrchestrationPlan({
    runId: "RUN-HO-SCALE",
    projectId: "devrelay",
    horizonDigest: digest("9"),
    startingRevision: "75c9b3a312d24bff967e5c652385f529ffab4db0",
    maxConcurrency: 8,
    workItems,
  });
  const workState = Object.fromEntries(workItems.map(({ id }) => [id, { status: "pending", receipts: [] }]));
  const scaleRun = { kind: "LocalHostRunState", version: 1, state: { plan: scalePlan, workState, blockers: [], recovery: "clean" } };
  const bundle = createHumanOrchestrationSourceBundle({
    projectId: "devrelay",
    orchestrationRun: scaleRun,
    taskObservations: workItems.map(({ id }, index) => ({ taskId: `TASK-SCALE-${String(index).padStart(4, "0")}`, workItemId: id, status: "ready" })),
  });
  const started = performance.now();
  const view = createHumanOrchestrationView(bundle);
  const durationMilliseconds = performance.now() - started;
  assert.equal(view.queue.length, 1000);
  assert.equal(view.tasks.length, 1000);
  assert.equal(view.frontier.workItemIds.length, 8);
  assert.ok(durationMilliseconds <= 500, `projection took ${durationMilliseconds.toFixed(2)} ms`);
});

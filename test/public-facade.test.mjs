import assert from "node:assert/strict";
import test from "node:test";

import {
  DevRelayFacadeError,
  createDevRelay,
  createLocalHost,
  conclude,
  defineModule,
  definePlugin,
  inspect,
  resume,
  run,
  verify,
} from "../src/public-facade.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";

const digest = `sha256:${"a".repeat(64)}`;
function sessionReceipt(taskId, outcome = "pass") {
  const roadmapDisposition = outcome === "RoadmapNotInitialized" ? "RoadmapNotInitialized" : "initialized";
  const validatedBindings = outcome === "fail" ? [] : [
    "project-overview",
    "project-overview-projection",
    "lifecycle-status",
    ...(outcome === "pass" ? ["roadmap", "roadmap-projection"] : []),
  ].map((role) => ({ role, artifact: { artifactId: `CTX-${role}`, schema: "https://devrelay.dev/test/v1", mediaType: "application/json", digest, uri: `memory://devrelay/context/${role}` }, artifactVersion: "1.0.0" }));
  const material = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "SessionContextReceipt",
    receiptId: `SESSION-RECEIPT-${taskId}`,
    snapshot: {
      artifactId: `SESSION-${taskId}`,
      schema: "https://devrelay.dev/artifacts/session-context-snapshot/v1",
      mediaType: "application/vnd.devrelay.session-context-snapshot+json",
      digest,
      uri: `memory://devrelay/session/${taskId}.json`,
    },
    projectId: "PROJECT-1",
    taskId,
    workspaceId: "WORKSPACE-1",
    repositoryRevision: "a".repeat(40),
    roadmapDisposition,
    outcome,
    durationMs: 1,
    cache: "cold",
    validatedBindings,
    ...(outcome === "fail" ? { diagnostics: ["context digest mismatch"] } : {}),
    moduleExecutionAllowed: outcome !== "fail",
  };
  return { ...material, contentDigest: canonicalJsonDigest(material) };
}
function fixture({ bootstrapOutcome = "pass" } = {}) {
  const calls = [];
  const services = Object.fromEntries(["run", "resume", "verify", "inspect", "conclude"].map((operation) => [operation, async (input) => {
    calls.push({ operation, input });
    return { outcome: "pass", operation, artifacts: [{ artifactId: `${operation}-result`, digest }] };
  }]));
  services.bootstrap = async (input) => {
    calls.push({ operation: "bootstrap", input });
    return sessionReceipt(input.taskId, bootstrapOutcome);
  };
  const host = createLocalHost({ platform: "win32", services, grants: [{ kind: "process.spawn", values: ["node"] }] });
  const relay = createDevRelay({
    projectId: "PROJECT-1",
    host,
    profile: "standard",
    modules: [defineModule({ id: "requirements.gathering", version: "1.0.0", operations: ["gather"] })],
    plugins: [definePlugin({ id: "openspec.requirements", version: "1.0.0", capabilities: ["requirements.gather"] })],
  });
  return { relay, calls };
}

test("defines deterministic immutable modules and plugins", () => {
  assert.deepEqual(
    defineModule({ id: "requirements.gathering", version: "1.0.0", operations: ["gather"] }),
    defineModule({ id: "requirements.gathering", version: "1.0.0", operations: ["gather"] }),
  );
  assert.equal(Object.isFrozen(definePlugin({ id: "openspec.requirements", version: "1.0.0", capabilities: ["requirements.gather"] })), true);
});

test("createDevRelay resolves an exact profile and hides mutable internals", () => {
  const { relay } = fixture();
  assert.equal(relay.profile, "standard");
  assert.equal(relay.modules, undefined);
  assert.equal(relay.host, undefined);
  assert.match(relay.configurationDigest, /^sha256:/u);
});

test("run delegates a normalized provider-neutral request", async () => {
  const { relay, calls } = fixture();
  const result = await run(relay, { taskId: "TASK-1", goal: "Build the feature" });
  assert.equal(result.outputs.operation, "run");
  assert.equal(calls[0].operation, "bootstrap");
  assert.equal(calls[1].input.projectId, "PROJECT-1");
  assert.equal(calls[1].input.sessionContext.receipt.taskId, "TASK-1");
  assert.equal(result.interfaceIntentId, "IF-SIM-FACADE");
});

test("resume requires an exact checkpoint and rejects stale-shaped identity", async () => {
  const { relay } = fixture();
  await assert.rejects(() => resume(relay, { taskId: "TASK-1", runId: "RUN-1", checkpointDigest: "latest" }), /exact checkpoint/u);
  const result = await resume(relay, { taskId: "TASK-1", runId: "RUN-1", checkpointDigest: digest });
  assert.equal(result.outputs.operation, "resume");
});

test("verify requires an explicit subject", async () => {
  const { relay } = fixture();
  await assert.rejects(() => verify(relay, { taskId: "TASK-1", runId: "RUN-1" }), /subject/u);
  assert.equal((await verify(relay, { taskId: "TASK-1", runId: "RUN-1", subject: { artifactId: "A", digest } })).outputs.operation, "verify");
});

test("inspect is read-only delegation through the same stable envelope", async () => {
  const { relay } = fixture();
  const result = await inspect(relay, { taskId: "TASK-1", runId: "RUN-1" });
  assert.equal(result.outputs.operation, "inspect");
  assert.match(result.operationDigest, /^sha256:/u);
});

test("/conclude is an explicit Desktop operation bound to the bootstrapped task", async () => {
  const { relay, calls } = fixture();
  await assert.rejects(() => conclude(relay, { taskId: "TASK-1" }), /sessionId/u);
  const result = await conclude(relay, { taskId: "TASK-1", sessionId: "SESSION-1" });
  assert.equal(result.outputs.operation, "conclude");
  assert.equal(calls[0].operation, "bootstrap");
  assert.equal(calls[1].input.sessionContext.receipt.taskId, "TASK-1");
});

test("rejects invalid project, profile, host, module, and plugin", async () => {
  assert.throws(() => createDevRelay({ projectId: "", host: {} }), DevRelayFacadeError);
  assert.throws(() => createLocalHost({ platform: "linux", services: {} }), /Windows/u);
  assert.throws(() => defineModule({ id: "Bad", version: "1", operations: [] }), /identity/u);
  assert.throws(() => definePlugin({ id: "bad.plugin", version: "1.0.0", capabilities: [] }), /capabilities/u);
  const { relay } = fixture();
  await assert.rejects(() => relay.run({ taskId: "TASK-1", goal: "x", profile: "unknown" }), /unknown profile/u);
});

test("caller cannot substitute configured project or smuggle hidden grants", async () => {
  const { relay, calls } = fixture();
  await assert.rejects(() => relay.run({ taskId: "TASK-1", projectId: "OTHER", goal: "x" }), /does not match/u);
  await relay.run({ taskId: "TASK-1", goal: "x", grants: [{ kind: "network.connect", values: ["example.com"] }] });
  const runCall = calls.find(({ operation }) => operation === "run");
  assert.equal(runCall.input.host.hostDigest !== undefined, true);
  assert.equal(runCall.input.host.grants, undefined);
});
test("fresh DevRelay tasks bootstrap once and fail closed on invalid context", async () => {
  const { relay, calls } = fixture();
  await relay.run({ taskId: "TASK-A", goal: "first" });
  await relay.run({ taskId: "TASK-A", goal: "second" });
  await relay.run({ taskId: "TASK-B", goal: "third" });
  assert.equal(calls.filter(({ operation }) => operation === "bootstrap").length, 2);
  await assert.rejects(() => relay.run({ goal: "missing task identity" }), /taskId is required/u);
  const failed = fixture({ bootstrapOutcome: "fail" }).relay;
  await assert.rejects(() => failed.run({ taskId: "TASK-FAIL", goal: "blocked" }), /context digest mismatch/u);
});

test("RoadmapNotInitialized constrains execution to baseline establishment", async () => {
  const { relay, calls } = fixture({ bootstrapOutcome: "RoadmapNotInitialized" });
  await relay.inspect({ taskId: "TASK-ROADMAP", runId: "RUN-1" });
  const inspectCall = calls.find(({ operation }) => operation === "inspect");
  assert.equal(inspectCall.input.sessionContext.executionConstraint, "roadmap-baseline-establishment-only");
});
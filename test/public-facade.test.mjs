import assert from "node:assert/strict";
import test from "node:test";

import {
  DevRelayFacadeError,
  createDevRelay,
  createLocalHost,
  defineModule,
  definePlugin,
  inspect,
  resume,
  run,
  verify,
} from "../src/public-facade.mjs";

const digest = `sha256:${"a".repeat(64)}`;
function fixture() {
  const calls = [];
  const services = Object.fromEntries(["run", "resume", "verify", "inspect"].map((operation) => [operation, async (input) => {
    calls.push({ operation, input });
    return { outcome: "pass", operation, artifacts: [{ artifactId: `${operation}-result`, digest }] };
  }]));
  const host = createLocalHost({ services, grants: [{ kind: "process.spawn", values: ["node"] }] });
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
  const result = await run(relay, { goal: "Build the feature" });
  assert.equal(result.outputs.operation, "run");
  assert.equal(calls[0].input.projectId, "PROJECT-1");
  assert.equal(result.interfaceIntentId, "IF-SIM-FACADE");
});

test("resume requires an exact checkpoint and rejects stale-shaped identity", async () => {
  const { relay } = fixture();
  await assert.rejects(() => resume(relay, { runId: "RUN-1", checkpointDigest: "latest" }), /exact checkpoint/u);
  const result = await resume(relay, { runId: "RUN-1", checkpointDigest: digest });
  assert.equal(result.outputs.operation, "resume");
});

test("verify requires an explicit subject", async () => {
  const { relay } = fixture();
  await assert.rejects(() => verify(relay, { runId: "RUN-1" }), /subject/u);
  assert.equal((await verify(relay, { runId: "RUN-1", subject: { artifactId: "A", digest } })).outputs.operation, "verify");
});

test("inspect is read-only delegation through the same stable envelope", async () => {
  const { relay } = fixture();
  const result = await inspect(relay, { runId: "RUN-1" });
  assert.equal(result.outputs.operation, "inspect");
  assert.match(result.operationDigest, /^sha256:/u);
});

test("rejects invalid project, profile, host, module, and plugin", async () => {
  assert.throws(() => createDevRelay({ projectId: "", host: {} }), DevRelayFacadeError);
  assert.throws(() => createLocalHost({ platform: "linux", services: {} }), /Windows/u);
  assert.throws(() => defineModule({ id: "Bad", version: "1", operations: [] }), /identity/u);
  assert.throws(() => definePlugin({ id: "bad.plugin", version: "1.0.0", capabilities: [] }), /capabilities/u);
  const { relay } = fixture();
  await assert.rejects(() => relay.run({ goal: "x", profile: "unknown" }), /unknown profile/u);
});

test("caller cannot substitute configured project or smuggle hidden grants", async () => {
  const { relay, calls } = fixture();
  await assert.rejects(() => relay.run({ projectId: "OTHER", goal: "x" }), /does not match/u);
  await relay.run({ goal: "x", grants: [{ kind: "network.connect", values: ["example.com"] }] });
  assert.equal(calls[0].input.host.hostDigest !== undefined, true);
  assert.equal(calls[0].input.host.grants, undefined);
});

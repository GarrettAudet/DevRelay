// Real pinned engine, scripted response fixtures. These are not live agent evidence.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { configurationFor } from "./configuration.mjs";
import { digest, protocol, publish } from "./broker.mjs";

const executable = process.env.DEVRELAY_ZEROSHOT_BRIDGE;
if (!executable || !existsSync(executable)) throw new Error("Set DEVRELAY_ZEROSHOT_BRIDGE to the built native executable");
const graph = JSON.parse(readFileSync(new URL("./software-change.graph.json", import.meta.url)));
const workspace = fileURLToPath(new URL("../../", import.meta.url));
function setup(t, timeoutSeconds = 15) {
  const directory = mkdtempSync(path.join(tmpdir(), "zeroshot-engine-fixture-"));
  const queue = path.join(directory, "queue");
  const configuration = configurationFor({ graph, workspace, revision: "a".repeat(40), snapshotDigest: digest("explicit fixture"), runId: "engine-fixture", task: "Scripted protocol fixture; no agent executes this task.", timeoutSeconds });
  const configurationFile = path.join(directory, "configuration.json");
  writeFileSync(configurationFile, JSON.stringify(configuration));
  const children = [];
  t.after(async () => {
    for (const process of children) if (process.exitCode === null) process.kill();
    await delay(100);
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const start = (command = "run") => {
    const process = spawn(executable, [command, configurationFile, queue], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    children.push(process);
    let output = "";
    process.stdout.on("data", (chunk) => { output += chunk; });
    process.stderr.on("data", (chunk) => { output += chunk; });
    const completion = new Promise((resolve, reject) => {
      process.on("error", reject);
      process.on("close", (code) => resolve({ code, output }));
    });
    return { process, completion };
  };
  return { directory, queue, configuration, configurationFile, start };
}
async function waitFor(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await delay(25);
  }
  throw new Error("timed out waiting for engine evidence");
}
function requests(queue) {
  const folder = path.join(queue, "requests");
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => /^[0-9]+\.json$/u.test(name)).map((name) => {
    const bytes = readFileSync(path.join(folder, name));
    return { bytes, request: JSON.parse(bytes) };
  });
}
function submit(queue, { bytes, request }, response) {
  publish(path.join(queue, "responses", `${request.requestId}.json`), {
    protocol, requestDigest: digest(bytes), agentId: "scripted-fixture-agent", planDigest: digest("scripted plan fixture"), response,
  });
}

test("pinned engine runs its software-change reviews and repair loop, then replays without dispatch", async (t) => {
  const fx = setup(t);
  const engine = fx.start();
  const handled = new Set();
  const nodes = [];
  let rejected = false;
  const terminal = path.join(fx.queue, "terminal.json");
  await waitFor(() => {
    for (const request of requests(fx.queue)) {
      if (handled.has(request.request.requestId)) continue;
      handled.add(request.request.requestId);
      nodes.push(request.request.reference.node);
      let response = null;
      if (request.request.role === "verifier") {
        const reject = !rejected && request.request.reference.node === "code";
        rejected ||= reject;
        response = { output: null, signals: { verdict: reject ? "rejected" : "accepted" }, diagnostic: { message: reject ? "Fixture asks for one repair" : "Fixture accepted" } };
      }
      submit(fx.queue, request, response);
    }
    return existsSync(terminal);
  });
  assert.equal((await engine.completion).code, 0);
  assert.equal(JSON.parse(readFileSync(terminal)).result.status, "succeeded");
  assert.equal(nodes.filter((node) => node === "review_repair").length, 1);
  assert.equal(nodes.filter((node) => node === "code").length, 2);
  const replay = await fx.start().completion;
  assert.equal(replay.code, 0, replay.output);
  assert.doesNotMatch(replay.output, /desktop_request/);
  assert.equal(requests(fx.queue).length, handled.size);
});

test("invalid worker output cannot pass as success", async (t) => {
  const fx = setup(t);
  const engine = fx.start();
  const request = await waitFor(() => requests(fx.queue)[0]);
  submit(fx.queue, request, { wrong: "expected null" });
  const exit = await engine.completion;
  assert.equal(exit.code, 0, exit.output);
  assert.equal(JSON.parse(readFileSync(path.join(fx.queue, "terminal.json"))).result.status, "failed");
});

test("request timeout records cancellation and failed terminal", async (t) => {
  const fx = setup(t, 1);
  const exit = await fx.start().completion;
  assert.equal(exit.code, 0, exit.output);
  assert.equal(JSON.parse(readFileSync(path.join(fx.queue, "terminal.json"))).result.status, "failed");
  assert.equal(JSON.parse(readFileSync(path.join(fx.queue, "cancelled/1.json"))).reason, "timeout");
});

test("restart with an outstanding execution fails closed without a second dispatch", async (t) => {
  const fx = setup(t);
  const engine = fx.start();
  await waitFor(() => requests(fx.queue)[0]);
  engine.process.kill();
  await engine.completion;
  const restart = await fx.start().completion;
  assert.equal(restart.code, 0, restart.output);
  assert.doesNotMatch(restart.output, /desktop_request/);
  assert.equal(JSON.parse(readFileSync(path.join(fx.queue, "terminal.json"))).result.status, "failed");
  assert.equal(requests(fx.queue).length, 1);
});

test("connection and model overrides are rejected before queue effects", async (t) => {
  const fx = setup(t);
  fx.configuration.submission.runtime.nodes.worker.model = "unapproved-override";
  writeFileSync(fx.configurationFile, JSON.stringify(fx.configuration));
  const exit = await fx.start("validate").completion;
  assert.equal(exit.code, 1);
  assert.match(exit.output, /unsupported binding/);
  assert.equal(existsSync(fx.queue), false);
});

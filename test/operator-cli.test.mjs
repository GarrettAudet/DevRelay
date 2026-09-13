import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperatorCli,
  OPERATOR_COMMANDS,
  OPERATOR_EXIT_CODES,
  parseOperatorArguments,
} from "../src/operator-cli.mjs";

const calls = [];
const relay = Object.fromEntries(
  ["run", "resume", "verify", "inspect"].map((operation) => [
    operation,
    async (input) => {
      calls.push({ operation, input });
      return {
        outputs: {
          outcome: "pass",
          evidence: [
            { artifactId: "EV-1", digest: `sha256:${"a".repeat(64)}` },
          ],
        },
      };
    },
  ]),
);
const cli = createOperatorCli({
  relay,
  initialize: async () => ({ outcome: "initialized" }),
  evidence: async () => ({ outcome: "pass", secretToken: "do-not-print" }),
});

test("native host arguments require a complete exact configuration binding", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  assert.deepEqual(parseOperatorArguments(["init", "--host", "C:/project/host.json", "--host-digest", digest]).host, { path: "C:/project/host.json", digest });
  for (const flags of [["--host", "host.json"], ["--host-digest", digest], ["--host", "--json"], ["--host", "a", "--host", "b"], ["--host", "a", "--host-digest", "bad"]]) {
    assert.throws(() => parseOperatorArguments(["init", ...flags]), { code: "DR4770" });
  }
});

test("exposes the exact versioned command matrix and stable exit codes", () => {
  assert.deepEqual(OPERATOR_COMMANDS, [
    "init",
    "run",
    "resume",
    "status",
    "verify",
    "inspect",
    "evidence",
  ]);
  assert.equal(OPERATOR_EXIT_CODES.recovery, 6);
});

test("all seven commands produce deterministic JSON results", async () => {
  for (const command of OPERATOR_COMMANDS) {
    const result = await cli.execute({
      command,
      format: "json",
      input: command === "inspect" ? { subject: { kind: "graph" } } : {},
    });
    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout).command, command);
  }
});

test("status and inspect are read-only facade inspections", async () => {
  calls.length = 0;
  await cli.execute({ command: "status" });
  await cli.execute({ command: "inspect", input: { subject: { kind: "graph" } } });
  assert.deepEqual(
    calls.map(({ operation }) => operation),
    ["inspect", "inspect"],
  );
});

test("machine and human output retain evidence while secrets are redacted", async () => {
  const human = await cli.execute({ command: "run" });
  assert.match(human.stdout, /Evidence:/u);
  const machine = await cli.execute({ command: "evidence", format: "json" });
  assert.doesNotMatch(machine.stdout, /do-not-print/u);
  assert.match(machine.stdout, /REDACTED/u);
});

test("validation and recovery failures use stable nonzero codes", async () => {
  const failing = createOperatorCli({
    relay: {
      ...relay,
      resume: async () => {
        const error = new Error("checkpoint stale");
        error.code = "DR4741";
        throw error;
      },
    },
    initialize: async () => ({}),
    evidence: async () => ({}),
  });
  assert.equal((await failing.execute({ command: "resume" })).exitCode, 6);
  await assert.rejects(() => failing.execute({ command: "missing" }), /unsupported/u);
});

test("argument parser accepts canonical JSON and rejects malformed input", () => {
  assert.deepEqual(
    parseOperatorArguments(["run", "--json", "--input", '{"goal":"x"}']),
    { command: "run", version: "v1", input: { goal: "x" }, format: "json" },
  );
  assert.throws(
    () => parseOperatorArguments(["run", "--input", "{"]),
    /invalid JSON/u,
  );
});

test("missing or nested failure dispositions never become successful CLI results", async () => {
  for (const value of [undefined, null, {}, { outputs: {} }, { outputs: { status: "failed" } }]) {
    const invalid = createOperatorCli({
      relay,
      initialize: async () => value,
      evidence: async () => value,
    });
    const result = await invalid.execute({ command: "init", format: "json" });
    assert.notEqual(result.exitCode, 0);
    assert.notEqual(JSON.parse(result.stdout).outcome, "pass");
  }
  const nested = createOperatorCli({
    relay,
    initialize: async () => ({ outputs: { status: "initialized" } }),
    evidence: async () => ({ status: "completed" }),
  });
  assert.equal((await nested.execute({ command: "init" })).exitCode, 0);
});

test("a thrown host error cannot override the stable nonzero exit-code contract", async () => {
  for (const value of [0, -1, 256, 1.5, "0", null, undefined]) {
    const failed = async () => { const error = new Error("host rejected"); error.exitCode = value; throw error; };
    const operator = createOperatorCli({ relay, initialize: failed, evidence: failed });
    const result = await operator.execute({ command: "init", format: "json" });
    assert.equal(result.outcome, "failed");
    assert.equal(result.exitCode, OPERATOR_EXIT_CODES.validation);
    assert.equal(JSON.parse(result.stdout).exitCode, OPERATOR_EXIT_CODES.validation);
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { OPERATOR_COMMANDS, parseOperatorArguments } from "../src/operator-cli.mjs";

const executable = fileURLToPath(new URL("../bin/devrelay.mjs", import.meta.url));
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const invoke = (...argv) => {
  const result = spawnSync(process.execPath, [executable, ...argv], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
};

test("only the explicit version switch returns the package version", () => {
  const result = invoke("--version");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, "");
  assert.match(invoke("--help").stdout, /host binding/u);
  assert.equal(invoke("run", "--help").status, 0);
});

test("all unbound executable commands fail explicitly instead of reporting version success", () => {
  for (const command of OPERATOR_COMMANDS) {
    const result = invoke(command, "--json", "--input", "{}");
    assert.equal(result.status, 70, command);
    assert.equal(result.stderr, "");
    const body = JSON.parse(result.stdout);
    assert.equal(body.kind, "OperatorCommandResult");
    assert.equal(body.outcome, "failed");
    assert.equal(body.exitCode, result.status);
    assert.equal(body.diagnostics[0].code, "DR4771");
    assert.deepEqual(body.evidence, []);
  }
  assert.match(invoke("status").stderr, /host binding/u);
});

test("malformed executable input produces stable validation diagnostics without exposing input", () => {
  for (const argv of [
    [], ["unknown"], ["run", "extra"], ["run", "--bogus"],
    ["run", "--json", "--json"], ["run", "--input"],
    ["run", "--input", '{"secretToken":"MUST-NOT-LEAK"'],
    ["run", "--input", "null"], ["run", "--input", "[]"],
    ["run", "--input", "1"], ["run", "--input", '"text"'],
    ["run", "--input", "{}", "--input", "{}"],
    ["run", "--input", "--version"], ["run", "--version"],
  ]) {
    const result = invoke(...argv, "--json");
    assert.equal(result.status, 2, JSON.stringify(argv));
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /MUST-NOT-LEAK|SyntaxError|at file:/u);
    const body = JSON.parse(result.stdout);
    assert.equal(body.exitCode, 2);
    assert.equal(body.diagnostics[0].code, "DR4770");
  }
});

test("argument values cannot masquerade as switches and invalid argv is rejected", () => {
  assert.throws(() => parseOperatorArguments(["run", "--input", "--help"]));
  assert.throws(() => parseOperatorArguments(["run", null]));
  assert.throws(() => parseOperatorArguments("run"));
  assert.deepEqual(parseOperatorArguments(["run", "--input", '{"goal":"--version"}', "--json"]), {
    command: "run", version: "v1", input: { goal: "--version" }, format: "json",
  });
});

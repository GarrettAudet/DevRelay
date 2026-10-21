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

test("the explicit version switch returns the package version", () => {
  const result = invoke("--version");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, "");
});

for (const argv of [["--help"], ["run", "--help"], ["verify", "--help"]]) {
  test(`${argv.join(" ")} returns help without dispatching a command`, () => {
    const result = invoke(...argv);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /DevRelay commands: init run resume status verify inspect evidence/u);
    assert.notEqual(result.stdout, `${version}\n`);
    assert.equal(result.stderr, "");
  });
}

for (const command of OPERATOR_COMMANDS) {
  for (const flags of [[], ["--json"], ["--json", "--input", "{}"]]) {
    test(`${[command, ...flags].join(" ")} fails closed without a host instead of reporting version success`, () => {
      const result = invoke(command, ...flags);
      assert.equal(result.status, 70);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /requires a ChatGPT Desktop host binding/u);
    });
  }
}

test("the protocol version and a version-switch string in JSON are not package-version requests", () => {
  const argv = ["run", "--input", '{"goal":"--version"}', "--json"];
  assert.deepEqual(parseOperatorArguments(argv), {
    command: "run", version: "v1", input: { goal: "--version" }, format: "json",
  });
  const result = invoke(...argv);
  assert.equal(result.status, 70);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /requires a ChatGPT Desktop host binding/u);
});

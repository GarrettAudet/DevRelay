import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { materializeRequirementsChangeHostFixture } from "./desktop-requirements-change-host.mjs";

// Fixture preparation is source-side. Every product operation uses the actual
// installed executable in a new process; never an injected accepting host.
export function verifyInstalledRequirementsGate({ root, installedBin }) {
  assert.equal(process.platform, "win32");
  mkdirSync(root, { recursive: true });
  const fx = materializeRequirementsChangeHostFixture(root);
  const call = (command, input = fx.input) => {
    const child = spawnSync(process.execPath, [installedBin, command, "--json", "--host", fx.configurationPath,
      "--host-digest", fx.configurationDigest, "--input", JSON.stringify(input)],
    { encoding: "utf8", windowsHide: true, timeout: 60_000 });
    assert.ifError(child.error);
    const result = JSON.parse(child.stdout);
    assert.equal(child.status, result.exitCode, child.stdout);
    return result;
  };
  const output = (result) => result.result?.outputs ?? result.result;
  assert.equal(call("init").exitCode, 0);
  const pending = call("run");
  assert.equal(pending.exitCode, 5, JSON.stringify(pending));
  const waiting = output(pending);
  const response = fx.json("installed-change-response.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse",
    requestId: waiting.desktopRequest.requestId, requestDigest: canonicalJsonDigest(waiting.desktopRequest), result: fx.result });
  const completed = call("resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response });
  assert.equal(completed.exitCode, 0, JSON.stringify(completed));
  const gate = call("resume", { ...fx.input, checkpointDigest: output(completed).checkpointDigest, requirementsGate: fx.gate });
  assert.equal(gate.outcome, "awaiting-gate-activation", JSON.stringify(gate));
  const evidence = output(call("evidence"));
  const activateRequirementsGate = evidence.requirementsGate.commitDigest;
  const activated = call("resume", { ...fx.input, checkpointDigest: output(gate).checkpointDigest, activateRequirementsGate });
  assert.equal(activated.outcome, "requirements-activated", JSON.stringify(activated));
  assert.equal(output(activated).lifecycleComplete, false);
  const before = readFileSync(join(root, "state", "state.sqlite"));
  const verified = call("verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.equal(verified.exitCode, 0, JSON.stringify(verified));
  assert.ok(output(verified).requirementsActivation.applicationProof.receiptRef);
  assert.deepEqual(readFileSync(join(root, "state", "state.sqlite")), before);
  const replay = call("resume", { ...fx.input, checkpointDigest: output(activated).checkpointDigest, activateRequirementsGate });
  assert.equal(output(replay).version, output(activated).version);
  assert.deepEqual(output(call("evidence")).requirementsActivation, output(verified).requirementsActivation);
  return output(verified).requirementsActivation;
}

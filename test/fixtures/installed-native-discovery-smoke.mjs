import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { materializeNativeDiscoveryHostFixture } from "./desktop-native-discovery-host.mjs";

export function verifyInstalledNativeDiscovery({ root, installedBin }) {
  assert.equal(process.platform, "win32");
  const { fx, configured, source, invocation } = materializeNativeDiscoveryHostFixture(root);
  const call = (operation, input = configured.input) => {
    const child = spawnSync(process.execPath, [installedBin, operation, "--json", "--host", configured.configurationPath,
      "--host-digest", configured.configurationDigest, "--input", JSON.stringify(input)],
    { encoding: "utf8", windowsHide: true, timeout: 60_000 });
    assert.ifError(child.error);
    const result = JSON.parse(child.stdout);
    assert.equal(child.status, result.exitCode, child.stdout);
    return result;
  };
  const output = result => result.result?.outputs ?? result.result;
  assert.equal(call("init").exitCode, 0);
  const result = call("run");
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(output(result).state.pendingRequestId, null);
  assert.equal(output(result).state.status, "module-completed");
  const before = readFileSync(join(root, "state/state.sqlite"));
  const verified = call("verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(verified.exitCode, 0, JSON.stringify(verified));
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), before);
  fx.write(source.path, Buffer.from("export const changed = true;\n"));
  const replay = call("resume", { ...configured.input, checkpointDigest: output(result).checkpointDigest });
  assert.equal(replay.exitCode, 0, JSON.stringify(replay));
  assert.equal(output(replay).version, output(result).version);
  const changed = { ...invocation, invocationId: "installed-native-new", runId: "installed-native-new" };
  const rejected = call("run", { ...configured.input, runId: changed.runId, invocation: fx.json("native/new.json", changed) });
  assert.notEqual(rejected.exitCode, 0);
  assert.match(JSON.stringify(rejected), /declared source bytes drifted/);
}

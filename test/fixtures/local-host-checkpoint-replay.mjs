// This exercises actual Core/storage with a fixture adapter. It is deliberately
// not labeled as a live provider or complete installed-product acceptance test.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { createLocalHostStorage } from "../../src/local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "../../src/local-host-checkpoints.mjs";
import { assertVerifiedCheckpointReplayReceipt, createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";

const [rootDirectory, mode] = process.argv.slice(2);
if (!["execute", "replay"].includes(mode)) throw new Error("invalid fixture mode");
const bytes = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));
const json = (path) => JSON.parse(bytes(path));
const invocation = json("examples/invocations/requirements-openspec.invocation.json");
const result = json("examples/results/requirements-openspec.result.json");
const artifacts = new Map([
  ["goal-001", "examples/artifacts/goal-001.json"],
  ["project-context-001", "examples/artifacts/project-context-001.json"],
  ["repository-snapshot-001", "examples/artifacts/repository-snapshot-001.json"],
  ["requirements-draft-001", "examples/artifacts/requirements-draft-001.json"],
  ["project-overview-draft-001", "examples/artifacts/project-overview-draft-001.json"],
  ["native-source-openspec-001", "examples/artifacts/native-source-bundle-001.json"],
  ["project-overview-md-001", "examples/artifacts/ProjectOverview.md"],
  ["openspec-proposal-001", "examples/native/openspec/proposal.md"],
]);
let adapterCalls = 0;
const registry = createModuleRegistry({
  modules: [json("examples/modules/requirements-gathering.module.json")],
  plugins: [{
    definition: json("examples/plugins/openspec.plugin.json"),
    adapter: { async invoke() {
      if (mode === "replay") throw new Error("replay must not invoke the adapter");
      adapterCalls++;
      writeFileSync(join(rootDirectory, "adapter-calls.txt"), String(adapterCalls));
      return result;
    } },
  }],
  artifactContracts: requirementsRuntimeArtifactContracts(),
});
const storage = createLocalHostStorage({ rootDirectory });
try {
  const context = {
    artifacts: { async load(ref) {
      const path = artifacts.get(ref.artifactId);
      if (!path) throw new Error(`missing fixture artifact ${ref.artifactId}`);
      return bytes(path);
    } },
    checkpoints: createLocalHostCheckpointStore({ storage, namespace: "core/restart-proof" }),
  };
  if (mode === "execute") await registry.execute(invocation, context);
  const receipt = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, context));
  process.stdout.write(JSON.stringify({ adapterCalls, receiptKind: receipt.kind, resultDigest: canonicalJsonDigest(receipt.moduleResult) }));
} finally { storage.close(); }

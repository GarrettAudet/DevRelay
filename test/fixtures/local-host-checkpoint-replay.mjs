// This exercises actual Core/storage with a fixture adapter. It is deliberately
// not labeled as a live provider or complete installed-product acceptance test.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { createLocalHostStorage } from "../../src/local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "../../src/local-host-checkpoints.mjs";
import { assertVerifiedCheckpointReplayReceipt, createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { createLocalHostTraceabilityStore } from "../../src/local-host-traceability.mjs";
import { createTraceabilityGraphService } from "../../src/traceability-graph.mjs";
import { requirementsTraceabilityContributors } from "../../src/requirements-traceability-contributor.mjs";

const [rootDirectory, mode, graphMode] = process.argv.slice(2);
if (!["execute", "replay"].includes(mode)) throw new Error("invalid fixture mode");
if (graphMode && !["normal", "before-commit", "after-commit", "crash-before-commit", "crash-after-commit"].includes(graphMode)) throw new Error("invalid graph fixture mode");
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
const storage = createLocalHostStorage({ rootDirectory,
  // Controlled time proves that a crashed process's lease cannot be silently
  // stolen while active, and becomes recoverable only after its exact expiry.
  clock: () => mode === "execute" ? 1000 : 61000,
  failureInjector({ boundary, runId }) {
  if (mode === "execute" && graphMode === "crash-before-commit" && runId?.startsWith("local-traceability:") && boundary === "before-state-commit") process.exit(86);
  if (mode === "execute" && graphMode === "before-commit" && runId?.startsWith("local-traceability:") && boundary === "before-state-commit") throw new Error("fixture graph commit interruption");
} });
try {
  const context = {
    artifacts: { async load(ref) {
      const path = artifacts.get(ref.artifactId);
      if (!path) throw new Error(`missing fixture artifact ${ref.artifactId}`);
      return bytes(path);
    } },
    checkpoints: createLocalHostCheckpointStore({ storage, namespace: "core/restart-proof" }),
  };
  let record;
  let graph;
  let interrupted = false;
  let preparedUpdate;
  if (graphMode) {
    const graphStorage = {
      ...storage,
      commitTransition(request) {
        const committed = storage.commitTransition(request);
        if (mode === "execute" && graphMode === "crash-after-commit") process.exit(87);
        if (mode === "execute" && graphMode === "after-commit") throw new Error("fixture graph commit interruption");
        return committed;
      },
    };
    graph = createTraceabilityGraphService({
      graphId: "durable-restart-proof", projectId: "durable-restart-project",
      store: createLocalHostTraceabilityStore({ storage: graphStorage, namespace: "restart-proof", graphId: "durable-restart-proof" }),
      contributors: requirementsTraceabilityContributors,
    });
    const traceCheckpoints = createLocalHostCheckpointStore({ storage, namespace: "core/restart-proof/trace" });
    context.traceabilityGraph = graph;
    context.traceabilityCheckpoints = {
      ...traceCheckpoints,
      putIfAbsent(key, value) {
        const winner = traceCheckpoints.putIfAbsent(key, value);
        if (value.kind === "ModuleTraceabilityCheckpoint") preparedUpdate = winner.updateRef;
        return winner;
      },
    };
    try { record = await registry.executeWithTraceability(invocation, context); }
    catch (error) {
      if (mode !== "execute" || !error.message.includes("fixture graph commit interruption")) throw error;
      interrupted = true;
    }
  } else if (mode === "execute") await registry.execute(invocation, context);
  const receipt = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, context));
  process.stdout.write(JSON.stringify({
    adapterCalls, receiptKind: receipt.kind, resultDigest: canonicalJsonDigest(receipt.moduleResult),
    ...(graph ? {
      interrupted, graphRevision: graph.captureBase().revision, graphDigest: graph.captureBase().ref.digest,
      updateRef: record?.traceabilityUpdateRef ?? preparedUpdate,
      applicationProof: record?.applicationProof ?? null,
    } : {}),
  }));
} finally { storage.close(); }

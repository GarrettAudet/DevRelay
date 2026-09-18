import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { verifyLocalWorkDependencyRoute, verifyDependencyPredecessor, assertDependencyPredecessorCurrent } from "./local-work-dependency-planning.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { createWorkDependencyAnalysisRuntime } from "./work-dependency-runtime.mjs";
import { createNativeDependencyProposal } from "./work-dependency-native-proposer.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
export const LOCAL_NATIVE_DEPENDENCY_BINDING = Object.freeze({
  proposer: Object.freeze({ id: "native-structured-dependency-proposer", version: "0.1.0" }),
  reviewer: Object.freeze({ id: "devrelay.native-consistency-reviewer", version: "0.1.0" }),
  entrypoint: "devrelay/work_dependency/decision",
});

async function prepare({ binding, ...request }) {
  if (!binding || !same(binding, LOCAL_NATIVE_DEPENDENCY_BINDING)) throw new TypeError("dependency execution requires an explicit supported pinned native binding");
  const planned = await verifyLocalWorkDependencyRoute(request);
  const state = JSON.parse(planned.state.bytes);
  const refs = { workBreakdown: state.workBreakdownBaseline, projectOverview: state.projectOverviewBaseline,
    contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle };
  const inputs = Object.fromEntries(await Promise.all(Object.entries(refs).map(async ([key, ref]) => [key, await loadArtifactContent(ref, { load: request.loadArtifact })])));
  const executionId = `local-dependency-${canonicalJsonDigest({ invocation: request.checkpointReplay.invocation, state: planned.state.ref }).slice(7)}`;
  const inputBindings = [["work-breakdown-baseline", refs.workBreakdown], ["project-overview-baseline", refs.projectOverview],
    ["context-slice-set", refs.contextSliceSet], ["dependency-policy-bundle", refs.policyBundle]]
    .map(([role, artifact]) => ({ role, artifact })).sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
  const executionFingerprint = canonicalJsonDigest({ module: { id: "work-dependency-analysis", version: "0.1.0", operation: "analyze-dependencies" },
    executionId, bindings: inputBindings, ...binding });
  const predecessor = await verifyDependencyPredecessor(request);
  const runtime = createWorkDependencyAnalysisRuntime({ ...binding,
    proposer: { ...binding.proposer, propose(snapshot) {
      assertLocalWorkBaselineCurrent({ storage: request.storage, namespace: request.namespace, baseline: state.workBreakdownBaseline });
      assertLocalWorkContextCurrent({ storage: request.storage, namespace: request.namespace, boundary: request.boundary,
        state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
      assertDependencyPredecessorCurrent({ ...request, predecessor });
      return createNativeDependencyProposal(snapshot);
    } } });
  return { runtime, inputs, executionId, executionFingerprint,
    checkpoints: createLocalHostCheckpointStore({ storage: request.storage, namespace: `${request.namespace}/work-dependency-analysis` }) };
}

// Native policy evaluation and mechanical consistency review only; no model,
// network, shell, assignment, independent code review or Gate approval.
export async function executeLocalWorkDependencyPlanning(request) {
  const prepared = await prepare(request);
  const result = await prepared.runtime.execute({ ...prepared.inputs, executionId: prepared.executionId, checkpoints: prepared.checkpoints,
    resolveArtifact: ref => ref.mediaType === "application/wasm" ? loadArtifactBytes(ref, { load: request.loadArtifact }) : loadArtifactContent(ref, { load: request.loadArtifact }) });
  if (result.executionFingerprint !== prepared.executionFingerprint) throw new TypeError("dependency runtime identity differs from exact host binding");
  return result;
}

export async function verifyLocalWorkDependencyExecution({ execution, ...request }) {
  const prepared = await prepare(request);
  if (execution?.executionId !== prepared.executionId || execution?.executionFingerprint !== prepared.executionFingerprint) throw new TypeError("dependency execution identity differs from exact planning");
  const receipt = await prepared.runtime.verifyCheckpointedExecution({ executionId: prepared.executionId, executionFingerprint: prepared.executionFingerprint, checkpoints: prepared.checkpoints });
  const checkpoint = receipt.checkpoint;
  const expected = { executionId: prepared.executionId, executionFingerprint: prepared.executionFingerprint,
    checkpointKey: receipt.checkpointKey, replayed: execution.replayed, outcome: checkpoint.outcome,
    progressionAllowed: checkpoint.progressionAllowed, candidate: checkpoint.artifacts.candidate?.value,
    candidateRef: checkpoint.artifacts.candidate?.ref, diagnostics: checkpoint.diagnostics };
  // JSON persistence omits absent candidate fields on blocked outcomes.
  const persisted = value => JSON.parse(JSON.stringify(value));
  if (typeof execution.replayed !== "boolean" || !same(persisted(expected), persisted(execution))) throw new TypeError("dependency execution result differs from its durable checkpoint");
  return receipt;
}

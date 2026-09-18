import { canonicalJsonDigest } from "./content-digest.mjs";
import { verifyLocalContractPlanning } from "./local-contract-planning.mjs";
import { assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { createContractGenerationRuntime } from "./contract-generation-runtime.mjs";
import { createJsonSchemaContractBundle } from "./contract-format-registry.mjs";
import { assertLocalContractCurrentState } from "./local-contract-activation.mjs";

function runtimeFor(bindings, beforeGenerate) {
  if (!Array.isArray(bindings) || bindings.length !== 1 || canonicalJsonDigest(bindings[0]) !== canonicalJsonDigest({
    contractKind: "json-schema", id: "json-schema-contract-generator", version: "0.1.0",
  })) throw new TypeError("contract execution requires an explicit supported pinned generator binding");
  const binding = bindings[0];
  return createContractGenerationRuntime({ generators: { "json-schema": {
    id: binding.id, version: binding.version,
    generate: request => { beforeGenerate?.(); return createJsonSchemaContractBundle(request, { id: binding.id, version: binding.version }); },
  } } });
}

// This binding runs deterministic native generation only. It does not invoke
// Desktop models, network services, a shell or a provider-selected executable.
export async function executeLocalContractPlanning({ bindings, executionId, planning, ...request }) {
  const runtime = runtimeFor(bindings, () => assertLocalContractCurrentState({ storage: request.storage,
    namespace: request.namespace, state: planning.state.ref }));
  const verified = await verifyLocalContractPlanning({ ...request, planning });
  assertLocalArchitectureCurrentState({ storage: request.storage, namespace: request.namespace, state: verified.architectureActivation.state });
  if (verified.route.kind !== "module") throw new TypeError("not-applicable planning requires ContractGate, not generator execution");
  const decode = entry => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64"), value: JSON.parse(Buffer.from(entry.bytesBase64, "base64")) });
  const state = decode(verified.state);
  const architecture = decode(request.record.baseline);
  const overviewRef = state.value.projectOverviewBaseline;
  const bytes = Buffer.from(await request.loadArtifact(overviewRef));
  const projectOverview = { ref: overviewRef, bytes, value: JSON.parse(bytes) };
  const checkpoints = createLocalHostCheckpointStore({ storage: request.storage, namespace: `${request.namespace}/contract-generation` });
  return runtime.execute({ executionId, state, architecture, projectOverview, checkpoints });
}

export async function verifyLocalContractExecution({ storage, namespace, bindings, executionId, executionFingerprint }) {
  const runtime = runtimeFor(bindings);
  return runtime.verifyCheckpointedExecution({ executionId, executionFingerprint,
    checkpoints: createLocalHostCheckpointStore({ storage, namespace: `${namespace}/contract-generation` }) });
}

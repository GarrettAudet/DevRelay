import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalArchitectureActivation } from "./local-architecture-activation.mjs";
import { assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
import { deriveContractGenerationRoute } from "./contract-generation-runtime.mjs";
import { selectRequiredContractGenerationIntents } from "./contract-generation-intent-selection.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-contract-planning.schema.json"),
  ["local-architecture-activation.schema.json", "module-execution-record.schema.json", "module-result.schema.json", "local-discovery-activation.schema.json", "local-requirements-gate-commit.schema.json"].map(read));

// A deterministic handoff candidate, never ContractGate approval. The owning
// architecture Gate and exact activation are revalidated before deriving it.
// Existing contract baselines must be supplied explicitly; none is discovered
// from ambient files or conversation.
async function derivePlanning({ contractBaseline, ...request }, requireCurrent) {
  const activation = await verifyLocalArchitectureActivation(request);
  if (requireCurrent) assertLocalArchitectureCurrentState({ storage: request.storage, namespace: request.namespace, state: activation.state });
  const architecture = JSON.parse(Buffer.from(request.record.baseline.bytesBase64, "base64"));
  const requiredInterfaceIntentIds = selectRequiredContractGenerationIntents(architecture).map(entry => entry.id).sort();
  if (contractBaseline !== undefined) throw new TypeError("existing contract baseline planning requires an exact validated ContractGate lineage");
  const stateValue = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectContractState",
    stateId: `PCS-${request.record.commitDigest.slice(7).toUpperCase()}`,
    state: requiredInterfaceIntentIds.length ? "unbaselined" : "not-applicable",
    architectureBaseline: request.record.baseline.ref, projectOverviewBaseline: architecture.projectOverviewBaseline,
    requiredInterfaceIntentIds };
  const route = deriveContractGenerationRoute({ state: stateValue, architectureBaseline: architecture });
  const bytes = Buffer.from(canonicalJson(stateValue));
  const state = { artifactId: stateValue.stateId, schema: "https://devrelay.dev/artifacts/project-contract-state/v1",
    mediaType: "application/vnd.devrelay.project-contract-state+json", digest: sha256Digest(bytes),
    uri: `artifact://contract-planning/${request.record.commitDigest.slice(7)}/state` };
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalContractPlanning", architectureActivation: activation,
    state: { ref: state, bytesBase64: bytes.toString("base64"), byteLength: bytes.length }, route,
    scope: "contract-planning-candidate", lifecycleComplete: false };
  const planning = { ...body, planningDigest: canonicalJsonDigest(body) };
  if (!validate(planning)) throw new TypeError("contract planning violates its closed contract");
  return planning;
}

export async function prepareLocalContractPlanning(request) {
  return derivePlanning(request, true);
}

// Historical evidence remains verifiable after a later architecture activation.
// This never grants permission to start work from that superseded planning state.
export async function verifyLocalContractPlanning({ planning, ...request }) {
  if (!validate(planning)) throw new TypeError("stored contract planning violates its closed contract");
  const expected = await derivePlanning(request, false);
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(planning)) throw new TypeError("stored contract planning differs from its exact derivation");
  return expected;
}

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { verifyLocalArchitectureActivation } from "./local-architecture-activation.mjs";
import { assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
import { assertLocalContractCurrentState, verifyLocalContractActivation, verifyLocalContractsNotApplicableActivation } from "./local-contract-activation.mjs";
import { validateProjectWorkBreakdownStateAgainstInputs, validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const decode = entry => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64"), value: JSON.parse(Buffer.from(entry.bytesBase64, "base64")) });

// Initial planning only. This candidate is not a WorkBreakdown result or Gate
// approval. Capability and repository inputs must be supplied explicitly.
async function deriveState({ capabilityCatalog, repositoryContext,
  contractGate, contractReplayReceipt, notApplicableCommit, planning, ...request }, current) {
  if (Boolean(contractGate) === Boolean(notApplicableCommit)) throw new TypeError("work planning requires exactly one approved contract path");
  if (notApplicableCommit && contractReplayReceipt) throw new TypeError("no-contract planning cannot carry a generator receipt");
  if (!capabilityCatalog || !repositoryContext) throw new TypeError("work planning requires explicit capability catalog and repository context");
  const architecture = await verifyLocalArchitectureActivation(request);
  if (current) assertLocalArchitectureCurrentState({ storage: request.storage, namespace: request.namespace, state: architecture.state });
  const contract = contractGate
    ? await verifyLocalContractActivation({ storage: request.storage, namespace: request.namespace, graph: request.graph,
      record: contractGate, replayReceipt: contractReplayReceipt, loadArtifact: request.loadArtifact })
    : await verifyLocalContractsNotApplicableActivation({ ...request, planning, commit: notApplicableCommit });
  if (current) assertLocalContractCurrentState({ storage: request.storage, namespace: request.namespace, state: contract.state });
  const contractState = JSON.parse(request.storage.getArtifact(contract.storedState));
  const baseline = decode(request.record.baseline);
  if (!same(contractState.architectureBaseline, baseline.ref) || !same(contractState.projectOverviewBaseline, baseline.value.projectOverviewBaseline)) throw new TypeError("work planning contract activation has different architecture lineage");
  const disposition = decode((contractGate ?? notApplicableCommit).disposition);
  const load = ref => loadArtifactContent(ref, { load: request.loadArtifact });
  const loadedInputs = {
    "requirements-baseline": [await load(baseline.value.requirementsBaseline)],
    "project-overview-baseline": [await load(baseline.value.projectOverviewBaseline)],
    "architecture-baseline": [baseline], "contract-disposition": [disposition],
    "capability-catalog": [await load(capabilityCatalog)], "repository-context": [await load(repositoryContext)],
  };
  const repository = loadedInputs["repository-context"][0];
  const architectureRepository = request.checkpointReplay.loadedInputs["repository-snapshot"]?.[0];
  if (architectureRepository && !same(architectureRepository.ref, repository.ref)) throw new TypeError("work repository context differs from approved architecture execution");
  if (repository.value.kind === "RepositorySnapshot") validateRequirementsArtifact(repository.value);
  else {
    validateWorkBreakdownArtifact(repository.value, { ref: repository.ref });
    for (const ref of repository.value.approvalEvidence ?? []) await loadArtifactBytes(ref, { load: request.loadArtifact });
  }
  const binding = {
    requirementsBaseline: baseline.value.requirementsBaseline, projectOverviewBaseline: baseline.value.projectOverviewBaseline,
    architectureBaseline: baseline.ref, contractDisposition: disposition.ref, capabilityCatalog, repositoryContext,
  };
  const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectWorkBreakdownState",
    stateId: `PWBS-${canonicalJsonDigest({ architecture, contract, binding }).slice(7).toUpperCase()}`, state: "unbaselined", ...binding };
  validateProjectWorkBreakdownStateAgainstInputs({ state, operation: "establish-breakdown", loadedInputs });
  const bytes = Buffer.from(canonicalJson(state));
  const ref = { artifactId: state.stateId, schema: "https://devrelay.dev/artifacts/project-work-breakdown-state/v1",
    mediaType: "application/vnd.devrelay.project-work-breakdown-state+json", digest: sha256Digest(bytes),
    uri: `artifact://work-breakdown-planning/${state.stateId}` };
  return { ref, bytes, architectureState: architecture.state, contractState: contract.state };
}

export async function prepareLocalWorkBreakdownState(request) { return deriveState(request, true); }

async function deriveRoute({ registry, ...request }, current) {
  const state = await deriveState(request, current);
  const route = await registry.selectOperation({ id: "work-breakdown", version: "0.1.0" }, state.ref,
    { artifacts: { load: ref => same(ref, state.ref) ? state.bytes : request.loadArtifact(ref) } });
  if (route.selection.kind !== "operation" || route.selection.operation !== "establish-breakdown") throw new TypeError("initial work planning did not select baseline establishment");
  return { state, route };
}

export async function prepareLocalWorkBreakdownRoute(request) { return deriveRoute(request, true); }

// Historical observation never authorizes a fresh invocation from superseded state.
export async function verifyLocalWorkBreakdownRoute({ expectedState, ...request }) {
  const result = await deriveRoute(request, false);
  if (!same(result.state.ref, expectedState?.ref) || !result.state.bytes.equals(Buffer.from(expectedState.bytes))) throw new TypeError("historical work state differs from exact derivation");
  return result;
}

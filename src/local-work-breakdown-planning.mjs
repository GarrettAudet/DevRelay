import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { verifyLocalArchitectureActivation } from "./local-architecture-activation.mjs";
import { assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
import { assertLocalContractCurrentState, verifyLocalContractActivation, verifyLocalContractsNotApplicableActivation } from "./local-contract-activation.mjs";
import { validateProjectWorkBreakdownStateAgainstInputs, validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";
import { resolveVerifiedArchitectureModelContent } from "./architecture-artifact-validator.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const decode = entry => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64"), value: JSON.parse(Buffer.from(entry.bytesBase64, "base64")) });

// Archived publication remains valid after the live head advances.
export const workHeadId = namespace => `work-baseline-head:${canonicalJsonDigest({ namespace })}`;
export async function verifyWorkPredecessor({ storage, namespace, currentWorkBreakdownBaseline, loadArtifact }) {
  if (currentWorkBreakdownBaseline === undefined) return null;
  const loaded = await loadArtifactContent(currentWorkBreakdownBaseline, { load: loadArtifact });
  validateWorkBreakdownArtifact(loaded.value, { ref: loaded.ref });
  if (loaded.value.kind !== "WorkBreakdownBaseline") throw new TypeError("work predecessor must be a WorkBreakdownBaseline");
  const rows = storage.readTransitionJournal(workHeadId(namespace)).filter(row =>
    row.transition.kind === "WorkBaselineActivated" && same(row.transition.baseline, loaded.ref));
  if (rows.length !== 1) throw new TypeError("work predecessor publication is missing or ambiguous");
  const row = rows[0], digest = row.transition.commitDigest;
  if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest) ||
      !same(row.transition, { id: digest, kind: "WorkBaselineActivated", commitDigest: digest, baseline: loaded.ref }) ||
      row.artifactRefs.length !== 1) throw new TypeError("work predecessor publication differs");
  const stored = row.artifactRefs[0];
  if (stored.artifactId !== loaded.ref.artifactId || stored.digest !== loaded.ref.digest || stored.mediaType !== loaded.ref.mediaType ||
      stored.byteCount !== loaded.bytes.length || !Buffer.from(storage.getArtifact(stored)).equals(loaded.bytes)) throw new TypeError("work predecessor stored bytes differ");
  return { ...loaded, activationDigest: digest };
}
export function assertWorkPredecessorCurrent({ storage, namespace, predecessor }) {
  let head;
  try { head = storage.readRun(workHeadId(namespace)); }
  catch (error) { if (error.code === "DR4920" && !predecessor) return; throw error; }
  if (head.state.kind !== "LocalWorkBaselineHead" || !same(head.state.baseline, predecessor?.ref ?? null) ||
      head.state.activationDigest !== (predecessor?.activationDigest ?? null) || head.state.pendingCommit !== null) {
    throw new TypeError("work predecessor is missing, stale or has a pending Gate");
  }
}

async function validateChangeLineage({ change, prior, loadedInputs, loadArtifact }) {
  const mapping = { requirementsBaseline: "requirements-baseline", projectOverviewBaseline: "project-overview-baseline",
    architectureBaseline: "architecture-baseline", contractDisposition: "contract-disposition" };
  for (const [property, port] of Object.entries(mapping)) {
    const bindings = prior.value.inputBindings.filter(entry => entry.role === port);
    if (bindings.length !== 1 || !same(change.value.preChange[property], bindings[0].artifact) ||
        !same(change.value.target[property], loadedInputs[port][0].ref)) throw new TypeError("work change upstream lineage differs");
  }
  const repository = loadedInputs["current-repository-snapshot"][0];
  if (!same(change.value.currentWorkBreakdownBaseline, prior.ref) || !same(change.value.currentRepository.artifact, repository.ref) ||
      change.value.currentRepository.revision !== repository.value.revision || change.value.currentRepository.treeDigest !== repository.value.treeDigest) {
    throw new TypeError("work change predecessor or current repository differs");
  }
  for (const ref of [...change.value.approvalEvidence, change.value.approvedRequirementsChange,
    change.value.approvedArchitectureChange, change.value.approvedContractChangeDisposition]) await loadArtifactBytes(ref, { load: loadArtifact });
  // The Module revalidates scope at candidate validation. This host preflight
  // rejects unknown scope before publishing an executable context.
  const architecture = loadedInputs["architecture-baseline"][0].value;
  const section = architecture.sections.architectureModel;
  const attachment = section.mode === "attached" ? await loadArtifactContent(section.artifact, { load: loadArtifact }) : undefined;
  const model = resolveVerifiedArchitectureModelContent(architecture, { resolveAttached: () => attachment });
  const allowed = {
    acceptanceCriteria: new Set(loadedInputs["requirements-baseline"][0].value.requirements.acceptanceCriteria.map(item => item.id)),
    architecture: new Set(model.elements.map(item => item.id)),
    contracts: new Set((loadedInputs["contract-disposition"][0].value.contractTargets ?? []).map(item => item.id)),
  };
  const coverageKeys = { "acceptance-criterion": "acceptanceCriteria", architecture: "architecture", contract: "contracts" };
  for (const entry of prior.value.coverageDispositions) allowed[coverageKeys[entry.scopeKind]].add(entry.scopeRef);
  for (const item of prior.value.workItems) for (const [key, field] of [["acceptanceCriteria", "acceptance-criterion-refs"], ["architecture", "architecture-refs"], ["contracts", "contract-refs"]]) {
    for (const id of item[field]) allowed[key].add(id);
  }
  for (const [key, ids] of Object.entries(change.value.authorizedScope)) {
    if (ids.some(id => !allowed[key].has(id))) throw new TypeError("work change authorizes unknown scope");
  }
}

// Host composition only; the owning Gate retains promotion authority.
async function deriveState({ capabilityCatalog, repositoryContext,
  contractGate, contractReplayReceipt, notApplicableCommit, planning, currentWorkBreakdownBaseline, approvedChangePackage, ...request }, current) {
  if (Boolean(contractGate) === Boolean(notApplicableCommit)) throw new TypeError("work planning requires exactly one approved contract path");
  if (notApplicableCommit && contractReplayReceipt) throw new TypeError("no-contract planning cannot carry a generator receipt");
  if (!capabilityCatalog || !repositoryContext) throw new TypeError("work planning requires explicit capability catalog and repository context");
  if (Boolean(currentWorkBreakdownBaseline) !== Boolean(approvedChangePackage)) throw new TypeError("work change requires both explicit predecessor and ApprovedChangePackage");
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
  const predecessor = await verifyWorkPredecessor({ ...request, currentWorkBreakdownBaseline });
  if (current) assertWorkPredecessorCurrent({ ...request, predecessor });
  const operation = predecessor ? "decompose-change" : "establish-breakdown";
  const repository = loadedInputs["repository-context"][0];
  if (predecessor) {
    loadedInputs["current-repository-snapshot"] = loadedInputs["repository-context"];
    delete loadedInputs["repository-context"];
    loadedInputs["current-work-breakdown-baseline"] = [predecessor];
    loadedInputs["approved-change-package"] = [await load(approvedChangePackage)];
  }
  const architectureRepository = request.checkpointReplay.loadedInputs["repository-snapshot"]?.[0];
  if (!predecessor && architectureRepository && !same(architectureRepository.ref, repository.ref)) throw new TypeError("work repository context differs from approved architecture execution");
  if (repository.value.kind === "RepositorySnapshot") validateRequirementsArtifact(repository.value);
  else {
    validateWorkBreakdownArtifact(repository.value, { ref: repository.ref });
    for (const ref of repository.value.approvalEvidence ?? []) await loadArtifactBytes(ref, { load: request.loadArtifact });
  }
  const binding = {
    requirementsBaseline: baseline.value.requirementsBaseline, projectOverviewBaseline: baseline.value.projectOverviewBaseline,
    architectureBaseline: baseline.ref, contractDisposition: disposition.ref, capabilityCatalog,
    ...(predecessor ? { currentRepositorySnapshot: repositoryContext, currentWorkBreakdownBaseline, approvedChangePackage } : { repositoryContext }),
  };
  const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectWorkBreakdownState",
    stateId: `PWBS-${canonicalJsonDigest({ architecture, contract, binding }).slice(7).toUpperCase()}`, state: predecessor ? "baselined" : "unbaselined", ...binding };
  validateProjectWorkBreakdownStateAgainstInputs({ state, operation, loadedInputs });
  if (predecessor) await validateChangeLineage({ change: loadedInputs["approved-change-package"][0], prior: predecessor, loadedInputs, loadArtifact: request.loadArtifact });
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
  if (route.selection.kind !== "operation" || route.selection.operation !== (request.currentWorkBreakdownBaseline ? "decompose-change" : "establish-breakdown")) throw new TypeError("work planning route differs from exact derived state");
  return { state, route };
}

export async function prepareLocalWorkBreakdownRoute(request) { return deriveRoute(request, true); }

// Historical observation never authorizes a fresh invocation from superseded state.
export async function verifyLocalWorkBreakdownRoute({ expectedState, ...request }) {
  const result = await deriveRoute(request, false);
  if (!same(result.state.ref, expectedState?.ref) || !result.state.bytes.equals(Buffer.from(expectedState.bytes))) throw new TypeError("historical work state differs from exact derivation");
  return result;
}

import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactBytes, loadArtifactContent } from "./artifact-runtime.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { validateArchitectureArtifact } from "./architecture-artifact-validator.mjs";
import { loadArchitectureDiscoveryInterpretation } from "./architecture-discovery-interpretation.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const schema = read("architecture-discovery-owner-approval.schema.json");
const validateApproval = compileArtifactSchema(schema, [read("module-result.schema.json")]);
const validateCommit = compileArtifactSchema(read("architecture-discovery-gate-commit.schema.json"), [read("module-result.schema.json")]);
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = message => { throw new TypeError(`architecture discovery Gate: ${message}`); };
const sameSet = (left, right) => same(left.map(canonicalJson).sort(), right.map(canonicalJson).sort());
const frozen = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
};

// Preparation only: the host must durably persist this exact commit and then
// separately activate its next state. No ArchitectureBaseline or approved
// intended-design graph facts are created by observational discovery approval.
export async function prepareArchitectureDiscoveryGate({ checkpointReplay, interpretationRef, ownerApprovalRef, loadArtifact }) {
  const replay = assertVerifiedCheckpointReplayReceipt(checkpointReplay);
  if (!same(replay.invocation.module, { id: "architecture-discovery", version: "0.1.1", operation: "discover" }) ||
      replay.moduleResult.status !== "completed" || replay.moduleResult.outcome !== "discovered") fail("requires completed exact ArchitectureDiscovery 0.1.1 replay");
  if ((replay.moduleResult.diagnostics ?? []).some(entry => entry.severity === "error") ||
      (replay.moduleResult.evidence ?? []).some(entry => entry.status !== "pass")) fail("discovery retains unsuccessful evidence");
  const loaded = await loadArchitectureDiscoveryInterpretation({ interpretationRef, loadArtifact });
  const candidate = loaded.interpretation.value;
  const output = replay.loadedOutputs["current-architecture-snapshot"];
  if (output?.length !== 1 || !same(output[0].ref, candidate.discoverySnapshot)) fail("interpretation substitutes Core discovery output");
  for (const [port, ref] of [["project-architecture-state", candidate.projectArchitectureState], ["requirements-baseline", candidate.requirementsBaseline], ["project-overview-baseline", candidate.projectOverviewBaseline]]) {
    const inputs = replay.loadedInputs[port];
    if (inputs?.length !== 1 || !same(inputs[0].ref, ref)) fail("interpretation substitutes Core input context");
  }
  if (candidate.observations.some(entry => entry.disposition === "unresolved")) fail("unresolved observations require clarification");
  if (loaded.closure.gaps.some(entry => entry.value.material) || loaded.structured.value.gaps.some(gap => gap.blocking)) fail("material gaps require clarification");
  if (ownerApprovalRef?.schema !== schema.$id || ownerApprovalRef.mediaType !== "application/vnd.devrelay.architecture-discovery-owner-approval+json") fail("wrong owner approval contract");
  const approval = await loadArtifactContent(ownerApprovalRef, { load: loadArtifact });
  if (!validateApproval(approval.value)) fail(validationDetail(validateApproval));
  const decision = approval.value;
  if (decision.approvalId !== ownerApprovalRef.artifactId || !same(decision.interpretation, interpretationRef) ||
      decision.repositoryRevision !== loaded.closure.repository.value.revision) fail("owner approval targets another candidate or repository");
  if (!sameSet(decision.acknowledgedWarnings, [...new Set(loaded.structured.value.warnings)]) ||
      !sameSet(decision.acceptedNonMaterialGapIds, loaded.structured.value.gaps.map(gap => gap.id)) ||
      !sameSet(decision.acceptedOutOfScopeObservations, candidate.observations.filter(entry => entry.disposition === "out-of-scope").map(entry => entry.observation))) fail("owner approval omits or substitutes uncertainty dispositions");
  if (decision.review.schema !== "https://devrelay.dev/evidence/architecture-discovery-review/v1" || decision.review.mediaType !== "text/markdown") fail("wrong discovery review contract");
  const evidence = [];
  const evidenceRefs = new Set();
  for (const ref of [decision.review, ...decision.requiredEvidence]) {
    const key = canonicalJsonDigest(ref);
    if (evidenceRefs.has(key)) fail("duplicate owner review or supporting evidence");
    evidenceRefs.add(key);
    const resolved = await loadArtifactBytes(ref, { load: loadArtifact });
    if (resolved.bytes.length === 0) fail("empty owner review or supporting evidence");
    evidence.push({ ref, byteLength: resolved.bytes.length });
  }
  const identity = canonicalJsonDigest({ interpretationRef, ownerApprovalRef });
  const nextState = { ...structuredClone(loaded.state.value), stateId: `discovered-${identity.slice(7)}`,
    state: "existing-discovered-unbaselined", currentArchitectureSnapshot: candidate.structuredSnapshot };
  validateArchitectureArtifact(nextState);
  const utf8 = canonicalJson(nextState);
  const ref = { artifactId: nextState.stateId, schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
    mediaType: "application/vnd.devrelay.project-architecture-state+json", digest: sha256Digest(Buffer.from(utf8)), uri: `artifact://discovery-gate/state/${identity.slice(7)}` };
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryGateCommit", policyVersion: decision.policyVersion,
    scope: "observational-discovery-readiness", interpretationRef, ownerApprovalRef,
    invocationDigest: canonicalJsonDigest(replay.invocation), discoverySnapshot: candidate.discoverySnapshot,
    priorState: candidate.projectArchitectureState, nextState: { ref, utf8, byteLength: Buffer.byteLength(utf8) }, evidence };
  const commit = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validateCommit(commit)) fail(validationDetail(validateCommit));
  return frozen(commit);
}

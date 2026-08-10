import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

const BASELINES = Object.freeze(["requirementsBaseline", "projectOverviewBaseline", "architectureBaseline", "contractDisposition", "workBreakdownBaseline", "workDependencyBaseline", "specialistAssignmentBaseline"]);
const BASELINE_KINDS = Object.freeze({ requirementsBaseline:"RequirementsBaseline", projectOverviewBaseline:"ProjectOverviewBaseline", architectureBaseline:"ArchitectureBaseline", contractDisposition:"ContractDisposition", workBreakdownBaseline:"WorkBreakdownBaseline", workDependencyBaseline:"WorkDependencyBaseline", specialistAssignmentBaseline:"SpecialistAssignmentBaseline" });
const FORBIDDEN = Object.freeze(["approval", "businessAccepted", "graphMutation", "systemVerified", "verified"]);

export class ChangeIntegrationInputError extends Error {
  constructor(message) { super(`change integration input is invalid: ${message}`); this.name = "ChangeIntegrationInputError"; this.code = "DR4091"; }
}
const fail = (message) => { throw new ChangeIntegrationInputError(message); };
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const ref = (artifactId, digest) => ({ artifactId, digest });
const commit = (value) => typeof value === "string" && (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value));
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactRef(name, artifact, reference, rawBytes) {
  if (!artifact || !reference || typeof reference.artifactId !== "string" || !/^sha256:[0-9a-f]{64}$/.test(reference.digest)) fail(`${name} requires one immutable artifact and reference`);
  const digest = rawBytes === undefined ? canonicalJsonDigest(artifact) : sha256Digest(Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes));
  if (reference.digest !== digest) fail(`${name} bytes are stale or substituted`);
  return structuredClone(reference);
}
function exactBinding(name, binding) {
  if (!binding || !same(Object.keys(binding).sort(), ["artifact", "reference"])) fail(`${name} must be an exact artifact/reference binding`);
  const reference = exactRef(name, binding.artifact, binding.reference);
  const intrinsicId = binding.artifact.artifactId ?? binding.artifact.dispositionId ?? binding.artifact.baselineId;
  if (intrinsicId !== undefined && (typeof intrinsicId !== "string" || intrinsicId.length === 0 || reference.artifactId !== intrinsicId)) fail(`${name} reference does not match its intrinsic artifact identity`);
  return reference;
}
function rejectAuthority(value, name) { for (const field of FORBIDDEN) if (Object.hasOwn(value ?? {}, field)) fail(`${name} contains unauthorized ${field}`); }
function uniqueDemands(demands, grants) {
  if (!Array.isArray(demands) || demands.length === 0) fail("permissionDemands are required");
  const identities = demands.map(canonicalJson);
  if (new Set(identities).size !== identities.length) fail("duplicate permission demand");
  const allowed = new Set((grants ?? []).map(canonicalJson));
  if (allowed.size !== (grants ?? []).length) fail("duplicate host grant");
  if (identities.some((identity) => !allowed.has(identity)) || allowed.size !== identities.length) fail("permission demands are over-granted or do not exactly match host grants");
  return [...demands].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

export function bindChangeIntegrationInputs({ subjectId, bindingId, workItem, workItemRef, verificationSubject, verificationCandidate, verificationContext, gateApproval, verifiedChange, verifiedChangeRef, verifiedChangeBytes, verificationEvidence, baselines, target, targetRef, expectedCommit, integrationPolicy, integrationPolicyRef, integrationPolicyBytes, adapter, permissionDemands, hostGrants, idempotencyKey, proposedBinding } = {}) {
  if (!subjectId || !bindingId || !idempotencyKey) fail("subjectId, bindingId, and idempotencyKey are required");
  for (const [name, value] of [["workItem", workItem], ["verificationSubject", verificationSubject], ["verificationCandidate", verificationCandidate], ["gateApproval", gateApproval], ["verifiedChange", verifiedChange], ["integrationPolicy", integrationPolicy]]) rejectAuthority(value, name);
  try { validateWorkItemVerificationArtifact(verificationSubject); validateWorkItemVerificationArtifact(verificationCandidate, verificationContext); validateWorkItemVerificationArtifact(gateApproval, { ...verificationContext, candidate: verificationCandidate }); } catch (error) { fail(error.message); }
  if (gateApproval.decision !== "approved" || gateApproval.authority !== "work-item-verification-gate") fail("verification Gate approval is not authoritative");
  if (verificationCandidate.outcome !== "verified" || !same(gateApproval.candidate, ref(verificationCandidate.candidateId, verificationCandidate.candidateDigest))) fail("approval does not bind the exact verified candidate");
  if (!same(verificationCandidate.subject, ref(verificationSubject.subjectId, verificationSubject.subjectDigest)) || verificationSubject.workItemId !== workItem?.id) fail("work item, verification subject, and candidate are cross-item or substituted");
  const itemReference = exactRef("workItem", workItem, workItemRef);
  const changeReference = exactRef("verifiedChange", verifiedChange, verifiedChangeRef, verifiedChangeBytes);
  if (!same(verificationSubject.workItem, itemReference) || !same(verificationSubject.changeSetDraft, changeReference)) fail("verified subject does not bind the exact work item and change bytes");
  const evidence = verificationEvidence ?? gateApproval.acceptedEvidence;
  if (!Array.isArray(evidence) || evidence.length === 0 || new Set(evidence.map(canonicalJson)).size !== evidence.length || !same(evidence, gateApproval.acceptedEvidence)) fail("verification evidence must be the complete exact Gate-approved evidence set");
  if (!baselines || !same(Object.keys(baselines).sort(), [...BASELINES].sort())) fail("exact project baselines are required");
  for (const name of BASELINES) if (baselines[name]?.artifact?.kind !== BASELINE_KINDS[name]) fail(`${name} must contain canonical kind ${BASELINE_KINDS[name]}`);
  const baselineRefs = Object.fromEntries(BASELINES.map((name) => [name, exactBinding(name, baselines[name])]));
  for (const name of BASELINES) if (!same(baselineRefs[name], verificationSubject[name])) fail(`${name} does not match the exact approved verification-subject baseline reference`);
  const snapshotReference = exactBinding("repositorySnapshot", target);
  const snapshot = target.artifact;
  if (snapshot?.apiVersion !== "devrelay.dev/v1alpha1" || snapshot?.kind !== "RepositorySnapshot" || typeof snapshot?.repository !== "string" || snapshot.repository.length === 0) fail("target must contain a canonical RepositorySnapshot with repository identity");
  if (!commit(snapshot.revision) || !/^sha256:[0-9a-f]{64}$/.test(snapshot.treeDigest ?? "")) fail("RepositorySnapshot revision or treeDigest is invalid");
  if (!commit(expectedCommit) || expectedCommit !== snapshot.revision) fail("expected commit is stale or does not match RepositorySnapshot revision");
  if (typeof targetRef !== "string" || !/^refs\/(?:heads|tags)\//.test(targetRef)) fail("target ref is invalid");
  const policyReference = exactRef("integrationPolicy", integrationPolicy, integrationPolicyRef, integrationPolicyBytes);
  const demands = uniqueDemands(permissionDemands, hostGrants);
  const subjectBody = { apiVersion:"devrelay.dev/v1alpha1", kind:"VerifiedWorkItemSubject", subjectId, workItem:itemReference, changeSet:changeReference, verificationGateApproval:ref(gateApproval.approvalId, gateApproval.approvalDigest), verificationEvidence:evidence };
  const subject = { ...subjectBody, subjectDigest:canonicalJsonDigest(Object.fromEntries(Object.entries(subjectBody).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
  validateChangeIntegrationArtifact(subject);
  const body = { apiVersion:"devrelay.dev/v1alpha1", kind:"IntegrationInputBinding", bindingId, subject:ref(subjectId, subject.subjectDigest), baselines:baselineRefs, target:{ repositorySnapshot:snapshotReference, ref:targetRef, expectedCommit }, integrationPolicy:policyReference, adapter:structuredClone(adapter), permissionDemands:demands, idempotencyKey };
  const binding = { ...body, bindingDigest:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
  validateChangeIntegrationArtifact(binding);
  if (proposedBinding !== undefined && !same(proposedBinding, binding)) fail("proposed binding is incomplete, reordered, stale, or substituted");
  return deepFreeze({ subject, binding, verifiedChangeBytesDigest:changeReference.digest, targetTreeDigest:snapshot.treeDigest });
}

export const guardChangeIntegrationInputs = bindChangeIntegrationInputs;

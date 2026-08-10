import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/work-item-verification-artifacts.schema.json", import.meta.url), "utf8"));
const validator = compileArtifactSchema(schema);

export const WORK_ITEM_VERIFICATION_ARTIFACT_KINDS = Object.freeze([
  "ValidatedVerificationSubject", "VerificationObligationSet", "ValidatedVerifierBindingSet",
  "VerifierInvocation", "RawVerifierResult", "NormalizedVerificationEvidence",
  "VerificationPolicy", "VerificationPolicyEvaluation", "WorkItemVerificationGateCandidate",
  "WorkItemVerificationGateApproval",
  "WorkItemVerificationTraceabilityCandidate", "ApprovedWorkItemVerificationTraceability",
]);
export class WorkItemVerificationArtifactValidationError extends Error {
  constructor(message) { super(`work item verification artifact is invalid: ${message}`); this.name = "WorkItemVerificationArtifactValidationError"; this.code = "DR4070"; }
}
const fail = (message) => { throw new WorkItemVerificationArtifactValidationError(message); };
const digestFields = { ValidatedVerificationSubject:"subjectDigest", VerificationObligationSet:"obligationSetDigest", ValidatedVerifierBindingSet:"bindingDigest", VerifierInvocation:"invocationFingerprint", RawVerifierResult:"rawResultDigest", NormalizedVerificationEvidence:"evidenceDigest", VerificationPolicy:"policyDigest", VerificationPolicyEvaluation:"evaluationDigest", WorkItemVerificationGateCandidate:"candidateDigest", WorkItemVerificationGateApproval:"approvalDigest", WorkItemVerificationTraceabilityCandidate:"traceabilityDigest", ApprovedWorkItemVerificationTraceability:"traceabilityDigest" };
const bodyDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}`);
}
function sameRef(left, right) {
  return left?.artifactId === right?.artifactId && left?.digest === right?.digest;
}
function sameSet(left, right) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}
function canonicalSort(values) {
  return [...values].sort((left, right) => {
    const leftCanonical = canonicalJson(left);
    const rightCanonical = canonicalJson(right);
    return leftCanonical < rightCanonical ? -1 : leftCanonical > rightCanonical ? 1 : 0;
  });
}
function evaluationId(value) {
  const material = Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", "evaluationId", "evaluationDigest"].includes(key)));
  return `WIVPE-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`;
}
function approvalId(value) {
  const material = Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", "approvalId", "approvalDigest"].includes(key)));
  return `WIVGA-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`;
}
function obligationMap(obligations) {
  if (obligations?.kind !== "VerificationObligationSet") fail("exact VerificationObligationSet context is required");
  unique(obligations.obligations.map(({ obligationId }) => obligationId), "obligation identity");
  return new Map(obligations.obligations.map((entry) => [entry.obligationId, entry]));
}
function validateObservation(observation, obligation) {
  if (observation.observationDigest !== bodyDigest(observation, "observationDigest")) fail("observationDigest does not bind canonical material");
  if (!obligation) fail(`observation references unbound obligation ${observation.obligationId}`);
  unique(observation.evidenceBindings.map(({ evidenceId }) => evidenceId), "evidence identity");
  const required = new Set(obligation.requiredEvidenceKinds);
  for (const evidence of observation.evidenceBindings) if (!required.has(evidence.kind)) fail(`evidence kind ${evidence.kind} is not required by obligation ${observation.obligationId}`);
  if (observation.status !== "inconclusive" && observation.evidenceBindings.length === 0) fail(`${observation.status} observation requires proving evidence`);
  if (observation.status === "pass") {
    const supplied = new Set(observation.evidenceBindings.map(({ kind }) => kind));
    for (const kind of required) if (!supplied.has(kind)) fail(`pass observation lacks required evidence kind ${kind}`);
  }
}

function validateRaw(value, context) {
  const { invocation, binding, obligations } = context;
  if (invocation?.kind !== "VerifierInvocation" || binding?.kind !== "ValidatedVerifierBindingSet") fail("RawVerifierResult requires exact invocation and binding context");
  if (value.verificationAttemptId !== invocation.verificationAttemptId || value.invocationFingerprint !== invocation.invocationFingerprint) fail("RawVerifierResult invocation binding does not match");
  if (value.bindingDigest !== binding.bindingDigest || invocation.binding.digest !== binding.bindingDigest) fail("RawVerifierResult binding does not match");
  if (value.verifier.id !== invocation.verifier.id || value.verifier.version !== invocation.verifier.version) fail("RawVerifierResult verifier substitution is forbidden");
  if (invocation.obligationSet.digest !== binding.obligationSet.digest || !sameRef(invocation.subject, binding.subject)) fail("invocation obligation set or subject does not match binding");
  unique(invocation.assignedObligations.map(({ obligationId }) => obligationId), "assigned obligation identity");
  if (!sameSet(invocation.assignedObligations.map(({ obligationId }) => obligationId), invocation.obligationIds)) fail("assigned obligation slice must exactly cover invocation obligation IDs");
  const byId = new Map(invocation.assignedObligations.map((entry) => [entry.obligationId, entry]));
  if (obligations !== undefined) {
    const authoritative = obligationMap(obligations);
    if (obligations.obligationSetDigest !== invocation.obligationSet.digest || obligations.obligationSetDigest !== binding.obligationSet.digest) fail("obligation set context does not match invocation and binding");
    if (!sameRef(obligations.subject, invocation.subject) || !sameRef(obligations.subject, binding.subject)) fail("obligation subject does not match invocation and binding");
    for (const assigned of invocation.assignedObligations) {
      const entry = authoritative.get(assigned.obligationId);
      if (!entry || canonicalJsonDigest(entry) !== canonicalJsonDigest(assigned)) fail(`assigned obligation ${assigned.obligationId} does not match authoritative obligation set`);
    }
  }
  const partitions = binding.partitions.filter(({ verifier }) => verifier.id === invocation.verifier.id && verifier.version === invocation.verifier.version);
  if (partitions.length !== 1 || !sameSet(partitions[0].obligationIds, invocation.obligationIds)) fail("matching verifier partition must exactly cover invocation obligations");
  unique(value.observations.map(({ observationId }) => observationId), "observation identity");
  unique(value.observations.map(({ obligationId }) => obligationId), "observation obligation disposition");
  unique(value.observations.flatMap(({ evidenceBindings }) => evidenceBindings.map(({ evidenceId }) => evidenceId)), "evidence identity");
  if (value.observations.length !== invocation.obligationIds.length || !sameSet(value.observations.map(({ obligationId }) => obligationId), invocation.obligationIds)) fail("raw result must contain exactly one observation per assigned obligation");
  for (const observation of value.observations) {
    if (!invocation.obligationIds.includes(observation.obligationId)) fail(`observation ${observation.observationId} is outside the invocation partition`);
    validateObservation(observation, byId.get(observation.obligationId));
  }
}

function validateNormalized(value, context) {
  const { rawResult, invocation, binding, obligations, checkpointDigest } = context;
  if (rawResult?.kind !== "RawVerifierResult" || invocation?.kind !== "VerifierInvocation" || binding?.kind !== "ValidatedVerifierBindingSet") fail("NormalizedVerificationEvidence requires exact raw result, invocation, binding, and obligation context");
  validateRaw(rawResult, { invocation, binding, obligations });
  if (value.verificationAttemptId !== rawResult.verificationAttemptId || value.invocationFingerprint !== invocation.invocationFingerprint || value.bindingDigest !== binding.bindingDigest || value.rawResultDigest !== rawResult.rawResultDigest || value.checkpointDigest !== checkpointDigest) fail("normalized evidence lineage binding does not match");
  if (!sameRef(value.subject, invocation.subject) || !sameRef(value.subject, binding.subject) || !sameRef(value.subject, obligations.subject)) fail("normalized evidence subject does not match exact invocation context");
  const byId = obligationMap(obligations);
  const observations = new Map(rawResult.observations.map((entry) => [entry.observationId, entry]));
  const expected = new Map();
  for (const observation of rawResult.observations) for (const evidence of observation.evidenceBindings) expected.set(evidence.evidenceId, { observation, evidence });
  unique(value.items.map(({ evidenceId }) => evidenceId), "normalized evidence identity");
  if (value.items.length !== expected.size) fail("normalized evidence must contain exactly one item per explicit observation/evidence binding");
  for (const item of value.items) {
    const source = expected.get(item.evidenceId);
    if (!source || !observations.has(item.observationId)) fail(`normalized evidence ${item.evidenceId} is unbound`);
    if (item.observationId !== source.observation.observationId || item.observationDigest !== source.observation.observationDigest || item.obligationId !== source.observation.obligationId || item.status !== source.observation.status || item.kind !== source.evidence.kind || !sameRef(item.artifact, source.evidence.artifact)) fail(`normalized evidence ${item.evidenceId} does not preserve its explicit source binding`);
    if (item.subjectDigest !== value.subject.digest || item.producer.id !== rawResult.verifier.id || item.producer.version !== rawResult.verifier.version) fail(`normalized evidence ${item.evidenceId} has mismatched subject or producer`);
    if (!byId.get(item.obligationId)?.requiredEvidenceKinds.includes(item.kind)) fail(`normalized evidence ${item.evidenceId} has unrelated evidence kind`);
  }
  if (canonicalJson(value.nativeArtifacts) !== canonicalJson(canonicalSort(rawResult.nativeArtifacts))) fail("native provenance artifacts must exactly match the canonical sorted raw-result provenance");
}

function validateVerificationPolicy(value) {
  if (value.version !== "1.0.0" || value.evaluationSemantics !== "devrelay.work-item-verification/v1") fail("unsupported verification policy version or semantics");
}

function expectedReasonKeys(outcome, dispositions, independenceFailed) {
  if (outcome === "verified") return ["VERIFIED_ALL_OBLIGATIONS"];
  const reasons = [];
  if (outcome === "failed" && independenceFailed) reasons.push("INDEPENDENCE_REQUIRED_UNSATISFIED");
  const code = outcome === "failed" ? "OBLIGATION_FAILED" : "OBLIGATION_NEEDS_EVIDENCE";
  const status = outcome === "failed" ? "failed" : "needs-evidence";
  for (const disposition of dispositions.filter((entry) => entry.status === status)) reasons.push(`${code}:${disposition.obligationId}`);
  return reasons.sort();
}

function validatePolicyEvaluation(value, context) {
  const { policy, binding, subject, normalizedEvidence, obligations } = context;
  if (policy?.kind !== "VerificationPolicy" || binding?.kind !== "ValidatedVerifierBindingSet" || subject?.kind !== "ValidatedVerificationSubject" || normalizedEvidence?.kind !== "NormalizedVerificationEvidence") fail("VerificationPolicyEvaluation requires exact policy, binding, subject, obligations, and normalized evidence context");
  if (value.evaluationId !== evaluationId(value)) fail("evaluationId is not the deterministic canonical evaluation identity");
  validateVerificationPolicy(policy);
  if (!sameRef(subject.verificationPolicy, { artifactId: policy.policyId, digest: policy.policyDigest })) fail("verification subject does not bind exact policy");
  if (!sameRef(obligations.subject, { artifactId: subject.subjectId, digest: subject.subjectDigest }) || !sameRef(binding.subject, { artifactId: subject.subjectId, digest: subject.subjectDigest }) || !sameRef(normalizedEvidence.subject, { artifactId: subject.subjectId, digest: subject.subjectDigest })) fail("policy evaluation inputs do not share the exact subject");
  if (!sameRef(value.verificationPolicy, { artifactId: policy.policyId, digest: policy.policyDigest }) || !sameRef(value.verifierBinding, { artifactId: binding.bindingId, digest: binding.bindingDigest }) || !sameRef(value.subject, { artifactId: subject.subjectId, digest: subject.subjectDigest }) || !sameRef(value.obligationSet, { artifactId: obligations.obligationSetId, digest: obligations.obligationSetDigest }) || !sameRef(value.normalizedEvidence, { artifactId: normalizedEvidence.normalizedEvidenceId, digest: normalizedEvidence.evidenceDigest })) fail("policy evaluation links do not match exact supplied artifacts");
  const requiredIndependence = policy.rules.verifierIndependence === "required";
  if (binding.independence.required !== requiredIndependence) fail("policy and binding independence requirements do not match");
  const byId = obligationMap(obligations);
  unique(normalizedEvidence.items.map(({ evidenceId }) => evidenceId), "normalized evidence identity");
  const evidenceById = new Map(normalizedEvidence.items.map((item) => [item.evidenceId, item]));
  unique(value.dispositions.map(({ obligationId }) => obligationId), "policy obligation disposition");
  if (value.dispositions.length !== byId.size) fail("policy evaluation must dispose every obligation exactly once");
  for (const disposition of value.dispositions) {
    const obligation = byId.get(disposition.obligationId);
    if (!obligation) fail(`policy disposition references unbound obligation ${disposition.obligationId}`);
    unique(disposition.evidenceIds, `policy evidence identity for ${disposition.obligationId}`);
    for (const evidenceId of disposition.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) fail(`policy disposition references unresolved evidence ${evidenceId}`);
      if (evidence.obligationId !== disposition.obligationId) fail(`policy disposition references evidence ${evidenceId} from another obligation`);
    }
    const obligationEvidence = normalizedEvidence.items.filter(({ obligationId }) => obligationId === disposition.obligationId);
    if (!sameSet(disposition.evidenceIds, obligationEvidence.map(({ evidenceId }) => evidenceId))) fail(`policy disposition ${disposition.obligationId} must cite its exact evidence set`);
    const passingKinds = new Set(obligationEvidence.filter(({ status }) => status === "pass").map(({ kind }) => kind));
    const derived = obligationEvidence.some(({ status }) => status === "fail") ? "failed" : obligation.requiredEvidenceKinds.every((kind) => passingKinds.has(kind)) ? "satisfied" : "needs-evidence";
    if (disposition.status !== derived) fail(`policy disposition ${disposition.obligationId} contradicts deterministic evidence status`);
  }
  const independenceFailed = requiredIndependence && !binding.independence.satisfied;
  const derivedOutcome = independenceFailed || value.dispositions.some(({ status }) => status === "failed") ? "failed" : value.dispositions.some(({ status }) => status === "needs-evidence") ? "needs-evidence" : "verified";
  if (value.outcome !== derivedOutcome) fail("policy outcome contradicts deterministic precedence");
  const actualReasons = value.reasons.map(({ code, obligationId }) => obligationId ? `${code}:${obligationId}` : code).sort();
  unique(actualReasons, "policy reason");
  if (canonicalJson(actualReasons) !== canonicalJson(expectedReasonKeys(derivedOutcome, value.dispositions, independenceFailed))) fail("policy reason codes are incomplete or contradictory");
}

function validateCandidate(value, context) {
  const { policyEvaluation, binding, subject, obligations, normalizedEvidence } = context;
  if (policyEvaluation?.kind !== "VerificationPolicyEvaluation" || binding?.kind !== "ValidatedVerifierBindingSet" || subject?.kind !== "ValidatedVerificationSubject" || obligations?.kind !== "VerificationObligationSet" || normalizedEvidence?.kind !== "NormalizedVerificationEvidence") fail("WorkItemVerificationGateCandidate requires exact evaluation, binding, subject, obligations, and evidence context");
  if (!sameRef(value.policyEvaluation, { artifactId: policyEvaluation.evaluationId, digest: policyEvaluation.evaluationDigest }) || value.outcome !== policyEvaluation.outcome || !sameRef(value.verifierBinding, { artifactId: binding.bindingId, digest: binding.bindingDigest }) || !sameRef(value.subject, { artifactId: subject.subjectId, digest: subject.subjectDigest }) || !sameRef(value.obligationSet, { artifactId: obligations.obligationSetId, digest: obligations.obligationSetDigest }) || !sameRef(value.normalizedEvidence, { artifactId: normalizedEvidence.normalizedEvidenceId, digest: normalizedEvidence.evidenceDigest })) fail("Gate candidate does not preserve exact evaluation inputs and outcome");
}

function validateGateApproval(value, context) {
  const { candidate, normalizedEvidence, obligations } = context;
  if (candidate?.kind !== "WorkItemVerificationGateCandidate" || normalizedEvidence?.kind !== "NormalizedVerificationEvidence" || obligations?.kind !== "VerificationObligationSet") fail("WorkItemVerificationGateApproval requires exact candidate, evidence, and obligation context");
  if (value.approvalId !== approvalId(value)) fail("approvalId is not the deterministic canonical approval identity");
  if (candidate.outcome !== "verified") fail("Gate approval requires a verified candidate");
  if (!sameRef(value.candidate, { artifactId: candidate.candidateId, digest: candidate.candidateDigest })) fail("Gate approval candidate is stale or substituted");
  if (value.acceptedEvidence.length !== 1 || !sameRef(value.acceptedEvidence[0], { artifactId: normalizedEvidence.normalizedEvidenceId, digest: normalizedEvidence.evidenceDigest }) || !sameRef(candidate.normalizedEvidence, value.acceptedEvidence[0])) fail("Gate approval evidence is stale or substituted");
  const acceptedEvidenceIds = new Set(normalizedEvidence.items.map(({ evidenceId }) => evidenceId));
  const criterionIds = obligations.obligations.filter(({ kind, obligationId }) => kind === "acceptance-criterion" && normalizedEvidence.items.some((item) => item.obligationId === obligationId && acceptedEvidenceIds.has(item.evidenceId))).map(({ sourceRef }) => sourceRef);
  unique(criterionIds, "approved acceptance-criterion identity");
  if (canonicalJson([...value.acceptanceCriterionIds].sort()) !== canonicalJson([...criterionIds].sort())) fail("Gate approval acceptance criteria do not exactly match accepted evidence");
}

export function validateWorkItemVerificationArtifact(value, context = {}) {
  if (!validator(value)) fail(validationDetail(validator));
  if (!WORK_ITEM_VERIFICATION_ARTIFACT_KINDS.includes(value.kind)) fail(`unsupported kind ${value?.kind}`);
  const field = digestFields[value.kind];
  if (field && value[field] !== bodyDigest(value, field)) fail(`${field} does not bind canonical material`);
  if (value.kind === "VerificationObligationSet") obligationMap(value);
  if (value.kind === "RawVerifierResult") validateRaw(value, context);
  if (value.kind === "NormalizedVerificationEvidence") validateNormalized(value, context);
  if (value.kind === "VerificationPolicy") validateVerificationPolicy(value);
  if (value.kind === "VerificationPolicyEvaluation") validatePolicyEvaluation(value, context);
  if (value.kind === "WorkItemVerificationGateCandidate") validateCandidate(value, context);
  if (value.kind === "WorkItemVerificationGateApproval") validateGateApproval(value, context);
  return value;
}

import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";
import { evaluateWorkItemVerificationPolicy } from "./work-item-verification-policy-evaluator.mjs";

export class WorkItemVerificationGateError extends Error {
  constructor(message) { super(`work item verification Gate candidate assembly failed: ${message}`); this.name = "WorkItemVerificationGateError"; this.code = "DR4120"; }
}
const fail = (message) => { throw new WorkItemVerificationGateError(message); };
const ref = (artifactId, digest) => ({ artifactId, digest });
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));

export function assembleWorkItemVerificationGateCandidate({ candidateId, policy, subject, obligationSet, binding, normalizedEvidence, policyEvaluation, proposedCandidate } = {}) {
  if (typeof candidateId !== "string" || candidateId.length === 0) fail("candidateId is required");
  let expected;
  try { expected = evaluateWorkItemVerificationPolicy({ policy, subject, obligationSet, binding, normalizedEvidence }); }
  catch (error) { fail(error.message); }
  if (!same(policyEvaluation, expected)) fail("policy evaluation is stale, substituted, or not the exact Core-derived evaluation");
  const body = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "WorkItemVerificationGateCandidate", candidateId,
    subject: ref(subject.subjectId, subject.subjectDigest), obligationSet: ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest),
    verifierBinding: ref(binding.bindingId, binding.bindingDigest), normalizedEvidence: ref(normalizedEvidence.normalizedEvidenceId, normalizedEvidence.evidenceDigest),
    policyEvaluation: ref(policyEvaluation.evaluationId, policyEvaluation.evaluationDigest), outcome: policyEvaluation.outcome, authority: "candidate",
  };
  const candidate = { ...body, candidateDigest: digestBody(body, "candidateDigest") };
  try { validateWorkItemVerificationArtifact(candidate, { policyEvaluation, binding, subject, obligations: obligationSet, normalizedEvidence }); }
  catch (error) { fail(error.message); }
  if (proposedCandidate !== undefined && !same(proposedCandidate, candidate)) fail("proposed candidate contradicts the Core-derived candidate");
  return candidate;
}

export function approveWorkItemVerification({ candidate, normalizedEvidence, obligationSet, proposedApproval } = {}) {
  if (candidate?.kind !== "WorkItemVerificationGateCandidate" || candidate.outcome !== "verified") fail("only an exact verified Gate candidate may be approved");
  const acceptanceCriterionIds = obligationSet?.obligations?.filter(({ kind, obligationId }) => kind === "acceptance-criterion" && normalizedEvidence?.items?.some((item) => item.obligationId === obligationId)).map(({ sourceRef }) => sourceRef).sort();
  if (!acceptanceCriterionIds?.length) fail("approval requires accepted evidence for at least one acceptance criterion");
  const material = { decision: "approved", candidate: ref(candidate.candidateId, candidate.candidateDigest), acceptedEvidence: [ref(normalizedEvidence.normalizedEvidenceId, normalizedEvidence.evidenceDigest)], acceptanceCriterionIds, authority: "work-item-verification-gate" };
  const approvalId = `WIVGA-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`;
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkItemVerificationGateApproval", approvalId, ...material };
  const approval = { ...body, approvalDigest: digestBody(body, "approvalDigest") };
  try { validateWorkItemVerificationArtifact(approval, { candidate, normalizedEvidence, obligations: obligationSet }); }
  catch (error) { fail(error.message); }
  if (proposedApproval !== undefined && !same(proposedApproval, approval)) fail("proposed approval contradicts the Gate-derived approval");
  return approval;
}


export const assembleGateCandidate = assembleWorkItemVerificationGateCandidate;

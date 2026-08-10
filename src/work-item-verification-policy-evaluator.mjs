import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

export class WorkItemVerificationPolicyEvaluationError extends Error {
  constructor(message) {
    super(`work item verification policy evaluation failed: ${message}`);
    this.name = "WorkItemVerificationPolicyEvaluationError";
    this.code = "DR4110";
  }
}

const fail = (message) => { throw new WorkItemVerificationPolicyEvaluationError(message); };
const ref = (artifactId, digest) => ({ artifactId, digest });
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const sortByCanonical = (values) => [...values].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));

function validateStandalone(artifact, field) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) fail(`${field} is required`);
  try { validateWorkItemVerificationArtifact(artifact); }
  catch (error) { fail(`${field} is invalid: ${error.message}`); }
}

function validateEvidenceShape(evidence) {
  const keys = ["apiVersion", "bindingDigest", "checkpointDigest", "collectionTime", "evidenceDigest", "invocationFingerprint", "items", "kind", "nativeArtifacts", "normalizedEvidenceId", "rawResultDigest", "subject", "verificationAttemptId"];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || evidence.kind !== "NormalizedVerificationEvidence") fail("normalizedEvidence is required");
  if (!same(Object.keys(evidence).sort(), keys)) fail("normalizedEvidence contains unknown or missing fields");
  if (evidence.evidenceDigest !== digestBody(evidence, "evidenceDigest")) fail("normalizedEvidence evidenceDigest does not bind canonical material");
  if (!Array.isArray(evidence.items) || !Array.isArray(evidence.nativeArtifacts)) fail("normalizedEvidence collections are malformed");
  const itemKeys = ["artifact", "evidenceId", "kind", "obligationId", "observationDigest", "observationId", "producer", "status", "subjectDigest"];
  for (const item of evidence.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !same(Object.keys(item).sort(), itemKeys)) fail("normalizedEvidence item contains unknown or missing fields");
    if (!item.evidenceId || !item.obligationId || !["pass", "fail", "inconclusive"].includes(item.status)) fail("normalizedEvidence item is malformed");
  }
}

function exactContext(policy, subject, obligations, binding, evidence) {
  validateStandalone(policy, "policy");
  validateStandalone(subject, "subject");
  validateStandalone(obligations, "obligationSet");
  validateStandalone(binding, "binding");
  validateEvidenceShape(evidence);
  const subjectRef = ref(subject.subjectId, subject.subjectDigest);
  const obligationRef = ref(obligations.obligationSetId, obligations.obligationSetDigest);
  if (!same(subject.verificationPolicy, ref(policy.policyId, policy.policyDigest))) fail("subject binds a stale or substituted verification policy");
  if (!same(obligations.subject, subjectRef) || !same(binding.subject, subjectRef) || !same(evidence.subject, subjectRef)) fail("inputs do not bind the exact subject");
  if (!same(binding.obligationSet, obligationRef)) fail("binding does not bind the exact obligation set");
  if (evidence.bindingDigest !== binding.bindingDigest) fail("normalized evidence binds a stale or substituted verifier binding");
  if (binding.independence.required !== (policy.rules.verifierIndependence === "required")) fail("policy and binding independence requirements differ");
}

export function evaluateWorkItemVerificationPolicy({ policy, subject, obligationSet, binding, normalizedEvidence, proposedEvaluation } = {}) {
  exactContext(policy, subject, obligationSet, binding, normalizedEvidence);
  const obligations = new Map(obligationSet.obligations.map((entry) => [entry.obligationId, entry]));
  if (obligations.size !== obligationSet.obligations.length) fail("obligation set contains duplicate obligation IDs");
  const evidenceIds = new Set();
  const byObligation = new Map([...obligations.keys()].map((id) => [id, []]));
  for (const item of normalizedEvidence.items) {
    if (evidenceIds.has(item.evidenceId)) fail(`duplicate normalized evidence ${item.evidenceId}`);
    evidenceIds.add(item.evidenceId);
    const obligation = obligations.get(item.obligationId);
    if (!obligation) fail(`normalized evidence ${item.evidenceId} is not bound to an obligation`);
    if (item.subjectDigest !== subject.subjectDigest) fail(`normalized evidence ${item.evidenceId} has a substituted subject`);
    if (!obligation.requiredEvidenceKinds.includes(item.kind)) fail(`normalized evidence ${item.evidenceId} has an unbound evidence kind`);
    byObligation.get(item.obligationId).push(item);
  }
  const dispositions = [...obligations.values()].map((obligation) => {
    const items = byObligation.get(obligation.obligationId);
    const passingKinds = new Set(items.filter(({ status }) => status === "pass").map(({ kind }) => kind));
    const status = items.some((item) => item.status === "fail") ? "failed" : obligation.requiredEvidenceKinds.every((kind) => passingKinds.has(kind)) ? "satisfied" : "needs-evidence";
    return { obligationId: obligation.obligationId, status, evidenceIds: items.map(({ evidenceId }) => evidenceId).sort() };
  }).sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  const independenceFailed = policy.rules.verifierIndependence === "required" && !binding.independence.satisfied;
  const outcome = independenceFailed || dispositions.some(({ status }) => status === "failed") ? "failed" : dispositions.some(({ status }) => status === "needs-evidence") ? "needs-evidence" : "verified";
  const reasons = outcome === "verified" ? [{ code: "VERIFIED_ALL_OBLIGATIONS" }] : outcome === "failed" ? [
    ...(independenceFailed ? [{ code: "INDEPENDENCE_REQUIRED_UNSATISFIED" }] : []),
    ...dispositions.filter(({ status }) => status === "failed").map(({ obligationId }) => ({ code: "OBLIGATION_FAILED", obligationId })),
  ] : dispositions.filter(({ status }) => status === "needs-evidence").map(({ obligationId }) => ({ code: "OBLIGATION_NEEDS_EVIDENCE", obligationId }));
  const material = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "VerificationPolicyEvaluation",
    subject: ref(subject.subjectId, subject.subjectDigest), obligationSet: ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest),
    verificationPolicy: ref(policy.policyId, policy.policyDigest), verifierBinding: ref(binding.bindingId, binding.bindingDigest),
    normalizedEvidence: ref(normalizedEvidence.normalizedEvidenceId, normalizedEvidence.evidenceDigest), outcome, dispositions, reasons: sortByCanonical(reasons),
  };
  const identityMaterial = Object.fromEntries(Object.entries(material).filter(([key]) => !["apiVersion", "kind", "evaluationId", "evaluationDigest"].includes(key)));
  const body = { ...material, evaluationId: `WIVPE-${canonicalJsonDigest(identityMaterial).slice(7, 23).toUpperCase()}` };
  const evaluation = { ...body, evaluationDigest: digestBody(body, "evaluationDigest") };
  try { validateWorkItemVerificationArtifact(evaluation, { policy, binding, subject, normalizedEvidence, obligations: obligationSet }); }
  catch (error) { fail(error.message); }
  if (proposedEvaluation !== undefined && !same(proposedEvaluation, evaluation)) fail("proposed evaluation contradicts the Core-derived evaluation");
  return evaluation;
}

export const evaluateVerificationPolicy = evaluateWorkItemVerificationPolicy;

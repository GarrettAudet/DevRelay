import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { evaluateWorkItemVerificationPolicy, WorkItemVerificationPolicyEvaluationError } from "../src/work-item-verification-policy-evaluator.mjs";
import { assembleWorkItemVerificationGateCandidate, WorkItemVerificationGateError } from "../src/work-item-verification-gate.mjs";

const D = `sha256:${"a".repeat(64)}`;
const ref = (artifactId, digest = D) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const base = { apiVersion:"devrelay.dev/v1alpha1" };
const itemKeys = (value) => ({ evidenceId:value.evidenceId, subjectDigest:value.subjectDigest, observationId:value.observationId, observationDigest:value.observationDigest, obligationId:value.obligationId, kind:value.kind, status:value.status, artifact:value.artifact, producer:value.producer });

function fixture({ independence = "required", satisfied = true, statuses = ["pass", "pass"] } = {}) {
  const policy = seal({ ...base, kind:"VerificationPolicy", policyId:"POL", version:"1.0.0", evaluationSemantics:"devrelay.work-item-verification/v1", rules:{ allObligationsMandatory:true, requiredEvidenceBinding:"explicit-obligation-bound", verifierIndependence:independence, nativeArtifacts:"provenance-only", unknownEvidence:"reject", outcomePrecedence:["failed","needs-evidence","verified"] } }, "policyDigest");
  const subject = seal({ ...base, kind:"ValidatedVerificationSubject", subjectId:"SUB", workItemId:"WI-WIV-POLICY-GATE", workItem:ref("WI"), executionAttempt:ref("ATT"), changeSetDraft:ref("CHANGE"), executionEvidenceBundle:ref("EXEC-EV"), verificationPolicy:ref(policy.policyId, policy.policyDigest), requirementsBaseline:ref("REQ"), projectOverviewBaseline:ref("PO"), architectureBaseline:ref("ARCH"), contractDisposition:ref("CD"), workBreakdownBaseline:ref("WBB"), workDependencyBaseline:ref("WDB"), specialistAssignmentBaseline:ref("SAB"), repositoryBase:ref("REPO"), candidateWorkspace:ref("WS") }, "subjectDigest");
  const obligationSet = seal({ ...base, kind:"VerificationObligationSet", obligationSetId:"OBS", subject:ref(subject.subjectId, subject.subjectDigest), obligations:[{ obligationId:"OB-1", kind:"acceptance-criterion", sourceRef:"AC-DEV-WIV-GATE-001", requiredEvidenceKinds:["test-report"] }, { obligationId:"OB-2", kind:"policy", sourceRef:"AC-DEV-WIV-OUTCOMES-001", requiredEvidenceKinds:["review-record"] }] }, "obligationSetDigest");
  const binding = seal({ ...base, kind:"ValidatedVerifierBindingSet", bindingId:"BIND", subject:ref(subject.subjectId, subject.subjectDigest), obligationSet:ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest), executorIdentity:"executor", partitions:[{ verifier:{ id:"verifier.independent", version:"1.0.0" }, obligationIds:["OB-1","OB-2"], permissionDemand:[] }], independence:{ required:independence === "required", satisfied, ...(satisfied ? { evidence:ref("IND") } : {}) } }, "bindingDigest");
  const evidenceItems = statuses.flatMap((status, index) => status === "missing" ? [] : [itemKeys({ evidenceId:`EV-${index + 1}`, subjectDigest:subject.subjectDigest, observationId:`OBS-${index + 1}`, observationDigest:D, obligationId:`OB-${index + 1}`, kind:index ? "review-record" : "test-report", status, artifact:ref(`ART-${index + 1}`), producer:{ id:"verifier.independent", version:"1.0.0" } })]);
  const normalizedEvidence = seal({ ...base, kind:"NormalizedVerificationEvidence", normalizedEvidenceId:"EV", verificationAttemptId:"VAT", subject:ref(subject.subjectId, subject.subjectDigest), invocationFingerprint:D, bindingDigest:binding.bindingDigest, checkpointDigest:D, rawResultDigest:D, collectionTime:{ disposition:"not-applicable", rationale:"deterministic fixture" }, nativeArtifacts:[ref("NATIVE")], items:evidenceItems }, "evidenceDigest");
  return { policy, subject, obligationSet, binding, normalizedEvidence };
}

const evaluate = (context, extra = {}) => evaluateWorkItemVerificationPolicy({ ...context, ...extra });
const candidate = (context, evaluation, extra = {}) => assembleWorkItemVerificationGateCandidate({ candidateId:"WIVC-1", ...context, policyEvaluation:evaluation, ...extra });

test("produces a closed verified evaluation and candidate-only Gate artifact", () => {
  const context = fixture(); const evaluation = evaluate(context); const gate = candidate(context, evaluation);
  assert.equal(evaluation.outcome, "verified"); assert.deepEqual(evaluation.reasons, [{ code:"VERIFIED_ALL_OBLIGATIONS" }]);
  assert.equal(gate.outcome, "verified"); assert.equal(gate.authority, "candidate"); assert.equal(gate.policyEvaluation.digest, evaluation.evaluationDigest);
});

test("fail evidence beats missing or inconclusive evidence", () => {
  const context = fixture({ statuses:["fail", "missing"] }); const evaluation = evaluate(context);
  assert.equal(evaluation.outcome, "failed");
  assert.deepEqual(evaluation.dispositions.map(({ status }) => status), ["failed", "needs-evidence"]);
  assert.deepEqual(evaluation.reasons, [{ code:"OBLIGATION_FAILED", obligationId:"OB-1" }]);
});

test("missing and inconclusive proof produce needs-evidence", () => {
  for (const statuses of [["pass", "missing"], ["pass", "inconclusive"]]) {
    const evaluation = evaluate(fixture({ statuses }));
    assert.equal(evaluation.outcome, "needs-evidence"); assert.equal(evaluation.dispositions[1].status, "needs-evidence");
  }
});

test("required independence failure fails while optional independence does not", () => {
  const required = fixture({ satisfied:false }); const failed = evaluate(required);
  assert.equal(failed.outcome, "failed"); assert.deepEqual(failed.reasons, [{ code:"INDEPENDENCE_REQUIRED_UNSATISFIED" }]);
  const optional = fixture({ independence:"optional", satisfied:false }); assert.equal(evaluate(optional).outcome, "verified");
});

test("rejects stale or substituted policy, subject, obligation set, binding, and evidence", () => {
  const context = fixture();
  const cases = [
    { ...context, policy:{ ...context.policy, policyId:"OTHER" } },
    { ...context, subject:{ ...context.subject, subjectId:"OTHER" } },
    { ...context, obligationSet:{ ...context.obligationSet, obligationSetId:"OTHER" } },
    { ...context, binding:{ ...context.binding, bindingId:"OTHER" } },
    { ...context, normalizedEvidence:{ ...context.normalizedEvidence, normalizedEvidenceId:"OTHER" } },
  ];
  for (const value of cases) assert.throws(() => evaluate(value), WorkItemVerificationPolicyEvaluationError);
});

test("rejects unsupported policy and unbound evidence", () => {
  const unsupported = fixture(); unsupported.policy = seal({ ...unsupported.policy, version:"2.0.0" }, "policyDigest");
  assert.throws(() => evaluate(unsupported), WorkItemVerificationPolicyEvaluationError);
  const unbound = fixture(); unbound.normalizedEvidence = seal({ ...unbound.normalizedEvidence, items:[{ ...unbound.normalizedEvidence.items[0], obligationId:"OB-X" }, ...unbound.normalizedEvidence.items.slice(1)] }, "evidenceDigest");
  assert.throws(() => evaluate(unbound), /not bound to an obligation/);
});

test("rejects caller-proposed decisions and forbidden outcomes", () => {
  const context = fixture(); const evaluation = evaluate(context);
  for (const outcome of ["failed", "baseline-drift", "unable-to-proceed"]) assert.throws(() => evaluate(context, { proposedEvaluation:{ ...evaluation, outcome } }), WorkItemVerificationPolicyEvaluationError);
  const gate = candidate(context, evaluation);
  for (const outcome of ["failed", "baseline-drift", "unable-to-proceed"]) assert.throws(() => candidate(context, evaluation, { proposedCandidate:{ ...gate, outcome } }), WorkItemVerificationGateError);
  assert.throws(() => candidate(context, { ...evaluation, outcome:"failed" }), WorkItemVerificationGateError);
});

test("canonical object-key ordering yields byte-stable evaluation and candidate", () => {
  const context = fixture(); const shuffled = Object.fromEntries(Object.entries(context).reverse());
  const first = evaluate(context); const second = evaluate(shuffled);
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(canonicalJson(candidate(context, first)), canonicalJson(candidate(shuffled, second)));
});

test("revision 7 derives a stable material-bound evaluation identity", () => {
  const context = fixture();
  const first = evaluate(context); const repeated = evaluate(context);
  const material = Object.fromEntries(Object.entries(first).filter(([key]) => !["apiVersion", "kind", "evaluationId", "evaluationDigest"].includes(key)));
  assert.equal(first.evaluationId, `WIVPE-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`);
  assert.equal(canonicalJson(first), canonicalJson(repeated));
  const changedContext = fixture({ statuses:["pass", "missing"] });
  assert.notEqual(evaluate(changedContext).evaluationId, first.evaluationId);
});

test("candidate preserves evaluation identity and rejects digest-only identity substitution", () => {
  const context = fixture(); const evaluation = evaluate(context); const gate = candidate(context, evaluation);
  assert.equal(gate.policyEvaluation.artifactId, evaluation.evaluationId);
  const substituted = { ...gate, policyEvaluation:{ artifactId:"WIVPE-FFFFFFFFFFFFFFFF", digest:evaluation.evaluationDigest } };
  substituted.candidateDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(substituted).filter(([key]) => !["apiVersion", "kind", "candidateDigest"].includes(key))));
  assert.throws(() => candidate(context, evaluation, { proposedCandidate:substituted }), WorkItemVerificationGateError);
});

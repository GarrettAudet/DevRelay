import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

const CANDIDATE_SCOPE = "work-item-verification/candidate";
const APPROVED_SCOPE = "work-item-verification/approved";
const WORK_ITEM_SCOPE = "work-breakdown/candidate";
const REQUIREMENTS_SCOPE = "requirements/baseline";
const fail = (message) => { throw new TypeError(`work-item-verification traceability contributor: ${message}`); };
const immutable = (value) => Object.freeze(structuredClone(value));
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const refFor = (value) => ({ artifactId: value.normalizedEvidenceId ?? value.candidateId ?? value.subjectId ?? value.evaluationId, digest: value.evidenceDigest ?? value.candidateDigest ?? value.subjectDigest ?? value.evaluationDigest });

function allLoaded(context) {
  return [...Object.values(context?.loadedInputs ?? {}), ...Object.values(context?.loadedOutputs ?? {})].flat();
}
function oneKind(context, kind) {
  const matches = allLoaded(context).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`exactly one loaded ${kind} artifact is required`);
  return matches[0];
}
function validate(loaded, context) {
  validateWorkItemVerificationArtifact(loaded.value, context);
  return loaded.value;
}
function locator(loaded, pointer, entity) {
  return { artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer: pointer, entityDigest: canonicalJsonDigest(entity) };
}
function endpoint(kind, stableId, authority, scope) { return { kind, stableId, authority, scope }; }
function sorted(values) { return values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en")); }
function exactLoadedApproval(loaded, context) {
  const value = loaded.value;
  const canonicalBytes = Buffer.from(canonicalJson(value), "utf8");
  if (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array)) fail("Gate approval requires loaded raw bytes");
  if (!Buffer.from(loaded.bytes).equals(canonicalBytes) || loaded.ref?.digest !== sha256Digest(canonicalBytes) || loaded.ref?.artifactId !== value.approvalId) fail("Gate approval raw bytes or ArtifactRef identity do not match the canonical artifact");
  return validate(loaded, context);
}

function canonicalContext(context) {
  const subjectLoaded = oneKind(context, "ValidatedVerificationSubject");
  const obligationsLoaded = oneKind(context, "VerificationObligationSet");
  const bindingLoaded = oneKind(context, "ValidatedVerifierBindingSet");
  const invocationLoaded = oneKind(context, "VerifierInvocation");
  const rawLoaded = oneKind(context, "RawVerifierResult");
  const evidenceLoaded = oneKind(context, "NormalizedVerificationEvidence");
  const policyLoaded = oneKind(context, "VerificationPolicy");
  const evaluationLoaded = oneKind(context, "VerificationPolicyEvaluation");
  const candidateLoaded = oneKind(context, "WorkItemVerificationGateCandidate");
  const subject = validate(subjectLoaded);
  const obligations = validate(obligationsLoaded);
  const binding = validate(bindingLoaded);
  const invocation = validate(invocationLoaded);
  const rawResult = validate(rawLoaded, { invocation, binding, obligations });
  const evidence = validate(evidenceLoaded, { rawResult, invocation, binding, obligations, checkpointDigest: evidenceLoaded.value.checkpointDigest });
  const policy = validate(policyLoaded);
  const evaluation = validate(evaluationLoaded, { policy, binding, subject, normalizedEvidence: evidence, obligations });
  const candidate = validate(candidateLoaded, { policyEvaluation: evaluation, binding, subject, obligations, normalizedEvidence: evidence });
  if (!sameRef(obligations.subject, refFor(subject)) || !sameRef(evidence.subject, refFor(subject))) fail("subject lineage is stale or substituted");
  if (!sameRef(candidate.subject, refFor(subject)) || !sameRef(candidate.obligationSet, { artifactId: obligations.obligationSetId, digest: obligations.obligationSetDigest }) || !sameRef(candidate.normalizedEvidence, refFor(evidence)) || !sameRef(candidate.policyEvaluation, refFor(evaluation))) fail("candidate lineage is stale or substituted");
  return { subjectLoaded, obligationsLoaded, evidenceLoaded, evaluationLoaded, candidateLoaded, subject, obligations, evidence, evaluation, candidate };
}

function candidateProjection(context) {
  const traceLoaded = oneKind(context, "WorkItemVerificationTraceabilityCandidate");
  const trace = validate(traceLoaded);
  const values = canonicalContext(context);
  if (!sameRef(trace.candidate, refFor(values.candidate)) || !sameRef(trace.subject, refFor(values.subject)) || !sameRef(trace.evidence, refFor(values.evidence))) fail("candidate traceability artifact has stale or substituted lineage");
  const nodes = values.evidence.items.map((item, index) => ({ kind: "verification-evidence", stableId: item.evidenceId, label: item.evidenceId, attributes: { evidenceKind: item.kind, observedStatus: item.status, artifact: structuredClone(item.artifact), producer: structuredClone(item.producer), verificationAttemptId: values.evidence.verificationAttemptId, subject: structuredClone(trace.subject), candidate: structuredClone(trace.candidate), evaluation: structuredClone(values.candidate.policyEvaluation) }, sourceLocators: [locator(values.evidenceLoaded, `/items/${index}`, item), locator(traceLoaded, "", trace)] }));
  return { horizon: "verification", nodes: sorted(nodes), edges: [] };
}

function approvedProjection(context) {
  const traceLoaded = oneKind(context, "ApprovedWorkItemVerificationTraceability");
  const trace = validate(traceLoaded);
  const values = canonicalContext(context);
  const approvalLoaded = oneKind(context, "WorkItemVerificationGateApproval");
  const approval = exactLoadedApproval(approvalLoaded, { candidate: values.candidate, normalizedEvidence: values.evidence, obligations: values.obligations });
  if (values.candidate.outcome !== "verified") fail("approved traceability requires an exact verified Gate candidate");
  if (!sameRef(trace.gateApproval, { artifactId: approval.approvalId, digest: approval.approvalDigest })) fail("approved traceability Gate approval is missing, stale, or substituted");
  if (!sameRef(trace.candidate, refFor(values.candidate))) fail("approved traceability candidate is stale or substituted");
  if (trace.acceptedEvidence.length !== 1 || !sameRef(trace.acceptedEvidence[0], refFor(values.evidence))) fail("approved traceability evidence is stale, substituted, or incomplete");
  if (!sameRef(trace.candidate, approval.candidate) || canonicalJson(trace.acceptedEvidence) !== canonicalJson(approval.acceptedEvidence) || canonicalJson([...trace.acceptanceCriterionIds].sort()) !== canonicalJson([...approval.acceptanceCriterionIds].sort())) fail("approved traceability does not exactly reproduce the authoritative Gate approval");
  const acceptedIds = new Set(values.evidence.items.map(({ evidenceId }) => evidenceId));
  const obligations = new Map(values.obligations.obligations.map((entry) => [entry.obligationId, entry]));
  const criterionIds = new Set(values.evidence.items.map(({ obligationId }) => obligations.get(obligationId)).filter((entry) => entry?.kind === "acceptance-criterion").map(({ sourceRef }) => sourceRef));
  if (criterionIds.size !== trace.acceptanceCriterionIds.length || !trace.acceptanceCriterionIds.every((id) => criterionIds.has(id))) fail("approved acceptance-criterion references do not exactly match accepted evidence");
  if (!values.subject.workItemId || criterionIds.size === 0 || acceptedIds.size === 0) fail("approved projection requires work-item, acceptance-criterion, and evidence references");
  const nodes = values.evidence.items.map((item, index) => ({ kind: "verification-evidence", stableId: item.evidenceId, label: item.evidenceId, attributes: { evidenceKind: item.kind, artifact: structuredClone(item.artifact), producer: structuredClone(item.producer), acceptedBy: structuredClone(trace.gateApproval) }, sourceLocators: [locator(values.evidenceLoaded, `/items/${index}`, item), locator(traceLoaded, "/gateApproval", trace.gateApproval)] }));
  const edges = [];
  for (const item of values.evidence.items) {
    const obligation = obligations.get(item.obligationId);
    if (obligation?.kind === "acceptance-criterion") edges.push({ kind: "verified-by", source: endpoint("acceptance-criterion", obligation.sourceRef, "approved", REQUIREMENTS_SCOPE), target: endpoint("verification-evidence", item.evidenceId, "approved", APPROVED_SCOPE), rationale: "The WorkItemVerification Gate accepted this exact evidence for the acceptance criterion.", sourceLocators: [locator(traceLoaded, "/gateApproval", trace.gateApproval)] });
    edges.push({ kind: "verified-by", source: endpoint("work-item", values.subject.workItemId, "candidate", WORK_ITEM_SCOPE), target: endpoint("verification-evidence", item.evidenceId, "approved", APPROVED_SCOPE), rationale: "The WorkItemVerification Gate accepted this exact evidence for the approved work item.", sourceLocators: [locator(traceLoaded, "/gateApproval", trace.gateApproval)] });
  }
  return { horizon: "verification", nodes: sorted(nodes), edges: sorted(edges) };
}

function contributor({ id, authority, scope, traceKind, project }) {
  return Object.freeze({ metadata: immutable({ id, version: "1.0.0" }), authority, scope, ownership: immutable({ authority, scope, nodeKinds: ["verification-evidence"], edgeKinds: authority === "candidate" ? [] : ["verified-by"], retention: "append-only" }), match(context) { return allLoaded(context).some(({ value }) => value?.kind === traceKind); }, async project(context) { if (!this.match(context)) fail("project called for a nonmatching execution"); return project(context); } });
}

export const workItemVerificationCandidateTraceabilityContributor = contributor({ id: "devrelay.work-item-verification-candidate", authority: "candidate", scope: CANDIDATE_SCOPE, traceKind: "WorkItemVerificationTraceabilityCandidate", project: candidateProjection });
export const workItemVerificationApprovedTraceabilityContributor = contributor({ id: "devrelay.work-item-verification-approved", authority: "approved", scope: APPROVED_SCOPE, traceKind: "ApprovedWorkItemVerificationTraceability", project: approvedProjection });
export const workItemVerificationTraceabilityContributors = Object.freeze([workItemVerificationCandidateTraceabilityContributor, workItemVerificationApprovedTraceabilityContributor]);

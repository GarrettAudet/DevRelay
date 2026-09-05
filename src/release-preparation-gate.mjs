import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  RELEASE_PREPARATION_ARTIFACT_CONTRACTS,
  validateReleasePreparationArtifact,
  withReleasePreparationContentDigest,
} from "./release-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const MATURITY = ["contract-defined", "fixture-conformant", "live-conformant", "release-ready"];

export class ReleasePreparationGateError extends Error {
  constructor(message, code = "DR5550") {
    super(`release preparation Gate failed: ${message}`);
    this.name = "ReleasePreparationGateError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new ReleasePreparationGateError(message, code); };
const sameRef = (left, right) => Boolean(left && right && left.artifactId === right.artifactId && left.schema === right.schema && left.mediaType === right.mediaType && left.digest === right.digest && left.uri === right.uri);
const refFor = (value) => {
  const contract = RELEASE_PREPARATION_ARTIFACT_CONTRACTS[value.kind];
  const artifactId = value.approvalId ?? value.baselineId;
  const digest = sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
  return { artifactId, schema: contract.schema, mediaType: contract.mediaType, digest, uri: `memory://devrelay/release-preparation/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json` };
};

function effectBlockers(effectReviews) {
  const blockers = [];
  for (const review of effectReviews ?? []) {
    if (review.forbiddenEffects?.length) blockers.push(`effect:${review.reviewId}:forbidden`);
    else if (review.effects?.length && review.decision !== "approved") blockers.push(`effect:${review.reviewId}:unapproved`);
  }
  return blockers;
}

export function evaluateReleaseVerificationGate({ approvalId, baselineId, releaseCandidate, releaseCandidateRef, verificationCandidate, verificationCandidateRef, resultSet, resultSetRef, policy, policyRef, terminalCheckpointDigest, requiredMaturity = "fixture-conformant", effectReviews = [], approvalEvidence = [resultSetRef], sourceRefs } = {}) {
  validateReleasePreparationArtifact(releaseCandidate, { ref: releaseCandidateRef });
  validateReleasePreparationArtifact(policy, { ref: policyRef });
  validateReleasePreparationArtifact(resultSet, { candidateRef: releaseCandidateRef, policy, policyRef, ref: resultSetRef });
  validateReleasePreparationArtifact(verificationCandidate, { resultSet, resultSetRef, policy, ref: verificationCandidateRef });
  if (!sameRef(verificationCandidate.candidate, releaseCandidateRef)) fail("verification candidate substitutes its release candidate", "DR5551");
  if (!terminalCheckpointDigest?.startsWith("sha256:")) fail("exact terminal checkpoint digest is required", "DR5551");
  const requiredIndex = MATURITY.indexOf(requiredMaturity);
  const actualIndex = MATURITY.indexOf(resultSet.adapter.maturity);
  if (requiredIndex < 0) fail("required adapter maturity is invalid");
  const resultBlockers = resultSet.results.filter(({ obligationId, status }) => policy.obligations.find(({ id }) => id === obligationId)?.required && !["pass", "not-applicable"].includes(status)).map(({ obligationId }) => obligationId);
  const blockers = [...new Set([...resultBlockers, ...effectBlockers(effectReviews), ...(actualIndex < requiredIndex ? [`maturity:${resultSet.adapter.id}`] : [])])].sort();
  const warnings = resultSet.results.filter(({ obligationId, status }) => !policy.obligations.find(({ id }) => id === obligationId)?.required && !["pass", "not-applicable"].includes(status)).map(({ obligationId }) => obligationId).sort();
  const decision = blockers.length ? "remediation-required" : "ready";
  const verificationOutcome = resultBlockers.length ? "remediation-required" : "ready";
  if (verificationCandidate.proposedOutcome !== verificationOutcome || JSON.stringify(verificationCandidate.blockers) !== JSON.stringify(resultBlockers.sort())) fail("verification candidate is stale or differs from the Gate truth table", "DR5552");
  const approval = validateReleasePreparationArtifact(withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseGateApproval", approvalId, authority: "devrelay-core", decision, candidate: structuredClone(verificationCandidateRef), terminalCheckpointDigest, policyVersion: policy.version }), { candidate: verificationCandidate, candidateRef: verificationCandidateRef });
  const approvalRef = refFor(approval);
  let readinessBaseline = null;
  let readinessBaselineRef = null;
  if (decision === "ready") {
    readinessBaseline = validateReleasePreparationArtifact(withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseReadinessBaseline", baselineId, version: releaseCandidate.packageVersion, candidate: structuredClone(releaseCandidateRef), verificationCandidate: structuredClone(verificationCandidateRef), gateApproval: approvalRef, publicationAuthorized: false, approvalEvidence: structuredClone(approvalEvidence), sourceRefs: structuredClone(sourceRefs) }), { candidateRef: verificationCandidateRef, approval, approvalRef });
    readinessBaselineRef = refFor(readinessBaseline);
  }
  const summary = Object.freeze({ apiVersion: API, kind: "ReleaseReadinessSummary", version: releaseCandidate.packageVersion, decision, source: structuredClone(releaseCandidate.source), candidateDigest: releaseCandidateRef.digest, policy: { id: policy.policyId, version: policy.version, digest: policyRef.digest }, adapter: structuredClone(resultSet.adapter), artifacts: releaseCandidate.artifacts.map(({ kind, artifact }) => ({ kind, digest: artifact.digest })).sort((a, b) => a.kind.localeCompare(b.kind, "en")), obligations: { total: resultSet.results.length, passed: resultSet.results.filter(({ status }) => status === "pass").length, notApplicable: resultSet.results.filter(({ status }) => status === "not-applicable").length, failed: resultSet.results.filter(({ status }) => status === "fail").length, unknown: resultSet.results.filter(({ status }) => status === "unknown").length }, blockers, warnings, checkpointDigest: terminalCheckpointDigest, publicationAuthorized: false, nextModule: decision === "ready" ? "business-acceptance" : null });
  return Object.freeze({ approval, approvalRef, readinessBaseline, readinessBaselineRef, summary: Object.freeze({ ...summary, summaryDigest: canonicalJsonDigest(summary) }) });
}

export function renderReleaseReadinessSummary(summary) {
  const lines = [`# Release readiness: ${summary.version}`, "", `Decision: ${summary.decision}`, `Candidate: ${summary.candidateDigest}`, `Policy: ${summary.policy.id} ${summary.policy.version}`, `Adapter: ${summary.adapter.id}@${summary.adapter.version} (${summary.adapter.maturity})`, `Obligations: ${summary.obligations.passed} passed, ${summary.obligations.notApplicable} policy-backed N/A, ${summary.obligations.failed} failed, ${summary.obligations.unknown} unknown`, `Publication authorized: no`, `Next: ${summary.nextModule ?? "remediation"}`];
  if (summary.blockers.length) lines.push("", "Blockers:", ...summary.blockers.map((item) => `- ${item}`));
  if (summary.warnings.length) lines.push("", "Warnings:", ...summary.warnings.map((item) => `- ${item}`));
  return `${lines.join("\n")}\n`;
}

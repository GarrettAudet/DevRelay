import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI = "https://devrelay.dev/contracts/release-preparation-artifacts.schema.json";
const validator = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/release-preparation-artifacts.schema.json", import.meta.url), "utf8")));

export const RELEASE_PREPARATION_ARTIFACT_CONTRACTS = Object.freeze({
  ReleasePreparationAttempt: Object.freeze({ schema: "https://devrelay.dev/artifacts/release-preparation-attempt/v1", mediaType: "application/vnd.devrelay.release-preparation-attempt+json" }),
  ReleaseMaterializationReceipt: Object.freeze({ schema: "https://devrelay.dev/evidence/release-materialization-receipt/v1", mediaType: "application/vnd.devrelay.release-materialization-receipt+json" }),
  ReleaseCandidate: Object.freeze({ schema: "https://devrelay.dev/artifacts/release-candidate/v1", mediaType: "application/vnd.devrelay.release-candidate+json" }),
  ReleaseVerificationPolicy: Object.freeze({ schema: "https://devrelay.dev/artifacts/release-verification-policy/v1", mediaType: "application/vnd.devrelay.release-verification-policy+json" }),
  ReleaseVerificationResultSet: Object.freeze({ schema: "https://devrelay.dev/evidence/release-verification-result-set/v1", mediaType: "application/vnd.devrelay.release-verification-result-set+json" }),
  ReleaseVerificationCandidate: Object.freeze({ schema: "https://devrelay.dev/artifacts/release-verification-candidate/v1", mediaType: "application/vnd.devrelay.release-verification-candidate+json" }),
  ReleaseGateApproval: Object.freeze({ schema: "https://devrelay.dev/evidence/release-gate-approval/v1", mediaType: "application/vnd.devrelay.release-gate-approval+json" }),
  ReleaseReadinessBaseline: Object.freeze({ schema: "https://devrelay.dev/artifacts/release-readiness-baseline/v1", mediaType: "application/vnd.devrelay.release-readiness-baseline+json" }),
  ReleaseGatePromotionProof: Object.freeze({ schema: "https://devrelay.dev/evidence/release-gate-promotion/v1", mediaType: "application/vnd.devrelay.release-gate-promotion+json" }),
});

const idByKind = Object.freeze({
  ReleasePreparationAttempt: "attemptId", ReleaseMaterializationReceipt: "receiptId", ReleaseCandidate: "candidateId",
  ReleaseVerificationPolicy: "policyId", ReleaseVerificationResultSet: "resultSetId", ReleaseVerificationCandidate: "verificationCandidateId",
  ReleaseGateApproval: "approvalId", ReleaseReadinessBaseline: "baselineId", ReleaseGatePromotionProof: "proofId",
});
const REQUIRED_CANDIDATE_KINDS = Object.freeze(["installable-tarball", "release-catalog", "cyclonedx-sbom", "sha256-ledger", "release-notes", "license-notice", "evidence-index"]);

export class ReleasePreparationArtifactValidationError extends Error {
  constructor(message) {
    super(`release preparation artifact is invalid: ${message}`);
    this.name = "ReleasePreparationArtifactValidationError";
    this.code = "DR5500";
  }
}
const fail = (message) => { throw new ReleasePreparationArtifactValidationError(message); };
const sameRef = (left, right) => Boolean(left && right && left.artifactId === right.artifactId && left.schema === right.schema && left.mediaType === right.mediaType && left.digest === right.digest);
function unique(values, identity, label) {
  const seen = new Set();
  for (const value of values) {
    const key = identity(value);
    if (seen.has(key)) fail(`${label} repeats ${key}`);
    seen.add(key);
  }
}
function verifyContentDigest(value) {
  const { contentDigest, ...material } = value;
  if (contentDigest !== canonicalJsonDigest(material)) fail(`${value.kind} contentDigest does not bind canonical content`);
}
function validateAttempt(value) {
  unique(value.baselines, ({ artifactId }) => artifactId, "attempt baselines");
  unique(value.toolchain, ({ id }) => id, "attempt toolchain");
}
function validateReceipt(value) {
  unique(value.grants, ({ kind, scope }) => `${kind}\u0000${scope}`, "materialization grants");
  unique(value.artifacts, ({ artifactId }) => artifactId, "materialized artifacts");
  if (value.replayed && value.commands.length > 0) fail("replayed materialization receipt contains command effects");
  if (value.grants.some(({ kind, scope }) => kind === "network.connect" && !scope.startsWith("host:"))) fail("network grant lacks an exact host scope");
}
function validateCandidate(value, context) {
  unique(value.artifacts, ({ id }) => id, "candidate artifacts");
  unique(value.artifacts, ({ kind }) => kind, "candidate artifact kinds");
  unique(value.materializationReceipts, ({ artifactId }) => artifactId, "materialization receipts");
  const kinds = new Set(value.artifacts.map(({ kind }) => kind));
  const missing = REQUIRED_CANDIDATE_KINDS.filter((kind) => !kinds.has(kind));
  if (missing.length) fail(`candidate lacks required artifacts: ${missing.join(", ")}`);
  if (context.attempt) {
    if (!sameRef(value.attempt, context.attemptRef)) fail("candidate does not bind the exact preparation attempt");
    if (value.packageVersion !== context.attempt.packageVersion || value.source.commit !== context.attempt.source.commit || value.source.tree !== context.attempt.source.tree) fail("candidate identity differs from its preparation attempt");
  }
}
function validatePolicy(value) {
  unique(value.obligations, ({ id }) => id, "verification obligations");
}
function validateResultSet(value, context) {
  unique(value.results, ({ obligationId }) => obligationId, "verification results");
  if (context.candidateRef) {
    if (!sameRef(value.candidate, context.candidateRef) || value.candidateDigest !== context.candidateRef.digest) fail("result set does not bind the exact candidate bytes");
    if (value.results.some(({ subjectDigest }) => subjectDigest !== context.candidateRef.digest)) fail("verification result is bound to different candidate bytes");
  }
  if (context.policy) {
    if (!sameRef(value.policy, context.policyRef)) fail("result set does not bind the exact policy");
    const obligations = new Map(context.policy.obligations.map((item) => [item.id, item]));
    if (obligations.size !== value.results.length || value.results.some(({ obligationId }) => !obligations.has(obligationId))) fail("result set does not cover every policy obligation exactly once");
    for (const result of value.results) {
      const obligation = obligations.get(result.obligationId);
      if (result.status === "not-applicable" && (!result.notApplicableRule || result.notApplicableRule !== obligation.notApplicableRule)) fail(`not-applicable result ${result.obligationId} lacks the exact policy rule`);
      if (result.status !== "not-applicable" && result.notApplicableRule) fail(`non-not-applicable result ${result.obligationId} claims a policy rule`);
    }
  }
}
function validateVerificationCandidate(value, context) {
  unique(value.blockers, (id) => id, "verification blockers");
  unique(value.warnings, (id) => id, "verification warnings");
  if (context.resultSet && !sameRef(value.resultSet, context.resultSetRef)) fail("verification candidate does not bind the exact result set");
  const obligations = context.policy ? new Map(context.policy.obligations.map((item) => [item.id, item])) : null;
  const blocking = context.resultSet?.results.filter(({ obligationId, status }) =>
    !["pass", "not-applicable"].includes(status) && (!obligations || obligations.get(obligationId)?.required),
  ) ?? [];
  if (value.proposedOutcome === "ready" && (value.blockers.length || blocking.length)) fail("ready verification candidate contains blocking results");
  if (value.proposedOutcome !== "ready" && value.diagnostics.length === 0) fail(`${value.proposedOutcome} candidate lacks diagnostics`);
}
function validateGateApproval(value, context) {
  if (!context.candidate) return;
  if (!sameRef(value.candidate, context.candidateRef)) fail("Gate approval does not bind the exact verification candidate");
  if (value.decision === "ready" && context.candidate.proposedOutcome !== "ready") fail("Gate cannot upgrade a non-ready candidate");
}
function validateReadiness(value, context) {
  if (value.publicationAuthorized !== false) fail("release readiness cannot authorize publication");
  if (context.candidateRef && !sameRef(value.verificationCandidate, context.candidateRef)) fail("readiness does not bind the exact verification candidate");
  if (context.approval) {
    if (!sameRef(value.gateApproval, context.approvalRef)) fail("readiness does not bind the exact Gate approval");
    if (context.approval.decision !== "ready") fail("readiness derives from a non-ready Gate decision");
  }
}
function validatePromotion(value, context) {
  if (context.approvalRef && !sameRef(value.approval, context.approvalRef)) fail("promotion does not bind the exact Gate approval");
  if (context.readinessRef && !sameRef(value.readinessBaseline, context.readinessRef)) fail("promotion does not bind the exact readiness baseline");
}

export function withReleasePreparationContentDigest(value) {
  const { contentDigest: _contentDigest, ...material } = value;
  return Object.freeze({ ...material, contentDigest: canonicalJsonDigest(material) });
}

export function validateReleasePreparationArtifact(value, context = {}) {
  if (!validator(value)) fail(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const contract = RELEASE_PREPARATION_ARTIFACT_CONTRACTS[value.kind];
  if (!contract) fail(`unsupported kind ${value.kind}`);
  if (context.ref && (context.ref.artifactId !== value[idByKind[value.kind]] || context.ref.schema !== contract.schema || context.ref.mediaType !== contract.mediaType)) fail(`${value.kind} ArtifactRef does not identify its published contract`);
  verifyContentDigest(value);
  if (value.kind === "ReleasePreparationAttempt") validateAttempt(value);
  if (value.kind === "ReleaseMaterializationReceipt") validateReceipt(value);
  if (value.kind === "ReleaseCandidate") validateCandidate(value, context);
  if (value.kind === "ReleaseVerificationPolicy") validatePolicy(value);
  if (value.kind === "ReleaseVerificationResultSet") validateResultSet(value, context);
  if (value.kind === "ReleaseVerificationCandidate") validateVerificationCandidate(value, context);
  if (value.kind === "ReleaseGateApproval") validateGateApproval(value, context);
  if (value.kind === "ReleaseReadinessBaseline") validateReadiness(value, context);
  if (value.kind === "ReleaseGatePromotionProof") validatePromotion(value, context);
  return value;
}

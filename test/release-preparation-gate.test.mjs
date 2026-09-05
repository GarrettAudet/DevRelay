import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { withReleasePreparationContentDigest } from "../src/release-preparation-artifact-validator.mjs";
import { ReleasePreparationGateError, evaluateReleaseVerificationGate, renderReleaseReadinessSummary } from "../src/release-preparation-gate.mjs";

const API = "devrelay.dev/v1alpha1";
const D = canonicalJsonDigest;
const ref = (artifactId, schema = `https://devrelay.dev/artifacts/${artifactId.toLowerCase()}/v1`, mediaType = "application/json", digest = D(artifactId)) => ({ artifactId, schema, mediaType, digest, uri: `memory://fixture/${artifactId}` });
const sourceRefs = [{ role: "requirements", artifact: ref("REQ") }];
const artifacts = ["installable-tarball", "release-catalog", "cyclonedx-sbom", "sha256-ledger", "release-notes", "license-notice", "evidence-index"].map((kind) => ({ id: kind, kind, artifact: ref(kind) }));
const releaseCandidate = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseCandidate", candidateId: "RC-GATE", attempt: ref("ATTEMPT"), source: { commit: "a".repeat(40), tree: D("tree") }, packageVersion: "0.10.0-rc.3", artifacts, materializationReceipts: [ref("RECEIPT")], checkpointDigest: D("materialization"), sourceRefs });
const releaseCandidateRef = ref("RC-GATE", "https://devrelay.dev/artifacts/release-candidate/v1", "application/vnd.devrelay.release-candidate+json", D("release-candidate-bytes"));
const policy = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationPolicy", policyId: "RVP-GATE", version: "1.0.0", obligations: [{ id: "TESTS", family: "tests", required: true }, { id: "ATTEST", family: "attestation", required: true, notApplicableRule: "NO-LIVE" }, { id: "DOCS", family: "documentation", required: false }], offlineByDefault: true, failClosed: true, sourceRefs });
const policyRef = ref("RVP-GATE", "https://devrelay.dev/artifacts/release-verification-policy/v1", "application/vnd.devrelay.release-verification-policy+json", policy.contentDigest);

function fixtures({ testStatus = "pass", docsStatus = "pass", maturity = "fixture-conformant", proposedOutcome = testStatus === "pass" ? "ready" : "remediation-required" } = {}) {
  const results = [{ obligationId: "TESTS", status: testStatus, subjectDigest: releaseCandidateRef.digest, evidence: [] }, { obligationId: "ATTEST", status: "not-applicable", subjectDigest: releaseCandidateRef.digest, notApplicableRule: "NO-LIVE", evidence: [] }, { obligationId: "DOCS", status: docsStatus, subjectDigest: releaseCandidateRef.digest, evidence: [] }];
  const resultSet = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationResultSet", resultSetId: "RVRS-GATE", candidate: releaseCandidateRef, candidateDigest: releaseCandidateRef.digest, policy: policyRef, adapter: { id: "native.verify", version: "1.0.0", maturity }, results, durationMs: 1, cacheHits: 0, retries: 0, diagnostics: [] });
  const resultSetRef = ref("RVRS-GATE", "https://devrelay.dev/evidence/release-verification-result-set/v1", "application/vnd.devrelay.release-verification-result-set+json", resultSet.contentDigest);
  const blockers = testStatus === "pass" ? [] : ["TESTS"];
  const verificationCandidate = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationCandidate", verificationCandidateId: "RVC-GATE", candidate: releaseCandidateRef, resultSet: resultSetRef, environmentReadinessReceipt: ref("ENV"), ownerIntent: ref("OWNER"), proposedOutcome, blockers, warnings: docsStatus === "pass" ? [] : ["DOCS"], diagnostics: proposedOutcome === "ready" ? [] : [{ code: "BLOCKED", severity: "error", message: "Required checks block readiness." }], sourceRefs });
  const verificationCandidateRef = ref("RVC-GATE", "https://devrelay.dev/artifacts/release-verification-candidate/v1", "application/vnd.devrelay.release-verification-candidate+json", verificationCandidate.contentDigest);
  return { resultSet, resultSetRef, verificationCandidate, verificationCandidateRef };
}
const run = (options = {}, extras = {}) => evaluateReleaseVerificationGate({ approvalId: "RGA-1", baselineId: "RRB-1", releaseCandidate, releaseCandidateRef, policy, policyRef, terminalCheckpointDigest: D("terminal"), approvalEvidence: [ref("EVIDENCE")], sourceRefs, ...fixtures(options), ...extras });

test("Core Gate promotes exact ready evidence without authorizing publication", () => {
  const result = run();
  assert.equal(result.approval.authority, "devrelay-core");
  assert.equal(result.readinessBaseline.publicationAuthorized, false);
  assert.equal(result.summary.nextModule, "business-acceptance");
});

test("required failures produce remediation and no readiness baseline", () => {
  const result = run({ testStatus: "fail" });
  assert.equal(result.approval.decision, "remediation-required");
  assert.equal(result.readinessBaseline, null);
  assert.deepEqual(result.summary.blockers, ["TESTS"]);
});

test("optional failures remain visible warnings", () => {
  const result = run({ docsStatus: "unknown" });
  assert.equal(result.approval.decision, "ready");
  assert.deepEqual(result.summary.warnings, ["DOCS"]);
});

test("maturity mismatch and unapproved effects block readiness", () => {
  const maturity = run({}, { requiredMaturity: "live-conformant" });
  assert.deepEqual(maturity.summary.blockers, ["maturity:native.verify"]);
  const effect = run({}, { effectReviews: [{ reviewId: "R", effects: [{ id: "E" }], forbiddenEffects: [], decision: "review-required" }] });
  assert.deepEqual(effect.summary.blockers, ["effect:R:unapproved"]);
});

test("stale candidate outcome, substituted refs, and checkpoint drift fail closed", () => {
  assert.throws(() => run({ proposedOutcome: "remediation-required" }), /stale/u);
  assert.throws(() => run({}, { releaseCandidateRef: { ...releaseCandidateRef, digest: D("other") } }), /exact candidate bytes|substitutes/u);
  assert.throws(() => run({}, { terminalCheckpointDigest: "bad" }), ReleasePreparationGateError);
});

test("compact summary is parity-bound and states the publication boundary", () => {
  const text = renderReleaseReadinessSummary(run().summary);
  assert.match(text, /Decision: ready/u);
  assert.match(text, /Publication authorized: no/u);
  assert.match(text, /Next: business-acceptance/u);
});

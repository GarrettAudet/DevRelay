import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_PREPARATION_ARTIFACT_CONTRACTS,
  ReleasePreparationArtifactValidationError,
  validateReleasePreparationArtifact,
  withReleasePreparationContentDigest,
} from "../src/release-preparation-artifact-validator.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const ref = (artifactId, contract, character = "a") => ({ artifactId, schema: contract?.schema ?? "https://devrelay.dev/artifacts/test/v1", mediaType: contract?.mediaType ?? "application/json", digest: digest(character), uri: `memory://devrelay/${artifactId}` });
const sourceRefs = [{ role: "requirements-baseline", artifact: ref("requirements", undefined, "b") }];
const source = { commit: "1".repeat(40), tree: digest("c") };

const attempt = withReleasePreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1", kind: "ReleasePreparationAttempt", attemptId: "RPA-001", source,
  baselines: [ref("requirements", undefined, "b"), ref("architecture", undefined, "d")], packageVersion: "0.11.0-rc.1",
  releaseConfigurationDigest: digest("e"), toolchain: [{ id: "node", version: "24.19.0", digest: digest("f") }],
  environmentReadinessReceipt: ref("ERR-001", undefined, "1"), ownerIntent: ref("OWNER-001", undefined, "2"), fingerprint: digest("3"), sourceRefs,
});
const attemptRef = ref("RPA-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleasePreparationAttempt, "4");
const receipt = withReleasePreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseMaterializationReceipt", receiptId: "RMR-001", attempt: attemptRef,
  adapter: { id: "native-node-windows-release", version: "1.0.0", maturity: "release-ready" },
  grants: [{ kind: "filesystem.write", scope: "C:/repos/DevRelay/.devrelay/release", purpose: "Write candidate bytes." }],
  commands: [{ fingerprint: digest("5"), exitCode: 0, durationMs: 10, stdoutDigest: digest("6"), stderrDigest: digest("7") }],
  artifacts: [ref("tarball", undefined, "8")], publicationEffects: [], replayed: false, checkpointKey: "release/materialize/RPA-001", durationMs: 10,
  evidence: [ref("command-receipt", undefined, "9")], diagnostics: [],
});
const requiredArtifacts = ["installable-tarball", "release-catalog", "cyclonedx-sbom", "sha256-ledger", "release-notes", "license-notice", "evidence-index"];
const candidate = withReleasePreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseCandidate", candidateId: "RC-001", attempt: attemptRef, source, packageVersion: attempt.packageVersion,
  artifacts: requiredArtifacts.map((kind, index) => ({ id: `RA-${index}`, kind, artifact: ref(`artifact-${index}`, undefined, "abcdef0"[index]) })),
  materializationReceipts: [ref("RMR-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseMaterializationReceipt, "a")], checkpointDigest: digest("b"), sourceRefs,
});
const candidateRef = ref("RC-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseCandidate, "c");
const policy = withReleasePreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseVerificationPolicy", policyId: "RVP-001", version: "1.0.0", offlineByDefault: true, failClosed: true,
  obligations: [{ id: "OBL-TESTS", family: "tests", required: true }, { id: "OBL-ATTEST", family: "attestation", required: true, notApplicableRule: "RULE-NO-SIGNING" }], sourceRefs,
});
const policyRef = ref("RVP-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseVerificationPolicy, "d");
const resultSet = withReleasePreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseVerificationResultSet", resultSetId: "RVRS-001", candidate: candidateRef, candidateDigest: candidateRef.digest, policy: policyRef,
  adapter: { id: "native-release-verifier", version: "1.0.0", maturity: "release-ready" },
  results: [{ obligationId: "OBL-TESTS", status: "pass", subjectDigest: candidateRef.digest, evidence: [ref("tests", undefined, "e")] }, { obligationId: "OBL-ATTEST", status: "not-applicable", subjectDigest: candidateRef.digest, notApplicableRule: "RULE-NO-SIGNING", evidence: [ref("na", undefined, "f")] }],
  durationMs: 100, cacheHits: 0, retries: 0, diagnostics: [],
});
const resultSetRef = ref("RVRS-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseVerificationResultSet, "e");
const verificationCandidate = withReleasePreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseVerificationCandidate", verificationCandidateId: "RVC-001", candidate: candidateRef, resultSet: resultSetRef,
  environmentReadinessReceipt: attempt.environmentReadinessReceipt, ownerIntent: attempt.ownerIntent, proposedOutcome: "ready", blockers: [], warnings: [], diagnostics: [], sourceRefs,
});
const verificationCandidateRef = ref("RVC-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseVerificationCandidate, "f");
const approval = withReleasePreparationContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseGateApproval", approvalId: "RGA-001", authority: "devrelay-core", decision: "ready", candidate: verificationCandidateRef, terminalCheckpointDigest: digest("1"), policyVersion: "release-gate/1.0.0" });
const approvalRef = ref("RGA-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseGateApproval, "2");
const readiness = withReleasePreparationContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseReadinessBaseline", baselineId: "RRB-001", version: "1.0.0", candidate: candidateRef, verificationCandidate: verificationCandidateRef, gateApproval: approvalRef, publicationAuthorized: false, approvalEvidence: [approvalRef], sourceRefs });
const readinessRef = ref("RRB-001", RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseReadinessBaseline, "3");
const promotion = withReleasePreparationContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ReleaseGatePromotionProof", proofId: "RGP-001", status: "promoted", candidate: verificationCandidateRef, approval: approvalRef, readinessBaseline: readinessRef, graphCheckpoint: ref("graph", undefined, "4"), checkpointDigest: digest("5"), nextModule: "business-acceptance" });

test("all canonical ReleasePreparation artifact kinds validate", () => {
  for (const value of [attempt, receipt, candidate, policy, resultSet, verificationCandidate, approval, readiness, promotion]) validateReleasePreparationArtifact(value);
});

test("candidate binds exact attempt identity and the complete artifact set", () => {
  validateReleasePreparationArtifact(candidate, { attempt, attemptRef });
  const missing = structuredClone(candidate); missing.artifacts.pop();
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(missing)), /lacks required artifacts/u);
  const drifted = structuredClone(candidate); drifted.source.commit = "2".repeat(40);
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(drifted), { attempt, attemptRef }), /identity differs/u);
});

test("materialization replay is zero-effect and publication fields are closed", () => {
  const replayed = structuredClone(receipt); replayed.replayed = true;
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(replayed)), /contains command effects/u);
  const publishing = structuredClone(receipt); publishing.publicationEffects.push("npm publish");
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(publishing)), ReleasePreparationArtifactValidationError);
  const secret = structuredClone(receipt); secret.grants.push({ kind: "secrets.read", scope: "github", purpose: "publish" });
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(secret)), ReleasePreparationArtifactValidationError);
});

test("stored-byte verification covers the exact policy and candidate", () => {
  validateReleasePreparationArtifact(resultSet, { candidateRef, policy, policyRef });
  const omitted = structuredClone(resultSet); omitted.results.pop();
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(omitted), { candidateRef, policy, policyRef }), /cover every policy obligation/u);
  const substituted = structuredClone(resultSet); substituted.results[0].subjectDigest = digest("9");
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(substituted), { candidateRef, policy, policyRef }), /different candidate bytes/u);
  const unruled = structuredClone(resultSet); delete unruled.results[1].notApplicableRule;
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(unruled), { candidateRef, policy, policyRef }), /lacks the exact policy rule/u);
});

test("Gate and readiness bind exact evidence and never authorize publication", () => {
  validateReleasePreparationArtifact(verificationCandidate, { resultSet, resultSetRef });
  validateReleasePreparationArtifact(approval, { candidate: verificationCandidate, candidateRef: verificationCandidateRef });
  validateReleasePreparationArtifact(readiness, { candidateRef: verificationCandidateRef, approval, approvalRef });
  validateReleasePreparationArtifact(promotion, { approvalRef, readinessRef });
  const blocked = structuredClone(verificationCandidate); blocked.blockers.push("OBL-TESTS");
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(blocked), { resultSet, resultSetRef }), /contains blocking results/u);
  const published = structuredClone(readiness); published.publicationAuthorized = true;
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest(published)), ReleasePreparationArtifactValidationError);
});

test("ArtifactRef identity, additional properties, and canonical digests fail closed", () => {
  validateReleasePreparationArtifact(attempt, { ref: attemptRef });
  assert.throws(() => validateReleasePreparationArtifact(attempt, { ref: { ...attemptRef, schema: "https://example.com/wrong" } }), /published contract/u);
  assert.throws(() => validateReleasePreparationArtifact({ ...attempt, packageVersion: "9.0.0" }), /contentDigest/u);
  assert.throws(() => validateReleasePreparationArtifact(withReleasePreparationContentDigest({ ...attempt, credential: "forbidden" })), ReleasePreparationArtifactValidationError);
});

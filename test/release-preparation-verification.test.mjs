import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { withReleasePreparationContentDigest } from "../src/release-preparation-artifact-validator.mjs";
import { createInMemoryReleaseArtifactStore } from "../src/release-preparation-native-materializer.mjs";
import {
  RELEASE_VERIFICATION_FAMILIES,
  ReleasePreparationVerificationError,
  createReleaseVerificationPolicy,
  verifyStoredReleaseCandidate,
} from "../src/release-preparation-verification.mjs";

const API = "devrelay.dev/v1alpha1";
const D = canonicalJsonDigest;
const ref = (artifactId, schema = `https://devrelay.dev/artifacts/${artifactId.toLowerCase()}/v1`, mediaType = "application/json", digest = D(artifactId)) => ({ artifactId, schema, mediaType, digest, uri: `memory://fixture/${artifactId}` });
const sourceRefs = [{ role: "requirements", artifact: ref("REQ") }];
const environmentReadinessReceipt = ref("ENV");
const ownerIntent = ref("OWNER");

function fixture() {
  const store = createInMemoryReleaseArtifactStore();
  const kinds = ["installable-tarball", "release-catalog", "cyclonedx-sbom", "sha256-ledger", "release-notes", "license-notice", "evidence-index"];
  const artifacts = kinds.map((kind) => {
    const bytes = Buffer.from(kind === "cyclonedx-sbom" ? canonicalJson({ bomFormat: "CycloneDX", specVersion: "1.6" }) : `exact:${kind}\n`, "utf8");
    const artifact = store.put(bytes, { artifactId: `RP-${kind}`, schema: "https://devrelay.dev/artifacts/release-candidate-file/v1", mediaType: "application/octet-stream" });
    return { id: `RP-${kind}`, kind, artifact };
  });
  const candidate = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseCandidate", candidateId: "RC-VERIFY", attempt: ref("ATTEMPT"), source: { commit: "a".repeat(40), tree: D("tree") }, packageVersion: "0.10.0-rc.3", artifacts, materializationReceipts: [ref("RECEIPT")], checkpointDigest: D("checkpoint"), sourceRefs });
  const candidateRef = ref(candidate.candidateId, "https://devrelay.dev/artifacts/release-candidate/v1", "application/vnd.devrelay.release-candidate+json", sha256Digest(Buffer.from(canonicalJson(candidate), "utf8")));
  return { store, candidate, candidateRef };
}

function policy(overrides = {}) {
  return createReleaseVerificationPolicy({ policyId: "RVP-1", version: "1.0.0", obligations: RELEASE_VERIFICATION_FAMILIES.map((family) => ({ id: `RP-${family}`, family, required: true, ...(family === "attestation" ? { notApplicableRule: "RP-NO-LIVE-PROVIDER" } : {}) })), sourceRefs, ...overrides });
}

const adapter = { id: "native.release-verifier", version: "1.0.0", maturity: "fixture-conformant" };
const run = (overrides = {}) => {
  const base = fixture();
  const selectedPolicy = overrides.policy ?? policy();
  const policyRef = ref(selectedPolicy.policyId, "https://devrelay.dev/artifacts/release-verification-policy/v1", "application/vnd.devrelay.release-verification-policy+json", selectedPolicy.contentDigest);
  return verifyStoredReleaseCandidate({ resultSetId: "RVRS-1", verificationCandidateId: "RVC-1", candidate: base.candidate, candidateRef: base.candidateRef, artifactStore: base.store, policy: selectedPolicy, policyRef, adapter, verifier: { verify: async ({ obligation }) => obligation.family === "attestation" ? { status: "not-applicable", notApplicableRule: "RP-NO-LIVE-PROVIDER", evidence: [] } : { status: "pass", evidence: [] } }, environmentReadinessReceipt, ownerIntent, sourceRefs, ...overrides });
};

test("complete policy verifies every obligation against the exact candidate digest", async () => {
  const result = await run();
  assert.equal(result.resultSet.results.length, RELEASE_VERIFICATION_FAMILIES.length);
  assert.equal(result.resultSet.results.every(({ subjectDigest }) => subjectDigest === result.resultSet.candidateDigest), true);
  assert.equal(result.verificationCandidate.proposedOutcome, "ready");
  assert.equal(Object.keys(result.loadedArtifactDigests).length, 7);
});

test("failed, missing, stale, and unknown required evidence blocks readiness", async () => {
  for (const status of ["fail", "unknown"]) {
    const result = await run({ verifier: { verify: async ({ obligation }) => obligation.family === "static" ? { status, evidence: [] } : obligation.family === "attestation" ? { status: "not-applicable", notApplicableRule: "RP-NO-LIVE-PROVIDER", evidence: [] } : { status: "pass", evidence: [] } } });
    assert.equal(result.verificationCandidate.proposedOutcome, "remediation-required");
    assert.deepEqual(result.verificationCandidate.blockers, ["RP-static"]);
  }
  const result = await run({ verifier: { verify: async ({ obligation }) => { if (obligation.family === "static") throw new Error("missing tool result"); return obligation.family === "attestation" ? { status: "not-applicable", notApplicableRule: "RP-NO-LIVE-PROVIDER", evidence: [] } : { status: "pass", evidence: [] }; } } });
  assert.equal(result.resultSet.results.find(({ obligationId }) => obligationId === "RP-static").status, "unknown");
});

test("policy-backed not-applicable is exact and cannot be inferred", async () => {
  await assert.rejects(() => run({ verifier: { verify: async () => ({ status: "not-applicable", evidence: [] }) } }), /exact policy rule/u);
  await assert.rejects(() => run({ verifier: { verify: async () => ({ status: "not-applicable", notApplicableRule: "OTHER", evidence: [] }) } }), /exact policy rule/u);
});

test("candidate artifact substitution and truncation fail before verification", async () => {
  const base = fixture();
  const original = base.candidate.artifacts[0].artifact;
  const substitutedStore = { read: (artifact) => base.store.read(artifact.digest === original.digest ? { ...artifact, artifactId: "SUBSTITUTED" } : artifact) };
  await assert.rejects(() => run({ candidate: base.candidate, candidateRef: base.candidateRef, artifactStore: substitutedStore }), /missing or substituted/u);
  const truncatedStore = { read: (artifact) => artifact.digest === original.digest ? Buffer.from("short") : base.store.read(artifact) };
  await assert.rejects(() => run({ ...base, artifactStore: truncatedStore }), /digest differs/u);
});

test("verifier cannot substitute the candidate subject", async () => {
  await assert.rejects(() => run({ verifier: { verify: async () => ({ status: "pass", subjectDigest: D("other"), evidence: [] }) } }), /substituted the subject/u);
});

test("policy is versioned, complete, offline by default, and fail closed", () => {
  const value = policy();
  assert.equal(value.offlineByDefault, true);
  assert.equal(value.failClosed, true);
  assert.deepEqual(new Set(value.obligations.map(({ family }) => family)), new Set(RELEASE_VERIFICATION_FAMILIES));
  assert.throws(() => createReleaseVerificationPolicy({ policyId: "BAD", version: "1.0.0", obligations: [{ id: "X", family: "unknown", required: true }], sourceRefs }), ReleasePreparationVerificationError);
});

import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { withEnvironmentPreparationContentDigest } from "../src/environment-preparation-artifact-validator.mjs";
import {
  ReleasePreparationIdentityError,
  deriveReleasePreparationRoute,
  detectReleasePreparationIdentityDrift,
  resolveReleasePreparationAttempt,
} from "../src/release-preparation-identity-routing.mjs";
import { withReleasePreparationContentDigest } from "../src/release-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const D = (value) => canonicalJsonDigest(value);
const ref = (artifactId, schema = `https://devrelay.dev/artifacts/${artifactId.toLowerCase()}/v1`, mediaType = "application/json", digest = D(artifactId)) => ({ artifactId, schema, mediaType, digest, uri: `memory://fixture/${artifactId}` });
const shortRef = (artifactId, digest = D(artifactId)) => ({ artifactId, digest });
const loaded = (value, artifactId, schema, mediaType) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: ref(artifactId, schema, mediaType, sha256Digest(bytes)) };
};

const systemResultValue = {
  apiVersion: API, kind: "SystemVerificationResult", resultId: "SVR-RP-001",
  subject: shortRef("SUBJECT"), obligationSet: shortRef("OBLIGATIONS"), policy: shortRef("SV-POLICY"), evidence: shortRef("SV-EVIDENCE"), evaluation: shortRef("SV-EVALUATION"),
  outcome: "verified", progression: "business-acceptance-gate", authority: "system-verification",
  resultDigest: D({ resultId: "SVR-RP-001", subject: shortRef("SUBJECT"), obligationSet: shortRef("OBLIGATIONS"), policy: shortRef("SV-POLICY"), evidence: shortRef("SV-EVIDENCE"), evaluation: shortRef("SV-EVALUATION"), outcome: "verified", progression: "business-acceptance-gate", authority: "system-verification" }),
};
const systemVerification = loaded(systemResultValue, "SVR-RP-001", "https://devrelay.dev/artifacts/system-verification-result/v1", "application/vnd.devrelay.system-verification-result+json");
const repositoryValue = { apiVersion: API, kind: "RepositorySnapshot", repository: "C:/repos/DevRelay", revision: "a".repeat(40), treeDigest: D("tree"), includedPaths: ["src/**"], excludedPaths: [".git/**"] };
const repositorySnapshot = loaded(repositoryValue, "REPOSITORY", "https://devrelay.dev/artifacts/repository-snapshot/v1", "application/vnd.devrelay.repository-snapshot+json");
const ownerValue = { apiVersion: API, kind: "ReleaseOwnerIntent", intentId: "OWNER-RP-001", packageVersion: "0.10.0-rc.3", releaseDesignation: "prerelease", changelogApproved: true, publicationAuthorized: false, targetScope: { distribution: "github-source-and-installable-tarball", environment: "chatgpt-codex-desktop-windows" } };
const ownerIntent = loaded(ownerValue, "OWNER-RP-001", "https://devrelay.dev/artifacts/release-owner-intent/v1", "application/json");
const releasePolicyValue = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationPolicy", policyId: "RVP-RP-001", version: "1.0.0", obligations: [{ id: "OB-STATIC", family: "static", required: true }], offlineByDefault: true, failClosed: true, sourceRefs: [{ role: "requirements", artifact: ref("REQ") }] });
const releasePolicy = loaded(releasePolicyValue, "RVP-RP-001", "https://devrelay.dev/artifacts/release-verification-policy/v1", "application/vnd.devrelay.release-verification-policy+json");
const readinessValue = withEnvironmentPreparationContentDigest({
  apiVersion: API, kind: "EnvironmentReadinessReceipt", receiptId: "ERR-RP-001", candidate: ref("ENV-CANDIDATE"), gateApproval: ref("ENV-GATE"), repository: repositorySnapshot.ref, profileSet: ref("ENV-PROFILES"), frontierId: "RP-001", workItemIds: ["WI-RP-IDENTITY-ROUTING"], assignmentBaseline: ref("ASSIGNMENT"), executionAttemptId: "ENV-ATTEMPT", fingerprint: D("environment"), issuedAt: "2026-09-02T00:00:00.000Z", expiresAt: "2026-09-02T01:00:00.000Z", singleUse: true, consumed: false,
});
const readiness = loaded(readinessValue, "ERR-RP-001", "https://devrelay.dev/evidence/environment-readiness-receipt/v1", "application/vnd.devrelay.environment-readiness-receipt+json");
const baselines = ["requirements", "project-overview", "architecture", "contracts", "work-breakdown", "work-dependency", "specialist-assignment"].map((role) => loaded({ apiVersion: API, kind: "FixtureBaseline", role }, role.toUpperCase(), `https://devrelay.dev/artifacts/${role}/v1`, "application/json"));
const toolchain = [{ id: "node", version: "22.18.0", digest: D("node-22.18.0") }, { id: "npm", version: "10.9.3", digest: D("npm-10.9.3") }];

const input = (overrides = {}) => ({
  systemVerification, repositorySnapshot,
  approvedBaselines: baselines.map((entry, index) => ({ ...entry, role: ["requirements", "project-overview", "architecture", "contracts", "work-breakdown", "work-dependency", "specialist-assignment"][index] })),
  releasePolicy, packageVersion: "0.10.0-rc.3", releaseConfigurationDigest: D("release-config"), toolchain,
  environmentReadinessReceipt: readiness, ownerIntent, evaluatedAt: "2026-09-02T00:30:00.000Z", ...overrides,
});

test("Core derives every declared conditional route without accepting a caller-selected operation", () => {
  const base = { systemVerification, applicability: "applicable" };
  assert.equal(deriveReleasePreparationRoute(base).operation, "prepare-candidate");
  assert.equal(deriveReleasePreparationRoute({ ...base, currentAttempt: ref("ATTEMPT") }).operation, "resume-candidate");
  assert.equal(deriveReleasePreparationRoute({ ...base, currentAttempt: ref("ATTEMPT"), candidate: ref("CANDIDATE") }).operation, "verify-candidate");
  assert.equal(deriveReleasePreparationRoute({ ...base, currentAttempt: ref("ATTEMPT"), continuation: ref("CONTINUATION") }).operation, "resume-candidate");
  assert.equal(deriveReleasePreparationRoute({ systemVerification, applicability: "not-applicable" }).branch, "approved-not-applicable");
  assert.equal(deriveReleasePreparationRoute({ systemVerification, applicability: "unknown" }).branch, "needs-clarification");
  assert.throws(() => deriveReleasePreparationRoute({ ...base, operation: "verify-candidate" }), /unsupported fields/u);
});

test("routing rejects failed upstream authority and ambiguous lifecycle state", () => {
  const failed = loaded({ ...systemResultValue, outcome: "failed", progression: "none" }, "SVR-FAILED", systemVerification.ref.schema, systemVerification.ref.mediaType);
  assert.throws(() => deriveReleasePreparationRoute({ systemVerification: failed, applicability: "applicable" }), ReleasePreparationIdentityError);
  assert.throws(() => deriveReleasePreparationRoute({ systemVerification, applicability: "applicable", candidate: ref("CANDIDATE") }), /without its attempt/u);
  assert.throws(() => deriveReleasePreparationRoute({ systemVerification, applicability: "not-applicable", currentAttempt: ref("ATTEMPT") }), /cannot contain release execution state/u);
});

test("identity resolver emits one deterministic immutable exact attempt", () => {
  const first = resolveReleasePreparationAttempt(input());
  const second = resolveReleasePreparationAttempt(input());
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.source.commit, repositoryValue.revision);
  assert.equal(first.environmentReadinessReceipt.digest, readiness.ref.digest);
  assert.equal(first.ownerIntent.digest, ownerIntent.ref.digest);
  assert.equal(first.baselines.length, 7);
  assert.ok(first.sourceRefs.some(({ role, artifact }) => role === "release-policy" && artifact.digest === releasePolicy.ref.digest));
  assert.ok(first.sourceRefs.some(({ role, artifact }) => role === "system-verification" && artifact.digest === systemVerification.ref.digest));
});

test("owner decisions are explicit, exact, and never publication authority", () => {
  const mismatched = loaded({ ...ownerValue, packageVersion: "0.10.0" }, "OWNER-MISMATCH", ownerIntent.ref.schema, ownerIntent.ref.mediaType);
  const publishing = loaded({ ...ownerValue, publicationAuthorized: true }, "OWNER-PUBLISH", ownerIntent.ref.schema, ownerIntent.ref.mediaType);
  const unsupported = loaded({ ...ownerValue, targetScope: { ...ownerValue.targetScope, environment: "linux" } }, "OWNER-LINUX", ownerIntent.ref.schema, ownerIntent.ref.mediaType);
  for (const value of [mismatched, publishing, unsupported]) assert.throws(() => resolveReleasePreparationAttempt(input({ ownerIntent: value })), /owner intent/u);
});

test("missing, stale, consumed, and substituted readiness fail closed", () => {
  const staleValue = withEnvironmentPreparationContentDigest({ ...readinessValue, expiresAt: "2026-09-02T00:20:00.000Z" });
  const consumedValue = withEnvironmentPreparationContentDigest({ ...readinessValue, consumed: true });
  const substitutedValue = withEnvironmentPreparationContentDigest({ ...readinessValue, repository: ref("OTHER-REPOSITORY") });
  for (const [value, id] of [[staleValue, "STALE"], [consumedValue, "CONSUMED"], [substitutedValue, "SUBSTITUTED"]]) {
    const receipt = loaded(value, id, readiness.ref.schema, readiness.ref.mediaType);
    assert.throws(() => resolveReleasePreparationAttempt(input({ environmentReadinessReceipt: receipt })), /EnvironmentReadinessReceipt/u);
  }
});

test("source, version, baseline, policy, toolchain, and configuration drift create a new attempt", () => {
  const current = resolveReleasePreparationAttempt(input());
  const variants = [
    input({ repositorySnapshot: loaded({ ...repositoryValue, revision: "b".repeat(40) }, "REPOSITORY-B", repositorySnapshot.ref.schema, repositorySnapshot.ref.mediaType), environmentReadinessReceipt: undefined }),
    input({ packageVersion: "0.10.0-rc.4", ownerIntent: loaded({ ...ownerValue, packageVersion: "0.10.0-rc.4" }, "OWNER-RC4", ownerIntent.ref.schema, ownerIntent.ref.mediaType) }),
    input({ approvedBaselines: input().approvedBaselines.map((entry, index) => index === 0 ? { ...loaded({ apiVersion: API, kind: "FixtureBaseline", role: "requirements-v2" }, "REQUIREMENTS-V2", entry.ref.schema, entry.ref.mediaType), role: entry.role } : entry) }),
    input({ releasePolicy: loaded(withReleasePreparationContentDigest({ ...releasePolicyValue, version: "1.0.1" }), "RVP-RP-001", releasePolicy.ref.schema, releasePolicy.ref.mediaType) }),
    input({ toolchain: [{ ...toolchain[0], version: "22.19.0", digest: D("node-22.19.0") }, toolchain[1]] }),
    input({ releaseConfigurationDigest: D("release-config-v2") }),
  ];
  variants[0].environmentReadinessReceipt = loaded(withEnvironmentPreparationContentDigest({ ...readinessValue, repository: variants[0].repositorySnapshot.ref }), "ERR-RP-001", readiness.ref.schema, readiness.ref.mediaType);
  for (const variant of variants) {
    const proposed = resolveReleasePreparationAttempt(variant);
    const drift = detectReleasePreparationIdentityDrift(current, proposed);
    assert.equal(drift.driftDetected, true);
    assert.notEqual(proposed.attemptId, current.attemptId);
  }
  assert.equal(detectReleasePreparationIdentityDrift(current, resolveReleasePreparationAttempt(input())).driftDetected, false);
});

test("malformed raw bytes, duplicate baseline roles, unpinned tools, and configuration ambiguity fail closed", () => {
  const corruptOwner = { ...ownerIntent, bytes: Buffer.from("{}", "utf8") };
  assert.throws(() => resolveReleasePreparationAttempt(input({ ownerIntent: corruptOwner })), /bytes do not match/u);
  assert.throws(() => resolveReleasePreparationAttempt(input({ approvedBaselines: [...input().approvedBaselines, input().approvedBaselines[0]] })), /roles are ambiguous/u);
  assert.throws(() => resolveReleasePreparationAttempt(input({ toolchain: [{ id: "node", version: "22", digest: "latest" }] })), /unpinned/u);
  assert.throws(() => resolveReleasePreparationAttempt(input({ releaseConfigurationDigest: "ambient" })), /digest-bound/u);
});

test("drift routes to a fresh prepare operation and preserves prior identity", () => {
  const current = resolveReleasePreparationAttempt(input());
  const decision = deriveReleasePreparationRoute({ systemVerification, applicability: "applicable", currentAttempt: ref(current.attemptId), driftDetected: true });
  assert.equal(decision.operation, "prepare-candidate");
  assert.equal(decision.reasonCode, "RELEASE_IDENTITY_DRIFT");
  assert.equal(decision.replacesAttempt.artifactId, current.attemptId);
});

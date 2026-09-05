import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  RELEASE_PREPARATION_ARTIFACT_CONTRACTS,
  validateReleasePreparationArtifact,
  withReleasePreparationContentDigest,
} from "./release-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
export const RELEASE_VERIFICATION_FAMILIES = Object.freeze(["static", "tests", "exports", "isolated-install", "sbom", "checksums", "documentation", "secrets", "windows-consumer", "dependency", "action-pins", "license", "provenance", "attestation"]);
const STATUSES = new Set(["pass", "fail", "unknown", "not-applicable"]);

export class ReleasePreparationVerificationError extends Error {
  constructor(message, code = "DR5540") {
    super(`release preparation verification failed: ${message}`);
    this.name = "ReleasePreparationVerificationError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new ReleasePreparationVerificationError(message, code); };
const ordered = (values, key) => [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const sameRef = (left, right) => Boolean(left && right && left.artifactId === right.artifactId && left.schema === right.schema && left.mediaType === right.mediaType && left.digest === right.digest && left.uri === right.uri);

function artifactRef(value) {
  const contract = RELEASE_PREPARATION_ARTIFACT_CONTRACTS[value.kind];
  const artifactId = value.policyId ?? value.resultSetId ?? value.verificationCandidateId;
  const digest = sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
  return { artifactId, schema: contract.schema, mediaType: contract.mediaType, digest, uri: `memory://devrelay/release-preparation/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json` };
}

export function createReleaseVerificationPolicy({ policyId, version, obligations, sourceRefs } = {}) {
  if (!Array.isArray(obligations) || obligations.length === 0) fail("verification policy requires obligations");
  const normalized = ordered(obligations, ({ id }) => id).map((item) => {
    if (!item.id || !RELEASE_VERIFICATION_FAMILIES.includes(item.family) || typeof item.required !== "boolean") fail("obligation id, family, and required flag are required");
    if (item.notApplicableRule && !item.required) fail("not-applicable rules must govern required obligations");
    return { id: item.id, family: item.family, required: item.required, ...(item.notApplicableRule ? { notApplicableRule: item.notApplicableRule } : {}) };
  });
  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) fail("obligation ids must be unique");
  return validateReleasePreparationArtifact(withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationPolicy", policyId, version, obligations: normalized, offlineByDefault: true, failClosed: true, sourceRefs: structuredClone(sourceRefs) }));
}

function loadExactCandidate(candidate, candidateRef, artifactStore) {
  validateReleasePreparationArtifact(candidate, { ref: candidateRef });
  if (!artifactStore || typeof artifactStore.read !== "function") fail("verification requires a content-addressed artifact store");
  const loaded = new Map();
  for (const entry of candidate.artifacts) {
    const exact = Buffer.from(artifactStore.read(entry.artifact));
    if (sha256Digest(exact) !== entry.artifact.digest) fail(`stored artifact ${entry.id} digest differs`, "DR5541");
    loaded.set(entry.kind, Object.freeze({ ref: structuredClone(entry.artifact), bytes: exact }));
  }
  return loaded;
}

function normalizeObservation(obligation, observation, candidateRef) {
  if (!observation || !STATUSES.has(observation.status) || !Array.isArray(observation.evidence ?? [])) fail(`verifier returned a malformed result for ${obligation.id}`, "DR5542");
  if (observation.subjectDigest && observation.subjectDigest !== candidateRef.digest) fail(`verifier substituted the subject for ${obligation.id}`, "DR5542");
  if (observation.status === "not-applicable" && (!obligation.notApplicableRule || observation.notApplicableRule !== obligation.notApplicableRule)) fail(`not-applicable result ${obligation.id} lacks the exact policy rule`, "DR5542");
  if (observation.status !== "not-applicable" && observation.notApplicableRule) fail(`non-not-applicable result ${obligation.id} claims a policy rule`, "DR5542");
  return { obligationId: obligation.id, status: observation.status, subjectDigest: candidateRef.digest, ...(observation.status === "not-applicable" ? { notApplicableRule: obligation.notApplicableRule } : {}), evidence: structuredClone(observation.evidence ?? []) };
}

export async function verifyStoredReleaseCandidate({ resultSetId, verificationCandidateId, candidate, candidateRef, policy, policyRef = artifactRef(policy), artifactStore, adapter, verifier, environmentReadinessReceipt, ownerIntent, sourceRefs } = {}) {
  validateReleasePreparationArtifact(policy, { ref: policyRef });
  if (!adapter?.id || !adapter?.version || !["contract-defined", "fixture-conformant", "live-conformant", "release-ready"].includes(adapter.maturity) || typeof verifier?.verify !== "function") fail("verification requires an exact versioned adapter binding");
  const loaded = loadExactCandidate(candidate, candidateRef, artifactStore);
  const started = Date.now();
  const results = [];
  const diagnostics = [];
  for (const obligation of policy.obligations) {
    let observation;
    try {
      observation = await verifier.verify({ obligation: structuredClone(obligation), candidate: structuredClone(candidate), candidateRef: structuredClone(candidateRef), artifacts: new Map([...loaded].map(([kind, entry]) => [kind, { ref: structuredClone(entry.ref), bytes: Buffer.from(entry.bytes) }])) });
    } catch (error) {
      observation = { status: "unknown", evidence: [] };
      diagnostics.push({ code: "DR5543", severity: "error", message: `Verifier failed closed for ${obligation.id}: ${error.message}`, obligationId: obligation.id });
    }
    results.push(normalizeObservation(obligation, observation, candidateRef));
  }
  const resultSet = validateReleasePreparationArtifact(withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationResultSet", resultSetId, candidate: structuredClone(candidateRef), candidateDigest: candidateRef.digest, policy: structuredClone(policyRef), adapter: structuredClone(adapter), results, durationMs: Date.now() - started, cacheHits: 0, retries: 0, diagnostics }), { candidateRef, policy, policyRef });
  const resultSetRef = artifactRef(resultSet);
  const blockers = results.filter(({ obligationId, status }) => policy.obligations.find(({ id }) => id === obligationId).required && !["pass", "not-applicable"].includes(status)).map(({ obligationId }) => obligationId).sort();
  const warnings = results.filter(({ obligationId, status }) => !policy.obligations.find(({ id }) => id === obligationId).required && !["pass", "not-applicable"].includes(status)).map(({ obligationId }) => obligationId).sort();
  const proposedOutcome = blockers.length ? "remediation-required" : "ready";
  const candidateDiagnostics = blockers.length ? [{ code: "DR5544", severity: "error", message: `${blockers.length} required release verification obligations block readiness.` }] : [];
  const verificationCandidate = validateReleasePreparationArtifact(withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationCandidate", verificationCandidateId, candidate: structuredClone(candidateRef), resultSet: resultSetRef, environmentReadinessReceipt: structuredClone(environmentReadinessReceipt), ownerIntent: structuredClone(ownerIntent), proposedOutcome, blockers, warnings, diagnostics: candidateDiagnostics, sourceRefs: structuredClone(sourceRefs) }), { resultSet, resultSetRef, policy });
  return Object.freeze({ resultSet, resultSetRef, verificationCandidate, verificationCandidateRef: artifactRef(verificationCandidate), loadedArtifactDigests: Object.freeze(Object.fromEntries([...loaded].map(([kind, { ref }]) => [kind, ref.digest]))) });
}

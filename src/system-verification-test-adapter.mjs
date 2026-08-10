import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateSystemVerificationArtifact } from "./system-verification-artifact-validator.mjs";

export const TEST_SYSTEM_VERIFIER = Object.freeze({ id: "system-verifier.test", version: "1.0.0" });

export class SystemVerificationTestAdapterError extends Error {
  constructor(message) {
    super(`system verification test adapter rejected input: ${message}`);
    this.name = "SystemVerificationTestAdapterError";
    this.code = "DR4140";
  }
}

const fail = (message) => { throw new SystemVerificationTestAdapterError(message); };
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const sameVerifier = (value) => value?.id === TEST_SYSTEM_VERIFIER.id && value?.version === TEST_SYSTEM_VERIFIER.version;
const allowedKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
const validRef = (value) => allowedKeys(value, ["artifactId", "digest"]) && typeof value.artifactId === "string" && value.artifactId.length > 0 && /^sha256:[0-9a-f]{64}$/.test(value.digest);
const validBinding = (value) => allowedKeys(value, ["kind", "artifact"]) && typeof value.kind === "string" && value.kind.length > 0 && validRef(value.artifact);

function validateInvocation(invocation) {
  if (!allowedKeys(invocation, ["apiVersion", "kind", "invocationId", "subject", "obligationSet", "policy", "verifier", "assignedObligationIds", "verificationEnvironment", "grants", "invocationFingerprint"]) || invocation.apiVersion !== "devrelay.dev/v1alpha1" || invocation.kind !== "SystemVerifierInvocation") fail("exact SystemVerifierInvocation is required");
  if (invocation.invocationFingerprint !== digestBody(invocation, "invocationFingerprint")) fail("invocation fingerprint is stale");
  if (!sameVerifier(invocation.verifier)) fail("verifier identity or version was substituted");
  if (!Array.isArray(invocation.assignedObligationIds) || invocation.assignedObligationIds.length === 0 || new Set(invocation.assignedObligationIds).size !== invocation.assignedObligationIds.length) fail("assigned obligations are invalid");
}

function parseNative({ nativeBytes, nativeResult, nativeArtifact }) {
  if (!(Buffer.isBuffer(nativeBytes) || nativeBytes instanceof Uint8Array)) fail("exact native test bytes are required");
  const bytes = Buffer.from(nativeBytes);
  if (!validRef(nativeArtifact) || nativeArtifact.digest !== sha256Digest(bytes)) fail("native artifact must digest-bind the exact supplied bytes");
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { fail("native test bytes contain malformed JSON"); }
  if (nativeResult !== undefined && canonicalJson(parsed) !== canonicalJson(nativeResult)) fail("native test data does not match native bytes");
  if (!allowedKeys(parsed, ["tests"]) || !Array.isArray(parsed.tests)) fail("native test result is malformed or contains adapter-owned authority");
  return parsed;
}

export function adaptSystemTestResult({ invocation, nativeBytes, nativeResult, nativeArtifact }) {
  validateInvocation(invocation);
  const result = parseNative({ nativeBytes, nativeResult, nativeArtifact });
  const assigned = new Set(invocation.assignedObligationIds), byObligation = new Map();
  for (const entry of result.tests) {
    if (!allowedKeys(entry, ["obligationId", "status", "evidenceBindings"]) || !assigned.has(entry.obligationId) || !["pass", "fail", "inconclusive"].includes(entry.status) || !Array.isArray(entry.evidenceBindings) || entry.evidenceBindings.some((binding) => !validBinding(binding))) fail("machine test observation is malformed or references an unrelated obligation");
    if (entry.status !== "inconclusive" && entry.evidenceBindings.length === 0) fail("conclusive machine test observation requires evidence");
    const bindingKeys = entry.evidenceBindings.map((binding) => canonicalJson(binding));
    if (new Set(bindingKeys).size !== bindingKeys.length) fail(`duplicate machine test evidence binding for ${entry.obligationId}`);
    if (byObligation.has(entry.obligationId)) fail(`duplicate machine test observation for ${entry.obligationId}`);
    byObligation.set(entry.obligationId, entry);
  }
  const observations = [...assigned].sort().map((obligationId) => {
    const entry = byObligation.get(obligationId);
    return entry ? { obligationId, status: entry.status, evidenceBindings: structuredClone(entry.evidenceBindings).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))) } : { obligationId, status: "inconclusive", evidenceBindings: [] };
  });
  const nativeEvidence = [structuredClone(nativeArtifact)];
  const observationId = `SYSOBS-${canonicalJsonDigest({ invocationFingerprint: invocation.invocationFingerprint, verifier: TEST_SYSTEM_VERIFIER, observations, nativeEvidence }).slice(7, 31).toUpperCase()}`;
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "RawSystemVerifierObservation", observationId, invocationFingerprint: invocation.invocationFingerprint, subject: structuredClone(invocation.subject), obligationSet: structuredClone(invocation.obligationSet), verifier: structuredClone(TEST_SYSTEM_VERIFIER), observations, nativeEvidence };
  return validateSystemVerificationArtifact({ ...body, rawObservationDigest: digestBody(body, "rawObservationDigest") }, { invocation });
}

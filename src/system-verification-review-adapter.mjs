import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateSystemVerificationArtifact } from "./system-verification-artifact-validator.mjs";

export const REVIEW_SYSTEM_VERIFIER = Object.freeze({ id: "system-verifier.review", version: "1.0.0" });
export class SystemVerificationReviewAdapterError extends Error { constructor(message) { super(`system verification review adapter rejected input: ${message}`); this.name = "SystemVerificationReviewAdapterError"; this.code = "DR4141"; } }
const fail = (message) => { throw new SystemVerificationReviewAdapterError(message); };
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const allowedKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
const validRef = (value) => allowedKeys(value, ["artifactId", "digest"]) && typeof value.artifactId === "string" && value.artifactId.length > 0 && /^sha256:[0-9a-f]{64}$/.test(value.digest);
const validBinding = (value) => allowedKeys(value, ["kind", "artifact"]) && typeof value.kind === "string" && value.kind.length > 0 && validRef(value.artifact);
const sameVerifier = (value) => value?.id === REVIEW_SYSTEM_VERIFIER.id && value?.version === REVIEW_SYSTEM_VERIFIER.version;

export function adaptSystemReviewResult({ invocation, nativeBytes, nativeResult, nativeArtifact }) {
  if (!allowedKeys(invocation, ["apiVersion", "kind", "invocationId", "subject", "obligationSet", "policy", "verifier", "assignedObligationIds", "verificationEnvironment", "grants", "invocationFingerprint"]) || invocation.apiVersion !== "devrelay.dev/v1alpha1" || invocation.kind !== "SystemVerifierInvocation") fail("exact SystemVerifierInvocation is required");
  if (invocation.invocationFingerprint !== digestBody(invocation, "invocationFingerprint")) fail("invocation fingerprint is stale");
  if (!sameVerifier(invocation.verifier)) fail("verifier identity or version was substituted");
  if (!Array.isArray(invocation.assignedObligationIds) || invocation.assignedObligationIds.length === 0 || new Set(invocation.assignedObligationIds).size !== invocation.assignedObligationIds.length) fail("assigned obligations are invalid");
  if (!(Buffer.isBuffer(nativeBytes) || nativeBytes instanceof Uint8Array)) fail("exact native review bytes are required");
  const bytes = Buffer.from(nativeBytes);
  if (!validRef(nativeArtifact) || nativeArtifact.digest !== sha256Digest(bytes)) fail("native artifact must digest-bind the exact supplied bytes");
  let result; try { result = JSON.parse(bytes.toString("utf8")); } catch { fail("native review bytes contain malformed JSON"); }
  if (nativeResult !== undefined && canonicalJson(result) !== canonicalJson(nativeResult)) fail("native review data does not match native bytes");
  if (!allowedKeys(result, ["findings"]) || !Array.isArray(result.findings)) fail("native review result is malformed or contains adapter-owned authority");
  const assigned = new Set(invocation.assignedObligationIds), byObligation = new Map();
  for (const finding of result.findings) {
    if (!allowedKeys(finding, ["obligationId", "disposition", "evidenceBindings"]) || !assigned.has(finding.obligationId) || !["accepted", "rejected", "uncertain"].includes(finding.disposition) || !Array.isArray(finding.evidenceBindings) || finding.evidenceBindings.some((binding) => !validBinding(binding))) fail("review finding is malformed or references an unrelated obligation");
    if (finding.disposition !== "uncertain" && finding.evidenceBindings.length === 0) fail("conclusive review finding requires evidence");
    const bindingKeys = finding.evidenceBindings.map((binding) => canonicalJson(binding));
    if (new Set(bindingKeys).size !== bindingKeys.length) fail(`duplicate review evidence binding for ${finding.obligationId}`);
    if (byObligation.has(finding.obligationId)) fail(`duplicate review finding for ${finding.obligationId}`);
    byObligation.set(finding.obligationId, finding);
  }
  const status = { accepted: "pass", rejected: "fail", uncertain: "inconclusive" };
  const observations = [...assigned].sort().map((obligationId) => { const finding = byObligation.get(obligationId); return finding ? { obligationId, status: status[finding.disposition], evidenceBindings: structuredClone(finding.evidenceBindings).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))) } : { obligationId, status: "inconclusive", evidenceBindings: [] }; });
  const nativeEvidence = [structuredClone(nativeArtifact)];
  const observationId = `SYSOBS-${canonicalJsonDigest({ invocationFingerprint: invocation.invocationFingerprint, verifier: REVIEW_SYSTEM_VERIFIER, observations, nativeEvidence }).slice(7, 31).toUpperCase()}`;
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "RawSystemVerifierObservation", observationId, invocationFingerprint: invocation.invocationFingerprint, subject: structuredClone(invocation.subject), obligationSet: structuredClone(invocation.obligationSet), verifier: structuredClone(REVIEW_SYSTEM_VERIFIER), observations, nativeEvidence };
  return validateSystemVerificationArtifact({ ...body, rawObservationDigest: digestBody(body, "rawObservationDigest") }, { invocation });
}

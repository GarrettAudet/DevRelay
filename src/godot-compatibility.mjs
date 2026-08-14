import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const VERSION = "devrelay.dev/v1alpha1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const VERSION_VALUE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u;
const PLATFORM = /^[a-z0-9-]+$/u;

export class GodotCompatibilityError extends Error {
  constructor(message) {
    super("Godot compatibility is invalid: " + message);
    this.name = "GodotCompatibilityError";
    this.code = "DR4880";
  }
}
function fail(message) { throw new GodotCompatibilityError(message); }
function object(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object"); return value; }
function exactKeys(value, allowed, label) { const unknown = Object.keys(value).filter((key) => !allowed.includes(key)); if (unknown.length) fail(label + " has unknown fields: " + unknown.sort().join(", ")); }
function ref(value, label) {
  object(value, label);
  exactKeys(value, ["artifactId", "digest"], label);
  if (typeof value.artifactId !== "string" || !value.artifactId) fail(label + " artifactId is required");
  if (!DIGEST.test(value.digest)) fail(label + " digest is invalid");
  return { artifactId: value.artifactId, digest: value.digest };
}
function tuple(value, label) {
  object(value, label);
  exactKeys(value, ["godotVersion", "gdunitVersion", "godotAiVersion", "platform", "architecture", "evidence"], label);
  for (const key of ["godotVersion", "gdunitVersion", "godotAiVersion"]) if (!VERSION_VALUE.test(value[key])) fail(label + " " + key + " is invalid");
  for (const key of ["platform", "architecture"]) if (!PLATFORM.test(value[key])) fail(label + " " + key + " is invalid");
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) fail(label + " requires evidence");
  const evidence = value.evidence.map((entry, index) => ref(entry, label + " evidence " + index)).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
  return { godotVersion: value.godotVersion, gdunitVersion: value.gdunitVersion, godotAiVersion: value.godotAiVersion, platform: value.platform, architecture: value.architecture, evidence };
}
function tupleIdentity(value) { return [value.godotVersion, value.gdunitVersion, value.godotAiVersion, value.platform, value.architecture].join("|"); }

export function createGodotCompatibilityPolicy({ policyId, version = "1.0.0", supportedTuples } = {}) {
  if (typeof policyId !== "string" || !policyId) fail("policyId is required");
  if (!VERSION_VALUE.test(version)) fail("policy version is invalid");
  if (!Array.isArray(supportedTuples) || supportedTuples.length === 0) fail("supportedTuples are required");
  const tuples = supportedTuples.map((entry, index) => tuple(entry, "tuple " + index)).sort((left, right) => tupleIdentity(left).localeCompare(tupleIdentity(right), "en"));
  if (new Set(tuples.map(tupleIdentity)).size !== tuples.length) fail("supported tuple identities must be unique");
  const body = { policyId, version, supportedTuples: tuples, authority: "core-policy", networkAccess: "none" };
  return Object.freeze({ apiVersion: VERSION, kind: "GodotCompatibilityPolicy", ...body, policyDigest: canonicalJsonDigest(body) });
}
export function verifyGodotCompatibilityPolicy(policy) {
  object(policy, "policy");
  exactKeys(policy, ["apiVersion", "kind", "policyId", "version", "supportedTuples", "authority", "networkAccess", "policyDigest"], "policy");
  if (policy.apiVersion !== VERSION || policy.kind !== "GodotCompatibilityPolicy" || policy.authority !== "core-policy" || policy.networkAccess !== "none") fail("policy authority or identity is invalid");
  const rebuilt = createGodotCompatibilityPolicy({ policyId: policy.policyId, version: policy.version, supportedTuples: policy.supportedTuples });
  if (canonicalJson(rebuilt) !== canonicalJson(policy)) fail("policy digest or canonical content changed");
  return true;
}
export function evaluateGodotCompatibility({ decisionId, policy, godotVersion, gdunitVersion, godotAiVersion, platform, architecture, evidence = [] } = {}) {
  verifyGodotCompatibilityPolicy(policy);
  if (typeof decisionId !== "string" || !decisionId) fail("decisionId is required");
  const requested = { godotVersion, gdunitVersion, godotAiVersion, platform, architecture };
  const match = policy.supportedTuples.find((entry) => tupleIdentity(entry) === tupleIdentity(requested));
  const supplied = new Set(evidence.map((entry, index) => canonicalJson(ref(entry, "request evidence " + index))));
  const missingEvidence = match ? match.evidence.filter((entry) => !supplied.has(canonicalJson(entry))) : [];
  const outcome = !match ? "unsupported" : missingEvidence.length ? "needs-evidence" : "supported";
  const body = { decisionId, policy: { artifactId: policy.policyId, digest: policy.policyDigest }, requested, outcome, matchedTuple: match ? tupleIdentity(match) : null, missingEvidence, authority: "advisory", releaseAuthority: false };
  return Object.freeze({ apiVersion: VERSION, kind: "GodotCompatibilityDecision", ...body, decisionDigest: canonicalJsonDigest(body) });
}

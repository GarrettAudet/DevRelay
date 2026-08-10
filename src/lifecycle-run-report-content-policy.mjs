import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";

const CLASSIFICATIONS = new Set(["public", "internal", "restricted", "secret", "credential", "prompt", "raw-tool-log", "unknown"]);
const NEVER_ALLOW = new Set(["secret", "credential", "prompt", "raw-tool-log", "unknown"]);
const FIELD_KEYS = new Set(["path", "classification", "value", "source"]);
const SOURCE_KEYS = new Set(["artifactId", "digest"]);
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SECRET_KEY = /(?:^|[-_.])(api[-_]?key|access[-_]?token|auth(?:orization)?|credential|password|passwd|private[-_]?key|secret)(?:$|[-_.])/i;
const SECRET_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:bearer|basic)\s+[a-z0-9._~+\/-]+=*\b|\b(?:api[-_]?key|access[-_]?token|password|secret)\s*[:=]\s*\S+)/i;

export class LifecycleRunContentPolicyError extends Error {
  constructor(message) {
    super(`lifecycle run content policy rejected input: ${message}`);
    this.name = "LifecycleRunContentPolicyError";
    this.code = "DR4410";
  }
}

const fail = message => { throw new LifecycleRunContentPolicyError(message); };
const exactRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const secretLike = value => {
  const visit = (item, key = "") => {
    if (SECRET_KEY.test(key)) return true;
    if (typeof item === "string") return SECRET_VALUE.test(item);
    if (Array.isArray(item)) return item.some(child => visit(child));
    if (item && typeof item === "object") return Object.entries(item).some(([childKey, child]) => visit(child, childKey));
    return false;
  };
  return visit(value);
};

function validateField(field, index) {
  if (!field || typeof field !== "object" || Array.isArray(field)) fail(`field ${index} must be an object`);
  for (const key of Object.keys(field)) if (!FIELD_KEYS.has(key)) fail(`field ${index} contains unknown property ${key}`);
  if (typeof field.path !== "string" || field.path.length === 0) fail(`field ${index} requires a path`);
  if (field.classification !== undefined && !CLASSIFICATIONS.has(field.classification)) fail(`${field.path} has an unsupported classification`);
  if (!("value" in field)) fail(`${field.path} requires a value`);
  if (field.source !== undefined) {
    if (!field.source || typeof field.source !== "object" || Array.isArray(field.source)) fail(`${field.path} source must be an exact provenance reference`);
    if (secretLike(field.source)) fail(`${field.path} source contains secret-like content`);
    for (const key of Object.keys(field.source)) if (!SOURCE_KEYS.has(key)) fail(`${field.path} source contains unknown property ${key}`);
    if (Object.keys(field.source).length !== SOURCE_KEYS.size || !ARTIFACT_ID.test(field.source.artifactId ?? "") || !DIGEST.test(field.source.digest ?? "")) fail(`${field.path} source must contain an exact artifactId and SHA-256 digest`);
  }
}

/**
 * Applies one exact, validated LifecycleRunContentPolicy to already selected
 * report fields. The returned entries are the only values safe for a renderer
 * or report-access response to consume.
 */
export function applyLifecycleRunReportContentPolicy({ policy, policyRef, fields } = {}) {
  try { validateLifecycleRunReportArtifact(policy); } catch (error) { fail(`invalid policy: ${error.message}`); }
  const actualPolicyRef = { artifactId: policy.policyId, digest: policy.policyDigest };
  if (!exactRef(policyRef, actualPolicyRef)) fail("policy source does not match the exact policy identity and digest");
  if (!Array.isArray(fields)) fail("fields must be an array");

  const rules = new Map(policy.rules.map(rule => [rule.classification, rule.disposition]));
  const seen = new Set();
  const entries = fields.map((field, index) => {
    validateField(field, index);
    if (seen.has(field.path)) fail(`duplicate field path ${field.path}`);
    seen.add(field.path);

    const classification = field.classification ?? "unknown";
    let disposition = rules.get(classification) ?? policy.unknownClassification;
    const detectedSecret = secretLike(field.value);
    if (detectedSecret && disposition === "allow") disposition = "redact";
    if (NEVER_ALLOW.has(classification) && disposition === "allow") disposition = "omit";

    const result = { path: field.path, classification, disposition };
    if (field.source !== undefined) result.source = structuredClone(field.source);
    if (disposition === "allow") result.value = structuredClone(field.value);
    if (disposition === "redact") result.value = "[REDACTED]";
    if (detectedSecret) result.reason = "secret-like-content";
    else if (classification === "unknown") result.reason = "unknown-classification";
    else if (disposition !== "allow") result.reason = `policy-${disposition}`;
    return result;
  });

  const body = { policy: actualPolicyRef, entries };
  return Object.freeze({ ...body, evaluationDigest: canonicalJsonDigest(body) });
}

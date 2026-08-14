import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

export class ExecutionReceiptError extends Error {
  constructor(message, code = "DR4810") {
    super(`execution receipt: ${message}`);
    this.name = "ExecutionReceiptError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ExecutionReceiptError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));

function bytes(value, label) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) fail(`${label} must be exact bytes`);
  return Buffer.from(value);
}

function optionalBytes(value, label) {
  if (value === undefined || value === null) return null;
  return bytes(value, label);
}

function validateArtifactRefs(artifacts = []) {
  if (!Array.isArray(artifacts)) fail("artifacts must be an array");
  return artifacts.map((artifact) => {
    if (!artifact || typeof artifact.artifactId !== "string" || typeof artifact.digest !== "string") {
      fail("every observed artifact requires artifactId and digest");
    }
    return structuredClone(artifact);
  }).sort((left, right) => left.artifactId.localeCompare(right.artifactId, "en"));
}

function redact(raw, ranges, source) {
  const selected = ranges
    .filter((item) => item.source === source)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0;
  const output = [];
  const mappings = [];
  for (const range of selected) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < cursor || range.end <= range.start || range.end > raw.length) {
      fail(`invalid or overlapping ${source} redaction range`);
    }
    const replacement = Buffer.from(range.replacement ?? "[REDACTED]", "utf8");
    output.push(raw.subarray(cursor, range.start), replacement);
    mappings.push({
      source,
      start: range.start,
      end: range.end,
      originalDigest: sha256Digest(raw.subarray(range.start, range.end)),
      replacement: replacement.toString("utf8"),
    });
    cursor = range.end;
  }
  output.push(raw.subarray(cursor));
  return { bytes: Buffer.concat(output), mappings };
}

export function recordExecutionReceipt({ effect, observation, redactions = [] }) {
  if (!effect || typeof effect.id !== "string" || !Array.isArray(effect.argv) || typeof effect.command !== "string") {
    fail("effect requires id, command, and argv");
  }
  if (!observation || !Number.isInteger(observation.exitCode) || observation.exitCode < -1) fail("observation requires an integer exitCode");
  if (!Number.isFinite(observation.durationMilliseconds) || observation.durationMilliseconds < 0) fail("durationMilliseconds must be observed and non-negative");
  if (typeof observation.toolVersion !== "string" || !observation.toolVersion) fail("toolVersion is required");
  if (effect.attemptNumber !== undefined && (!Number.isInteger(effect.attemptNumber) || effect.attemptNumber < 1)) {
    fail("attemptNumber must be a positive integer");
  }
  if (observation.safetyFindings?.some(({ disposition }) => disposition === "block")) {
    fail("unsafe or secret-bearing output cannot be persisted before an approved disposition", "DR4811");
  }
  const stdout = bytes(observation.stdout, "stdout");
  const stderr = bytes(observation.stderr, "stderr");
  const structuredMcp = optionalBytes(observation.structuredMcpBytes, "structuredMcpBytes");
  const artifacts = validateArtifactRefs(observation.artifacts);
  const rawBundle = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RawExecutionObservationBundle",
    stdoutBase64: stdout.toString("base64"),
    stderrBase64: stderr.toString("base64"),
    stdoutDigest: sha256Digest(stdout),
    stderrDigest: sha256Digest(stderr),
    structuredMcpBase64: structuredMcp?.toString("base64") ?? null,
    structuredMcpDigest: structuredMcp === null ? null : sha256Digest(structuredMcp),
    artifacts,
  };
  const rawBundleDigest = canonicalJsonDigest(rawBundle);
  const redactedStdout = redact(stdout, redactions, "stdout");
  const redactedStderr = redact(stderr, redactions, "stderr");
  const redactedView = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RedactedExecutionView",
    rawBundleDigest,
    stdoutBase64: redactedStdout.bytes.toString("base64"),
    stderrBase64: redactedStderr.bytes.toString("base64"),
    mappings: [...redactedStdout.mappings, ...redactedStderr.mappings],
  };
  const redactedViewDigest = canonicalJsonDigest(redactedView);
  const effectFingerprint = canonicalJsonDigest({
    id: effect.id,
    command: effect.command,
    argv: effect.argv,
    cwd: effect.cwd,
    environmentDigest: effect.environmentDigest,
    grants: [...(effect.grants ?? [])].sort(),
    attemptNumber: effect.attemptNumber ?? 1,
    retryOf: effect.retryOf ?? null,
  });
  const material = {
    effectId: effect.id,
    effectFingerprint,
    terminalState: observation.terminalState ?? (observation.exitCode === 0 ? "succeeded" : "failed"),
    exitCode: observation.exitCode,
    durationMilliseconds: observation.durationMilliseconds,
    toolVersion: observation.toolVersion,
    rawBundleDigest,
    redactedViewDigest,
    grants: [...(effect.grants ?? [])].sort(),
    attemptNumber: effect.attemptNumber ?? 1,
    retryOf: effect.retryOf ?? null,
    artifactCount: artifacts.length,
  };
  const receipt = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutionReceipt",
    receiptId: `ER-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    receiptDigest: canonicalJsonDigest(material),
  };
  return immutable({ receipt, rawBundle, redactedView });
}

export function verifyExecutionReceipt(record) {
  if (!record?.receipt || !record.rawBundle || !record.redactedView) fail("receipt, rawBundle, and redactedView are required");
  if (canonicalJsonDigest(record.rawBundle) !== record.receipt.rawBundleDigest) fail("raw observation bytes do not match the receipt");
  if (canonicalJsonDigest(record.redactedView) !== record.receipt.redactedViewDigest) fail("redacted view does not match the receipt");
  if (record.redactedView.rawBundleDigest !== record.receipt.rawBundleDigest) fail("redacted view is not bound to the raw bundle");
  const { receiptDigest, receiptId, apiVersion, kind, ...material } = record.receipt;
  void receiptId; void apiVersion; void kind;
  if (canonicalJsonDigest(material) !== receiptDigest) fail("receipt digest drifted");
  return true;
}

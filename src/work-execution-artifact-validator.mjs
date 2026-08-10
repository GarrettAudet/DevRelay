import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/work-execution-artifacts.schema.json", import.meta.url), "utf8"));
const workItems = JSON.parse(readFileSync(new URL("../contracts/work-breakdown-artifacts.schema.json", import.meta.url), "utf8"));
const validator = compileArtifactSchema(schema, [workItems]);

export const WORK_EXECUTION_ARTIFACT_KINDS = Object.freeze(["RunnableFrontierProof", "IntegratedCompletionFactSet", "ExecutionPolicy", "ExecutionBinding", "ExecutorInvocation", "RawExecutorResult", "ExecutionAttempt", "ChangeSetDraft", "ExecutionEvidenceBundle", "ExecutionDiagnostic", "RetryLineage", "ExecutionTraceabilityCandidate"]);

export class WorkExecutionArtifactValidationError extends Error {
  constructor(message) {
    super(`work execution artifact is invalid: ${message}`);
    this.name = "WorkExecutionArtifactValidationError";
    this.code = "DR4060";
  }
}

const fail = (message) => { throw new WorkExecutionArtifactValidationError(message); };
const digestOf = (value, excluded) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.includes(key))));
const requireDigest = (value, field, material) => {
  if (value[field] !== canonicalJsonDigest(material)) fail(`${field} does not bind canonical material`);
};
const requireBodyDigest = (value, field) => {
  if (value[field] !== digestOf(value, ["apiVersion", "kind", field])) fail(`${field} does not bind canonical material`);
};

function validateCanonicalDigests(value) {
  switch (value.kind) {
    case "RunnableFrontierProof": requireBodyDigest(value, "readinessDigest"); break;
    case "IntegratedCompletionFactSet": requireDigest(value, "factsDigest", value.facts); break;
    case "ExecutionPolicy": requireBodyDigest(value, "policyDigest"); break;
    case "ExecutionBinding": requireBodyDigest(value, "bindingDigest"); break;
    case "ExecutorInvocation": requireBodyDigest(value, "invocationFingerprint"); break;
    case "ExecutionAttempt": requireBodyDigest(value, "attemptDigest"); break;
    case "ChangeSetDraft": requireDigest(value, "changeDigest", value.mutations); break;
    case "ExecutionEvidenceBundle": requireDigest(value, "evidenceDigest", value.evidence); break;
    case "RetryLineage": requireBodyDigest(value, "retryDigest"); break;
    case "ExecutionTraceabilityCandidate": requireBodyDigest(value, "traceabilityDigest"); break;
  }
}

function validateRawExecutorBinding(value, context) {
  if (value.kind !== "RawExecutorResult") return;
  const invocation = context.invocation;
  const binding = context.binding;
  if (!invocation || invocation.kind !== "ExecutorInvocation" || !binding || binding.kind !== "ExecutionBinding") fail("RawExecutorResult requires exact invocation and binding context");
  if (value.attemptId !== invocation.attemptId || value.invocationFingerprint !== invocation.invocationFingerprint) fail("RawExecutorResult invocation binding does not match");
  if (value.bindingDigest !== binding.bindingDigest || value.executor.id !== binding.executor.id || value.executor.version !== binding.executor.version) fail("RawExecutorResult executor binding does not match");
  if (invocation.executionBinding.digest !== binding.bindingDigest) fail("ExecutorInvocation does not reference the exact ExecutionBinding digest");
}

export function validateWorkExecutionArtifact(value, context = {}) {
  if (!validator(value)) fail(validationDetail(validator));
  if (!WORK_EXECUTION_ARTIFACT_KINDS.includes(value.kind)) fail(`unsupported kind ${value?.kind}`);
  validateCanonicalDigests(value);
  validateRawExecutorBinding(value, context);
  return value;
}

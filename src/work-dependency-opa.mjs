import { loadPolicy } from "@open-policy-agent/opa-wasm";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "./content-digest.mjs";

export class WorkDependencyPolicyError extends Error {
  constructor(message) {
    super(`work dependency policy evaluation failed: ${message}`);
    this.name = "WorkDependencyPolicyError";
    this.code = "DR3010";
  }
}

function fail(message) {
  throw new WorkDependencyPolicyError(message);
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (ArrayBuffer.isView(entry)) return entry;
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function compareCanonical(left, right) {
  return canonicalJson(left).localeCompare(canonicalJson(right), "en");
}

function assertBundle(ref, bytes) {
  if (
    ref === null ||
    typeof ref !== "object" ||
    typeof ref.artifactId !== "string" ||
    typeof ref.digest !== "string" ||
    typeof ref.schema !== "string" ||
    typeof ref.mediaType !== "string" ||
    typeof ref.uri !== "string"
  ) {
    fail("policy bundle requires one content-addressed ArtifactRef");
  }
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail("policy bundle requires exact raw WASM bytes");
  }
  if (sha256Digest(Buffer.from(bytes)) !== ref.digest) {
    fail("policy bundle bytes do not match the supplied digest");
  }
}

function rawResultRef(rawBytes, bundleRef, inputDigest) {
  const digest = sha256Digest(rawBytes);
  return {
    artifactId: `opa-result-${digest.slice(7, 23)}`,
    schema: "https://devrelay.dev/evidence/opa-raw-result/v1",
    mediaType: "application/json",
    digest,
    uri: `memory://devrelay/work-dependency-analysis/opa/${bundleRef.artifactId}/${inputDigest.slice(7)}/${digest.slice(7)}.json`,
  };
}

export async function evaluateWorkDependencyPolicy({
  bundleRef,
  bundleBytes,
  entrypoint,
  input,
  data = {},
  opaCompilerVersion = "1.16.2",
}) {
  assertBundle(bundleRef, bundleBytes);
  if (typeof entrypoint !== "string" || entrypoint.length === 0) {
    fail("entrypoint must be a non-empty string");
  }
  const inputDigest = canonicalJsonDigest(input);
  let rawResult;
  let evaluationStatus = "evaluated";
  let evaluationError;
  try {
    const policy = await loadPolicy(Buffer.from(bundleBytes));
    if (!Object.prototype.hasOwnProperty.call(policy.entrypoints, entrypoint)) {
      fail(`entrypoint ${entrypoint} is absent from the pinned policy bundle`);
    }
    policy.setData(structuredClone(data));
    rawResult = policy.evaluate(structuredClone(input), entrypoint);
  } catch (error) {
    if (error instanceof WorkDependencyPolicyError) throw error;
    evaluationStatus = "evaluation-error";
    evaluationError = error instanceof Error ? error.message : String(error);
    rawResult = { error: evaluationError };
  }

  const rawResultBytes = Buffer.from(canonicalJson(rawResult), "utf8");
  const rawResultArtifact = rawResultRef(rawResultBytes, bundleRef, inputDigest);
  let decision;
  if (evaluationStatus === "evaluated") {
    if (!Array.isArray(rawResult) || rawResult.length === 0) {
      evaluationStatus = "undefined";
    } else if (
      rawResult.length !== 1 ||
      rawResult[0] === null ||
      typeof rawResult[0] !== "object" ||
      rawResult[0].result === null ||
      typeof rawResult[0].result !== "object"
    ) {
      evaluationStatus = "malformed";
    } else {
      decision = rawResult[0].result;
    }
  }

  const edgeDecisions = Array.isArray(decision?.edgeDecisions)
    ? decision.edgeDecisions
        .map(({ edgeId, allow }) => ({ edgeId, allow }))
        .sort((left, right) => left.edgeId.localeCompare(right.edgeId, "en"))
    : [];
  const denials = Array.isArray(decision?.denials)
    ? decision.denials.map((entry) => structuredClone(entry)).sort(compareCanonical)
    : [];
  if (
    evaluationStatus === "evaluated" &&
    (typeof decision.allow !== "boolean" ||
      edgeDecisions.some(
        ({ edgeId, allow }) =>
          typeof edgeId !== "string" || typeof allow !== "boolean",
      ))
  ) {
    evaluationStatus = "malformed";
  }

  const diagnostics = [];
  if (evaluationStatus !== "evaluated") {
    diagnostics.push({
      code: `WDA_OPA_${evaluationStatus.replaceAll("-", "_").toUpperCase()}`,
      severity: "error",
      message:
        evaluationError ??
        `OPA entrypoint ${entrypoint} returned ${evaluationStatus} output`,
    });
  }
  for (const denial of denials) {
    diagnostics.push({
      code: denial.code ?? "WDA_OPA_DENY",
      severity: "error",
      subject: denial.edgeId,
      message: denial.message ?? "OPA denied the dependency candidate",
    });
  }

  return immutable({
    decisionSet: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "OpaPolicyDecisionSet",
      evaluationStatus,
      allow: evaluationStatus === "evaluated" && decision.allow === true,
      policyBundle: structuredClone(bundleRef),
      entrypoint,
      inputDigest,
      engine: {
        id: "@open-policy-agent/opa-wasm",
        version: "1.10.0",
        opaCompilerVersion,
      },
      rawResult: rawResultArtifact,
      edgeDecisions,
      denials,
      diagnostics,
    },
    rawResultRef: rawResultArtifact,
    rawResultBytes,
  });
}

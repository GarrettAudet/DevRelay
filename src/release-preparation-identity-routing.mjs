import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateEnvironmentPreparationArtifact } from "./environment-preparation-artifact-validator.mjs";
import { loadOwnedJsonArtifact } from "./loaded-json-artifact-integrity.mjs";
import {
  validateReleasePreparationArtifact,
  withReleasePreparationContentDigest,
} from "./release-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ROUTE_KEYS = new Set([
  "systemVerification",
  "applicability",
  "currentAttempt",
  "candidate",
  "continuation",
  "driftDetected",
]);
const OWNER_KEYS = new Set([
  "apiVersion",
  "kind",
  "intentId",
  "packageVersion",
  "releaseDesignation",
  "changelogApproved",
  "publicationAuthorized",
  "targetScope",
]);
const SYSTEM_RESULT_KEYS = new Set([
  "apiVersion",
  "kind",
  "resultId",
  "subject",
  "obligationSet",
  "policy",
  "evidence",
  "evaluation",
  "outcome",
  "progression",
  "authority",
  "resultDigest",
]);
const TARGET_SCOPE = Object.freeze({
  distribution: "github-source-and-installable-tarball",
  environment: "chatgpt-codex-desktop-windows",
});

export class ReleasePreparationIdentityError extends Error {
  constructor(message, code = "DR5510") {
    super(`release preparation identity failed: ${message}`);
    this.name = "ReleasePreparationIdentityError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new ReleasePreparationIdentityError(message, code);
};

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${label} contains unsupported fields: ${unknown.join(", ")}`);
}

function sameRef(left, right) {
  return Boolean(
    left && right &&
    left.artifactId === right.artifactId &&
    left.schema === right.schema &&
    left.mediaType === right.mediaType &&
    left.digest === right.digest &&
    left.uri === right.uri
  );
}

function loaded(input, label) {
  try {
    const value = loadOwnedJsonArtifact(input, label);
    return immutable({ value, ref: input.ref });
  } catch (error) {
    fail(error.message, "DR5511");
  }
}

function validateVerifiedSystemResult(input) {
  const result = loaded(input, "system verification result");
  exactKeys(result.value, SYSTEM_RESULT_KEYS, "SystemVerification result");
  const shortRefs = ["subject", "obligationSet", "policy", "evidence", "evaluation"];
  if (shortRefs.some((field) => {
    const reference = result.value[field];
    return !reference || Object.keys(reference).length !== 2 || typeof reference.artifactId !== "string" || !DIGEST.test(reference.digest ?? "");
  })) fail("SystemVerification result contains a malformed internal reference", "DR5512");
  const expectedDigest = canonicalJsonDigest(Object.fromEntries(
    Object.entries(result.value).filter(([key]) => !["apiVersion", "kind", "resultDigest"].includes(key)),
  ));
  if (
    result.value.apiVersion !== API ||
    result.value.kind !== "SystemVerificationResult" ||
    typeof result.value.resultId !== "string" ||
    result.value.resultId.length === 0 ||
    result.value.resultDigest !== expectedDigest ||
    result.value.outcome !== "verified" ||
    result.value.progression !== "business-acceptance-gate" ||
    result.value.authority !== "system-verification"
  ) {
    fail("ReleasePreparation requires an exact verified SystemVerificationResult", "DR5512");
  }
  return result;
}

export function deriveReleasePreparationRoute(state) {
  exactKeys(state, ROUTE_KEYS, "release routing state");
  const systemVerification = validateVerifiedSystemResult(state.systemVerification);
  const applicability = state.applicability;
  if (!new Set(["applicable", "not-applicable", "unknown"]).has(applicability)) {
    fail("applicability must be applicable, not-applicable, or unknown", "DR5513");
  }
  const driftDetected = state.driftDetected === true;
  if (state.candidate && !state.currentAttempt) fail("a candidate cannot exist without its attempt", "DR5513");
  if (state.continuation && !state.currentAttempt) fail("a continuation cannot exist without its attempt", "DR5513");
  if (state.candidate && state.continuation) fail("candidate and continuation state are ambiguous", "DR5513");
  if (applicability !== "applicable" && (state.currentAttempt || state.candidate || state.continuation || driftDetected)) {
    fail("non-applicable routing state cannot contain release execution state", "DR5513");
  }

  const upstream = immutable(systemVerification.ref);
  if (applicability === "not-applicable") {
    return immutable({ kind: "gate", branch: "approved-not-applicable", reasonCode: "RELEASE_SCOPE_NOT_APPLICABLE", systemVerification: upstream });
  }
  if (applicability === "unknown") {
    return immutable({ kind: "gate", branch: "needs-clarification", reasonCode: "RELEASE_SCOPE_UNRESOLVED", systemVerification: upstream });
  }
  if (driftDetected) {
    return immutable({ kind: "module", operation: "prepare-candidate", reasonCode: "RELEASE_IDENTITY_DRIFT", systemVerification: upstream, replacesAttempt: immutable(state.currentAttempt) });
  }
  if (state.continuation) {
    return immutable({ kind: "module", operation: "resume-candidate", reasonCode: "RELEASE_CLARIFICATION_CONTINUATION", systemVerification: upstream, attempt: immutable(state.currentAttempt), continuation: immutable(state.continuation) });
  }
  if (state.candidate) {
    return immutable({ kind: "module", operation: "verify-candidate", reasonCode: "RELEASE_CANDIDATE_PREPARED", systemVerification: upstream, attempt: immutable(state.currentAttempt), candidate: immutable(state.candidate) });
  }
  return immutable({
    kind: "module",
    operation: state.currentAttempt ? "resume-candidate" : "prepare-candidate",
    reasonCode: state.currentAttempt ? "RELEASE_ATTEMPT_INCOMPLETE" : "RELEASE_ATTEMPT_ABSENT",
    systemVerification: upstream,
    ...(state.currentAttempt ? { attempt: immutable(state.currentAttempt) } : {}),
  });
}

function validateOwnerIntent(input, packageVersion) {
  const owner = loaded(input, "owner intent");
  exactKeys(owner.value, OWNER_KEYS, "owner intent");
  if (
    owner.value.apiVersion !== API ||
    owner.value.kind !== "ReleaseOwnerIntent" ||
    typeof owner.value.intentId !== "string" ||
    owner.value.intentId.length === 0 ||
    !SEMVER.test(owner.value.packageVersion ?? "") ||
    owner.value.packageVersion !== packageVersion ||
    !new Set(["prerelease", "stable"]).has(owner.value.releaseDesignation) ||
    owner.value.changelogApproved !== true ||
    owner.value.publicationAuthorized !== false ||
    canonicalJson(owner.value.targetScope) !== canonicalJson(TARGET_SCOPE)
  ) {
    fail("owner intent is absent, ambiguous, out of scope, or differs from the explicit package version", "DR5514");
  }
  return owner;
}

function validateReadiness(input, repositoryRef, evaluatedAt) {
  const readiness = loaded(input, "environment readiness receipt");
  try {
    validateEnvironmentPreparationArtifact(readiness.value, { ref: readiness.ref });
  } catch (error) {
    fail(`EnvironmentReadinessReceipt is invalid: ${error.message}`, "DR5515");
  }
  const instant = new Date(evaluatedAt).toISOString();
  if (
    readiness.value.kind !== "EnvironmentReadinessReceipt" ||
    readiness.value.consumed !== false ||
    readiness.value.singleUse !== true ||
    readiness.value.issuedAt > instant ||
    readiness.value.expiresAt <= instant ||
    !sameRef(readiness.value.repository, repositoryRef)
  ) {
    fail("EnvironmentReadinessReceipt is stale, consumed, substituted, or bound to another repository", "DR5515");
  }
  return readiness;
}

function normalizeToolchain(toolchain) {
  if (!Array.isArray(toolchain) || toolchain.length === 0) fail("toolchain must contain explicit pinned identities", "DR5516");
  const normalized = toolchain.map((entry) => {
    const keys = new Set(["id", "version", "digest"]);
    exactKeys(entry, keys, "toolchain identity");
    if (typeof entry.id !== "string" || entry.id.length === 0 || typeof entry.version !== "string" || entry.version.length === 0 || !DIGEST.test(entry.digest ?? "")) {
      fail("toolchain identity is malformed or unpinned", "DR5516");
    }
    return structuredClone(entry);
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) fail("toolchain identities are ambiguous", "DR5516");
  return normalized;
}

export function resolveReleasePreparationAttempt({
  systemVerification,
  repositorySnapshot,
  approvedBaselines,
  releasePolicy,
  packageVersion,
  releaseConfigurationDigest,
  toolchain,
  environmentReadinessReceipt,
  ownerIntent,
  evaluatedAt,
}) {
  const verified = validateVerifiedSystemResult(systemVerification);
  const repository = loaded(repositorySnapshot, "repository snapshot");
  if (
    repository.value.kind !== "RepositorySnapshot" ||
    !COMMIT.test(repository.value.revision ?? "") ||
    !DIGEST.test(repository.value.treeDigest ?? "")
  ) {
    fail("repository snapshot lacks an exact commit and tree digest", "DR5517");
  }
  if (!SEMVER.test(packageVersion ?? "")) fail("packageVersion must be supplied explicitly as SemVer", "DR5514");
  if (!DIGEST.test(releaseConfigurationDigest ?? "")) fail("release configuration must be digest-bound", "DR5517");
  if (!Array.isArray(approvedBaselines) || approvedBaselines.length === 0) fail("approved baselines are required", "DR5517");
  const baselineEntries = approvedBaselines.map((entry) => {
    if (typeof entry?.role !== "string" || entry.role.length === 0) fail("every approved baseline requires a role", "DR5517");
    return { role: entry.role, ...loaded(entry, `approved baseline ${entry.role}`) };
  }).sort((left, right) => left.role.localeCompare(right.role));
  if (new Set(baselineEntries.map(({ role }) => role)).size !== baselineEntries.length) fail("approved baseline roles are ambiguous", "DR5517");
  if (new Set(baselineEntries.map(({ ref }) => ref.digest)).size !== baselineEntries.length) fail("approved baseline identities are not unique", "DR5517");

  const policy = loaded(releasePolicy, "release policy");
  try {
    validateReleasePreparationArtifact(policy.value, { ref: policy.ref });
  } catch (error) {
    fail(`release policy is invalid: ${error.message}`, "DR5518");
  }
  if (policy.value.kind !== "ReleaseVerificationPolicy") fail("release policy has the wrong artifact kind", "DR5518");
  const owner = validateOwnerIntent(ownerIntent, packageVersion);
  const readiness = validateReadiness(environmentReadinessReceipt, repository.ref, evaluatedAt);
  const normalizedToolchain = normalizeToolchain(toolchain);
  const baselines = baselineEntries.map(({ ref }) => immutable(ref));
  const sourceRefs = [
    ...baselineEntries.map(({ role, ref }) => ({ role, artifact: immutable(ref) })),
    { role: "environment-readiness", artifact: immutable(readiness.ref) },
    { role: "owner-intent", artifact: immutable(owner.ref) },
    { role: "release-policy", artifact: immutable(policy.ref) },
    { role: "repository-snapshot", artifact: immutable(repository.ref) },
    { role: "system-verification", artifact: immutable(verified.ref) },
  ].sort((left, right) => left.role.localeCompare(right.role));
  const identity = {
    source: { commit: repository.value.revision, tree: repository.value.treeDigest },
    baselines,
    packageVersion,
    releaseConfigurationDigest,
    toolchain: normalizedToolchain,
    environmentReadinessReceipt: immutable(readiness.ref),
    ownerIntent: immutable(owner.ref),
    releasePolicy: immutable(policy.ref),
    systemVerification: immutable(verified.ref),
  };
  const fingerprint = canonicalJsonDigest(identity);
  const attempt = withReleasePreparationContentDigest({
    apiVersion: API,
    kind: "ReleasePreparationAttempt",
    attemptId: `RPA-${fingerprint.slice(7, 23).toUpperCase()}`,
    source: identity.source,
    baselines,
    packageVersion,
    releaseConfigurationDigest,
    toolchain: normalizedToolchain,
    environmentReadinessReceipt: identity.environmentReadinessReceipt,
    ownerIntent: identity.ownerIntent,
    fingerprint,
    sourceRefs,
  });
  validateReleasePreparationArtifact(attempt);
  return immutable(attempt);
}

export function detectReleasePreparationIdentityDrift(currentAttempt, proposedAttempt) {
  validateReleasePreparationArtifact(currentAttempt);
  validateReleasePreparationArtifact(proposedAttempt);
  return immutable({
    driftDetected: currentAttempt.fingerprint !== proposedAttempt.fingerprint,
    currentAttemptId: currentAttempt.attemptId,
    proposedAttemptId: proposedAttempt.attemptId,
    changedIdentity: currentAttempt.fingerprint === proposedAttempt.fingerprint ? [] : ["release-attempt-identity"],
  });
}

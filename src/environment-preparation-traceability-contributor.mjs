import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateEnvironmentPreparationArtifact } from "./environment-preparation-artifact-validator.mjs";

const SCOPE = "environment-preparation/readiness";
const PROFILE_SCOPE = "environment-preparation/baseline";
const WORK_SCOPE = "work-breakdown/candidate";
const ATTEMPT_SCOPE = "work-execution/attempt";

function fail(message) {
  throw new TypeError(`environment-preparation traceability contributor: ${message}`);
}
const immutable = (value) => Object.freeze(structuredClone(value));

function allLoaded(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (value.ref && value.value && value.bytes !== undefined) {
    result.push(value);
    return result;
  }
  for (const child of Object.values(value)) allLoaded(child, result);
  return result;
}

function loadedArtifacts(context) {
  return allLoaded({
    loadedInputs: context.loadedInputs,
    loadedOutputs: context.loadedOutputs,
    loadedAttachments: context.loadedAttachments,
    resolvedArtifacts: context.resolvedArtifacts,
  });
}

function canonicalLoaded(context, kind) {
  const matches = loadedArtifacts(context).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`${kind} must have exactly one canonical loaded artifact`);
  const loaded = matches[0];
  const bytes = Buffer.from(loaded.bytes);
  if (sha256Digest(bytes) !== loaded.ref.digest) fail(`${kind} raw bytes do not match its ArtifactRef`);
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(`${kind} raw bytes are not UTF-8 JSON`);
  }
  if (canonicalJson(decoded) !== new TextDecoder().decode(bytes) || canonicalJson(decoded) !== canonicalJson(loaded.value)) {
    fail(`${kind} raw bytes do not equal the canonical loaded value`);
  }
  validateEnvironmentPreparationArtifact(loaded.value);
  return loaded;
}

function locator(loaded, jsonPointer, entity) {
  return {
    artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function endpoint(kind, stableId, authority, scope) {
  return { kind, stableId, authority, scope };
}

function matches(context) {
  return Boolean(
    context?.invocation?.module?.id === "environment-preparation" &&
      context.invocation.module.version === "1.0.0" &&
      new Set(["establish-environment", "prepare-frontier", "revalidate-frontier", "remediate-drift"])
        .has(context.invocation.module.operation) &&
      context?.moduleResult?.status === "completed" && context.moduleResult.outcome === "ready",
  );
}

export function createEnvironmentPreparationTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.environment-preparation", version: "1.0.0" }),
    match: matches,
    authority: "approved",
    scope: SCOPE,
    ownership: immutable({
      authority: "approved",
      scope: SCOPE,
      nodeKinds: ["environment-profile", "environment-readiness-receipt"],
      edgeKinds: ["authorizes-environment-for", "required-by"],
      retention: "append-only",
    }),
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching ready outcome");
      const profileSetLoaded = canonicalLoaded(context, "EnvironmentProfileSet");
      const candidateLoaded = canonicalLoaded(context, "EnvironmentVerificationCandidate");
      const approvalLoaded = canonicalLoaded(context, "EnvironmentGateApproval");
      const readinessLoaded = canonicalLoaded(context, "EnvironmentReadinessReceipt");
      const { value: profileSet } = profileSetLoaded;
      const { value: candidate } = candidateLoaded;
      const { value: approval } = approvalLoaded;
      const { value: readiness } = readinessLoaded;
      if (
        candidate.proposedOutcome !== "ready" || approval.decision !== "ready" ||
        approval.candidate.digest !== candidate.contentDigest ||
        readiness.candidate.digest !== candidate.contentDigest ||
        readiness.gateApproval.digest !== approval.contentDigest ||
        readiness.profileSet.digest !== profileSet.contentDigest
      ) {
        fail("profile, candidate, approval, and readiness do not form one exact approved closure");
      }
      const nodes = profileSet.profiles.map((profile, index) => ({
        kind: "environment-profile",
        stableId: profile.id,
        label: profile.name,
        attributes: {
          layer: profile.layer,
          profileSetId: profileSet.profileSetId,
          checkIds: profile.checks.map(({ id }) => id).sort(),
        },
        sourceLocators: [locator(profileSetLoaded, `/profiles/${index}`, profile)],
      }));
      nodes.push({
        kind: "environment-readiness-receipt",
        stableId: readiness.receiptId,
        label: readiness.receiptId,
        attributes: {
          artifact: immutable(readinessLoaded.ref),
          frontierId: readiness.frontierId,
          executionAttemptId: readiness.executionAttemptId,
          fingerprint: readiness.fingerprint,
          expiresAt: readiness.expiresAt,
          singleUse: readiness.singleUse,
        },
        sourceLocators: [locator(readinessLoaded, "", readiness)],
      });
      const edges = [];
      for (const profile of profileSet.profiles) {
        for (const [index, workItemId] of readiness.workItemIds.entries()) {
          edges.push({
            kind: "required-by",
            source: endpoint("environment-profile", profile.id, "approved", SCOPE),
            target: endpoint("work-item", workItemId, "candidate", WORK_SCOPE),
            rationale: "This approved environment profile is required before the exact work item may execute.",
            sourceLocators: [
              locator(profileSetLoaded, `/profiles/${profileSet.profiles.indexOf(profile)}`, profile),
              locator(readinessLoaded, `/workItemIds/${index}`, workItemId),
            ],
          });
        }
      }
      edges.push({
        kind: "authorizes-environment-for",
        source: endpoint("environment-readiness-receipt", readiness.receiptId, "approved", SCOPE),
        target: endpoint("execution-attempt", readiness.executionAttemptId, "candidate", ATTEMPT_SCOPE),
        rationale: "Core approved this single-use readiness receipt for the exact execution attempt.",
        sourceLocators: [
          locator(readinessLoaded, "", readiness),
          locator(readinessLoaded, "/executionAttemptId", readiness.executionAttemptId),
        ],
      });
      const sort = (values) => values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
      return { horizon: "implementation", nodes: sort(nodes), edges: sort(edges) };
    },
  });
}

export const environmentPreparationTraceabilityContributor =
  createEnvironmentPreparationTraceabilityContributor();

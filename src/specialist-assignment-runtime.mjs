import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  assembleSpecialistAssignmentDraft,
  evaluateSpecialistEligibility,
  rankSpecialistsDeterministically,
  SpecialistAssignmentError,
} from "./specialist-assignment.mjs";
import {
  SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS,
  validateSpecialistAssignmentArtifact,
} from "./specialist-assignment-artifact-validator.mjs";

export class SpecialistAssignmentRuntimeError extends Error {
  constructor(message, code = "DR4070") {
    super(`specialist assignment runtime failed: ${message}`);
    this.name = "SpecialistAssignmentRuntimeError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new SpecialistAssignmentRuntimeError(message, code); };

function artifactRecord(value) {
  validateSpecialistAssignmentArtifact(value);
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  const contract = SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS[value.kind];
  const artifactId = value.draftId ?? value.baselineId ?? `${value.kind}-${digest.slice(7, 23)}`;
  return {
    ref: {
      artifactId,
      schema: contract.schema,
      mediaType: contract.mediaType,
      digest,
      uri: `memory://devrelay/specialist-assignment/${artifactId}/${digest.slice(7)}.json`,
    },
    value,
    bytesBase64: bytes.toString("base64"),
  };
}

function verifyRecord(record) {
  const bytes = Buffer.from(record.bytesBase64, "base64");
  if (
    bytes.toString("base64") !== record.bytesBase64 ||
    sha256Digest(bytes) !== record.ref.digest ||
    !bytes.equals(Buffer.from(canonicalJson(record.value), "utf8"))
  ) fail("checkpoint contains modified or non-canonical artifact bytes", "DR4071");
  validateSpecialistAssignmentArtifact(record.value);
}

const REQUIRED_INPUT_ROLES = Object.freeze([
  "assignment-policy",
  "capability-catalog",
  "project-overview-baseline",
  "repository-context",
  "specialist-catalog",
  "work-breakdown-baseline",
  "work-dependency-baseline",
]);

function validatePlan(workBreakdown, workDependency) {
  const workIds = workBreakdown.workItems.map(({ id }) => id).sort();
  const graphIds = [...workDependency.nodes].sort();
  if (canonicalJsonDigest(workIds) !== canonicalJsonDigest(graphIds)) {
    fail("WorkBreakdownBaseline and WorkDependencyBaseline do not cover the same work items", "DR4072");
  }
}

function repositoryContextId(repositoryContext) {
  if (repositoryContext?.kind === "RepositorySnapshot") {
    if (
      typeof repositoryContext.repository !== "string" ||
      typeof repositoryContext.revision !== "string" ||
      repositoryContext.revision.length < 7
    ) {
      fail("RepositorySnapshot requires repository and revision identity", "DR4073");
    }
    const repositoryName =
      repositoryContext.repository.split(/[\\/]/u).filter(Boolean).at(-1) ??
      "repository";
    const slug = repositoryName
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    if (!slug) fail("RepositorySnapshot repository identity is empty", "DR4073");
    return `repository-snapshot-${slug}-${repositoryContext.revision.slice(0, 7)}`;
  }
  if (repositoryContext?.kind === "ApprovedNotApplicable") {
    const id = repositoryContext.dispositionId ?? repositoryContext.approvalId;
    if (typeof id !== "string" || id.length === 0) {
      fail("ApprovedNotApplicable repository context requires a stable identity", "DR4073");
    }
    return id;
  }
  fail("repositoryContext must be RepositorySnapshot or ApprovedNotApplicable", "DR4073");
}

function validateBoundInputs({
  workBreakdown,
  workDependency,
  capabilityCatalog,
  specialistCatalog,
  assignmentPolicy,
  projectOverview,
  repositoryContext,
  inputBindings,
}) {
  if (
    projectOverview?.kind !== "ProjectOverviewBaseline" ||
    typeof projectOverview.baselineId !== "string"
  ) {
    fail("projectOverview must be one ProjectOverviewBaseline", "DR4073");
  }
  const expected = new Map([
    [
      "work-breakdown-baseline",
      [workBreakdown?.baselineId, canonicalJsonDigest(workBreakdown)],
    ],
    [
      "work-dependency-baseline",
      [workDependency?.baselineId, canonicalJsonDigest(workDependency)],
    ],
    [
      "capability-catalog",
      [capabilityCatalog?.catalogId, canonicalJsonDigest(capabilityCatalog)],
    ],
    [
      "specialist-catalog",
      [specialistCatalog?.catalogId, canonicalJsonDigest(specialistCatalog)],
    ],
    [
      "assignment-policy",
      [assignmentPolicy?.policyId, canonicalJsonDigest(assignmentPolicy)],
    ],
    [
      "project-overview-baseline",
      [projectOverview.baselineId, canonicalJsonDigest(projectOverview)],
    ],
    [
      "repository-context",
      [repositoryContextId(repositoryContext), canonicalJsonDigest(repositoryContext)],
    ],
  ]);
  if (!Array.isArray(inputBindings) || inputBindings.length !== expected.size) {
    fail("inputBindings must bind all seven declared inputs exactly once", "DR4073");
  }
  const seen = new Set();
  for (const binding of inputBindings) {
    if (
      !binding ||
      typeof binding !== "object" ||
      typeof binding.role !== "string" ||
      !binding.artifact ||
      typeof binding.artifact.artifactId !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(binding.artifact.digest)
    ) {
      fail("inputBindings contains a malformed binding", "DR4073");
    }
    if (seen.has(binding.role)) {
      fail(`inputBindings repeats role ${binding.role}`, "DR4073");
    }
    seen.add(binding.role);
    const exact = expected.get(binding.role);
    if (
      !exact ||
      typeof exact[0] !== "string" ||
      binding.artifact.artifactId !== exact[0] ||
      binding.artifact.digest !== exact[1]
    ) {
      fail(`input binding ${binding.role} does not match exact input bytes`, "DR4073");
    }
  }
  if (
    [...seen].sort().join("\u0000") !== REQUIRED_INPUT_ROLES.join("\u0000")
  ) {
    fail("inputBindings roles do not match the declared input contract", "DR4073");
  }
}

export function createSpecialistAssignmentRuntime({ checkpointStore, ranker } = {}) {
  if (!checkpointStore?.get || !checkpointStore?.put) fail("checkpointStore with get and put is required");
  const rank = ranker?.rank ?? ((eligibility, policy) => rankSpecialistsDeterministically(eligibility, policy));
  const rankerDescriptor = ranker?.descriptor ?? { id: "devrelay.native-specialist-ranker", version: "1.0.0" };

  return Object.freeze({
    async execute({
      executionId,
      workBreakdown,
      workDependency,
      capabilityCatalog,
      specialistCatalog,
      assignmentPolicy,
      projectOverview,
      repositoryContext,
      inputBindings = [],
    }) {
      validatePlan(workBreakdown, workDependency);
      validateBoundInputs({
        workBreakdown,
        workDependency,
        capabilityCatalog,
        specialistCatalog,
        assignmentPolicy,
        projectOverview,
        repositoryContext,
        inputBindings,
      });
      const fingerprintMaterial = {
        executionId,
        operation: "assign-specialists",
        workBreakdownDigest: canonicalJsonDigest(workBreakdown),
        workDependencyDigest: canonicalJsonDigest(workDependency),
        capabilityCatalogDigest: canonicalJsonDigest(capabilityCatalog),
        specialistCatalogDigest: canonicalJsonDigest(specialistCatalog),
        assignmentPolicyDigest: canonicalJsonDigest(assignmentPolicy),
        projectOverviewDigest: canonicalJsonDigest(projectOverview),
        repositoryContextDigest: canonicalJsonDigest(repositoryContext),
        inputBindings,
        ranker: rankerDescriptor,
      };
      const executionFingerprint = canonicalJsonDigest(fingerprintMaterial);
      const key = `specialist-assignment/${executionId}/${executionFingerprint.slice(7)}`;
      const existing = await checkpointStore.get(key);
      if (existing) {
        if (existing.executionFingerprint !== executionFingerprint) fail("checkpoint fingerprint mismatch", "DR4071");
        for (const record of existing.artifacts) verifyRecord(record);
        return { ...structuredClone(existing.receipt), replayed: true };
      }

      const eligibility = evaluateSpecialistEligibility({
        workItems: workBreakdown.workItems,
        capabilityCatalog,
        specialistCatalog,
        assignmentPolicy,
      });
      const eligibilityRecord = artifactRecord(eligibility);
      let selections;
      try {
        selections = await rank(eligibility, assignmentPolicy);
      } catch (error) {
        if (error instanceof SpecialistAssignmentError && error.code === "DR4030") {
          const receipt = {
            executionId,
            executionFingerprint,
            operation: "assign-specialists",
            outcome: "needs-clarification",
            replayed: false,
            ranker: rankerDescriptor,
            artifacts: [eligibilityRecord.ref],
            diagnostics: eligibility.evaluations
              .filter(({ eligibleProfileIds }) => eligibleProfileIds.length === 0)
              .map(({ workItemId, profileEvaluations }) => ({
                code: "SA_NO_ELIGIBLE_PROFILE",
                workItemId,
                profileEvaluations,
              })),
          };
          await checkpointStore.put(key, {
            executionFingerprint,
            artifacts: [eligibilityRecord],
            receipt,
          });
          return receipt;
        }
        throw error;
      }
      validateSpecialistAssignmentArtifact(selections);
      const selectionRecord = artifactRecord(selections);
      const draft = assembleSpecialistAssignmentDraft({
        eligibility,
        rankerSelections: selections,
        inputBindings,
      });
      const draftRecord = artifactRecord(draft);
      const receipt = {
        executionId,
        executionFingerprint,
        operation: "assign-specialists",
        outcome: "assigned",
        replayed: false,
        ranker: rankerDescriptor,
        artifacts: [eligibilityRecord.ref, selectionRecord.ref, draftRecord.ref],
        draft: draftRecord,
        diagnostics: [],
      };
      await checkpointStore.put(key, {
        executionFingerprint,
        artifacts: [eligibilityRecord, selectionRecord, draftRecord],
        receipt,
      });
      return receipt;
    },
  });
}
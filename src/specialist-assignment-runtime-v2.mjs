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

const VERIFIED_RECEIPTS = new WeakSet();
const MODULE = Object.freeze({ id: "specialist-assignment", version: "2.0.0" });

export class SpecialistAssignmentRuntimeV2Error extends Error {
  constructor(message, code = "DR4070") {
    super(`specialist assignment runtime failed: ${message}`);
    this.name = "SpecialistAssignmentRuntimeV2Error";
    this.code = code;
  }
}
const fail = (message, code) => { throw new SpecialistAssignmentRuntimeV2Error(message, code); };

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

function checkpointKey(executionId, executionFingerprint) {
  return `specialist-assignment/${executionId}/${executionFingerprint.slice(7)}`;
}

function validateCheckpoint(checkpoint, { executionId, executionFingerprint }) {
  if (
    checkpoint?.executionFingerprint !== executionFingerprint ||
    checkpoint?.receipt?.executionId !== executionId ||
    checkpoint.receipt.executionFingerprint !== executionFingerprint ||
    !Array.isArray(checkpoint.artifacts)
  ) fail("checkpoint identity or artifact closure is invalid", "DR4071");
  for (const record of checkpoint.artifacts) verifyRecord(record);
  const records = new Map(checkpoint.artifacts.map((record) => [record.ref.digest, record]));
  for (const ref of checkpoint.receipt.artifacts ?? []) {
    if (!records.has(ref.digest)) fail("checkpoint receipt references an artifact outside its closure", "DR4071");
  }
  if (checkpoint.receipt.outcome === "assigned") {
    const draft = checkpoint.receipt.draft;
    const exact = draft && records.get(draft.ref?.digest);
    if (
      !exact ||
      exact.value.kind !== "SpecialistAssignmentDraft" ||
      exact.ref.artifactId !== draft.ref.artifactId ||
      exact.bytesBase64 !== draft.bytesBase64
    ) fail("checkpoint assigned outcome does not bind one exact runtime draft", "DR4071");
  } else if (checkpoint.receipt.draft !== undefined) {
    fail("non-assigned checkpoint cannot contain a draft", "DR4071");
  }
  return checkpoint;
}

export function assertVerifiedSpecialistAssignmentReceipt(receipt) {
  if (!VERIFIED_RECEIPTS.has(receipt)) {
    fail("SpecialistAssignmentGate requires an unforgeable checkpoint replay receipt", "DR4074");
  }
  return receipt.checkpoint;
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

export function createSpecialistAssignmentRuntimeV2({ checkpointStore, ranker } = {}) {
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
        module: { ...MODULE, operation: "assign-specialists" },
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
      const key = checkpointKey(executionId, executionFingerprint);
      const existing = await checkpointStore.get(key);
      if (existing) {
        const checkpoint = validateCheckpoint(immutable(existing), { executionId, executionFingerprint });
        return immutable({ ...checkpoint.receipt, replayed: true });
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

    async verifyCheckpointedExecution({ executionId, executionFingerprint }) {
      const key = checkpointKey(executionId, executionFingerprint);
      const loaded = await checkpointStore.get(key);
      if (loaded === undefined || loaded === null) {
        fail("checkpoint-only verification requires the exact checkpoint", "DR4071");
      }
      const checkpoint = validateCheckpoint(immutable(loaded), { executionId, executionFingerprint });
      const receipt = Object.freeze({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "VerifiedSpecialistAssignmentCheckpointReplayReceipt",
        executionId,
        executionFingerprint,
        checkpointKey: key,
        checkpointDigest: canonicalJsonDigest(checkpoint),
        checkpoint,
      });
      VERIFIED_RECEIPTS.add(receipt);
      return receipt;
    },
  });
}

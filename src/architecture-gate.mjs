import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import {
  validateArchitectureArtifact,
  validateArchitectureChangeSetAgainstBaseline,
} from "./architecture-artifact-validator.mjs";
import { normativeRequirementIds } from "./requirements-artifact-validator.mjs";

export class ArchitectureGateValidationError extends Error {
  constructor(message) {
    super(`architecture gate rejected candidate: ${message}`);
    this.name = "ArchitectureGateValidationError";
    this.code = "DR2500";
  }
}

function fail(message) {
  throw new ArchitectureGateValidationError(message);
}

const ARTIFACT_REF_KEYS = Object.freeze([
  "artifactId",
  "digest",
  "mediaType",
  "schema",
  "uri",
]);
const BASELINE_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/architecture-baseline/v1",
  mediaType: "application/vnd.devrelay.architecture-baseline+json",
});
const OWNER_APPROVAL_CONTRACT = Object.freeze({
  schema:
    "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1",
  mediaType:
    "application/vnd.devrelay.architecture-gate-owner-approval+json",
});
const GATE_REVIEW_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/evidence/architecture-gate-review/v1",
  mediaType: "text/markdown",
});
const STRUCTURIZR_PROOF_SCHEMA =
  "https://devrelay.dev/evidence/structurizr-conformance-proof/v1";
const SECTION_NAMES = Object.freeze([
  "technicalDesign",
  "architectureModel",
  "diagrams",
  "interfaceIntent",
  "architectureConstraints",
  "decisionRecords",
  "nativeArtifacts",
]);

function immutableCopy(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

function refIdentity(ref) {
  return [
    ref?.artifactId,
    ref?.schema,
    ref?.mediaType,
    ref?.digest,
  ].join("\u0000");
}

function sameArtifactRef(left, right) {
  return refIdentity(left) === refIdentity(right);
}

function assertClosedArtifactRef(label, ref, expectedContract) {
  if (
    ref === null ||
    typeof ref !== "object" ||
    Array.isArray(ref) ||
    Object.keys(ref).sort().join("\u0000") !==
      ARTIFACT_REF_KEYS.join("\u0000") ||
    typeof ref.artifactId !== "string" ||
    ref.artifactId.length === 0 ||
    typeof ref.schema !== "string" ||
    typeof ref.mediaType !== "string" ||
    typeof ref.uri !== "string" ||
    typeof ref.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(ref.digest)
  ) {
    fail(`${label} must be one closed content-addressed ArtifactRef`);
  }
  if (
    expectedContract &&
    (ref.schema !== expectedContract.schema ||
      ref.mediaType !== expectedContract.mediaType)
  ) {
    fail(`${label} does not use its published artifact contract`);
  }
  try {
    new URL(ref.schema);
    new URL(ref.uri);
  } catch {
    fail(`${label} schema and uri must be absolute URIs`);
  }
}

function assertArtifactRef(label, actual, expected) {
  assertClosedArtifactRef(label, actual);
  assertClosedArtifactRef(`expected ${label}`, expected);
  if (!sameArtifactRef(actual, expected)) {
    fail(`${label} does not match the exact content-addressed artifact`);
  }
}

function replayArtifact(group, port, label) {
  const entries = group?.[port];
  if (!Array.isArray(entries) || entries.length !== 1) {
    fail(`${label} requires exactly one ${port} artifact`);
  }
  return entries[0];
}

function optionalReplayArtifact(group, port) {
  const entries = group?.[port];
  if (entries === undefined) return undefined;
  if (!Array.isArray(entries) || entries.length !== 1) {
    fail(`checkpoint replay contains invalid ${port} cardinality`);
  }
  return entries[0];
}

function candidateStableId(candidate) {
  if (candidate?.kind === "ArchitectureDraft") return candidate.draftId;
  if (candidate?.kind === "ArchitectureChangeSetDraft") {
    return candidate.changeSetId;
  }
  return undefined;
}

function assertCandidateRef(candidate, ref) {
  assertClosedArtifactRef("architecture candidate ref", ref);
  if (candidateStableId(candidate) !== ref.artifactId) {
    fail("architecture candidate ref does not identify the replayed candidate");
  }
}

function assertArchitectureReplay(receipt) {
  let replay;
  try {
    replay = assertVerifiedCheckpointReplayReceipt(receipt);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const invocation = replay.invocation;
  const expected = {
    "establish-baseline": {
      kind: "ArchitectureDraft",
      outcome: "drafted",
      port: "architecture-draft",
    },
    "design-change": {
      kind: "ArchitectureChangeSetDraft",
      outcome: "change_set_drafted",
      port: "architecture-change-set-draft",
    },
  }[invocation?.module?.operation];
  if (
    invocation?.module?.id !== "architecture-design" ||
    invocation.module.version !== "0.1.0" ||
    expected === undefined ||
    replay.moduleResult?.invocationId !== invocation.invocationId ||
    replay.moduleResult.status !== "completed" ||
    replay.moduleResult.outcome !== expected.outcome
  ) {
    fail(
      "checkpoint replay is not a completed promotable ArchitectureDesign 0.1.0 invocation",
    );
  }
  const loaded = replayArtifact(
    replay.loadedOutputs,
    expected.port,
    "promotable checkpoint replay",
  );
  if (loaded.value?.kind !== expected.kind) {
    fail("checkpoint replay candidate kind does not match its operation");
  }
  assertCandidateRef(loaded.value, loaded.ref);
  const blocking = (replay.moduleResult.diagnostics ?? []).filter(
    ({ severity }) => severity === "error",
  );
  if (blocking.length > 0) {
    fail(
      `candidate has blocking diagnostics: ${blocking
        .map(({ code }) => code ?? "UNKNOWN")
        .sort()
        .join(", ")}`,
    );
  }
  if (
    (replay.moduleResult.evidence ?? []).some(
      ({ status }) => status !== "pass",
    )
  ) {
    fail("checkpoint replay contains non-passing Module evidence");
  }
  return {
    replay,
    operation: invocation.module.operation,
    candidate: loaded.value,
    candidateRef: loaded.ref,
  };
}

function decodeExactJson({ label, value, ref, bytes, contract, stableId }) {
  assertClosedArtifactRef(`${label} ref`, ref, contract);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail(`${label} must be supplied as exact raw bytes`);
  }
  const raw = Buffer.from(bytes);
  if (sha256Digest(raw) !== ref.digest) {
    fail(`${label} bytes do not match their ArtifactRef digest`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    fail(`${label} bytes are not valid UTF-8`);
  }
  if (!Buffer.from(text, "utf8").equals(raw)) {
    fail(`${label} bytes must be BOM-free canonical UTF-8`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`${label} bytes are not a valid JSON document`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} bytes must decode to one JSON object`);
  }
  if (stableId(parsed) !== ref.artifactId) {
    fail(`${label} ref does not identify the raw artifact`);
  }
  if (canonicalJsonDigest(value) !== canonicalJsonDigest(parsed)) {
    fail(`${label} object does not match the exact raw JSON artifact`);
  }
  return {
    value: parsed,
    byteLength: raw.byteLength,
    bytesBase64: raw.toString("base64"),
  };
}

async function resolveApprovalEvidence(ref, resolver, label) {
  if (typeof resolver !== "function") {
    fail(`${label} requires an exact evidence resolver`);
  }
  let loaded;
  try {
    loaded = await resolver(ref);
  } catch (error) {
    fail(`${label} could not be resolved: ${error.message}`);
  }
  if (
    !loaded ||
    !sameArtifactRef(loaded.ref, ref) ||
    (!Buffer.isBuffer(loaded.bytes) &&
      !(loaded.bytes instanceof Uint8Array))
  ) {
    fail(`${label} resolver did not return the exact artifact and raw bytes`);
  }
  if (sha256Digest(Buffer.from(loaded.bytes)) !== ref.digest) {
    fail(`${label} bytes do not match the approved digest`);
  }
}

async function validateOwnerApproval({
  approval,
  approvalRef,
  approvalBytes,
  candidate,
  candidateRef,
  evidenceResolver,
}) {
  const document = decodeExactJson({
    label: "owner approval",
    value: approval,
    ref: approvalRef,
    bytes: approvalBytes,
    contract: OWNER_APPROVAL_CONTRACT,
    stableId: (value) => value?.approvalId,
  });
  approval = document.value;
  const expectedKeys = [
    "apiVersion",
    "approvalId",
    "authority",
    "candidate",
    "decision",
    "gateReview",
    "kind",
    "policyVersion",
    "repositoryRevision",
    "requiredEvidence",
  ].sort();
  if (
    Object.keys(approval).sort().join("\u0000") !==
      expectedKeys.join("\u0000") ||
    approval.apiVersion !== "devrelay.dev/v1alpha1" ||
    approval.kind !== "ArchitectureGateOwnerApproval" ||
    approval.authority !== "project-owner" ||
    approval.decision !== "approve" ||
    approval.policyVersion !== "architecture-gate/0.1.0" ||
    typeof approval.repositoryRevision !== "string" ||
    approval.repositoryRevision.length === 0
  ) {
    fail("owner approval is not one closed affirmative Gate decision");
  }
  assertArtifactRef("owner approval candidate", approval.candidate, candidateRef);
  assertClosedArtifactRef(
    "owner approval gate review",
    approval.gateReview,
    GATE_REVIEW_CONTRACT,
  );
  if (
    !Array.isArray(approval.requiredEvidence) ||
    approval.requiredEvidence.length === 0
  ) {
    fail("owner approval requires exact supporting evidence");
  }
  const seen = new Set();
  for (const evidence of approval.requiredEvidence) {
    assertClosedArtifactRef("owner approval evidence", evidence);
    const identity = refIdentity(evidence);
    if (seen.has(identity)) {
      fail(`owner approval repeats evidence ${evidence.artifactId}`);
    }
    seen.add(identity);
  }
  if (
    candidate.requiredEvidence?.includes(
      "architecture/structurizr-native-conformance",
    ) &&
    !approval.requiredEvidence.some(
      ({ schema }) => schema === STRUCTURIZR_PROOF_SCHEMA,
    )
  ) {
    fail("owner approval omits required Structurizr conformance proof");
  }
  await resolveApprovalEvidence(
    approval.gateReview,
    evidenceResolver,
    "owner-approved Architecture Gate review",
  );
  for (const evidence of approval.requiredEvidence) {
    await resolveApprovalEvidence(evidence, evidenceResolver, "owner-approved evidence");
  }
  return {
    approval,
    approvalRef,
    gateEvidence: [
      approval.gateReview,
      ...approval.requiredEvidence,
      approvalRef,
    ],
  };
}

function acceptedSections(candidate) {
  const sections = structuredClone(candidate.sections);
  const decisions = sections.decisionRecords;
  if (decisions.mode !== "embedded") {
    fail(
      "ArchitectureGate 0.1.0 promotion requires embedded decision records",
    );
  }
  for (const decision of decisions.content.decisions) {
    if (decision.status === "proposed") decision.status = "accepted";
  }
  return sections;
}

function assertBaselineTarget({
  baseline,
  candidate,
  candidateRef,
  gateEvidence,
  policyVersion,
  previousBaseline,
}) {
  if (baseline?.kind !== "ArchitectureBaseline") {
    fail("promotion target is not an ArchitectureBaseline");
  }
  if (
    previousBaseline &&
    baseline.baselineId === previousBaseline.baselineId
  ) {
    fail("architecture change promotion must create a new baseline identity");
  }
  assertArtifactRef("baseline approvedDraft", baseline.approvedDraft, candidateRef);
  const requirements =
    candidate.kind === "ArchitectureDraft"
      ? candidate.requirementsBaseline
      : candidate.targetRequirementsBaseline;
  const overview =
    candidate.kind === "ArchitectureDraft"
      ? candidate.projectOverviewBaseline
      : candidate.targetProjectOverviewBaseline;
  assertArtifactRef(
    "baseline requirementsBaseline",
    baseline.requirementsBaseline,
    requirements,
  );
  assertArtifactRef(
    "baseline projectOverviewBaseline",
    baseline.projectOverviewBaseline,
    overview,
  );
  assertArtifactRef(
    "baseline projectContext",
    baseline.projectContext,
    candidate.projectContext,
  );
  if (
    Boolean(baseline.repositorySnapshot) !==
    Boolean(candidate.repositorySnapshot)
  ) {
    fail("baseline repository presence differs from the approved candidate");
  }
  if (candidate.repositorySnapshot) {
    assertArtifactRef(
      "baseline repositorySnapshot",
      baseline.repositorySnapshot,
      candidate.repositorySnapshot,
    );
  }
  if (baseline.approvalPolicyVersion !== policyVersion) {
    fail("baseline approvalPolicyVersion differs from owner approval");
  }
  if (
    baseline.approvalEvidence.length !== gateEvidence.length ||
    baseline.approvalEvidence.some(
      (ref, index) => !sameArtifactRef(ref, gateEvidence[index]),
    )
  ) {
    fail("baseline approvalEvidence differs from the exact Gate evidence");
  }
  if (
    canonicalJsonDigest(baseline.sourceRefs) !==
    canonicalJsonDigest(candidate.sourceRefs)
  ) {
    fail("baseline sourceRefs differ from the approved candidate");
  }
  const expectedSections = acceptedSections(candidate);
  for (const sectionName of SECTION_NAMES) {
    if (
      canonicalJsonDigest(baseline.sections[sectionName]) !==
      canonicalJsonDigest(expectedSections[sectionName])
    ) {
      fail(
        `baseline ${sectionName} differs from the approved candidate target`,
      );
    }
  }
}

export async function validateArchitectureGatePromotion({
  checkpointReplay,
  ownerApproval,
  ownerApprovalRef,
  ownerApprovalBytes,
  baseline,
  baselineRef,
  baselineBytes,
  evidenceResolver,
  resolveAttached,
}) {
  try {
    const { replay, operation, candidate, candidateRef } =
      assertArchitectureReplay(checkpointReplay);
    const approval = await validateOwnerApproval({
      approval: ownerApproval,
      approvalRef: ownerApprovalRef,
      approvalBytes: ownerApprovalBytes,
      candidate,
      evidenceResolver,
      candidateRef,
    });
    const previous = optionalReplayArtifact(
      replay.loadedInputs,
      "architecture-baseline",
    );
    if (operation === "establish-baseline" && previous !== undefined) {
      fail("initial promotion checkpoint cannot contain a previous baseline");
    }
    if (operation === "design-change" && !previous) {
      fail("change promotion checkpoint requires the exact current baseline");
    }
    const requirements = replayArtifact(
      replay.loadedInputs,
      "requirements-baseline",
      "checkpoint replay",
    );
    const approvedRequirementIds = new Set(
      normativeRequirementIds(requirements.value.requirements),
    );
    const options = { approvedRequirementIds, resolveAttached };
    validateArchitectureArtifact(candidate, options);
    if (previous) {
      validateArchitectureChangeSetAgainstBaseline({
        architectureBaseline: previous.value,
        architectureBaselineRef: previous.ref,
        architectureChangeSet: candidate,
        options,
      });
    }
    const baselineDocument = decodeExactJson({
      label: "architecture baseline",
      value: baseline,
      ref: baselineRef,
      bytes: baselineBytes,
      contract: BASELINE_CONTRACT,
      stableId: (value) => value?.baselineId,
    });
    baseline = baselineDocument.value;
    assertBaselineTarget({
      baseline,
      candidate,
      candidateRef,
      gateEvidence: approval.gateEvidence,
      policyVersion: approval.approval.policyVersion,
      previousBaseline: previous?.value,
    });
    validateArchitectureArtifact(baseline, { resolveAttached });
    return immutableCopy({
      operation,
      baseline,
      baselineRef,
      candidateRef,
      previousBaselineRef: previous?.ref,
      ownerApprovalRef,
      gateEvidence: approval.gateEvidence,
      commitPayload: {
        baseline: {
          ref: baselineRef,
          byteLength: baselineDocument.byteLength,
          bytesBase64: baselineDocument.bytesBase64,
        },
      },
    });
  } catch (error) {
    if (error instanceof ArchitectureGateValidationError) throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
}

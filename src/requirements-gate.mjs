import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { deriveProjectOverview } from "./project-overview.mjs";
import { validateRequirementsBaselinePromotion } from "./requirements-artifact-validator.mjs";
import {
  validateProjectOverviewBaselinePromotion,
  validateProjectOverviewChangeSetAgainstBaseline,
  validateProjectOverviewDraftAgainstRequirements,
  validateProjectOverviewRenderedDocument,
} from "./project-overview-artifact-validator.mjs";

export class RequirementsGateValidationError extends Error {
  constructor(message) {
    super(`requirements gate promotion is invalid: ${message}`);
    this.name = "RequirementsGateValidationError";
    this.code = "DR2400";
  }
}

function fail(message) {
  throw new RequirementsGateValidationError(message);
}

function pointerKey(pointer) {
  return `${pointer?.artifactId}\u0000${pointer?.digest}`;
}

function samePointer(left, right) {
  return pointerKey(left) === pointerKey(right);
}

function assertPointer(label, actual, expected) {
  if (!samePointer(actual, expected)) {
    fail(`${label} does not match the exact content-addressed artifact`);
  }
}

function requirePointer(pointer, label) {
  if (
    pointer === null ||
    typeof pointer !== "object" ||
    Array.isArray(pointer) ||
    typeof pointer.artifactId !== "string" ||
    pointer.artifactId.length === 0 ||
    typeof pointer.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(pointer.digest)
  ) {
    fail(`${label} must be a content-addressed artifact pointer`);
  }
}

function artifactStableId(artifact) {
  switch (artifact?.kind) {
    case "RequirementsDraft":
    case "ProjectOverviewDraft":
      return artifact.draftId;
    case "RequirementsChangeSet":
    case "ProjectOverviewChangeSetDraft":
      return artifact.changeSetId;
    case "RequirementsBaseline":
    case "ProjectOverviewBaseline":
      return artifact.baselineId;
    default:
      return undefined;
  }
}

function assertArtifactRef(label, artifact, ref) {
  requirePointer(ref, `${label} ref`);
  const stableId = artifactStableId(artifact);
  if (typeof stableId !== "string" || stableId !== ref.artifactId) {
    fail(`${label} ref does not identify the supplied artifact`);
  }
}

const BASELINE_REF_CONTRACTS = Object.freeze({
  RequirementsBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/requirements-baseline/v1",
    mediaType: "application/vnd.devrelay.requirements-baseline+json",
  }),
  ProjectOverviewBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    mediaType: "application/vnd.devrelay.project-overview-baseline+json",
  }),
});

const ARTIFACT_REF_KEYS = Object.freeze([
  "artifactId",
  "digest",
  "mediaType",
  "schema",
  "uri",
]);

function assertBaselineRef(label, ref, kind) {
  requirePointer(ref, `${label} ref`);
  if (
    Object.keys(ref).sort().join("\u0000") !== ARTIFACT_REF_KEYS.join("\u0000")
  ) {
    fail(`${label} ref must be one closed ArtifactRef`);
  }
  const contract = BASELINE_REF_CONTRACTS[kind];
  if (ref.schema !== contract.schema || ref.mediaType !== contract.mediaType) {
    fail(`${label} ref does not use the published ${kind} contract`);
  }
  try {
    new URL(ref.schema);
    new URL(ref.uri);
  } catch {
    fail(`${label} ref schema and uri must be absolute URIs`);
  }
}

function verifyBaselineDocument({ label, artifact, ref, bytes, kind }) {
  assertBaselineRef(label, ref, kind);
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
  if (parsed.kind !== kind) {
    fail(`${label} bytes do not contain a ${kind}`);
  }
  assertArtifactRef(label, parsed, ref);

  let suppliedDigest;
  let parsedDigest;
  try {
    suppliedDigest = canonicalJsonDigest(artifact);
    parsedDigest = canonicalJsonDigest(parsed);
  } catch {
    fail(`${label} object is not canonical JSON data`);
  }
  if (suppliedDigest !== parsedDigest) {
    fail(`${label} object does not match the exact raw JSON artifact`);
  }

  return Object.freeze({
    artifact: parsed,
    byteLength: raw.byteLength,
    bytesBase64: raw.toString("base64"),
  });
}

function assertUniqueEvidence(evidence, label) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    fail(`${label} must contain at least one approval-evidence pointer`);
  }
  const seen = new Set();
  for (const [index, pointer] of evidence.entries()) {
    requirePointer(pointer, `${label}[${index}]`);
    const key = pointerKey(pointer);
    if (seen.has(key)) {
      fail(`${label} contains duplicate approval evidence ${pointer.artifactId}`);
    }
    seen.add(key);
  }
}

function assertPairedApprovalEvidence(requirementsBaseline, overviewBaseline) {
  const requirementsEvidence = requirementsBaseline.approvalEvidence;
  const overviewEvidence = overviewBaseline.approvalEvidence;
  assertUniqueEvidence(
    requirementsEvidence,
    "RequirementsBaseline approvalEvidence",
  );
  assertUniqueEvidence(
    overviewEvidence,
    "ProjectOverviewBaseline approvalEvidence",
  );
  if (
    requirementsEvidence.length !== overviewEvidence.length ||
    requirementsEvidence.some(
      (pointer, index) => !samePointer(pointer, overviewEvidence[index]),
    )
  ) {
    fail("paired baselines must carry exactly matching approvalEvidence");
  }
}

function immutableCopy(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) {
        freeze(child);
      }
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
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

function assertRequirementsReplay(receipt) {
  let replay;
  try {
    replay = assertVerifiedCheckpointReplayReceipt(receipt);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const invocation = replay.invocation;
  if (
    invocation?.module?.id !== "requirements-gathering" ||
    invocation.module.operation !== "gather" ||
    replay.moduleResult?.invocationId !== invocation.invocationId ||
    replay.moduleResult.status !== "completed"
  ) {
    fail("checkpoint replay is not a completed RequirementsGathering invocation");
  }
  return replay;
}

/**
 * Validate one inseparable RequirementsBaseline + ProjectOverviewBaseline
 * promotion candidate. Promotion accepts only an unforgeable in-process receipt
 * returned by registry.verifyCheckpointedExecution. That replay path requires
 * the exact terminal checkpoint and revalidates invocation identity, inputs,
 * result contracts, canonical artifacts, runtime lineage, and native bytes
 * without invoking an adapter. Proposed baselines must also be supplied as
 * exact raw JSON bytes bound to closed ArtifactRefs. The host must decode and
 * commit both documents from the returned frozen base64 commitPayload in one
 * transaction, or persist neither value. A cross-process host must first define
 * a separate content-addressed verification-receipt artifact; plain
 * ModuleResult JSON is intentionally insufficient.
 */
export function validateRequirementsGatePromotion({
  checkpointReplay,
  requirementsBaseline,
  requirementsBaselineRef,
  requirementsBaselineBytes,
  projectOverviewBaseline,
  projectOverviewBaselineRef,
  projectOverviewBaselineBytes,
  projectOverviewMarkdownBytes,
}) {
  const replay = assertRequirementsReplay(checkpointReplay);
  const requirementsBaselineDocument = verifyBaselineDocument({
    label: "requirements baseline",
    artifact: requirementsBaseline,
    ref: requirementsBaselineRef,
    bytes: requirementsBaselineBytes,
    kind: "RequirementsBaseline",
  });
  const projectOverviewBaselineDocument = verifyBaselineDocument({
    label: "project overview baseline",
    artifact: projectOverviewBaseline,
    ref: projectOverviewBaselineRef,
    bytes: projectOverviewBaselineBytes,
    kind: "ProjectOverviewBaseline",
  });
  requirementsBaseline = requirementsBaselineDocument.artifact;
  projectOverviewBaseline = projectOverviewBaselineDocument.artifact;

  const outcome = replay.moduleResult.outcome;
  const initial = outcome === "drafted";
  const change = outcome === "change_set_drafted";
  if (!initial && !change) {
    fail("checkpoint replay must end in a promotable requirements outcome");
  }

  const requirementsPort = initial
    ? "requirements-draft"
    : "requirements-change-set";
  const overviewPort = initial
    ? "project-overview-draft"
    : "project-overview-change-set-draft";
  const requirementsLoaded = replayArtifact(
    replay.loadedOutputs,
    requirementsPort,
    "promotable checkpoint replay",
  );
  const overviewLoaded = replayArtifact(
    replay.loadedOutputs,
    overviewPort,
    "promotable checkpoint replay",
  );
  replayArtifact(
    replay.loadedOutputs,
    "native-source-bundle",
    "promotable checkpoint replay",
  );
  const requirementsCandidate = requirementsLoaded.value;
  const requirementsCandidateRef = requirementsLoaded.ref;
  const projectOverviewCandidate = overviewLoaded.value;
  const projectOverviewCandidateRef = overviewLoaded.ref;

  const expectedRequirementsKind = initial
    ? "RequirementsDraft"
    : "RequirementsChangeSet";
  const expectedOverviewKind = initial
    ? "ProjectOverviewDraft"
    : "ProjectOverviewChangeSetDraft";
  if (
    requirementsCandidate?.kind !== expectedRequirementsKind ||
    projectOverviewCandidate?.kind !== expectedOverviewKind
  ) {
    fail("checkpoint replay candidate kinds do not match its promotable outcome");
  }

  for (const [label, artifact, ref] of [
    ["requirements candidate", requirementsCandidate, requirementsCandidateRef],
    ["project overview candidate", projectOverviewCandidate, projectOverviewCandidateRef],
    ["requirements baseline", requirementsBaseline, requirementsBaselineRef],
    ["project overview baseline", projectOverviewBaseline, projectOverviewBaselineRef],
  ]) {
    assertArtifactRef(label, artifact, ref);
  }

  const previousRequirements = optionalReplayArtifact(
    replay.loadedInputs,
    "requirements-baseline",
  );
  const previousOverview = optionalReplayArtifact(
    replay.loadedInputs,
    "project-overview-baseline",
  );
  if (initial) {
    if (previousRequirements !== undefined || previousOverview !== undefined) {
      fail("initial promotion checkpoint cannot contain previous baselines");
    }
  } else if (!previousRequirements || !previousOverview) {
    fail("change promotion checkpoint requires the exact previous baseline pair");
  }

  const previousRequirementsBaseline = previousRequirements?.value;
  const previousRequirementsBaselineRef = previousRequirements?.ref;
  const previousProjectOverviewBaseline = previousOverview?.value;
  const previousProjectOverviewBaselineRef = previousOverview?.ref;

  if (change) {
    assertArtifactRef(
      "previous requirements baseline",
      previousRequirementsBaseline,
      previousRequirementsBaselineRef,
    );
    assertArtifactRef(
      "previous project overview baseline",
      previousProjectOverviewBaseline,
      previousProjectOverviewBaselineRef,
    );
    if (
      previousRequirementsBaseline.version !==
      previousProjectOverviewBaseline.version
    ) {
      fail("previous paired baseline semantic versions do not match");
    }
    assertPointer(
      "previous ProjectOverviewBaseline requirementsBaseline",
      previousProjectOverviewBaseline.requirementsBaseline,
      previousRequirementsBaselineRef,
    );
    if (
      canonicalJsonDigest(previousProjectOverviewBaseline.overview) !==
      canonicalJsonDigest(
        deriveProjectOverview(previousRequirementsBaseline.requirements),
      )
    ) {
      fail(
        "previous ProjectOverviewBaseline is not the exact projection of the paired RequirementsBaseline",
      );
    }
  }

  if (requirementsBaseline.version !== projectOverviewBaseline.version) {
    fail("new paired baseline semantic versions do not match");
  }
  assertPairedApprovalEvidence(requirementsBaseline, projectOverviewBaseline);

  validateRequirementsBaselinePromotion({
    candidate: requirementsCandidate,
    candidateRef: requirementsCandidateRef,
    baseline: requirementsBaseline,
    previousBaseline: previousRequirementsBaseline,
    previousBaselineRef: previousRequirementsBaselineRef,
  });

  if (initial) {
    validateProjectOverviewDraftAgainstRequirements({
      projectOverviewDraft: projectOverviewCandidate,
      requirementsDraft: requirementsCandidate,
      requirementsDraftRef: requirementsCandidateRef,
    });
  } else {
    validateProjectOverviewChangeSetAgainstBaseline({
      projectOverviewChangeSet: projectOverviewCandidate,
      requirementsChangeSet: requirementsCandidate,
      requirementsChangeSetRef: requirementsCandidateRef,
      baseOverview: previousProjectOverviewBaseline,
      baseOverviewRef: previousProjectOverviewBaselineRef,
    });
  }

  validateProjectOverviewBaselinePromotion({
    projectOverviewBaseline,
    approvedCandidate: projectOverviewCandidate,
    approvedCandidateRef: projectOverviewCandidateRef,
    requirementsBaseline,
    requirementsBaselineRef,
    previousBaseline: previousProjectOverviewBaseline,
    previousBaselineRef: previousProjectOverviewBaselineRef,
  });
  validateProjectOverviewRenderedDocument({
    projectOverviewArtifact: projectOverviewCandidate,
    renderedDocumentBytes: projectOverviewMarkdownBytes,
  });
  validateProjectOverviewRenderedDocument({
    projectOverviewArtifact: projectOverviewBaseline,
    renderedDocumentBytes: projectOverviewMarkdownBytes,
  });

  return immutableCopy({
    requirementsBaseline,
    requirementsBaselineRef,
    projectOverviewBaseline,
    projectOverviewBaselineRef,
    commitPayload: {
      requirementsBaseline: {
        ref: requirementsBaselineRef,
        byteLength: requirementsBaselineDocument.byteLength,
        bytesBase64: requirementsBaselineDocument.bytesBase64,
      },
      projectOverviewBaseline: {
        ref: projectOverviewBaselineRef,
        byteLength: projectOverviewBaselineDocument.byteLength,
        bytesBase64: projectOverviewBaselineDocument.bytesBase64,
      },
    },
  });
}

import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import {
  sameWorkBreakdownArtifactRef,
  validateWorkBreakdownBaselinePromotion,
  validateWorkBreakdownCandidateAgainstInputs,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
} from "./work-breakdown-artifact-validator.mjs";

export class WorkBreakdownGateValidationError extends Error {
  constructor(message) {
    super(`work-breakdown gate rejected candidate: ${message}`);
    this.name = "WorkBreakdownGateValidationError";
    this.code = "DR2700";
  }
}

function fail(message) {
  throw new WorkBreakdownGateValidationError(message);
}

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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const ARTIFACT_REF_KEYS = Object.freeze([
  "artifactId",
  "digest",
  "mediaType",
  "schema",
  "uri",
]);

function assertClosedArtifactRef(label, ref, expectedContract) {
  if (
    ref === null ||
    typeof ref !== "object" ||
    Array.isArray(ref) ||
    Object.keys(ref).sort().join("\u0000") !== ARTIFACT_REF_KEYS.join("\u0000") ||
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

function candidateStableId(candidate) {
  if (candidate?.kind === "WorkBreakdownDraft") return candidate.draftId;
  if (candidate?.kind === "WorkBreakdownChangeSetDraft") {
    return candidate.changeSetId;
  }
  return undefined;
}

function assertCandidateArtifactRef(candidate, ref, label = "candidate") {
  const contract = WORK_BREAKDOWN_ARTIFACT_CONTRACTS[candidate?.kind];
  if (!contract) fail(`${label} has an unsupported artifact kind`);
  assertClosedArtifactRef(`${label} ref`, ref, contract);
  if (candidateStableId(candidate) !== ref.artifactId) {
    fail(`${label} ref does not identify the supplied artifact`);
  }
}

function assertBaselineArtifactRef(baseline, ref, label = "baseline") {
  assertClosedArtifactRef(
    `${label} ref`,
    ref,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
  );
  if (baseline?.kind !== "WorkBreakdownBaseline") {
    fail(`${label} is not a WorkBreakdownBaseline`);
  }
  if (baseline.baselineId !== ref.artifactId) {
    fail(`${label} ref does not identify the supplied artifact`);
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

function assertWorkBreakdownReplay(receipt) {
  let replay;
  try {
    replay = assertVerifiedCheckpointReplayReceipt(receipt);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const invocation = replay.invocation;
  const operation = invocation?.module?.operation;
  const expected = {
    "establish-breakdown": {
      kind: "WorkBreakdownDraft",
      port: "work-breakdown-draft",
    },
    "decompose-change": {
      kind: "WorkBreakdownChangeSetDraft",
      port: "work-breakdown-change-set-draft",
    },
  }[operation];
  if (
    invocation?.module?.id !== "work-breakdown" ||
    invocation.module.version !== "0.1.0" ||
    expected === undefined ||
    replay.moduleResult?.invocationId !== invocation.invocationId ||
    replay.moduleResult.status !== "completed" ||
    replay.moduleResult.outcome !== "decomposed"
  ) {
    fail("checkpoint replay is not a completed promotable WorkBreakdown 0.1.0 invocation");
  }
  const loaded = replayArtifact(
    replay.loadedOutputs,
    expected.port,
    "promotable checkpoint replay",
  );
  if (
    loaded.value?.kind !== expected.kind ||
    loaded.value.operation !== operation
  ) {
    fail("checkpoint replay candidate does not match its selected operation");
  }
  assertCandidateArtifactRef(loaded.value, loaded.ref);
  return { replay, operation, candidate: loaded.value, candidateRef: loaded.ref };
}

function approvalKey(scopeKind, scopeRef) {
  return `${scopeKind}\u0000${scopeRef}`;
}

function requireClosedApproval(approval, candidateRef) {
  const keys = [
    "authority",
    "candidate",
    "scopeKind",
    "scopeRef",
    "evidence",
  ].sort();
  if (
    approval === null ||
    typeof approval !== "object" ||
    Array.isArray(approval) ||
    Object.keys(approval).sort().join("\u0000") !== keys.join("\u0000")
  ) {
    fail("no-work approval must be one closed Gate-owned proof");
  }
  if (approval.authority !== "work-breakdown-gate") {
    fail("no-work approval has spoofed authority");
  }
  assertClosedArtifactRef("no-work approval candidate", approval.candidate);
  if (!sameWorkBreakdownArtifactRef(approval.candidate, candidateRef)) {
    fail("no-work approval is stale or bound to another candidate");
  }
  assertClosedArtifactRef("no-work approval evidence", approval.evidence);
  if (
    !["acceptance-criterion", "architecture", "contract"].includes(
      approval.scopeKind,
    ) ||
    typeof approval.scopeRef !== "string" ||
    approval.scopeRef.length === 0
  ) {
    fail("no-work approval scope is malformed");
  }
}

async function resolveEvidence(ref, evidenceResolver, label) {
  if (typeof evidenceResolver !== "function") {
    fail(`${label} requires an exact evidence resolver`);
  }
  let resolved;
  try {
    resolved = await evidenceResolver(ref);
  } catch (error) {
    fail(`${label} could not be resolved: ${error.message}`);
  }
  const resolvedRef = resolved?.ref ?? resolved;
  if (!sameWorkBreakdownArtifactRef(resolvedRef, ref)) {
    fail(`${label} did not resolve the exact content-addressed evidence`);
  }
}

async function validateCoverageAuthority({
  candidate,
  candidateRef,
  evidenceResolver,
  noWorkApprovals,
}) {
  const approvals = new Map();
  for (const approval of noWorkApprovals ?? []) {
    requireClosedApproval(approval, candidateRef);
    const key = approvalKey(approval.scopeKind, approval.scopeRef);
    if (approvals.has(key)) fail(`duplicate no-work approval for ${key}`);
    approvals.set(key, approval);
  }
  const expected = new Set();
  for (const disposition of candidate.coverageDispositions) {
    if (disposition.disposition === "already-satisfied") {
      for (const evidence of disposition.currentEvidence) {
        await resolveEvidence(
          evidence,
          evidenceResolver,
          `already-satisfied ${disposition.scopeKind} ${disposition.scopeRef}`,
        );
      }
    }
    if (disposition.disposition === "no-work-required") {
      const key = approvalKey(disposition.scopeKind, disposition.scopeRef);
      expected.add(key);
      const approval = approvals.get(key);
      if (!approval) {
        fail(
          `no-work-required ${disposition.scopeKind} ${disposition.scopeRef} lacks Gate approval`,
        );
      }
      await resolveEvidence(
        approval.evidence,
        evidenceResolver,
        `no-work approval ${disposition.scopeKind} ${disposition.scopeRef}`,
      );
    }
  }
  if (
    approvals.size !== expected.size ||
    [...approvals.keys()].some((key) => !expected.has(key))
  ) {
    fail("no-work approval set contains an unrequested scope");
  }
  return [...approvals.values()].sort((left, right) =>
    compareText(
      approvalKey(left.scopeKind, left.scopeRef),
      approvalKey(right.scopeKind, right.scopeRef),
    ),
  );
}

function rejectBlockingDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics)) {
    fail("checkpoint replay diagnostics must be an array");
  }
  const blocking = diagnostics.filter(
    (diagnostic) => diagnostic?.severity === "error",
  );
  if (blocking.length > 0) {
    fail(
      `candidate has blocking diagnostics: ${blocking
        .map(({ code }) => code ?? "UNKNOWN")
        .sort(compareText)
        .join(", ")}`,
    );
  }
}

function verifyBaselineDocument({ baseline, ref, bytes }) {
  assertBaselineArtifactRef(baseline, ref);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail("baseline must be supplied as exact raw bytes");
  }
  const raw = Buffer.from(bytes);
  if (sha256Digest(raw) !== ref.digest) {
    fail("baseline bytes do not match their ArtifactRef digest");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    fail("baseline bytes are not valid UTF-8");
  }
  if (!Buffer.from(text, "utf8").equals(raw)) {
    fail("baseline bytes must be BOM-free canonical UTF-8");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("baseline bytes are not a valid JSON document");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("baseline bytes must decode to one JSON object");
  }
  assertBaselineArtifactRef(parsed, ref, "raw baseline");

  let suppliedDigest;
  let parsedDigest;
  try {
    suppliedDigest = canonicalJsonDigest(baseline);
    parsedDigest = canonicalJsonDigest(parsed);
  } catch {
    fail("baseline object is not canonical JSON data");
  }
  if (suppliedDigest !== parsedDigest) {
    fail("baseline object does not match the exact raw JSON artifact");
  }
  return Object.freeze({
    baseline: parsed,
    byteLength: raw.byteLength,
    bytesBase64: raw.toString("base64"),
  });
}

async function resolveArchitectureModelAttachment(
  replay,
  architectureAttachmentResolver,
) {
  const architecture = replayArtifact(
    replay.loadedInputs,
    "architecture-baseline",
    "checkpoint replay",
  );
  const section = architecture.value?.sections?.architectureModel;
  if (section?.mode !== "attached") return undefined;
  if (typeof architectureAttachmentResolver !== "function") {
    fail("attached architecture model requires an exact artifact resolver");
  }
  let loaded;
  try {
    loaded = await architectureAttachmentResolver(section.artifact);
  } catch (error) {
    fail(`attached architecture model could not be resolved: ${error.message}`);
  }
  if (!sameWorkBreakdownArtifactRef(loaded?.ref, section.artifact)) {
    fail("attached architecture model resolver returned another artifact");
  }
  return loaded;
}

/**
 * Validate the only promotable WorkBreakdown candidate from an unforgeable
 * in-process receipt returned by registry.verifyCheckpointedExecution. The
 * candidate, operation, exact loaded inputs, and diagnostics are replay-owned;
 * callers cannot substitute any of them. Dependency-hint semantics remain the
 * responsibility of WorkDependencyAnalysis.
 */
export async function validateWorkBreakdownGateCandidate({
  checkpointReplay,
  evidenceResolver,
  noWorkApprovals = [],
  architectureAttachmentResolver,
}) {
  try {
    const { replay, operation, candidate, candidateRef } =
      assertWorkBreakdownReplay(checkpointReplay);
    validateWorkBreakdownCandidateAgainstInputs({
      candidate,
      operation,
      loadedInputs: replay.loadedInputs,
      architectureModelAttachment: await resolveArchitectureModelAttachment(
        replay,
        architectureAttachmentResolver,
      ),
    });
    rejectBlockingDiagnostics(replay.moduleResult.diagnostics ?? []);
    const approvals = await validateCoverageAuthority({
      candidate,
      candidateRef,
      evidenceResolver,
      noWorkApprovals,
    });
    return immutableCopy({
      candidate,
      candidateRef,
      operation,
      noWorkApprovals: approvals,
    });
  } catch (error) {
    if (error instanceof WorkBreakdownGateValidationError) throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Validate and freeze an exact WorkBreakdownBaseline promotion. The baseline
 * must be supplied as content-addressed raw UTF-8 JSON. The host must persist
 * only the returned commitPayload bytes and must do so atomically, or persist
 * nothing. Plain ModuleResult or serialized receipt JSON is insufficient.
 */
export async function validateWorkBreakdownGatePromotion({
  checkpointReplay,
  baseline,
  baselineRef,
  baselineBytes,
  evidenceResolver,
  noWorkApprovals = [],
  architectureAttachmentResolver,
}) {
  const approved = await validateWorkBreakdownGateCandidate({
    checkpointReplay,
    evidenceResolver,
    noWorkApprovals,
    architectureAttachmentResolver,
  });
  try {
    const { replay } = assertWorkBreakdownReplay(checkpointReplay);
    const baselineDocument = verifyBaselineDocument({
      baseline,
      ref: baselineRef,
      bytes: baselineBytes,
    });
    baseline = baselineDocument.baseline;

    const previous = optionalReplayArtifact(
      replay.loadedInputs,
      "current-work-breakdown-baseline",
    );
    if (approved.operation === "establish-breakdown") {
      if (previous !== undefined) {
        fail("initial promotion checkpoint cannot contain a previous baseline");
      }
    } else if (!previous) {
      fail("change promotion checkpoint requires the exact current baseline");
    }
    if (previous) {
      assertBaselineArtifactRef(
        previous.value,
        previous.ref,
        "checkpoint current baseline",
      );
    }

    const validatedBaseline = validateWorkBreakdownBaselinePromotion({
      candidate: approved.candidate,
      candidateRef: approved.candidateRef,
      baseline,
      previousBaseline: previous?.value,
      previousBaselineRef: previous?.ref,
      noWorkApprovals: approved.noWorkApprovals,
    });
    return immutableCopy({
      baseline: validatedBaseline,
      baselineRef,
      candidateRef: approved.candidateRef,
      operation: approved.operation,
      noWorkApprovals: approved.noWorkApprovals,
      commitPayload: {
        baseline: {
          ref: baselineRef,
          byteLength: baselineDocument.byteLength,
          bytesBase64: baselineDocument.bytesBase64,
        },
      },
    });
  } catch (error) {
    if (error instanceof WorkBreakdownGateValidationError) throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
}
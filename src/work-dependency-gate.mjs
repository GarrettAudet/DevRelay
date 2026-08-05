import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  validateWorkDependencyArtifact,
  WORK_DEPENDENCY_ARTIFACT_CONTRACTS,
} from "./work-dependency-artifact-validator.mjs";
import { assertVerifiedWorkDependencyReceipt } from "./work-dependency-runtime.mjs";

const APPROVAL_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/evidence/work-dependency-gate-approval/v1",
  mediaType: "application/vnd.devrelay.work-dependency-gate-approval+json",
});
const REF_KEYS = Object.freeze([
  "artifactId",
  "digest",
  "mediaType",
  "schema",
  "uri",
]);

export class WorkDependencyGateValidationError extends Error {
  constructor(message) {
    super(`work dependency gate rejected candidate: ${message}`);
    this.name = "WorkDependencyGateValidationError";
    this.code = "DR3060";
  }
}

function fail(message) {
  throw new WorkDependencyGateValidationError(message);
}

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

function sameRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.schema === right.schema &&
      left.mediaType === right.mediaType &&
      left.digest === right.digest,
  );
}

function assertRef(ref, label, contract) {
  if (
    !ref ||
    typeof ref !== "object" ||
    Array.isArray(ref) ||
    Object.keys(ref).sort().join("\u0000") !== REF_KEYS.join("\u0000") ||
    typeof ref.artifactId !== "string" ||
    typeof ref.schema !== "string" ||
    typeof ref.mediaType !== "string" ||
    typeof ref.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(ref.digest) ||
    typeof ref.uri !== "string"
  ) {
    fail(`${label} must be one closed content-addressed ArtifactRef`);
  }
  if (
    contract &&
    (ref.schema !== contract.schema || ref.mediaType !== contract.mediaType)
  ) {
    fail(`${label} does not use its published contract`);
  }
}

function decodeExactJson({ value, ref, bytes, label, contract, stableId }) {
  assertRef(ref, `${label} ref`, contract);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail(`${label} requires exact raw bytes`);
  }
  const raw = Buffer.from(bytes);
  if (sha256Digest(raw) !== ref.digest) fail(`${label} bytes do not match its ref`);
  let parsed;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    if (!Buffer.from(text, "utf8").equals(raw)) throw new Error("non-canonical UTF-8");
    parsed = JSON.parse(text);
  } catch {
    fail(`${label} is not exact BOM-free UTF-8 JSON`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    canonicalJsonDigest(parsed) !== canonicalJsonDigest(value) ||
    stableId(parsed) !== ref.artifactId
  ) {
    fail(`${label} object does not match its exact raw artifact`);
  }
  return parsed;
}

function record(checkpoint, name) {
  const value = checkpoint.artifacts?.[name];
  if (!value?.ref || value.value === undefined) {
    fail(`verified checkpoint omits ${name}`);
  }
  return value;
}

function validateAuthority(checkpoint) {
  if (
    checkpoint.operation !== "analyze-dependencies" ||
    checkpoint.outcome !== "analyzed" ||
    checkpoint.progressionAllowed !== true
  ) {
    fail("checkpoint is not a progression-eligible dependency analysis");
  }
  const mechanics = record(checkpoint, "graphMechanics").value;
  const policy = record(checkpoint, "policyDecisionSet").value;
  const review = record(checkpoint, "consistencyReview").value;
  const candidate = record(checkpoint, "candidate").value;
  const proposal = record(checkpoint, "proposal").value;
  if (
    mechanics.status !== "valid" ||
    mechanics.diagnostics.length !== 0 ||
    mechanics.cycleWitness.length !== 0 ||
    mechanics.topologicalOrder.length !== mechanics.nodes.length
  ) {
    fail("Core graph mechanics did not prove one complete acyclic graph");
  }
  if (
    policy.evaluationStatus !== "evaluated" ||
    policy.allow !== true ||
    policy.denials.length !== 0 ||
    policy.diagnostics.length !== 0
  ) {
    fail("OPA did not affirmatively allow the exact graph");
  }
  const edgeIds = [...mechanics.edges.map(({ id }) => id)].sort();
  const decisionIds = [...policy.edgeDecisions.map(({ edgeId }) => edgeId)].sort();
  if (
    canonicalJsonDigest(edgeIds) !== canonicalJsonDigest(decisionIds) ||
    policy.edgeDecisions.some(({ allow }) => allow !== true)
  ) {
    fail("OPA edge decisions do not affirmatively cover every edge exactly once");
  }
  if (
    review.status !== "pass" ||
    review.findings.some(({ severity }) => severity === "error") ||
    review.graphDigest !== mechanics.graphDigest
  ) {
    fail("consistency review is not a passing review of the exact graph");
  }
  if (
    candidate.graphDigest !== mechanics.graphDigest ||
    candidate.hintDispositions.length !== proposal.hintDispositions.length
  ) {
    fail("candidate does not preserve its Core graph and hint disposition proof");
  }
  return { candidate, mechanics, policy, review };
}

async function validateApproval(approval, candidateRef, evidenceResolver) {
  const value = decodeExactJson({
    ...approval,
    label: "Gate approval",
    contract: APPROVAL_CONTRACT,
    stableId: (document) => document.approvalId,
  });
  const expectedKeys = [
    "apiVersion",
    "approvalId",
    "authority",
    "candidate",
    "decision",
    "kind",
    "policyVersion",
    "requiredEvidence",
  ].sort();
  if (
    Object.keys(value).sort().join("\u0000") !== expectedKeys.join("\u0000") ||
    value.apiVersion !== "devrelay.dev/v1alpha1" ||
    value.kind !== "WorkDependencyGateApproval" ||
    value.authority !== "project-owner" ||
    value.decision !== "approve" ||
    value.policyVersion !== "work-dependency-gate/0.1.0" ||
    !sameRef(value.candidate, candidateRef) ||
    !Array.isArray(value.requiredEvidence) ||
    value.requiredEvidence.length === 0
  ) {
    fail("Gate approval is not a closed affirmative decision for this candidate");
  }
  if (typeof evidenceResolver !== "function") {
    fail("Gate approval requires an exact evidence resolver");
  }
  const seen = new Set();
  for (const evidence of value.requiredEvidence) {
    assertRef(evidence, "Gate approval evidence");
    const identity = `${evidence.artifactId}\u0000${evidence.digest}`;
    if (seen.has(identity)) fail("Gate approval repeats supporting evidence");
    seen.add(identity);
    const loaded = await evidenceResolver(evidence);
    if (!sameRef(loaded?.ref ?? loaded, evidence)) {
      fail(`Gate approval evidence ${evidence.artifactId} did not resolve exactly`);
    }
    if (loaded?.bytes && sha256Digest(Buffer.from(loaded.bytes)) !== evidence.digest) {
      fail(`Gate approval evidence ${evidence.artifactId} bytes drifted`);
    }
  }
  return { value, ref: approval.ref };
}

export async function promoteWorkDependencyBaseline({
  replayReceipt,
  baseline,
  baselineRef,
  baselineBytes,
  approval,
  evidenceResolver,
}) {
  let checkpoint;
  try {
    checkpoint = assertVerifiedWorkDependencyReceipt(replayReceipt);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const { candidate, policy, review } = validateAuthority(checkpoint);
  const candidateRecord = record(checkpoint, "candidate");
  const approved = await validateApproval(
    approval,
    candidateRecord.ref,
    evidenceResolver,
  );
  const exactBaseline = decodeExactJson({
    value: baseline,
    ref: baselineRef,
    bytes: baselineBytes,
    label: "WorkDependencyBaseline",
    contract: WORK_DEPENDENCY_ARTIFACT_CONTRACTS.WorkDependencyBaseline,
    stableId: (value) => value.baselineId,
  });
  validateWorkDependencyArtifact(exactBaseline, { ref: baselineRef });
  const workBreakdownRef = checkpoint.inputBindings.find(
    ({ role }) => role === "work-breakdown-baseline",
  )?.artifact;
  if (
    !sameRef(exactBaseline.approvedCandidate, candidateRecord.ref) ||
    !sameRef(exactBaseline.workBreakdownBaseline, workBreakdownRef) ||
    !sameRef(exactBaseline.policyEvidence, record(checkpoint, "policyDecisionSet").ref) ||
    !sameRef(
      exactBaseline.consistencyEvidence,
      record(checkpoint, "consistencyReview").ref,
    ) ||
    exactBaseline.approvalEvidence.length !== 1 ||
    !sameRef(exactBaseline.approvalEvidence[0], approved.ref) ||
    exactBaseline.graphDigest !== candidate.graphDigest ||
    canonicalJsonDigest(exactBaseline.nodes) !== canonicalJsonDigest(candidate.nodes) ||
    canonicalJsonDigest(exactBaseline.edges) !== canonicalJsonDigest(candidate.edges) ||
    canonicalJsonDigest(exactBaseline.topologicalOrder) !==
      canonicalJsonDigest(candidate.topologicalOrder) ||
    canonicalJsonDigest(exactBaseline.sourceRefs) !==
      canonicalJsonDigest(candidate.sourceRefs)
  ) {
    fail("baseline is not the exact static DAG authorized by the candidate");
  }
  const commitMaterial = {
    executionId: checkpoint.executionId,
    checkpointDigest: checkpoint.checkpointDigest,
    candidate: candidateRecord.ref,
    baseline: baselineRef,
    approval: approved.ref,
    policy: record(checkpoint, "policyDecisionSet").ref,
    consistencyReview: record(checkpoint, "consistencyReview").ref,
    graphDigest: exactBaseline.graphDigest,
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyGateCommitPayload",
    progressionAllowed: true,
    operation: "analyze-dependencies",
    baseline: exactBaseline,
    baselineRef: structuredClone(baselineRef),
    approval: approved.value,
    policyAllow: policy.allow,
    consistencyStatus: review.status,
    checkpointDigest: checkpoint.checkpointDigest,
    commitDigest: canonicalJsonDigest(commitMaterial),
  });
}

export const WORK_DEPENDENCY_GATE_APPROVAL_CONTRACT = APPROVAL_CONTRACT;

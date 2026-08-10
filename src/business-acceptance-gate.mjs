import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateBusinessAcceptanceArtifact } from "./business-acceptance-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const PREFIX = "business-acceptance/gates";

export class BusinessAcceptanceGateError extends Error {
  constructor(message, outcome = "unable-to-proceed") {
    super(`business acceptance Gate failed: ${message}`);
    this.name = "BusinessAcceptanceGateError";
    this.code = "DR4160";
    this.outcome = outcome;
    this.outputs = Object.freeze([]);
  }
}

const fail = (message, outcome) => { throw new BusinessAcceptanceGateError(message, outcome); };
const ref = (value, id, digest) => ({ artifactId: value[id], digest: value[digest] });
const immutable = value => {
  const copy = structuredClone(value);
  const freeze = item => { if (item && typeof item === "object" && !ArrayBuffer.isView(item) && !Object.isFrozen(item)) { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } return item; };
  return freeze(copy);
};
const bodyDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const keyFor = checkpointId => `${PREFIX}/${encodeURIComponent(checkpointId)}`;

function requireStore(checkpoints) {
  if (!checkpoints || typeof checkpoints.get !== "function" || typeof checkpoints.put !== "function") fail("an immutable checkpoint store with get and put is required");
}

function exactCanonicalCandidate(candidateRawBytes) {
  if (!(Buffer.isBuffer(candidateRawBytes) || candidateRawBytes instanceof Uint8Array)) fail("canonical raw candidate bytes are required");
  const bytes = Buffer.from(candidateRawBytes);
  let candidate;
  try { candidate = JSON.parse(bytes.toString("utf8")); } catch { fail("candidate raw bytes are not valid UTF-8 JSON"); }
  if (!Buffer.from(canonicalJson(candidate), "utf8").equals(bytes)) fail("candidate raw bytes are not the canonical JSON encoding");
  return { candidate, bytes, rawDigest: sha256Digest(bytes) };
}

function exactCanonicalApproval(ownerResult) {
  let raw = ownerResult;
  if (ownerResult && typeof ownerResult === "object" && !ArrayBuffer.isView(ownerResult)) {
    if (Array.isArray(ownerResult) || Object.keys(ownerResult).length !== 1 || !Object.hasOwn(ownerResult, "approvalRawBytes")) fail("owner Gate result must contain only approvalRawBytes");
    raw = ownerResult.approvalRawBytes;
  }
  if (!(Buffer.isBuffer(raw) || raw instanceof Uint8Array)) fail("canonical raw owner approval bytes are required");
  const bytes = Buffer.from(raw);
  let text, approval;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); approval = JSON.parse(text); }
  catch { fail("owner approval bytes are not valid UTF-8 JSON"); }
  if (!Buffer.from(canonicalJson(approval), "utf8").equals(bytes)) fail("owner approval bytes are not the canonical JSON encoding");
  return { approval, rawDigest: sha256Digest(bytes) };
}

function coverageRef(technicalCoverage) {
  return ref(technicalCoverage, "coverageId", "coverageDigest");
}

function validateLineage(candidate, context) {
  const { evaluation, subject, policy, evidence, technicalCoverage } = context ?? {};
  try {
    validateBusinessAcceptanceArtifact(technicalCoverage, {
      requirementsBaseline: subject?.requirementsBaseline,
      systemVerificationResult: context?.subjectContext?.systemVerificationResult,
      traceabilityCheckpoint: subject?.traceabilityCheckpoint,
      approvedAcceptanceCriterionIds: technicalCoverage?.approvedAcceptanceCriterionIds
    });
    validateBusinessAcceptanceArtifact(policy);
    validateBusinessAcceptanceArtifact(evidence, { requirementsBaseline: subject?.requirementsBaseline, projectOverviewBaseline: subject?.projectOverviewBaseline, systemVerificationResult: context?.subjectContext?.systemVerificationResult });
    validateBusinessAcceptanceArtifact(subject, { ...context.subjectContext, technicalCoverage });
    validateBusinessAcceptanceArtifact(evaluation, { subject, policy, evidence, technicalCoverage });
    validateBusinessAcceptanceArtifact(candidate, { evaluation });
  } catch (error) { fail(error.message, /stale|substituted|drift/.test(error.message) ? "baseline-drift" : "unable-to-proceed"); }
}

function validateApproval(approval, candidate, candidateRawDigest, technicalCoverage) {
  try { return validateBusinessAcceptanceArtifact(approval, { candidate, candidateRawDigest, technicalCoverageRef: coverageRef(technicalCoverage) }); }
  catch (error) { fail(error.message); }
}

function assembleRecord(candidate, approval, technicalCoverage) {
  if (approval.approvedContext.technicalCoverage.artifactId !== technicalCoverage.coverageId || approval.approvedContext.technicalCoverage.digest !== technicalCoverage.coverageDigest) fail("record technical coverage lineage is stale or substituted");
  const outcome = approval.decision === "approved" ? "accepted" : "rejected";
  const material = { candidate: ref(candidate, "candidateId", "candidateDigest"), approval: ref(approval, "approvalId", "approvalDigest"), subject: candidate.subject, outcome, lifecycleDisposition: outcome === "accepted" ? "construction-complete" : "incomplete", authority: "business-acceptance-gate" };
  const recordId = `BA-RECORD-${canonicalJsonDigest(material).slice(7, 31)}`;
  const body = { apiVersion: API, kind: "BusinessAcceptanceRecord", recordId, ...material };
  const record = { ...body, recordDigest: bodyDigest(body, "recordDigest") };
  try { return validateBusinessAcceptanceArtifact(record, { candidate, approval }); }
  catch (error) { fail(error.message); }
}

function validateCheckpoint(checkpoint, expected) {
  if (!checkpoint || checkpoint.apiVersion !== API || checkpoint.kind !== "BusinessAcceptanceGateCheckpoint") fail("Gate checkpoint has an invalid envelope");
  if (checkpoint.checkpointDigest !== bodyDigest(checkpoint, "checkpointDigest")) fail("Gate checkpoint digest is invalid");
  if (checkpoint.checkpointId !== expected.checkpointId || checkpoint.candidateRawDigest !== expected.candidateRawDigest) fail("Gate checkpoint does not bind the exact candidate bytes");
  const reconstructedApprovalDigest = sha256Digest(Buffer.from(canonicalJson(checkpoint.approval), "utf8"));
  if (checkpoint.approvalRawDigest !== reconstructedApprovalDigest) fail("Gate checkpoint does not bind the exact canonical owner approval bytes");
  if (canonicalJson(checkpoint.technicalCoverage) !== canonicalJson(expected.technicalCoverage)) fail("Gate checkpoint contains substituted technical coverage");
  validateLineage(expected.candidate, expected);
  validateApproval(checkpoint.approval, expected.candidate, expected.candidateRawDigest, expected.technicalCoverage);
  try { validateBusinessAcceptanceArtifact(checkpoint.record, { candidate: expected.candidate, approval: checkpoint.approval }); }
  catch (error) { fail(error.message); }
  return checkpoint;
}

export async function executeBusinessAcceptanceGate({ checkpointId = "default", candidateRawBytes, evaluation, subject, policy, evidence, technicalCoverage, subjectContext, checkpoints, invokeOwner } = {}) {
  requireStore(checkpoints);
  const exact = exactCanonicalCandidate(candidateRawBytes);
  const lineage = { candidate: exact.candidate, evaluation, subject, policy, evidence, technicalCoverage, subjectContext };
  validateLineage(exact.candidate, lineage);
  if (exact.candidate.outcome !== "eligible-for-acceptance") fail(`candidate outcome ${exact.candidate.outcome} is output-free`, exact.candidate.outcome);
  const key = keyFor(checkpointId);
  let stored;
  try { stored = await checkpoints.get(key); } catch (error) { fail(`checkpoint read failed: ${error.message}`); }
  if (stored != null) {
    const checkpoint = validateCheckpoint(immutable(stored), { checkpointId, candidate: exact.candidate, candidateRawDigest: exact.rawDigest, evaluation, subject, policy, evidence, technicalCoverage, subjectContext });
    return immutable({ approval: checkpoint.approval, record: checkpoint.record, replayed: true, gateCalls: 0, checkpointDigest: checkpoint.checkpointDigest });
  }
  if (typeof invokeOwner !== "function") fail("an owner Gate invocation is required");
  let ownerResult;
  try { ownerResult = await invokeOwner(immutable({ candidate: exact.candidate, candidateRawBytes: Buffer.from(exact.bytes), candidateRawDigest: exact.rawDigest, technicalCoverage })); }
  catch (error) { fail(`owner Gate was unable to proceed: ${error.message}`); }
  const { approval, rawDigest: approvalRawDigest } = exactCanonicalApproval(ownerResult);
  validateApproval(approval, exact.candidate, exact.rawDigest, technicalCoverage);
  const record = assembleRecord(exact.candidate, approval, technicalCoverage);
  const material = { apiVersion: API, kind: "BusinessAcceptanceGateCheckpoint", checkpointId, candidateRawDigest: exact.rawDigest, technicalCoverage: immutable(technicalCoverage), approvalRawDigest, approval: immutable(approval), record: immutable(record) };
  const checkpoint = immutable({ ...material, checkpointDigest: bodyDigest(material, "checkpointDigest") });
  try { await checkpoints.put(key, checkpoint); } catch (error) { fail(`immutable checkpoint write failed: ${error.message}`); }
  return immutable({ approval, record, replayed: false, gateCalls: 1, checkpointDigest: checkpoint.checkpointDigest });
}

export { keyFor as businessAcceptanceGateCheckpointKey };

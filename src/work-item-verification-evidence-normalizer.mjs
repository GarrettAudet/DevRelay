import { canonicalJson, sha256Digest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";
import { validateWorkItemVerificationCheckpoint } from "./work-item-verification-checkpoint.mjs";

export class WorkItemVerificationEvidenceNormalizationError extends Error {
  constructor(message) {
    super(`work item verification evidence normalization failed: ${message}`);
    this.name = "WorkItemVerificationEvidenceNormalizationError";
    this.code = "DR4100";
  }
}

const fail = (message) => { throw new WorkItemVerificationEvidenceNormalizationError(message); };
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const sortCanonical = (values) => [...values].map((value) => structuredClone(value)).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));

function validateContext(subject, obligations, invocation, binding) {
  for (const artifact of [subject, obligations, invocation, binding]) {
    try { validateWorkItemVerificationArtifact(artifact); }
    catch (error) { fail(error.message); }
  }
  const subjectRef = { artifactId:subject.subjectId, digest:subject.subjectDigest };
  if (!same(subjectRef, obligations.subject) || !same(subjectRef, invocation.subject) || !same(subjectRef, binding.subject)) fail("wrong subject context");
  const obligationSetRef = { artifactId:obligations.obligationSetId, digest:obligations.obligationSetDigest };
  if (!same(obligationSetRef, invocation.obligationSet) || !same(obligationSetRef, binding.obligationSet)) fail("stale or substituted obligation set context");
  if (binding.bindingDigest !== invocation.binding.digest) fail("stale verifier binding context");
  const authoritative = new Map(obligations.obligations.map((entry) => [entry.obligationId, entry]));
  if (authoritative.size !== obligations.obligations.length) fail("duplicate authoritative obligation");
  const assignedIds = invocation.assignedObligations.map(({obligationId}) => obligationId);
  if (new Set(assignedIds).size !== assignedIds.length || !same([...assignedIds].sort(), [...invocation.obligationIds].sort())) fail("assigned-obligation slice is incomplete or duplicated");
  for (const assigned of invocation.assignedObligations) if (!same(assigned, authoritative.get(assigned.obligationId))) fail(`assigned obligation ${assigned.obligationId} does not match the authoritative set`);
  const partitions = binding.partitions.filter(({verifier}) => verifier.id === invocation.verifier.id && verifier.version === invocation.verifier.version);
  if (partitions.length !== 1 || !same([...partitions[0].obligationIds].sort(), [...assignedIds].sort())) fail("assigned-obligation slice does not match the verifier partition");
  return subjectRef;
}

function replayedRaw(replay, invocation, binding, obligations) {
  if (!replay?.replayed) fail("exact checkpoint replay is required");
  try { validateWorkItemVerificationCheckpoint(replay.checkpoint, { verificationAttemptId:invocation.verificationAttemptId, invocationFingerprint:invocation.invocationFingerprint }); }
  catch (error) { fail(`checkpoint is stale or unverifiable: ${error.message}`); }
  const checkpoint = replay.checkpoint;
  if (checkpoint.terminalState !== "returned" || replay.checkpointDigest !== checkpoint.checkpointDigest || !same(checkpoint.invocation, invocation) || !same(checkpoint.binding, binding)) fail("checkpoint replay does not bind the exact invocation and binding");
  const bytes = Buffer.from(checkpoint.nativeOutput.bytesBase64, "base64");
  if (!(Buffer.isBuffer(replay.nativeBytes) || replay.nativeBytes instanceof Uint8Array) || !Buffer.from(replay.nativeBytes).equals(bytes) || sha256Digest(bytes) !== checkpoint.nativeOutput.digest) fail("replay native bytes are forged or stale");
  let raw;
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { fail("checkpoint native bytes are not JSON"); }
  if (!same(raw, replay.rawResult)) fail("replay raw result differs from checkpoint bytes");
  try { validateWorkItemVerificationArtifact(raw, { invocation, binding, obligations }); }
  catch (error) { fail(`raw result is invalid: ${error.message}`); }
  return raw;
}

export function normalizeWorkItemVerificationEvidence({ subject, obligationSet, invocation, binding, replay, collectionTime, normalizedEvidenceId }) {
  if (!collectionTime || typeof collectionTime !== "object" || Array.isArray(collectionTime)) fail("a supplied collectionTime disposition is required");
  const subjectRef = validateContext(subject, obligationSet, invocation, binding);
  const raw = replayedRaw(replay, invocation, binding, obligationSet);
  const items = raw.observations.flatMap((observation) => observation.evidenceBindings.map((evidence) => ({
    evidenceId:evidence.evidenceId,
    subjectDigest:subject.subjectDigest,
    observationId:observation.observationId,
    observationDigest:observation.observationDigest,
    obligationId:observation.obligationId,
    kind:evidence.kind,
    status:observation.status,
    artifact:structuredClone(evidence.artifact),
    producer:structuredClone(raw.verifier),
  })));
  items.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const nativeArtifacts = sortCanonical(raw.nativeArtifacts);
  const body = {
    apiVersion:"devrelay.dev/v1alpha1", kind:"NormalizedVerificationEvidence",
    normalizedEvidenceId, verificationAttemptId:invocation.verificationAttemptId, subject:subjectRef,
    invocationFingerprint:invocation.invocationFingerprint, bindingDigest:binding.bindingDigest,
    checkpointDigest:replay.checkpointDigest, rawResultDigest:raw.rawResultDigest,
    collectionTime:structuredClone(collectionTime), nativeArtifacts, items,
  };
  const evidence = { ...body, evidenceDigest:sha256Digest(Buffer.from(canonicalJson(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion","kind"].includes(key)))), "utf8")) };
  try { return validateWorkItemVerificationArtifact(evidence, { rawResult:raw, invocation, binding, obligations:obligationSet, checkpointDigest:replay.checkpointDigest }); }
  catch (error) { fail(`normalized evidence is invalid: ${error.message}`); }
}

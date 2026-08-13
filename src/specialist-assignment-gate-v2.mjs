import { canonicalJson, sha256Digest } from "./content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";
import { assertVerifiedSpecialistAssignmentReceipt } from "./specialist-assignment-runtime-v2.mjs";

export class SpecialistAssignmentGateV2Error extends Error {
  constructor(message) {
    super(`specialist assignment gate v2 failed: ${message}`);
    this.name = "SpecialistAssignmentGateV2Error";
    this.code = "DR4080";
  }
}
const fail = (message) => { throw new SpecialistAssignmentGateV2Error(message); };

function exactCanonical(value, bytes, ref, label) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail(`${label} requires exact raw bytes`);
  const raw = Buffer.from(bytes);
  if (!raw.equals(Buffer.from(canonicalJson(value), "utf8"))) fail(`${label} bytes are not exact canonical JSON`);
  if (sha256Digest(raw) !== ref?.digest) fail(`${label} bytes do not match their ArtifactRef`);
  return raw;
}

export function promoteSpecialistAssignmentBaselineV2({ checkpointReplay, approval, approvalRef, exactApprovalBytes }) {
  let checkpoint;
  try {
    checkpoint = assertVerifiedSpecialistAssignmentReceipt(checkpointReplay);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (checkpoint.receipt.outcome !== "assigned" || checkpoint.receipt.replayed !== false) {
    fail("checkpoint replay must derive one promotable assigned candidate");
  }
  const draftRecord = checkpoint.receipt.draft;
  const draft = draftRecord?.value;
  const draftRef = draftRecord?.ref;
  validateSpecialistAssignmentArtifact(draft);
  if (draft.kind !== "SpecialistAssignmentDraft") fail("checkpoint does not contain a SpecialistAssignmentDraft");
  const draftBytes = Buffer.from(draftRecord.bytesBase64, "base64");
  if (draftBytes.toString("base64") !== draftRecord.bytesBase64) fail("checkpoint draft bytes are not canonical base64");
  exactCanonical(draft, draftBytes, draftRef, "checkpoint draft");
  exactCanonical(approval, exactApprovalBytes, approvalRef, "owner approval");
  if (
    approval?.kind !== "SpecialistAssignmentGateApproval" ||
    approval.decision !== "approve" ||
    approval.candidate?.artifactId !== draftRef.artifactId ||
    approval.candidate?.digest !== draftRef.digest ||
    approval.checkpointDigest !== checkpointReplay.checkpointDigest ||
    approval.executionFingerprint !== checkpointReplay.executionFingerprint
  ) fail("owner approval is not bound to the exact replay-derived candidate and checkpoint");
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "SpecialistAssignmentBaseline",
    baselineId: `SAB-${draft.draftId.slice(4)}`,
    version: "2.0.0",
    approvedDraft: structuredClone(draftRef),
    assignments: structuredClone(draft.assignments),
    assignmentDigest: draft.assignmentDigest,
    approvalEvidence: [structuredClone(approvalRef)],
  };
  return validateSpecialistAssignmentArtifact(baseline);
}

import { canonicalJson, sha256Digest } from "./content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";

export class SpecialistAssignmentGateError extends Error {
  constructor(message) {
    super(`specialist assignment gate failed: ${message}`);
    this.name = "SpecialistAssignmentGateError";
    this.code = "DR4060";
  }
}
const fail = (message) => { throw new SpecialistAssignmentGateError(message); };

export function promoteSpecialistAssignmentBaseline({ draft, draftRef, approval, exactDraftBytes, version = "1.0.0" }) {
  validateSpecialistAssignmentArtifact(draft);
  if (draft.kind !== "SpecialistAssignmentDraft") fail("Gate requires a SpecialistAssignmentDraft");
  const bytes = Buffer.from(exactDraftBytes);
  if (!bytes.equals(Buffer.from(canonicalJson(draft), "utf8"))) fail("supplied bytes are not the exact canonical draft");
  if (sha256Digest(bytes) !== draftRef.digest) fail("draft bytes do not match the approved ArtifactRef");
  if (
    approval?.decision !== "approve" ||
    approval?.candidate?.artifactId !== draftRef.artifactId ||
    approval?.candidate?.digest !== draftRef.digest
  ) fail("approval is not bound to this exact draft");
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "SpecialistAssignmentBaseline",
    baselineId: `SAB-${draft.draftId.slice(4)}`,
    version,
    approvedDraft: structuredClone(draftRef),
    assignments: structuredClone(draft.assignments),
    assignmentDigest: draft.assignmentDigest,
    approvalEvidence: [structuredClone(approval)],
  };
  return validateSpecialistAssignmentArtifact(baseline);
}
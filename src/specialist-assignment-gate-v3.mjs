import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertVerifiedSpecialistAssignmentReceiptV3 } from "./specialist-assignment-runtime-v3.mjs";
import { validateSpecialistAssignmentArtifact, SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS } from "./specialist-assignment-artifact-validator.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const schema = read("specialist-assignment-gate-approval-v3.schema.json");
const validate = compileArtifactSchema(schema, [read("module-result.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`assignment Gate v3: ${message}`); };
function immutable(value) {
  const result = structuredClone(value);
  const freeze = entry => { if (entry && typeof entry === "object") { Object.values(entry).forEach(freeze); Object.freeze(entry); } };
  freeze(result);
  return result;
}

// A prepared approval commit only. Graph activation and durable publication are
// separate host transactions; neither this Gate nor the ranker dispatches work.
export async function prepareSpecialistAssignmentGateV3({ checkpointReplay, approvalRef, loadArtifact }) {
  const checkpoint = assertVerifiedSpecialistAssignmentReceiptV3(checkpointReplay);
  if (checkpoint.receipt.outcome !== "assigned" || checkpoint.receipt.replayed !== false) fail("one promotable assigned checkpoint is required");
  const approval = await loadArtifactContent(approvalRef, { load: loadArtifact });
  if (!validate(approval.value) || approval.ref.schema !== schema.$id ||
      approval.ref.mediaType !== "application/vnd.devrelay.specialist-assignment-gate-approval+json" ||
      approval.ref.artifactId !== approval.value.approvalId) fail("owner approval violates its exact versioned contract");
  const draft = checkpoint.receipt.draft;
  if (!same(approval.value.candidate, draft.ref) || approval.value.checkpointDigest !== checkpointReplay.checkpointDigest ||
      approval.value.executionFingerprint !== checkpointReplay.executionFingerprint) fail("approval does not bind the exact candidate and checkpoint");
  for (const evidence of approval.value.requiredEvidence) await loadArtifactBytes(evidence, { load: loadArtifact });
  const value = { apiVersion: "devrelay.dev/v1alpha1", kind: "SpecialistAssignmentBaseline",
    baselineId: `SAB-${draft.value.draftId.slice(4)}`, version: "3.0.0", approvedDraft: draft.ref,
    assignments: draft.value.assignments, assignmentDigest: draft.value.assignmentDigest,
    approvalEvidence: [approval.ref] };
  validateSpecialistAssignmentArtifact(value);
  const bytes = Buffer.from(canonicalJson(value));
  const ref = { artifactId: value.baselineId, ...SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS.SpecialistAssignmentBaseline,
    digest: sha256Digest(bytes), uri: `artifact://specialist-assignment-gate-v3/${value.baselineId}/${sha256Digest(bytes).slice(7)}` };
  const material = { kind: "SpecialistAssignmentGateCommitV3", checkpointDigest: checkpointReplay.checkpointDigest,
    executionFingerprint: checkpointReplay.executionFingerprint, baseline: { ref, value, bytesBase64: bytes.toString("base64") },
    approval: { ref: approval.ref, bytesBase64: approval.bytes.toString("base64") }, lifecycleComplete: false };
  return immutable({ ...material, commitDigest: canonicalJsonDigest(material) });
}

export async function verifySpecialistAssignmentGateV3({ record, ...request }) {
  const expected = await prepareSpecialistAssignmentGateV3(request);
  if (!same(expected, record)) fail("persisted approval commit differs from exact derivation");
  return expected;
}

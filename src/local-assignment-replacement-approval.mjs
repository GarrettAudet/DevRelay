import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const schema = read("local-assignment-replacement-approval.schema.json");
export const ASSIGNMENT_REPLACEMENT_SCHEMA = schema.$id;
export const ASSIGNMENT_REPLACEMENT_MEDIA_TYPE = "application/vnd.devrelay.local-assignment-replacement-approval+json";
export const validateAssignmentReplacementApproval = compileArtifactSchema(schema, [read("module-result.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`assignment replacement: ${message}`); };

// Only call after the owning Gate has verified this exact approval and replay.
export async function loadAssignmentReplacementApproval({ approval, replayReceipt, namespace, projectId, loadArtifact }) {
  const records = approval.requiredEvidence.filter(ref =>
    ref.schema.startsWith("https://devrelay.dev/host/local-assignment-replacement-approval/") ||
    ref.mediaType === ASSIGNMENT_REPLACEMENT_MEDIA_TYPE);
  if (records.length > 1) fail("duplicate replacement evidence");
  if (!records.length) return null;
  const loaded = await loadArtifactContent(records[0], { load: loadArtifact });
  const value = loaded.value;
  if (loaded.ref.schema !== schema.$id || loaded.ref.mediaType !== ASSIGNMENT_REPLACEMENT_MEDIA_TYPE ||
      !validateAssignmentReplacementApproval(value) || loaded.ref.artifactId !== value.approvalId) fail("unsupported or malformed replacement approval");
  const checkpoint = replayReceipt.checkpoint;
  if (value.namespace !== namespace || value.projectId !== projectId ||
      !same(value.targetDraft, checkpoint.receipt.draft.ref) || value.checkpointDigest !== replayReceipt.checkpointDigest ||
      value.executionFingerprint !== replayReceipt.executionFingerprint ||
      !same(value.workBreakdownBaseline, checkpoint.inputs["work-breakdown-baseline"].ref) ||
      !same(value.workDependencyBaseline, checkpoint.inputs["work-dependency-baseline"].ref)) fail("replacement scope or target checkpoint differs");
  for (const ref of value.evidence) await loadArtifactBytes(ref, { load: loadArtifact });
  return loaded;
}

export function assertAssignmentPredecessorPublication({ storage, headId, replacement }) {
  if (!replacement) return;
  const { priorBaseline, priorActivationDigest } = replacement.value;
  const rows = storage.readTransitionJournal(headId, { transitionId: priorActivationDigest });
  const expected = { id: priorActivationDigest, kind: "AssignmentBaselineActivated", commitDigest: priorActivationDigest, baseline: priorBaseline };
  if (rows.length !== 1 || !same(rows[0].transition, expected) || rows[0].artifactRefs.length !== 1) fail("prior publication journal differs");
  const stored = rows[0].artifactRefs[0];
  if (stored.artifactId !== priorBaseline.artifactId || stored.digest !== priorBaseline.digest || stored.mediaType !== priorBaseline.mediaType ||
      sha256Digest(storage.getArtifact(stored)) !== priorBaseline.digest) fail("prior stored baseline differs");
}

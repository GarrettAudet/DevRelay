import test from "node:test";
import assert from "node:assert/strict";
import { validateAssignmentReplacementApproval } from "../src/local-assignment-replacement-approval.mjs";

test("assignment replacement contract is closed and requires exact scoped evidence", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const ref = { artifactId: "fixture", schema: "https://devrelay.dev/fixture/v1", mediaType: "application/json", digest, uri: "artifact://fixture" };
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalAssignmentReplacementApproval", approvalId: "R-1", namespace: "test", projectId: "test",
    priorBaseline: ref, priorActivationDigest: digest, targetDraft: ref, checkpointDigest: digest, executionFingerprint: digest,
    workBreakdownBaseline: ref, workDependencyBaseline: ref, authority: "project-owner", decision: "approve-replacement", scope: "assignment-baseline-publication", evidence: [ref] };
  assert.equal(validateAssignmentReplacementApproval(body), true);
  for (const key of Object.keys(body)) { const invalid = { ...body }; delete invalid[key]; assert.equal(validateAssignmentReplacementApproval(invalid), false, key); }
  for (const patch of [{ extra: true }, { evidence: [] }, { evidence: [ref, ref] }, { decision: "approve" }, { authority: "agent" }, { targetGate: ref }, { targetBaseline: ref }]) {
    assert.equal(validateAssignmentReplacementApproval({ ...body, ...patch }), false);
  }
});

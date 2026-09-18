import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sha256Digest, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createQualityPolicyCandidate, createQualityPolicyContext, promoteQualityPolicyBaseline, resolveQualityObligations } from "../src/quality-policy.mjs";
import { prepareLocalWorkQualityHandoff, verifyLocalWorkQualityHandoff } from "../src/local-work-quality-handoff.mjs";
import { resolveWorkflowProfile } from "../src/workflow-profiles.mjs";
import { prepareLocalWorkQuality } from "../src/local-work-quality.mjs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";

test("Desktop quality submission pins work and queue without caller-authored obligations or approval", () => {
  const read = file => JSON.parse(readFileSync(new URL(`../contracts/${file}`, import.meta.url)));
  const validate = compileArtifactSchema(read("desktop-work-quality-submission.schema.json"),
    [read("desktop-local-host-configuration.schema.json"), read("module-result.schema.json")]);
  const { request } = fixture();
  const file = { path: "quality.json", ref: request.qualityPolicyRef };
  const value = { kind: "DesktopWorkQualitySubmission", readinessDigest: request.workBaselineRef.digest,
    workItemId: request.workItemId, qualityPolicy: file, qualityContext: file, artifacts: [] };
  assert.equal(validate(value), true);
  for (const changed of [{ ...value, obligations: [] }, { ...value, approved: true },
    { ...value, readinessDigest: "latest" }, { ...value, workItemId: "*" }, { ...value, qualityContext: undefined }]) {
    assert.equal(validate(changed), false);
  }
});

function fixture() {
  const workBytes = readFileSync(new URL("../examples/artifacts/work-breakdown-baseline-auth-001.json", import.meta.url));
  const work = JSON.parse(workBytes);
  const candidate = createQualityPolicyCandidate({ policyId: "QP-HOST-TYPES", version: "1.0.0",
    rules: [{ id: "CODE-REVIEW", appliesTo: { workTypes: ["code-change"] },
      obligations: [{ id: "independent-code-review", lane: "review", evidenceKinds: ["review/independent"], independent: true }] }] });
  // Synthetic approval tests contract composition, not human policy acceptance.
  const policy = promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval",
    authority: "fixture-owner", decision: "approve", candidateDigest: candidate.candidateDigest } });
  const policyBytes = Buffer.from(JSON.stringify(policy, null, 2));
  const ref = (id, bytes, name) => ({ artifactId: id, digest: sha256Digest(bytes), uri: `memory://${id}`,
    schema: `https://devrelay.dev/artifacts/${name}/v1`, mediaType: `application/vnd.devrelay.${name}+json` });
  const workBaselineRef = ref(work.baselineId, workBytes, "work-breakdown-baseline");
  const qualityPolicyRef = { ...ref(policy.policyId, policyBytes, "quality-policy-baseline"),
    schema: "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json", mediaType: "application/json" };
  const bytes = new Map([[workBaselineRef.digest, workBytes], [qualityPolicyRef.digest, policyBytes]]);
  const request = { workBaselineRef, qualityPolicyRef, workItemId: "WI-AUTH-CORE",
    workflowProfile: resolveWorkflowProfile({ profileName: "quick" }), loadArtifact: async ref => bytes.get(ref.digest) };
  return { request, work, policy, workBytes };
}

test("host maps owning work-type into quality rules without changing approved bytes", async () => {
  const f = fixture();
  const rawItem = f.work.workItems.find(item => item.id === f.request.workItemId);
  assert.equal(rawItem["work-type"], "code-change");
  assert.equal(rawItem.type, undefined);
  assert.deepEqual(resolveQualityObligations({ baseline: f.policy, workflowProfile: f.request.workflowProfile, workItem: rawItem }).appliedRuleIds, []);
  const prepared = await prepareLocalWorkQuality(f.request);
  assert.deepEqual(prepared.resolution.appliedRuleIds, ["CODE-REVIEW"]);
  assert.ok(prepared.resolution.obligations.some(item => item.id === "independent-code-review" && item.independent));
  assert.deepEqual(prepared.resolution.acceptanceCriterionIds, [...rawItem["acceptance-criterion-refs"]].sort());
  assert.deepEqual(prepared.workItem, rawItem);
  assert.equal(prepared.workItem.type, undefined);
  assert.equal(sha256Digest(f.workBytes), prepared.workBaselineRef.digest);
  assert.equal(prepared.resolution.authority.approvesWork, false);
});

test("quality preparation rejects caller type/criteria overrides, missing work and byte drift", async () => {
  const { request } = fixture();
  for (const override of [{ workItem: { type: "documentation-change" } }, { acceptanceCriteria: [] }]) {
    await assert.rejects(prepareLocalWorkQuality({ ...request, ...override }), /undeclared input/);
  }
  await assert.rejects(prepareLocalWorkQuality({ ...request, workItemId: "WI-MISSING" }), /absent from approved work/);
  await assert.rejects(prepareLocalWorkQuality({ ...request, qualityPolicyRef: { ...request.qualityPolicyRef, mediaType: "text/plain" } }), /owning Module port/);
  await assert.rejects(prepareLocalWorkQuality({ ...request, loadArtifact: async ref => Buffer.concat([await request.loadArtifact(ref), Buffer.from(" ")]) }), error => error.code === "DR2103");
});

test("quality preparation rejects resealed rules or approval that differ from the approved candidate", async () => {
  const f = fixture();
  for (const mutate of [
    policy => { policy.rules[0].obligations[0].independent = false; },
    policy => { policy.approval.candidateDigest = `sha256:${"b".repeat(64)}`; },
  ]) {
    const policy = structuredClone(f.policy);
    mutate(policy);
    const { apiVersion, kind, baselineDigest, ...body } = policy;
    policy.baselineDigest = canonicalJsonDigest(body);
    const bytes = Buffer.from(JSON.stringify(policy));
    const qualityPolicyRef = { ...f.request.qualityPolicyRef, digest: sha256Digest(bytes) };
    await assert.rejects(prepareLocalWorkQuality({ ...f.request, qualityPolicyRef,
      loadArtifact: ref => ref.digest === qualityPolicyRef.digest ? bytes : f.request.loadArtifact(ref) }),
    error => error.code === "DR7104");
  }
});

test("quality handoff binds ready work, full approved criteria and exact replay", async () => {
  const f = fixture();
  const item = f.work.workItems.find(item => item.id === f.request.workItemId);
  const context = createQualityPolicyContext({ acceptanceCriteria: item["acceptance-criterion-refs"] });
  const bytes = Buffer.from(JSON.stringify(context));
  const ref = { ...f.request.qualityPolicyRef, artifactId: "QUALITY-CONTEXT", digest: sha256Digest(bytes), uri: "memory://quality-context" };
  const readinessBody = { baselines: { workBreakdownBaseline: f.request.workBaselineRef }, readyWorkItemIds: [item.id] };
  const readiness = { ...readinessBody, readinessDigest: canonicalJsonDigest(readinessBody) };
  const submission = { kind: "DesktopWorkQualitySubmission", readinessDigest: readiness.readinessDigest, workItemId: item.id,
    qualityPolicy: { path: "policy.json", ref: f.request.qualityPolicyRef }, qualityContext: { path: "context.json", ref }, artifacts: [] };
  const loadArtifact = reference => reference.digest === ref.digest ? bytes : f.request.loadArtifact(reference);
  const request = { submission, readiness, workflowProfile: f.request.workflowProfile, loadArtifact };
  const record = await prepareLocalWorkQualityHandoff(request);
  assert.deepEqual(record.prepared.resolution.appliedRuleIds, ["CODE-REVIEW"]);
  assert.deepEqual(await verifyLocalWorkQualityHandoff({ record, readiness, loadArtifact }), record);
  await assert.rejects(prepareLocalWorkQualityHandoff({ ...request, submission: { ...submission, readinessDigest: f.request.workBaselineRef.digest } }), /exact current ready/);
  const blocked = { ...readinessBody, readyWorkItemIds: [] };
  const blockedReadiness = { ...blocked, readinessDigest: canonicalJsonDigest(blocked) };
  await assert.rejects(prepareLocalWorkQualityHandoff({ ...request, readiness: blockedReadiness,
    submission: { ...submission, readinessDigest: blockedReadiness.readinessDigest } }), /exact current ready/);
  const tampered = structuredClone(record); tampered.prepared.resolution.obligations = [];
  await assert.rejects(verifyLocalWorkQualityHandoff({ record: tampered, readiness, loadArtifact }), /exact derivation/);
  const incompleteBytes = Buffer.from(JSON.stringify(createQualityPolicyContext({ acceptanceCriteria: [] })));
  const incompleteRef = { ...ref, digest: sha256Digest(incompleteBytes) };
  await assert.rejects(prepareLocalWorkQualityHandoff({ ...request,
    submission: { ...submission, qualityContext: { path: "incomplete.json", ref: incompleteRef } },
    loadArtifact: reference => reference.digest === incompleteRef.digest ? incompleteBytes : loadArtifact(reference) }), /exactly cover approved work criteria/);
});

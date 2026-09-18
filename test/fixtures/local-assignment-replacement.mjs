import assert from "node:assert/strict";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { prepareLocalSpecialistAssignmentInputs } from "../../src/local-specialist-assignment-planning.mjs";
import { executeLocalSpecialistAssignment, verifyLocalSpecialistAssignmentExecution } from "../../src/local-specialist-assignment-execution.mjs";
import { prepareSpecialistAssignmentGateV3 } from "../../src/specialist-assignment-gate-v3.mjs";
import { activateLocalAssignmentBaseline, verifyLocalAssignmentBaselineActivation, localAssignmentBaselineHeadId } from "../../src/local-assignment-baseline-activation.mjs";
import { ASSIGNMENT_REPLACEMENT_SCHEMA, ASSIGNMENT_REPLACEMENT_MEDIA_TYPE } from "../../src/local-assignment-replacement-approval.mjs";

export async function exerciseAssignmentReplacement({ initial, initialActivation, jsonArtifact, evidenceRef }) {
  const { storage, namespace, graph } = initial;
  const policy = jsonArtifact("AP-REPLACEMENT", { schema: "https://devrelay.dev/artifacts/assignment-policy/v1", mediaType: "application/vnd.devrelay.assignment-policy+json" },
    { kind: "AssignmentPolicy", policyId: "AP-REPLACEMENT", workItemRules: [], profilePriorities: [] });
  const load = ref => ref.digest === policy.ref.digest ? policy.bytes : initial.loadArtifact(ref);
  const next = { ...initial, assignmentPolicy: policy.ref, loadArtifact: load };
  next.assignmentPlan = (await prepareLocalSpecialistAssignmentInputs(next)).plan;
  next.assignmentExecution = await executeLocalSpecialistAssignment(next);
  const receipt = await verifyLocalSpecialistAssignmentExecution(next);
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalAssignmentReplacementApproval", approvalId: "REPLACE-ONE",
    namespace, projectId: graph.captureBase().projectId, priorBaseline: initialActivation.baseline,
    priorActivationDigest: initialActivation.gateCommitDigest, targetDraft: receipt.checkpoint.receipt.draft.ref,
    checkpointDigest: receipt.checkpointDigest, executionFingerprint: receipt.executionFingerprint,
    workBreakdownBaseline: receipt.checkpoint.inputs["work-breakdown-baseline"].ref,
    workDependencyBaseline: receipt.checkpoint.inputs["work-dependency-baseline"].ref,
    authority: "project-owner", decision: "approve-replacement", scope: "assignment-baseline-publication", evidence: [evidenceRef] };
  async function request(value = body, options = {}) {
    const replacement = jsonArtifact(value.approvalId, { schema: options.schema ?? ASSIGNMENT_REPLACEMENT_SCHEMA, mediaType: ASSIGNMENT_REPLACEMENT_MEDIA_TYPE }, value);
    const duplicate = jsonArtifact("REPLACE-DUPLICATE", replacement.ref, { ...value, approvalId: "REPLACE-DUPLICATE" });
    const approval = jsonArtifact("SA-REPLACEMENT-APPROVAL", initial.assignmentGate.approval.ref,
      { ...JSON.parse(Buffer.from(initial.assignmentGate.approval.bytesBase64, "base64")), approvalId: "SA-REPLACEMENT-APPROVAL",
        candidate: body.targetDraft, checkpointDigest: body.checkpointDigest, executionFingerprint: body.executionFingerprint,
        requiredEvidence: options.missing ? [evidenceRef] : options.duplicate ? [replacement.ref, duplicate.ref] : [replacement.ref] });
    const loadArtifact = ref => ref.digest === replacement.ref.digest ? replacement.bytes : ref.digest === duplicate.ref.digest ? duplicate.bytes : ref.digest === approval.ref.digest ? approval.bytes : load(ref);
    const assignmentGate = await prepareSpecialistAssignmentGateV3({ checkpointReplay: receipt, approvalRef: approval.ref, loadArtifact });
    return { ...next, assignmentGate, loadArtifact };
  }
  const before = graph.captureBase();
  const badDigest = `sha256:${"f".repeat(64)}`;
  const negatives = [
    [body, { missing: true }], [body, { duplicate: true }], [body, { schema: ASSIGNMENT_REPLACEMENT_SCHEMA.replace("/v1", "/v99") }],
    [{ ...body, namespace: "other" }], [{ ...body, projectId: "other" }],
    [{ ...body, checkpointDigest: badDigest }], [{ ...body, executionFingerprint: badDigest }],
    [{ ...body, extra: true }], [{ ...body, evidence: [] }],
    [{ ...body, priorActivationDigest: badDigest }],
    ...["priorBaseline", "targetDraft", "workBreakdownBaseline", "workDependencyBaseline"].map(key => [{ ...body, [key]: { ...body[key], digest: badDigest } }]),
  ];
  for (const [value, options] of negatives) {
    await assert.rejects(async () => activateLocalAssignmentBaseline(await request(value, options)));
    assert.deepEqual(graph.captureBase(), before, "invalid replacement cannot alter graph");
  }
  const valid = await request();
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, priorBaseline: body.priorBaseline }), /overrides/);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, loadArtifact: ref => ref.schema === ASSIGNMENT_REPLACEMENT_SCHEMA ? Buffer.from("{}") : valid.loadArtifact(ref) }), { code: "DR2103" });
  const id = localAssignmentBaselineHeadId(namespace);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, storage: { ...storage,
    getArtifact(ref) { return ref.digest === body.priorBaseline.digest ? Buffer.from("tampered") : storage.getArtifact(ref); }
  } }), /prior stored baseline/);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, storage: { ...storage,
    readTransitionJournal(runId, options) { return runId === id && options?.transitionId === body.priorActivationDigest ? [] : storage.readTransitionJournal(runId, options); }
  } }), /prior publication journal/);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, storage: { ...storage,
    readRun(runId) { const row = storage.readRun(runId); return runId === id ? { ...row, state: { ...row.state, pendingCommit: badDigest } } : row; }
  } }), /pending Gate conflicts/);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, assignmentExecution: { ...valid.assignmentExecution, executionFingerprint: badDigest } }), /execution identity/);
  const checkpointId = `local-checkpoint:${canonicalJsonDigest({ namespace: `${namespace}/specialist-assignment-v3`, key: receipt.checkpointKey }).slice(7)}`;
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, storage: { ...storage,
    readRun(runId) { if (runId === checkpointId) throw Object.assign(new Error("missing"), { code: "DR4920" }); return storage.readRun(runId); }
  } }), /exact durable checkpoint/);
  assert.deepEqual(graph.captureBase(), before);
  let reservationCrash = true;
  const interruptedStorage = { ...storage, commitTransition(value) {
    const result = storage.commitTransition(value);
    if (value.transition.kind === "AssignmentBaselineReserved" && reservationCrash) { reservationCrash = false; throw new Error("crash after reservation"); }
    return result;
  } };
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, storage: interruptedStorage }), /crash after reservation/);
  assert.equal(storage.readRun(id).state.pendingCommit, valid.assignmentGate.commitDigest);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, graph: { ...graph, async mergePrepared(prepared) {
    await graph.mergePrepared(prepared); throw new Error("crash after merge");
  } } }), /crash after merge/);
  await assert.rejects(activateLocalAssignmentBaseline({ ...valid, storage: { ...storage, commitTransition(value) {
    const result = storage.commitTransition(value);
    if (value.transition.kind === "AssignmentBaselineActivated") throw new Error("crash after publication");
    return result;
  } } }), /crash after publication/);
  const activated = await activateLocalAssignmentBaseline(valid);
  assert.deepEqual(await verifyLocalAssignmentBaselineActivation(valid), activated);
  assert.deepEqual(await activateLocalAssignmentBaseline(valid), activated);
  assert.deepEqual(await verifyLocalAssignmentBaselineActivation(initial), initialActivation);
  assert.deepEqual(await activateLocalAssignmentBaseline(initial), initialActivation);
  const readOnlyStorage = { ...storage, putArtifact() { assert.fail("replay wrote artifact"); },
    initializeRun() { assert.fail("replay initialized state"); }, commitTransition() { assert.fail("replay committed state"); },
    acquireLease() { assert.fail("historical verification acquired lease"); } };
  assert.equal((await executeLocalSpecialistAssignment({ ...next, storage: readOnlyStorage })).replayed, true);
  assert.deepEqual(await verifyLocalAssignmentBaselineActivation({ ...initial, storage: readOnlyStorage }), initialActivation);
  assert.deepEqual(await verifyLocalAssignmentBaselineActivation({ ...valid, storage: readOnlyStorage }), activated);
  const current = storage.readRun(id);
  assert.deepEqual(current.state.baseline, activated.baseline);
  assert.equal(current.state.pendingCommit, null);
  await assert.rejects(activateLocalAssignmentBaseline(await request({ ...body, approvalId: "STALE-REPLACEMENT" })), /prior baseline/);
  assert.deepEqual(storage.readRun(id), current);
}

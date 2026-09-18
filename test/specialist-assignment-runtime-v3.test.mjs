import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createSpecialistAssignmentRuntimeV3, SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, assertVerifiedSpecialistAssignmentReceiptV3 } from "../src/specialist-assignment-runtime-v3.mjs";
import { prepareSpecialistAssignmentGateV3, verifySpecialistAssignmentGateV3 } from "../src/specialist-assignment-gate-v3.mjs";

function fixture({ eligible = true, pretty = true, repositoryPurpose, workRepositoryRoles = ["repository-context"] } = {}) {
  const artifacts = new Map();
  const inputs = {};
  const add = (role, id, value, schemaKind = role) => {
    const bytes = Buffer.from(pretty ? JSON.stringify(value, null, 2) + "\r\n" : canonicalJson(value));
    const ref = { artifactId: id, schema: `https://devrelay.dev/artifacts/${schemaKind}/v1`, mediaType: `application/vnd.devrelay.${schemaKind}+json`,
      digest: sha256Digest(bytes), uri: `fixture://assignment-v3/${id}` };
    inputs[role] = ref;
    artifacts.set(ref.digest, bytes);
    return ref;
  };
  const example = name => JSON.parse(readFileSync(new URL(`../examples/artifacts/${name}.json`, import.meta.url)));
  const catalog = example("capability-catalog-work-breakdown-001");
  const overview = example("project-overview-baseline-001");
  add("capability-catalog", catalog.catalogId, catalog);
  add("project-overview-baseline", overview.baselineId, overview);
  if (repositoryPurpose) {
    add("repository-context", "ANA-REPOSITORY", { apiVersion: "devrelay.dev/v1alpha1", kind: "ApprovedNotApplicable",
      approvalId: "ANA-REPOSITORY", purpose: repositoryPurpose, rationale: "Synthetic initial-project fixture",
      authority: { id: "fixture-owner", role: "human-approver" }, approvalEvidence: [inputs["project-overview-baseline"]] }, "approved-not-applicable");
  } else {
    add("repository-context", "native-repository", example("repository-snapshot-001"), "repository-snapshot");
  }
  // Use the complete owning baseline contract, not an assignment-shaped stub.
  // Upstream approval references remain synthetic fixture evidence.
  const workValue = JSON.parse(readFileSync(new URL("../examples/artifacts/work-breakdown-baseline-auth-001.json", import.meta.url)));
  workValue.baselineId = "WBB-FIXTURE";
  workValue.inputBindings = workValue.inputBindings.map(entry => inputs[entry.role]
    ? { ...entry, artifact: inputs[entry.role] } : entry);
  const repositoryBinding = workValue.inputBindings.find(entry => entry.role === "repository-context");
  workValue.inputBindings = workValue.inputBindings.filter(entry => entry.role !== "repository-context");
  workValue.inputBindings.push(...workRepositoryRoles.map(role => ({ ...repositoryBinding, role })));
  workValue.workItems.forEach(item => { item["required-capabilities"] = ["CAP-CODE"]; });
  const work = add("work-breakdown-baseline", "WBB-FIXTURE", workValue);
  const nodes = workValue.workItems.map(item => item.id).sort();
  const evidence = workValue.approvedCandidate;
  add("work-dependency-baseline", "WDB-FIXTURE", { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkDependencyBaseline",
    baselineId: "WDB-FIXTURE", version: "1.0.0", approvedCandidate: evidence, workBreakdownBaseline: work, nodes, edges: [],
    graphDigest: canonicalJsonDigest({ nodes, edges: [] }), topologicalOrder: nodes,
    policyEvidence: evidence, consistencyEvidence: evidence, approvalEvidence: [evidence], sourceRefs: [] });
  add("specialist-catalog", "SC", { kind: "SpecialistCatalog", catalogId: "SC", profiles: [{ id: "P-CODE", capabilityIds: eligible ? ["CAP-CODE"] : [], toolIds: [], grantIds: [] }] });
  add("assignment-policy", "AP", { kind: "AssignmentPolicy", policyId: "AP", workItemRules: [], profilePriorities: [] });
  const saved = new Map();
  const store = { get: key => saved.get(key), put: (key, value) => saved.set(key, structuredClone(value)) };
  return { inputs, artifacts, saved, store, loadArtifact: ref => artifacts.get(ref.digest), executionId: "RAW-ASSIGNMENT" };
}

test("v3 accepts the exact existing-project repository binding without rewriting approved work bytes", async () => {
  const fx = fixture({ workRepositoryRoles: ["current-repository-snapshot"] });
  const originalWorkBytes = Buffer.from(fx.loadArtifact(fx.inputs["work-breakdown-baseline"]));
  let fresh = 0;
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store,
    binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } });
  const execution = await runtime.execute(fx);
  assert.equal(execution.outcome, "assigned");
  const replay = await runtime.verifyCheckpointedExecution(execution);
  assert.deepEqual(Buffer.from(replay.checkpoint.inputs["work-breakdown-baseline"].bytesBase64, "base64"), originalWorkBytes);
  assert.equal(JSON.parse(originalWorkBytes).inputBindings.filter(entry => entry.role === "repository-context").length, 0);
  assert.deepEqual(execution.draft.value.inputBindings.find(entry => entry.role === "repository-context").artifact, fx.inputs["repository-context"]);
  assert.equal((await runtime.execute(fx)).replayed, true);
  assert.equal(fresh, 1);
});

test("v3 rejects ambiguous or missing upstream repository roles before any fresh execution", async () => {
  for (const workRepositoryRoles of [[], ["repository-context", "current-repository-snapshot"]]) {
    const fx = fixture({ workRepositoryRoles });
    let fresh = 0;
    const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store,
      binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } });
    await assert.rejects(runtime.execute(fx), /repository/);
    assert.equal(fresh, 0); assert.equal(fx.saved.size, 0);
  }
});

test("v3 rejects a not-applicable repository on the existing-project change route", async () => {
  const fx = fixture({ repositoryPurpose: "repository-context", workRepositoryRoles: ["current-repository-snapshot"] });
  let fresh = 0;
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store,
    binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } });
  await assert.rejects(runtime.execute(fx), /repository/);
  assert.equal(fresh, 0); assert.equal(fx.saved.size, 0);
});

test("v3 rejects substitution of the existing-project snapshot before fresh execution", async () => {
  const fx = fixture({ workRepositoryRoles: ["current-repository-snapshot"] });
  const value = JSON.parse(fx.loadArtifact(fx.inputs["repository-context"]));
  value.treeDigest = `sha256:${"a".repeat(64)}`;
  const bytes = Buffer.from(JSON.stringify(value));
  const substituted = { ...fx.inputs["repository-context"], digest: sha256Digest(bytes) };
  let fresh = 0;
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store,
    binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } });
  await assert.rejects(runtime.execute({ ...fx, inputs: { ...fx.inputs, "repository-context": substituted },
    loadArtifact: ref => ref.digest === substituted.digest ? bytes : fx.loadArtifact(ref) }), /repository/);
  assert.equal(fresh, 0); assert.equal(fx.saved.size, 0);
});

test("v3 preserves raw approved bytes and repository ID, reopens and replays without fresh execution", async () => {
  const fx = fixture();
  let fresh = 0;
  const options = { checkpointStore: fx.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } };
  const first = await createSpecialistAssignmentRuntimeV3(options).execute(fx);
  assert.equal(first.outcome, "assigned");
  assert.equal(first.lifecycleComplete, false);
  assert.equal(first.draft.value.assignments[0].specialistProfileRef, "P-CODE");
  assert.deepEqual(first.draft.value.inputBindings.find(entry => entry.role === "repository-context").artifact, fx.inputs["repository-context"]);
  for (const [role, entry] of Object.entries([...fx.saved.values()][0].inputs)) {
    assert.deepEqual(Buffer.from(entry.bytesBase64, "base64"), fx.artifacts.get(fx.inputs[role].digest));
  }
  const reopened = createSpecialistAssignmentRuntimeV3(options);
  const replay = await reopened.execute(fx);
  assert.equal(replay.replayed, true);
  assert.equal(fresh, 1);
  const receipt = await reopened.verifyCheckpointedExecution(first);
  assert.equal(assertVerifiedSpecialistAssignmentReceiptV3(receipt).receipt.outcome, "assigned");
  assert.throws(() => assertVerifiedSpecialistAssignmentReceiptV3(structuredClone(receipt)), /genuine checkpoint/);
  const canonical = fixture({ pretty: false });
  const other = await createSpecialistAssignmentRuntimeV3({ ...options, checkpointStore: canonical.store }).execute(canonical);
  assert.notEqual(other.executionFingerprint, first.executionFingerprint, "different raw identities must not share an execution");
});

test("v3 rejects missing bindings, wrong raw bytes and substituted work lineage before persistence", async () => {
  const fx = fixture();
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const missing = { ...fx.inputs }; delete missing["assignment-policy"];
  await assert.rejects(runtime.execute({ ...fx, inputs: missing }), /seven declared/);
  await assert.rejects(runtime.execute({ ...fx, loadArtifact: () => Buffer.from("{}") }), { code: "DR2103" });
  const dependency = JSON.parse(fx.loadArtifact(fx.inputs["work-dependency-baseline"]));
  dependency.workBreakdownBaseline = { ...dependency.workBreakdownBaseline, artifactId: "SUBSTITUTED" };
  const bytes = Buffer.from(JSON.stringify(dependency));
  const ref = { ...fx.inputs["work-dependency-baseline"], digest: sha256Digest(bytes) };
  await assert.rejects(runtime.execute({ ...fx, inputs: { ...fx.inputs, "work-dependency-baseline": ref },
    loadArtifact: input => input.digest === ref.digest ? bytes : fx.loadArtifact(input) }), /work lineage/);
  assert.equal(fx.saved.size, 0);
});

test("v3 verifies the entire checkpoint against raw input closure, not just a receipt fingerprint", async () => {
  const fx = fixture();
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const result = await runtime.execute(fx);
  const [key, original] = [...fx.saved.entries()][0];
  for (const corrupt of [
    checkpoint => { checkpoint.receipt.lifecycleComplete = true; },
    checkpoint => { checkpoint.inputs["assignment-policy"].value.profilePriorities = [{ profileId: "P-CODE", priority: 42 }]; },
    checkpoint => { checkpoint.artifacts[0].ref.artifactId = "SUBSTITUTED"; },
    checkpoint => { checkpoint.receipt.draft.value.assignments[0].specialistProfileRef = "UNAPPROVED"; },
  ]) {
    const checkpoint = structuredClone(original); corrupt(checkpoint); fx.saved.set(key, checkpoint);
    await assert.rejects(runtime.verifyCheckpointedExecution(result), /checkpoint differs/);
    await assert.rejects(runtime.execute(fx), /checkpoint differs/);
  }
});

test("v3 rejects ambiguous assignment policy rules before fresh execution or persistence", async () => {
  for (const patch of [
    { workItemRules: [{ workItemId: "WI-ONE", deniedProfileIds: ["P-CODE"] }, { workItemId: "WI-ONE" }] },
    { profilePriorities: [{ profileId: "P-CODE", priority: 1 }, { profileId: "P-CODE", priority: 99 }] },
    { workItemRules: [{ workItemId: "" }] },
    { profilePriorities: {} },
    { workItemRules: null },
  ]) {
    const fx = fixture();
    const policy = { ...JSON.parse(fx.loadArtifact(fx.inputs["assignment-policy"])), ...patch };
    const bytes = Buffer.from(JSON.stringify(policy));
    const ref = { ...fx.inputs["assignment-policy"], digest: sha256Digest(bytes) };
    let fresh = 0;
    const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store,
      binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } });
    await assert.rejects(runtime.execute({ ...fx, inputs: { ...fx.inputs, "assignment-policy": ref },
      loadArtifact: input => input.digest === ref.digest ? bytes : fx.loadArtifact(input) }), /assignment-policy .* unique nonempty/);
    assert.equal(fresh, 0);
    assert.equal(fx.saved.size, 0);
  }
});

test("v3 rejects digest-valid but invalid owning input contracts", async () => {
  for (const [role, mutate, code] of [
    ["work-breakdown-baseline", value => { delete value.workItems[0]["verification-plan"]; }, "DR2600"],
    ["work-breakdown-baseline", value => { value.workItems[0]["work-type"] = "conversation"; }, "DR2600"],
    ["work-dependency-baseline", value => { value.topologicalOrder = []; }, "DR3040"],
    ["capability-catalog", value => { delete value.capabilities[0].providerNeutral; }, "DR2600"],
    ["project-overview-baseline", value => { delete value.overview; }, "DR1800"],
    ["repository-context", value => { delete value.treeDigest; }, "DR1800"],
    ["repository-context", value => { value.includedPaths = [42]; }, "DR1800"],
  ]) {
    const fx = fixture();
    const value = JSON.parse(fx.loadArtifact(fx.inputs[role]));
    mutate(value);
    const bytes = Buffer.from(JSON.stringify(value));
    const ref = { ...fx.inputs[role], digest: sha256Digest(bytes) };
    let fresh = 0;
    const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store,
      binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, beforeFreshExecution() { fresh++; } });
    await assert.rejects(runtime.execute({ ...fx, inputs: { ...fx.inputs, [role]: ref },
      loadArtifact: input => input.digest === ref.digest ? bytes : fx.loadArtifact(input) }),
    { code });
    assert.equal(fresh, 0);
    assert.equal(fx.saved.size, 0);
  }
});

test("v3 persists explicit clarification and requires a configured native binding", async () => {
  const fx = fixture({ eligible: false });
  assert.throws(() => createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store }), /explicit native binding/);
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const result = await runtime.execute(fx);
  assert.equal(result.outcome, "needs-clarification");
  assert.equal(result.draft, undefined);
  assert.equal((await runtime.execute(fx)).replayed, true);
});

test("v3 permits only a repository-purpose not-applicable approval", async () => {
  const valid = fixture({ repositoryPurpose: "repository-context" });
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: valid.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const result = await runtime.execute(valid);
  assert.equal(result.outcome, "assigned");
  assert.equal((await runtime.execute(valid)).replayed, true);
  const wrong = fixture({ repositoryPurpose: "contract-disposition" });
  await assert.rejects(createSpecialistAssignmentRuntimeV3({ checkpointStore: wrong.store,
    binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING }).execute(wrong), /wrong purpose/);
  assert.equal(wrong.saved.size, 0);
});

test("v3 Gate binds explicit raw owner approval and evidence to a genuine assigned checkpoint", async () => {
  const fx = fixture();
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const execution = await runtime.execute(fx);
  const checkpointReplay = await runtime.verifyCheckpointedExecution(execution);
  const evidenceBytes = Buffer.from("Synthetic owner approval evidence, not real acceptance.");
  const evidence = { artifactId: "OWNER-EVIDENCE", schema: "https://example.test/approval/v1", mediaType: "text/plain",
    digest: sha256Digest(evidenceBytes), uri: "fixture://approval/evidence" };
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "SpecialistAssignmentGateApproval", approvalId: "APPROVAL-V3",
    authority: "project-owner", decision: "approve", policyVersion: "specialist-assignment-gate/3.0.0",
    candidate: execution.draft.ref, checkpointDigest: checkpointReplay.checkpointDigest,
    executionFingerprint: checkpointReplay.executionFingerprint, requiredEvidence: [evidence] };
  const requestFor = (value = body) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\r\n");
    const approvalRef = { artifactId: "APPROVAL-V3", schema: "https://devrelay.dev/evidence/specialist-assignment-gate-approval/v3",
      mediaType: "application/vnd.devrelay.specialist-assignment-gate-approval+json", digest: sha256Digest(bytes), uri: "fixture://approval/v3" };
    return { checkpointReplay, approvalRef, loadArtifact: ref => ref.digest === approvalRef.digest ? bytes : evidenceBytes };
  };
  const request = requestFor();
  const record = await prepareSpecialistAssignmentGateV3(request);
  assert.equal(record.baseline.value.version, "3.0.0");
  assert.equal(record.lifecycleComplete, false);
  assert.deepEqual(record.baseline.value.approvedDraft, execution.draft.ref);
  assert.deepEqual(Buffer.from(record.approval.bytesBase64, "base64"), request.loadArtifact(request.approvalRef));
  assert.equal(Object.isFrozen(record.baseline.value.assignments), true);
  assert.deepEqual(await verifySpecialistAssignmentGateV3({ ...request, record }), record);
  await assert.rejects(verifySpecialistAssignmentGateV3({ ...request, record: { ...record, lifecycleComplete: true } }), /differs from exact derivation/);
  let reads = 0;
  await assert.rejects(prepareSpecialistAssignmentGateV3({ ...request, checkpointReplay: structuredClone(checkpointReplay),
    loadArtifact() { reads++; throw new Error("unexpected IO"); } }), /genuine checkpoint/);
  assert.equal(reads, 0);
  for (const change of [{ authority: "adapter" }, { decision: "reject" }, { extra: true }, { requiredEvidence: [] }]) {
    await assert.rejects(prepareSpecialistAssignmentGateV3(requestFor({ ...body, ...change })), /versioned contract/);
  }
  await assert.rejects(prepareSpecialistAssignmentGateV3(requestFor({ ...body, candidate: { ...body.candidate, uri: "fixture://substituted" } })), /exact candidate/);
  await assert.rejects(prepareSpecialistAssignmentGateV3({ ...request,
    loadArtifact: ref => ref.digest === evidence.digest ? Buffer.from("tampered") : request.loadArtifact(ref) }), { code: "DR2103" });
});

test("v3 Gate rejects clarification before loading any approval", async () => {
  const fx = fixture({ eligible: false });
  const runtime = createSpecialistAssignmentRuntimeV3({ checkpointStore: fx.store, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const execution = await runtime.execute(fx);
  const checkpointReplay = await runtime.verifyCheckpointedExecution(execution);
  let reads = 0;
  await assert.rejects(prepareSpecialistAssignmentGateV3({ checkpointReplay, loadArtifact() { reads++; } }), /promotable assigned/);
  assert.equal(reads, 0);
});

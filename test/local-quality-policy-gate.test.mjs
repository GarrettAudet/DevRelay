import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { qualityContinuityApprovedTraceabilityContributor } from "../src/quality-continuity-traceability-contributor.mjs";
import { activateLocalQualityPolicy, verifyLocalQualityPolicyActivation, assertLocalQualityPolicyCurrent } from "../src/local-quality-policy-activation.mjs";
import { sha256Digest } from "../src/content-digest.mjs";
import { createQualityPolicyCandidate } from "../src/quality-policy.mjs";
import { prepareLocalQualityPolicyGate, verifyLocalQualityPolicyGate } from "../src/local-quality-policy-gate.mjs";

const schema = "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json";
function fixture() {
  const artifacts = new Map();
  const save = (value, artifactId, owner = schema) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2).replaceAll("\n", "\r\n"));
    const ref = { artifactId, schema: owner, mediaType: "application/json", digest: sha256Digest(bytes), uri: `memory://${artifactId}` };
    artifacts.set(ref.digest, bytes); return ref;
  };
  const candidate = createQualityPolicyCandidate({ policyId: "QP-TEST", version: "1.0.0", rules: [
    { id: "REVIEW", obligations: [{ id: "review", lane: "review", evidenceKinds: ["review/independent"], independent: true }] }] });
  const approval = { kind: "QualityPolicyGateApproval", authority: "fixture-owner", decision: "approve", candidateDigest: candidate.candidateDigest };
  const request = { candidateRef: save(candidate, candidate.policyId), approvalRef: save(approval, "APPROVAL", `${schema}#/oneOf/4/properties/approval`),
    loadArtifact: ref => artifacts.get(ref.digest) };
  return { request, save, candidate, approval };
}

test("local quality Gate preserves raw evidence and verifies exact preparation without activation", async () => {
  const f = fixture(); const record = await prepareLocalQualityPolicyGate(f.request);
  assert.equal(record.activatesPolicy, false);
  assert.deepEqual(Buffer.from(record.candidate.bytesBase64, "base64"), f.request.loadArtifact(f.request.candidateRef));
  assert.deepEqual(await verifyLocalQualityPolicyGate({ record, loadArtifact: f.request.loadArtifact }), record);
  const changed = structuredClone(record); changed.activatesPolicy = true;
  await assert.rejects(verifyLocalQualityPolicyGate({ record: changed, loadArtifact: f.request.loadArtifact }), /exact evidence|contract/);
});

test("local quality Gate rejects missing prior policy, substituted approval, byte drift and extra authority", async () => {
  const f = fixture();
  const candidate = createQualityPolicyCandidate({ ...f.candidate, previousBaselineDigest: `sha256:${"a".repeat(64)}` });
  await assert.rejects(prepareLocalQualityPolicyGate({ ...f.request, candidateRef: f.save(candidate, candidate.policyId) }), /prior policy/);
  await assert.rejects(prepareLocalQualityPolicyGate({ ...f.request, approvalRef: f.save({ ...f.approval, candidateDigest: `sha256:${"b".repeat(64)}` }, "BAD", `${schema}#/oneOf/4/properties/approval`) }), /exact approval/);
  await assert.rejects(prepareLocalQualityPolicyGate({ ...f.request, approved: true }), /undeclared/);
  await assert.rejects(prepareLocalQualityPolicyGate({ ...f.request, loadArtifact: ref => Buffer.concat([f.request.loadArtifact(ref), Buffer.from(" ")]) }), { code: "DR2103" });
});

test("replacement quality policy binds the exact prior policy and changes version", async () => {
  const f = fixture();
  const initial = await prepareLocalQualityPolicyGate(f.request);
  const previous = JSON.parse(Buffer.from(initial.baseline.bytesBase64, "base64"));
  const previousBaselineRef = f.save(previous, previous.policyId);
  const prepareReplacement = async version => {
    const candidate = createQualityPolicyCandidate({ ...f.candidate, version, previousBaselineDigest: previous.baselineDigest });
    const approval = { ...f.approval, candidateDigest: candidate.candidateDigest };
    return prepareLocalQualityPolicyGate({ ...f.request, previousBaselineRef,
      candidateRef: f.save(candidate, candidate.policyId),
      approvalRef: f.save(approval, "APPROVAL-REPLACEMENT", `${schema}#/oneOf/4/properties/approval`) });
  };
  const record = await prepareReplacement("1.0.1");
  assert.deepEqual(record.previousBaseline.ref, previousBaselineRef);
  assert.deepEqual(await verifyLocalQualityPolicyGate({ record, loadArtifact: f.request.loadArtifact }), record);
  await assert.rejects(prepareReplacement("1.0.0"), /new version/);
});

test("quality activation recovers after graph merge and storage reopen without a second merge", async t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-quality-activation-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const f = fixture(); const record = await prepareLocalQualityPolicyGate(f.request);
  const service = createTraceabilityGraphService({ graphId: "quality-test", projectId: "quality-test",
    store: createInMemoryTraceabilityStore(), contributors: [qualityContinuityApprovedTraceabilityContributor] });
  let merges = 0;
  const graph = { ...service, async mergePrepared(prepared) {
    merges++; await service.mergePrepared(prepared);
    throw new Error("fixture interruption after merge");
  } };
  const request = { storage, namespace: "quality-test", graph, record, loadArtifact: f.request.loadArtifact };
  await assert.rejects(activateLocalQualityPolicy(request), /fixture interruption/);
  assert.throws(() => assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace, baseline: record.baseline.ref }), /pending recovery/);
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  const recovered = await activateLocalQualityPolicy({ ...request, storage });
  assert.equal(merges, 1);
  assert.equal(recovered.dispatchAuthorized, false);
  const head = assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace, baseline: record.baseline.ref });
  assert.equal(head.version, 2);
  const approvalBytes = Buffer.from(record.approval.bytesBase64, "base64");
  const storedApproval = { artifactId: record.approval.ref.artifactId, digest: record.approval.ref.digest,
    mediaType: record.approval.ref.mediaType, byteCount: approvalBytes.length };
  assert.deepEqual(storage.getArtifact(storedApproval), approvalBytes);
  assert.deepEqual(await verifyLocalQualityPolicyActivation({ ...request, storage }), recovered);
  const alteredStorage = { ...storage, getArtifact(ref) {
    const bytes = storage.getArtifact(ref);
    return ref.digest === storedApproval.digest ? Buffer.concat([bytes, Buffer.from(" ")]) : bytes;
  } };
  await assert.rejects(verifyLocalQualityPolicyActivation({ ...request, storage: alteredStorage }), /publication evidence differs/);
  assert.deepEqual(await activateLocalQualityPolicy({ ...request, storage }), recovered);
  assert.equal(assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace, baseline: record.baseline.ref }).version, 2);
  assert.throws(() => assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace,
    baseline: { ...record.baseline.ref, digest: `sha256:${"b".repeat(64)}` } }), /stale/);
});

test("quality replacement advances the current head while historical replay cannot restore an old policy", async t => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-quality-replace-"));
  const storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const f = fixture(); const first = await prepareLocalQualityPolicyGate(f.request);
  const service = createTraceabilityGraphService({ graphId: "quality-replace", projectId: "quality-replace",
    store: createInMemoryTraceabilityStore(), contributors: [qualityContinuityApprovedTraceabilityContributor] });
  let merges = 0;
  const graph = { ...service, async mergePrepared(prepared) { merges++; return service.mergePrepared(prepared); } };
  const request = { storage, namespace: "quality-replace", graph, record: first, loadArtifact: f.request.loadArtifact };
  await activateLocalQualityPolicy(request);
  const previousBytes = Buffer.from(first.baseline.bytesBase64, "base64");
  const previous = JSON.parse(previousBytes);
  const loadArtifact = ref => ref.digest === first.baseline.ref.digest ? previousBytes : f.request.loadArtifact(ref);
  async function replacement(version) {
    const candidate = createQualityPolicyCandidate({ ...f.candidate, version, previousBaselineDigest: previous.baselineDigest });
    return prepareLocalQualityPolicyGate({ candidateRef: f.save(candidate, candidate.policyId),
      approvalRef: f.save({ ...f.approval, candidateDigest: candidate.candidateDigest }, `APP-${version}`, `${schema}#/oneOf/4/properties/approval`),
      previousBaselineRef: first.baseline.ref, loadArtifact });
  }
  const second = await replacement("1.0.1");
  await activateLocalQualityPolicy({ ...request, record: second, loadArtifact });
  assert.equal(merges, 2);
  assert.equal(assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace, baseline: second.baseline.ref }).version, 4);
  await activateLocalQualityPolicy(request);
  assert.equal(merges, 2);
  assert.throws(() => assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace, baseline: first.baseline.ref }), /stale/);
  await assert.rejects(activateLocalQualityPolicy({ ...request, record: await replacement("1.0.2"), loadArtifact }), /prior policy/);
  assert.equal(merges, 2);
  assert.equal(assertLocalQualityPolicyCurrent({ storage, namespace: request.namespace, baseline: second.baseline.ref }).version, 4);
});

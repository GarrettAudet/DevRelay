// Validate a reviewed future baseline with the owning Gate. This preparation
// never activates a shared head or claims that downstream planning migrated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cycleDirectory, createCycleArtifactStore, readJson } from '../artifact-store.mjs';
import { canonicalJson, canonicalJsonDigest, sha256Digest } from '../../../src/content-digest.mjs';
import { createContractGenerationRuntime } from '../../../src/contract-generation-runtime.mjs';
import { createLocalHostStorage } from '../../../src/local-host-storage.mjs';
import { createLocalHostCheckpointStore } from '../../../src/local-host-checkpoints.mjs';
import { prepareLocalContractGate, verifyLocalContractGate } from '../../../src/local-contract-gate.mjs';
import { assertLocalContractCurrentState, localContractHeadId } from '../../../src/local-contract-activation.mjs';

const stage = 'composition/generation-95b6a64e9c6e5351';
const store = createCycleArtifactStore(stage);
const evidence = readJson(path.join(cycleDirectory, stage, 'runtime-evidence.json'));
const review = readJson(path.join(cycleDirectory, stage, 'parent-review.json'));
assert.equal(review.decision, 'approve-for-owning-gate-preparation');
assert.equal(review.authorization, 'standing-owner-in-scope-approval');
assert.equal(review.candidateDigest, evidence.candidate.digest);
assert.equal(review.checkpointDigest, evidence.checkpointDigest);
assert.equal(review.proposalDigest, evidence.proposalDigest);
assert.equal(review.breakingChangeApproved, true);
assert.equal(review.activate, false);
for (const entry of review.evidenceFiles) {
  assert.equal(sha256Digest(readFileSync(path.join(cycleDirectory, entry.path))), entry.digest);
}
const storage = createLocalHostStorage({ rootDirectory: path.join(cycleDirectory, 'requirements/durable'), readOnly: true });
try {
  const namespace = 'MES-001-architecture';
  assertLocalContractCurrentState({ storage, namespace, state: evidence.approvedState });
  const headBefore = storage.readRun(localContractHeadId(namespace));
  const runtime = createContractGenerationRuntime({ generators: { 'json-schema': {
    id: 'devrelay.mes-native-composition-proposal-generator', version: '0.1.0',
    generate() { throw new Error('Gate preparation must not execute a generator'); },
  } } });
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace: 'MES-001-contract-generation' });
  const replay = await runtime.verifyCheckpointedExecution({ executionId: evidence.executionId,
    executionFingerprint: evidence.executionFingerprint, checkpoints });
  assert.equal(replay.checkpointDigest, evidence.checkpointDigest);
  assert.equal(replay.checkpoint.artifacts.candidate.ref.digest, evidence.candidate.digest);
  const candidate = replay.checkpoint.artifacts.candidate.value;
  const bindings = new Map(candidate.inputBindings.map(binding => [binding.role, binding.artifact]));
  const reviewRef = store.add('MES-NATIVE-COMPOSITION-CONTRACT-REVIEW', 'contract-review-evidence', review);
  const approval = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'ContractGateApproval',
    approvalId: 'CGA-MES-NATIVE-COMPOSITION-95B6A64E9C6E5351', authority: 'project-owner', decision: 'approve',
    policyVersion: 'contract-gate/0.1.0', candidate: evidence.candidate,
    breakingChangeApproved: true, requiredEvidence: [reviewRef] };
  const approvalBytes = Buffer.from(canonicalJson(approval));
  const approvalRef = store.persistArtifact({ artifactId: approval.approvalId,
    schema: 'https://devrelay.dev/evidence/contract-gate-approval/v1', mediaType: 'application/vnd.devrelay.contract-gate-approval+json',
    digest: sha256Digest(approvalBytes), bytes: approvalBytes });
  const baseline = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'ContractBaseline', baselineId: 'CB-DEVRELAY-MES-001',
    version: '2.5.0', approvedCandidate: evidence.candidate,
    architectureBaseline: bindings.get('architecture-baseline'), projectOverviewBaseline: bindings.get('project-overview-baseline'),
    supersedes: bindings.get('current-contract-baseline'), contracts: candidate.contracts,
    contractsDigest: canonicalJsonDigest(candidate.contracts), approvalEvidence: [approvalRef], sourceRefs: candidate.sourceRefs };
  const baselineRef = store.add(baseline.baselineId, 'contract-baseline', baseline);
  const request = { replayReceipt: replay, approvalRef, baselineRef, loadArtifact: store.load };
  const record = await prepareLocalContractGate(request);
  await verifyLocalContractGate({ ...request, record });
  store.save('prepared-gate-commit.json', record);
  for (const entry of [record.disposition, record.baseline]) {
    store.persistArtifact({ ...entry.ref, bytes: Buffer.from(entry.bytesBase64, 'base64') });
  }
  assert.equal(canonicalJsonDigest(storage.readRun(localContractHeadId(namespace))), canonicalJsonDigest(headBefore));
  const result = { status: 'owning-gate-validated-preparation', commitDigest: record.commitDigest,
    baseline: baselineRef, disposition: record.disposition.ref, checkpointDigest: replay.checkpointDigest,
    currentApprovedState: evidence.approvedState, activeContractBaselineVersion: '2.4.0',
    preparedContractBaselineVersion: '2.5.0', activated: false, downstreamMigrationComplete: false,
    newGeneratorCalls: 0, lifecycleComplete: false };
  store.save('prepared-gate.json', result);
  console.log(JSON.stringify(result));
} finally { storage.close(); }

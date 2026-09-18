import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cycleDirectory, createCycleArtifactStore, readJson } from '../artifact-store.mjs';
import { canonicalJsonDigest, sha256Digest } from '../../../src/content-digest.mjs';
import { createLocalHostStorage } from '../../../src/local-host-storage.mjs';
import { createDurableWorkContinuityStore } from '../../../src/work-continuity.mjs';
import { localArchitectureHeadId } from '../../../src/local-discovery-activation.mjs';
import { localContractHeadId } from '../../../src/local-contract-activation.mjs';
import { localWorkBaselineHeadId } from '../../../src/local-work-baseline-activation.mjs';
import { localDependencyBaselineHeadId } from '../../../src/local-dependency-baseline-activation.mjs';
import { localAssignmentBaselineHeadId } from '../../../src/local-assignment-baseline-activation.mjs';
import { localQualityPolicyHeadId } from '../../../src/local-quality-policy-activation.mjs';
import { localCompletionLedgerId } from '../../../src/local-completion-ledger.mjs';
import { settleBridgeAttempt } from './settle-bridge-attempt.mjs';

const phase = process.argv[2] ?? 'inspect';
assert.ok(['inspect', 'apply', 'replay'].includes(phase), 'expected inspect, apply or replay');
const helperDigest = sha256Digest(readFileSync(new URL('./settle-bridge-attempt.mjs', import.meta.url)));
assert.equal(helperDigest, 'sha256:e7ae306291723d72b6b67fe856df8055f33e2925e8e932185261ac0fe80c00da');
if (phase !== 'inspect') {
  const review = readJson(path.join(cycleDirectory, 'continuity/independent-review.json'));
  assert.equal(review.verdict, 'accepted-for-bounded-construction-settlement');
  assert.equal(review.helperDigest, helperDigest);
}
const store = createCycleArtifactStore(`continuity/observations/${phase}`);
const actualStorage = createLocalHostStorage({ rootDirectory: path.join(cycleDirectory, 'requirements/durable'), readOnly: phase !== 'apply' });
const continuityRunId = 'work-continuity/devrelay';
const restrictRun = method => request => {
  assert.equal(request.runId, continuityRunId, `${method} cannot modify another host run`);
  return actualStorage[method](request);
};
const storage = { ...actualStorage, initializeRun() { throw new Error('settlement requires an existing continuity run'); },
  commitTransition: restrictRun('commitTransition'), acquireLease: restrictRun('acquireLease'), releaseLease: restrictRun('releaseLease') };
try {
  const continuity = createDurableWorkContinuityStore({ storage, projectId: 'devrelay', owner: 'mes-construction-settlement' });
  const namespace = 'MES-001-architecture';
  const readiness = readJson(path.join(cycleDirectory, 'execution/byte-handoff-1/readiness.json'));
  const protectedIds = [localArchitectureHeadId, localContractHeadId, localWorkBaselineHeadId,
    localDependencyBaselineHeadId, localAssignmentBaselineHeadId, localQualityPolicyHeadId].map(id => id(namespace));
  protectedIds.push(localCompletionLedgerId(namespace, readiness.baselines.workBreakdownBaseline));
  const protectedState = () => Object.fromEntries(protectedIds.map(id => [id, storage.readRun(id)]));
  const before = protectedState();
  const protectedDigest = canonicalJsonDigest(before);
  const results = [];
  for (const [stage, checkpointNamespace] of [['recovery-1', 'MES-001-recovery-effects'], ['byte-handoff-1', 'MES-001-handoff-effects']]) {
    const result = await settleBridgeAttempt({ storage, store: continuity,
      stageDirectory: path.join(cycleDirectory, 'execution', stage), checkpointNamespace, loadArtifact: store.load,
      apply: phase !== 'inspect' });
    assert.equal(result.receipt.executorCalls, 0);
    assert.equal(result.completionAuthority, false);
    if (phase === 'replay') assert.equal(result.appliedTransitions, 0);
    assert.equal(canonicalJsonDigest(protectedState()), protectedDigest);
    store.save(`${stage}.json`, { helperDigest, protectedStateDigest: protectedDigest, result });
    results.push({ attemptId: result.receipt.attemptId, status: result.status, appliedTransitions: result.appliedTransitions,
      receiptDigest: result.receiptDigest, executorCalls: result.receipt.executorCalls, completionAuthority: false });
  }
  const observation = { phase, helperDigest, protectedStateDigest: protectedDigest,
    approvedHeadsAndCompletionLedgerUnchanged: true, results, continuityVersion: continuity.read().version,
    formalVerificationApproved: false, integrated: false, lifecycleComplete: false };
  store.save('summary.json', observation);
  console.log(JSON.stringify(observation));
} finally { actualStorage.close(); }

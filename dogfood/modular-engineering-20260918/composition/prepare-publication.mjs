import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cycleDirectory, root, readJson, createCycleArtifactStore } from '../artifact-store.mjs';
import { canonicalJsonDigest, sha256Digest } from '../../../src/content-digest.mjs';

const generation = 'composition/generation-95b6a64e9c6e5351';
const amendment = 'composition/contract-amendment-1';
const store = createCycleArtifactStore('publication/native-composition');
const runtime = readJson(path.join(cycleDirectory, generation, 'runtime-evidence.json'));
const gate = readJson(path.join(cycleDirectory, generation, 'prepared-gate.json'));
const proposalReview = readJson(path.join(cycleDirectory, amendment, 'independent-review.json'));
const replayReview = readJson(path.join(cycleDirectory, generation, 'independent-review.json'));
const proposal = readJson(path.join(cycleDirectory, amendment, 'proposal.json'));
assert.equal(proposalReview.verdict, 'accepted-for-candidate-generation-and-gate-review');
assert.equal(replayReview.verdict, 'accepted-for-owning-gate-consideration');
assert.equal(proposalReview.proposalDigest, runtime.proposalDigest);
assert.equal(replayReview.candidateDigest, runtime.candidate.digest);
assert.equal(replayReview.checkpointDigest, runtime.checkpointDigest);
assert.equal(gate.checkpointDigest, runtime.checkpointDigest);
assert.equal(gate.activated, false);
assert.equal(runtime.preservedNativeContracts, 102);
assert.equal(runtime.modifiedNativeContracts, 1);
assert.equal(runtime.diffStatus, 'breaking');
assert.equal(sha256Digest(readFileSync(path.join(root, 'project/contract-baseline.json'))), runtime.priorBaseline.digest);
const relative = [
  `${amendment}/proposal.json`, `${amendment}/fixtures.json`, `${amendment}/validate.mjs`,
  `${amendment}/assessment.md`, `${amendment}/independent-review.json`, `${amendment}/migration-plan.md`,
  'composition/preflight/approved-contract.json', 'composition/generate-native-contract-candidate.mjs',
  'composition/prepare-native-contract-gate.mjs', 'composition/prepare-publication.mjs',
  `${generation}/candidate.json`, `${generation}/canonical-diff.json`, `${generation}/independent-review.json`,
  `${generation}/parent-review.json`, `${generation}/prepared-gate-commit.json`, `${generation}/prepared-gate.json`,
  'parallel/change-handoff-design/assessment.md',
];
const files = relative.map(file => ({ path: `dogfood/modular-engineering-20260918/${file}`,
  digest: sha256Digest(readFileSync(path.join(cycleDirectory, file))) })).sort((a, b) => a.path.localeCompare(b.path));
const trace = runtime.traceApplicationProof;
const capsule = { kind: 'MESNativeCompositionContractPublication', sourceBaseRevision: '848b0ca3914e8645a1219090eec315f5c3784a22',
  scope: 'Reviewed native composition schema and owning-Gate-validated preparation; not activated or executable product acceptance',
  schema: { id: proposal.schemaIdentity, digest: proposal.schemaDigest, priorDigest: proposal.priorSchemaDigest },
  proposalDigest: runtime.proposalDigest, candidate: runtime.candidate, checkpointDigest: runtime.checkpointDigest,
  replayGeneratorCalls: runtime.replayGeneratorCalls, nativeContracts: { unchanged: 102, modified: 1, formatValidationsPassed: 103 },
  canonicalDiffStatus: 'breaking', preparedGate: gate, activeBaseline: runtime.priorBaseline,
  independentReview: { agentId: proposalReview.agentId, schemaPlanDigest: proposalReview.planDigest, replayPlanDigest: replayReview.planDigest,
    schemaAssertions: proposalReview.reportedChecks.schemaAssertions, additionalLegacyVariants: proposalReview.reportedChecks.additionalLegacyVariants,
    additionalRejectedMalformedNativeForms: proposalReview.reportedChecks.additionalRejectedMalformedNativeForms },
  trace: { update: trace.updateRef, receipt: trace.receiptRef,
    blockingDiagnostics: trace.receipt.diagnostics.filter(item => item.blocking).length,
    nonblockingDiagnostics: trace.receipt.diagnostics.filter(item => !item.blocking).length, coverageComplete: false },
  files, fileManifestDigest: canonicalJsonDigest(files),
  limitations: ['Active ContractBaseline stays 2.4.0; prepared 2.5.0 requires reconciliation and downstream replanning before activation',
    'Native executor resolution and real modular workflow execution are not yet implemented by this schema',
    'Construction validation pins the original workspace; compact publication is not a portable full durable replay bundle',
    'Full regression, formal work verification/integration and BusinessAcceptance remain outstanding'] };
assert.equal(capsule.trace.blockingDiagnostics, 0);
store.save('candidate.json', capsule);
store.save('paths.nul', Buffer.from([...files.map(file => file.path), 'CURRENT_STATUS.md',
  'dogfood/modular-engineering-20260918/publication/native-composition/candidate.json'].sort().join('\0') + '\0'));
console.log(JSON.stringify({ status: 'publication-prepared', files: files.length + 2, manifestDigest: capsule.fileManifestDigest,
  nativeContracts: capsule.nativeContracts, activeBaselineVersion: gate.activeContractBaselineVersion, activated: false }));

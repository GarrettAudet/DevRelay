// Construction-only candidate generation. ContractGate activation is deliberately
// absent: current work still pins the prior approved contract disposition.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCycleArtifactStore, cycleDirectory, readJson } from '../artifact-store.mjs';
import { canonicalJson, canonicalJsonDigest, sha256Digest } from '../../../src/content-digest.mjs';
import { createContractGenerationRuntime, deriveContractGenerationRoute } from '../../../src/contract-generation-runtime.mjs';
import { createLocalHostStorage } from '../../../src/local-host-storage.mjs';
import { createLocalHostCheckpointStore } from '../../../src/local-host-checkpoints.mjs';
import { createTraceabilityGraphService } from '../../../src/traceability-graph.mjs';
import { TRACEABILITY_VOCABULARY, TRACEABILITY_VOCABULARY_V1_9 } from '../../../src/traceability-artifact-validator.mjs';
import { createLocalHostTraceabilityStore } from '../../../src/local-host-traceability.mjs';
import { contractTraceabilityContributors } from '../../../src/contract-traceability-contributor.mjs';
import { publishLocalContractCandidateTrace, verifyLocalContractCandidateTrace } from '../../../src/local-contract-traceability.mjs';
import { verifyLocalContractGate } from '../../../src/local-contract-gate.mjs';
import { assertLocalContractCurrentState, localContractHeadId, verifyLocalContractActivation } from '../../../src/local-contract-activation.mjs';

await import('./contract-amendment-1/validate.mjs');
const proposalBytes = readFileSync(path.join(cycleDirectory, 'composition/contract-amendment-1/proposal.json'));
const proposal = JSON.parse(proposalBytes);
const proposalDigest = sha256Digest(proposalBytes);
const attempt = proposalDigest.slice(7, 23);
const stage = `composition/generation-${attempt}`;
const store = createCycleArtifactStore(stage);
const approvedStage = 'contracts/attempt-c3ac77b127ed8969';
const approved = readJson(path.join(cycleDirectory, approvedStage, 'approved.json'));
const approvedExecution = readJson(path.join(cycleDirectory, approvedStage, 'runtime-evidence.json'));
const gateRecord = readJson(path.join(cycleDirectory, approvedStage, 'gate-commit.json'));
const load = ref => { const bytes = store.load(ref); return { ref, bytes, value: JSON.parse(bytes) }; };
const sameIdentity = (a, b) => ['artifactId', 'schema', 'mediaType', 'digest'].every(key => a[key] === b[key]);
assert.ok(sameIdentity(proposal.priorContractBaseline, approved.baseline));
const currentBaseline = load(approved.baseline);
const state = load(approved.state);
const architecture = load(state.value.architectureBaseline);
const projectOverview = load(state.value.projectOverviewBaseline);
assert.equal(currentBaseline.value.version, proposal.priorContractBaselineVersion);
assert.equal(architecture.ref.digest, proposal.architectureDigest);
assert.ok(sameIdentity(proposal.architectureBaseline, architecture.ref));
assert.ok(sameIdentity(state.value.contractBaseline, currentBaseline.ref));
assert.equal(canonicalJsonDigest(proposal.schema), proposal.schemaDigest);
assert.equal(proposal.schema.$id, proposal.schemaIdentity);
const prior = new Map(currentBaseline.value.contracts.map(entry => [entry.interfaceIntentId, { entry, bytes: store.load(entry.artifact) }]));
assert.equal(prior.size, 103);
assert.equal(prior.get(proposal.interfaceIntentId).entry.artifact.digest, proposal.priorSchemaDigest);
const route = deriveContractGenerationRoute({ state: state.value, architectureBaseline: architecture.value });
assert.equal(route.operation, 'generate-contract-change');
assert.deepEqual([...prior.keys()].sort(), route.requiredInterfaceIntentIds);

const storage = createLocalHostStorage({ rootDirectory: path.join(cycleDirectory, 'requirements/durable') });
const lifecycleNamespace = 'MES-001-architecture';
const checkpointNamespace = 'MES-001-contract-generation';
const checkpoints = createLocalHostCheckpointStore({ storage, namespace: checkpointNamespace });
const graphStore = createLocalHostTraceabilityStore({ storage, namespace: 'MES-001-graph', graphId: 'devrelay/mes-001' });
const graphFor = vocabulary => createTraceabilityGraphService({ projectId: 'devrelay', graphId: 'devrelay/mes-001',
  vocabulary, contributors: contractTraceabilityContributors, store: graphStore });
const graph = graphFor(TRACEABILITY_VOCABULARY_V1_9);
let generatorCalls = 0;
const producer = { id: 'devrelay.mes-native-composition-proposal-generator', version: '0.1.0' };
const runtime = createContractGenerationRuntime({ generators: { 'json-schema': { ...producer, async generate(request) {
  generatorCalls += 1;
  assert.deepEqual(request.interfaceIntents.map(entry => entry.id).sort(), route.requiredInterfaceIntentIds);
  store.save('generator-request.json', request);
  const entries = request.interfaceIntents.map(intent => {
    const previous = prior.get(intent.id);
    const bytes = intent.id === proposal.interfaceIntentId ? Buffer.from(canonicalJson(proposal.schema)) : previous.bytes;
    return { id: previous.entry.id, interfaceIntentId: intent.id, contractKind: previous.entry.contractKind,
      schema: previous.entry.artifact.schema, mediaType: previous.entry.artifact.mediaType, bytesBase64: bytes.toString('base64') };
  });
  const material = { requestId: request.requestId, producer, entries };
  const bundle = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'GeneratedContractBundle',
    bundleId: `GCB-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`, ...material, diagnostics: [] };
  store.save('generator-result.json', bundle);
  return bundle;
} } } });

try {
  // Reconstruct the runtime-branded receipt; persisted JSON is not approval.
  const priorReplay = await runtime.verifyCheckpointedExecution({ executionId: approvedExecution.executionId,
    executionFingerprint: approvedExecution.executionFingerprint, checkpoints });
  assert.equal(priorReplay.checkpointDigest, approvedExecution.checkpointDigest);
  assert.equal(generatorCalls, 0);
  await verifyLocalContractGate({ replayReceipt: priorReplay, record: gateRecord, loadArtifact: store.load });
  // Historical activation must reproject with its original vocabulary pin;
  // today's vocabulary is used only for the new candidate graph update.
  const historicalCheckpoint = createLocalHostCheckpointStore({ storage, namespace: lifecycleNamespace })
    .get(`contract-activation:${gateRecord.commitDigest}`);
  assert.equal(canonicalJsonDigest(historicalCheckpoint.update.vocabulary), canonicalJsonDigest(TRACEABILITY_VOCABULARY));
  const activation = await verifyLocalContractActivation({ storage, namespace: lifecycleNamespace, graph: graphFor(TRACEABILITY_VOCABULARY),
    replayReceipt: priorReplay, record: gateRecord, loadArtifact: store.load });
  assert.equal(canonicalJsonDigest(activation), canonicalJsonDigest(approved.activation));
  assertLocalContractCurrentState({ storage, namespace: lifecycleNamespace, state: state.ref });
  const headBefore = storage.readRun(localContractHeadId(lifecycleNamespace));
  store.save('proposal-source.json', proposalBytes);
  store.save('route.json', route);
  const executionId = `MES-native-composition-contract-${attempt}`;
  const result = await runtime.execute({ executionId, state, architecture, projectOverview, currentBaseline, checkpoints });
  assert.equal(result.outcome, 'generated', JSON.stringify(result.diagnostics));
  const callsAfterExecution = generatorCalls;
  const replay = await runtime.verifyCheckpointedExecution({ executionId, executionFingerprint: result.executionFingerprint, checkpoints });
  assert.equal(generatorCalls, callsAfterExecution);
  for (const entry of [...Object.values(replay.checkpoint.artifacts), ...Object.values(replay.checkpoint.nativeArtifacts)]) {
    if (entry?.ref) store.persistArtifact({ ...entry.ref, bytes: Buffer.from(entry.bytesBase64, 'base64') });
  }
  const diff = replay.checkpoint.artifacts.canonicalDiff.value;
  assert.equal(diff.changes.filter(entry => entry.changeType === 'unchanged').length, 102);
  const changed = diff.changes.filter(entry => entry.changeType !== 'unchanged');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].interfaceIntentId, proposal.interfaceIntentId);
  assert.equal(changed[0].changeType, 'modify');
  assert.equal(changed[0].expectedPriorDigest, proposal.priorSchemaDigest);
  assert.equal(changed[0].targetDigest, proposal.schemaDigest);
  // The released diff conservatively marks every modified contract breaking.
  // Preserve that actual classification; semantic review cannot rewrite it.
  assert.equal(diff.status, 'breaking');
  for (const entry of result.candidate.contracts) {
    const bytes = store.load(entry.artifact);
    const expected = entry.interfaceIntentId === proposal.interfaceIntentId
      ? Buffer.from(canonicalJson(proposal.schema)) : prior.get(entry.interfaceIntentId).bytes;
    assert.ok(bytes.equals(expected), `${entry.id} native bytes changed unexpectedly`);
  }
  store.save('execution-checkpoint.json', replay.checkpoint);
  store.save('candidate.json', result.candidate);
  store.save('canonical-diff.json', diff);
  const traceRequest = { storage, namespace: checkpointNamespace, graph, replayReceipt: replay, loadArtifact: store.load };
  const trace = await publishLocalContractCandidateTrace(traceRequest);
  await verifyLocalContractCandidateTrace({ ...traceRequest, record: trace });
  store.save('candidate-trace.json', trace);
  const headAfter = storage.readRun(localContractHeadId(lifecycleNamespace));
  assert.equal(canonicalJsonDigest(headAfter), canonicalJsonDigest(headBefore), 'candidate generation must preserve the approved head');
  const evidence = { status: 'candidate-only', authority: 'ContractGeneration candidate; ContractGate pending',
    proposalDigest, priorBaseline: currentBaseline.ref, approvedState: state.ref,
    priorGateCommitDigest: gateRecord.commitDigest, priorExecutionCheckpointDigest: priorReplay.checkpointDigest,
    executionId, executionFingerprint: result.executionFingerprint, candidate: result.candidateRef,
    checkpointDigest: replay.checkpointDigest, replayGeneratorCalls: 0,
    preservedNativeContracts: 102, modifiedNativeContracts: 1, diffStatus: diff.status,
    semanticCompatibilityReview: 'separate review required; no classification override',
    approvedHeadUnchanged: true, gateApproved: false, downstreamMigrationComplete: false,
    traceApplicationProof: trace.applicationProof };
  store.save('runtime-evidence.json', evidence);
  console.log(JSON.stringify({ stage, outcome: result.outcome, generatorCalls, replayGeneratorCalls: 0,
    candidate: result.candidateRef, checkpointDigest: replay.checkpointDigest,
    preservedNativeContracts: 102, modifiedNativeContracts: 1, diffStatus: diff.status,
    approvedHeadUnchanged: true, gateApproved: false }));
} finally { storage.close(); }

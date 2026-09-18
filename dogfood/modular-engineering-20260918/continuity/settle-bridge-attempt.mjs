import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, canonicalJsonDigest, sha256Digest } from '../../../src/content-digest.mjs';
import { validateDesktopOrchestrationArtifact } from '../../../src/desktop-orchestration-artifact-validator.mjs';
import { createLocalHostCheckpointStore } from '../../../src/local-host-checkpoints.mjs';
import { verifyLocalWorkContinuityClaim } from '../../../src/local-work-continuity.mjs';
import { prepareLocalWorkDispatch } from '../../../src/local-work-execution-preparation.mjs';
import { executeWorkItem } from '../../../src/work-execution-runtime.mjs';
import { transitionWorkAttempt } from '../../../src/work-continuity.mjs';

const fail = message => { throw new TypeError(`bridge settlement: ${message}`); };
const require = (condition, message) => { if (!condition) fail(message); };
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const protocol = 'devrelay.zeroshot-desktop/1';
const statuses = ['prepared', 'dispatched', 'running', 'completed'];
const semanticResult = ({ replayed, executorCalls, ...result }) => result;

// Construction evidence only. This deliberately supports the completed three-node
// worker/acceptance/code graph used by these two attempts, not arbitrary graphs.
async function inspectEvidence({ storage, stageDirectory, checkpointNamespace, loadArtifact }) {
  const readBytes = name => readFileSync(join(stageDirectory, `${name}.json`));
  const read = name => JSON.parse(readBytes(name));
  const load = async ref => {
    const bytes = Buffer.from(await loadArtifact(ref));
    require(sha256Digest(bytes) === ref.digest, `artifact bytes differ: ${ref.artifactId}`);
    return bytes;
  };
  const claim = read('claim');
  const fingerprint = read('work-fingerprint');
  const invocation = read('invocation');
  const refs = read('inputs');
  const configuration = read('configuration');
  const prepared = await prepareLocalWorkDispatch({ projectId: fingerprint.material.projectId,
    qualityHandoff: read('quality-handoff'), executionRequest: {
      readiness: read('readiness'), attemptId: claim.attemptId, workItemId: invocation.workItem.id,
      executionBindingRef: refs.executionBinding, executionPolicyRef: refs.executionPolicy,
      repositorySnapshotRef: refs.repositorySnapshot, workspaceBaseDigest: invocation.workspaceBaseDigest,
      executorConfigurationDigest: canonicalJsonDigest(configuration), loadArtifact: load,
    } });
  require(same(prepared.invocation, invocation) && same(prepared.workFingerprint, fingerprint) &&
    same(Object.fromEntries(Object.entries(prepared.input).map(([name, input]) => [name, input.ref])), refs),
  'original invocation, inputs or fingerprint differ');

  // A serialized runtime-replay.json is not proof. Re-enter the owning runtime
  // against the existing immutable durable result with all execution paths denied.
  const records = createLocalHostCheckpointStore({ storage, namespace: checkpointNamespace });
  const checkpoint = records.get(`result/work-execution/${claim.attemptId}`);
  require(checkpoint?.state === 'recorded', 'genuine recorded WorkExecution checkpoint is missing');
  const denyEffect = () => fail('replay attempted a new effect');
  const replay = await executeWorkItem({ attemptId: claim.attemptId, workItemId: invocation.workItem.id,
    input: prepared.input, workspaceBaseDigest: invocation.workspaceBaseDigest,
    executorConfigurationDigest: canonicalJsonDigest(configuration),
    executor: { ...prepared.input.executionBinding.value.executor, execute: denyEffect },
    checkpoints: { get: key => records.get(`result/${key}`), claim: denyEffect, complete: denyEffect } });
  require(replay.replayed === true && replay.executorCalls === 0 && replay.outcome === 'proposed', 'zero-call proposed replay required');
  require(same(semanticResult(read('runtime-result')), semanticResult(replay)), 'recorded runtime projection differs');
  const raw = JSON.parse(Buffer.from(replay.checkpoint.rawBytesBase64, 'base64'));
  const native = new Map(raw.nativeArtifacts.map(ref => [ref.artifactId, ref]));
  require(native.size === raw.nativeArtifacts.length, 'duplicate native artifacts');
  const nativeRead = async name => {
    const ref = native.get(`NATIVE-${name.replaceAll('/', '-')}.json`);
    require(ref && raw.evidence.some(item => same(item, ref)), `native evidence missing: ${name}`);
    const bytes = await load(ref);
    require(bytes.equals(readBytes(`queue/${name}`)), `native queue bytes differ: ${name}`);
    return JSON.parse(bytes);
  };
  const config = await nativeRead('configuration');
  require(readBytes('zeroshot-configuration').equals(readBytes('queue/configuration')), 'engine configuration differs');
  const configDigest = sha256Digest(readBytes('queue/configuration'));
  const start = read('engine-start');
  const source = read('source-snapshot');
  const repository = prepared.input.repositorySnapshot.value;
  const graphPath = 'tools/zeroshot-desktop-bridge/software-change.graph.json';
  const graphBytes = await load({ artifactId: 'CONSTRUCTION-ZEROSHOT-GRAPH', digest: configuration.graphDigest,
    uri: pathToFileURL(join(repository.repository, graphPath)).href });
  require(config.protocol === protocol && config.runId === configuration.runId && start.runId === config.runId &&
    start.configurationDigest === configDigest && start.invocationFingerprint === invocation.invocationFingerprint &&
    config.sourceSnapshotDigest === canonicalJsonDigest(source) && configuration.sourceSnapshotDigest === config.sourceSnapshotDigest &&
    same(JSON.parse(graphBytes), config.submission.graph) &&
    source.files.find(file => file.path === graphPath)?.digest === configuration.graphDigest &&
    repository.treeDigest === config.sourceSnapshotDigest && repository.revision === source.revision &&
    same(repository.includedPaths, source.files.map(file => file.path)) && config.submission.source.revision === source.revision &&
    config.workspace === repository.repository, 'original source or engine binding differs');
  const terminal = await nativeRead('terminal');
  require(same(terminal.result, { status: 'succeeded', output: null }) && same(terminal.snapshot.terminal, terminal.result) &&
    terminal.snapshot.phase === 'finished' && terminal.snapshot.runId === config.runId &&
    terminal.snapshot.forceStopRequested === false && same(terminal.snapshot.source, config.submission.source) &&
    same(Object.keys(terminal.snapshot.executions).sort(), ['1', '2', '3']), 'complete successful three-node terminal required');

  const dispatches = [];
  const candidates = [];
  for (const [id, node] of [['1', 'worker'], ['2', 'acceptance'], ['3', 'code']]) {
    const request = await nativeRead(`requests/${id}`);
    const plan = await nativeRead(`plans/${id}`);
    validateDesktopOrchestrationArtifact(plan);
    const reservation = await nativeRead(`claims/${id}`);
    const receipt = await nativeRead(`receipts/${id}`);
    const response = await nativeRead(`responses/${id}`);
    const final = await nativeRead(`finals/${id}`);
    const nativeFinal = await nativeRead(`native-finals/${id}`);
    const nativeReceipt = await nativeRead(`native-tool-receipts/${id}`);
    const bootstrap = await nativeRead(`bootstrap/${id}`);
    const candidate = await nativeRead(`candidate-snapshots/${id}`);
    const assignment = plan.assignment;
    const execution = terminal.snapshot.executions[id];
    const requestDigest = sha256Digest(readBytes(`queue/requests/${id}`));
    require(request.protocol === protocol && request.requestId === id && request.reference.execution === Number(id) &&
      request.reference.node === node && request.reference.runId === config.runId && request.workspace === config.workspace &&
      request.configurationDigest === configDigest && same(execution.reference, request.reference) &&
      execution.occurrence.node === node && execution.attempt === 1 && execution.startedAt && execution.state.completed,
    `request or terminal execution differs: ${id}`);
    require(plan.runId === config.runId && plan.attemptId === `${config.runId}-execution-${id}` &&
      plan.workItemId === `${config.runId}-node-${id}` && plan.startingRevision === source.revision &&
      plan.promptDigest === sha256Digest(Buffer.from(request.prompt)) &&
      plan.worktreeLease.workspace === config.workspace && plan.worktreeLease.revision === source.revision &&
      assignment.parentWorkItemId === invocation.workItem.id && assignment.parentInvocationFingerprint === invocation.invocationFingerprint &&
      assignment.parentWorkFingerprintDigest === fingerprint.fingerprint &&
      assignment.parentQualityResolutionDigest === fingerprint.material.qualityResolutionDigest &&
      assignment.parentClaimDigest === canonicalJsonDigest(claim) && assignment.candidateSourceDigest === canonicalJsonDigest(candidate) &&
      candidate.revision === source.revision, `native plan parent binding differs: ${id}`);
    const { receiptDigest: bootstrapDigest, ...bootstrapBody } = bootstrap.receipt;
    require(bootstrap.receipt.outcome === 'pass' && bootstrap.receipt.taskId === plan.attemptId &&
      bootstrap.receipt.repositoryRevision === source.revision && bootstrapDigest === canonicalJsonDigest(bootstrapBody) &&
      bootstrap.receiptRef.digest === canonicalJsonDigest(bootstrap.receipt) &&
      same(bootstrap.memoryContext, plan.memoryContext) && same(bootstrap.receiptRef, plan.memoryContext.bootstrapReceipt),
    `native bootstrap differs: ${id}`);
    require(reservation.protocol === protocol && typeof reservation.claimId === 'string' && reservation.claimId.length > 0 &&
      reservation.requestDigest === requestDigest && reservation.planDigest === plan.planDigest &&
      same(await nativeRead(`prepared/${id}`), plan) &&
      same(await nativeRead(`dispatch/${id}`), { reservation, request, plan }), `reserved dispatch differs: ${id}`);
    const nativeIdentity = same(nativeReceipt, { task_name: receipt.agentId }) || same(nativeReceipt, {
      tool: 'collaboration.followup_task', target: receipt.agentId, toolReturnedContent: null, observedAgentStatus: 'running',
    });
    require(receipt.protocol === protocol && receipt.requestDigest === requestDigest && receipt.planDigest === plan.planDigest &&
      receipt.authority === 'observation-only' && same(receipt.nativeReceipt, nativeReceipt) &&
      nativeIdentity && typeof receipt.agentId === 'string' && receipt.agentId.length > 0 &&
      response.protocol === protocol && response.requestDigest === requestDigest && response.planDigest === plan.planDigest &&
      response.agentId === receipt.agentId && final.agentId === receipt.agentId &&
      same(JSON.parse(final.finalText), nativeFinal) && same(nativeFinal, { response: response.response }),
    `native receipt or final differs: ${id}`);
    const outcome = execution.state.completed.outcome;
    if (node === 'worker') {
      require(request.role === 'worker' && response.response === null && outcome.status === 'verified' && outcome.output === null,
        'worker completion missing');
    } else {
      require(request.role === 'verifier' && response.response.output === null && response.response.signals.verdict === 'accepted' &&
        outcome.status === 'verifier' && same(outcome.signals, response.response.signals) &&
        same(outcome.diagnostic, response.response.diagnostic), `accepted independent review missing: ${id}`);
      candidates.push(candidate);
    }
    dispatches.push({ requestId: id, requestDigest, planDigest: plan.planDigest, agentId: receipt.agentId,
      receiptDigest: sha256Digest(readBytes(`queue/receipts/${id}`)) });
  }
  require(new Set(dispatches.map(item => item.agentId)).size === 3, 'independent native identities required');
  require(same(candidates[0], candidates[1]), 'reviewed candidate snapshots differ');
  const sourceResult = read('source-result');
  require(same(sourceResult.mutations, replay.changeSet.mutations) &&
    raw.evidence.some(ref => same(ref, sourceResult.sourceResult)) &&
    same(JSON.parse(await load(sourceResult.sourceResult)), { invocationFingerprint: invocation.invocationFingerprint, mutations: sourceResult.mutations }),
  'source result differs from runtime checkpoint');
  const files = new Map(source.files.map(file => [file.path, file.digest]));
  require(files.size === source.files.length, 'duplicate source paths');
  for (const mutation of sourceResult.mutations) {
    require(configuration.writablePaths.includes(mutation.path) && (files.get(mutation.path) ?? null) === mutation.beforeDigest,
      `mutation source or scope differs: ${mutation.path}`);
    for (const [side, digest] of [['before', mutation.beforeDigest], ['after', mutation.afterDigest]]) {
      if (digest !== null) await load({ artifactId: `${side}-${mutation.path}`, digest });
    }
    if (mutation.operation === 'delete') files.delete(mutation.path);
    else files.set(mutation.path, mutation.afterDigest);
  }
  require(new Set(candidates[0].files.map(file => file.path)).size === candidates[0].files.length &&
    candidates[0].files.length === files.size && candidates[0].files.every(file => files.get(file.path) === file.digest),
    'reviewed source differs from the exact runtime mutations');
  return { claim, fingerprint, claimReceipt: read('claim-receipt'), replay, dispatches,
    sourceDigest: canonicalJsonDigest(source), candidateSourceDigest: canonicalJsonDigest(candidates[0]),
    configurationDigest: canonicalJsonDigest(configuration), terminalDigest: sha256Digest(readBytes('queue/terminal')) };
}

// Caller supplies an already-open store. Inspection never initializes a store,
// renews the original lease, dispatches, or writes an artifact. Only apply:true
// commits the bounded continuity progression; it grants no lifecycle authority.
export async function settleBridgeAttempt(request) {
  const allowed = ['storage', 'store', 'stageDirectory', 'checkpointNamespace', 'loadArtifact', 'apply'];
  require(request && Object.keys(request).every(key => allowed.includes(key)), 'undeclared input');
  const { storage, store, apply = false } = request;
  require(typeof apply === 'boolean', 'apply must be an explicit boolean');
  const proof = await inspectEvidence(request);
  const { claim, fingerprint, replay } = proof;
  const verifiedClaim = verifyLocalWorkContinuityClaim({ storage, store, workFingerprint: fingerprint, ...claim });
  require(same(verifiedClaim, proof.claimReceipt), 'original claim receipt differs');
  const receipt = { kind: 'ConstructionBridgeSettlementReceipt', attemptId: claim.attemptId,
    claim, claimReceipt: verifiedClaim, fingerprint: fingerprint.fingerprint,
    invocationFingerprint: replay.invocation.invocationFingerprint,
    configurationDigest: proof.configurationDigest, sourceDigest: proof.sourceDigest,
    candidateSourceDigest: proof.candidateSourceDigest, terminalDigest: proof.terminalDigest,
    checkpointNamespace: request.checkpointNamespace, checkpointDigest: canonicalJsonDigest(replay.checkpoint),
    dispatches: proof.dispatches, replayed: true, executorCalls: 0,
    verified: false, integrated: false, completionAuthority: false };
  const artifacts = {
    receipt: Buffer.from(canonicalJson(receipt)),
    result: Buffer.from(replay.checkpoint.rawBytesBase64, 'base64'),
    evidence: Buffer.from(canonicalJson(replay.evidenceBundle)),
  };
  const digests = Object.fromEntries(Object.entries(artifacts).map(([key, bytes]) => [`${key}Digest`, sha256Digest(bytes)]));
  const artifactRefs = {
    receipt: { artifactId: `BRIDGE-SETTLEMENT-${digests.receiptDigest.slice(7)}`, mediaType: 'application/json' },
    result: { artifactId: replay.attempt.result.artifactId, mediaType: replay.attempt.result.mediaType },
    evidence: { artifactId: `EEB-${claim.attemptId}`, mediaType: 'application/vnd.devrelay.execution-evidence-bundle+json' },
  };
  for (const [name, ref] of Object.entries(artifactRefs)) Object.assign(ref, { digest: digests[`${name}Digest`], byteCount: artifacts[name].length });
  const transitionFor = position => ({ kind: 'ConstructionBridgeAttemptSettled', attemptId: claim.attemptId,
    fromStatus: statuses[position - 1], toStatus: statuses[position], ...digests, completionAuthority: false });
  const readProgress = () => {
    verifyLocalWorkContinuityClaim({ storage, store, workFingerprint: fingerprint, ...claim });
    const current = store.read();
    const record = current.state.index.records.find(item => item.attemptId === claim.attemptId);
    require(record, 'current attempt record is missing');
    const position = statuses.indexOf(record.status);
    require(position >= 0, 'attempt requires another recovery disposition');
    const journal = storage.readTransitionJournal(store.runId);
    const rows = journal.filter(row => row.toVersion > verifiedClaim.hostVersion && row.transition.attemptId === claim.attemptId);
    require(rows.length === position, 'settlement progression lacks exact journal evidence');
    for (const [offset, row] of rows.entries()) {
      require(same(row.transition, transitionFor(offset + 1)), 'settlement journal differs');
      const prior = journal.find(item => item.toVersion === row.fromVersion);
      require(prior?.checkpointRef && row.checkpointRef && same(row.artifactRefs, [row.checkpointRef]), 'settlement checkpoint missing');
      const index = JSON.parse(storage.getArtifact(prior.checkpointRef));
      const next = transitionWorkAttempt({ index, expectedRevision: index.revision, attemptId: claim.attemptId,
        fromStatus: statuses[offset], toStatus: statuses[offset + 1], ...digests });
      require(storage.getArtifact(row.checkpointRef).equals(Buffer.from(canonicalJson(next))), 'settlement index differs');
    }
    require(['receiptDigest', 'resultDigest', 'evidenceDigest'].every(key => record[key] === (position ? digests[key] : null)),
      'current continuity evidence differs');
    if (position) for (const [name, ref] of Object.entries(artifactRefs)) {
      require(storage.getArtifact(ref).equals(artifacts[name]), 'durable settlement artifact differs');
    }
    return { current, position };
  };
  const initial = readProgress();
  if (apply && initial.position < 3) {
    // Content-addressed writes may precede a crash, but cannot advance the index.
    // Replay revalidates all evidence before reusing either artifact or journal.
    for (const [name, bytes] of Object.entries(artifacts)) {
      storage.putArtifact({ ...artifactRefs[name], bytes, expectedDigest: digests[`${name}Digest`], provenance: [] });
    }
    for (;;) {
      const { current, position } = readProgress();
      if (position === 3) break;
      const transition = transitionFor(position + 1);
      const nextIndex = transitionWorkAttempt({ index: current.state.index, expectedRevision: current.state.index.revision,
        attemptId: claim.attemptId, fromStatus: transition.fromStatus, toStatus: transition.toStatus, ...digests });
      store.commit({ expectedHostVersion: current.version, expectedIndexRevision: current.state.index.revision, transition, nextIndex });
    }
  }
  const final = readProgress();
  return { kind: 'ConstructionBridgeSettlementInspection', mode: apply ? 'apply' : 'inspect', receipt, ...digests,
    status: statuses[final.position], pendingTransitions: statuses.slice(final.position + 1),
    appliedTransitions: final.position - initial.position, hostVersion: final.current.version,
    indexDigest: final.current.state.index.indexDigest, completionAuthority: false };
}

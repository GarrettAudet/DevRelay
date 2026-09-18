import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { prepareLocalWorkDependencyRoute, verifyLocalWorkDependencyRoute } from "../../src/local-work-dependency-planning.mjs";
import { createLocalWorkDependencyContext, verifyLocalWorkDependencyContext, materializeLocalWorkDependencyContext } from "../../src/local-work-dependency-context.mjs";
import { executeLocalWorkDependencyPlanning, verifyLocalWorkDependencyExecution } from "../../src/local-work-dependency-execution.mjs";
import { prepareLocalWorkDependencyGate } from "../../src/local-work-dependency-gate.mjs";
import { activateLocalDependencyBaseline, verifyLocalDependencyBaselineActivation, localDependencyBaselineHeadId } from "../../src/local-dependency-baseline-activation.mjs";

export async function exerciseDependencyReplacement({ initial, initialActivation, context, configuration, resolvePath, jsonArtifact, evidenceRef, reopen }) {
  let { storage, graph } = initial;
  const { namespace } = initial;
  const id = localDependencyBaselineHeadId(namespace);
  const badDigest = `sha256:${"f".repeat(64)}`;
  const before = graph.captureBase();
  const next = { ...initial, currentWorkDependencyBaseline: initialActivation.baseline };
  const planned = await prepareLocalWorkDependencyRoute(next);
  assert.deepEqual(JSON.parse(planned.state.bytes).currentWorkDependencyBaseline, initialActivation.baseline);
  assert.notEqual(planned.state.ref.digest, initial.expectedState.ref.digest);
  next.expectedState = planned.state;
  const handoffArgs = { ...context, currentWorkDependencyBaseline: initialActivation.baseline };
  const handoff = await createLocalWorkDependencyContext(handoffArgs);
  const priorFile = handoff.files.find(entry => entry.ref.digest === initialActivation.baseline.digest);
  assert.ok(priorFile, "handoff carries exact predecessor bytes");
  assert.deepEqual(Buffer.from(priorFile.bytesBase64, "base64"), Buffer.from(await initial.loadArtifact(initialActivation.baseline)));
  assert.deepEqual(await verifyLocalWorkDependencyContext({ ...handoffArgs, handoff }), handoff);
  const publicationArgs = { configuration, handoff, resolvePath };
  const published = materializeLocalWorkDependencyContext(publicationArgs);
  const publishedConfiguration = JSON.parse(readFileSync(published.configurationPath));
  const restoredLoad = ref => {
    const file = publishedConfiguration.artifacts.find(entry => canonicalJsonDigest(entry.ref) === canonicalJsonDigest(ref));
    return file ? readFileSync(resolvePath(file.path)) : context.loadArtifact(ref);
  };
  assert.deepEqual(await verifyLocalWorkDependencyContext({ ...handoffArgs, handoff: JSON.parse(JSON.stringify(handoff)), loadArtifact: restoredLoad }), handoff);
  assert.deepEqual(materializeLocalWorkDependencyContext({ ...publicationArgs, verifyOnly: true }), published);

  for (const ref of [undefined, { ...initialActivation.baseline, digest: badDigest }, { ...initialActivation.baseline, schema: initialActivation.baseline.schema.replace("/v1", "/v99") }]) {
    await assert.rejects(prepareLocalWorkDependencyRoute({ ...next, currentWorkDependencyBaseline: ref }));
  }
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...next, loadArtifact: ref => ref.digest === initialActivation.baseline.digest ? Buffer.from("{}") : initial.loadArtifact(ref) }), { code: "DR2103" });
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...next, storage: { ...storage,
    readTransitionJournal(runId, options) { return runId === id ? [] : storage.readTransitionJournal(runId, options); }
  } }), /publication/);
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...next, storage: { ...storage,
    getArtifact(ref) { return ref.digest === initialActivation.baseline.digest ? Buffer.from("tampered") : storage.getArtifact(ref); }
  } }), /stored bytes/);
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...next, storage: { ...storage,
    readRun(runId) { const row = storage.readRun(runId); return runId === id ? { ...row, state: { ...row.state, pendingCommit: badDigest } } : row; }
  } }), /pending Gate/);
  await assert.rejects(verifyLocalWorkDependencyRoute({ ...next, currentWorkDependencyBaseline: undefined }), /exact derivation/);
  await assert.rejects(verifyLocalWorkDependencyExecution({ ...next, execution: initial.execution }), /identity/);
  assert.deepEqual(graph.captureBase(), before);

  // Prove fresh execution checks the current predecessor before the proposer.
  await assert.rejects(executeLocalWorkDependencyPlanning({ ...next, storage: { ...storage,
    readRun(runId) { const row = storage.readRun(runId); return runId === id ? { ...row, state: { ...row.state, pendingCommit: badDigest } } : row; }
  } }), /pending Gate/);
  next.execution = await executeLocalWorkDependencyPlanning(next);
  assert.equal(next.execution.replayed, false);
  assert.notEqual(next.execution.executionId, initial.execution.executionId);
  assert.notEqual(next.execution.executionFingerprint, initial.execution.executionFingerprint);
  const receipt = await verifyLocalWorkDependencyExecution(next);
  const candidate = next.execution.candidate;
  const approval = jsonArtifact("WDA-REPLACEMENT-APPROVAL", initial.dependencyGate.approval.ref,
    { ...JSON.parse(Buffer.from(initial.dependencyGate.approval.bytesBase64, "base64")), approvalId: "WDA-REPLACEMENT-APPROVAL", candidate: next.execution.candidateRef, requiredEvidence: [evidenceRef] });
  const baseline = jsonArtifact("WDB-REPLACEMENT", initial.dependencyGate.baseline.ref,
    { ...JSON.parse(Buffer.from(initial.dependencyGate.baseline.bytesBase64, "base64")), baselineId: "WDB-REPLACEMENT", version: "1.1.0",
      approvedCandidate: next.execution.candidateRef, nodes: candidate.nodes, edges: candidate.edges, graphDigest: candidate.graphDigest,
      topologicalOrder: candidate.topologicalOrder, policyEvidence: candidate.policyDecisionSet, consistencyEvidence: candidate.consistencyReview,
      approvalEvidence: [approval.ref], sourceRefs: candidate.sourceRefs });
  next.loadArtifact = ref => ref.digest === approval.ref.digest ? approval.bytes : ref.digest === baseline.ref.digest ? baseline.bytes : initial.loadArtifact(ref);
  next.dependencyGate = await prepareLocalWorkDependencyGate({ replayReceipt: receipt, baselineRef: baseline.ref, approvalRef: approval.ref, loadArtifact: next.loadArtifact });
  const rejectBeforeGraph = { ...graph, prepare() { assert.fail("invalid predecessor prepared graph"); }, validatePrepared(request) { if (request.gate?.id === "work-dependency-gate") assert.fail("invalid predecessor prepared graph"); return graph.validatePrepared(request); } };
  for (const patch of [{ baseline: null, activationDigest: null }, { activationDigest: badDigest }, { pendingCommit: badDigest }]) {
    await assert.rejects(activateLocalDependencyBaseline({ ...next, graph: rejectBeforeGraph, storage: { ...storage,
      readRun(runId) { const row = storage.readRun(runId); return runId === id ? { ...row, state: { ...row.state, ...patch } } : row; }
    } }), /prior baseline or pending Gate conflicts/);
  }
  const initialReceipt = await verifyLocalWorkDependencyExecution(initial);
  const initialApproval = jsonArtifact("WDA-INITIAL-REATTEMPT", initial.dependencyGate.approval.ref,
    { ...JSON.parse(Buffer.from(initial.dependencyGate.approval.bytesBase64, "base64")), approvalId: "WDA-INITIAL-REATTEMPT" });
  const initialBaseline = jsonArtifact("WDB-INITIAL-REATTEMPT", initial.dependencyGate.baseline.ref,
    { ...JSON.parse(Buffer.from(initial.dependencyGate.baseline.bytesBase64, "base64")), baselineId: "WDB-INITIAL-REATTEMPT", approvalEvidence: [initialApproval.ref] });
  const initialLoad = ref => ref.digest === initialApproval.ref.digest ? initialApproval.bytes : ref.digest === initialBaseline.ref.digest ? initialBaseline.bytes : initial.loadArtifact(ref);
  const initialGate = await prepareLocalWorkDependencyGate({ replayReceipt: initialReceipt, baselineRef: initialBaseline.ref, approvalRef: initialApproval.ref, loadArtifact: initialLoad });
  await assert.rejects(activateLocalDependencyBaseline({ ...initial, dependencyGate: initialGate, loadArtifact: initialLoad, graph: rejectBeforeGraph }),
    /prior baseline or pending Gate conflicts/, "another genuine initial Gate cannot overwrite a published head");
  let headReads = 0;
  await assert.rejects(activateLocalDependencyBaseline({ ...next, graph: rejectBeforeGraph, storage: { ...storage,
    readRun(runId) {
      const row = storage.readRun(runId);
      if (runId === id && ++headReads > 1) return { ...row, state: { ...row.state, pendingCommit: badDigest } };
      return row;
    }
  } }), /prior baseline or pending Gate conflicts/, "head is rechecked under the lease");
  assert.ok(headReads >= 2);
  await assert.rejects(activateLocalDependencyBaseline({ ...next, graph: rejectBeforeGraph, storage: { ...storage,
    readRun(runId) { if (runId === id) throw Object.assign(new Error("missing head"), { code: "DR4920" }); return storage.readRun(runId); },
    initializeRun(value) { assert.equal(value.state.baseline, null); throw new Error("empty head only"); }
  } }), /empty head only/);
  const altered = jsonArtifact("WDB-UNPUBLISHED", baseline.ref, { ...baseline.value, baselineId: "WDB-UNPUBLISHED" });
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...next, currentWorkDependencyBaseline: altered.ref,
    loadArtifact: ref => ref.digest === altered.ref.digest ? altered.bytes : next.loadArtifact(ref) }), /publication/);
  assert.deepEqual(graph.captureBase(), before);
  const restart = () => {
    ({ storage, graph } = reopen());
    for (const request of [initial, next, context, handoffArgs]) Object.assign(request, { storage, graph });
  };
  let crashed = false;
  await assert.rejects(activateLocalDependencyBaseline({ ...next, storage: { ...storage, commitTransition(value) {
    const result = storage.commitTransition(value);
    if (value.transition.kind === "DependencyBaselineReserved" && !crashed) { crashed = true; throw new Error("crash after reservation"); }
    return result;
  } } }), /crash after reservation/);
  restart();
  assert.equal(storage.readRun(id).state.pendingCommit, next.dependencyGate.commitDigest);
  await assert.rejects(activateLocalDependencyBaseline({ ...next, graph: { ...graph, async mergePrepared(prepared) {
    await graph.mergePrepared(prepared); throw new Error("crash after merge");
  } } }), /crash after merge/);
  restart();
  await assert.rejects(activateLocalDependencyBaseline({ ...next, storage: { ...storage, commitTransition(value) {
    const result = storage.commitTransition(value);
    if (value.transition.kind === "DependencyBaselineActivated") throw new Error("crash after publication");
    return result;
  } } }), /crash after publication/);
  restart();
  const activated = await activateLocalDependencyBaseline(next);
  assert.deepEqual(await verifyLocalDependencyBaselineActivation(next), activated);
  const current = storage.readRun(id);
  assert.deepEqual(current.state.baseline, baseline.ref);
  assert.equal(current.state.pendingCommit, null);
  const readOnlyStorage = { ...storage, putArtifact() { assert.fail("replay wrote artifact"); }, initializeRun() { assert.fail("replay initialized state"); },
    commitTransition() { assert.fail("replay committed state"); }, acquireLease() { assert.fail("replay acquired lease"); },
    readRun(runId) { const row = storage.readRun(runId); return runId === id ? { ...row, state: { ...row.state, pendingCommit: badDigest } } : row; } };
  for (const [request, expected] of [[initial, initialActivation], [next, activated]]) {
    const readonly = { ...request, storage: readOnlyStorage };
    assert.deepEqual(await verifyLocalDependencyBaselineActivation(readonly), expected);
    assert.deepEqual(await activateLocalDependencyBaseline(readonly), expected);
    assert.equal((await executeLocalWorkDependencyPlanning(readonly)).replayed, true);
  }
  assert.deepEqual(await verifyLocalWorkDependencyContext({ ...handoffArgs, handoff, storage: readOnlyStorage }), handoff);
  await assert.rejects(prepareLocalWorkDependencyRoute(next), /stale/);
  await assert.rejects(prepareLocalWorkDependencyRoute(initial), /missing/);
  assert.deepEqual(storage.readRun(id), current);
}

import assert from "node:assert/strict";

import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";

import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLocalArchitectureGate } from "../src/local-architecture-gate.mjs";
import { activateLocalArchitectureGate } from "../src/local-architecture-activation.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";

import { createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { createLocalHostTraceabilityStore } from "../src/local-host-traceability.mjs";
import { architectureTraceabilityContributor, createArchitectureActivationTraceabilityContributor } from "../src/architecture-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import { prepareLocalContractPlanning } from "../src/local-contract-planning.mjs";

import { activateLocalContractsNotApplicable } from "../src/local-contract-activation.mjs";
import { prepareLocalContractsNotApplicable } from "../src/local-contract-not-applicable.mjs";
import { createContractNotApplicableTraceabilityContributor } from "../src/contract-traceability-contributor.mjs";
import { prepareLocalWorkBreakdownRoute } from "../src/local-work-breakdown-planning.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../src/work-breakdown-runtime-contracts.mjs";
import { createLocalWorkBreakdownContext, materializeLocalWorkBreakdownContext, verifyLocalWorkBreakdownContext } from "../src/local-work-breakdown-context.mjs";
import { createSessionContextSnapshot, executeSessionBootstrap } from "../src/session-bootstrap.mjs";

import { runtimeFixture, checkpoints } from "./fixtures/local-work-change-handoff.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createWorkBreakdownApprovalTraceabilityContributor } from "../src/work-breakdown-traceability-contributor.mjs";
import { TRACEABILITY_VOCABULARY_V1_9 } from "../src/traceability-artifact-validator.mjs";
import { prepareLocalWorkBreakdownGate } from "../src/local-work-breakdown-gate.mjs";
import { activateLocalWorkBaseline, verifyLocalWorkBaselineActivation, localWorkBaselineHeadId } from "../src/local-work-baseline-activation.mjs";
import { desktopWorkCandidate } from "./fixtures/desktop-work-candidate.mjs";
import { applyWorkBreakdownChangeSet } from "../src/work-breakdown-artifact-validator.mjs";
import { verifyLocalWorkBreakdownRoute } from "../src/local-work-breakdown-planning.mjs";
import { assertLocalWorkInvocationCurrent } from "../src/local-work-breakdown-context.mjs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";

const readJson = name => JSON.parse(readFileSync(new URL("../" + name, import.meta.url)));

async function activatedFixture(t) {
  const disposition = section => {
    for (const intent of section.content.interfaces) intent.contractGeneration = {
      required: false, suggestedKinds: [],
    };
  };
  const fixture = await runtimeFixture({ mutateDesigner: value => disposition(value.interfaceIntent),
    mutateDraft: value => disposition(value.sections.interfaceIntent) });
  const context = { artifacts: fixture.store.artifacts, checkpoints: checkpoints() };
  await fixture.registry.execute(fixture.invocation, context);
  const checkpointReplay = await fixture.registry.verifyCheckpointedExecution(fixture.invocation, context);
  const draft = checkpointReplay.loadedOutputs["architecture-draft"][0].value;
  const raw = (id, value, schema, mediaType = "application/json") => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    fixture.store.addBytes(id, bytes);
    return { artifactId: id, schema, mediaType, digest: sha256Digest(bytes), uri: `fixture://activation/${id}` };
  };
  const review = raw("activation-review", "Synthetic review only", "https://devrelay.dev/evidence/architecture-gate-review/v1", "text/markdown");
  const evidence = raw("activation-test", "Synthetic evidence only", "https://devrelay.dev/evidence/test/v1", "text/markdown");
  const owner = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureGateOwnerApproval", approvalId: "activation-owner",
    authority: "project-owner", decision: "approve", policyVersion: "architecture-gate/0.1.0", candidate: fixture.draftRef,
    gateReview: review, requiredEvidence: [evidence], repositoryRevision: "fixture-greenfield" };
  const ownerApprovalRef = raw(owner.approvalId, owner, "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1", "application/vnd.devrelay.architecture-gate-owner-approval+json");
  const sections = structuredClone(draft.sections);
  for (const decision of sections.decisionRecords.content.decisions) if (decision.status === "proposed") decision.status = "accepted";
  const baseline = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureBaseline", baselineId: "activation-baseline",
    approvedDraft: fixture.draftRef, requirementsBaseline: draft.requirementsBaseline, projectOverviewBaseline: draft.projectOverviewBaseline,
    projectContext: draft.projectContext, sections, approvalPolicyVersion: owner.policyVersion,
    approvalEvidence: [review, evidence, ownerApprovalRef], sourceRefs: draft.sourceRefs };
  const baselineRef = fixture.store.add(baseline.baselineId, baseline);
  const loadArtifact = fixture.store.artifacts.load;
  const record = await prepareLocalArchitectureGate({ checkpointReplay, ownerApprovalRef, baselineRef, loadArtifact });
  const directory = mkdtempSync(join(tmpdir(), "devrelay-activation-recovery-"));
  let storage = createLocalHostStorage({ rootDirectory: directory });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  const makeGraph = () => createTraceabilityGraphService({ projectId: "activation-fixture", graphId: "activation-fixture-graph",
    store: createLocalHostTraceabilityStore({ storage, namespace: "activation-fixture/graph", graphId: "activation-fixture-graph" }),
    vocabulary: TRACEABILITY_VOCABULARY_V1_9, contributors: [requirementsBaselineObserverContributor, architectureTraceabilityContributor, createArchitectureActivationTraceabilityContributor(), createContractNotApplicableTraceabilityContributor(), createWorkBreakdownApprovalTraceabilityContributor()] });
  let graph = makeGraph();
  const namespace = "architecture-recovery-fixture";

  const request = { storage, namespace, graph, checkpointReplay, record, loadArtifact };
  await activateLocalArchitectureGate(request);
  const planning = await prepareLocalContractPlanning(request);
  const approvalRef = raw("ANA-WORK-CHANGE", { apiVersion: "devrelay.dev/v1alpha1", kind: "ApprovedNotApplicable", approvalId: "ANA-WORK-CHANGE", purpose: "contract-disposition", rationale: "Isolated no-contract fixture", authority: { id: "fixture-owner", role: "human-approver" }, approvalEvidence: [evidence] }, "https://devrelay.dev/artifacts/approved-not-applicable/v1", "application/vnd.devrelay.approved-not-applicable+json");
  const notApplicableCommit = await prepareLocalContractsNotApplicable({ ...request, planning, approvalRef });
  await activateLocalContractsNotApplicable({ ...request, planning, commit: notApplicableCommit });
  return { request: { ...request, planning, notApplicableCommit }, raw, fixture, evidence, directory, baseline,
    reopen() { storage.close(); storage = createLocalHostStorage({ rootDirectory: directory }); graph = makeGraph(); return { storage, graph }; } };
}

async function executeWork(fx, prepared, prior) {
  const state = JSON.parse(prepared.state.bytes);
  fx.fixture.store.addBytes(prepared.state.ref.artifactId, prepared.state.bytes);
  const route = fx.raw('route-' + state.stateId, prepared.route, 'https://devrelay.dev/artifacts/module-route-decision/v1', 'application/vnd.devrelay.module-route-decision+json');
  const operation = prepared.route.selection.operation;
  const invocation = readJson('examples/invocations/work-breakdown-' + (prior ? 'decompose-change' : 'establish') + '-001.invocation.json');
  invocation.invocationId = prior ? 'work-change-fixture' : 'work-initial-fixture';
  invocation.inputs = { 'project-work-breakdown-state': [prepared.state.ref], 'routing-decision': [route] };
  const properties = { 'requirements-baseline': 'requirementsBaseline', 'project-overview-baseline': 'projectOverviewBaseline', 'architecture-baseline': 'architectureBaseline', 'contract-disposition': 'contractDisposition', 'capability-catalog': 'capabilityCatalog', ...(prior ? { 'current-work-breakdown-baseline': 'currentWorkBreakdownBaseline', 'approved-change-package': 'approvedChangePackage', 'current-repository-snapshot': 'currentRepositorySnapshot' } : { 'repository-context': 'repositoryContext' }) };
  for (const [port, property] of Object.entries(properties)) invocation.inputs[port] = [state[property]];
  const loadedInputs = {};
  for (const [port, refs] of Object.entries(invocation.inputs)) loadedInputs[port] = await Promise.all(refs.map(async ref => {
    const bytes = await fx.request.loadArtifact(ref); return { ref, bytes, value: JSON.parse(bytes) };
  }));
  const nativeRef = fx.raw('native-work-' + operation, 'Synthetic native planning text', 'https://example.test/native/v1', 'text/plain');
  let candidate;
  if (!prior) candidate = desktopWorkCandidate({ loadedInputs, nativeRef });
  else {
    const changed = { ...prior.value.workItems[0], objective: 'A bounded revised fixture objective.' };
    candidate = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'WorkBreakdownChangeSetDraft', changeSetId: 'WBCS-HOST-CHANGE', operation,
      currentBaseline: prior.ref, inputBindings: Object.entries(loadedInputs).filter(([role]) => role !== 'routing-decision').map(([role, [entry]]) => ({ role, artifact: entry.ref })),
      changes: [{ operation: 'update', workItemId: changed.id, priorItemDigest: canonicalJsonDigest(prior.value.workItems[0]), workItem: changed }],
      coverageDispositions: prior.value.coverageDispositions, nativeArtifacts: [nativeRef], sourceRefs: prior.value.sourceRefs,
      resultingWorkItemsDigest: canonicalJsonDigest(prior.value.workItems.map((item, index) => index === 0 ? changed : item)) };
  }
  const candidateRef = fx.raw(candidate.draftId ?? candidate.changeSetId, candidate,
    'https://devrelay.dev/artifacts/work-breakdown-' + (prior ? 'change-set-draft' : 'draft') + '/v1',
    'application/vnd.devrelay.work-breakdown-' + (prior ? 'change-set-draft' : 'draft') + '+json');
  const result = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'ModuleResult', invocationId: invocation.invocationId, status: 'completed', outcome: 'decomposed',
    outputs: { [prior ? 'work-breakdown-change-set-draft' : 'work-breakdown-draft']: [candidateRef] }, diagnostics: [],
    evidence: ['work-breakdown/contract-validation', 'work-breakdown/source-closure'].map(kind => ({ kind, subject: candidate.draftId ?? candidate.changeSetId, status: 'pass', artifact: candidateRef })) };
  let calls = 0;
  const registry = createModuleRegistry({ modules: [readJson('examples/modules/work-breakdown.module.json')],
    plugins: [{ definition: readJson('examples/plugins/' + invocation.plugin.id + '.plugin.json'), adapter: { async invoke() { calls++; return result; } } }], artifactContracts: workBreakdownRuntimeArtifactContracts() });
  const context = { artifacts: { load: fx.request.loadArtifact }, checkpoints: checkpoints() };
  await registry.execute(invocation, context);
  const checkpointReplay = await registry.verifyCheckpointedExecution(invocation, context);
  assert.equal(calls, 1);
  const applied = prior ? applyWorkBreakdownChangeSet({ baseline: prior.value, baselineRef: prior.ref, changeSet: candidate }) : candidate;
  const value = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'WorkBreakdownBaseline', baselineId: prior ? 'WBB-HOST-CHANGE' : 'WBB-HOST-INITIAL', version: prior ? '2.0.0' : '1.0.0', approvedCandidate: candidateRef,
    inputBindings: candidate.inputBindings, workItems: [...applied.workItems].sort((a,b) => a.id.localeCompare(b.id, 'en')), coverageDispositions: [...applied.coverageDispositions].sort((a,b) => (a.scopeKind + ':' + a.scopeRef).localeCompare(b.scopeKind + ':' + b.scopeRef, 'en')), approvalEvidence: [fx.evidence], sourceRefs: candidate.sourceRefs };
  const ref = fx.raw(value.baselineId, value, 'https://devrelay.dev/artifacts/work-breakdown-baseline/v1', 'application/vnd.devrelay.work-breakdown-baseline+json');
  const record = await prepareLocalWorkBreakdownGate({ checkpointReplay, baselineRef: ref, loadArtifact: fx.request.loadArtifact });
  const boundary = { kind: 'DesktopWorkBreakdownContextBoundary', state: prepared.state.ref, route, architectureState: prepared.state.architectureState, contractState: prepared.state.contractState, lifecycleComplete: false };
  return { ref, value, boundary, args: { ...fx.request, checkpointReplay, record, boundary } };
}

test('closed v2 work submission requires explicit predecessor and ACP', () => {
  const validate = compileArtifactSchema(readJson('contracts/desktop-work-context-submission-v2.schema.json'), [readJson('contracts/desktop-local-host-configuration.schema.json'), readJson('contracts/module-result.schema.json')]);
  const file = { path: 'fixture.json', ref: readJson('examples/invocations/work-breakdown-establish-001.invocation.json').inputs['capability-catalog'][0] };
  const submission = { kind: 'DesktopWorkContextSubmission', version: '2.0.0', activationDigest: file.ref.digest, createdAt: '2026-09-19T00:00:00Z', capabilityCatalog: file, repositoryContext: file, currentWorkBreakdownBaseline: file, approvedChangePackage: file, artifacts: [] };
  assert.equal(validate(submission), true);
  for (const key of ['currentWorkBreakdownBaseline', 'approvedChangePackage', 'version']) assert.equal(validate({ ...submission, [key]: undefined }), false);
  assert.equal(validate({ ...submission, operation: 'establish-breakdown' }), false);
});

test('existing work handoff derives decompose-change, retains evidence and recovers exact replacement', async t => {
  const fx = await activatedFixture(t);
  const { raw, request, fixture, evidence } = fx;
  const disposition = request.notApplicableCommit.disposition;
  fixture.store.addBytes(disposition.ref.artifactId, Buffer.from(disposition.bytesBase64, 'base64'));
  const capabilityCatalog = raw('CC-HOST-CHANGE', { apiVersion: 'devrelay.dev/v1alpha1', kind: 'CapabilityCatalog', catalogId: 'CC-HOST-CHANGE', version: '1.0.0', capabilities: [{ id: 'CAP-CODE', name: 'Code', type: 'code', description: 'Fixture', providerNeutral: true }] }, 'https://devrelay.dev/artifacts/capability-catalog/v1', 'application/vnd.devrelay.capability-catalog+json');
  const repo = readJson('examples/artifacts/repository-snapshot-001.json');
  const repositoryContext = raw('repository-initial', repo, 'https://devrelay.dev/artifacts/repository-snapshot/v1', 'application/vnd.devrelay.repository-snapshot+json');
  const registry = createModuleRegistry({ modules: [readJson('examples/modules/work-breakdown.module.json')], plugins: [], artifactContracts: workBreakdownRuntimeArtifactContracts() });
  const initialRequest = { ...request, capabilityCatalog, repositoryContext, registry };
  const initial = await prepareLocalWorkBreakdownRoute(initialRequest);
  assert.equal(initial.route.selection.operation, 'establish-breakdown');
  const first = await executeWork(fx, initial);
  const firstActivation = await activateLocalWorkBaseline(first.args);
  await assert.rejects(prepareLocalWorkBreakdownRoute(initialRequest), /predecessor/);
  const nextRepo = { ...repo, revision: '1'.repeat(40), treeDigest: 'sha256:' + 'd'.repeat(64) };
  const currentRepository = raw('repository-current', nextRepo, repositoryContext.schema, repositoryContext.mediaType);
  const lineage = { requirementsBaseline: fx.baseline.requirementsBaseline, projectOverviewBaseline: fx.baseline.projectOverviewBaseline, architectureBaseline: request.record.baseline.ref, contractDisposition: disposition.ref };
  const acp = { ...readJson('examples/artifacts/approved-change-package-auth-001.json'), packageId: 'ACP-HOST-CHANGE', preChange: lineage, target: lineage, currentWorkBreakdownBaseline: first.ref, currentRepository: { artifact: currentRepository, revision: nextRepo.revision, treeDigest: nextRepo.treeDigest }, approvedRequirementsChange: evidence, approvedArchitectureChange: evidence, approvedContractChangeDisposition: evidence, approvalEvidence: [evidence], traceabilityRefs: [],
    authorizedScope: { acceptanceCriteria: first.value.coverageDispositions.filter(e => e.scopeKind === 'acceptance-criterion').map(e => e.scopeRef), architecture: first.value.coverageDispositions.filter(e => e.scopeKind === 'architecture').map(e => e.scopeRef), contracts: [] } };
  const approvedChangePackage = raw(acp.packageId, acp, 'https://devrelay.dev/artifacts/approved-change-package/v1', 'application/vnd.devrelay.approved-change-package+json');
  const changeRequest = { ...initialRequest, repositoryContext: currentRepository, currentWorkBreakdownBaseline: first.ref, approvedChangePackage };
  for (const storage of [
    { ...request.storage, readTransitionJournal(id, options) { return id === localWorkBaselineHeadId(request.namespace) ? [] : request.storage.readTransitionJournal(id, options); } },
    { ...request.storage, readTransitionJournal(id, options) { const rows = request.storage.readTransitionJournal(id, options); return id === localWorkBaselineHeadId(request.namespace) ? [...rows, ...rows] : rows; } },
    { ...request.storage, getArtifact(ref) { return ref.artifactId === first.ref.artifactId ? Buffer.from('substituted predecessor') : request.storage.getArtifact(ref); } },
  ]) {
    await assert.rejects(prepareLocalWorkBreakdownRoute({ ...changeRequest, storage }), /publication|bytes|drift|digest/i);
  }
  const planned = await prepareLocalWorkBreakdownRoute(changeRequest);
  assert.equal(planned.route.selection.operation, 'decompose-change');
  assert.equal(JSON.parse(planned.state.bytes).state, 'baselined');
  await assert.rejects(prepareLocalWorkBreakdownRoute({ ...changeRequest, approvedChangePackage: undefined }), /both explicit/);
  for (const mutate of [v => v.preChange.architectureBaseline = { ...v.preChange.architectureBaseline, digest: 'sha256:' + 'a'.repeat(64) }, v => v.target.contractDisposition = first.ref, v => v.currentRepository.treeDigest = repo.treeDigest, v => v.authorizedScope.acceptanceCriteria.push('AC-UNKNOWN')]) {
    const bad = structuredClone(acp); bad.packageId = 'ACP-HOST-TAMPER'; mutate(bad);
    const badRef = raw('ACP-HOST-TAMPER', bad, approvedChangePackage.schema, approvedChangePackage.mediaType);
    await assert.rejects(prepareLocalWorkBreakdownRoute({ ...changeRequest, approvedChangePackage: badRef }), /lineage|repository|unknown scope/);
  }
  await assert.rejects(prepareLocalWorkBreakdownRoute({ ...changeRequest, loadArtifact: ref => ref.digest === evidence.digest ? Buffer.from('tampered') : request.loadArtifact(ref) }), /digest|match/i);
  const contextRef = raw('memory-context', 'Isolated memory fixture', 'https://example.test/context/v1', 'text/plain');
  const priorSnapshot = createSessionContextSnapshot({ projectId: 'activation-fixture', taskId: 'work-change', workspaceId: 'fixture', repositoryRevision: nextRepo.revision, createdAt: '2026-09-19T00:00:00Z', roadmapDisposition: 'RoadmapNotInitialized', bindings: [...['project-memory-baseline','current-synopsis','traceability-context','lifecycle-status','project-overview-projection'].map(role => ({ role, artifact: contextRef, artifactVersion: '1.0.0' })), { role: 'requirements-baseline', artifact: fx.baseline.requirementsBaseline, artifactVersion: '1.0.0' }, { role: 'project-overview', artifact: fx.baseline.projectOverviewBaseline, artifactVersion: '1.0.0' }] });
  const priorReceipt = await executeSessionBootstrap({ snapshot: priorSnapshot, artifactResolver: request.loadArtifact, expectedProjectId: priorSnapshot.projectId, expectedTaskId: priorSnapshot.taskId, expectedWorkspaceId: priorSnapshot.workspaceId, expectedRepositoryRevision: priorSnapshot.repositoryRevision });
  const contextRequest = { ...changeRequest, priorSnapshot, priorReceipt, createdAt: '2026-09-19T01:00:00Z' };
  const handoff = await createLocalWorkBreakdownContext(contextRequest);
  for (const ref of [first.ref, approvedChangePackage, currentRepository, evidence]) assert.ok(handoff.files.some(entry => canonicalJsonDigest(entry.ref) === canonicalJsonDigest(ref)));
  assert.deepEqual(await verifyLocalWorkBreakdownContext({ ...contextRequest, handoff }), handoff);
  const descriptor = { path: 'fixture.json', digest: contextRef.digest };
  const configuration = { apiVersion: 'devrelay.dev/v1alpha1', kind: 'DesktopLocalHostConfiguration', projectId: priorSnapshot.projectId, taskId: priorSnapshot.taskId, workspaceRoot: fx.directory, stateDirectory: 'published', graphId: 'fixture', sessionSnapshot: descriptor, memoryManifest: 'fixture.json', memorySessionState: descriptor, contractSet: 'architecture', modules: [descriptor], plugins: [descriptor], artifacts: [], grants: [] };
  const resolvePath = relative => join(fx.directory, relative);
  const materialized = materializeLocalWorkBreakdownContext({ configuration, handoff, resolvePath });
  assert.deepEqual(materializeLocalWorkBreakdownContext({ configuration, handoff, resolvePath, verifyOnly: true }), materialized);
  const second = await executeWork(fx, planned, first);
  const guard = { ...request, state: planned.state.ref, boundary: second.boundary };
  await assertLocalWorkInvocationCurrent(guard);
  const headId = localWorkBaselineHeadId(request.namespace);
  const before = request.storage.readRun(headId);
  const noGraph = { ...request.graph, prepare() { assert.fail('stale predecessor reached graph preparation'); } };
  await assert.rejects(activateLocalWorkBaseline({ ...second.args, graph: noGraph, storage: { ...request.storage, readRun(id) { const row = request.storage.readRun(id); return id === headId ? { ...row, state: { ...row.state, activationDigest: 'sha256:' + '0'.repeat(64) } } : row; } } }), /prior baseline/);
  assert.deepEqual(request.storage.readRun(headId), before);
  let reads = 0;
  await assert.rejects(activateLocalWorkBaseline({ ...second.args, graph: noGraph, storage: { ...request.storage, readRun(id) {
    const row = request.storage.readRun(id);
    if (id === headId && ++reads > 1) return { ...row, state: { ...row.state, activationDigest: 'sha256:' + '0'.repeat(64) } };
    return row;
  } } }), /prior baseline/, 'head must be rechecked under the lease');
  let merges = 0;
  await assert.rejects(activateLocalWorkBaseline({ ...second.args, graph: { ...request.graph, async mergePrepared(prepared) { merges++; await request.graph.mergePrepared(prepared); throw new Error('interrupted replacement publication'); } } }), /interrupted replacement/);
  const reopened = fx.reopen();
  for (const args of [request, first.args, second.args, initialRequest, changeRequest, contextRequest, guard]) Object.assign(args, reopened);
  const secondActivation = await activateLocalWorkBaseline(second.args);
  assert.equal(merges, 1);
  assert.deepEqual(await verifyLocalWorkBaselineActivation(second.args), secondActivation);
  assert.deepEqual(await verifyLocalWorkBaselineActivation(first.args), firstActivation);
  assert.deepEqual(await verifyLocalWorkBreakdownRoute({ ...changeRequest, expectedState: planned.state }), planned);
  assert.deepEqual(await verifyLocalWorkBreakdownContext({ ...contextRequest, handoff }), handoff);
  await assert.rejects(prepareLocalWorkBreakdownRoute(changeRequest), /predecessor/);
  await assert.rejects(assertLocalWorkInvocationCurrent(guard), /predecessor/);
});

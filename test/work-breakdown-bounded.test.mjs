import assert from "node:assert/strict";
import test from "node:test";
import { createInvocationFingerprint } from "../src/module-registry.mjs";
import { createBoundedFixture } from "./bounded-work-fixture.mjs";
import { validateBoundedWorkGateCandidate, validateBoundedWorkGatePromotion } from "../src/work-breakdown-bounded-gate.mjs";
import { validateBoundedWorkCandidate } from "../src/work-breakdown-bounded.mjs";
import { boundedWorkTraceabilityContributor, boundedWorkControlTraceabilityContributor, boundedWorkTraceabilityVocabulary } from "../src/work-breakdown-bounded-traceability.mjs";

test("bounded planning uses real Core checkpoints and exact Gate decision; preserves full prior work",async()=>{
  const f=await createBoundedFixture();
  const result=await f.execute();assert.equal(result.outcome,"decomposed");assert.equal(f.calls(),1);
  const replay=await f.replay();const promoted=await f.approve(replay);
  assert.equal(promoted.baseline.value.workItems.length,2);
  assert.deepEqual(promoted.baseline.value.workItems.find(i=>i.id==="WI-CODING"),f.base.workItem);
  assert.deepEqual(promoted.baseline.value.previousBaseline,f.base.heads.workBreakdownBaseline);
  assert.deepEqual(promoted.baseline.value.approvalEvidence.slice(0,-1),f.base.governance.workBreakdown.baseline.approvalEvidence);
  await f.execute();assert.equal(f.calls(),1,"checkpoint replay never reruns conversation authoring");
  const projected=await boundedWorkTraceabilityContributor.project({invocation:f.invocation,moduleResult:result,loadedInputs:replay.loadedInputs,loadedOutputs:replay.loadedOutputs});
  assert.equal(projected.nodes.filter(n=>n.kind==="work-item").length,2);
  assert(projected.edges.every(e=>e.target.authority==="candidate"));
  await assert.rejects(validateBoundedWorkGateCandidate({checkpointReplay:structuredClone(replay),evidenceResolver:f.resolve}),/in-process verified checkpoint replay/);
});

test("material scope categories and unknown reuse block before authoring",async()=>{
  for(const field of ["criteria","productIntent","interfaces","dependencies","platform","security","migrations","architecture"]){
    const f=await createBoundedFixture({mutateAssessment:a=>a.changes[field]="changed"});
    const result=await f.execute();assert.equal(result.outcome,"baseline_drift");assert.equal(result.diagnostics[0].code,"FULL_CHANGE_REQUIRED");assert.equal(f.calls(),0);
  }
  const f=await createBoundedFixture({mutateAssessment:a=>a.changes.architecture="unknown"});
  assert.equal((await f.execute()).diagnostics[0].code,"NEEDS_CLARIFICATION");assert.equal(f.calls(),0);
});

test("new criteria, changed card scope, extra authority and prior-item replacement are refused",async()=>{
  for(const mutation of [p=>p.workItem["acceptance-criterion-refs"].push("AC-NEW"),p=>p.changeCard.criterionIds.pop(),p=>p.approved=true,p=>p.workItem.id="WI-CODING",p=>p.changeCard.writePaths.push("outside.mjs")]){
    const f=await createBoundedFixture({mutateProposal:mutation});await assert.rejects(f.execute());
  }
});

test("Gate refuses substituted decision card/head, altered cumulative work and missing approval",async()=>{
  const f=await createBoundedFixture();await f.execute();const replay=await f.replay();const approved=await f.approve(replay);
  for(const field of ["changeCard","expectedHeadDigest"]){
    const value=structuredClone(approved.approval.value);
    if(field==="changeCard")value.changeCard.digest="sha256:"+"0".repeat(64);else value.expectedHeadDigest="sha256:"+"0".repeat(64);
    const changed=f.add(value,value.approvalId,{schema:approved.approval.ref.schema,mediaType:approved.approval.ref.mediaType});
    await assert.rejects(validateBoundedWorkGatePromotion({...approved.args,ownerApproval:value,ownerApprovalRef:changed.ref,ownerApprovalBytes:changed.bytes}));
  }
  await assert.rejects(validateBoundedWorkGatePromotion({...approved.args,ownerApproval:undefined,ownerApprovalBytes:undefined}));
  const candidate=structuredClone(approved.approved.candidate);candidate.coverageDispositions[0].workItemRefs=candidate.coverageDispositions[0].workItemRefs.filter(id=>id!=="WI-CODING");
  assert.throws(()=>validateBoundedWorkCandidate({candidate,loadedInputs:replay.loadedInputs}),/preserve complete/);
});


test("Gate rejects a resolver value substituted behind original card bytes",async()=>{
  const f=await createBoundedFixture();await f.execute();const replay=await f.replay();
  await assert.rejects(validateBoundedWorkGateCandidate({checkpointReplay:replay,evidenceResolver:ref=>{
    const loaded=f.resolve(ref);
    if(ref.schema.endsWith("/change-card/v1")) loaded.value={...loaded.value,writePaths:["unreviewed.mjs"]};
    return loaded;
  }}),/Resolver object differs/);
});


test("bounded items preserve stable deliverable/check/dependency/source uniqueness",async()=>{
  for(const mutate of [
    p=>p.workItem.deliverables.push({...p.workItem.deliverables[0],description:"different meaning"}),
    p=>p.workItem["verification-plan"].checks.push({...p.workItem["verification-plan"].checks[0],successCriteria:"different meaning"}),
    p=>p.workItem["source-refs"].push({...p.workItem["source-refs"][0]}),
  ]) {
    const f=await createBoundedFixture({mutateProposal:mutate});await assert.rejects(f.execute(),/Duplicate stable identity/);
  }
});


test("bounded graph owns versioned scopes alongside intact v1 history with checkpoint-before-merge and replay",async()=>{
  const {createTraceabilityGraphService,createInMemoryTraceabilityStore}=await import("../src/traceability-graph.mjs");
  const {requirementsBaselineObserverContributor}=await import("../src/requirements-traceability-contributor.mjs");
  const {architectureBaselineObserverContributor}=await import("../src/architecture-traceability-contributor.mjs");
  const {workBreakdownTraceabilityContributors}=await import("../src/work-breakdown-traceability-contributor.mjs");
  const f=await createBoundedFixture();
  const store=createInMemoryTraceabilityStore();
  const options={graphId:"bounded-real-graph",projectId:"synthetic-auth",store,contributors:[requirementsBaselineObserverContributor,architectureBaselineObserverContributor,...workBreakdownTraceabilityContributors,boundedWorkTraceabilityContributor,boundedWorkControlTraceabilityContributor]};
  const legacyService=createTraceabilityGraphService(options);
  let service=legacyService;
  const prior=f.base.governance.workBreakdown.checkpointReplay;
  const seeded=await service.mergePrepared(await service.prepare({graphId:service.graphId,projectId:service.projectId,baseGraph:service.captureBase(),invocation:prior.invocation,invocationFingerprint:createInvocationFingerprint(prior.invocation),moduleResult:prior.moduleResult,loadedInputs:prior.loadedInputs,loadedOutputs:prior.loadedOutputs,resolveArtifact:f.resolve}));
  const { TRACEABILITY_VOCABULARY_V1_8, validateTraceabilityGraphSnapshot, assertTraceabilityVocabularyTransition, traceabilityContentDigest }=await import("../src/traceability-artifact-validator.mjs");
  assert.equal(seeded.snapshot.vocabulary.version,"1.5.0");
  service=createTraceabilityGraphService({...options,vocabulary:boundedWorkTraceabilityVocabulary});
  const priorNodes=seeded.snapshot.nodes.filter(node=>node.scope==="work-breakdown/candidate");assert.equal(priorNodes.length,1);
  const events=[],trace=new Map();
  const graph={...service,async mergePrepared(prepared){events.push("merge");return service.mergePrepared(prepared);}};
  const runtime={...f.runtime,traceabilityGraph:graph,traceabilityCheckpoints:{async get(key){return trace.get(key);},async putIfAbsent(key,value){events.push("checkpoint:"+value.kind);if(!trace.has(key)) trace.set(key,structuredClone(value));return structuredClone(trace.get(key));}}};
  const record=await f.registry.executeWithTraceability(f.invocation,runtime);
  assert.equal(record.kind,"ModuleExecutionRecord");assert.equal(record.moduleResult.outcome,"decomposed");
  assert(events.indexOf("checkpoint:ModuleTraceabilityCheckpoint")<events.indexOf("merge"));
  const applied=await service.assertApplied(record.traceabilityUpdateRef);
  const snapshot=store.load(applied.resultGraphRef).value;
  assert.deepEqual(snapshot.vocabulary,boundedWorkTraceabilityVocabulary);
  assert.deepEqual(snapshot.parentGraph,seeded.snapshotRef);
  assert.deepEqual(snapshot.appliedUpdates.filter(ref=>ref.digest!==record.traceabilityUpdateRef.digest),seeded.snapshot.appliedUpdates);
  for(const old of seeded.snapshot.nodes) assert.deepEqual(snapshot.nodes.find(node=>node.nodeId===old.nodeId),old);
  for(const old of seeded.snapshot.edges) assert.deepEqual(snapshot.edges.find(edge=>edge.edgeId===old.edgeId),old);
  assert.throws(()=>validateTraceabilityGraphSnapshot({...snapshot,vocabulary:TRACEABILITY_VOCABULARY_V1_8}),error=>error.code==="TG_INVALID_EDGE_AUTHORITY");
  assert.throws(()=>assertTraceabilityVocabularyTransition(boundedWorkTraceabilityVocabulary,TRACEABILITY_VOCABULARY_V1_8),error=>error.code==="TG_VOCABULARY_DOWNGRADE");
  assert.deepEqual(snapshot.nodes.filter(node=>node.scope==="work-breakdown/candidate"),priorNodes);
  assert.equal(snapshot.nodes.filter(node=>node.kind==="work-item"&&node.scope==="work-breakdown/bounded-candidate").length,2);
  const wrongOwner=structuredClone(snapshot), edge=wrongOwner.edges.find(e=>e.scope==="work-breakdown/bounded-candidate");
  edge.contributor.version="9.9.9";edge.contentDigest=traceabilityContentDigest(edge);
  assert.throws(()=>validateTraceabilityGraphSnapshot(wrongOwner),error=>error.code==="TG_INVALID_EDGE_AUTHORITY");
  assert.equal(f.calls(),1);
  const replay=await f.registry.executeWithTraceability(f.invocation,runtime);assert.deepEqual(replay,record);assert.equal(f.calls(),1);
});

test("Gate rejects supplied baseline and original decision objects that disagree with exact bytes",async()=>{
  const f=await createBoundedFixture();await f.execute();const approved=await f.approve(await f.replay());
  const baseline=structuredClone(approved.args.baseline);baseline.version="99.0.0";
  await assert.rejects(validateBoundedWorkGatePromotion({...approved.args,baseline}),/differs from its raw document/);
  const ownerApproval=structuredClone(approved.args.ownerApproval);ownerApproval.originalMessage.text="Substituted decision";
  await assert.rejects(validateBoundedWorkGatePromotion({...approved.args,ownerApproval}),/differs from its raw document/);
});

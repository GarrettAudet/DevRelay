import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createRunLedgerCheckpoint } from "../src/lifecycle-run-report-ledger.mjs";
import { ingestRunHostObservation } from "../src/lifecycle-run-report-observations.mjs";
import { projectLifecycleRunSnapshot } from "../src/lifecycle-run-report-snapshot.mjs";
import { TRACEABILITY_VOCABULARY } from "../src/traceability-artifact-validator.mjs";
import { TRACEABILITY_EDGE_KINDS, TRACEABILITY_NODE_KINDS } from "../src/traceability-artifact-validator.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const d=c=>`sha256:${c.repeat(64)}`;
const ref=c=>({artifactId:`artifact-${c}`,digest:d(c)});
function fact(id,event="completed",kind="module",component=id){const sourceCharacter="abcdef"[id.charCodeAt(0)%6];const body={factId:`fact-${id}`,runId:"run-1",component:{kind,id:component,version:"1.0.0"},event,source:{kind:"module-execution-record",artifact:ref(sourceCharacter)},authority:"trusted-workflow-record"};return{apiVersion:"devrelay.dev/v1alpha1",kind:"RunWorkflowFact",...body,factDigest:canonicalJsonDigest(body)};}
function graphFixture(){const snapshot={apiVersion:"devrelay.dev/v1alpha1",kind:"TraceabilityGraphSnapshot",graphId:"graph/test",projectId:"test",revision:0,horizon:"requirements",vocabulary:TRACEABILITY_VOCABULARY,parentGraph:null,lastAppliedUpdate:null,appliedUpdates:[],nodes:[],edges:[]};return{ref:{artifactId:"graph-test-r0",digest:canonicalJsonDigest(snapshot)},snapshot};}
function observation({id="duration",runId="run-1",name="duration",value=10,character="d"}={}){return ingestRunHostObservation({observationId:id,runId,metric:{name,availability:"measured",value,unit:"milliseconds",provenance:{kind:"host-observation",artifact:ref(character)}}});}
const adapter=(id,maturity,character)=>({adapter:{id,version:"1.0.0",configurationDigest:d(character)},maturity,comparability:{disposition:"unavailable",reason:`${maturity} unavailable`}});
async function projectedGraph({id,horizon,authority="candidate",nodes,edges}){const value={kind:"fixture"};const bytes=Buffer.from(canonicalJson(value));const artifact={ref:{artifactId:`source-${id}`,schema:"https://example.test/fixture/v1",mediaType:"application/json",digest:canonicalJsonDigest(value),uri:`memory://fixture/${id}`},bytes,value};const moduleId=`fixture-${id}`,scope=`fixture/${id}`;const service=createTraceabilityGraphService({graphId:`graph/${id}`,projectId:"test",store:createInMemoryTraceabilityStore(),contributors:[{metadata:{id:`test.${id}`,version:"1.0.0"},match:{moduleId},scope,authority,ownership:{scope,authority,nodeKinds:TRACEABILITY_NODE_KINDS.filter(k=>k!=="artifact-reference"),edgeKinds:[...TRACEABILITY_EDGE_KINDS]},async project(){const sourceLocators=[{artifact:{artifactId:artifact.ref.artifactId,digest:artifact.ref.digest},jsonPointer:"",entityDigest:canonicalJsonDigest(value)}];return{horizon,nodes:nodes.map(n=>({...n,sourceLocators})),edges:edges.map(e=>({...e,sourceLocators}))};}}]});const invocation={apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleInvocation",invocationId:`invocation-${id}`,runId:`run-${id}`,nodeId:`node-${id}`,module:{id:moduleId,version:"1.0.0",operation:"project"},inputs:{},options:{}};const execution={invocation,invocationFingerprint:canonicalJsonDigest({id,invocation}),moduleResult:{apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleResult",invocationId:invocation.invocationId,status:"completed",outcome:"completed",outputs:{primary:[artifact.ref]},evidence:[],diagnostics:[]},loadedInputs:{},loadedOutputs:{primary:[artifact]}};const prepared=await service.prepare({baseGraph:service.captureBase(),...execution});const merged=await service.mergePrepared(prepared);return{ref:merged.snapshotRef,snapshot:merged.snapshot};}
const edge=(kind,sourceKind,sourceId,targetKind,targetId)=>({kind,source:{kind:sourceKind,stableId:sourceId},target:{kind:targetKind,stableId:targetId},rationale:`${sourceId} ${kind} ${targetId}`});

test("serial, skipped, failed, resumed, parallel, and sourced stage performance project dynamically",()=>{
 const facts=[fact("a","started","module","alpha"),fact("b","completed","module","beta"),fact("c","skipped","gate","gate-x"),fact("d","failed","module","delta"),fact("e","resumed","module","alpha"),fact("f","completed","module","alpha")];
 const detailMetric=observation().metric;
 const snapshot=projectLifecycleRunSnapshot({snapshotId:"s",ledgerCheckpoint:createRunLedgerCheckpoint({runId:"run-1",facts}),traceabilityGraph:graphFixture(),observations:[observation()],stageDetails:{alpha:{operation:"execute",importantArtifacts:[ref("e")],performance:[detailMetric],sourceFacts:[ref("f")]}}});
 assert.deepEqual(snapshot.stages.map(s=>s.componentId),["alpha","beta","gate-x","delta"]);assert.equal(snapshot.stages[0].rework.replayed,true);assert.deepEqual(snapshot.stages[0].performance,[detailMetric]);assert.ok(snapshot.stages[0].sourceFacts.some(value=>value.artifactId==="artifact-f"));assert.equal(snapshot.stages[2].status,"skipped");assert.equal(snapshot.stages[3].status,"failed");
});

test("graph contract and exact reference digest reject malformed or substituted state",()=>{
 const checkpoint=createRunLedgerCheckpoint({runId:"run-1",facts:[fact("a")]});const graph=graphFixture();
 assert.doesNotThrow(()=>projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:graph}));
 const substituted=structuredClone(graph);substituted.snapshot.projectId="substituted";
 assert.throws(()=>projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:substituted}),/does not match its exact graph reference digest/);
 assert.throws(()=>projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:{ref:graph.ref,snapshot:{nodes:[],edges:[]}}}),/invalid TraceabilityGraphSnapshot/);
});

test("unbound stage details and cross-run observations fail closed",()=>{
 const checkpoint=createRunLedgerCheckpoint({runId:"run-1",facts:[fact("a","completed","module","one")]});
 assert.throws(()=>projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:graphFixture(),stageDetails:{one:{operation:"forged"}}}),/requires digest-bound sourceFacts/);
 assert.throws(()=>projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:graphFixture(),observations:[observation({runId:"run-2"})]}),/different run/);
});

test("tied adapter and metric sort keys remain byte-identical under reordered delivery",()=>{
 const checkpoint=createRunLedgerCheckpoint({runId:"run-1",facts:[fact("a","completed","module","one"),fact("b","approved","gate","two")]});
 const observations=[observation({id:"z",name:"duration",value:20,character:"e"}),observation({id:"a",name:"duration",value:10,character:"d"})];
 const assessments=[adapter("same","fixture-conformant","a"),adapter("same","contract-defined","a")];
 const input={snapshotId:"stable",ledgerCheckpoint:checkpoint,traceabilityGraph:graphFixture(),stageDetails:{one:{importantArtifacts:[ref("e"),ref("d")],sourceFacts:[ref("c")]}}};
 const first=projectLifecycleRunSnapshot({...input,observations,adapterAssessments:assessments});const second=projectLifecycleRunSnapshot({...input,observations:[...observations].reverse(),adapterAssessments:[...assessments].reverse(),stageDetails:{one:{importantArtifacts:[ref("d"),ref("e")],sourceFacts:[ref("c")]}}});
 assert.equal(canonicalJson(first),canonicalJson(second));
});

test("arbitrary component count and repeating frontier introduce no product identifiers",()=>{
 const facts=Array.from({length:11},(_,i)=>fact(String.fromCharCode(97+i),"completed",i%3===0?"core-service":"module",`custom-${i}`));const checkpoint=createRunLedgerCheckpoint({runId:"run-1",facts});const frontier={readyWorkItemIds:["WI-Z","WI-A"]};
 const first=projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:graphFixture(),readyFrontier:frontier});const second=projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:graphFixture(),readyFrontier:frontier});
 assert.equal(first.stages.length,11);assert.equal(canonicalJson(first),canonicalJson(second));assert.equal(first.nextAction.description,"Ready work: WI-A, WI-Z");assert.doesNotMatch(canonicalJson(first),/RequirementsGathering|ArchitectureDesign|WorkBreakdown/);
});

test("released graph diagnostics and an exact readable trace path remain visible",async()=>{
 const checkpoint=createRunLedgerCheckpoint({runId:"run-1",facts:[fact("a")]});
 const orphan=await projectedGraph({id:"orphan",horizon:"requirements",nodes:[{kind:"business-objective",stableId:"BO-ORPHAN",label:"Orphan objective"}],edges:[]});
 const unscoped=await projectedGraph({id:"unscoped",horizon:"implementation",nodes:[{kind:"code-change",stableId:"CODE-ORPHAN",label:"Orphan code"}],edges:[]});
 const chainNodes=[{kind:"business-objective",stableId:"BO-1",label:"Objective"},{kind:"capability",stableId:"CAP-1",label:"Capability"},{kind:"user-story",stableId:"US-1",label:"Story"},{kind:"acceptance-criterion",stableId:"AC-1",label:"Criterion"},{kind:"architecture-element",stableId:"ARCH-1",label:"Architecture"}];
 const chainEdges=[edge("realized-by","business-objective","BO-1","capability","CAP-1"),edge("specified-by","capability","CAP-1","user-story","US-1"),edge("accepted-by","user-story","US-1","acceptance-criterion","AC-1"),edge("designed-by","user-story","US-1","architecture-element","ARCH-1")];
 const missing=await projectedGraph({id:"missing",horizon:"verification",authority:"approved",nodes:chainNodes,edges:chainEdges});
 const orphanSnapshot=projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:orphan});const unscopedSnapshot=projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:unscoped});const missingSnapshot=projectLifecycleRunSnapshot({ledgerCheckpoint:checkpoint,traceabilityGraph:missing});
 assert.ok(orphanSnapshot.diagnostics.some(({code})=>code==="TG_ORPHAN_REQUIREMENT"));assert.ok(unscopedSnapshot.diagnostics.some(({code})=>code==="TG_UNSCOPED_WORK"));assert.ok(missingSnapshot.diagnostics.some(({code})=>code==="TG_MISSING_EVIDENCE"));
 assert.equal(missingSnapshot.traceabilityPaths.length,4);assert.ok(missingSnapshot.traceabilityPaths.every(path=>canonicalJson(path.graphEvidence)===canonicalJson({artifactId:missing.ref.artifactId,digest:missing.ref.digest})));
 const entities=new Map(missing.snapshot.nodes.map(node=>[`node:${node.kind}:${node.stableId}`,node.contentDigest]));
 const actualSegments=missingSnapshot.traceabilityPaths.map(path=>`${path.from.artifactId}->${path.to.artifactId}`).sort();
 assert.deepEqual(actualSegments,["node:business-objective:BO-1->node:capability:CAP-1","node:capability:CAP-1->node:user-story:US-1","node:user-story:US-1->node:acceptance-criterion:AC-1","node:user-story:US-1->node:architecture-element:ARCH-1"].sort());
 assert.ok(missingSnapshot.traceabilityPaths.every(path=>path.from.digest===entities.get(path.from.artifactId)&&path.to.digest===entities.get(path.to.artifactId)));
 assert.deepEqual(new Set(missingSnapshot.importantArtifacts.map(value=>value.artifactId)),new Set(["source-missing"]));
});

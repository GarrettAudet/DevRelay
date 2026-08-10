import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../../../src/content-digest.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService, TraceabilityConflictError } from "../../../../../src/traceability-graph.mjs";

const root = resolve(new URL("../../../../../", import.meta.url).pathname.slice(1));
const candidate = await import(pathToFileURL(resolve(root,"src/lifecycle-run-report-traceability-contributor.mjs")));
const ids = candidate.LIFECYCLE_RUN_REPORT_COMPLETION_WORK_ITEMS;
const attempts = {
  "WI-RUN-CONTRACTS":"003", "WI-RUN-CONTENT-POLICY":"002", "WI-RUN-LEDGER":"002",
  "WI-RUN-OBSERVATIONS":"001", "WI-RUN-FRONTIER":"001", "WI-RUN-SNAPSHOT":"005",
  "WI-RUN-MARKDOWN":"002-correction-001",
};
const taskAttempts = {...attempts,"WI-RUN-MARKDOWN":"002"};
const paths = (id) => ({
  task:`dogfood/lifecycle-run-report/execution/task-contracts/${id}.attempt-${taskAttempts[id]}.task.json`,
  handoff:`dogfood/lifecycle-run-report/execution/task-contracts/attempts/${id}.attempt-${taskAttempts[id]}.handoff.raw.json`,
  approval:`dogfood/lifecycle-run-report/execution/verification/${id}/attempt-${attempts[id]}/gate-approval.json`,
  integration:`dogfood/lifecycle-run-report/execution/host-integration/${id}.receipt.json`,
  completion:`dogfood/lifecycle-run-report/execution/integrated-completion-facts/${id}.json`,
});
const seal = (body,field) => ({...body,[field]:canonicalJsonDigest(body)});
const ref = (x) => ({artifactId:x.ref.artifactId,digest:x.ref.digest});
function load(relativePath, canonical=false) {
  const raw=readFileSync(resolve(root,relativePath)); const value=JSON.parse(raw);
  const bytes=canonical ? Buffer.from(canonicalJson(value)) : raw;
  const artifactId=value.contractId??value.executionId??value.approvalId??value.receiptId??value.completionId;
  return {ref:{artifactId,digest:sha256Digest(bytes),schema:"https://devrelay.dev/verifier/source/v1",mediaType:"application/json",uri:`file:${relativePath}`},value,bytes};
}
function history(canonical=false) {
  const artifacts=[]; const closures=[]; const completionFacts=[];
  for (const id of ids) {
    const p=paths(id); const task=load(p.task,canonical), handoff=load(p.handoff,canonical), approval=load(p.approval,canonical), integration=load(p.integration,canonical), completion=load(p.completion,canonical);
    const body={closureId:`CLOSURE-${id}`,workItemId:id,taskContract:ref(task),handoff:ref(handoff),verificationApproval:ref(approval),hostIntegration:ref(integration),completionFact:ref(completion),changeSetId:completion.value.changeSet.artifactId,adapterMaturity:integration.value.adapter.maturity};
    const closureValue=candidate.createCanonicalChangeIntegrationClosure(body); const closureBytes=Buffer.from(canonicalJson(closureValue));
    const closure={ref:{artifactId:body.closureId,digest:sha256Digest(closureBytes),schema:"https://devrelay.dev/verifier/closure/v1",mediaType:"application/json",uri:`memory:${body.closureId}`},value:closureValue,bytes:closureBytes};
    artifacts.push(task,handoff,approval,integration,completion,closure); closures.push(ref(closure)); completionFacts.push(ref(completion));
  }
  const inputBody={inputId:"TRACE-REAL-001",runId:"RUN-LIFECYCLE-REPORT",baseGraph:{artifactId:"BASE",digest:`sha256:${"0".repeat(64)}`},completionFacts,canonicalClosures:closures,authority:"trusted-core-input"};
  const value=candidate.createLifecycleRunReportTraceabilityInput(inputBody), bytes=Buffer.from(canonicalJson(value));
  artifacts.push({ref:{artifactId:value.inputId,digest:sha256Digest(bytes),schema:"https://devrelay.dev/verifier/input/v1",mediaType:"application/json",uri:"memory:TRACE-REAL-001"},value,bytes});
  return artifacts;
}
const context = (artifacts,module={id:"lifecycle-run-report-reconciliation",version:"0.1.0",operation:"reconcile"}) => ({invocation:{module},loadedInputs:{artifacts}});
const clone = (x) => structuredClone(x);
const mutateRef = (artifacts,kind,fn) => { const copy=clone(artifacts); fn(copy.find(x=>x.value.kind===kind)); return copy; };

test("exact persisted seven-history bytes retain formatting and trailing LF while semantic equality is verified",()=>{
  const real=history(false); assert.equal(ids.length,7);
  for(const entry of real) assert.equal(sha256Digest(entry.bytes),entry.ref.digest);
  assert.ok(real.some(entry=>entry.bytes.at(-1)===10));
  assert.ok(real.some(entry=>canonicalJson(entry.value)!==entry.bytes.toString("utf8")));
  assert.equal(candidate.resolveLifecycleRunReportCanonicalClosure(context(real)).closures.length,7);
});

test("canonicalized projections of the real values exercise all seven closure members",()=>{
  const result=candidate.resolveLifecycleRunReportCanonicalClosure(context(history(true)));
  assert.deepEqual(result.closures.map(x=>x.closureLoaded.value.workItemId).sort(),[...ids].sort());
  assert.deepEqual([...new Set(result.closures.map(x=>x.integration.value.adapter.maturity))],["fixture-conformant"]);
});

test("absent, duplicate, corrupt, and substituted pinned sources fail closed before normalization",()=>{
  const real=history(true); const handoff=real.find(x=>x.value.kind==="BootstrapWorkItemHandoff");
  assert.throws(()=>candidate.resolveLifecycleRunReportCanonicalClosure(context(real.filter(x=>x!==handoff))),/missing or duplicated/);
  assert.throws(()=>candidate.resolveLifecycleRunReportCanonicalClosure(context([...real,handoff])),/duplicate loaded source/);
  const corrupt=clone(real); corrupt.find(x=>x.value.kind==="BootstrapWorkExecutionTaskContract").bytes=Buffer.from("{}");
  assert.throws(()=>candidate.resolveLifecycleRunReportCanonicalClosure(context(corrupt)),/raw bytes do not match/);
  const substituted=clone(real); substituted.find(x=>x.value.kind==="BootstrapWorkItemHandoff").ref.artifactId="SUBSTITUTED";
  assert.throws(()=>candidate.resolveLifecycleRunReportCanonicalClosure(context(substituted)),/missing or duplicated/);
});

test("lineage disagreement and maturity drift fail closed",()=>{
  const lineage=mutateRef(history(true),"IntegratedCompletionFact",x=>{x.value.integration.artifactId="OTHER";x.bytes=Buffer.from(canonicalJson(x.value));x.ref.digest=sha256Digest(x.bytes)});
  assert.throws(()=>candidate.resolveLifecycleRunReportCanonicalClosure(context(lineage)),/missing or duplicated|completionDigest|lineage/);
  const maturity=mutateRef(history(true),"BootstrapWorkItemHostIntegrationReceipt",x=>{x.value.adapter.maturity="live-conformant";x.bytes=Buffer.from(canonicalJson(x.value));x.ref.digest=sha256Digest(x.bytes)});
  assert.throws(()=>candidate.resolveLifecycleRunReportCanonicalClosure(context(maturity)),/missing or duplicated|maturity/);
});

test("unordered real-value input produces deterministic projection",async()=>{
  const real=history(true), contributor=candidate.createLifecycleRunReportTraceabilityContributor();
  const a=await contributor.project(context(real)); const b=await contributor.project(context([...real].reverse()));
  assert.equal(canonicalJson(a),canonicalJson(b)); assert.equal(a.nodes.length,21); assert.equal(a.edges.length,21);
});

test("contributor match is exact and graph/store/direct-operation surfaces are absent",async()=>{
  const contributor=candidate.createLifecycleRunReportTraceabilityContributor(), real=history(true);
  assert.equal(contributor.match(context(real)),true); assert.equal(contributor.match(context(real,{id:"other",version:"0.1.0",operation:"reconcile"})),false);
  await assert.rejects(contributor.project(context(real,{id:"other",version:"0.1.0",operation:"reconcile"})),/nonmatching/);
  for(const name of ["graph","store","merge","prepare","commit","operations"]) assert.equal(name in contributor,false);
});

test("node and relationship ownership are exact allowlists",async()=>{
  const contributor=candidate.createLifecycleRunReportTraceabilityContributor(); const projection=await contributor.project(context(history(true)));
  assert.deepEqual([...contributor.ownership.nodeKinds].sort(),["change-set","integrated-change-record","verification-evidence"]);
  assert.deepEqual([...contributor.ownership.edgeKinds].sort(),["integrated-as","produces","verified-by"]);
  assert.deepEqual([...new Set(projection.nodes.map(x=>x.kind))].sort(),[...contributor.ownership.nodeKinds].sort());
  assert.deepEqual([...new Set(projection.edges.map(x=>x.kind))].sort(),[...contributor.ownership.edgeKinds].sort());
});

test("Core preparation is immutable and precedes merge; exact merge retry is idempotent",async()=>{
  const real=history(true), contributor=candidate.createLifecycleRunReportTraceabilityContributor();
  const seedLocator={artifact:ref(real.at(-1)),jsonPointer:"",entityDigest:canonicalJsonDigest(real.at(-1).value)};
  const seed={metadata:{id:"seed",version:"1.0.0"},authority:"candidate",scope:"work-breakdown/candidate",ownership:{authority:"candidate",scope:"work-breakdown/candidate",nodeKinds:["work-item"],edgeKinds:[]},match:{moduleId:"seed"},async project(){return {horizon:"implementation",nodes:ids.map(stableId=>({kind:"work-item",stableId,label:stableId,attributes:{},sourceLocators:[seedLocator]})),edges:[]}}};
  const service=createTraceabilityGraphService({graphId:"verified-real",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[seed,contributor]});
  const result=(id,module)=>({apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleResult",invocationId:id,module,status:"completed",outcome:"completed",outputs:{},evidence:[]});
  const seedModule={id:"seed",version:"0.1.0",operation:"seed"}; const seedRun={invocation:{invocationId:"INV-SEED",module:seedModule},invocationFingerprint:`sha256:${"5".repeat(64)}`,moduleResult:result("INV-SEED",seedModule),loadedInputs:{source:real.at(-1)}};
  await service.mergePrepared(await service.prepare({baseGraph:service.captureBase(),...seedRun}));
  const module={id:"lifecycle-run-report-reconciliation",version:"0.1.0",operation:"reconcile"}; const run={invocation:{invocationId:"INV-REAL",module},invocationFingerprint:`sha256:${"6".repeat(64)}`,moduleResult:result("INV-REAL",module),loadedInputs:{artifacts:real}};
  const prepared=await service.prepare({baseGraph:service.captureBase(),...run}); assert.equal(service.captureBase().revision,1);
  const validated=await service.validatePrepared({checkpoint:clone(prepared.checkpoint),...run});
  const merged=await service.mergePrepared(validated), replayed=await service.mergePrepared(validated);
  assert.equal(merged.disposition,"merged"); assert.equal(replayed.receiptRef.digest,merged.receiptRef.digest); assert.equal(service.captureBase().revision,2);
});

test("Core atomic conflict leaves the losing overlapping update unapplied",async()=>{
  const sourceValue={kind:"VerifierConflictSource"}, sourceBytes=Buffer.from(canonicalJson(sourceValue));
  const source={ref:{artifactId:"SRC",digest:sha256Digest(sourceBytes),schema:"https://devrelay.dev/verifier/conflict/v1",mediaType:"application/json",uri:"memory:SRC"},value:sourceValue,bytes:sourceBytes};
  const loc={artifact:ref(source),jsonPointer:"",entityDigest:canonicalJsonDigest(sourceValue)};
  const overlap={metadata:{id:"overlap",version:"1.0.0"},authority:"candidate",scope:"conflict/candidate",ownership:{authority:"candidate",scope:"conflict/candidate",nodeKinds:["business-objective"],edgeKinds:[]},match:()=>true,async project(ctx){const label=ctx.invocation.module.id.toUpperCase();return {horizon:"requirements",nodes:[{kind:"business-objective",stableId:"SAME",label,attributes:{},sourceLocators:[loc]}],edges:[]}}};
  const store=createInMemoryTraceabilityStore(), service=createTraceabilityGraphService({graphId:"conflict",projectId:"devrelay",store,contributors:[overlap]});
  const exec=(id)=>{const module={id,version:"0.1.0",operation:id};return {invocation:{invocationId:`INV-${id}`,module},invocationFingerprint:`sha256:${id.repeat(64)}`,moduleResult:{apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleResult",invocationId:`INV-${id}`,module,status:"completed",outcome:id,outputs:{},evidence:[]},loadedInputs:{source}}};
  const base=service.captureBase(), a=await service.prepare({baseGraph:base,...exec("a")}), b=await service.prepare({baseGraph:base,...exec("b")}); await service.mergePrepared(a);
  await assert.rejects(service.mergePrepared(b),TraceabilityConflictError); assert.equal(service.captureBase().revision,1);
});

test("all five new artifact kinds, creation APIs, released exports, diagnostics, update and Core-only merge proof validate",async()=>{
  const contributor=candidate.createLifecycleRunReportTraceabilityContributor();
  for(const name of ["graph","store","merge","prepare","commit","operations"]) assert.equal(name in contributor,false);
  const publicApi=candidate, validatorApi=await import(pathToFileURL(resolve(root,"src/lifecycle-run-report-artifact-validator.mjs"))), indexSource=readFileSync(resolve(root,"src/index.mjs"),"utf8");
  for(const name of ["createLifecycleRunReportTraceabilityInput","createCanonicalChangeIntegrationClosure","createLifecycleRunReportTraceabilityUpdateSet","createLifecycleRunReportTraceabilityDiagnostics","createLifecycleRunReportTraceabilityMergeProof","createLifecycleRunReportTraceabilityContributor","resolveLifecycleRunReportCanonicalClosure"]) { assert.equal(typeof publicApi[name],"function"); assert.match(indexSource,new RegExp(`\\b${name}\\b`)); }
  const real=history(true), input=real.find(x=>x.value.kind==="LifecycleRunReportTraceabilityInput").value, closure=real.find(x=>x.value.kind==="CanonicalChangeIntegrationClosure").value;
  const contributorIdentity={id:contributor.metadata.id,version:contributor.metadata.version,contractDigest:canonicalJsonDigest({id:contributor.metadata.id,version:contributor.metadata.version,ownership:{authority:contributor.authority,scope:contributor.scope,nodeKinds:[...contributor.ownership.nodeKinds].sort(),edgeKinds:[...contributor.ownership.edgeKinds].sort()}})};
  const baseGraph={artifact:{artifactId:"GRAPH-R1",digest:`sha256:${"1".repeat(64)}`},revision:1}, resultGraph={artifact:{artifactId:"GRAPH-R2",digest:`sha256:${"2".repeat(64)}`},revision:2}, update={artifactId:"UPDATE-ATTEMPT-002",digest:`sha256:${"3".repeat(64)}`};
  const updateSet=publicApi.createLifecycleRunReportTraceabilityUpdateSet({executionId:"WE-RUN-TRACEABILITY-ATTEMPT-002",contributor:contributorIdentity,baseGraph,update});
  const updateSetRef={artifactId:updateSet.updateSetId,digest:updateSet.updateSetDigest};
  const diagnostics=publicApi.createLifecycleRunReportTraceabilityDiagnostics({executionId:"WE-RUN-TRACEABILITY-ATTEMPT-002",updateSet:updateSetRef,dispositions:[{artifact:update,disposition:"accepted",reason:"Core validated the standardized update."}],orphanObservations:[]});
  const receipt={artifactId:"ATOMIC-RECEIPT-002",digest:`sha256:${"4".repeat(64)}`}, checkpoint={artifactId:"CHECKPOINT-002",digest:`sha256:${"5".repeat(64)}`};
  const proof=publicApi.createLifecycleRunReportTraceabilityMergeProof({executionId:"WE-RUN-TRACEABILITY-ATTEMPT-002",updateSet:updateSetRef,checkpoint,baseGraph,resultGraph,updateDigest:update.digest,atomicReceipt:receipt,replayReceipt:receipt});
  for(const value of [input,closure,updateSet,diagnostics,proof]) assert.equal(validatorApi.validateLifecycleRunReportArtifact(value),value);
  assert.equal(proof.idempotentReplay,true); assert.equal(proof.conflictSafety,"base-graph-cas"); assert.equal(proof.checkpointDigest,checkpoint.digest);
  const drift={...proof,resultGraph:{...resultGraph,revision:3}}; const body=Object.fromEntries(Object.entries(drift).filter(([key])=>!["apiVersion","kind","proofDigest"].includes(key))); drift.proofDigest=canonicalJsonDigest(body);
  assert.throws(()=>validatorApi.validateLifecycleRunReportArtifact(drift),/atomic successor/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { validateLifecycleRunReportArtifact } from "../src/lifecycle-run-report-artifact-validator.mjs";
import { createCanonicalChangeIntegrationClosure, createLifecycleRunReportTraceabilityContributor, createLifecycleRunReportTraceabilityDiagnostics, createLifecycleRunReportTraceabilityInput, createLifecycleRunReportTraceabilityMergeProof, createLifecycleRunReportTraceabilityUpdateSet, LIFECYCLE_RUN_REPORT_COMPLETION_WORK_ITEMS, resolveLifecycleRunReportCanonicalClosure } from "../src/lifecycle-run-report-traceability-contributor.mjs";

const seal = (body, field) => ({ ...body, [field]: canonicalJsonDigest(body) });
const sealLifecycle = (body, field) => ({ ...body, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key])=>!["apiVersion","kind"].includes(key)))) });
const loaded = (artifactId, value) => { const bytes=Buffer.from(canonicalJson(value)); return {ref:{artifactId,schema:`https://example.test/${artifactId}/v1`,mediaType:"application/json",digest:sha256Digest(bytes),uri:`memory:///${artifactId}.json`},value,bytes}; };
const artifactRef = (entry) => ({artifactId:entry.ref.artifactId,digest:entry.ref.digest});

function fixtures() {
  const artifacts=[]; const completionFacts=[]; const canonicalClosures=[];
  for (const [index,workItemId] of LIFECYCLE_RUN_REPORT_COMPLETION_WORK_ITEMS.entries()) {
    const suffix=String(index+1); const approvalId=`APPROVAL-${suffix}`; const receiptId=`INTEGRATION-${suffix}`; const changeSetId=`CHANGESET-${suffix}`;
    const task=loaded(`TASK-${suffix}`,{kind:"BootstrapWorkExecutionTaskContract",workItemId});
    const handoff=loaded(`HANDOFF-${suffix}`,{kind:"BootstrapWorkItemHandoff",workItemId,outcome:"pass"});
    const approval=loaded(approvalId,{kind:"WorkItemVerificationGateApproval",approvalId});
    const integration=loaded(receiptId,{kind:"BootstrapWorkItemHostIntegrationReceipt",receiptId,workItemId,authoritativeIntegratedCompletionFactCreated:true,adapter:{id:"bootstrap-exact-byte-host",version:"1.0.0",maturity:"fixture-conformant"}});
    const completionBody={apiVersion:"devrelay.dev/v1alpha1",kind:"IntegratedCompletionFact",completionId:`COMPLETION-${suffix}`,workItem:{artifactId:workItemId,digest:`sha256:${"1".repeat(64)}`},changeSet:{artifactId:changeSetId,digest:`sha256:${"2".repeat(64)}`},verification:{artifactId:approvalId,digest:`sha256:${"3".repeat(64)}`},integration:{artifactId:receiptId,digest:`sha256:${"4".repeat(64)}`},status:"verified-and-integrated",authority:"factual-completion"};
    const completion=loaded(`COMPLETION-${suffix}`,sealLifecycle(completionBody,"completionDigest"));
    const closureBody={apiVersion:"devrelay.dev/v1alpha1",kind:"CanonicalChangeIntegrationClosure",closureId:`CLOSURE-${suffix}`,workItemId,taskContract:artifactRef(task),handoff:artifactRef(handoff),verificationApproval:artifactRef(approval),hostIntegration:artifactRef(integration),completionFact:artifactRef(completion),changeSetId,adapterMaturity:"fixture-conformant"};
    const closure=loaded(`CLOSURE-${suffix}`,sealLifecycle(closureBody,"closureDigest"));
    artifacts.push(task,handoff,approval,integration,completion,closure); completionFacts.push(artifactRef(completion)); canonicalClosures.push(artifactRef(closure));
  }
  const inputBody={apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunReportTraceabilityInput",inputId:"TRACE-INPUT-1",runId:"RUN-1",baseGraph:{artifactId:"BASE",digest:`sha256:${"0".repeat(64)}`},completionFacts,canonicalClosures,authority:"trusted-core-input"};
  const input=loaded("TRACE-INPUT-1",sealLifecycle(inputBody,"inputDigest")); artifacts.push(input);
  return {input,artifacts};
}

const context = (values) => ({invocation:{module:{id:"lifecycle-run-report-reconciliation",version:"0.1.0",operation:"reconcile"}},loadedInputs:{values}});

const histories = Object.freeze([
  ["WI-RUN-CONTRACTS","003","attempt-003"],
  ["WI-RUN-CONTENT-POLICY","002","attempt-002"],
  ["WI-RUN-LEDGER","002","attempt-002"],
  ["WI-RUN-OBSERVATIONS","001","attempt-001"],
  ["WI-RUN-FRONTIER","001","attempt-001"],
  ["WI-RUN-SNAPSHOT","005","attempt-005"],
  ["WI-RUN-MARKDOWN","002","attempt-002-correction-001"],
]);

function persisted(path, artifactId) {
  const bytes=readFileSync(resolve(path)); const value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  return {ref:{artifactId,schema:`https://devrelay.dev/bootstrap/${artifactId}/v1`,mediaType:"application/json",digest:sha256Digest(bytes),uri:`file://${resolve(path).replaceAll("\\","/")}`},bytes,value};
}

function realHistoryFixtures() {
  const artifacts=[]; const completionFacts=[]; const canonicalClosures=[];
  for(const [workItemId,attempt,verificationAttempt] of histories){
    const task=persisted(`dogfood/lifecycle-run-report/execution/task-contracts/${workItemId}.attempt-${attempt}.task.json`,`TASK-${workItemId}-${attempt}`);
    const handoff=persisted(`dogfood/lifecycle-run-report/execution/task-contracts/attempts/${workItemId}.attempt-${attempt}.handoff.raw.json`,`HANDOFF-${workItemId}-${attempt}`);
    const approval=persisted(`dogfood/lifecycle-run-report/execution/verification/${workItemId}/${verificationAttempt}/gate-approval.json`,JSON.parse(readFileSync(resolve(`dogfood/lifecycle-run-report/execution/verification/${workItemId}/${verificationAttempt}/gate-approval.json`))).approvalId);
    const integrationPath=`dogfood/lifecycle-run-report/execution/host-integration/${workItemId}.receipt.json`; const integrationValue=JSON.parse(readFileSync(resolve(integrationPath))); const integration=persisted(integrationPath,integrationValue.receiptId);
    const completionPath=`dogfood/lifecycle-run-report/execution/integrated-completion-facts/${workItemId}.json`; const completionValue=JSON.parse(readFileSync(resolve(completionPath))); const completion=persisted(completionPath,completionValue.completionId);
    const closureValue=createCanonicalChangeIntegrationClosure({closureId:`CLOSURE-${workItemId}`,workItemId,taskContract:artifactRef(task),handoff:artifactRef(handoff),verificationApproval:artifactRef(approval),hostIntegration:artifactRef(integration),completionFact:artifactRef(completion),changeSetId:completion.value.changeSet.artifactId,adapterMaturity:integration.value.adapter.maturity});
    const closure=loaded(closureValue.closureId,closureValue);
    artifacts.push(task,handoff,approval,integration,completion,closure); completionFacts.push(artifactRef(completion)); canonicalClosures.push(artifactRef(closure));
  }
  const inputValue=createLifecycleRunReportTraceabilityInput({inputId:"TRACE-INPUT-REAL-HISTORY",runId:"RUN-LIFECYCLE-REPORT",baseGraph:{artifactId:"BASE",digest:`sha256:${"0".repeat(64)}`},completionFacts,canonicalClosures,authority:"trusted-core-input"});
  const input=loaded(inputValue.inputId,inputValue); artifacts.push(input); return {artifacts,input};
}

test("the exact seven persisted histories retain formatting and trailing LF while semantic equality is verified",()=>{
  const f=realHistoryFixtures(); const persistedSources=f.artifacts.filter(x=>x.ref.uri?.startsWith("file:"));
  assert.equal(persistedSources.length,35); assert.ok(persistedSources.some(x=>!x.bytes.equals(Buffer.from(canonicalJson(x.value))))); assert.ok(persistedSources.some(x=>x.bytes.at(-1)===10));
  const resolved=resolveLifecycleRunReportCanonicalClosure(context(f.artifacts)); assert.equal(resolved.closures.length,7);
  for(const source of persistedSources) assert.equal(sha256Digest(source.bytes),source.ref.digest);
  const substituted=structuredClone(f.artifacts); const source=substituted.find(x=>x.ref.artifactId.startsWith("TASK-WI-RUN-LEDGER")); source.value={...source.value,workItemId:"WI-SUBSTITUTED"};
  assert.throws(()=>resolveLifecycleRunReportCanonicalClosure(context(substituted)),/decoded value differs/);
});

test("duplicates are rejected before source normalization",()=>{
  const f=realHistoryFixtures(); assert.throws(()=>resolveLifecycleRunReportCanonicalClosure(context([...f.artifacts,f.artifacts[0]])),/duplicate loaded source/);
});

test("released provider-neutral reconciliation artifacts validate and Core-only proofs bind conflict and replay",async()=>{
  const contributor=createLifecycleRunReportTraceabilityContributor(); const ownership={authority:contributor.authority,scope:contributor.scope,nodeKinds:[...contributor.ownership.nodeKinds].sort(),edgeKinds:[...contributor.ownership.edgeKinds].sort()};
  const contributorIdentity={id:contributor.metadata.id,version:contributor.metadata.version,contractDigest:canonicalJsonDigest({id:contributor.metadata.id,version:contributor.metadata.version,ownership})};
  const baseGraph={artifact:{artifactId:"GRAPH-R1",digest:`sha256:${"1".repeat(64)}`},revision:1}; const resultGraph={artifact:{artifactId:"GRAPH-R2",digest:`sha256:${"2".repeat(64)}`},revision:2}; const update={artifactId:"UPDATE-1",digest:`sha256:${"3".repeat(64)}`};
  const updateSet=createLifecycleRunReportTraceabilityUpdateSet({executionId:"WE-RUN-TRACEABILITY-ATTEMPT-002",contributor:contributorIdentity,baseGraph,update}); const updateSetRef={artifactId:updateSet.updateSetId,digest:`sha256:${"4".repeat(64)}`};
  const diagnostics=createLifecycleRunReportTraceabilityDiagnostics({executionId:updateSet.executionId,updateSet:updateSetRef,dispositions:[{artifact:update,disposition:"accepted",reason:"Core validated the standardized update."}],orphanObservations:[]});
  const receipt={artifactId:"RECEIPT-1",digest:`sha256:${"5".repeat(64)}`}; const checkpoint={artifactId:"CHECKPOINT-1",digest:`sha256:${"6".repeat(64)}`};
  const proof=createLifecycleRunReportTraceabilityMergeProof({executionId:updateSet.executionId,updateSet:updateSetRef,checkpoint,baseGraph,resultGraph,updateDigest:update.digest,atomicReceipt:receipt,replayReceipt:receipt});
  for(const value of [updateSet,diagnostics,proof]) assert.equal(validateLifecycleRunReportArtifact(value),value);
  assert.equal(proof.idempotentReplay,true); assert.equal(proof.conflictSafety,"base-graph-cas"); assert.equal("merge" in contributor,false);
  assert.throws(()=>validateLifecycleRunReportArtifact({...proof,resultGraph:{...resultGraph,revision:3},proofDigest:canonicalJsonDigest(Object.fromEntries(Object.entries({...proof,resultGraph:{...resultGraph,revision:3}}).filter(([key])=>!["apiVersion","kind","proofDigest"].includes(key))))}),/atomic successor/);
  const publicApi=readFileSync(resolve("src/index.mjs"),"utf8"); for(const name of ["createLifecycleRunReportTraceabilityContributor","createLifecycleRunReportTraceabilityUpdateSet","createLifecycleRunReportTraceabilityDiagnostics","createLifecycleRunReportTraceabilityMergeProof","resolveLifecycleRunReportCanonicalClosure"]) assert.match(publicApi,new RegExp(`\\b${name}\\b`));
});

test("canonical closure resolves seven exact raw-byte-bound sources and preserves honest adapter maturity",()=>{
  const f=fixtures(); const result=resolveLifecycleRunReportCanonicalClosure(context(f.artifacts));
  assert.equal(result.closures.length,7);
  assert.deepEqual(result.closures.map(x=>x.integration.value.adapter.maturity),Array(7).fill("fixture-conformant"));
  const missing=f.artifacts.filter(x=>x.ref.artifactId!=="HANDOFF-4");
  assert.throws(()=>resolveLifecycleRunReportCanonicalClosure(context(missing)),/missing or duplicated/);
  const corrupted=structuredClone(f.artifacts); const target=corrupted.find(x=>x.ref.artifactId==="TASK-2"); target.bytes=Buffer.from(`${target.bytes} `);
  assert.throws(()=>resolveLifecycleRunReportCanonicalClosure(context(corrupted)),/raw bytes do not match/);
});

test("trusted contributor emits only provider-neutral standardized allowlisted updates",async()=>{
  const f=fixtures(); const contributor=createLifecycleRunReportTraceabilityContributor();
  assert.deepEqual(contributor.ownership.edgeKinds,["integrated-as","produces","verified-by"]);
  assert.equal("merge" in contributor,false); assert.equal("store" in contributor,false); assert.equal("graph" in contributor,false);
  const projection=await contributor.project(context(f.artifacts));
  assert.equal(projection.nodes.length,21); assert.equal(projection.edges.length,21);
  assert.deepEqual([...new Set(projection.edges.map(x=>x.kind))].sort(),contributor.ownership.edgeKinds);
  assert.equal(canonicalJson(projection),canonicalJson(await contributor.project(context(structuredClone(f.artifacts)))));
});

test("Core checkpoints before atomic merge and exact replay is idempotent",async()=>{
  const f=fixtures(); const contributor=createLifecycleRunReportTraceabilityContributor();
  const seedLocator={artifact:artifactRef(f.input),jsonPointer:"",entityDigest:canonicalJsonDigest(f.input.value)};
  const seed={metadata:{id:"seed",version:"1.0.0"},authority:"candidate",scope:"work-breakdown/candidate",ownership:{authority:"candidate",scope:"work-breakdown/candidate",nodeKinds:["work-item"],edgeKinds:[]},match:{moduleId:"seed"},async project(){return {horizon:"implementation",nodes:LIFECYCLE_RUN_REPORT_COMPLETION_WORK_ITEMS.map(id=>({kind:"work-item",stableId:id,label:id,attributes:{},sourceLocators:[seedLocator]})),edges:[]}}};
  const store=createInMemoryTraceabilityStore(); const service=createTraceabilityGraphService({graphId:"run",projectId:"devrelay",store,contributors:[seed,contributor]});
  const moduleResult=(outcome,outputs={})=>({apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleResult",invocationId:`INV-${outcome}`,module:{id:outcome,version:"0.1.0",operation:outcome},status:"completed",outcome,outputs,evidence:[]});
  const seedRun={invocation:{invocationId:"INV-seed",module:{id:"seed",version:"0.1.0",operation:"seed"}},invocationFingerprint:`sha256:${"5".repeat(64)}`,moduleResult:moduleResult("seed"),loadedInputs:{input:f.input}};
  const seedPrepared=await service.prepare({baseGraph:service.captureBase(),...seedRun}); await service.mergePrepared(seedPrepared);
  const run={invocation:{invocationId:"INV-reconcile",module:{id:"lifecycle-run-report-reconciliation",version:"0.1.0",operation:"reconcile"}},invocationFingerprint:`sha256:${"6".repeat(64)}`,moduleResult:{...moduleResult("reconciled"),invocationId:"INV-reconcile"},loadedInputs:{artifacts:f.artifacts}};
  const prepared=await service.prepare({baseGraph:service.captureBase(),...run});
  assert.equal(service.captureBase().revision,1); assert.equal(prepared.update.nodeChanges.length,21); assert.equal(prepared.update.edgeChanges.length,21);
  const replay=await service.validatePrepared({checkpoint:structuredClone(prepared.checkpoint),...run}); assert.equal(replay.updateRef.digest,prepared.updateRef.digest);
  const merged=await service.mergePrepared(replay); const retried=await service.mergePrepared(replay);
  assert.equal(merged.disposition,"merged"); assert.equal(retried.receiptRef.digest,merged.receiptRef.digest); assert.equal(service.captureBase().revision,2);
  assert.equal(service.assertApplied(prepared.updateRef).resultGraphRef.digest,merged.snapshotRef.digest);
});

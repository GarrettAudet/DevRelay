import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { systemVerificationTraceabilityContributor } from "../src/system-verification-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const API="devrelay.dev/v1alpha1", D=`sha256:${"a".repeat(64)}`;
const ref=(artifactId,digest=D)=>({artifactId,digest});
const seal=(value,field)=>({...value,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
const loaded=(value,artifactId=value.resultId??value.evaluationId??value.evidenceSetId??value.obligationSetId??value.policyId??value.subjectId??value.kind)=>{const bytes=Buffer.from(canonicalJson(value));return{value,bytes,ref:{artifactId,digest:sha256Digest(bytes),schema:"https://devrelay.dev/test/v1",mediaType:"application/json",uri:`memory://${artifactId}`}}};
const replace=(entry,value)=>{entry.value=value;entry.bytes=Buffer.from(canonicalJson(value));entry.ref={...entry.ref,digest:sha256Digest(entry.bytes)};};

function fixture(){
  const subject=seal({apiVersion:API,kind:"IntegratedSystemCandidate",subjectId:"SV-SUB",repositorySnapshot:ref("REPO"),integratedChangeRecords:[ref("ICR")],integratedCompletionFactSet:ref("FACTS"),requirementsBaseline:ref("REQ"),projectOverviewBaseline:ref("PO"),architectureBaseline:ref("ARCH"),contractDisposition:ref("CONTRACT"),workBreakdownBaseline:ref("WB"),workDependencyBaseline:ref("WD"),specialistAssignmentBaseline:ref("SA"),verificationEnvironment:{disposition:"approved-not-applicable",rationale:"fixture"},systemVerificationPolicy:ref("POL")} ,"subjectDigest");
  const obligations=seal({apiVersion:API,kind:"SystemVerificationObligationSet",obligationSetId:"SV-OBS",subject:ref(subject.subjectId,subject.subjectDigest),obligations:[{obligationId:"OB-AC",kind:"acceptance-criterion",sourceRef:"AC-SV-001",requiredEvidenceKinds:["test"]},{obligationId:"OB-NFR",kind:"non-functional-requirement",sourceRef:"NFR-SV-001",requiredEvidenceKinds:["review"]}]},"obligationSetDigest");
  const policy=seal({apiVersion:API,kind:"SystemVerificationPolicy",policyId:"POL",version:"1.0.0",allObligationsMandatory:true,unknownEvidence:"reject",outcomePrecedence:["failed","needs-evidence","verified"]},"policyDigest");
  const evidence=seal({apiVersion:API,kind:"NormalizedSystemVerificationEvidence",evidenceSetId:"SV-EVID",subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),rawObservations:[ref("RAW")],items:[{evidenceId:"EV-AC",obligationId:"OB-AC",kind:"test",status:"pass",artifact:ref("ART-AC"),producer:{id:"adapter",version:"1.0.0"}},{evidenceId:"EV-NFR",obligationId:"OB-NFR",kind:"review",status:"pass",artifact:ref("ART-NFR"),producer:{id:"adapter",version:"1.0.0"}}]},"evidenceDigest");
  const evaluation=seal({apiVersion:API,kind:"SystemVerificationEvaluation",evaluationId:"SV-EVAL",subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),policy:ref(policy.policyId,policy.policyDigest),evidence:ref(evidence.evidenceSetId,evidence.evidenceDigest),dispositions:[{obligationId:"OB-AC",status:"satisfied",evidenceIds:["EV-AC"]},{obligationId:"OB-NFR",status:"satisfied",evidenceIds:["EV-NFR"]}],outcome:"verified"},"evaluationDigest");
  const result=seal({apiVersion:API,kind:"SystemVerificationResult",resultId:"SV-RESULT",subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),policy:ref(policy.policyId,policy.policyDigest),evidence:ref(evidence.evidenceSetId,evidence.evidenceDigest),evaluation:ref(evaluation.evaluationId,evaluation.evaluationDigest),outcome:"verified",progression:"business-acceptance-gate",authority:"system-verification"},"resultDigest");
  const artifacts=[subject,obligations,policy,evidence,evaluation,result].map(value=>loaded(value));
  const resultRef=artifacts[5].ref;
  const moduleResult={apiVersion:API,kind:"ModuleResult",invocationId:"SV-INV",status:"completed",outcome:"verified",outputs:{"system-verification-result":[resultRef]},evidence:[{kind:"system-verification/contract-tests",subject:"SV-RESULT",status:"pass",artifact:resultRef}],diagnostics:[]};
  return {context:{invocation:{invocationId:"SV-INV",module:{id:"system-verification",version:"0.1.0",operation:"verify-system"}},invocationFingerprint:D,moduleResult,loadedInputs:{subject:[artifacts[0]],policy:[artifacts[2]]},loadedOutputs:{obligations:[artifacts[1]],evidence:[artifacts[3]],evaluation:[artifacts[4]],result:[artifacts[5]]},loadedAttachments:{}},artifacts};
}

test("exact verified result projects only forward acceptance-criterion evidence and merges atomically/idempotently",async()=>{
  const {context}=fixture(); const projection=await systemVerificationTraceabilityContributor.project(context);
  assert.deepEqual(projection.edges.map(x=>[x.source.kind,x.kind,x.target.kind]),[["acceptance-criterion","verified-by","verification-evidence"]]);
  assert.equal(canonicalJson(projection).match(/candidate|integrat|deploy|business-acceptance|inverse/),null);
  const seed={metadata:{id:"seed.ac",version:"1.0.0"},authority:"approved",scope:"requirements/baseline",ownership:{authority:"approved",scope:"requirements/baseline",nodeKinds:["acceptance-criterion"],edgeKinds:[]},match:()=>true,project:()=>({horizon:"requirements",nodes:[{kind:"acceptance-criterion",stableId:"AC-SV-001",label:"AC",attributes:{},sourceLocators:projection.edges[0].sourceLocators}],edges:[]})};
  const service=createTraceabilityGraphService({graphId:"sv",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[seed,systemVerificationTraceabilityContributor]});
  const seedContext={...context,invocation:{invocationId:"seed",module:{id:"seed",version:"1",operation:"seed"}},moduleResult:{...context.moduleResult,invocationId:"seed",outcome:"seed"}};
  await service.mergePrepared(await service.prepare({...seedContext,baseGraph:service.captureBase()}));
  const prepared=await service.prepare({...context,baseGraph:service.captureBase()}); const first=await service.mergePrepared(prepared), replay=await service.mergePrepared(prepared);
  assert.equal(first.receipt.disposition,"merged"); assert.deepEqual(first.receipt.resultGraph,replay.receipt.resultGraph); assert.equal(replay.snapshot.edges.filter(x=>x.kind==="verified-by").length,1);
});

test("failed, needs-evidence, candidate, adapter-authored, inverse, orphan, and missing-evidence facts fail closed",async()=>{
  for(const outcome of ["failed","needs-evidence"]){const {context}=fixture();context.moduleResult={...context.moduleResult,outcome,status:outcome==="needs-evidence"?"waiting":"completed"};await assert.rejects(systemVerificationTraceabilityContributor.project(context),/nonmatching/);}
  const adapter=fixture();adapter.artifacts[3].value.graphOperations=[{kind:"verified-by"}];await assert.rejects(systemVerificationTraceabilityContributor.project(adapter.context),/raw bytes|invalid/);
  const orphan=fixture();const changed={...orphan.artifacts[4].value,dispositions:[{obligationId:"OB-AC",status:"satisfied",evidenceIds:["EV-MISSING"]},{obligationId:"OB-NFR",status:"satisfied",evidenceIds:["EV-NFR"]}]};replace(orphan.artifacts[4],seal(changed,"evaluationDigest"));await assert.rejects(systemVerificationTraceabilityContributor.project(orphan.context),/stale|missing, orphaned/);
  const missing=fixture();const changedEvidence={...missing.artifacts[3].value,items:missing.artifacts[3].value.items.filter(x=>x.evidenceId!=="EV-AC")};replace(missing.artifacts[3],seal(changedEvidence,"evidenceDigest"));await assert.rejects(systemVerificationTraceabilityContributor.project(missing.context),/stale|missing, orphaned/);
  const projection=await systemVerificationTraceabilityContributor.project(fixture().context);const inverse={...systemVerificationTraceabilityContributor,metadata:{id:"inverse",version:"1.0.0"},project:()=>({horizon:"verification",nodes:projection.nodes,edges:[{...projection.edges[0],source:projection.edges[0].target,target:projection.edges[0].source}]})};
  const service=createTraceabilityGraphService({graphId:"inverse",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[inverse]});await assert.rejects(service.prepare({...fixture().context,baseGraph:service.captureBase()}),/dangling endpoint|invalid verification-evidence -> acceptance-criterion endpoints/);
});

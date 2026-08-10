import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { executeSystemVerification, expandSystemVerificationObligations, validateIntegratedSystemCandidate } from "../src/system-verification-core.mjs";
import { adaptSystemTestResult, TEST_SYSTEM_VERIFIER } from "../src/system-verification-test-adapter.mjs";
import { adaptSystemReviewResult, REVIEW_SYSTEM_VERIFIER } from "../src/system-verification-review-adapter.mjs";
import { systemVerificationTraceabilityContributor } from "../src/system-verification-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const API="devrelay.dev/v1alpha1", D=`sha256:${"a".repeat(64)}`;
const ref=(artifactId,digest=D)=>({artifactId,digest});
const seal=(value,field)=>({...value,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
const subject=seal({apiVersion:API,kind:"IntegratedSystemCandidate",subjectId:"SV-RELEASE",repositorySnapshot:ref("REPO"),integratedChangeRecords:[ref("ICR")],integratedCompletionFactSet:ref("FACTS"),requirementsBaseline:ref("REQ"),projectOverviewBaseline:ref("PO"),architectureBaseline:ref("ARCH"),contractDisposition:ref("CONTRACT"),workBreakdownBaseline:ref("WB"),workDependencyBaseline:ref("WD"),specialistAssignmentBaseline:ref("SA"),verificationEnvironment:{disposition:"approved-not-applicable",rationale:"deterministic release fixture"},systemVerificationPolicy:ref("POLICY")},"subjectDigest");
const policy=seal({apiVersion:API,kind:"SystemVerificationPolicy",policyId:"POLICY",version:"1.0.0",allObligationsMandatory:true,unknownEvidence:"reject",outcomePrecedence:["failed","needs-evidence","verified"]},"policyDigest");
const acceptanceCriteria=[{id:"AC-SV-RELEASE",requiredEvidenceKinds:["test"]}];
const nonFunctionalRequirements=[{id:"NFR-SV-RELEASE",requiredEvidenceKinds:["review"]}];
const obligations=expandSystemVerificationObligations({subject,acceptanceCriteria,nonFunctionalRequirements});
const store=()=>{const values=new Map();return{get:key=>values.get(key),put:(key,value)=>{assert.equal(values.has(key),false);values.set(key,structuredClone(value));}}};
const invocation=(id,verifier,assignedObligationIds)=>seal({apiVersion:API,kind:"SystemVerifierInvocation",invocationId:id,subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),policy:ref(policy.policyId,policy.policyDigest),verifier,assignedObligationIds,verificationEnvironment:subject.verificationEnvironment,grants:[]},"invocationFingerprint");
const testInvocation=invocation("SV-TEST",TEST_SYSTEM_VERIFIER,["SV-AC-AC-SV-RELEASE"]);
const reviewInvocation=invocation("SV-REVIEW",REVIEW_SYSTEM_VERIFIER,["SV-NFR-NFR-SV-RELEASE"]);
const evidenceBinding=(kind,id)=>({kind,artifact:ref(id)});
const nativeArtifact=(id,bytes)=>({artifactId:id,digest:sha256Digest(bytes)});

async function run({testStatus="pass",reviewDisposition="accepted"}={}) {
  let calls=0;
  const verifier=async(value)=>{calls++;
    if(value.verifier.id===TEST_SYSTEM_VERIFIER.id){const native={tests:[{obligationId:value.assignedObligationIds[0],status:testStatus,evidenceBindings:testStatus==="inconclusive"?[]:[evidenceBinding("test","TEST-EVIDENCE")]}]};const bytes=Buffer.from(canonicalJson(native));return adaptSystemTestResult({invocation:value,nativeBytes:bytes,nativeArtifact:nativeArtifact("NATIVE-TEST",bytes)});}
    const native={findings:[{obligationId:value.assignedObligationIds[0],disposition:reviewDisposition,evidenceBindings:reviewDisposition==="uncertain"?[]:[evidenceBinding("review","REVIEW-EVIDENCE")]}]};const bytes=Buffer.from(canonicalJson(native));return adaptSystemReviewResult({invocation:value,nativeBytes:bytes,nativeArtifact:nativeArtifact("NATIVE-REVIEW",bytes)});
  };
  const input={subject,policy,acceptanceCriteria,nonFunctionalRequirements,invocations:[testInvocation,reviewInvocation],checkpoints:store(),verifier};
  const first=await executeSystemVerification(input);const replay=await executeSystemVerification(input);
  assert.equal(calls,2);assert.equal(replay.verifierCalls,0);assert.deepEqual(replay.result,first.result);
  return first;
}

const loaded=(value,artifactId)=>{const bytes=Buffer.from(canonicalJson(value));return{value,bytes,ref:{artifactId,digest:sha256Digest(bytes),schema:"https://devrelay.dev/test/v1",mediaType:"application/json",uri:`memory://${artifactId}`}}};

test("0.7.0 runs both typed-evidence adapters through Core, exact replay, policy, and trusted traceability",async()=>{
  const execution=await run();assert.equal(execution.result.outcome,"verified");
  const values=[subject,execution.obligations,policy,execution.evidence,execution.evaluation,execution.result];
  const artifacts=values.map((value,index)=>loaded(value,["SUBJECT","OBLIGATIONS","POLICY","EVIDENCE","EVALUATION","RESULT"][index]));
  const resultRef=artifacts[5].ref;
  const moduleResult={apiVersion:API,kind:"ModuleResult",invocationId:"SV-RELEASE-RUN",status:"completed",outcome:"verified",outputs:{"system-verification-result":[resultRef]},evidence:[{kind:"system-verification/contract-tests",subject:execution.result.resultId,status:"pass",artifact:resultRef}],diagnostics:[]};
  const context={invocation:{invocationId:"SV-RELEASE-RUN",module:{id:"system-verification",version:"0.1.0",operation:"verify-system"}},invocationFingerprint:D,moduleResult,loadedInputs:{subject:[artifacts[0]],policy:[artifacts[2]]},loadedOutputs:{obligations:[artifacts[1]],evidence:[artifacts[3]],evaluation:[artifacts[4]],result:[artifacts[5]]},loadedAttachments:{}};
  const projection=await systemVerificationTraceabilityContributor.project(context);
  assert.deepEqual(projection.edges.map(({kind})=>kind),["verified-by"]);assert.equal(canonicalJson(projection).includes("business-acceptance"),false);
  const seed={metadata:{id:"seed",version:"1.0.0"},authority:"approved",scope:"requirements/baseline",ownership:{authority:"approved",scope:"requirements/baseline",nodeKinds:["acceptance-criterion"],edgeKinds:[]},match:()=>true,project:()=>({horizon:"requirements",nodes:[{kind:"acceptance-criterion",stableId:"AC-SV-RELEASE",label:"AC",attributes:{},sourceLocators:projection.edges[0].sourceLocators}],edges:[]})};
  const graph=createTraceabilityGraphService({graphId:"sv-release",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[seed,systemVerificationTraceabilityContributor]});
  const seedContext={...context,invocation:{invocationId:"seed",module:{id:"seed",version:"1",operation:"seed"}},moduleResult:{...moduleResult,invocationId:"seed",outcome:"seed"}};
  await graph.mergePrepared(await graph.prepare({...seedContext,baseGraph:graph.captureBase()}));const prepared=await graph.prepare({...context,baseGraph:graph.captureBase()});const merged=await graph.mergePrepared(prepared);const replay=await graph.mergePrepared(prepared);
  assert.equal(merged.receipt.disposition,"merged");assert.deepEqual(replay.receipt,merged.receipt);assert.equal(merged.snapshot.nodes.some(({kind})=>kind==="business-acceptance"),false);
});

test("release paths prove failed, needs-evidence, drift, and verifier substitution fail closed",async()=>{
  assert.equal((await run({testStatus:"fail"})).result.outcome,"failed");
  assert.equal((await run({reviewDisposition:"uncertain"})).result.outcome,"needs-evidence");
  assert.throws(()=>validateIntegratedSystemCandidate(subject,{repositorySnapshot:ref("SUBSTITUTED")}),error=>error.outcome==="baseline-drift");
  const substituted={...testInvocation,verifier:{id:"substituted",version:"1.0.0"}};delete substituted.invocationFingerprint;substituted.invocationFingerprint=seal(substituted,"invocationFingerprint").invocationFingerprint;
  await assert.rejects(executeSystemVerification({subject,policy,acceptanceCriteria,nonFunctionalRequirements,invocations:[substituted,reviewInvocation],checkpoints:store(),verifier:async()=>assert.fail("substituted verifier must not execute")}),/verifier|invalid/);
});

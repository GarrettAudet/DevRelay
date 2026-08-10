import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { adaptTestVerifierResult, TEST_VERIFIER } from "../src/work-item-verification-test-verifier-adapter.mjs";
import { adaptReviewVerifierResult, REVIEW_VERIFIER } from "../src/work-item-verification-review-verifier-adapter.mjs";

const D=`sha256:${"1".repeat(64)}`;
const ref=(artifactId,digest=D)=>({artifactId,digest});
const seal=(value,field)=>({...value,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
const assigned=[
  {obligationId:"OB-1",kind:"work-item-plan",sourceRef:"VC-1",requiredEvidenceKinds:["test-report","coverage-report"]},
  {obligationId:"OB-2",kind:"acceptance-criterion",sourceRef:"AC-2",requiredEvidenceKinds:["review-record"]},
];

function fixture(verifier,obligations=assigned){
  const obligationIds=obligations.map(({obligationId})=>obligationId);
  const binding=seal({apiVersion:"devrelay.dev/v1alpha1",kind:"ValidatedVerifierBindingSet",bindingId:"BIND-1",subject:ref("SUB"),obligationSet:ref("OBLIGATIONS"),executorIdentity:"executor.other",partitions:[{verifier,obligationIds,permissionDemand:[]}],independence:{required:true,satisfied:true,evidence:ref("INDEPENDENCE")}},"bindingDigest");
  const invocation=seal({apiVersion:"devrelay.dev/v1alpha1",kind:"VerifierInvocation",verificationAttemptId:"VAT-1",subject:ref("SUB"),obligationSet:ref("OBLIGATIONS"),binding:ref("BIND-1",binding.bindingDigest),verifier,obligationIds,assignedObligations:structuredClone(obligations),candidateWorkspace:ref("WORKSPACE"),grants:[]},"invocationFingerprint");
  return{invocation,binding};
}
function invoke(binding,value,obligations=assigned){
  const nativeBytes=Buffer.from(JSON.stringify(value));
  return binding.adapter({...fixture(binding.verifier,obligations),nativeBytes,nativeResult:value,nativeArtifact:{artifactId:"NATIVE",digest:sha256Digest(nativeBytes),mediaType:"application/json"}});
}
const configurations=[
  {name:"test",adapter:adaptTestVerifierResult,verifier:TEST_VERIFIER,entries:"tests",status:"status",pass:"pass",fail:"fail",inconclusive:"inconclusive"},
  {name:"review",adapter:adaptReviewVerifierResult,verifier:REVIEW_VERIFIER,entries:"findings",status:"disposition",pass:"accepted",fail:"rejected",inconclusive:"uncertain"},
];
function nativeEntry(binding,obligationId,status,evidence,summary=`${status} evidence`){return{obligationId,[binding.status]:status,summary,evidence};}
const completeEvidence=(obligationId)=>obligationId==="OB-1"?[{kind:"test-report",artifact:ref("TEST-1")},{kind:"coverage-report",artifact:ref("COVERAGE-1")}]:[{kind:"review-record",artifact:ref("REVIEW-2")}];

for(const binding of configurations){
  test(`${binding.name} adapter emits canonical pass, fail, and inconclusive dispositions`,()=>{
    const pass=invoke(binding,{terminalState:"observed",[binding.entries]:assigned.map(({obligationId})=>nativeEntry(binding,obligationId,binding.pass,completeEvidence(obligationId)))});
    assert.deepEqual(pass.observations.map(({status})=>status),["pass","pass"]);
    assert.equal(pass.observations[0].evidenceBindings.length,2);
    assert.equal(Object.hasOwn(pass,"evidence"),false);
    assert.match(pass.rawResultDigest,/^sha256:/);
    const failed=invoke(binding,{terminalState:"observed",[binding.entries]:assigned.map(({obligationId})=>nativeEntry(binding,obligationId,binding.fail,[completeEvidence(obligationId)[0]]))});
    assert.deepEqual(failed.observations.map(({status})=>status),["fail","fail"]);
    const inconclusive=invoke(binding,{terminalState:"observed",[binding.entries]:assigned.map(({obligationId})=>nativeEntry(binding,obligationId,binding.inconclusive,[]))});
    assert.deepEqual(inconclusive.observations.map(({status,evidenceBindings})=>[status,evidenceBindings.length]),[["inconclusive",0],["inconclusive",0]]);
  });

  test(`${binding.name} adapter keeps multi-obligation artifacts and kinds explicitly separated`,()=>{
    const raw=invoke(binding,{terminalState:"observed",[binding.entries]:assigned.map(({obligationId})=>nativeEntry(binding,obligationId,binding.pass,completeEvidence(obligationId)))});
    assert.deepEqual(raw.observations[0].evidenceBindings.map(({kind,artifact})=>[kind,artifact.artifactId]),[["coverage-report","COVERAGE-1"],["test-report","TEST-1"]]);
    assert.deepEqual(raw.observations[1].evidenceBindings.map(({kind,artifact})=>[kind,artifact.artifactId]),[["review-record","REVIEW-2"]]);
    assert.equal(new Set(raw.observations.flatMap(({evidenceBindings})=>evidenceBindings.map(({evidenceId})=>evidenceId))).size,3);
    const crossed=nativeEntry(binding,"OB-2",binding.pass,[{kind:"test-report",artifact:ref("TEST-1")}]);
    assert.throws(()=>invoke(binding,{terminalState:"observed",[binding.entries]:[nativeEntry(binding,"OB-1",binding.pass,completeEvidence("OB-1")),crossed]}),/unrelated or malformed kind/);
  });

  test(`${binding.name} adapter supplies one empty inconclusive observation for partial and non-observed terminal results`,()=>{
    const partial=invoke(binding,{terminalState:"observed",[binding.entries]:[nativeEntry(binding,"OB-1",binding.pass,completeEvidence("OB-1"))]});
    assert.deepEqual(partial.observations.map(({obligationId,status,evidenceBindings})=>[obligationId,status,evidenceBindings.length]),[["OB-1","pass",2],["OB-2","inconclusive",0]]);
    for(const terminalState of ["timed-out","interrupted","denied"]){
      const stopped=invoke(binding,{terminalState,diagnostic:`native ${terminalState}`,[binding.entries]:[nativeEntry(binding,"OB-1",binding.pass,completeEvidence("OB-1"))]});
      assert.deepEqual(stopped.observations.map(({status,evidenceBindings})=>[status,evidenceBindings.length]),[["inconclusive",0],["inconclusive",0]]);
      assert.equal(stopped.terminalState,terminalState);
    }
  });

  test(`${binding.name} adapter rejects malformed, duplicate, conflicting, substituted, and drifted input`,()=>{
    assert.throws(()=>invoke(binding,{terminalState:"observed",[binding.entries]:"bad"}),/malformed/);
    const duplicate=nativeEntry(binding,"OB-1",binding.pass,[...completeEvidence("OB-1"),completeEvidence("OB-1")[0]]);
    assert.throws(()=>invoke(binding,{terminalState:"observed",[binding.entries]:[duplicate,nativeEntry(binding,"OB-2",binding.pass,completeEvidence("OB-2"))]}),/duplicate/);
    const conflict=nativeEntry(binding,"OB-1",binding.fail,[completeEvidence("OB-1")[0]]);
    assert.throws(()=>invoke(binding,{terminalState:"observed",[binding.entries]:[nativeEntry(binding,"OB-1",binding.pass,completeEvidence("OB-1")),conflict]}),/conflicting/);
    const other=binding.name==="test"?REVIEW_VERIFIER:TEST_VERIFIER, value={terminalState:"observed",[binding.entries]:[]},nativeBytes=Buffer.from(JSON.stringify(value));
    assert.throws(()=>binding.adapter({...fixture(other),nativeBytes,nativeResult:value,nativeArtifact:{artifactId:"N",digest:sha256Digest(nativeBytes)}}),/substituted/);
    const bytes=Buffer.from(JSON.stringify(value));
    assert.throws(()=>binding.adapter({...fixture(binding.verifier),nativeBytes:bytes,nativeResult:{...value,extra:true},nativeArtifact:{artifactId:"N",digest:sha256Digest(bytes)}}),/does not match/);
    assert.throws(()=>binding.adapter({...fixture(binding.verifier),nativeBytes:Buffer.from("{"),nativeArtifact:{artifactId:"N",digest:sha256Digest(Buffer.from("{"))}}),/malformed JSON/);
  });

  test(`${binding.name} evidence identities and attribution are deterministic under native reordering`,()=>{
    const entries=assigned.map(({obligationId})=>nativeEntry(binding,obligationId,binding.pass,completeEvidence(obligationId)));
    const one=invoke(binding,{terminalState:"observed",[binding.entries]:entries});
    const reordered=structuredClone(entries).reverse();reordered[1].evidence.reverse();
    const two=invoke(binding,{[binding.entries]:reordered,terminalState:"observed"});
    assert.deepEqual(two.observations,one.observations);
    assert.deepEqual(two.diagnostics,one.diagnostics);
  });
}

test("both verifier plug-ins conform through the module registry",()=>{
  const moduleDefinition=JSON.parse(readFileSync(new URL("../examples/modules/work-item-verification.module.json",import.meta.url)));
  const definitions=["../examples/plugins/test-verifier.plugin.json","../examples/plugins/review-verifier.plugin.json"].map((path)=>JSON.parse(readFileSync(new URL(path,import.meta.url))));
  assert.ok(createModuleRegistry({modules:[moduleDefinition],plugins:definitions.map((definition)=>({definition,adapter:{async invoke(){throw new Error("not exercised");}}}))}));
});

test("canonically valid stale partition and assigned-obligation slices fail closed",()=>{
  const value={terminalState:"observed",tests:[]},nativeBytes=Buffer.from(JSON.stringify(value)),base=fixture(TEST_VERIFIER);
  const bindingBody=structuredClone(base.binding);delete bindingBody.bindingDigest;bindingBody.partitions[0].obligationIds=["OB-1"];
  const binding=seal(bindingBody,"bindingDigest"),invocationBody={...base.invocation,binding:ref("BIND-1",binding.bindingDigest)};delete invocationBody.invocationFingerprint;
  assert.throws(()=>adaptTestVerifierResult({binding,invocation:seal(invocationBody,"invocationFingerprint"),nativeBytes,nativeResult:value,nativeArtifact:{artifactId:"N",digest:sha256Digest(nativeBytes)}}),/assigned obligations/);
});

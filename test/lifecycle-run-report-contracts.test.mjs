import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { LIFECYCLE_RUN_REPORT_ARTIFACT_KINDS, validateLifecycleRunReportArtifact } from "../src/lifecycle-run-report-artifact-validator.mjs";

const d = char => `sha256:${char.repeat(64)}`;
const ref = (artifactId, char="a") => ({artifactId,digest:d(char)});
const source = {kind:"module-execution-record",artifact:ref("record-1")};
const digestFields = {RunWorkflowFact:"factDigest",RunHostObservation:"observationDigest",LifecycleRunSnapshot:"snapshotDigest",RunComparabilityDecision:"decisionDigest",LifecycleRunContentPolicy:"policyDigest",LifecycleRunReportAccess:"responseDigest",IntegratedCompletionFact:"completionDigest",ReadyFrontier:"frontierDigest"};
const seal = value => { const field=digestFields[value.kind]; const body=Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))); return {...value,[field]:canonicalJsonDigest(body)}; };
const metric = {name:"duration",availability:"measured",value:5,unit:"milliseconds",provenance:source};
const dimensions = ["module","operation","inputs","policy","circuit","host"].map(name=>({name,leftDigest:d("b"),rightDigest:d("b"),matches:true}));
const fixtures = [
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"RunWorkflowFact",factId:"fact-1",runId:"run-1",component:{kind:"module",id:"any-module",version:"1.0.0"},event:"completed",source,authority:"trusted-workflow-record"}),
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"RunHostObservation",observationId:"obs-1",runId:"run-1",metric,sensitivity:"internal",authority:"non-authoritative-observation"}),
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunSnapshot",snapshotId:"snapshot-1",runId:"run-1",ledger:ref("ledger-1"),traceabilityGraph:ref("graph-1"),stages:[{componentKind:"module",componentId:"any-module",sequence:0,operation:"any-operation",adapterBindings:[{id:"any-adapter",version:"1.0.0",configurationDigest:d("d")}],status:"completed",outcome:"candidate",gateResult:"not-applicable",rework:{attemptCount:1,replayed:false,predecessorAttempts:[]},performance:[metric],importantArtifacts:[ref("candidate-1")],nextAction:{disposition:"available",description:"Await independent Gate review."},sourceFacts:[ref("fact-1")]}],importantArtifacts:[ref("candidate-1")],traceabilityPaths:[{pathId:"path-1",from:ref("requirement-1"),to:ref("candidate-1"),graphEvidence:ref("graph-1")}],diagnostics:[{code:"RUN-INFO",severity:"info",message:"Bounded stage completed.",source}],adapterAssessments:[{adapter:{id:"any-adapter",version:"1.0.0",configurationDigest:d("d")},maturity:"fixture-conformant",comparability:ref("comparison-1")}],metrics:[metric],nextAction:{disposition:"available",description:"Await independent Gate review."},authority:"read-only-projection"}),
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"RunComparabilityDecision",decisionId:"comparison-1",leftRunId:"run-1",rightRunId:"run-2",dimensions,disposition:"comparable",reasons:[],authority:"comparison-only"}),
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunContentPolicy",policyId:"policy-1",version:"1.0.0",rules:[{classification:"public",disposition:"allow"},...(["secret","credential","prompt","raw-tool-log","unknown"].map(classification=>({classification,disposition:"omit"})))],unknownClassification:"omit",authority:"content-filter-only"}),
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunReportAccess",responseId:"response-1",runId:"run-1",view:"full",snapshot:ref("snapshot-1"),contentPolicy:ref("policy-1"),markdownReport:ref("report-1"),evidence:[ref("evidence-1")],access:"read-only"}),
  seal({apiVersion:"devrelay.dev/v1alpha1",kind:"IntegratedCompletionFact",completionId:"completion-1",workItem:ref("work-1"),changeSet:ref("change-1"),verification:ref("verification-1"),integration:ref("integration-1"),status:"verified-and-integrated",authority:"factual-completion"}),
  (()=>{const workDependencyBaseline=ref("dependency-1"),completionFacts=[ref("completion-1")];return seal({apiVersion:"devrelay.dev/v1alpha1",kind:"ReadyFrontier",frontierId:"frontier-1",workDependencyBaseline,completionFacts,derivation:{algorithm:"approved-dag-plus-integrated-completion",version:"1.0.0",inputDigest:canonicalJsonDigest({workDependencyBaseline,completionFacts})},dispositions:[{workItemId:"work-1",status:"completed"},{workItemId:"work-2",status:"ready"}],readyWorkItemIds:["work-2"],authority:"core-derived-readiness"});})()
];

test("all eight closed provider-neutral LifecycleRunReport contracts validate",()=>{
  assert.deepEqual(fixtures.map(x=>x.kind),LIFECYCLE_RUN_REPORT_ARTIFACT_KINDS);
  for(const fixture of fixtures) assert.equal(validateLifecycleRunReportArtifact(fixture),fixture);
});

test("unknown fields and digest drift fail closed",()=>{
  assert.throws(()=>validateLifecycleRunReportArtifact({...fixtures[0],unexpected:true}),/invalid/);
  assert.throws(()=>validateLifecycleRunReportArtifact({...fixtures[1],sensitivity:"public"}),/does not bind canonical material/);
});

test("substitution and contradictory derivations fail closed",()=>{
  const comparison=seal({...fixtures[3],dimensions:fixtures[3].dimensions.map((x,i)=>i?x:{...x,rightDigest:d("c"),matches:false}),disposition:"comparable"});
  assert.throws(()=>validateLifecycleRunReportArtifact(comparison),/contradicts/);
  const frontier=seal({...fixtures[7],readyWorkItemIds:["work-1"]});
  assert.throws(()=>validateLifecycleRunReportArtifact(frontier),/contradict/);
});

test("metric availability uses approved measured, estimated, and explicit absence dispositions",()=>{
  assert.equal(validateLifecycleRunReportArtifact(seal({...fixtures[1],metric:{...metric,availability:"estimated"}})).metric.availability,"estimated");
  assert.equal(validateLifecycleRunReportArtifact(seal({...fixtures[1],metric:{name:"duration",availability:"unavailable",absenceReason:"Host did not observe duration."}})).metric.availability,"unavailable");
  assert.throws(()=>validateLifecycleRunReportArtifact(seal({...fixtures[1],metric:{name:"duration",availability:"unavailable",value:5,unit:"milliseconds",absenceReason:"Missing."}})),/invalid/);
  assert.throws(()=>validateLifecycleRunReportArtifact(seal({...fixtures[1],metric:{name:"duration",availability:"measured",value:5,unit:"milliseconds"}})),/invalid/);
});

test("snapshot requires generic artifacts, paths, diagnostics, adapter assessment, and complete stage reporting",()=>{
  const missingPath=structuredClone(fixtures[2]);delete missingPath.traceabilityPaths;
  assert.throws(()=>validateLifecycleRunReportArtifact(seal(missingPath)),/invalid/);
  const missingOperation=structuredClone(fixtures[2]);delete missingOperation.stages[0].operation;
  assert.throws(()=>validateLifecycleRunReportArtifact(seal(missingOperation)),/invalid/);
});

test("adapter maturity uses only the approved four-value adapter vocabulary",()=>{
  const approved=["contract-defined","fixture-conformant","live-conformant","release-ready"];
  for(const maturity of approved){
    const snapshot=structuredClone(fixtures[2]);snapshot.adapterAssessments[0].maturity=maturity;
    assert.equal(validateLifecycleRunReportArtifact(seal(snapshot)).adapterAssessments[0].maturity,maturity);
  }
  for(const maturity of ["unknown","experimental","conformant","proven","implemented","verified","integrated"]){
    const snapshot=structuredClone(fixtures[2]);snapshot.adapterAssessments[0].maturity=maturity;
    assert.throws(()=>validateLifecycleRunReportArtifact(seal(snapshot)),/invalid/);
  }
});

test("report access is bound to content policy and remains read-only",()=>{
  const missingPolicy=structuredClone(fixtures[5]);delete missingPolicy.contentPolicy;
  assert.throws(()=>validateLifecycleRunReportArtifact(seal(missingPolicy)),/invalid/);
  assert.throws(()=>validateLifecycleRunReportArtifact(seal({...fixtures[5],access:"read-write"})),/invalid/);
});

test("ready frontier is Core-derived from exact approved DAG and completion facts",()=>{
  assert.equal(fixtures[7].authority,"core-derived-readiness");
  const substituted=seal({...fixtures[7],completionFacts:[ref("completion-2")]});
  assert.throws(()=>validateLifecycleRunReportArtifact(substituted),/exact approved DAG and completion facts/);
  assert.throws(()=>validateLifecycleRunReportArtifact(seal({...fixtures[7],authority:"readiness-advisory"})),/invalid/);
});

test("reporting artifacts cannot claim workflow, Gate, graph, evidence, or progression authority",()=>{
  for(const forbidden of ["routeDecision","adapterSelection","approval","gateDecision","graphMutation","evidenceSatisfaction","progression","workflowMutation"]){
    const value={...fixtures[0],[forbidden]:{claimed:true}};
    assert.throws(()=>validateLifecycleRunReportArtifact(value),/invalid|forbidden workflow authority/);
  }
  const unsafe=seal({...fixtures[4],rules:fixtures[4].rules.map(x=>x.classification==="secret"?{...x,disposition:"allow"}:x)});
  assert.throws(()=>validateLifecycleRunReportArtifact(unsafe),/must be omitted or redacted/);
});

test("LifecycleRunReport public surface exposes validation only and no stage authority",()=>{
  const publicSurface=readFileSync(new URL("../src/index.mjs",import.meta.url),"utf8");
  assert.match(publicSurface,/validateLifecycleRunReportArtifact/);
  assert.doesNotMatch(publicSurface,/routeLifecycleRunReport|approveLifecycleRunReport|mutateTraceabilityGraphFromLifecycleRunReport/);
});

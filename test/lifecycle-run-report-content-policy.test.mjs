import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { applyLifecycleRunReportContentPolicy, LifecycleRunContentPolicyError } from "../src/lifecycle-run-report-content-policy.mjs";

const sealPolicy = body => ({...body,policyDigest:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key])=>!["apiVersion","kind","policyDigest"].includes(key))))});
const policy = sealPolicy({
  apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunContentPolicy",policyId:"report-policy-1",version:"1.0.0",
  rules:[
    {classification:"public",disposition:"allow"},
    {classification:"internal",disposition:"allow"},
    {classification:"restricted",disposition:"redact"},
    {classification:"secret",disposition:"omit"},
    {classification:"credential",disposition:"redact"},
    {classification:"prompt",disposition:"omit"},
    {classification:"raw-tool-log",disposition:"omit"},
    {classification:"unknown",disposition:"omit"},
  ],unknownClassification:"omit",authority:"content-filter-only",
});
const policyRef = {artifactId:policy.policyId,digest:policy.policyDigest};

test("allowed summaries and artifact links retain exact values",()=>{
  const fields=[
    {path:"/summary",classification:"public",value:"Three stages completed."},
    {path:"/artifacts/0",classification:"internal",value:{artifactId:"result-1",digest:`sha256:${"a".repeat(64)}`}},
  ];
  const result=applyLifecycleRunReportContentPolicy({policy,policyRef,fields});
  assert.deepEqual(result.entries.map(({disposition})=>disposition),["allow","allow"]);
  assert.deepEqual(result.entries[1].value,fields[1].value);
  assert.match(result.evaluationDigest,/^sha256:[0-9a-f]{64}$/);
});

test("redacted and omitted fields never retain protected bytes",()=>{
  const marker="do-not-expose-this-value";
  const result=applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[
    {path:"/diagnostics/0",classification:"restricted",value:marker},
    {path:"/observations/0",classification:"raw-tool-log",value:marker},
  ]});
  assert.deepEqual(result.entries.map(({disposition})=>disposition),["redact","omit"]);
  assert.equal(result.entries[0].value,"[REDACTED]");
  assert.equal("value" in result.entries[1],false);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(marker));
});

test("secret-like content overrides an otherwise allowed classification",()=>{
  const result=applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[
    {path:"/summary",classification:"public",value:{password:"unapproved-value"}},
    {path:"/diagnostic",classification:"public",value:"Authorization: Bearer abc.def.ghi"},
  ]});
  assert.deepEqual(result.entries.map(({disposition})=>disposition),["redact","redact"]);
  assert.doesNotMatch(JSON.stringify(result),/unapproved-value|abc\.def\.ghi/);
});

test("unknown and missing classifications fail closed with explicit omission",()=>{
  const result=applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[{path:"/new-field",value:"unclassified"}]});
  assert.deepEqual(result.entries,[{path:"/new-field",classification:"unknown",disposition:"omit",reason:"unknown-classification"}]);
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[{path:"/bad",classification:"future",value:"x"}]}),LifecycleRunContentPolicyError);
});

test("missing, stale, drifted, or substituted policy sources fail before evaluation",()=>{
  assert.throws(()=>applyLifecycleRunReportContentPolicy({fields:[]}),/invalid policy/);
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy,fields:[]}),/exact policy identity and digest/);
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy,policyRef:{...policyRef,artifactId:"substitute"},fields:[]}),/exact policy identity and digest/);
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy:{...policy,version:"0.9.0"},policyRef,fields:[]}),/invalid policy/);
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy:{...policy,rules:policy.rules.slice(0,-1)},policyRef,fields:[]}),/invalid policy/);
});

test("ordering is deterministic and duplicate report paths fail closed",()=>{
  const fields=[{path:"/b",classification:"public",value:"b"},{path:"/a",classification:"public",value:"a"}];
  assert.equal(applyLifecycleRunReportContentPolicy({policy,policyRef,fields}).evaluationDigest,applyLifecycleRunReportContentPolicy({policy,policyRef,fields:structuredClone(fields)}).evaluationDigest);
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[fields[0],fields[0]]}),/duplicate field path/);
});

test("only closed exact provenance references can enter safe output",()=>{
  const source={artifactId:"workflow-record-1",digest:`sha256:${"b".repeat(64)}`};
  const result=applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[{path:"/summary",classification:"public",value:"safe",source}]});
  assert.deepEqual(result.entries[0].source,source);

  const rejectedSources=[
    {artifactId:"workflow-record-1",digest:`sha256:${"b".repeat(64)}`,password:"must-not-pass"},
    {artifactId:"password=must-not-pass",digest:`sha256:${"b".repeat(64)}`},
    {artifactId:"workflow-record-1",digest:`sha256:${"b".repeat(64)}`,location:"unbound source substitution"},
    {artifactId:"workflow-record-1",digest:"sha256:not-a-digest"},
    {artifactId:"workflow-record-1",digest:`sha256:${"b".repeat(63)}c`,substitutedArtifactId:"workflow-record-2"},
  ];
  for(const rejected of rejectedSources){
    assert.throws(()=>applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[{path:"/summary",classification:"public",value:"safe",source:rejected}]}),/source/);
  }
  assert.throws(()=>applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[{path:"/summary",classification:"public",value:"safe",source,unbound:"must-not-pass"}]}),/unknown property/);
});

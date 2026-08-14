import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { renderLifecycleRunReport,renderLifecycleRunReportMarkdownBytes,createLifecycleRunReportAccess,LifecycleRunReportMarkdownError } from "../src/lifecycle-run-report-markdown.mjs";

const ref=(artifactId,digest=canonicalJsonDigest({artifactId}))=>({artifactId,digest});
const seal=(value,field)=>({...value,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
const source=ref("fact-1");
const metric={name:"duration",availability:"measured",value:12,unit:"milliseconds",provenance:{kind:"host",artifact:ref("clock")}};
const stage=(componentId,sequence,status="completed")=>({componentKind:"module",componentId,sequence,operation:"execute",adapterBindings:[{id:`adapter-${componentId}`,version:"1.0.0",configurationDigest:ref("configuration").digest}],status,outcome:status==="failed"?"failed":"completed",gateResult:"not-applicable",rework:{attemptCount:status==="active"?2:1,replayed:status==="active",predecessorAttempts:[]},performance:[metric],importantArtifacts:[ref(`output-${componentId}`)],nextAction:{disposition:"none"},sourceFacts:[source]});
const snapshot=seal({apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunSnapshot",snapshotId:"snapshot-1",runId:"run-1",ledger:ref("ledger-1"),traceabilityGraph:ref("graph-1"),stages:[stage("Build",0),stage("Conditional",1,"skipped"),stage("Repeat",2,"active"),stage("Failure",3,"failed")],importantArtifacts:[ref("output-Build")],traceabilityPaths:[{pathId:"path-1",from:ref("requirement"),to:ref("output-Build"),graphEvidence:ref("graph-1")}],diagnostics:[],adapterAssessments:[{adapter:{id:"adapter-Build",version:"1.0.0",configurationDigest:ref("configuration").digest},maturity:"fixture-conformant",comparability:{disposition:"unavailable",reason:"No peer run."}}],metrics:[metric],nextAction:{disposition:"available",description:"Resume Repeat."},authority:"read-only-projection"},"snapshotDigest");
const policy=seal({apiVersion:"devrelay.dev/v1alpha1",kind:"LifecycleRunContentPolicy",policyId:"policy-1",version:"1.0.0",rules:[{classification:"public",disposition:"allow"},{classification:"internal",disposition:"allow"},{classification:"restricted",disposition:"redact"},{classification:"secret",disposition:"omit"},{classification:"credential",disposition:"omit"},{classification:"prompt",disposition:"omit"},{classification:"raw-tool-log",disposition:"omit"},{classification:"unknown",disposition:"omit"}],unknownClassification:"omit",authority:"content-filter-only"},"policyDigest");
const policyRef={artifactId:policy.policyId,digest:policy.policyDigest};

test("renders dynamic lifecycle states, links, metrics, and read-only access deterministically",()=>{
  const options={snapshot,contentPolicy:policy,contentPolicyRef:policyRef,evidence:[ref("evidence-1")]};
  const one=renderLifecycleRunReport(options),two=renderLifecycleRunReport(options);
  assert.deepEqual(one.bytes,two.bytes);
  assert.match(one.markdown,/^# Lifecycle Run Report\n\n## Executive summary/);
  assert.match(one.markdown,/\| 3\. `Repeat` .*2 attempts, resumed/);
  assert.match(one.markdown,/\| 4\. `Failure`/);
  assert.match(one.markdown,/devrelay-artifact:\/\/output-Build\?digest=/);
  assert.equal(one.access.access,"read-only");
  assert.equal(one.access.markdownReport.digest,`sha256:${createHash("sha256").update(one.bytes).digest("hex")}`);
});

test("policy omits denied fields and redacts secret-like canonical values",()=>{
  const markdown=renderLifecycleRunReport({snapshot,contentPolicy:policy,contentPolicyRef:policyRef,classifications:{"/stages/0/operation":"secret"}}).markdown;
  assert.match(markdown,/\| 1\. `Build` \| — \|/);
  const unsafe=structuredClone(snapshot);unsafe.nextAction={disposition:"available",description:"password=hunter2"};delete unsafe.snapshotDigest;unsafe.snapshotDigest=canonicalJsonDigest(Object.fromEntries(Object.entries(unsafe).filter(([key])=>!["apiVersion","kind"].includes(key))));
  assert.doesNotMatch(renderLifecycleRunReport({snapshot:unsafe,contentPolicy:policy,contentPolicyRef:policyRef}).markdown,/hunter2/);
});

test("bytes normalize to UTF-8 NFC/LF and access rejects substituted policy",()=>{
  const bytes=renderLifecycleRunReportMarkdownBytes(snapshot,{contentPolicy:policy,contentPolicyRef:policyRef});
  assert.equal(bytes.toString("utf8").includes("\r"),false);
  assert.throws(()=>createLifecycleRunReportAccess({snapshot,contentPolicy:policy,contentPolicyRef:ref("wrong"),markdownBytes:bytes}),LifecycleRunReportMarkdownError);
});

test("reordered equivalent collections render byte-identically",()=>{
  const reordered=structuredClone(snapshot);
  reordered.stages.reverse();reordered.importantArtifacts.reverse();reordered.metrics.reverse();reordered.adapterAssessments.reverse();reordered.traceabilityPaths.reverse();reordered.diagnostics.reverse();
  delete reordered.snapshotDigest;reordered.snapshotDigest=canonicalJsonDigest(Object.fromEntries(Object.entries(reordered).filter(([key])=>!["apiVersion","kind"].includes(key))));
  const options={contentPolicy:policy,contentPolicyRef:policyRef};
  assert.deepEqual(renderLifecycleRunReportMarkdownBytes(snapshot,options),renderLifecycleRunReportMarkdownBytes(reordered,options));
});

test("stage source facts are linked and every top-level link is policy-filtered",()=>{
  const markdown=renderLifecycleRunReport({snapshot,contentPolicy:policy,contentPolicyRef:policyRef,classifications:{"/ledger":"secret","/traceabilityGraph":"secret","/stages/0/sourceFacts/0":"secret","/importantArtifacts/0":"secret"}}).markdown;
  assert.match(markdown,/- Ledger: —/);
  assert.match(markdown,/- Traceability graph: —/);
  assert.match(markdown,/\| 1\. `Build` .*\| None \| none \|/);
  assert.match(markdown,/## Important artifacts\n\n\n## Next action/);
  assert.match(renderLifecycleRunReport({snapshot,contentPolicy:policy,contentPolicyRef:policyRef}).markdown,/devrelay-artifact:\/\/fact-1\?digest=/);
});

test("table text escapes backslashes before pipes without creating an unescaped delimiter",()=>{
  const escaped=structuredClone(snapshot);
  escaped.stages[0].operation="C:\\workspace|verify";
  delete escaped.snapshotDigest;
  escaped.snapshotDigest=canonicalJsonDigest(Object.fromEntries(Object.entries(escaped).filter(([key])=>!["apiVersion","kind"].includes(key))));
  const markdown=renderLifecycleRunReport({snapshot:escaped,contentPolicy:policy,contentPolicyRef:policyRef}).markdown;
  assert.match(markdown,/C:\\\\workspace\\\|verify/);
  assert.doesNotMatch(markdown,/C:\\workspace\\\|verify/);
});


test("summary view is concise, binding-rich, and Windows encoding safe",()=>{
  const result=renderLifecycleRunReport({view:"summary",snapshot,contentPolicy:policy,contentPolicyRef:policyRef});
  assert.equal(result.access.view,"summary");
  assert.match(result.markdown,/\| Stage \| Operation \| Adapters \|/);
  assert.match(result.markdown,/adapter-Build/);
  assert.doesNotMatch(result.markdown,/## Run performance|## Adapter maturity|## Traceability|## Diagnostics|## Important artifacts/);
  assert.doesNotMatch(result.markdown,/â|→|—|\r/);
  assert.doesNotMatch(result.markdown,/\.\./);
  assert.ok(result.markdown.length < renderLifecycleRunReport({snapshot,contentPolicy:policy,contentPolicyRef:policyRef}).markdown.length);
});

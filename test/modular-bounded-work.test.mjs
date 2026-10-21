// Synthetic aligned project and human decisions. These real Node assertions
// exercise the stated criteria; they are not production authentication or owner acceptance.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp,mkdir,writeFile,readFile,rm,access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson,canonicalJsonDigest,sha256Digest } from "../src/content-digest.mjs";
import { createGovernedCodingFixture } from "./governed-coding-fixture.mjs";
import { authCard } from "./bounded-work-fixture.mjs";
import { activateGovernedCodingProject,inspectGovernedCodingProject,planGovernedCodingRequest,runGovernedCodingRequest } from "../examples/modular/coding-governed-host.mjs";
import { inspectBoundedCodingWork,prepareBoundedCodingWork,reviewBoundedCodingWork,cancelBoundedCodingWork } from "../examples/modular/coding-bounded-host.mjs";
import { createCodingStorage } from "../examples/modular/coding-storage.mjs";
import { validateCodingReplayBundle } from "../examples/modular/coding-replay-bundle.mjs";
import { fixture, preparation, decision, noEffects, bundle, git, original, first, second } from "./modular-bounded-work-fixture.mjs";

test("two ordinary code changes reuse unchanged upstream approvals with genuine criterion assertions and full history",async t=>{
 const f=await fixture(t);const upstream={requirements:f.base.bundle.invocations.requirements,architecture:f.base.bundle.invocations.architecture};
 for(const [index,content] of [first,second].entries()){
  const id="change-"+(index+1);
  const current=inspectGovernedCodingProject(f.workspace);
  let input,card,approved;
  if(index===1) {
    // A clean separate Node process plans and captures the synthetic decision
    // after the first commit; no in-process receipt/cache can carry authority.
    const runner=join(f.root,"second-planning.mjs"),payload=join(f.root,"second-planning.json");
    await writeFile(payload,JSON.stringify({workspace:f.workspace,root:f.root,base:{heads:f.base.heads,workItem:f.base.workItem}}));
    await writeFile(runner,`import {readFile} from 'node:fs/promises';
import {preparation,decision} from '${new URL("./modular-bounded-work-fixture.mjs",import.meta.url).href}';
import {prepareBoundedCodingWork,reviewBoundedCodingWork} from '${new URL("../examples/modular/coding-bounded-host.mjs",import.meta.url).href}';
const f=JSON.parse(await readFile(process.argv[2])); const input=await preparation(f,'change-2'); const card=await prepareBoundedCodingWork(input); const approved=await reviewBoundedCodingWork({workspace:f.workspace,preparationId:'change-2',expectedHeadDigest:card.evidence.headDigest,captureDecision:decision('change-2')}); console.log(JSON.stringify({input,card,approved}));
`);
    const child=spawnSync(process.execPath,[runner,payload],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});
    assert.equal(child.status,0,child.stderr||child.stdout);({input,card,approved}=JSON.parse(child.stdout));
  } else { input=await preparation(f,id);card=await prepareBoundedCodingWork(input); }
  assert.equal(card.status,"ready-for-review");
  assert(card.criteria.some(c=>c.statement.includes("matching user")));assert.equal(await readFile(join(f.workspace,"auth.mjs"),"utf8"),index?first:original);
  if(!index)await noEffects(f);
  approved??=await reviewBoundedCodingWork({workspace:f.workspace,preparationId:id,expectedHeadDigest:current.headDigest,captureDecision:decision(id)});
  assert.equal(approved.status,"already-authorized");
  assert.equal((await reviewBoundedCodingWork({workspace:f.workspace,preparationId:id,expectedHeadDigest:approved.headDigest,captureDecision:()=>{throw Error("must not ask twice");}})).status,"already-authorized");
  const request={requestId:id,goal:input.proposal.workItem.objective,readPaths:authCard.readPaths,changes:[{path:"auth.mjs",beforeDigest:sha256Digest(Buffer.from(index?first:original)),content}],testFiles:authCard.testFiles,timeoutMs:10000};
  const plan=await planGovernedCodingRequest({workspace:f.workspace,request});const run=await runGovernedCodingRequest({workspace:f.workspace,plan});
  assert.equal(run.result.outcome,"verified");assert.match(run.report.verification.stdout,/AC-AUTH-001/);assert.match(run.report.verification.stdout,/AC-AUTH-DISCLOSURE-001/);assert.match(run.report.verification.stdout,/AC-AUTH-PERFORMANCE-001/);assert.equal(run.governance.acceptance,"not-recorded");
  assert.equal((await runGovernedCodingRequest({workspace:f.workspace,plan})).replayed,true);
  const savedPlan=join(f.root,id+"-plan.json");await writeFile(savedPlan,JSON.stringify(plan));
  const fresh=spawnSync(process.execPath,[fileURLToPath(new URL("../examples/modular/desktop.mjs",import.meta.url)),"governed-run",f.workspace,savedPlan],{encoding:"utf8",timeout:30000});
  assert.equal(fresh.status,0,fresh.stderr||fresh.stdout);assert.equal(JSON.parse(fresh.stdout).replayed,true);
  const exported=bundle(f);assert.equal(exported.formatVersion,2);assert.equal(exported.workHistory.length,index+1);
  assert.deepEqual(exported.invocations.requirements,upstream.requirements);assert.deepEqual(exported.invocations.architecture,upstream.architecture);
  const resolved=await validateCodingReplayBundle(exported);assert.equal(resolved.governance.workBreakdown.baseline.workItems.length,index+2);
  assert.deepEqual(resolved.heads.architectureBaseline,f.base.heads.architectureBaseline);assert.deepEqual(resolved.heads.requirementsBaseline,f.base.heads.requirementsBaseline);
  if(index)assert.notEqual(resolved.heads.repositorySnapshot.digest,f.base.heads.repositorySnapshot.digest);
  git(f.workspace,"add","auth.mjs");git(f.workspace,"commit","--quiet","-m","Synthetic owner integrates bounded change "+(index+1));
 }
 assert.equal(await readFile(join(f.workspace,".test-count"),"utf8"),"run\nrun\n");
});

test("cancel, reject, revised card and stale head cannot authorize source effects",async t=>{
 const f=await fixture(t);const firstInput=await preparation(f,"cancelled");const card=await prepareBoundedCodingWork(firstInput);
 await cancelBoundedCodingWork({workspace:f.workspace,preparationId:firstInput.preparationId,expectedHeadDigest:f.head.headDigest});
 await assert.rejects(reviewBoundedCodingWork({workspace:f.workspace,preparationId:firstInput.preparationId,expectedHeadDigest:f.head.headDigest,captureDecision:decision("cancelled")}),/cancelled|rejected|replaced/);
 await noEffects(f);
 await assert.rejects(prepareBoundedCodingWork(firstInput),/cancelled|rejected|superseded/);
 const rejected=await preparation(f,"rejected");await prepareBoundedCodingWork(rejected);
 assert.equal((await reviewBoundedCodingWork({workspace:f.workspace,preparationId:"rejected",expectedHeadDigest:f.head.headDigest,captureDecision:decision("rejected","reject")})).status,"rejected");
 const old=await preparation(f,"old");await prepareBoundedCodingWork(old);const revised=await preparation(f,"revised");revised.proposal.workItem.objective+=" Review this revised wording.";await prepareBoundedCodingWork(revised);
 await assert.rejects(reviewBoundedCodingWork({workspace:f.workspace,preparationId:"old",expectedHeadDigest:f.head.headDigest,captureDecision:decision("old")}),/replaced/);
 git(f.workspace,"commit","--quiet","--allow-empty","-m","External Git head drift");
 await assert.rejects(reviewBoundedCodingWork({workspace:f.workspace,preparationId:"revised",expectedHeadDigest:f.head.headDigest,captureDecision:decision("revised")}),/stale|head/i);await noEffects(f);
});

test("full-change and missing original decision stop the front door without effects",async t=>{
 const f=await fixture(t);const input=await preparation(f,"scope-change");input.assessment.changes.interfaces="changed";
 await assert.rejects(prepareBoundedCodingWork(input),{code:"FULL_CHANGE_REQUIRED"});await noEffects(f);
 const valid=await preparation(f,"no-decision");await prepareBoundedCodingWork(valid);
 await assert.rejects(reviewBoundedCodingWork({workspace:f.workspace,preparationId:"no-decision",expectedHeadDigest:f.head.headDigest}),{code:"HUMAN_DECISION_REQUIRED"});await noEffects(f);
});


test("v2 seeds and retains genuine unchanged no-work authority without minting another approval",async t=>{
 const f=await fixture(t,{noWorkArchitectureId:"EL-CLIENT"});
 const before=f.base.governance.workBreakdown.baseline.coverageDispositions.find(entry=>entry.scopeRef==="EL-CLIENT");
 assert.equal(before.disposition,"no-work-required");
 const input=await preparation(f,"retained-no-work");await prepareBoundedCodingWork(input);
 await reviewBoundedCodingWork({workspace:f.workspace,preparationId:input.preparationId,expectedHeadDigest:f.head.headDigest,captureDecision:decision(input.preparationId)});
 const exported=bundle(f),resolved=await validateCodingReplayBundle(exported);
 assert.deepEqual(resolved.governance.workBreakdown.baseline.coverageDispositions.find(entry=>entry.scopeRef==="EL-CLIENT"),before);
 assert.deepEqual(exported.invocations.requirements,f.base.bundle.invocations.requirements);
 await noEffects(f);
 const broken=structuredClone(exported);broken.workHistory=[];
 await assert.rejects(validateCodingReplayBundle(broken),/empty v2 history|unreferenced artifact/);
});

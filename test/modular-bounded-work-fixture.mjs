// Synthetic aligned project and human decisions. These real Node assertions
// exercise the stated criteria; they are not production authentication or owner acceptance.
import assert from "node:assert/strict";
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
export const source=lookup=>`// Synthetic regression fixture only, not production credential storage.\nexport function createAuthenticator(records) {\n  const identities = records.map(record => ({ ...record }));\n  ${lookup.startsWith("const index")?lookup:""}\n  return async (id, credential) => {\n    const user = ${lookup.startsWith("const index")?"index.get(id)":lookup};\n    if (!user || user.credential !== credential) return { error: "Invalid credentials" };\n    return { authenticated: true, userId: user.id };\n  };\n}\n`;
export const original=source("identities.filter(user => user.id === id)[0]");
export const first=source("identities.find(user => user.id === id)");
export const second=source("const index = new Map(); for (const user of identities) if (!index.has(user.id)) index.set(user.id, user);");
export const tests=`import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {appendFileSync} from 'node:fs';
import {createAuthenticator} from '../auth.mjs';
appendFileSync('.test-count','run\\n');
const records=Array.from({length:1000},(_,i)=>({id:'user-'+i,credential:'synthetic-'+i}));
const authenticate=createAuthenticator(records);
test('AC-AUTH-001: registered valid credentials establish the matching user session',async()=>{
 assert.deepEqual(await authenticate('user-17','synthetic-17'),{authenticated:true,userId:'user-17'});
 const duplicate=createAuthenticator([{id:'same',credential:'first'},{id:'same',credential:'second'}]);
 assert.deepEqual(await duplicate('same','first'),{authenticated:true,userId:'same'});
 assert.deepEqual(await duplicate('same','second'),{error:'Invalid credentials'});
});
test('AC-AUTH-DISCLOSURE-001: known and unknown negative responses are indistinguishable',async()=>{
 assert.deepEqual(await authenticate('user-17','wrong'),await authenticate('absent','wrong'));
});
test('AC-AUTH-PERFORMANCE-001: p95 <=500ms under 100 concurrent sign-in attempts',async()=>{
 const durations=await Promise.all(Array.from({length:100},async(_,i)=>{const start=performance.now();assert.deepEqual(await authenticate('user-'+i,'synthetic-'+i),{authenticated:true,userId:'user-'+i});return performance.now()-start;}));
 durations.sort((a,b)=>a-b); assert(durations[94]<=500,'p95 exceeded the approved 500ms target');
});
`;
export function git(workspace,...args){const r=spawnSync("git",["-C",workspace,"-c","user.name=Synthetic DevRelay Fixture","-c","user.email=fixture@example.invalid","-c","core.autocrlf=false",...args],{encoding:"utf8",timeout:10000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
export async function fixture(t,{noWorkArchitectureId}={}){
 const root=await mkdtemp(join(tmpdir(),"devrelay-bounded-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const workspace=join(root,"project");await mkdir(join(workspace,"test"),{recursive:true});
 await writeFile(join(workspace,"auth.mjs"),original);await writeFile(join(workspace,"test/auth.test.mjs"),tests);await writeFile(join(workspace,".gitignore"),".test-count\n");
 git(workspace,"init","--quiet");git(workspace,"add",".");git(workspace,"commit","--quiet","-m","Initial synthetic auth project");
 const commit=git(workspace,"rev-parse","HEAD"),tree=git(workspace,"rev-parse","HEAD^{tree}");
 const base=await createGovernedCodingFixture(authCard,{repositoryRevision:commit,repositoryTreeDigest:canonicalJsonDigest({commit,tree}),noWorkArchitectureId});
 const head=await activateGovernedCodingProject({workspace,bundle:base.bundle});
 return {root,workspace,base,head};
}
export function evidence(value,id){const bytes=Buffer.from(canonicalJson(value)+"\n");return {ref:{artifactId:id,schema:"https://devrelay.dev/evidence/synthetic-semantic-review/v1",mediaType:"application/json",digest:sha256Digest(bytes),uri:"artifact://synthetic/"+id},bytesBase64:bytes.toString("base64")};}
export async function preparation(f,id){
 const observed=await inspectBoundedCodingWork({workspace:f.workspace,paths:authCard.readPaths});
 const review=evidence({synthetic:true,repository:observed.repositorySnapshot.ref,inspection:observed.inspection.ref,conclusion:"Exact source review: first-match lookup optimization only. Credential comparison, session shape, negative responses, dependencies and architecture unchanged."},"review-"+id);
 const assessment={apiVersion:"devrelay.dev/v1alpha1",kind:"BoundedDesignReuseAssessment",assessmentId:"assessment-"+id,requirementsBaseline:observed.heads.requirementsBaseline,projectOverviewBaseline:observed.heads.projectOverviewBaseline,architectureBaseline:observed.heads.architectureBaseline,contractDisposition:observed.heads.contractDisposition,historicalRepositorySnapshot:f.base.heads.repositorySnapshot,currentRepositorySnapshot:observed.repositorySnapshot.ref,criterionIds:[...authCard.criterionIds],architectureIds:[...f.base.workItem["architecture-refs"]],contractIds:[],rationale:"Preserve approved service, identity source, response and credential semantics; optimize only the existing internal first-match lookup.",changes:Object.fromEntries(["criteria","productIntent","interfaces","dependencies","platform","security","migrations","architecture"].map(k=>[k,"unchanged"])),inspectionEvidence:[observed.inspection.ref],review:{reviewerId:"synthetic-independent-reviewer",method:"semantic-review",conclusion:"reuse-approved-design",evidence:review.ref},revalidatedEvidence:[]};
 const workItem={...structuredClone(f.base.workItem),id:"WI-"+id.toUpperCase(),objective:"Optimize existing identity lookup while preserving every approved authentication behavior.","bounded-scope":{included:["Equivalent internal first-match identity lookup optimization in auth.mjs."],excluded:["Security behavior, public interfaces, new dependencies, migrations, architecture and new criteria."]},"verification-plan":{checks:[{id:"VC-"+id.toUpperCase(),method:"Run test/auth.test.mjs with real Node assertions for all three mapped criteria.",successCriteria:"Matching registered session; known/unknown failures equal; 100 concurrent attempts p95 <=500ms; duplicate identity first-match semantics unchanged."}]}};
 return {workspace:f.workspace,preparationId:id,assessment,evidence:[review],proposal:{workItem,changeCard:{...structuredClone(authCard),workItemId:workItem.id}}};
}
export const decision=(id,choice="approve")=>async()=>({decision:choice,originalMessage:{id:"synthetic-human-"+id,author:"synthetic-test-owner",text:choice==="approve"?"Approve this exact synthetic work and reviewed reuse card.":"Reject this exact synthetic work card.",timestamp:"2026-10-21T00:00:00Z"}});
export async function noEffects(f,expected=original){assert.equal(await readFile(join(f.workspace,"auth.mjs"),"utf8"),expected);await assert.rejects(access(join(f.workspace,".test-count")),{code:"ENOENT"});}
export function bundle(f){const s=createCodingStorage(join(f.workspace,".devrelay/modular-coding"));try{return s.json(s.host.readRun("governed-project-head").state.bundle);}finally{s.close();}}

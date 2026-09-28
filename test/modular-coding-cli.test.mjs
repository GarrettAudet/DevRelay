import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root=fileURLToPath(new URL("../",import.meta.url));
const cli=fileURLToPath(new URL("../examples/modular/code.mjs",import.meta.url));
const context=fileURLToPath(new URL("../examples/modular/context",import.meta.url));
function run(args, cwd=root) {
  return spawnSync(process.execPath,[cli,...args],{cwd,encoding:"utf8",windowsHide:true,timeout:30000});
}
async function project(t, correct=true) {
  const root=await mkdtemp(join(tmpdir(),"devrelay-coding-cli-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,"new-project");
  await mkdir(workspace);
  const request={requestId:"hello",goal:"Create a greeting module with a real test",readPaths:[],
    changes:[
      {path:"greeting.mjs",beforeDigest:null,content:'export const greet = name => '+(correct?'"Hello, " + name':'"wrong"')+';\n'},
      {path:"test/greeting.test.mjs",beforeDigest:null,content:'import {test} from "node:test"; import assert from "node:assert/strict"; import {greet} from "../greeting.mjs"; test("greets Ada",()=>assert.equal(greet("Ada"),"Hello, Ada"));\n'},
    ],testFiles:["test/greeting.test.mjs"],timeoutMs:10000};
  const requestPath=join(root,"request.json");
  await writeFile(requestPath,JSON.stringify(request));
  return {workspace,requestPath};
}
test("coding CLI lists exact native bindings without a project",()=>{
  const result=run(["--list"]);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).map(item=>item.id),
    ["native-repository-inventory","native-file-change","native-node-test"]);
});
test("Desktop command builds a new project, reports evidence and replays",async t=>{
  const {workspace,requestPath}=await project(t);
  const first=run([workspace,context,requestPath]);
  assert.equal(first.status,0,first.stderr);
  const result=JSON.parse(first.stdout);
  assert.equal(result.result.outcome,"verified");
  assert.match(result.report.verification.stdout,/greets Ada/);
  assert.match(result.report.diff,/\+\+\+ b\/greeting.mjs/);
  assert.match(await readFile(join(workspace,"greeting.mjs"),"utf8"),/export const greet/);
  const second=run([workspace,context,requestPath]);
  assert.equal(second.status,0,second.stderr);
  assert.equal(JSON.parse(second.stdout).replayed,true);
});
test("Desktop command exits unsuccessfully when real tests fail",async t=>{
  const {workspace,requestPath}=await project(t,false);
  const result=run([workspace,context,requestPath]);
  assert.equal(result.status,1,result.stderr);
  assert.equal(JSON.parse(result.stdout).result.outcome,"tests_failed");
});
test("exported coding CLI import is inert",()=>{
  const result=spawnSync(process.execPath,["--input-type=module","-e",'await import("devrelay/examples/modular/code.mjs")'],
    {cwd:root,encoding:"utf8",windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,"");
});
test("malformed CLI arguments reject without executing a workflow",()=>{
  const result=run([]);
  assert.equal(result.status,2);
  assert.match(result.stderr,/Usage:/);
});

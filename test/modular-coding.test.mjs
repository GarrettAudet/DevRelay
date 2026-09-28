
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let createCodingWorkflow;
try { ({ createCodingWorkflow } = await import("../examples/modular/coding.mjs")); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const contextRoot = new URL("../examples/modular/context/", import.meta.url);
const context = {
  requirementsBytes: await readFile(new URL("requirements-baseline.json", contextRoot)),
  overviewBytes: await readFile(new URL("project-overview-baseline.json", contextRoot)),
  overviewMarkdownBytes: await readFile(new URL("ProjectOverview.md", contextRoot)),
};
const digest = text => "sha256:" + createHash("sha256").update(text).digest("hex");
const broken = "export const add = (a, b) => a - b;\n";
const fixed = "export const add = (a, b) => a + b;\n";
const testSource = 'import {test} from "node:test"; import assert from "node:assert/strict"; import {appendFileSync} from "node:fs"; import {add} from "../add.mjs"; appendFileSync(new URL("./runs.txt",import.meta.url),"run\\n"); test("adds",()=>assert.equal(add(2,3),5));\n';

async function fixture(t, empty = false) {
  assert.equal(typeof createCodingWorkflow, "function", "coding workflow API must exist");
  const root = await mkdtemp(join(tmpdir(), "devrelay-coding-"));
  const workspace = join(root, "project"), stateDirectory = join(root, "state");
  await mkdir(workspace);
  const hosts = [];
  t.after(async () => { for (const host of hosts) host.close(); await rm(root, {recursive:true,force:true}); });
  if (!empty) {
    await mkdir(join(workspace, "test"));
    await writeFile(join(workspace, "add.mjs"), broken);
    await writeFile(join(workspace, "test/add.test.mjs"), testSource);
  }
  const reopen = (overrides = {}) => {
    const host = createCodingWorkflow({workspace,stateDirectory,...context,...overrides});
    hosts.push(host);
    return host;
  };
  const request = {requestId:"fix-add",goal:"Make addition return the sum",readPaths:[],
    changes:[{path:"add.mjs",beforeDigest:empty ? null : digest(broken),content:fixed}],
    testFiles:["test/add.test.mjs"],timeoutMs:10000};
  if (empty) request.changes.push({path:"test/add.test.mjs",beforeDigest:null,content:testSource});
  return {root,workspace,stateDirectory,request,reopen,host:reopen()};
}

test("existing project: real inventory, exact file change, Node tests and reviewable diff", async t => {
  const {host,request,workspace}=await fixture(t);
  const {result,report,replayed,currentWorkspaceMatches}=await host.execute(request);
  assert.equal(result.outcome,"verified");
  assert.equal(replayed,false);
  assert.equal(currentWorkspaceMatches,true);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),fixed);
  assert.equal(report.verification.exitCode,0);
  assert.match(report.verification.stdout,/adds/);
  assert.match(report.diff,/-export const add = \(a, b\) => a - b;/);
  assert.match(report.diff,/\+export const add = \(a, b\) => a \+ b;/);
  assert.ok(report.inventory.findings.some(item=>item.statement.includes("JavaScript")));
});

test("empty project: create source and test files and execute the same chain", async t => {
  const {host,request,workspace}=await fixture(t,true);
  const {result,report}=await host.execute(request);
  assert.equal(result.outcome,"verified");
  assert.equal(report.inventory,null);
  assert.equal(report.changes.length,2);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),fixed);
});

test("failed tests preserve the change and raw failure evidence without claiming verification", async t => {
  const {host,request,workspace}=await fixture(t);
  request.changes[0].content="export const add = () => 0;\n";
  const {result,report}=await host.execute(request);
  assert.equal(result.status,"failed");
  assert.equal(result.outcome,"tests_failed");
  assert.equal(report.verification.exitCode,1);
  assert.match(report.verification.stdout,/fail|ERR_ASSERTION|not ok/);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),request.changes[0].content);
});

test("all stale preimages reject before the first file is written", async t => {
  const {host,request,workspace}=await fixture(t);
  request.changes.push({path:"test/add.test.mjs",beforeDigest:digest("wrong"),content:""});
  await assert.rejects(host.execute(request),/stale|preimage|digest/i);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),broken);
});

test("full-chain preflight denies missing verifier grants before editing", async t => {
  const {host,request,workspace}=await fixture(t);
  const invocation=host.invocation(request);
  invocation.adapters.find(item=>item.step==="verify").grants=[];
  await assert.rejects(host.catalog.registry.execute(invocation,host.runtimeContext),/grant|capability/i);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),broken);
});

test("completed chain replays from durable storage without repeating tests", async t => {
  const {host,request,reopen,workspace}=await fixture(t);
  const first=await host.execute(request);
  host.close();
  const second=await reopen().execute(request);
  assert.equal(second.replayed,true);
  assert.deepEqual(second.result,first.result);
  assert.deepEqual(second.report,first.report);
  assert.equal(await readFile(join(workspace,"test/runs.txt"),"utf8"),"run\n");
});

test("replayed evidence explicitly reports a changed current workspace", async t => {
  const {host,request,workspace}=await fixture(t);
  await host.execute(request);
  await writeFile(join(workspace,"add.mjs"),"edited after verification\n");
  const replay=await host.execute(request);
  assert.equal(replay.replayed,true);
  assert.equal(replay.currentWorkspaceMatches,false);
});

test("request IDs cannot be rebound to changed content", async t => {
  const {host,request}=await fixture(t);
  await host.execute(request);
  await assert.rejects(host.execute({...request,goal:"different goal"}),/request.*(bound|different|reuse)|identity/i);
});

test("unsafe Windows paths and protected controls reject before any write", async t => {
  for (const path of ["../escape.mjs","C:/escape.mjs","a\\b.mjs","a/../b.mjs","CON","file.mjs:stream","file.mjs.",".git/config",".devrelay/state","AGENTS.md"]) {
    const {host,request,workspace}=await fixture(t);
    request.changes[0].path=path;
    await assert.rejects(host.execute(request),/path|protected|reserved|scope|request/i,path);
    assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),broken);
  }
});

test("junctions cannot redirect a declared edit outside the workspace", async t => {
  const {host,request,workspace,root}=await fixture(t);
  const outside=join(root,"outside");
  await mkdir(outside);
  await writeFile(join(outside,"add.mjs"),broken);
  await symlink(outside,join(workspace,"linked"),process.platform==="win32"?"junction":"dir");
  request.changes[0].path="linked/add.mjs";
  await assert.rejects(host.execute(request),/symlink|junction|link|reparse/i);
  assert.equal(await readFile(join(outside,"add.mjs"),"utf8"),broken);
});

test("uncertain edit after checkpoint failure is quarantined on a fresh host", async t => {
  const {host,request,reopen,workspace}=await fixture(t);
  const originalPut=host.runtimeContext.checkpoints.put;
  let writes=0;
  host.runtimeContext.checkpoints.put=async (...args)=>{
    if (++writes===2) throw new Error("simulated disk full");
    return originalPut(...args);
  };
  await assert.rejects(host.execute(request),/checkpoint.*disk full/i);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),fixed);
  host.close();
  await assert.rejects(reopen().execute(request),/quarantin|uncertain|interrupted/i);
  await assert.rejects(readFile(join(workspace,"test/runs.txt")),{code:"ENOENT"});
});

test("timed-out tests remain an uncertain effect and are not relaunched", async t => {
  const {host,request,reopen,workspace}=await fixture(t);
  await writeFile(join(workspace,"test/add.test.mjs"),'setInterval(()=>{},1000);\n');
  request.timeoutMs=100;
  await assert.rejects(host.execute(request),/timed out|timeout|ETIMEDOUT/i);
  host.close();
  await assert.rejects(reopen().execute(request),/quarantin|uncertain|interrupted/i);
});

test("file ancestor conflicts reject before any edit, including case aliases", async t => {
  for (const parent of ["parent", "PARENT"]) {
    const {host,request,workspace}=await fixture(t,true);
    request.changes.push({path:parent,beforeDigest:null,content:"file\n"});
    request.changes.push({path:"parent/child.mjs",beforeDigest:null,content:"export {};\n"});
    await assert.rejects(host.execute(request),/conflicting file paths/i);
    for (const path of ["add.mjs","test/add.test.mjs",parent,"parent/child.mjs"]) {
      await assert.rejects(readFile(join(workspace,path)),{code:"ENOENT"});
    }
    request.changes=request.changes.slice(0,2);
    assert.equal((await host.execute(request)).result.outcome,"verified");
  }
});

test("oversized UTF-8 replacements reject before any edit or request binding", async t => {
  const {host,request,workspace}=await fixture(t);
  request.changes.push({path:"large.mjs",beforeDigest:null,content:"//"+"一".repeat(400000)});
  await assert.rejects(host.execute(request),/replacement exceeds.*1 MiB/i);
  assert.equal(await readFile(join(workspace,"add.mjs"),"utf8"),broken);
  await assert.rejects(readFile(join(workspace,"large.mjs")),{code:"ENOENT"});
  request.changes.pop();
  assert.equal((await host.execute(request)).result.outcome,"verified");
});

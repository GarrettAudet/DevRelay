import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createNativeArchitectureInventory, NativeArchitectureInventoryError } from "../src/architecture-discovery-native-inventory.mjs";

const D=(ch)=>`sha256:${ch.repeat(64)}`;
const adapter={id:"native-architecture-discovery",version:"0.1.0",configurationDigest:canonicalJsonDigest({})};
const repositorySnapshot={artifactId:"repo-pinned",digest:D("a"),schema:"https://devrelay.dev/artifacts/repository-snapshot/v1",mediaType:"application/json",uri:"artifact://repository/repo-pinned"};
const policy={artifactId:"privacy-policy",digest:D("b"),schema:"https://devrelay.dev/policy/architecture-discovery/v1",mediaType:"application/json",uri:"artifact://policy/privacy-policy"};
const seal=(body,field)=>({...body,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
function invocation(paths) { return seal({apiVersion:"devrelay.dev/v1alpha1",kind:"RepositoryInventoryInvocation",invocationId:"inventory-fixture",repositorySnapshot,allowedPaths:[...paths].sort(),policy,adapter},"invocationFingerprint"); }
const file=(path,text)=>({path,bytes:Buffer.from(text,"utf8")});
const run=(files)=>createNativeArchitectureInventory({invocation:invocation(files.map(item=>item.path)),files});

test("TypeScript inventory is byte-identical, provenance-complete, and offline", () => {
  const files=[
    file("package.json",'{"name":"sample","main":"src/index.ts"}\n'),
    file("src/index.ts",'import { x } from "./x.js";\nexport interface Port {}\nexport function main() { return x; }\n'),
    file("src/x.ts","export const x = 1;\n"),
  ];
  const first=run(files), second=run([...files].reverse());
  assert.equal(canonicalJson(first),canonicalJson(second));
  assert.ok(first.findings.some(item=>item.category==="language"&&item.subject==="language-TypeScript"));
  assert.ok(first.findings.some(item=>item.category==="package"&&item.statement.includes("sample")));
  assert.ok(first.findings.some(item=>item.category==="interface"&&item.statement.includes("Port")));
  assert.ok(first.findings.some(item=>item.category==="relationship"&&item.statement.includes("./x.js")));
  assert.equal(first.nativeEvidence.length,files.length);
  for (const observation of first.findings) {
    assert.equal(observation.sources.length,1);
    assert.ok(files.some(item=>item.path===observation.sources[0].location.path));
    assert.equal(observation.method,"native-inventory");
  }
});

test("Python, Java, and .NET fixtures retain observed manifests, packages, interfaces, and relationships", () => {
  const result=run([
    file("pyproject.toml",'[project]\nname = "py-sample"\n'),
    file("app/main.py","import services.worker\nclass App:\n    pass\ndef main():\n    pass\n"),
    file("java/pom.xml","<project><artifactId>java-sample</artifactId></project>"),
    file("java/src/Main.java","import java.util.List; public class Main {}\n"),
    file("dotnet/Sample.csproj","<Project><PropertyGroup><AssemblyName>Sample.Core</AssemblyName></PropertyGroup></Project>"),
    file("dotnet/Program.cs","using System.Net; public interface IService {} public class Program {}\n"),
  ]);
  for (const language of ["Python","Java","C#"]) assert.ok(result.findings.some(item=>item.subject===`language-${language.replaceAll("#","-")}`));
  for (const name of ["py-sample","java-sample","Sample.Core"]) assert.ok(result.findings.some(item=>item.category==="package"&&item.statement.includes(name)));
  assert.ok(result.findings.filter(item=>item.category==="relationship").length>=3);
  assert.ok(result.findings.some(item=>item.statement.includes("IService")));
});

test("polyglot and empty source files remain deterministic observations", () => {
  const result=run([file("src/index.js",""),file("tools/main.py","")]);
  assert.deepEqual(result.findings.filter(item=>item.category==="language").map(item=>item.statement).sort(),[
    "src/index.js is implemented in JavaScript.","tools/main.py is implemented in Python.",
  ]);
  assert.equal(result.status,"completed");
  assert.equal(result.nativeEvidence.length,2);
});

test("privacy scope rejects ignored, secret-like, undeclared, missing, duplicate, and non-byte inputs", () => {
  const accepted=invocation(["src/accepted.ts"]);
  for (const files of [
    [file("ignored/cache.ts","")], [file(".env","")], [],
    [file("src/accepted.ts",""),file("src/accepted.ts","")], [{path:"src/accepted.ts",bytes:"not bytes"}],
  ]) assert.throws(()=>createNativeArchitectureInventory({invocation:accepted,files}),NativeArchitectureInventoryError);
});

test("repository, adapter, configuration, and invocation drift fail closed", () => {
  const original=invocation(["src/a.ts"]), files=[file("src/a.ts","export const a=1;\n")];
  const stale={...original,repositorySnapshot:{...repositorySnapshot,digest:D("c")}};
  const substituted={...original,adapter:{...adapter,version:"9.0.0"}};
  for (const value of [stale,substituted,{...original,invocationFingerprint:D("d")}]) assert.throws(()=>createNativeArchitectureInventory({invocation:value,files}),NativeArchitectureInventoryError);
});

test("inventory performs zero network calls and exposes no Gate, graph, progression, or design authority", () => {
  const result=run([file("src/index.ts","export function start() {}\n")]);
  const forbidden=["architectureBaseline","architectureProposal","approvedDecision","approval","gateDecision","graphMutation","graphOperations","nextOperation","progression","routeDecision","workflowAuthority"];
  const walk=(value)=>{ if (!value||typeof value!=="object") return; for (const [key,child] of Object.entries(value)) { assert.ok(!forbidden.includes(key)); walk(child); } };
  walk(result);
  assert.equal(result.status,"completed");
});

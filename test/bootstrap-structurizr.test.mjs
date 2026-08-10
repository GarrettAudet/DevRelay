import assert from "node:assert/strict";
import test from "node:test";
import { powershellExtractionInvocation } from "../scripts/bootstrap-structurizr.mjs";

test("Structurizr bootstrap binds both pinned extraction paths as PowerShell parameters",()=>{
  const archive="C:\\cache path\\temurin.zip",destination="C:\\toolchain path\\java";
  const invocation=powershellExtractionInvocation(archive,destination);
  assert.deepEqual(invocation.env,{DEVRELAY_ARCHIVE_PATH:archive,DEVRELAY_EXTRACTION_ROOT:destination});
  assert.match(invocation.args[2],/-LiteralPath \$env:DEVRELAY_ARCHIVE_PATH/);
  assert.match(invocation.args[2],/-DestinationPath \$env:DEVRELAY_EXTRACTION_ROOT/);
  assert.doesNotMatch(invocation.args[2],/\$args\[|param\(/);
});

test("Structurizr extraction rejects missing path bindings",()=>{
  assert.throws(()=>powershellExtractionInvocation("","C:\\java"),/required/);
  assert.throws(()=>powershellExtractionInvocation("C:\\temurin.zip",""),/required/);
});

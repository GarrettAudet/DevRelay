import assert from "node:assert/strict";
import test from "node:test";
import {
  pinnedToolchainUrl,
  powershellExtractionInvocation,
} from "../scripts/bootstrap-structurizr.mjs";

const structurizr = {
  version: "2026.06.28",
  url: "https://download.structurizr.com/structurizr-2026.06.28.war",
  sha256: "7bcee3932b1a6e62c07113008ec4959ced6700f666a3d02f708a1a2ebfdefed0",
};

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

test("Structurizr bootstrap accepts only the exact pinned download identity",()=>{
  assert.equal(pinnedToolchainUrl("structurizr", structurizr), structurizr.url);
  assert.throws(
    ()=>pinnedToolchainUrl("structurizr", { ...structurizr, url: "https://example.invalid/tool.war" }),
    /unapproved download/,
  );
  assert.throws(
    ()=>pinnedToolchainUrl("structurizr", { ...structurizr, sha256: "0".repeat(64) }),
    /unapproved download/,
  );
});

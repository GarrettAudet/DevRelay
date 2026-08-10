import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("BusinessAcceptance documentation preserves authority and no-retest boundaries",()=>{
  const guide=text("../docs/business-acceptance.md");
  assert.match(guide,/does not execute technical tests/);
  assert.match(guide,/canonical raw candidate bytes/);
  assert.match(guide,/canonical raw approval bytes/);
  assert.match(guide,/every approved business objective, success metric, and business-scope identity/);
  assert.match(guide,/Blocking graph diagnostics prevent release sealing/);
  assert.match(text("../README.md"),/BusinessAcceptance Gate operator guide/);
  assert.match(text("../CHANGELOG.md"),/0\.8\.0/);
});

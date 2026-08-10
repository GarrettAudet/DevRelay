import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as api from "../src/index.mjs";

const text=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const json=path=>JSON.parse(text(path));

test("0.9.0 preserves executable BusinessAcceptance boundaries, not attempt-004 artifacts",()=>{
  const pkg=json("../package.json");
  assert.equal(pkg.version,"0.9.0");
  assert.equal(typeof api.executeBusinessAcceptance,"function");
  assert.equal(typeof api.executeBusinessAcceptanceGate,"function");
  assert.equal(typeof api.createBusinessAcceptanceCheckpointController,"function");
  assert.equal(typeof api.createTraceabilityGraphService,"function");
  assert.equal(typeof api.businessAcceptanceTraceabilityContributor,"object");
  assert.match(text("../dogfood/business-acceptance/rejected-attempt-004.md"),/not authoritative/);
});

test("release conformance exercises real Core, Gate, checkpoints, contributor, and graph APIs",()=>{
  const core=text("./business-acceptance-core.test.mjs");
  const gate=text("./business-acceptance-gate.test.mjs");
  const trace=text("./business-acceptance-traceability.test.mjs");
  assert.match(core,/executeBusinessAcceptance\(/);
  assert.match(core,/createTraceabilityGraphService\(/);
  assert.match(core,/replayed,true/);
  assert.match(gate,/executeBusinessAcceptanceGate\(/);
  assert.match(gate,/gateCalls,0/);
  assert.match(trace,/businessAcceptanceTraceabilityContributor\.project\(/);
  assert.match(trace,/mergePrepared\(/);
  assert.match(trace,/diagnoseTraceabilityGraph\(/);
});

test("full V1 project acceptance remains explicitly pending",()=>{
  const disposition=json("../dogfood/business-acceptance/project-acceptance-pending.json");
  assert.equal(disposition.outcome,"pending");
  assert.deepEqual(disposition.blockingScope,["LifecycleRunReport"]);
  assert.equal(disposition.satisfiedScopeIds.length,0);
  assert.equal(disposition.authority,"release-conformance-observation");
});

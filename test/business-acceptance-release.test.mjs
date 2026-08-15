import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as api from "../src/index.mjs";

const text=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const json=path=>JSON.parse(text(path));

test("the current preview preserves executable BusinessAcceptance boundaries, not attempt-004 artifacts",()=>{
  const pkg=json("../package.json");
  assert.equal(pkg.version,"0.10.0-rc.2");
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

test("the historical pending disposition is superseded by the exact v0.10 accepted record",()=>{
  const historical=json("../dogfood/business-acceptance/project-acceptance-pending.json");
  const summary=json("../dogfood/v0.10-release-hardening/final-acceptance/final-acceptance-summary.json");
  const record=json("../dogfood/v0.10-release-hardening/final-acceptance/26-business-acceptance-record.json");
  assert.equal(historical.outcome,"pending");
  assert.deepEqual(historical.blockingScope,["LifecycleRunReport"]);
  assert.equal(historical.authority,"release-conformance-observation");
  assert.equal(record.outcome,"accepted");
  assert.equal(record.lifecycleDisposition,"construction-complete");
  assert.equal(summary.businessAcceptance.artifactId,record.recordId);
  assert.equal(summary.businessAcceptance.digest,record.recordDigest);
  assert.equal(summary.blockingDiagnostics,0);
});

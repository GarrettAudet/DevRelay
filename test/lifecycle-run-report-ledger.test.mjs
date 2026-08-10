import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createRunLedger, createRunLedgerCheckpoint, RunLedgerError, verifyRunLedgerCheckpoint } from "../src/lifecycle-run-report-ledger.mjs";

const source = id => ({kind:"module-execution-record",artifact:{artifactId:`record-${id}`,digest:`sha256:${id.repeat(64)}`}});
const fact = (id, event="completed", componentKind="module") => {
  const body={factId:`fact-${id}`,runId:"run-1",component:{kind:componentKind,id:`component-${id}`,version:"1.0.0"},event,source:source(id),authority:"trusted-workflow-record"};
  return {apiVersion:"devrelay.dev/v1alpha1",kind:"RunWorkflowFact",...body,factDigest:canonicalJsonDigest(body)};
};

test("arbitrary components, skips, failures, retries, resumptions, and parallel-frontier facts form one byte-stable checkpoint", async()=>{
  const facts=[fact("a","completed"),fact("b","skipped","gate"),fact("c","failed","adapter"),fact("d","started"),fact("e","resumed"),fact("f","progressed","core-service")];
  const ledger=createRunLedger();
  const first=await ledger.append({runId:"run-1",facts});
  const replay=await ledger.replay(first.checkpointDigest);
  assert.equal(first.replayed,false); assert.equal(replay.replayed,true);
  assert.equal(canonicalJson(first.checkpoint),canonicalJson(replay.checkpoint));
  assert.equal(first.checkpoint.recordCount,facts.length);
  assert.equal(verifyRunLedgerCheckpoint(first.checkpoint),first.checkpoint);
});

test("the same fact set in a changed order is a different checkpoint and cannot masquerade as replay", async()=>{
  const facts=[fact("a","started"),fact("b","completed")];
  const ordered=createRunLedgerCheckpoint({runId:"run-1",facts});
  const reordered=createRunLedgerCheckpoint({runId:"run-1",facts:[...facts].reverse()});
  assert.notEqual(ordered.checkpointDigest,reordered.checkpointDigest);
  const drift=structuredClone(ordered); drift.records.reverse();
  assert.throws(()=>verifyRunLedgerCheckpoint(drift),/ordering drift|digest drift/);
});

test("duplicate, stale, substituted, and authority-bearing facts fail closed",()=>{
  const one=fact("a");
  assert.throws(()=>createRunLedgerCheckpoint({runId:"run-1",facts:[one,one]}),/duplicate.*fact identity/);
  assert.throws(()=>createRunLedgerCheckpoint({runId:"other",facts:[one]}),/stale or cross-run/);
  assert.throws(()=>createRunLedgerCheckpoint({runId:"run-1",facts:[{...one,event:"failed"}]}),/digest/i);
  assert.throws(()=>createRunLedgerCheckpoint({runId:"run-1",facts:[{...one,source:{...one.source,routeDecision:"forged"}}]}),/forbidden workflow authority|invalid/);
});

test("checkpoint replay rejects missing and mutated persisted bytes",async()=>{
  const store=new Map(), ledger=createRunLedger({store});
  await assert.rejects(ledger.replay("sha256:"+"0".repeat(64)),e=>e instanceof RunLedgerError&&e.code==="DR4412");
  const receipt=await ledger.append({runId:"run-1",facts:[fact("a")]});
  const corrupt=structuredClone(receipt.checkpoint); corrupt.records[0].bytesBase64=Buffer.from("{}", "utf8").toString("base64");
  store.set(receipt.checkpointDigest,corrupt);
  await assert.rejects(ledger.replay(receipt.checkpointDigest),/digest drift|bytes drift/);
});

test("ledger records facts only and exposes no lifecycle control surface",()=>{
  const checkpoint=createRunLedgerCheckpoint({runId:"run-1",facts:[fact("a","approved","gate")]});
  assert.equal(checkpoint.authority,"append-only-recording");
  for(const key of ["routeDecision","adapterSelection","approval","gateDecision","graphMutation","evidenceSatisfaction","progression"]) assert.equal(key in checkpoint,false);
  assert.deepEqual(Object.keys(createRunLedger()).sort(),["append","current","replay"]);
});

test("non-genesis append binds the exact predecessor and preserves cumulative byte-identical history",async()=>{
  const ledger=createRunLedger();
  const first=await ledger.append({runId:"run-1",facts:[fact("a","started")]});
  const second=await ledger.append({runId:"run-1",facts:[fact("b","completed")],predecessorCheckpointDigest:first.checkpointDigest});
  assert.equal(second.checkpoint.predecessorCheckpointDigest,first.checkpointDigest);
  assert.equal(second.checkpoint.recordCount,2);
  assert.deepEqual(second.checkpoint.records.slice(0,1),first.checkpoint.records);
  assert.equal(verifyRunLedgerCheckpoint(second.checkpoint,{predecessor:first.checkpoint}),second.checkpoint);
  assert.equal((await ledger.current()).checkpointDigest,second.checkpointDigest);
  const retry=await ledger.append({runId:"run-1",facts:[fact("b","completed")],predecessorCheckpointDigest:first.checkpointDigest});
  assert.equal(retry.replayed,true);
  assert.equal(retry.checkpointDigest,second.checkpointDigest);
  assert.equal((await ledger.current()).checkpointDigest,second.checkpointDigest);
});

test("omitted history, wrong predecessor, forks, and prior-byte mutation fail closed",async()=>{
  const store=new Map(), ledger=createRunLedger({store});
  const first=await ledger.append({runId:"run-1",facts:[fact("a")]});
  await assert.rejects(ledger.append({runId:"run-1",facts:[fact("b")]}),/exact current checkpoint/);
  await assert.rejects(ledger.append({runId:"run-1",facts:[fact("b")],predecessorCheckpointDigest:"sha256:"+"0".repeat(64)}),/exact current checkpoint/);
  await assert.rejects(ledger.append({runId:"run-1",facts:[fact("a")],predecessorCheckpointDigest:first.checkpointDigest}),/duplicate or divergent fact identity/);
  const fork=createRunLedgerCheckpoint({runId:"run-1",facts:[fact("c")]});
  store.set(fork.checkpointDigest,fork);
  await assert.rejects(ledger.append({runId:"run-1",facts:[fact("b")],predecessorCheckpointDigest:fork.checkpointDigest}),/exact current checkpoint/);
  const corrupt=structuredClone(first.checkpoint); corrupt.records[0].bytesBase64=Buffer.from("{}", "utf8").toString("base64");
  store.set(first.checkpointDigest,corrupt);
  await assert.rejects(ledger.append({runId:"run-1",facts:[fact("b")],predecessorCheckpointDigest:first.checkpointDigest}),/digest drift|bytes drift/);
  const omitted=structuredClone(createRunLedgerCheckpoint({runId:"run-1",facts:[fact("b")],predecessor:first.checkpoint}));
  omitted.records.shift(); omitted.recordCount=omitted.records.length; omitted.records[0].sequence=0;
  const material=Object.fromEntries(Object.entries(omitted).filter(([key])=>key!=="checkpointDigest")); omitted.checkpointDigest=canonicalJsonDigest(material);
  assert.throws(()=>verifyRunLedgerCheckpoint(omitted,{predecessor:first.checkpoint}),/extend predecessor history|omitted, mutated, or reordered/);
});

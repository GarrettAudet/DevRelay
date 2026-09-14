import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createMemoryUpdateCandidate, loadProjectMemoryArtifact } from "../src/project-memory.mjs";
import { createProjectMemoryConclusionCoordinator, createProjectMemoryGateApproval, createSessionConclusion, renderCurrentSynopsis } from "../src/project-memory-conclude.mjs";
import { withProjectMemoryContentDigest } from "../src/project-memory-artifact-validator.mjs";

const D=`sha256:${"a".repeat(64)}`;
const ref=(id)=>({artifactId:id,schema:"https://devrelay.dev/test",mediaType:"application/json",digest:D,uri:`devrelay://test/${id}`});
const source=(id)=>({role:"test",artifact:ref(id)});
const graph=ref("GRAPH");
const record=(id,statement)=>({id,category:"direction",statement,authority:"approved-project",status:"active",effectiveAt:"2026-08-20T00:00:00Z",domain:"project-memory",sourceRefs:[source(`SRC-${id}`)]});
const baselineValue=withProjectMemoryContentDigest({apiVersion:"devrelay.dev/v1alpha1",kind:"ProjectMemoryBaseline",baselineId:"PMB-1",projectId:"devrelay",version:"1.0.0",approvedCandidate:ref("OLD"),records:[record("MEM-1","Old direction")],graphCheckpoint:graph,projectionDigest:D,approvalEvidence:[ref("APP")],sourceRefs:[source("BASE")]});
const baseline=loadProjectMemoryArtifact(baselineValue);
const candidateValue=createMemoryUpdateCandidate({projectId:"devrelay",sessionId:"S",taskId:"T",baseBaseline:baseline.ref,baseGraphCheckpoint:graph,producerType:"main",changes:[{changeId:"C-1",disposition:"replace",qualitative:true,domain:"project-memory",targetMemoryId:"MEM-1",proposedMemory:record("MEM-2","New direction"),rationale:"Owner changed direction",sourceRefs:[source("CHANGE")]}],sourceRefs:[source("CANDIDATE")]});
const candidate=loadProjectMemoryArtifact(candidateValue);
const approvalValue=createProjectMemoryGateApproval({candidate:candidateValue,candidateRef:candidate.ref,terminalCheckpointDigest:D,decisions:[{changeId:"C-1",decision:"approve",rationale:"Approved"}]});
const providerValue=withProjectMemoryContentDigest({apiVersion:"devrelay.dev/v1alpha1",kind:"MemoryProviderReceipt",receiptId:"MPR-SYNC",providerId:"mem0",providerVersion:"1.1.0",operation:"synchronize",namespace:"project/devrelay",configurationDigest:D,inputCheckpoints:[baseline.ref],commandFingerprint:D,outcome:"pass",durationMs:1,replayed:false,citations:[],outputDigest:D});
const provider=loadProjectMemoryArtifact(providerValue);
const conclusionValue=createSessionConclusion({projectId:"devrelay",sessionId:"S",taskId:"T",producerType:"main",startingBaseline:baseline.ref,startingGraphCheckpoint:graph,contextReceipt:ref("CTX"),completedArtifacts:[ref("DONE")],evidence:[ref("E")],pendingDecisions:[],memoryCandidate:candidate.ref});

test("/conclude atomically promotes only exact owner-approved deltas and renders complete synopsis", async()=>{
  let commits=0;
  const coordinator=createProjectMemoryConclusionCoordinator({commitAtomic:async({expectedBaseline,baseline:next,synopsis})=>{commits+=1;assert.deepEqual(expectedBaseline,baseline.ref);assert.match(synopsis.bytes.toString("utf8"),/New direction/u);assert.equal(next.value.records.find(r=>r.id==="MEM-1").status,"superseded");return{committed:true};}});
  const result=await coordinator.conclude({conclusion:conclusionValue,candidate:candidateValue,candidateRef:candidate.ref,approval:approvalValue,baseBaseline:baselineValue,baseBaselineRef:baseline.ref,providerSyncReceipt:providerValue,providerSyncReceiptRef:provider.ref,resultGraphCheckpoint:graph,sourceRefs:[source("PROMOTION")]});
  assert.equal(result.outcome,"concluded");assert.equal(result.receipt.outcome,"concluded");assert.equal(commits,1);
  const replay=await coordinator.conclude({conclusion:conclusionValue,candidate:candidateValue,candidateRef:candidate.ref,approval:approvalValue,baseBaseline:baselineValue,baseBaselineRef:baseline.ref,providerSyncReceipt:providerValue,providerSyncReceiptRef:provider.ref,resultGraphCheckpoint:graph,sourceRefs:[source("PROMOTION")]});
  assert.equal(replay.replayed,true);assert.equal(commits,1);
});

test("Gate requires a complete exact decision set",()=>{
  assert.throws(()=>createProjectMemoryGateApproval({candidate:candidateValue,candidateRef:candidate.ref,terminalCheckpointDigest:D,decisions:[]}),/every candidate change/u);
});

test("conclusion replay rejects changed graph, provider, or source evidence without another commit", async () => {
  let commits = 0;
  const coordinator = createProjectMemoryConclusionCoordinator({ commitAtomic: async () => {
    commits++; return { committed: true };
  } });
  const request = { conclusion: conclusionValue, candidate: candidateValue, candidateRef: candidate.ref,
    approval: approvalValue, baseBaseline: baselineValue, baseBaselineRef: baseline.ref,
    providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref,
    resultGraphCheckpoint: graph, sourceRefs: [source("PROMOTION")] };
  await coordinator.conclude(request);
  const changedProvider = loadProjectMemoryArtifact(withProjectMemoryContentDigest({ ...providerValue,
    receiptId: "MPR-OTHER-SYNC", outputDigest: `sha256:${"b".repeat(64)}` }));
  for (const changed of [
    { resultGraphCheckpoint: ref("OTHER-GRAPH") },
    { providerSyncReceipt: changedProvider.value, providerSyncReceiptRef: changedProvider.ref },
    { sourceRefs: [source("OTHER-PROMOTION")] },
  ]) {
    await assert.rejects(coordinator.conclude({ ...request, ...changed }), { code: "DR5369" });
    assert.equal(commits, 1);
  }
  const replay = await coordinator.conclude(request);
  assert.equal(replay.replayed, true);
  assert.equal(commits, 1);
});

test("memory-only approval cannot bypass owning domain routes", async () => {
  let commits = 0;
  const coordinator = createProjectMemoryConclusionCoordinator({ commitAtomic: async () => { commits++; return { committed: true }; } });
  for (const domain of ["requirements", "architecture", "contracts", "roadmap", "work-planning"]) {
    const change = { ...candidateValue.changes[0], domain,
      proposedMemory: { ...candidateValue.changes[0].proposedMemory, domain } };
    const value = createMemoryUpdateCandidate({ projectId: "devrelay", sessionId: "S", taskId: "T",
      baseBaseline: baseline.ref, baseGraphCheckpoint: graph, producerType: "main",
      changes: [change], sourceRefs: [source("CANDIDATE")] });
    const loaded = loadProjectMemoryArtifact(value);
    const approval = createProjectMemoryGateApproval({ candidate: value, candidateRef: loaded.ref,
      terminalCheckpointDigest: D, decisions: [{ changeId: "C-1", decision: "approve", rationale: "Memory-only fixture approval" }] });
    const conclusion = createSessionConclusion({ projectId: "devrelay", sessionId: "S", taskId: "T", producerType: "main",
      startingBaseline: baseline.ref, startingGraphCheckpoint: graph, contextReceipt: ref("CTX"), memoryCandidate: loaded.ref });
    await assert.rejects(coordinator.conclude({ conclusion, candidate: value, candidateRef: loaded.ref, approval,
      baseBaseline: baselineValue, baseBaselineRef: baseline.ref, providerSyncReceipt: providerValue,
      providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: graph, sourceRefs: [source("PROMOTION")] }), { code: "DR5366" });
  }
  assert.equal(commits, 0);
});

test("conclude blocks stale baseline and failed provider synchronization before commit",async()=>{
  let commits=0;const coordinator=createProjectMemoryConclusionCoordinator({commitAtomic:async()=>{commits+=1;return{committed:true};}});
  await assert.rejects(()=>coordinator.conclude({conclusion:conclusionValue,candidate:candidateValue,candidateRef:candidate.ref,approval:approvalValue,baseBaseline:baselineValue,baseBaselineRef:{...baseline.ref,digest:`sha256:${"b".repeat(64)}`},providerSyncReceipt:providerValue,providerSyncReceiptRef:provider.ref,resultGraphCheckpoint:graph,sourceRefs:[source("P")]}),/drift/u);
  assert.equal(commits,0);
});

test("worker conclusions bind their parent and cannot promote independently",()=>{
  assert.throws(()=>createSessionConclusion({projectId:"p",sessionId:"s",taskId:"w",producerType:"worker",startingBaseline:baseline.ref,startingGraphCheckpoint:graph,contextReceipt:ref("C"),memoryCandidate:candidate.ref}),/parentTaskId/u);
  assert.equal(createSessionConclusion({projectId:"p",sessionId:"s",taskId:"w",producerType:"worker",parentTaskId:"parent",startingBaseline:baseline.ref,startingGraphCheckpoint:graph,contextReceipt:ref("C"),completedArtifacts:[],evidence:[],pendingDecisions:[],memoryCandidate:candidate.ref}).parentTaskId,"parent");
});

test("conclusion rejects cross-task candidate substitution and worker promotion before commit", async () => {
  let commits = 0;
  const coordinator = createProjectMemoryConclusionCoordinator({ commitAtomic: async () => { commits++; return { committed: true }; } });
  for (const change of [{ projectId: "other-project" }, { sessionId: "OTHER-SESSION" }, { taskId: "OTHER-TASK" },
    { memoryCandidate: ref("OTHER-CANDIDATE") }, { producerType: "worker", parentTaskId: "PARENT" }]) {
    const conclusion = createSessionConclusion({ ...conclusionValue, ...change });
    await assert.rejects(coordinator.conclude({ conclusion, candidate: candidateValue, candidateRef: candidate.ref,
      approval: approvalValue, baseBaseline: baselineValue, baseBaselineRef: baseline.ref, providerSyncReceipt: providerValue,
      providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: graph, sourceRefs: [source("PROMOTION")] }), { code: "DR5367" });
  }
  assert.equal(commits, 0);
});

test("conclusion rejects self-consistent references that do not bind supplied artifact bytes", async () => {
  let commits = 0;
  const coordinator = createProjectMemoryConclusionCoordinator({ commitAtomic: async () => { commits++; return { committed: true }; } });
  const request = { conclusion: conclusionValue, candidate: candidateValue, candidateRef: candidate.ref,
    approval: approvalValue, baseBaseline: baselineValue, baseBaselineRef: baseline.ref,
    providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: graph,
    sourceRefs: [source("PROMOTION")] };
  const wrongCandidateRef = { ...candidate.ref, digest: D };
  const candidateRequest = { ...request, candidateRef: wrongCandidateRef,
    conclusion: createSessionConclusion({ ...conclusionValue, memoryCandidate: wrongCandidateRef }),
    approval: createProjectMemoryGateApproval({ candidate: candidateValue, candidateRef: wrongCandidateRef,
      terminalCheckpointDigest: D, decisions: approvalValue.decisions }) };
  const changedBaseline = withProjectMemoryContentDigest({ ...baselineValue,
    records: [record("MEM-1", "Substituted source baseline")] });
  for (const changed of [candidateRequest, { ...request, baseBaseline: changedBaseline },
    { ...request, providerSyncReceiptRef: { ...provider.ref, digest: D } }]) {
    await assert.rejects(coordinator.conclude(changed), { code: "DR5368" });
  }
  assert.equal(commits, 0);
});

test("synopsis is deterministic NFC LF and covers every active record",()=>{
  const one=renderCurrentSynopsis(baselineValue);const two=renderCurrentSynopsis(baselineValue);assert.equal(one.ref.digest,two.ref.digest);assert.equal(one.receipt.coverageIds[0],"MEM-1");assert.equal(one.bytes.includes(Buffer.from("\r")),false);assert.match(canonicalJsonDigest(one.receipt),/^sha256:/u);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";

const API="devrelay.dev/v1alpha1";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const rb=(p)=>fs.readFileSync(path.join(root,p));
const rj=(p)=>JSON.parse(rb(p));
const cb=(v)=>Buffer.from(api.canonicalJson(v),"utf8");
const fr=(artifactId,digest,schema="https://devrelay.dev/evidence/project-memory/v1",mediaType="application/json")=>({artifactId,schema,mediaType,digest,uri:`memory://devrelay/pm001/${encodeURIComponent(artifactId)}/${digest.slice(7)}`});
const src=(role,artifact)=>({role,artifact});
const seal=(v,f="contentDigest")=>({...v,[f]:api.canonicalJsonDigest(Object.fromEntries(Object.entries(v).filter(([k])=>!["apiVersion","kind",f].includes(k))))});
const raw=(p,id,schema,mediaType="application/json")=>{const bytes=rb(p);return{value:JSON.parse(bytes),bytes,ref:fr(id,api.sha256Digest(bytes),schema,mediaType)}};
const custom=(v,id,schema)=>{const bytes=cb(v);return{value:v,bytes,ref:fr(id,api.sha256Digest(bytes),schema)}};
const wj=(p,v,lf=true)=>{const a=path.join(root,p);fs.mkdirSync(path.dirname(a),{recursive:true});fs.writeFileSync(a,`${api.canonicalJson(v)}${lf?"\n":""}`,"utf8")};
const wb=(p,b)=>{const a=path.join(root,p);fs.mkdirSync(path.dirname(a),{recursive:true});fs.writeFileSync(a,b)};

const req=raw("project/requirements-baseline.json",rj("project/requirements-baseline.json").baselineId,"https://devrelay.dev/artifacts/requirements-baseline/v1");
const ov=raw("project/project-overview-baseline.json",rj("project/project-overview-baseline.json").baselineId,"https://devrelay.dev/artifacts/project-overview-baseline/v1");
const arch=raw("project/architecture-baseline.json",rj("project/architecture-baseline.json").baselineId,"https://devrelay.dev/artifacts/architecture-baseline/v1");
const work=raw("project/work-breakdown-baseline.json",rj("project/work-breakdown-baseline.json").baselineId,"https://devrelay.dev/artifacts/work-breakdown-baseline/v1");
const final=rj("dogfood/pm-001-project-memory/final-acceptance/final-acceptance-summary.json");
const sv=raw("dogfood/pm-001-project-memory/final-acceptance/12-system-verification-result.json",final.systemVerification.artifactId,"https://devrelay.dev/artifacts/system-verification-result/v1");
const ba=raw("dogfood/pm-001-project-memory/final-acceptance/26-business-acceptance-record.json",final.businessAcceptance.artifactId,"https://devrelay.dev/artifacts/business-acceptance-record/v1");
const proof=raw("dogfood/pm-001-project-memory/final-acceptance/30-final-acceptance-proof.json","DEVRELAY-PM001-SOURCE-RELEASE-ACCEPTANCE-001","https://devrelay.dev/evidence/source-release-acceptance/v1");
const verify=raw("dogfood/pm-001-project-memory/system-verification-final/canonical-verification-receipt.json","PM001-CANONICAL-VERIFICATION-E7775610110F","https://devrelay.dev/evidence/canonical-verification/v1");
const installed=raw("dogfood/pm-001-project-memory/windows-e2e/installed-package-verification-receipt.json","PM001-WINDOWS-INSTALLED-PACKAGE-VERIFICATION","https://devrelay.dev/evidence/windows-installed-package/v1");
const graphValue=rj("dogfood/pm-001-project-memory/final-acceptance/29-business-acceptance-graph.json");
const graph={value:graphValue,bytes:cb(graphValue),ref:structuredClone(final.traceabilityGraph)};
assert.equal(graph.ref.digest,final.traceabilityGraph.digest);
const at="2026-08-21T18:00:00.000Z";
const rec=(id,category,statement,domain,authority,sourceRefs)=>({id,category,statement,authority,status:"active",effectiveAt:at,domain,sourceRefs});
const baseSources=[src("requirements-baseline",req.ref),src("project-overview-baseline",ov.ref)];
const records=[
 rec("MEM-DEVRELAY-GOAL","goal","DevRelay is a deterministic, spec-driven software-engineering orchestration runtime; it is not a coding agent or model wrapper.","requirements","approved-project",baseSources),
 rec("MEM-DEVRELAY-MODULARITY","direction","Core owns routing, gates, normalization, progression, and authority while bounded provider-neutral adapters remain replaceable and independently attestable.","architecture","approved-project",[src("architecture-baseline",arch.ref)]),
 rec("MEM-DEVRELAY-LIFECYCLE","decision","The construction lifecycle runs RequirementsGathering, ArchitectureDiscovery when required, ArchitectureDesign, ContractGeneration when applicable, WorkBreakdown, WorkDependencyAnalysis, SpecialistAssignment, repeating WorkExecution/WorkItemVerification/ChangeIntegration frontiers, SystemVerification, and BusinessAcceptance.","architecture","approved-project",[src("requirements-baseline",req.ref),src("architecture-baseline",arch.ref)]),
 rec("MEM-DEVRELAY-DOGFOOD","pattern","Each newly built module must be produced by rerunning every already-released upstream DevRelay module, then appended to the circuit before the next module is built.","work-planning","approved-project",[src("work-breakdown-baseline",work.ref)]),
 rec("MEM-DEVRELAY-PLATFORM","constraint","The controlled release target is GitHub source plus an installable library operated through ChatGPT/Codex Desktop on Windows; it does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows hosts.","requirements","approved-project",[src("project-overview-baseline",ov.ref),src("acceptance-proof",proof.ref)]),
 rec("MEM-DEVRELAY-PROJECT-MEMORY","decision","Every configured fresh task loads CurrentSynopsis first, then the exact ProjectMemoryBaseline and bounded TraceabilityGraph context; terminal work uses /conclude with explicit add, replace, supersede, retain, or reject dispositions.","project-memory","approved-project",[src("architecture-baseline",arch.ref)]),
 rec("MEM-DEVRELAY-APPROVAL","decision","Routine in-scope lifecycle gates and implementation changes have standing owner approval; unresolved product intent, business requirements, trust failures, or external authority boundaries still require explicit clarification.","project-memory","approved-project",[src("business-acceptance",ba.ref)]),
 rec("MEM-DEVRELAY-STATUS-PM001-CANDIDATE","status","PM-001 ProjectMemory implementation is integrated and system-verified; durable conclusion and final acceptance recording are in progress.","verification","validated-status",[src("system-verification",sv.ref),src("verification-receipt",verify.ref)]),
 rec("MEM-DEVRELAY-NEXT","next-action","After PM-001 release sealing, prioritize EnvironmentPreparation/Verification and ReleasePreparation through the full current DevRelay circuit.","roadmap","approved-project",baseSources)
].sort((a,b)=>a.id.localeCompare(b.id,"en"));

const initValue=seal({apiVersion:API,kind:"ProjectMemoryInitializationCandidate",candidateId:"PMIC-DEVRELAY-PM001-001",projectId:"devrelay",records,sourceArtifacts:[req.ref,ov.ref,arch.ref,work.ref,sv.ref,ba.ref]});
const init=custom(initValue,initValue.candidateId,"https://devrelay.dev/evidence/project-memory-initialization-candidate/v1");
const initApprovalValue=seal({apiVersion:API,kind:"ProjectMemoryInitializationApproval",approvalId:"PMIA-DEVRELAY-PM001-001",authority:"project-owner",candidate:init.ref,decision:"approved",basis:"Standing owner approval for the exact PM-001 release lifecycle and final durable memory initialization."});
const initApproval=custom(initApprovalValue,initApprovalValue.approvalId,"https://devrelay.dev/evidence/project-memory-initialization-approval/v1");
const seedValue=api.withProjectMemoryContentDigest({apiVersion:API,kind:"ProjectMemoryBaseline",baselineId:"PMB-DEVRELAY-PM001-INITIAL-001",projectId:"devrelay",version:"1.0.0",approvedCandidate:init.ref,records,graphCheckpoint:graph.ref,projectionDigest:api.canonicalJsonDigest(records),approvalEvidence:[initApproval.ref],sourceRefs:[src("initialization-candidate",init.ref),src("initialization-approval",initApproval.ref)]});
const seed=api.loadProjectMemoryArtifact(seedValue);
const seedSynopsis=api.renderCurrentSynopsis(seedValue);
const traceValue=api.withProjectMemoryContentDigest({apiVersion:API,kind:"TraceabilityContextProjection",projectionId:"TCP-DEVRELAY-PM001-ACCEPTANCE-001",graphCheckpoint:graph.ref,graphVersion:graph.value.vocabulary.version,scope:["acceptance","project-memory"],lifecyclePosition:"business-acceptance",nodes:[{id:ba.ref.artifactId,kind:"business-acceptance",label:"PM-001 accepted release candidate",sourceRefs:[src("business-acceptance",ba.ref)]}],edges:[],diagnostics:[]});
const trace=api.loadProjectMemoryArtifact(traceValue);
const artifacts=new Map([[seed.ref.digest,seed],[seedSynopsis.ref.digest,{ref:seedSynopsis.ref,bytes:seedSynopsis.bytes}],[trace.ref.digest,trace]]);
let tick=0;
const runtime=api.createProjectMemoryRuntime({provider:null,monotonicNow:()=>++tick});
const bootstrap=api.createProjectMemoryContextBootstrap({loadArtifact:async(r)=>artifacts.get(r.digest),runtime,clock:()=>"2026-08-21T18:05:00.000Z",monotonicNow:()=>++tick});
const initial=await bootstrap.load({executionId:"PM001-FINAL-CONCLUSION-INITIAL-LOAD",operation:"load-context",projectId:"devrelay",sessionId:"SESSION-PM001-FINAL",taskId:"TASK-PM001-FINAL",workspaceId:"WORKSPACE-DEVRELAY",repositoryRevision:"61274bee4c1c726952b509017c1af85c1e1bce66",moduleId:"business-acceptance",moduleInvocationId:"INV-PM001-FINAL-CONCLUSION",projectMemoryBaseline:seed.ref,synopsisProjection:seedSynopsis.ref,traceabilityProjection:trace.ref,query:"DevRelay PM-001 release acceptance and next action"});
assert.deepEqual(initial.receipt.loadOrder,["current-synopsis","project-memory-baseline","traceability-context"]);

const ready=rec("MEM-DEVRELAY-STATUS-PM001-RELEASE-READY","status",`PM-001 ProjectMemory is construction-complete and accepted for the controlled Windows source/library release by ${ba.ref.artifactId}; 1,038 tests completed with 1,036 passing, zero failures, and two intentional skips.`,`acceptance`,`validated-status`,[src("business-acceptance",ba.ref),src("system-verification",sv.ref),src("verification-receipt",verify.ref)]);
const accepted=rec("MEM-DEVRELAY-PM001-ACCEPTANCE","decision","PM-001 ProjectMemory, live-conformant Mem0 adapter support, deterministic native fallback, /conclude, and fresh-task first-load behavior are accepted for the controlled Windows source/library release.","acceptance","approved-project",[src("business-acceptance",ba.ref),src("installed-package-receipt",installed.ref),src("acceptance-proof",proof.ref)]);
const changes=[
 {changeId:"CHANGE-PM001-ACCEPTANCE-ADD",disposition:"add",qualitative:true,domain:"acceptance",proposedMemory:accepted,rationale:"Record the exact owner-approved BusinessAcceptance outcome as durable project direction.",sourceRefs:[src("business-acceptance",ba.ref)]},
 {changeId:"CHANGE-PM001-STATUS-REPLACE",disposition:"replace",qualitative:false,domain:"acceptance",targetMemoryId:"MEM-DEVRELAY-STATUS-PM001-CANDIDATE",proposedMemory:ready,rationale:"Replace the in-progress status with the exact verified and accepted release status.",sourceRefs:[src("business-acceptance",ba.ref),src("system-verification",sv.ref)]}
];
const candidateValue=api.createMemoryUpdateCandidate({projectId:"devrelay",sessionId:"SESSION-PM001-FINAL",taskId:"TASK-PM001-FINAL",baseBaseline:seed.ref,baseGraphCheckpoint:graph.ref,producerType:"main",changes,sourceRefs:[src("business-acceptance",ba.ref),src("acceptance-proof",proof.ref)]});
const candidate=api.loadProjectMemoryArtifact(candidateValue);
const routes=api.resolveMemoryChangeRoutes(candidateValue);
assert.equal(routes.every(({nextModule})=>nextModule==="project-memory-gate"),true);
const conclusionValue=api.createSessionConclusion({projectId:"devrelay",sessionId:"SESSION-PM001-FINAL",taskId:"TASK-PM001-FINAL",producerType:"main",startingBaseline:seed.ref,startingGraphCheckpoint:graph.ref,contextReceipt:fr(initial.receipt.receiptId,api.canonicalJsonDigest(initial.receipt),"https://devrelay.dev/evidence/project-memory-context-load/v1"),completedArtifacts:[sv.ref,ba.ref,proof.ref],evidence:[verify.ref,installed.ref],pendingDecisions:[],memoryCandidate:candidate.ref});
const terminal=api.canonicalJsonDigest({conclusion:conclusionValue.contentDigest,graph:graph.ref,acceptance:ba.ref});
const approvalValue=api.createProjectMemoryGateApproval({candidate:candidateValue,candidateRef:candidate.ref,terminalCheckpointDigest:terminal,decisions:[{changeId:"CHANGE-PM001-ACCEPTANCE-ADD",decision:"approve",rationale:"Standing owner approval applies to the exact accepted PM-001 release outcome."},{changeId:"CHANGE-PM001-STATUS-REPLACE",decision:"approve",rationale:"Exact SystemVerification and BusinessAcceptance evidence supports the release-ready status."}]});
const providerValue=api.withProjectMemoryContentDigest({apiVersion:API,kind:"MemoryProviderReceipt",receiptId:"MPR-DEVRELAY-PM001-NATIVE-EQUIVALENT-001",providerId:"devrelay.native-project-memory",providerVersion:"1.0.0",operation:"synchronize",namespace:"project/devrelay",configurationDigest:api.canonicalJsonDigest({provider:"devrelay.native-project-memory",policy:"exact-baseline-equivalence"}),inputCheckpoints:[seed.ref,candidate.ref],commandFingerprint:api.canonicalJsonDigest({operation:"synchronize",baseline:seed.ref,candidate:candidate.ref}),outcome:"native-equivalent",durationMs:0,replayed:false,citations:[],outputDigest:api.canonicalJsonDigest(changes)});
const provider=api.loadProjectMemoryArtifact(providerValue);
let commits=0,committed;
const coordinator=api.createProjectMemoryConclusionCoordinator({commitAtomic:async({expectedBaseline,baseline,synopsis,proof})=>{assert.deepEqual(expectedBaseline,seed.ref);commits+=1;committed={baseline,synopsis,proof};return{committed:true}}});
const concludeInput={conclusion:conclusionValue,candidate:candidateValue,candidateRef:candidate.ref,approval:approvalValue,baseBaseline:seed.value,baseBaselineRef:seed.ref,providerSyncReceipt:providerValue,providerSyncReceiptRef:provider.ref,resultGraphCheckpoint:graph.ref,sourceRefs:[src("business-acceptance",ba.ref),src("system-verification",sv.ref),src("provider-equivalence",provider.ref)]};
const concluded=await coordinator.conclude(concludeInput);
const concludedReplay=await coordinator.conclude(concludeInput);
assert.equal(concluded.outcome,"concluded");assert.equal(concludedReplay.replayed,true);assert.equal(commits,1);
assert.equal(committed.baseline.value.records.some(({id,status})=>id===ready.id&&status==="active"),true);
assert.equal(committed.baseline.value.records.some(({id,status})=>id==="MEM-DEVRELAY-STATUS-PM001-CANDIDATE"&&status==="superseded"),true);

artifacts.set(committed.baseline.ref.digest,committed.baseline);artifacts.set(committed.synopsis.ref.digest,{ref:committed.synopsis.ref,bytes:committed.synopsis.bytes});
const freshReq={executionId:"PM001-FRESH-TASK-AFTER-CONCLUDE",operation:"load-context",projectId:"devrelay",sessionId:"SESSION-PM001-NEXT",taskId:"TASK-PM001-NEXT",workspaceId:"WORKSPACE-DEVRELAY",repositoryRevision:"61274bee4c1c726952b509017c1af85c1e1bce66",moduleId:"roadmap-management",moduleInvocationId:"INV-PM001-NEXT-ROADMAP",projectMemoryBaseline:committed.baseline.ref,synopsisProjection:committed.synopsis.ref,traceabilityProjection:trace.ref,query:"current DevRelay status and next prioritized work"};
const fresh=await bootstrap.load(freshReq);const freshReplay=await bootstrap.load(freshReq);
assert.deepEqual(fresh.receipt.loadOrder,["current-synopsis","project-memory-baseline","traceability-context"]);assert.equal(fresh.replayed,false);assert.equal(freshReplay.replayed,true);assert.equal(freshReplay.providerReceipt.value.outcome,"native-equivalent");assert.equal(freshReplay.bundle.value.items.some(({memoryId})=>memoryId===ready.id),true);
const session=api.createProjectMemorySessionState({projectId:"devrelay",sessionId:"SESSION-PM001-FINAL",taskId:"TASK-PM001-FINAL",status:"concluded",baseline:committed.baseline.ref,graphCheckpoint:graph.ref,lastCheckpointDigest:concluded.receipt.resultingCheckpointDigest,updatedAt:"2026-08-21T18:10:00.000Z"});
const outputs=[
 ["00-initialization-candidate.json",initValue],["01-initialization-approval.json",initApprovalValue],["02-seed-project-memory-baseline.json",seedValue],["04-traceability-context-projection.json",traceValue],["05-initial-context-load-receipt.json",initial.receipt],["06-memory-update-candidate.json",candidateValue],["07-memory-change-routes.json",{apiVersion:API,kind:"ProjectMemoryChangeRoutes",routes}],["08-session-conclusion.json",conclusionValue],["09-project-memory-gate-approval.json",approvalValue],["10-provider-native-equivalence-receipt.json",providerValue],["11-project-memory-baseline.json",committed.baseline.value],["13-project-memory-gate-promotion-proof.json",committed.proof],["14-conclude-receipt.json",concluded.receipt],["15-project-memory-session-state.json",session],["16-fresh-task-context-load-receipt.json",fresh.receipt],["17-fresh-task-provider-receipt.json",fresh.providerReceipt.value],["18-fresh-task-memory-context-bundle.json",fresh.bundle.value],["19-fresh-task-replay-proof.json",{apiVersion:API,kind:"ProjectMemoryFreshTaskReplayProof",firstReplayed:fresh.replayed,replayed:freshReplay.replayed,replayProviderCalls:0,loadOrder:fresh.receipt.loadOrder,baseline:committed.baseline.ref,synopsis:committed.synopsis.ref,graphCheckpoint:graph.ref,outcome:"pass"}]
];
for(const [n,v] of outputs)wj(`dogfood/pm-001-project-memory/final-conclusion/${n}`,v);
wb("dogfood/pm-001-project-memory/final-conclusion/03-seed-CurrentSynopsis.md",seedSynopsis.bytes);wb("dogfood/pm-001-project-memory/final-conclusion/12-CurrentSynopsis.md",committed.synopsis.bytes);
wj("project/project-memory-baseline.json",committed.baseline.value,false);wb("project/CurrentSynopsis.md",committed.synopsis.bytes);wj("project/project-memory-promotion.commit.json",committed.proof);wj("project/project-memory-session-state.json",session);wj("project/project-memory-context-load-receipt.json",fresh.receipt);
wj("project/history/project-memory/1.0.0/project-memory-baseline.json",seedValue,false);wb("project/history/project-memory/1.0.0/CurrentSynopsis.md",seedSynopsis.bytes);wj(`project/history/project-memory/${committed.baseline.value.version}/project-memory-baseline.json`,committed.baseline.value,false);wb(`project/history/project-memory/${committed.baseline.value.version}/CurrentSynopsis.md`,committed.synopsis.bytes);
const summary={apiVersion:API,kind:"Pm001FinalConclusionSummary",seedBaseline:seed.ref,candidate:candidate.ref,approval:api.loadProjectMemoryArtifact(approvalValue).ref,resultBaseline:committed.baseline.ref,synopsis:committed.synopsis.ref,concludeReceipt:api.loadProjectMemoryArtifact(concluded.receipt).ref,graphCheckpoint:graph.ref,atomicCommits:commits,replayAtomicCommits:0,freshTaskLoadOrder:fresh.receipt.loadOrder,freshTaskReplayed:freshReplay.replayed,freshTaskProviderOutcome:freshReplay.providerReceipt.value.outcome,liveMem0Evidence:installed.ref,outcome:"pass"};summary.summaryDigest=api.canonicalJsonDigest(summary);wj("dogfood/pm-001-project-memory/final-conclusion/final-conclusion-summary.json",summary);
wb("dogfood/pm-001-project-memory/final-conclusion/CONCLUSION_DELTA.md",Buffer.from(`# PM-001 /conclude delta\n\n- Replace: \`MEM-DEVRELAY-STATUS-PM001-CANDIDATE\` -> \`${ready.id}\`\n- Add: \`${accepted.id}\`\n- Retain: all other active project-memory records\n- Reject: none\n- Result baseline: \`${committed.baseline.ref.digest}\`\n- Synopsis: \`${committed.synopsis.ref.digest}\`\n- Graph checkpoint: \`${graph.ref.digest}\`\n- Fresh-task load order: ${fresh.receipt.loadOrder.join(" -> ")}\n- Replay provider calls: 0\n`,"utf8"));
process.stdout.write(`${JSON.stringify(summary,null,2)}\n`);
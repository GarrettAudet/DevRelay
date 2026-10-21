// Synthetic Core/Gate contract evidence, never a real owner's approval or acceptance.
import { readFile } from "node:fs/promises";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { boundedWorkContracts, boundedWorkRoles, boundedWorkBinding, boundedWorkRuntimeArtifactContracts } from "../src/work-breakdown-bounded.mjs";
import { createConversationBoundedWorkAdapter } from "../src/work-breakdown-bounded-adapter.mjs";
import { validateBoundedWorkGateCandidate, validateBoundedWorkGatePromotion } from "../src/work-breakdown-bounded-gate.mjs";
import { createGovernedCodingFixture } from "./governed-coding-fixture.mjs";
export const authCard={workItemId:"WI-CODING",criterionIds:["AC-AUTH-001","AC-AUTH-DISCLOSURE-001","AC-AUTH-PERFORMANCE-001"],readPaths:["auth.mjs","test/auth.test.mjs"],writePaths:["auth.mjs"],testFiles:["test/auth.test.mjs"],reuse:{disposition:"reuse",rationale:"Preserve the approved identity source, credential check and session response while optimizing internal lookups.",paths:["auth.mjs"]}};
export async function createBoundedFixture({base,repository,headDigest=canonicalJsonDigest({synthetic:true}),itemId="WI-BOUNDED-ONE",mutateAssessment,mutateProposal,prior}={}) {
  base??=await createGovernedCodingFixture(authCard,repository);
  const artifacts=new Map(base.bundle.artifacts.map(entry=>[canonicalJson(entry.ref),{ref:entry.ref,bytes:Buffer.from(entry.bytesBase64,"base64")} ]));
  const checkpoints=new Map();
  const load=ref=>{const stored=artifacts.get(canonicalJson(ref));if(!stored)throw new Error("Unknown fixture artifact: "+ref.artifactId);return stored.bytes;};
  function add(value,id,contract) {
    const bytes=Buffer.from(canonicalJson(value)+"\n");
    const ref={artifactId:id,...contract,digest:sha256Digest(bytes),uri:"artifact://bounded-test/"+id};
    artifacts.set(canonicalJson(ref),{ref,bytes});return {value,ref,bytes};
  }
  const resolve=ref=>({ref,bytes:load(ref),value:JSON.parse(load(ref))});
  const heads=structuredClone(base.heads);
  if(prior) {heads.workBreakdownBaseline=prior.ref;artifacts.set(canonicalJson(prior.ref),prior);}
  const oldSnapshot=resolve(heads.repositorySnapshot);
  const current=add({...oldSnapshot.value,...(repository?{revision:repository.repositoryRevision,treeDigest:repository.repositoryTreeDigest}:{})},"repository-bounded-current",{schema:oldSnapshot.ref.schema,mediaType:oldSnapshot.ref.mediaType});
  const evidence=add({synthetic:true,review:"Inspected exact scope and current source; no public interface, dependency, security behavior, migration or architectural change."},"bounded-review-evidence",{schema:"https://devrelay.dev/evidence/bounded-test/v1",mediaType:"application/json"});
  const assessment={apiVersion:"devrelay.dev/v1alpha1",kind:"BoundedDesignReuseAssessment",assessmentId:"bounded-assessment",requirementsBaseline:heads.requirementsBaseline,projectOverviewBaseline:heads.projectOverviewBaseline,architectureBaseline:heads.architectureBaseline,contractDisposition:heads.contractDisposition,historicalRepositorySnapshot:heads.repositorySnapshot,currentRepositorySnapshot:current.ref,criterionIds:[...authCard.criterionIds],architectureIds:base.workItem["architecture-refs"],contractIds:[],rationale:"The existing authentication service and identity source remain the approved design; only lookup mechanics are optimized.",changes:Object.fromEntries(["criteria","productIntent","interfaces","dependencies","platform","security","migrations","architecture"].map(k=>[k,"unchanged"])),inspectionEvidence:[evidence.ref],review:{reviewerId:"synthetic-reviewer",method:"semantic-review",conclusion:"reuse-approved-design",evidence:evidence.ref},revalidatedEvidence:[]};
  mutateAssessment?.(assessment);
  const assessmentRecord=add(assessment,assessment.assessmentId,boundedWorkContracts.assessment);
  const inputRefs={"requirements-baseline":heads.requirementsBaseline,"project-overview-baseline":heads.projectOverviewBaseline,"architecture-baseline":heads.architectureBaseline,"contract-disposition":heads.contractDisposition,"capability-catalog":heads.capabilityCatalog,"current-repository-snapshot":current.ref,"current-work-breakdown-baseline":heads.workBreakdownBaseline,"design-reuse-assessment":assessmentRecord.ref};
  const state=add({apiVersion:"devrelay.dev/v1alpha1",kind:"BoundedWorkBreakdownState",stateId:"PWBS-BOUNDED",state:"bounded-work",expectedHeadDigest:headDigest,...Object.fromEntries(Object.entries(inputRefs).map(([role,ref])=>[role.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),ref]))},"PWBS-BOUNDED",boundedWorkContracts.state);
  inputRefs["project-work-breakdown-state"]=state.ref;
  const workItem={...structuredClone(base.workItem),id:itemId,objective:"Optimize existing authentication lookups without changing security or interface behavior.","bounded-scope":{included:["Replace repeated linear identity lookup with an equivalent indexed lookup."],excluded:["Credential rules, failure responses, external interfaces, dependencies, migrations and architecture changes."]},"verification-plan":{checks:[{id:"VC-BOUNDED",method:"Run Node authentication regression assertions and the 100 concurrent-attempt latency profile.",successCriteria:"Matching user sessions, indistinguishable known/unknown failures, and p95 at most 500 ms are preserved."}]}};
  const proposal={workItem,changeCard:{...structuredClone(authCard),workItemId:itemId}};
  mutateProposal?.(proposal);
  let calls=0;
  const adapter=createConversationBoundedWorkAdapter({loadArtifact:load,persistArtifact:({value,artifactId,schema,mediaType})=>add(value,artifactId,{schema,mediaType}),executeCapability:async()=>{calls++;return proposal;}});
  const module=JSON.parse(await readFile(new URL("../examples/modules/work-breakdown-bounded.module.json",import.meta.url)));
  const plugin=JSON.parse(await readFile(new URL("../examples/plugins/conversation-bounded-work.plugin.json",import.meta.url)));
  const registry=createModuleRegistry({modules:[module],plugins:[{definition:plugin,adapter}],artifactContracts:boundedWorkRuntimeArtifactContracts()});
  const runtime={artifacts:{load},checkpoints:{async get(key){return checkpoints.get(key);},async put(key,value){checkpoints.set(key,value);}}};
  const route=add(await registry.selectOperation({id:"work-breakdown",version:"0.2.0"},state.ref,runtime),"bounded-route",{schema:"https://devrelay.dev/artifacts/module-route-decision/v1",mediaType:"application/vnd.devrelay.module-route-decision+json"});
  const invocation={apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleInvocation",invocationId:"bounded-"+itemId,runId:"synthetic-bounded",nodeId:"bounded",...structuredClone(boundedWorkBinding),inputs:{...Object.fromEntries(Object.entries(inputRefs).map(([role,ref])=>[role,[ref]])),"routing-decision":[route.ref]},options:{},config:{planningOutputRoot:"/synthetic/host-state",authoringMethod:"conversation"},grants:[{kind:"filesystem.write",scope:"/synthetic/host-state"}]};
  async function execute(){return registry.execute(invocation,runtime);}
  async function replay(){return registry.verifyCheckpointedExecution(invocation,runtime);}
  async function approve(receipt) {
    const approved=await validateBoundedWorkGateCandidate({checkpointReplay:receipt,evidenceResolver:resolve});
    const originalMessage={id:"synthetic-owner-"+itemId,author:"synthetic-owner",text:"Approve this exact synthetic bounded change card for the fixture only.",timestamp:"2026-10-21T00:00:00Z"};
    const approval=add({apiVersion:"devrelay.dev/v1alpha1",kind:"WorkBreakdownBoundedApproval",approvalId:"approval-"+itemId,decision:"approve",candidate:approved.candidateRef,changeCard:approved.changeCardRef,designReuseAssessment:assessmentRecord.ref,currentRepositorySnapshot:current.ref,expectedHeadDigest:headDigest,originalMessage},"approval-"+itemId,boundedWorkContracts.approval);
    const previous=resolve(heads.workBreakdownBaseline);
    const next=previous.value.version.split(".").map(Number);next[2]++;
    const baseline=add({apiVersion:"devrelay.dev/v1alpha1",kind:"BoundedWorkBreakdownBaseline",baselineId:"WBB-"+itemId,version:next.join("."),approvedCandidate:approved.candidateRef,previousBaseline:previous.ref,inputBindings:approved.candidate.inputBindings,workItems:approved.workItems,coverageDispositions:approved.coverageDispositions,approvalEvidence:[...previous.value.approvalEvidence,approval.ref],sourceRefs:approved.candidate.sourceRefs},"WBB-"+itemId,boundedWorkContracts.baseline);
    const args={checkpointReplay:receipt,baseline:baseline.value,baselineRef:baseline.ref,baselineBytes:baseline.bytes,ownerApproval:approval.value,ownerApprovalRef:approval.ref,ownerApprovalBytes:approval.bytes,evidenceResolver:resolve};
    const promotion=await validateBoundedWorkGatePromotion(args);
    return {approved,approval,baseline,args,promotion};
  }
  return {base,registry,invocation,runtime,execute,replay,approve,add,resolve,artifacts,checkpoints,assessment,assessmentRecord,current,heads,state,proposal,calls:()=>calls};
}

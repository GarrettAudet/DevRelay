import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { boundedLoaded, boundedWorkBinding, boundedWorkContracts, boundedWorkChangeCardSchema, boundedWorkError,
  exactBoundedRef, sameBoundedRef, validateBoundedWorkArtifact, validateBoundedWorkCandidate } from "./work-breakdown-bounded.mjs";
import { validateBoundedChangeCard } from "./work-breakdown-bounded-adapter.mjs";
const fail=message=>{throw boundedWorkError("Bounded WorkBreakdown Gate rejected: "+message,"BOUNDED_WORK_GATE");};
const equal=(a,b)=>canonicalJsonDigest(a)===canonicalJsonDigest(b);
function frozen(value) { const copy=structuredClone(value); const freeze=v=>{if(v&&typeof v==="object"){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(copy); }
function decodeJson(bytes) {
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  if(!Buffer.from(text,"utf8").equals(Buffer.from(bytes))) fail("Evidence must be BOM-free canonical UTF-8");
  return JSON.parse(text);
}
function replayOf(receipt) {
  const replay=assertVerifiedCheckpointReplayReceipt(receipt);
  if (!equal(replay.invocation.module,boundedWorkBinding.module) || replay.moduleResult.status!=="completed" || replay.moduleResult.outcome!=="decomposed" || replay.moduleResult.diagnostics?.some(d=>d.severity==="error")) fail("A successful genuine Core bounded-work checkpoint replay is required");
  return replay;
}
async function exactEvidence(ref,resolver) {
  if(typeof resolver!=="function") fail("Exact evidence resolver required");
  const loaded=await resolver(ref); exactBoundedRef("Gate evidence",loaded?.ref,ref);
  if(!(loaded.bytes instanceof Uint8Array)||sha256Digest(loaded.bytes)!==ref.digest) fail("Evidence must resolve exact raw bytes");
  const value=decodeJson(loaded.bytes);
  if(loaded.value!==undefined&&!equal(loaded.value,value)) fail("Resolver object differs from exact evidence bytes");
  return {...loaded,value};
}
function rawDocument(value,ref,bytes,contract) {
  if (!(bytes instanceof Uint8Array)||sha256Digest(bytes)!==ref?.digest) fail("Raw artifact digest mismatch");
  const parsed=decodeJson(bytes);
  if(!equal(parsed,value)||ref.schema!==contract.schema||ref.mediaType!==contract.mediaType) fail("Supplied artifact differs from its raw document/contract");
  validateBoundedWorkArtifact(parsed,{ref});return parsed;
}
export async function validateBoundedWorkGateCandidate({checkpointReplay,evidenceResolver,architectureAttachmentResolver}) {
  const replay=replayOf(checkpointReplay);
  const candidate=boundedLoaded(replay.loadedOutputs,"work-breakdown-bounded-draft");
  validateBoundedWorkArtifact(candidate.value,candidate);
  const architecture=boundedLoaded(replay.loadedInputs,"architecture-baseline").value;
  const section=architecture.sections.architectureModel;
  const architectureModelAttachment=section.mode==="attached" ? await exactEvidence(section.artifact,architectureAttachmentResolver??evidenceResolver) : undefined;
  const result=validateBoundedWorkCandidate({candidate:candidate.value,loadedInputs:replay.loadedInputs,architectureModelAttachment});
  const cards=candidate.value.nativeArtifacts.filter(ref=>ref.schema===boundedWorkChangeCardSchema);
  if(cards.length!==1) fail("Exactly one native change-card/v1 must be attached before checkpointing");
  const card=await exactEvidence(cards[0],evidenceResolver);
  if(card.ref.mediaType!=="application/json") fail("Change-card media type changed");
  validateBoundedChangeCard(card.value,candidate.value.workItem);
  const assessment=boundedLoaded(replay.loadedInputs,"design-reuse-assessment");
  // Retained no-work authority is byte-identical to the prior baseline. It is
  // never re-minted as a new candidate approval, and its original evidence stays.
  const prior=boundedLoaded(replay.loadedInputs,"current-work-breakdown-baseline");
  for(const coverage of result.coverageDispositions) {
    const evidence=coverage.disposition==="already-satisfied" ? coverage.currentEvidence : coverage.disposition==="no-work-required" ? [coverage.approval.evidence] : [];
    for(const ref of evidence) {
      const loaded=await evidenceResolver(ref);
      exactBoundedRef("Retained coverage evidence",loaded?.ref,ref);
      if(!(loaded.bytes instanceof Uint8Array)||sha256Digest(loaded.bytes)!==ref.digest) fail("Retained coverage evidence raw bytes changed");
    }
  }
  return frozen({candidate:candidate.value,candidateRef:candidate.ref,operation:"plan-bounded-work",changeCard:card.value,changeCardRef:card.ref,assessmentRef:assessment.ref,priorBaselineRef:prior.ref,...result});
}
export async function validateBoundedWorkGatePromotion({checkpointReplay,baseline,baselineRef,baselineBytes,ownerApproval,ownerApprovalRef,ownerApprovalBytes,evidenceResolver,architectureAttachmentResolver}) {
  const approved=await validateBoundedWorkGateCandidate({checkpointReplay,evidenceResolver,architectureAttachmentResolver});
  const replay=replayOf(checkpointReplay);
  const prior=boundedLoaded(replay.loadedInputs,"current-work-breakdown-baseline");
  const repository=boundedLoaded(replay.loadedInputs,"current-repository-snapshot");
  const approval=rawDocument(ownerApproval,ownerApprovalRef,ownerApprovalBytes,boundedWorkContracts.approval);
  exactBoundedRef("Owner decision candidate",approval.candidate,approved.candidateRef);
  exactBoundedRef("Owner decision card",approval.changeCard,approved.changeCardRef);
  exactBoundedRef("Owner decision reuse review",approval.designReuseAssessment,approved.assessmentRef);
  exactBoundedRef("Owner decision current repository",approval.currentRepositorySnapshot,repository.ref);
  if(approval.expectedHeadDigest!==boundedLoaded(replay.loadedInputs,"project-work-breakdown-state").value.expectedHeadDigest) fail("Owner decision current head differs from checkpointed preparation");
  if(!approval.originalMessage.text.trim()||!approval.originalMessage.author.trim()) fail("Original exact human decision is required");
  baseline=rawDocument(baseline,baselineRef,baselineBytes,boundedWorkContracts.baseline);
  exactBoundedRef("Baseline approved candidate",baseline.approvedCandidate,approved.candidateRef);
  exactBoundedRef("Baseline history",baseline.previousBaseline,prior.ref);
  for(const field of ["inputBindings","sourceRefs"]) if(!equal(baseline[field],approved.candidate[field])) fail("Baseline changed candidate "+field);
  if(!equal(baseline.workItems,approved.workItems)||!equal(baseline.coverageDispositions,approved.coverageDispositions)) fail("Baseline must preserve the complete deterministic cumulative result");
  if(!equal(baseline.approvalEvidence,[...prior.value.approvalEvidence,ownerApprovalRef])) fail("Baseline must preserve historical approval evidence and append the exact work decision");
  const versions=[baseline.version,prior.value.version].map(v=>v.split(".").map(Number));
  const first=versions[0].findIndex((v,i)=>v!==versions[1][i]);
  if(first<0||versions[0][first]<versions[1][first]) fail("Baseline version must advance");
  return frozen({baseline,baselineRef,candidateRef:approved.candidateRef,operation:"plan-bounded-work",ownerApproval:approval,ownerApprovalRef,changeCardRef:approved.changeCardRef,commitPayload:{baseline:{ref:baselineRef,byteLength:baselineBytes.byteLength,bytesBase64:Buffer.from(baselineBytes).toString("base64")}}});
}

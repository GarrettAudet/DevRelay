import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateSystemVerificationArtifact } from "./system-verification-artifact-validator.mjs";
import { createSystemVerificationCheckpointController } from "./system-verification-checkpoint.mjs";

export class SystemVerificationCoreError extends Error { constructor(message, outcome="unable-to-proceed", code="DR4150") { super(`system verification failed: ${message}`); this.name="SystemVerificationCoreError"; this.outcome=outcome; this.code=code; } }
const fail=(message,outcome="unable-to-proceed",code)=>{throw new SystemVerificationCoreError(message,outcome,code)};
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const ref=(artifactId,digest)=>({artifactId,digest});
const seal=(body,field)=>({...body,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
const identity=(prefix,material)=>`${prefix}-${canonicalJsonDigest(material).slice(7,23).toUpperCase()}`;
const sorted=(items,key)=>[...items].map(item=>structuredClone(item)).sort((a,b)=>key(a).localeCompare(key(b)));

export function validateIntegratedSystemCandidate(subject, expected={}) {
  try { validateSystemVerificationArtifact(subject); } catch(error) { fail(error.message,"unable-to-proceed","DR4151"); }
  const fields=["repositorySnapshot","integratedCompletionFactSet","requirementsBaseline","projectOverviewBaseline","architectureBaseline","contractDisposition","workBreakdownBaseline","workDependencyBaseline","specialistAssignmentBaseline","verificationEnvironment","systemVerificationPolicy"];
  for(const field of fields) if(expected[field]!==undefined&&!same(subject[field],expected[field])) fail(`${field} baseline drift or substitution`,"baseline-drift","DR4152");
  if(expected.integratedChangeRecords!==undefined&&!same(sorted(subject.integratedChangeRecords,x=>canonicalJson(x)),sorted(expected.integratedChangeRecords,x=>canonicalJson(x)))) fail("integrated change record drift or substitution","baseline-drift","DR4152");
  return subject;
}

export function expandSystemVerificationObligations({subject,acceptanceCriteria=[],nonFunctionalRequirements=[]}) {
  validateIntegratedSystemCandidate(subject);
  const expand=(entry,kind,prefix)=>{
    const sourceRef=entry.sourceRef??entry.id??entry.acceptanceCriterionId??entry.nfrId;
    const kinds=entry.requiredEvidenceKinds??entry.evidenceKinds;
    if(!sourceRef||!Array.isArray(kinds)||kinds.length===0) fail(`invalid ${kind} obligation source`);
    return {obligationId:entry.obligationId??`${prefix}-${sourceRef}`,kind,sourceRef,requiredEvidenceKinds:[...new Set(kinds)].sort()};
  };
  const obligations=sorted([...acceptanceCriteria.map(x=>expand(x,"acceptance-criterion","SV-AC")),...nonFunctionalRequirements.filter(x=>x.applicable!==false).map(x=>expand(x,"non-functional-requirement","SV-NFR"))],x=>x.obligationId);
  if(obligations.length===0||new Set(obligations.map(x=>x.obligationId)).size!==obligations.length) fail("obligations must be non-empty and uniquely identified");
  const subjectRef=ref(subject.subjectId,subject.subjectDigest); const material={subject:subjectRef,obligations};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"SystemVerificationObligationSet",obligationSetId:identity("SVOS",material),...material};
  return validateSystemVerificationArtifact(seal(body,"obligationSetDigest"));
}

export function normalizeSystemVerificationEvidence({subject,obligations,policy,invocations,checkpointReplays}) {
  validateIntegratedSystemCandidate(subject); const authoritative=new Map(obligations.obligations.map(x=>[x.obligationId,x]));
  if(!Array.isArray(invocations)||!Array.isArray(checkpointReplays)||invocations.length!==checkpointReplays.length||invocations.length===0) fail("every verifier invocation requires one exact checkpoint replay");
  const items=[],rawObservations=[];
  for(let index=0;index<invocations.length;index++){
    const invocation=invocations[index], replay=checkpointReplays[index];
    try { validateSystemVerificationArtifact(invocation,{subject,obligations,policy}); } catch(error) { fail(error.message); }
    if(!replay?.replayed||replay.verifierCalls!==0||replay.checkpointDigest!==replay.checkpoint?.checkpointDigest||!same(replay.checkpoint.invocation,invocation)) fail("evidence requires an exact zero-call checkpoint replay");
    const bytes=Buffer.from(replay.checkpoint.nativeOutput.bytesBase64,"base64"); let raw; try{raw=JSON.parse(bytes.toString("utf8"));}catch{fail("checkpoint observation bytes are invalid")}
    if(!same(raw,replay.rawObservation)) fail("replayed observation differs from durable bytes");
    try{validateSystemVerificationArtifact(raw,{invocation});}catch(error){fail(error.message)}
    if(raw.nativeEvidence.length===0) fail("native evidence provenance is required");
    const nativeKeys=raw.nativeEvidence.map(canonicalJson);
    if(new Set(nativeKeys).size!==nativeKeys.length) fail("native evidence provenance must be unique");
    if(!same(raw.nativeEvidence,sorted(raw.nativeEvidence,canonicalJson))) fail("native evidence provenance must be canonical");
    rawObservations.push(ref(raw.observationId,raw.rawObservationDigest));
    for(const observation of raw.observations){
      const obligation=authoritative.get(observation.obligationId);
      if(!obligation) fail("verifier returned an unknown obligation");
      const bindingKeys=observation.evidenceBindings.map(canonicalJson);
      if(new Set(bindingKeys).size!==bindingKeys.length) fail("verifier returned a duplicate evidence binding");
      for(const binding of observation.evidenceBindings){
        if(!obligation.requiredEvidenceKinds.includes(binding.kind)) fail("verifier returned an unknown evidence kind");
        const evidenceId=identity("SVE",{obligationId:observation.obligationId,kind:binding.kind,artifact:binding.artifact,producer:raw.verifier});
        if(items.some(item=>item.evidenceId===evidenceId)) fail("verifier returned a duplicate evidence binding");
        items.push({evidenceId,obligationId:observation.obligationId,kind:binding.kind,status:observation.status,artifact:binding.artifact,producer:raw.verifier});
      }
    }
  }
  const material={subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),rawObservations:sorted([...new Map(rawObservations.map(x=>[canonicalJson(x),x])).values()],canonicalJson),items:sorted(items,x=>x.evidenceId)};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"NormalizedSystemVerificationEvidence",evidenceSetId:identity("SVES",material),...material}; return validateSystemVerificationArtifact(seal(body,"evidenceDigest"),{subject,obligations});
}

export function evaluateSystemVerificationPolicy({subject,obligations,policy,evidence}) {
  for(const artifact of [subject,obligations,policy]) try{validateSystemVerificationArtifact(artifact)}catch(error){fail(error.message)}
  try{validateSystemVerificationArtifact(evidence,{subject,obligations})}catch(error){fail(error.message)}
  const byId=new Map(obligations.obligations.map(x=>[x.obligationId,[]])); for(const item of evidence.items){if(!byId.has(item.obligationId))fail("unknown normalized evidence");byId.get(item.obligationId).push(item)}
  const dispositions=sorted(obligations.obligations.map(obligation=>{const values=byId.get(obligation.obligationId),passing=new Set(values.filter(x=>x.status==="pass").map(x=>x.kind));const status=values.some(x=>x.status==="fail")?"failed":obligation.requiredEvidenceKinds.every(x=>passing.has(x))?"satisfied":"missing-evidence";return{obligationId:obligation.obligationId,status,evidenceIds:values.map(x=>x.evidenceId).sort()}}),x=>x.obligationId);
  const outcome=dispositions.some(x=>x.status==="failed")?"failed":dispositions.some(x=>x.status==="missing-evidence")?"needs-evidence":"verified";
  const material={subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),policy:ref(policy.policyId,policy.policyDigest),evidence:ref(evidence.evidenceSetId,evidence.evidenceDigest),dispositions,outcome};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"SystemVerificationEvaluation",evaluationId:identity("SVEVAL",material),...material}; return validateSystemVerificationArtifact(seal(body,"evaluationDigest"),{subject,obligations,policy,evidence});
}

export function assembleSystemVerificationResult({subject,obligations,policy,evidence,evaluation}) { const material={subject:ref(subject.subjectId,subject.subjectDigest),obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest),policy:ref(policy.policyId,policy.policyDigest),evidence:ref(evidence.evidenceSetId,evidence.evidenceDigest),evaluation:ref(evaluation.evaluationId,evaluation.evaluationDigest),outcome:evaluation.outcome,progression:evaluation.outcome==="verified"?"business-acceptance-gate":"none",authority:"system-verification"}; const body={apiVersion:"devrelay.dev/v1alpha1",kind:"SystemVerificationResult",resultId:identity("SVR",material),...material}; return validateSystemVerificationArtifact(seal(body,"resultDigest"),{evaluation}); }

export async function executeSystemVerification(input) { validateIntegratedSystemCandidate(input.subject,input.expectedSubject); const obligations=expandSystemVerificationObligations(input); const controller=createSystemVerificationCheckpointController({verifier:input.verifier}); const first=await Promise.all(input.invocations.map(invocation=>controller.execute({invocation,subject:input.subject,obligations,policy:input.policy,checkpoints:input.checkpoints}))); const checkpointReplays=await Promise.all(input.invocations.map(invocation=>controller.replay({invocationId:invocation.invocationId,invocationFingerprint:invocation.invocationFingerprint,checkpoints:input.checkpoints}))); const evidence=normalizeSystemVerificationEvidence({...input,obligations,checkpointReplays}); const evaluation=evaluateSystemVerificationPolicy({...input,obligations,evidence}); const result=assembleSystemVerificationResult({...input,obligations,evidence,evaluation}); return {obligations,evidence,evaluation,result,checkpointReplays,verifierCalls:first.reduce((n,x)=>n+x.verifierCalls,0)}; }

export const expandVerificationObligations=expandSystemVerificationObligations;
export const normalizeRawSystemVerificationObservations=normalizeSystemVerificationEvidence;
export const evaluateVerificationPolicy=evaluateSystemVerificationPolicy;

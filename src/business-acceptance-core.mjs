import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateBusinessAcceptanceArtifact } from "./business-acceptance-artifact-validator.mjs";
import { createBusinessAcceptanceCheckpointController } from "./business-acceptance-checkpoint.mjs";
import { validateSystemVerificationArtifact } from "./system-verification-artifact-validator.mjs";
import { validateTraceabilityGraphSnapshot } from "./traceability-artifact-validator.mjs";

export class BusinessAcceptanceCoreError extends Error {
  constructor(message, outcome="unable-to-proceed") { super(`business acceptance failed: ${message}`); this.name="BusinessAcceptanceCoreError"; this.code="DR4150"; this.outcome=outcome; }
}
const fail=(message,outcome)=>{throw new BusinessAcceptanceCoreError(message,outcome)};
const ref=(value,id,digest)=>({artifactId:value[id],digest:value[digest]});
const seal=(body,field)=>({...body,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key])=>!["apiVersion","kind",field].includes(key))))});
const identity=(prefix,material)=>`${prefix}-${canonicalJsonDigest(material).slice(7,31)}`;
const same=(a,b)=>a?.artifactId===b?.artifactId&&a?.digest===b?.digest;
const compareCodeUnits=(a,b)=>a<b?-1:a>b?1:0;
const isExactArtifactRef=value=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===2&&Object.hasOwn(value,"artifactId")&&Object.hasOwn(value,"digest")&&typeof value.artifactId==="string"&&value.artifactId.length>0&&typeof value.digest==="string"&&/^sha256:[0-9a-f]{64}$/.test(value.digest);
const FORWARD_COVERAGE_EDGES=new Set(["accepted-by","contracted-by","designed-by","implemented-by","implementation-planned-by","planned-by","produces","realization-planned-by","realized-by","specified-by","tested-by","verified-by"]);

const artifactRef=value=>value&&typeof value.artifactId==="string"&&value.artifactId&&/^sha256:[0-9a-f]{64}$/.test(value.digest)?{artifactId:value.artifactId,digest:value.digest}:undefined;
const loadedArtifact=(input,label,{requireBytes=false}={})=>{
  const value=input?.value??input?.artifact??input;
  const declared=artifactRef(input?.ref);
  if(!value||typeof value!=="object"||Array.isArray(value))fail(`${label} is required`);
  const artifactId=value.baselineId??value.resultId??value.graphId??value.artifactId;
  const digestField=value.baselineDigest??value.resultDigest??value.graphDigest??value.digest;
  const exactRef=declared??(artifactId&&digestField?{artifactId,digest:digestField}:undefined);
  if(!isExactArtifactRef(exactRef))fail(`${label} requires an exact artifact reference`);
  if(input?.bytes!==undefined){
    if(!Buffer.isBuffer(input.bytes)&&!(input.bytes instanceof Uint8Array))fail(`${label} bytes must be raw bytes`);
    const bytes=Buffer.from(input.bytes);
    if(sha256Digest(bytes)!==exactRef.digest)fail(`${label} raw bytes have drifted`,"baseline-drift");
    let decoded;try{decoded=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}catch(error){fail(`${label} bytes are not valid UTF-8 JSON: ${error.message}`)}
    if(canonicalJson(decoded)!==canonicalJson(value))fail(`${label} bytes and parsed value disagree`,"baseline-drift");
    return {value,ref:exactRef,bytes};
  }
  if(requireBytes)fail(`${label} requires exact loaded bytes, ref, and value`);
  if(digestField!==exactRef.digest)fail(`${label} semantic digest has drifted`,"baseline-drift");
  return {value,ref:exactRef};
};

export function deriveBusinessScopeIdentities(requirementsBaseline){
  const requirements=(requirementsBaseline?.value??requirementsBaseline?.artifact??requirementsBaseline)?.requirements;
  const entries=requirements?.scope;
  if(!Array.isArray(entries)||entries.length===0)fail("requirements.scope must contain approved business-scope records");
  for(const entry of entries){
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||Object.keys(entry).sort(compareCodeUnits).join(",")!=="id,sourceRefs,statement")fail("business scope records must contain exactly id, statement, and sourceRefs");
    if(typeof entry.id!=="string"||entry.id.trim().length===0||entry.id!==entry.id.trim())fail("business scope identities must be non-empty canonical strings");
    if(typeof entry.statement!=="string"||entry.statement.trim().length===0||entry.statement!==entry.statement.trim())fail("business scope statements must be non-empty canonical strings");
    if(!Array.isArray(entry.sourceRefs)||entry.sourceRefs.length===0||entry.sourceRefs.some(source=>!source||typeof source!=="object"||Array.isArray(source)))fail(`business scope ${entry.id} requires exact source provenance`);
  }
  if(new Set(entries.map(entry=>entry.id)).size!==entries.length)fail("business scope identities must be unique");
  if(new Set(entries.map(entry=>entry.statement)).size!==entries.length)fail("business scope statements must be unique");
  return [...entries].sort((left,right)=>compareCodeUnits(left.id,right.id)).map(entry=>({scopeId:entry.id,statement:entry.statement,sourceRefs:structuredClone(entry.sourceRefs)}));
}

export function deriveBusinessAcceptanceTechnicalCoverage({requirementsBaseline,systemVerificationResult,traceabilityGraphSnapshot,traceabilitySnapshot,traceabilityCheckpoint}){
  const requirementsLoaded=loadedArtifact(requirementsBaseline,"RequirementsBaseline",{requireBytes:true});
  const resultLoaded=loadedArtifact(systemVerificationResult,"SystemVerificationResult");
  const graphLoaded=loadedArtifact(traceabilityGraphSnapshot??traceabilitySnapshot,"TraceabilityGraph snapshot",{requireBytes:true});
  const checkpoint=artifactRef(traceabilityCheckpoint??graphLoaded.ref);
  if(!isExactArtifactRef(checkpoint)||!same(checkpoint,graphLoaded.ref))fail("TraceabilityGraph checkpoint has drifted","baseline-drift");
  const result=resultLoaded.value,graph=graphLoaded.value;
  try{validateTraceabilityGraphSnapshot(graph)}catch(error){fail(error.message,"baseline-drift")}
  if(result.kind!=="SystemVerificationResult"||result.outcome!=="verified"||result.progression!=="business-acceptance-gate"||result.authority!=="system-verification")fail("technical coverage requires the verified SystemVerificationResult");
  const resultKeys=["apiVersion","kind","resultId","subject","obligationSet","policy","evidence","evaluation","outcome","progression","authority","resultDigest"];
  if(Object.keys(result).length!==resultKeys.length||resultKeys.some(key=>!Object.hasOwn(result,key))||["subject","obligationSet","policy","evidence","evaluation"].some(field=>!isExactArtifactRef(result[field]))||result.resultDigest!==canonicalJsonDigest(Object.fromEntries(Object.entries(result).filter(([key])=>!["apiVersion","kind","resultDigest"].includes(key)))))fail("SystemVerificationResult is not the closed digest-bound result shape","baseline-drift");
  const criterionIds=(requirementsLoaded.value.requirements?.acceptanceCriteria??[]).map(item=>item?.id);
  if(!criterionIds.length||criterionIds.some(id=>typeof id!=="string"||!id)||new Set(criterionIds).size!==criterionIds.length)fail("approved acceptance criteria must be non-empty and unique");
  const activeNodes=(graph.nodes??[]).filter(node=>node.state===undefined||node.state==="active");
  const activeEdges=(graph.edges??[]).filter(edge=>edge.state===undefined||edge.state==="active");
  const nodes=new Map();
  for(const node of activeNodes){if(nodes.has(node.nodeId))fail("TraceabilityGraph contains duplicate active node identities");nodes.set(node.nodeId,node)}
  const outgoing=new Map();
  for(const edge of activeEdges){
    if(!nodes.has(edge.sourceNodeId)||!nodes.has(edge.targetNodeId))fail("TraceabilityGraph contains a dangling active edge");
    if(!outgoing.has(edge.sourceNodeId))outgoing.set(edge.sourceNodeId,[]);
    outgoing.get(edge.sourceNodeId).push(edge);
  }
  for(const edges of outgoing.values())edges.sort((a,b)=>compareCodeUnits(a.edgeId,b.edgeId));
  const resultRef=ref(result,"resultId","resultDigest");
  const entries=[...criterionIds].sort(compareCodeUnits).map(acceptanceCriterionId=>{
    const starts=activeNodes.filter(node=>node.kind==="acceptance-criterion"&&node.stableId===acceptanceCriterionId&&node.authority==="approved");
    if(starts.length!==1||!starts[0].sourceLocators?.some(locator=>same(locator.artifact,requirementsLoaded.ref)))fail(`approved acceptance criterion ${acceptanceCriterionId} does not resolve exactly once from the exact RequirementsBaseline in the graph`);
    const queue=[{nodeId:starts[0].nodeId,pathNodeIds:[starts[0].nodeId],pathEdgeIds:[]}],seen=new Set([starts[0].nodeId]);let found;
    while(queue.length&&!found){
      const current=queue.shift(),node=nodes.get(current.nodeId);
      if(node.kind==="verification-evidence"&&node.authority==="approved"&&node.verificationStatus==="pass"&&same(node.attributes?.systemVerificationResult,resultRef)&&isExactArtifactRef(node.attributes?.artifact)){found={...current,node};break}
      for(const edge of outgoing.get(current.nodeId)??[]){const target=nodes.get(edge.targetNodeId);if(!FORWARD_COVERAGE_EDGES.has(edge.kind)||edge.authority!=="approved"||target.authority!=="approved"||seen.has(target.nodeId))continue;seen.add(target.nodeId);queue.push({nodeId:target.nodeId,pathNodeIds:[...current.pathNodeIds,target.nodeId],pathEdgeIds:[...current.pathEdgeIds,edge.edgeId]})}
    }
    if(!found)fail(`approved acceptance criterion ${acceptanceCriterionId} has no approved forward path to passing SystemVerification evidence`);
    return {acceptanceCriterionId,status:"passing",evidence:found.node.attributes.artifact,evidenceNodeId:found.node.nodeId,pathNodeIds:found.pathNodeIds,pathEdgeIds:found.pathEdgeIds};
  });
  const material={requirementsBaseline:requirementsLoaded.ref,systemVerificationResult:resultRef,traceabilityCheckpoint:checkpoint,approvedAcceptanceCriterionIds:[...criterionIds].sort(compareCodeUnits),entries,technicalAuthority:"system-verification",derivationAuthority:"business-acceptance-core"};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"BusinessAcceptanceTechnicalCoverage",coverageId:identity("BA-TECH-COVERAGE",material),...material};
  return validateBusinessAcceptanceArtifact(seal(body,"coverageDigest"),{requirementsBaseline:requirementsLoaded.ref,systemVerificationResult:result,traceabilityCheckpoint:checkpoint,approvedAcceptanceCriterionIds:material.approvedAcceptanceCriterionIds});
}

export function bindBusinessAcceptanceSubject(input) {
  const fields=["integratedSystemCandidate","systemVerificationResult","technicalCoverage","requirementsBaseline","projectOverviewBaseline","architectureBaseline","contractDisposition","repositoryReleaseSnapshot","policy","evidence","traceabilityCheckpoint"];
  if(fields.some(field=>!input?.[field])) fail("complete pinned acceptance context is required");
  const sv=input.systemVerificationResult,integrated=input.integratedSystemCandidate;
  if(sv.apiVersion!=="devrelay.dev/v1alpha1"||sv.kind!=="SystemVerificationResult"||sv.outcome!=="verified"||sv.progression!=="business-acceptance-gate"||sv.authority!=="system-verification") fail("SystemVerificationResult is not verified for business acceptance");
  const resultKeys=["apiVersion","kind","resultId","subject","obligationSet","policy","evidence","evaluation","outcome","progression","authority","resultDigest"];
  const resultRefs=["subject","obligationSet","policy","evidence","evaluation"];
  if(Object.keys(sv).length!==resultKeys.length||resultKeys.some(key=>!Object.hasOwn(sv,key))||resultRefs.some(field=>!isExactArtifactRef(sv[field]))||sv.resultDigest!==canonicalJsonDigest(Object.fromEntries(Object.entries(sv).filter(([key])=>!["apiVersion","kind","resultDigest"].includes(key))))) fail("SystemVerificationResult is not the closed digest-bound result shape");
  try { validateSystemVerificationArtifact(integrated); } catch(error) { fail(error.message); }
  if(!same(sv.subject,ref(integrated,"subjectId","subjectDigest"))) fail("SystemVerificationResult subject has drifted","baseline-drift");
  for(const field of ["requirementsBaseline","projectOverviewBaseline","architectureBaseline","contractDisposition"]) if(!same(integrated[field],input[field])) fail(`${field} has drifted`,"baseline-drift");
  const context={integratedSystemCandidate:integrated,systemVerificationResult:sv,technicalCoverage:input.technicalCoverage,policy:input.policy,evidence:input.evidence,requirementsBaseline:input.requirementsBaseline,projectOverviewBaseline:input.projectOverviewBaseline,architectureBaseline:input.architectureBaseline,contractDisposition:input.contractDisposition,repositoryReleaseSnapshot:input.repositoryReleaseSnapshot,traceabilityCheckpoint:input.traceabilityCheckpoint};
  try { validateBusinessAcceptanceArtifact(input.policy); validateBusinessAcceptanceArtifact(input.evidence,{requirementsBaseline:input.requirementsBaseline,projectOverviewBaseline:input.projectOverviewBaseline,systemVerificationResult:sv}); } catch(error){ fail(error.message,/stale/.test(error.message)?"baseline-drift":"unable-to-proceed"); }
  const material={integratedSystemCandidate:ref(integrated,"subjectId","subjectDigest"),systemVerificationResult:ref(sv,"resultId","resultDigest"),technicalCoverage:ref(input.technicalCoverage,"coverageId","coverageDigest"),requirementsBaseline:input.requirementsBaseline,projectOverviewBaseline:input.projectOverviewBaseline,architectureBaseline:input.architectureBaseline,contractDisposition:input.contractDisposition,repositoryReleaseSnapshot:input.repositoryReleaseSnapshot,policy:ref(input.policy,"policyId","policyDigest"),businessEvidence:ref(input.evidence,"evidenceSetId","evidenceDigest"),traceabilityCheckpoint:input.traceabilityCheckpoint};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"BusinessAcceptanceSubject",subjectId:identity("BA-SUBJECT",material),...material};
  return validateBusinessAcceptanceArtifact(seal(body,"subjectDigest"),context);
}

export function evaluateBusinessAcceptanceEvidence({subject,policy,evidence,technicalCoverage,businessObjectiveIds,successMetricIds,businessScopeIds}) {
  const objectives=[...businessObjectiveIds].sort(compareCodeUnits),metrics=[...successMetricIds].sort(compareCodeUnits),scopes=[...businessScopeIds].sort(compareCodeUnits);
  if(!objectives.length||!metrics.length||new Set(objectives).size!==objectives.length||new Set(metrics).size!==metrics.length) fail("approved objective and metric identities must be non-empty and unique");
  validateBusinessAcceptanceArtifact(policy); validateBusinessAcceptanceArtifact(evidence);
  if(!same(subject.policy,ref(policy,"policyId","policyDigest"))||!same(subject.businessEvidence,ref(evidence,"evidenceSetId","evidenceDigest"))) fail("subject, policy, or evidence lineage has drifted","baseline-drift");
  if(!scopes.length||new Set(scopes).size!==scopes.length)fail("approved business scope identities must be non-empty and unique");
  if(!same(subject.technicalCoverage,ref(technicalCoverage,"coverageId","coverageDigest")))fail("technical coverage has drifted","baseline-drift");
  const approved=new Set([...objectives.map(id=>`business-objective\0${id}`),...metrics.map(id=>`success-metric\0${id}`),...scopes.map(id=>`business-scope\0${id}`)]);
  const grouped=new Map([...approved].map(key=>[key,[]]));
  for(const item of evidence.items){const key=`${item.scopeKind}\0${item.scopeId}`;if(!grouped.has(key))fail("evidence targets unapproved business scope");grouped.get(key).push(item)}
  const dispositions=[...grouped].map(([key,items])=>{const [scopeKind,scopeId]=key.split("\0");const status=items.some(x=>x.status==="fail")?"failed":items.some(x=>x.status==="inconclusive")||!items.some(x=>x.status==="pass")?"needs-evidence":"satisfied";return{scopeKind,scopeId,status,evidenceIds:items.map(x=>x.evidenceId).sort(compareCodeUnits)}}).sort((a,b)=>compareCodeUnits(`${a.scopeKind}\0${a.scopeId}`,`${b.scopeKind}\0${b.scopeId}`));
  const outcome=dispositions.some(x=>x.status==="failed")?"rejected":dispositions.some(x=>x.status==="needs-evidence")?"needs-evidence":"eligible-for-acceptance";
  const material={subject:ref(subject,"subjectId","subjectDigest"),policy:ref(policy,"policyId","policyDigest"),evidence:ref(evidence,"evidenceSetId","evidenceDigest"),technicalCoverage:ref(technicalCoverage,"coverageId","coverageDigest"),approvedBusinessObjectiveIds:objectives,approvedSuccessMetricIds:metrics,approvedBusinessScopeIds:scopes,dispositions,outcome};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"BusinessAcceptanceEvaluation",evaluationId:identity("BA-EVAL",material),...material};
  return validateBusinessAcceptanceArtifact(seal(body,"evaluationDigest"),{subject,policy,evidence,technicalCoverage});
}

export function assembleBusinessAcceptanceCandidate({evaluation}) {
  const material={subject:evaluation.subject,policy:evaluation.policy,evidence:evaluation.evidence,evaluation:ref(evaluation,"evaluationId","evaluationDigest"),outcome:evaluation.outcome,authority:"candidate"};
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"BusinessAcceptanceCandidate",candidateId:identity("BA-CANDIDATE",material),...material};
  return validateBusinessAcceptanceArtifact(seal(body,"candidateDigest"),{evaluation});
}

export async function executeBusinessAcceptance(input) {
  const technicalCoverage=input.technicalCoverage??deriveBusinessAcceptanceTechnicalCoverage(input);
  const requirements=input.requirementsBaseline?.value??input.requirementsBaseline?.artifact??input.requirementsBaseline;
  const systemVerificationResult=input.systemVerificationResult?.value??input.systemVerificationResult?.artifact??input.systemVerificationResult;
  const businessObjectiveIds=input.businessObjectiveIds??requirements.requirements?.businessObjectives?.map(x=>x.id);
  const successMetricIds=input.successMetricIds??requirements.requirements?.successMetrics?.map(x=>x.id);
  const businessScopeIds=input.businessScopeIds??deriveBusinessScopeIdentities(requirements).map(x=>x.scopeId);
  const subject=bindBusinessAcceptanceSubject({...input,systemVerificationResult,requirementsBaseline:technicalCoverage.requirementsBaseline,traceabilityCheckpoint:technicalCoverage.traceabilityCheckpoint,technicalCoverage}),controller=createBusinessAcceptanceCheckpointController();
  const result=await controller.execute({checkpointId:input.checkpointId??"default",subject,systemVerificationResult,technicalCoverage,policy:input.policy,evidence:input.evidence,checkpoints:input.checkpoints,evaluate:()=>evaluateBusinessAcceptanceEvidence({...input,subject,technicalCoverage,businessObjectiveIds,successMetricIds,businessScopeIds}),assemble:evaluation=>assembleBusinessAcceptanceCandidate({evaluation})});
  return {technicalCoverage,subject,evaluation:result.evaluation,candidate:result.candidate,replayed:result.replayed,evaluationCalls:result.evaluationCalls,evidenceCalls:result.evidenceCalls,checkpointDigest:result.checkpointDigest};
}

export const createBusinessAcceptanceSubject=bindBusinessAcceptanceSubject;
export const evaluateBusinessEvidence=evaluateBusinessAcceptanceEvidence;

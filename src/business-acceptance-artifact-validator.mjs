import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema=JSON.parse(readFileSync(new URL("../contracts/business-acceptance-artifacts.schema.json",import.meta.url),"utf8"));
const validator=compileArtifactSchema(schema);
export const BUSINESS_ACCEPTANCE_ARTIFACT_KINDS=Object.freeze(["BusinessAcceptanceTechnicalCoverage","BusinessAcceptanceSubject","BusinessAcceptancePolicy","BusinessAcceptanceEvidenceSet","BusinessAcceptanceEvaluation","BusinessAcceptanceCandidate","BusinessAcceptanceOwnerApproval","BusinessAcceptanceRecord"]);
const digestFields={BusinessAcceptanceTechnicalCoverage:"coverageDigest",BusinessAcceptanceSubject:"subjectDigest",BusinessAcceptancePolicy:"policyDigest",BusinessAcceptanceEvidenceSet:"evidenceDigest",BusinessAcceptanceEvaluation:"evaluationDigest",BusinessAcceptanceCandidate:"candidateDigest",BusinessAcceptanceOwnerApproval:"approvalDigest",BusinessAcceptanceRecord:"recordDigest"};
export class BusinessAcceptanceArtifactValidationError extends Error { constructor(message){super(`business acceptance artifact is invalid: ${message}`);this.name="BusinessAcceptanceArtifactValidationError";this.code="DR4140";} }
const fail=message=>{throw new BusinessAcceptanceArtifactValidationError(message);};
const bodyDigest=(value,field)=>canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))));
const sameRef=(a,b)=>a?.artifactId===b?.artifactId&&a?.digest===b?.digest;
const ref=(value,idField,digestField)=>({artifactId:value[idField],digest:value[digestField]});
const unique=(values,label)=>{if(new Set(values).size!==values.length)fail(`duplicate ${label}`);};

function validateSemantics(value,context){
  if(value.kind==="BusinessAcceptanceTechnicalCoverage"){
    const {requirementsBaseline,systemVerificationResult,traceabilityCheckpoint,approvedAcceptanceCriterionIds}=context;
    if(!requirementsBaseline||!systemVerificationResult||!traceabilityCheckpoint||!approvedAcceptanceCriterionIds)fail("technical coverage requires exact approved requirements, verification, graph checkpoint, and criterion context");
    if(systemVerificationResult.kind!=="SystemVerificationResult"||systemVerificationResult.outcome!=="verified"||systemVerificationResult.progression!=="business-acceptance-gate"||systemVerificationResult.authority!=="system-verification")fail("technical coverage requires the upstream-authoritative verified SystemVerificationResult");
    if(!sameRef(value.requirementsBaseline,requirementsBaseline)||!sameRef(value.systemVerificationResult,ref(systemVerificationResult,"resultId","resultDigest"))||!sameRef(value.traceabilityCheckpoint,traceabilityCheckpoint))fail("technical coverage contains stale or substituted upstream lineage");
    unique(approvedAcceptanceCriterionIds,"approved criterion context identity");
    unique(value.approvedAcceptanceCriterionIds,"approved acceptance criterion identity");
    unique(value.entries.map(x=>x.acceptanceCriterionId),"technical coverage criterion");
    const approved=new Set(approvedAcceptanceCriterionIds);
    const declared=new Set(value.approvedAcceptanceCriterionIds);
    if(declared.size!==approved.size||[...declared].some(id=>!approved.has(id)))fail("technical coverage does not bind every approved acceptance criterion exactly");
    if(value.entries.length!==approved.size||value.entries.some(x=>!approved.has(x.acceptanceCriterionId)))fail("technical coverage is incomplete or contains an unknown criterion");
    for(const entry of value.entries){
      unique(entry.pathNodeIds,`path node identity for ${entry.acceptanceCriterionId}`);
      unique(entry.pathEdgeIds,`path edge identity for ${entry.acceptanceCriterionId}`);
      if(entry.pathEdgeIds.length!==entry.pathNodeIds.length-1)fail(`technical coverage path identity counts disagree for ${entry.acceptanceCriterionId}`);
      if(entry.pathNodeIds.at(-1)!==entry.evidenceNodeId)fail(`technical coverage evidence node is not the path endpoint for ${entry.acceptanceCriterionId}`);
    }
  }
  if(value.kind==="BusinessAcceptanceSubject"){
    const {integratedSystemCandidate,systemVerificationResult,technicalCoverage,policy,evidence}=context;
    if(!integratedSystemCandidate||!systemVerificationResult||!technicalCoverage||!policy||!evidence||!["repositoryReleaseSnapshot","traceabilityCheckpoint"].every(field=>context[field])) fail("subject requires exact integrated system, verification, technical coverage, release, policy, evidence, and traceability context");
    if(systemVerificationResult.kind!=="SystemVerificationResult"||systemVerificationResult.outcome!=="verified"||systemVerificationResult.progression!=="business-acceptance-gate"||systemVerificationResult.authority!=="system-verification") fail("subject requires a verified SystemVerificationResult authorized for BusinessAcceptanceGate");
    const integratedSystemRef=ref(integratedSystemCandidate,"subjectId","subjectDigest");
    if(!sameRef(systemVerificationResult.subject,integratedSystemRef)||!sameRef(value.integratedSystemCandidate,integratedSystemRef)) fail("subject and SystemVerificationResult must bind the exact IntegratedSystemCandidate");
    if(!sameRef(value.systemVerificationResult,ref(systemVerificationResult,"resultId","resultDigest"))||!sameRef(value.technicalCoverage,ref(technicalCoverage,"coverageId","coverageDigest"))||!sameRef(value.policy,ref(policy,"policyId","policyDigest"))||!sameRef(value.businessEvidence,ref(evidence,"evidenceSetId","evidenceDigest"))) fail("subject contains stale or substituted verification, coverage, policy, or evidence lineage");
    if(!sameRef(technicalCoverage.requirementsBaseline,value.requirementsBaseline)||!sameRef(technicalCoverage.systemVerificationResult,value.systemVerificationResult)||!sameRef(technicalCoverage.traceabilityCheckpoint,value.traceabilityCheckpoint))fail("subject technical coverage does not bind its exact approved context");
    for(const field of ["requirementsBaseline","projectOverviewBaseline","architectureBaseline","contractDisposition"]) if(!sameRef(value[field],integratedSystemCandidate[field])) fail(`subject contains stale or substituted ${field}`);
    for(const field of ["repositoryReleaseSnapshot","traceabilityCheckpoint"]) if(!sameRef(value[field],context[field])) fail(`subject contains stale or substituted ${field}`);
  }
  if(value.kind==="BusinessAcceptanceEvidenceSet"){
    unique(value.items.map(x=>x.evidenceId),"evidence identity");
    const keys=value.items.map(x=>`${x.scopeKind}\0${x.scopeId}\0${x.evidenceId}`);unique(keys,"scoped evidence identity");
    const {requirementsBaseline,projectOverviewBaseline,systemVerificationResult}=context;
    if(context.requirementsBaseline&&!sameRef(value.requirementsBaseline,requirementsBaseline))fail("evidence contains a stale requirements baseline");
    if(context.projectOverviewBaseline&&!sameRef(value.projectOverviewBaseline,projectOverviewBaseline))fail("evidence contains a stale project overview baseline");
    if(context.systemVerificationResult&&!sameRef(value.systemVerificationResult,ref(systemVerificationResult,"resultId","resultDigest")))fail("evidence contains a stale SystemVerificationResult");
  }
  if(value.kind==="BusinessAcceptanceEvaluation"){
    const {subject,policy,evidence,technicalCoverage}=context;if(!subject||!policy||!evidence||!technicalCoverage)fail("evaluation requires exact subject, policy, evidence, and technical coverage context");
    if(!sameRef(value.subject,ref(subject,"subjectId","subjectDigest"))||!sameRef(value.policy,ref(policy,"policyId","policyDigest"))||!sameRef(value.evidence,ref(evidence,"evidenceSetId","evidenceDigest"))||!sameRef(value.technicalCoverage,ref(technicalCoverage,"coverageId","coverageDigest"))||!sameRef(value.technicalCoverage,subject.technicalCoverage))fail("evaluation contains stale or substituted lineage");
    const expected=[...value.approvedBusinessObjectiveIds.map(id=>`business-objective\0${id}`),...value.approvedSuccessMetricIds.map(id=>`success-metric\0${id}`),...value.approvedBusinessScopeIds.map(id=>`business-scope\0${id}`)];
    const actual=value.dispositions.map(x=>`${x.scopeKind}\0${x.scopeId}`);unique(actual,"scope disposition");
    if(actual.length!==expected.length||actual.some(x=>!expected.includes(x)))fail("evaluation must dispose every approved objective, metric, and business-scope commitment exactly once");
    const evidenceIds=new Set(evidence.items.map(x=>x.evidenceId));if(value.dispositions.some(x=>x.evidenceIds.some(id=>!evidenceIds.has(id))))fail("evaluation cites unknown evidence");
    const derived=value.dispositions.some(x=>x.status==="failed")?"rejected":value.dispositions.some(x=>x.status==="needs-evidence")?"needs-evidence":"eligible-for-acceptance";if(value.outcome!==derived)fail("evaluation outcome contradicts dispositions");
  }
  if(value.kind==="BusinessAcceptanceCandidate"){
    const {evaluation}=context;if(!evaluation)fail("candidate requires exact evaluation context");
    if(!sameRef(value.evaluation,ref(evaluation,"evaluationId","evaluationDigest"))||!sameRef(value.subject,evaluation.subject)||!sameRef(value.policy,evaluation.policy)||!sameRef(value.evidence,evaluation.evidence)||value.outcome!==evaluation.outcome)fail("candidate contains stale or substituted evaluation lineage or outcome");
  }
  if(value.kind==="BusinessAcceptanceOwnerApproval"){
    const {candidate,candidateRawDigest}=context;if(!candidate||!candidateRawDigest)fail("owner approval requires exact candidate and raw-byte digest context");
    if(!sameRef(value.candidate,ref(candidate,"candidateId","candidateDigest"))||value.candidateRawDigest!==candidateRawDigest||!sameRef(value.approvedContext.subject,candidate.subject)||!sameRef(value.approvedContext.policy,candidate.policy)||!sameRef(value.approvedContext.evidence,candidate.evidence)||!sameRef(value.approvedContext.technicalCoverage,context.technicalCoverageRef))fail("owner approval does not bind the exact candidate bytes and context");
    if(value.decision==="approved"&&candidate.outcome!=="eligible-for-acceptance")fail("only an eligible-for-acceptance candidate may be owner-approved");
  }
  if(value.kind==="BusinessAcceptanceRecord"){
    const {candidate,approval}=context;if(!candidate||!approval)fail("record requires exact candidate and approval context");
    if(!sameRef(value.candidate,ref(candidate,"candidateId","candidateDigest"))||!sameRef(value.approval,ref(approval,"approvalId","approvalDigest"))||!sameRef(value.subject,candidate.subject))fail("record contains stale or substituted candidate, approval, or subject lineage");
    if(candidate.outcome!=="eligible-for-acceptance")fail("ineligible candidates cannot produce a BusinessAcceptanceRecord");
    const expectedOutcome=approval.decision==="approved"?"accepted":"rejected";if(value.outcome!==expectedOutcome)fail("record outcome contradicts the exact owner decision");
    if(value.lifecycleDisposition!==(value.outcome==="accepted"?"construction-complete":"incomplete"))fail("only accepted completes the construction lifecycle");
  }
}
export function validateBusinessAcceptanceArtifact(value,context={}){if(!validator(value))fail(validationDetail(validator));if(!BUSINESS_ACCEPTANCE_ARTIFACT_KINDS.includes(value.kind))fail(`unsupported kind ${value?.kind}`);const field=digestFields[value.kind];if(value[field]!==bodyDigest(value,field))fail(`${field} does not bind canonical material`);validateSemantics(value,context);return value;}

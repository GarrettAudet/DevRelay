import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/system-verification-artifacts.schema.json", import.meta.url), "utf8"));
const validator = compileArtifactSchema(schema);
export const SYSTEM_VERIFICATION_ARTIFACT_KINDS = Object.freeze(["IntegratedSystemCandidate","SystemVerificationObligationSet","SystemVerifierInvocation","RawSystemVerifierObservation","NormalizedSystemVerificationEvidence","SystemVerificationPolicy","SystemVerificationEvaluation","SystemVerificationResult"]);
const digestFields = {IntegratedSystemCandidate:"subjectDigest",SystemVerificationObligationSet:"obligationSetDigest",SystemVerifierInvocation:"invocationFingerprint",RawSystemVerifierObservation:"rawObservationDigest",NormalizedSystemVerificationEvidence:"evidenceDigest",SystemVerificationPolicy:"policyDigest",SystemVerificationEvaluation:"evaluationDigest",SystemVerificationResult:"resultDigest"};
export class SystemVerificationArtifactValidationError extends Error { constructor(message){super(`system verification artifact is invalid: ${message}`);this.name="SystemVerificationArtifactValidationError";this.code="DR4130";} }
const fail = message => { throw new SystemVerificationArtifactValidationError(message); };
const bodyDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion","kind",field].includes(key))));
const sameRef = (a,b) => a?.artifactId===b?.artifactId && a?.digest===b?.digest;
const unique = (values,label) => { if(new Set(values).size!==values.length) fail(`duplicate ${label}`); };

function validateSemantics(value, context) {
  if (value.kind === "SystemVerificationObligationSet") unique(value.obligations.map(x=>x.obligationId),"obligation identity");
  if (value.kind === "SystemVerifierInvocation") {
    const {subject,obligations,policy}=context;
    if(!subject||!obligations||!policy) fail("invocation requires exact subject, obligations, and policy context");
    if(!sameRef(value.subject,{artifactId:subject.subjectId,digest:subject.subjectDigest})||!sameRef(value.obligationSet,{artifactId:obligations.obligationSetId,digest:obligations.obligationSetDigest})||!sameRef(value.policy,{artifactId:policy.policyId,digest:policy.policyDigest})) fail("invocation contains a stale or substituted artifact reference");
    const ids=obligations.obligations.map(x=>x.obligationId);
    if(value.assignedObligationIds.some(id=>!ids.includes(id))) fail("invocation assigns an unknown obligation");
    if(JSON.stringify(value.verificationEnvironment)!==JSON.stringify(subject.verificationEnvironment)) fail("invocation verification environment is substituted");
  }
  if (value.kind === "RawSystemVerifierObservation") {
    const {invocation}=context;
    if(!invocation) fail("raw observation requires exact invocation context");
    if(value.invocationFingerprint!==invocation.invocationFingerprint||!sameRef(value.subject,invocation.subject)||!sameRef(value.obligationSet,invocation.obligationSet)||value.verifier.id!==invocation.verifier.id||value.verifier.version!==invocation.verifier.version) fail("raw observation contains a substituted invocation binding");
    unique(value.observations.map(x=>x.obligationId),"obligation observation");
    if(value.observations.length!==invocation.assignedObligationIds.length||value.observations.some(x=>!invocation.assignedObligationIds.includes(x.obligationId))) fail("raw observation must exactly cover assigned obligations");
    for(const observation of value.observations) {
      if(observation.status!=="inconclusive" && observation.evidenceBindings.length===0) fail("conclusive observation requires evidence");
      unique(observation.evidenceBindings.map(binding=>`${binding.kind}\u0000${binding.artifact.artifactId}\u0000${binding.artifact.digest}`),`evidence binding for ${observation.obligationId}`);
    }
  }
  if (value.kind === "NormalizedSystemVerificationEvidence") {
    const {subject,obligations}=context;
    if(!subject||!obligations) fail("normalized evidence requires exact subject and obligations context");
    if(!sameRef(value.subject,{artifactId:subject.subjectId,digest:subject.subjectDigest})||!sameRef(value.obligationSet,{artifactId:obligations.obligationSetId,digest:obligations.obligationSetDigest})) fail("normalized evidence contains a stale or substituted artifact reference");
  }
  if (value.kind === "SystemVerificationEvaluation") {
    const {subject,obligations,policy,evidence}=context;
    if(!subject||!obligations||!policy||!evidence) fail("evaluation requires exact subject, obligations, policy, and evidence context");
    const refs=[[value.subject,subject.subjectId,subject.subjectDigest],[value.obligationSet,obligations.obligationSetId,obligations.obligationSetDigest],[value.policy,policy.policyId,policy.policyDigest],[value.evidence,evidence.evidenceSetId,evidence.evidenceDigest]];
    if(refs.some(([r,id,d])=>!sameRef(r,{artifactId:id,digest:d}))) fail("evaluation contains a stale or substituted artifact reference");
    unique(value.dispositions.map(x=>x.obligationId),"obligation disposition");
    const ids=obligations.obligations.map(x=>x.obligationId); if(value.dispositions.length!==ids.length||value.dispositions.some(x=>!ids.includes(x.obligationId))) fail("evaluation must dispose every obligation exactly once");
    const derived=value.dispositions.some(x=>x.status==="failed")?"failed":value.dispositions.some(x=>x.status==="missing-evidence")?"needs-evidence":"verified"; if(value.outcome!==derived) fail("evaluation outcome contradicts dispositions");
  }
  if (value.kind === "SystemVerificationResult") {
    const {evaluation}=context; if(!evaluation) fail("result requires exact evaluation context");
    if(!sameRef(value.evaluation,{artifactId:evaluation.evaluationId,digest:evaluation.evaluationDigest})||!sameRef(value.subject,evaluation.subject)||!sameRef(value.obligationSet,evaluation.obligationSet)||!sameRef(value.policy,evaluation.policy)||!sameRef(value.evidence,evaluation.evidence)||value.outcome!==evaluation.outcome) fail("result contains stale or substituted evaluation lineage or an invalid outcome");
    if(value.progression!==(value.outcome==="verified"?"business-acceptance-gate":"none")) fail("only verified may progress to BusinessAcceptanceGate");
  }
}
export function validateSystemVerificationArtifact(value, context={}) {
  if(!validator(value)) fail(validationDetail(validator));
  if(!SYSTEM_VERIFICATION_ARTIFACT_KINDS.includes(value.kind)) fail(`unsupported kind ${value?.kind}`);
  const field=digestFields[value.kind]; if(value[field]!==bodyDigest(value,field)) fail(`${field} does not bind canonical material`);
  validateSemantics(value,context); return value;
}

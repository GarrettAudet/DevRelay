import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

export const REVIEW_VERIFIER=Object.freeze({id:"verifier.review",version:"1.0.0"});
export class WorkItemVerificationReviewVerifierAdapterError extends Error { constructor(message){super(`review verifier adapter rejected input: ${message}`);this.name="WorkItemVerificationReviewVerifierAdapterError";this.code="DR4091";} }
const fail=(message)=>{throw new WorkItemVerificationReviewVerifierAdapterError(message);};
const same=(value)=>value?.id===REVIEW_VERIFIER.id&&value?.version===REVIEW_VERIFIER.version;
const digestBody=(value,field)=>canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind",field].includes(key))));
const stableId=(prefix,material)=>`${prefix}-${canonicalJsonDigest(material).slice(7,31).toUpperCase()}`;

export function adaptReviewVerifierResult({invocation,binding,nativeBytes,nativeResult,nativeArtifact}) {
  validateWorkItemVerificationArtifact(invocation);validateWorkItemVerificationArtifact(binding);
  if(!same(invocation.verifier))fail("verifier identity or version was substituted");
  if(invocation.binding.digest!==binding.bindingDigest)fail("binding digest does not match the invocation");
  const partitions=binding.partitions.filter(({verifier})=>same(verifier)), assigned=new Map(invocation.assignedObligations.map((entry)=>[entry.obligationId,entry]));
  if(partitions.length!==1||canonicalJson([...partitions[0].obligationIds].sort())!==canonicalJson([...assigned.keys()].sort()))fail("assigned obligations do not match the exact validated binding partition");
  if(!(Buffer.isBuffer(nativeBytes)||nativeBytes instanceof Uint8Array))fail("exact native review bytes are required");
  const bytes=Buffer.from(nativeBytes);if(!nativeArtifact?.artifactId||nativeArtifact.digest!==sha256Digest(bytes))fail("native artifact must digest-bind the exact supplied bytes");
  let result;try{result=JSON.parse(bytes.toString("utf8"));}catch{fail("native review bytes contain malformed JSON");}
  if(nativeResult!==undefined&&canonicalJson(result)!==canonicalJson(nativeResult))fail("native review data does not match native bytes");
  if(!result||!Array.isArray(result.findings)||!["observed","failed","interrupted","timed-out","denied"].includes(result.terminalState??"observed"))fail("independent review result is malformed");
  const byObligation=new Map();for(const finding of result.findings){if(!assigned.has(finding?.obligationId))fail(`review finding references unrelated obligation ${finding?.obligationId}`);if(byObligation.has(finding.obligationId))fail(`conflicting review findings for ${finding.obligationId}`);byObligation.set(finding.obligationId,finding);}
  const terminalState=result.terminalState??"observed";
  const observations=[...assigned.values()].sort((a,b)=>a.obligationId.localeCompare(b.obligationId)).map((obligation)=>{
    const obligationId=obligation.obligationId,finding=byObligation.get(obligationId),observationId=stableId("OBS",{invocationFingerprint:invocation.invocationFingerprint,verifier:REVIEW_VERIFIER,obligationId});
    if(!finding){const body={observationId,obligationId,status:"inconclusive",summary:`No conclusive independent review evidence was supplied (${terminalState}).`,evidenceBindings:[]};return{...body,observationDigest:digestBody(body,"observationDigest")};}
    const status={accepted:"pass",rejected:"fail",uncertain:"inconclusive"}[finding.disposition];if(!status||typeof finding.summary!=="string"||!finding.summary||!Array.isArray(finding.evidence))fail(`review finding for ${obligationId} is malformed`);
    const required=new Set(obligation.requiredEvidenceKinds),seen=new Set();const evidenceBindings=finding.evidence.map((evidence)=>{if(!evidence||!required.has(evidence.kind)||!evidence.artifact?.artifactId||!evidence.artifact?.digest)fail(`review evidence for ${obligationId} has unrelated or malformed kind`);const key=canonicalJson({kind:evidence.kind,artifact:evidence.artifact});if(seen.has(key))fail(`duplicate review evidence binding for ${obligationId}`);seen.add(key);return{evidenceId:stableId("EV",{invocationFingerprint:invocation.invocationFingerprint,verifier:REVIEW_VERIFIER,obligationId,kind:evidence.kind,artifact:evidence.artifact}),kind:evidence.kind,artifact:structuredClone(evidence.artifact)};}).sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
    if(terminalState!=="observed"){const body={observationId,obligationId,status:"inconclusive",summary:finding.summary,evidenceBindings:[]};return{...body,observationDigest:digestBody(body,"observationDigest")};}
    const body={observationId,obligationId,status,summary:finding.summary,evidenceBindings};return{...body,observationDigest:digestBody(body,"observationDigest")};
  });
  const diagnostics=[];if(typeof result.diagnostic==="string"&&result.diagnostic)diagnostics.push(result.diagnostic);for(const entry of observations)if(entry.status==="inconclusive"&&!byObligation.has(entry.obligationId))diagnostics.push(`missing independent review evidence for ${entry.obligationId}`);
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"RawVerifierResult",verificationAttemptId:invocation.verificationAttemptId,invocationFingerprint:invocation.invocationFingerprint,bindingDigest:binding.bindingDigest,verifier:structuredClone(REVIEW_VERIFIER),terminalState,observations,diagnostics,nativeArtifacts:[structuredClone(nativeArtifact)]};
  return validateWorkItemVerificationArtifact({...body,rawResultDigest:digestBody(body,"rawResultDigest")},{invocation,binding});
}

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

export const TEST_VERIFIER = Object.freeze({ id:"verifier.test", version:"1.0.0" });
export class WorkItemVerificationTestVerifierAdapterError extends Error {
  constructor(message) { super(`test verifier adapter rejected input: ${message}`); this.name="WorkItemVerificationTestVerifierAdapterError"; this.code="DR4090"; }
}
const fail = (message) => { throw new WorkItemVerificationTestVerifierAdapterError(message); };
const sameVerifier = (value) => value?.id === TEST_VERIFIER.id && value?.version === TEST_VERIFIER.version;
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion","kind",field].includes(key))));
const stableId = (prefix, material) => `${prefix}-${canonicalJsonDigest(material).slice(7,31).toUpperCase()}`;

function exactContext(invocation, binding) {
  validateWorkItemVerificationArtifact(invocation); validateWorkItemVerificationArtifact(binding);
  if (!sameVerifier(invocation.verifier)) fail("verifier identity or version was substituted");
  if (invocation.binding.digest !== binding.bindingDigest) fail("binding digest does not match the invocation");
  const partitions = binding.partitions.filter(({verifier}) => sameVerifier(verifier));
  const ids = invocation.assignedObligations.map(({obligationId}) => obligationId);
  if (partitions.length !== 1 || canonicalJson([...partitions[0].obligationIds].sort()) !== canonicalJson([...ids].sort())) fail("assigned obligations do not match the exact validated binding partition");
  return new Map(invocation.assignedObligations.map((entry) => [entry.obligationId,entry]));
}

function nativeInput(nativeBytes, nativeResult, nativeArtifact) {
  if (!(Buffer.isBuffer(nativeBytes) || nativeBytes instanceof Uint8Array)) fail("exact native result bytes are required");
  const bytes=Buffer.from(nativeBytes);
  if (!nativeArtifact?.artifactId || nativeArtifact.digest !== sha256Digest(bytes)) fail("native artifact must digest-bind the exact supplied bytes");
  let parsed; try { parsed=JSON.parse(bytes.toString("utf8")); } catch { fail("native result bytes contain malformed JSON"); }
  if (nativeResult !== undefined && canonicalJson(parsed) !== canonicalJson(nativeResult)) fail("native result data does not match native bytes");
  if (!parsed || !Array.isArray(parsed.tests) || !["observed","failed","interrupted","timed-out","denied"].includes(parsed.terminalState ?? "observed")) fail("machine test result is malformed");
  return parsed;
}

function observation(invocation, obligation, entry, terminalState) {
  const obligationId=obligation.obligationId;
  if (!entry) {
    const summary=entry?.summary || `No conclusive machine test evidence was supplied (${terminalState}).`;
    const body={observationId:stableId("OBS",{invocationFingerprint:invocation.invocationFingerprint,verifier:TEST_VERIFIER,obligationId}),obligationId,status:"inconclusive",summary,evidenceBindings:[]};
    return {...body,observationDigest:digestBody(body,"observationDigest")};
  }
  if (!["pass","fail","inconclusive"].includes(entry.status) || typeof entry.summary !== "string" || !entry.summary || !Array.isArray(entry.evidence)) fail(`machine test observation for ${obligationId} is malformed`);
  const required=new Set(obligation.requiredEvidenceKinds), seen=new Set();
  const evidenceBindings=entry.evidence.map((evidence) => {
    if (!evidence || !required.has(evidence.kind) || !evidence.artifact?.artifactId || !evidence.artifact?.digest) fail(`machine test evidence for ${obligationId} has unrelated or malformed kind`);
    const key=canonicalJson({kind:evidence.kind,artifact:evidence.artifact}); if (seen.has(key)) fail(`duplicate machine test evidence binding for ${obligationId}`); seen.add(key);
    return {evidenceId:stableId("EV",{invocationFingerprint:invocation.invocationFingerprint,verifier:TEST_VERIFIER,obligationId,kind:evidence.kind,artifact:evidence.artifact}),kind:evidence.kind,artifact:structuredClone(evidence.artifact)};
  }).sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
  if (terminalState !== "observed") {
    const body={observationId:stableId("OBS",{invocationFingerprint:invocation.invocationFingerprint,verifier:TEST_VERIFIER,obligationId}),obligationId,status:"inconclusive",summary:entry.summary,evidenceBindings:[]};
    return {...body,observationDigest:digestBody(body,"observationDigest")};
  }
  const body={observationId:stableId("OBS",{invocationFingerprint:invocation.invocationFingerprint,verifier:TEST_VERIFIER,obligationId}),obligationId,status:entry.status,summary:entry.summary,evidenceBindings};
  return {...body,observationDigest:digestBody(body,"observationDigest")};
}

export function adaptTestVerifierResult({invocation,binding,nativeBytes,nativeResult,nativeArtifact}) {
  const assigned=exactContext(invocation,binding), result=nativeInput(nativeBytes,nativeResult,nativeArtifact), byObligation=new Map();
  for (const entry of result.tests) {
    if (!assigned.has(entry?.obligationId)) fail(`machine test observation references unrelated obligation ${entry?.obligationId}`);
    if (byObligation.has(entry.obligationId)) fail(`conflicting machine test observations for ${entry.obligationId}`);
    byObligation.set(entry.obligationId,entry);
  }
  const terminalState=result.terminalState ?? "observed";
  const observations=[...assigned.values()].sort((a,b)=>a.obligationId.localeCompare(b.obligationId)).map((obligation)=>observation(invocation,obligation,byObligation.get(obligation.obligationId),terminalState));
  const diagnostics=[]; if (typeof result.diagnostic === "string" && result.diagnostic) diagnostics.push(result.diagnostic);
  for (const entry of observations) if (entry.status === "inconclusive" && !byObligation.has(entry.obligationId)) diagnostics.push(`missing machine test evidence for ${entry.obligationId}`);
  const body={apiVersion:"devrelay.dev/v1alpha1",kind:"RawVerifierResult",verificationAttemptId:invocation.verificationAttemptId,invocationFingerprint:invocation.invocationFingerprint,bindingDigest:binding.bindingDigest,verifier:structuredClone(TEST_VERIFIER),terminalState,observations,diagnostics,nativeArtifacts:[structuredClone(nativeArtifact)]};
  return validateWorkItemVerificationArtifact({...body,rawResultDigest:digestBody(body,"rawResultDigest")},{invocation,binding});
}

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { applyBoundedWork, boundedLoaded, boundedWorkBinding, boundedWorkContracts, boundedWorkChangeCardSchema,
  boundedWorkError, boundedWorkRoles, sameBoundedRef, validateBoundedWorkCandidate, validateBoundedWorkInputs } from "./work-breakdown-bounded.mjs";
const fail = message => { throw boundedWorkError(message); };
const object = properties => ({ type:"object", additionalProperties:false, properties, required:Object.keys(properties) });
const strings = (minItems=0) => ({type:"array",minItems,maxItems:100,uniqueItems:true,items:{type:"string",minLength:1,maxLength:240}});
// This is the existing published change-card/v1 contract, not a second UI source.
const validateCard = compileArtifactSchema(object({workItemId:{type:"string",pattern:"^WI-[A-Z0-9-]+$"},criterionIds:strings(1),readPaths:strings(1),writePaths:strings(1),testFiles:strings(1),reuse:object({disposition:{enum:["reuse","not-applicable"]},rationale:{type:"string",minLength:1,maxLength:4000},paths:strings()})}));
const protectedNames = new Set(["agents.md","claude.md","gemini.md","skill.md"]);
function pathCheck(path) {
  if (path.split("/").some(p=>!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[.]|$)/i.test(p) || protectedNames.has(p.toLowerCase()))) fail("Unsafe/protected change-card path: " + path);
}
export function validateBoundedChangeCard(card, workItem) {
  if (!validateCard(card)) fail("Invalid change-card/v1: " + JSON.stringify(validateCard.errors));
  for (const path of [...card.readPaths,...card.writePaths,...card.testFiles,...card.reuse.paths]) pathCheck(path);
  for (const path of [...card.writePaths,...card.testFiles,...card.reuse.paths]) if (!card.readPaths.includes(path)) fail("Every write/test/reuse path must be inspected");
  if (!card.reuse.rationale.trim() || (card.reuse.disposition === "reuse") !== (card.reuse.paths.length > 0)) fail("Explicit justified reuse disposition and paths are required");
  if (card.workItemId !== workItem.id || canonicalJsonDigest([...card.criterionIds].sort()) !== canonicalJsonDigest([...workItem["acceptance-criterion-refs"]].sort())) fail("Card must retain the exact item and all its acceptance criteria");
  if (![workItem.objective,...workItem["bounded-scope"].included,...workItem["verification-plan"].checks.flatMap(c=>[c.method,c.successCriteria])].every(v=>typeof v === "string" && v.trim())) fail("Meaningful observable scope and verification assertions are required");
  return card;
}
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
async function load(ref, loadArtifact) {
  const supplied=await loadArtifact(structuredClone(ref));
  const bytes=Buffer.from(supplied instanceof Uint8Array ? supplied : supplied?.bytes ?? []);
  if (sha256Digest(bytes)!==ref.digest) fail("Authoring input raw-byte digest mismatch");
  return {ref:structuredClone(ref),bytes,value:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))};
}
async function persist(value, id, contract, persistArtifact) {
  const bytes=Buffer.from(canonicalJson(value)+"\n");
  const returned=await persistArtifact({value:structuredClone(value),bytes,artifactId:id,schema:contract.schema,mediaType:contract.mediaType});
  const ref=returned?.ref ?? returned;
  if (!ref || ref.artifactId!==id || ref.schema!==contract.schema || ref.mediaType!==contract.mediaType || ref.digest!==sha256Digest(bytes)) fail("Authoring persistence returned substituted artifact identity or bytes");
  return ref;
}
/** A truthful bounded conversation port; its only effect is candidate evidence persistence. */
export function createConversationBoundedWorkAdapter({loadArtifact,persistArtifact,executeCapability}={}) {
  if (![loadArtifact,persistArtifact,executeCapability].every(port=>typeof port==="function")) fail("Exact loader, persistence and conversation capability ports are required");
  return Object.freeze({async invoke(invocation) {
    if (canonicalJson(invocation.module)!==canonicalJson(boundedWorkBinding.module) || canonicalJson(invocation.plugin)!==canonicalJson(boundedWorkBinding.plugin)) fail("Bounded authoring binding changed");
    const config=invocation.config;
    if (config?.authoringMethod!=="conversation" || typeof config.planningOutputRoot!=="string") fail("Conversation authoring configuration is required");
    if (invocation.grants?.length!==1 || invocation.grants[0].kind!=="filesystem.write" || invocation.grants[0].scope!==config.planningOutputRoot) fail("Candidate authoring grants must contain only the declared host-state write scope");
    const loadedInputs={};
    for (const role of boundedWorkRoles) {
      if (invocation.inputs[role]?.length!==1) fail("Exact input cardinality required");
      loadedInputs[role]=[await load(invocation.inputs[role][0],loadArtifact)];
    }
    validateBoundedWorkInputs(loadedInputs);
    const response=await executeCapability(freeze({capability:"conversation.plan-bounded-work/v1",binding:structuredClone(boundedWorkBinding),inputs:Object.fromEntries(Object.entries(loadedInputs).map(([role,entries])=>[role,entries.map(({ref,value})=>({ref:structuredClone(ref),value:structuredClone(value)}))]))}));
    if (!response || typeof response!=="object" || Object.keys(response).sort().join("\0")!==["changeCard","workItem"].join("\0")) fail("Conversation proposal must contain only workItem and changeCard, never approval, route, or graph authority");
    const workItem=structuredClone(response.workItem), card=structuredClone(response.changeCard);
    validateBoundedChangeCard(card,workItem);
    const prior=boundedLoaded(loadedInputs,"current-work-breakdown-baseline");
    const result=applyBoundedWork({baseline:prior.value,workItem});
    const id="WBD-"+canonicalJsonDigest({inputs:invocation.inputs,workItem,card}).slice(7,31).toUpperCase();
    const cardRef=await persist(card,"CARD-"+canonicalJsonDigest(card).slice(7,31).toUpperCase(),{schema:boundedWorkChangeCardSchema,mediaType:"application/json"},persistArtifact);
    const candidate={apiVersion:"devrelay.dev/v1alpha1",kind:"WorkBreakdownBoundedDraft",draftId:id,operation:"plan-bounded-work",inputBindings:boundedWorkRoles.map(role=>({role,artifact:boundedLoaded(loadedInputs,role).ref})),currentBaseline:prior.ref,workItem,resultingWorkItemsDigest:result.workItemsDigest,coverageDispositions:result.coverageDispositions,nativeArtifacts:[cardRef],sourceRefs:structuredClone(workItem["source-refs"])};
    const section=boundedLoaded(loadedInputs,"architecture-baseline").value.sections.architectureModel;
    const architectureModelAttachment=section.mode==="attached" ? await load(section.artifact,loadArtifact) : undefined;
    validateBoundedWorkCandidate({candidate,loadedInputs,architectureModelAttachment});
    const candidateRef=await persist(candidate,id,boundedWorkContracts.candidate,persistArtifact);
    return {apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleResult",invocationId:invocation.invocationId,status:"completed",outcome:"decomposed",outputs:{"work-breakdown-bounded-draft":[candidateRef]},evidence:["contract-validation","source-closure"].map(kind=>({kind:"work-breakdown/"+kind,subject:"work-breakdown-bounded-draft:"+id,status:"pass",artifact:candidateRef})),diagnostics:[]};
  }});
}

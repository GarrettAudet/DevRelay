import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { applyBoundedWork, boundedLoaded, boundedWorkBinding, validateBoundedWorkArtifact, validateBoundedPriorBaseline } from "./work-breakdown-bounded.mjs";
const scope="work-breakdown/bounded-candidate";
const matches=context=>canonicalJson(context.invocation?.module)===canonicalJson(boundedWorkBinding.module);
const locator=(loaded,jsonPointer,value)=>({artifact:{artifactId:loaded.ref.artifactId,digest:loaded.ref.digest},jsonPointer,entityDigest:canonicalJsonDigest(value)});
const endpoint=(kind,stableId,authority,scope)=>({kind,stableId,authority,scope});
const immutable=value=>{Object.values(value).filter(v=>v&&typeof v==="object").forEach(immutable);return Object.freeze(value);};
/** Trusted projection only; the conversation adapter never receives this service. */
export const boundedWorkTraceabilityContributor=immutable({metadata:{id:"devrelay.work-breakdown-bounded-candidate",version:"0.1.0"},scope,authority:"candidate",ownership:{scope,authority:"candidate",nodeKinds:["work-item"],edgeKinds:["planned-by","implementation-planned-by","realization-planned-by"]},match:context=>matches(context)&&context.moduleResult?.status==="completed"&&context.moduleResult?.outcome==="decomposed",async project(context) {
  if(!matches(context)||context.moduleResult?.status!=="completed"||context.moduleResult?.outcome!=="decomposed") throw new Error("Nonmatching bounded traceability execution");
  const candidate=boundedLoaded(context.loadedOutputs,"work-breakdown-bounded-draft");
  const prior=boundedLoaded(context.loadedInputs,"current-work-breakdown-baseline");
  validateBoundedWorkArtifact(candidate.value,candidate);validateBoundedPriorBaseline(prior);
  const applied=applyBoundedWork({baseline:prior.value,workItem:candidate.value.workItem});
  if(applied.workItemsDigest!==candidate.value.resultingWorkItemsDigest) throw new Error("Bounded traceability full-result digest mismatch");
  const nodes=[{kind:"artifact-reference",stableId:canonicalJsonDigest({schema:candidate.ref.schema,artifactId:candidate.ref.artifactId,digest:candidate.ref.digest}),label:candidate.ref.artifactId,attributes:{artifact:structuredClone(candidate.ref)},sourceLocators:[locator(candidate,"",candidate.value)]}];
  const edges=[];
  for(const item of applied.workItems) {
    const added=item.id===candidate.value.workItem.id;
    const loaded=added?candidate:prior;
    const pointer=added?"/workItem":"/workItems/"+prior.value.workItems.findIndex(p=>p.id===item.id);
    const sourceLocators=[locator(loaded,pointer,item),locator(candidate,"/resultingWorkItemsDigest",candidate.value.resultingWorkItemsDigest)];
    nodes.push({kind:"work-item",stableId:item.id,label:item.objective.slice(0,1024),attributes:{workType:item["work-type"],boundedScope:item["bounded-scope"]},sourceLocators});
    for(const [field,kind,sourceKind,sourceScope] of [["acceptance-criterion-refs","planned-by","acceptance-criterion","requirements/baseline"],["architecture-refs","implementation-planned-by","architecture-element","architecture/baseline"],["contract-refs","realization-planned-by","contract","contracts/baseline"]]) for(const [index,id] of item[field].entries()) edges.push({kind,source:endpoint(sourceKind,id,"approved",sourceScope),target:endpoint("work-item",item.id,"candidate",scope),rationale:"Approved scope is planned by this bounded candidate work item, not implemented or accepted.",sourceLocators:[locator(loaded,`${pointer}/${field}/${index}`,id)]});
  }
  const order=(a,b)=>canonicalJson(a).localeCompare(canonicalJson(b),"en");
  return {horizon:"implementation",nodes:nodes.sort(order),edges:edges.sort(order)};
}});
export const boundedWorkControlTraceabilityContributor=immutable({metadata:{id:"devrelay.work-breakdown-bounded-control",version:"0.1.0"},scope:"work-breakdown/bounded-control",authority:"candidate",ownership:{scope:"work-breakdown/bounded-control",authority:"candidate",nodeKinds:[],edgeKinds:[]},match:context=>matches(context)&&["baseline_drift","unable_to_proceed","execution_failed"].includes(context.moduleResult?.outcome),async project(context){return {horizon:"implementation",nodes:[],edges:[],reason:"Bounded work did not produce a promotable candidate: "+context.moduleResult.outcome};}});

export const boundedWorkTraceabilityContributors = Object.freeze([boundedWorkTraceabilityContributor, boundedWorkControlTraceabilityContributor]);

// A host must explicitly select this policy when registering the bounded scopes.
export { TRACEABILITY_VOCABULARY_V1_9 as boundedWorkTraceabilityVocabulary } from "./traceability-artifact-validator.mjs";

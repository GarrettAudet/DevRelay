import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { resolveVerifiedArchitectureModelContent } from "./architecture-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { workBreakdownRuntimeArtifactContracts } from "./work-breakdown-runtime-contracts.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/work-breakdown-bounded-artifacts.schema.json", import.meta.url), "utf8"));
const legacySchema = JSON.parse(readFileSync(new URL("../contracts/work-breakdown-artifacts.schema.json", import.meta.url), "utf8"));
const validate = compileArtifactSchema(schema, [legacySchema]);
export const boundedWorkContracts = Object.freeze(Object.fromEntries(Object.entries(schema.$defs).map(([key, value]) => [key, Object.freeze({
  schema: value.$id, mediaType: `application/vnd.devrelay.${({state:"project-work-breakdown-state",assessment:"bounded-design-reuse-assessment",candidate:"work-breakdown-bounded-draft",baseline:"work-breakdown-baseline",approval:"work-breakdown-bounded-approval"})[key]}+json`,
})])));
export const boundedWorkRoles = Object.freeze(schema.$defs.candidate.properties.inputBindings.items.properties.role.enum);
export const boundedWorkBinding = Object.freeze({ module: Object.freeze({ id: "work-breakdown", version: "0.2.0", operation: "plan-bounded-work" }), plugin: Object.freeze({ id: "conversation-bounded-work", version: "0.1.0" }) });
export const boundedWorkChangeCardSchema = "https://devrelay.dev/examples/modular/coding/change-card/v1";
export function boundedWorkError(message, code = "BOUNDED_WORK_INVALID") { const error = new Error(message); error.code = code; return error; }
const fail = (message, code) => { throw boundedWorkError(message, code); };
export const sameBoundedRef = (a, b) => Boolean(a && b) && ["artifactId", "schema", "mediaType", "digest"].every(k => a[k] === b[k]);
export function exactBoundedRef(label, a, b) { if (!sameBoundedRef(a, b)) fail(`${label} is missing, stale, or substituted`, "BASELINE_ALIGNMENT_REQUIRED"); }
const equal = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const sort = values => [...values].sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
const key = value => `${value.scopeKind}\0${value.scopeRef}`;
export function boundedLoaded(inputs, role) { if (inputs?.[role]?.length !== 1) fail(`Exactly one ${role} input is required`); return inputs[role][0]; }
const refKey = ref => [ref.artifactId,ref.schema,ref.mediaType,ref.digest].join("\0");
const sourceKey = source => [source.role,refKey(source.artifact),source.jsonPointer].join("\0");
function unique(values,keyOf,label) {
  const keys=values.map(keyOf);
  if(new Set(keys).size!==keys.length) fail("Duplicate stable identity in "+label);
}
function validateItemLocal(item) {
  unique(item.deliverables,item=>item.id,"work deliverables");
  unique(item["verification-plan"].checks,check=>check.id,"verification checks");
  unique(item["dependency-hints"],hint=>hint["work-item-ref"]+"\0"+hint.relation,"dependency hints");
  unique(item["source-refs"],sourceKey,"work source refs");
}
export function validateBoundedWorkArtifact(value, context = {}) {
  if (!validate(value)) fail("Invalid bounded-work artifact: " + JSON.stringify(validate.errors));
  if(value.inputBindings) unique(value.inputBindings,binding=>binding.role,"input bindings");
  if(value.sourceRefs) unique(value.sourceRefs,sourceKey,"source refs");
  if(value.nativeArtifacts) unique(value.nativeArtifacts,refKey,"native artifacts");
  if(value.workItem) validateItemLocal(value.workItem);
  if(value.workItems) {
    unique(value.workItems,item=>item.id,"baseline work items");
    value.workItems.forEach(validateItemLocal);
  }
  if(value.coverageDispositions) {
    unique(value.coverageDispositions,key,"coverage scope");
    for(const entry of value.coverageDispositions) if(entry.disposition==="no-work-required" &&
      (entry.approval.scopeKind!==entry.scopeKind||entry.approval.scopeRef!==entry.scopeRef)) fail("No-work proof is not bound to its exact scope");
  }
  const selected = Object.entries(schema.$defs).find(([, item]) => item.properties.kind.const === value.kind);
  if (context.ref) {
    const contract = boundedWorkContracts[selected[0]];
    if (context.ref.schema !== contract.schema || context.ref.mediaType !== contract.mediaType) fail("Bounded artifact schema/media pairing changed");
    const id = value.stateId ?? value.assessmentId ?? value.draftId ?? value.baselineId ?? value.approvalId;
    if (context.ref.artifactId !== id) fail("Bounded artifact stable identity changed");
  }
  return value;
}
export function validateBoundedPriorBaseline(loaded) {
  if (loaded.ref.schema === boundedWorkContracts.baseline.schema) validateBoundedWorkArtifact(loaded.value, loaded);
  else validateWorkBreakdownArtifact(loaded.value, loaded);
  return loaded.value;
}
function refs(item) { return [ ...item["acceptance-criterion-refs"].map(id => ["acceptance-criterion",id]), ...item["architecture-refs"].map(id => ["architecture",id]), ...item["contract-refs"].map(id => ["contract",id]) ]; }
function sources(values, inputs) {
  for (const source of values) {
    const loaded = boundedLoaded(inputs, source.role);
    exactBoundedRef("Source artifact", source.artifact, loaded.ref);
    let value = loaded.value;
    for (const part of source.jsonPointer === "" ? [] : source.jsonPointer.slice(1).split("/")) {
      const token = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!value || typeof value !== "object" || !Object.hasOwn(value, token)) fail("Unresolved source pointer: " + source.jsonPointer);
      value = value[token];
    }
  }
}
export function validateBoundedWorkInputs(inputs) {
  const state = boundedLoaded(inputs, "project-work-breakdown-state");
  validateBoundedWorkArtifact(state.value, state);
  for (const role of boundedWorkRoles.slice(1)) {
    const property = role.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    exactBoundedRef("Current state " + role, state.value[property], boundedLoaded(inputs, role).ref);
  }
  const prior = boundedLoaded(inputs, "current-work-breakdown-baseline");
  validateBoundedPriorBaseline(prior);
  const architecture = boundedLoaded(inputs, "architecture-baseline");
  const assessment = boundedLoaded(inputs, "design-reuse-assessment");
  validateBoundedWorkArtifact(assessment.value, assessment);
  for (const [property, role] of [["requirementsBaseline","requirements-baseline"],["projectOverviewBaseline","project-overview-baseline"],["architectureBaseline","architecture-baseline"],["contractDisposition","contract-disposition"]]) {
    const expected = boundedLoaded(inputs, role).ref;
    exactBoundedRef("Prior baseline " + role, prior.value.inputBindings.find(b => b.role === role)?.artifact, expected);
    exactBoundedRef("Reuse assessment " + role, assessment.value[property], expected);
  }
  for (const [property, role] of [["requirementsBaseline","requirements-baseline"],["projectOverviewBaseline","project-overview-baseline"]]) exactBoundedRef("Architecture " + property, architecture.value[property], boundedLoaded(inputs, role).ref);
  const repository = boundedLoaded(inputs, "current-repository-snapshot");
  if (repository.value.kind !== "RepositorySnapshot" || !architecture.value.repositorySnapshot) fail("An existing approved Git repository is required; onboarding/greenfield is outside this lane", "UNSUPPORTED_REPOSITORY_CONTEXT");
  exactBoundedRef("Reviewed historical design snapshot", assessment.value.historicalRepositorySnapshot, architecture.value.repositorySnapshot);
  exactBoundedRef("Reviewed current repository snapshot", assessment.value.currentRepositorySnapshot, repository.ref);
  const changes = Object.entries(assessment.value.changes);
  if (changes.some(([,value]) => value === "changed") || assessment.value.review.conclusion === "full-change-required") fail("Material scope/design changes require the full change path: " + changes.filter(([,v])=>v === "changed").map(([k])=>k).join(", "), "FULL_CHANGE_REQUIRED");
  if (changes.some(([,value]) => value === "unknown") || assessment.value.review.conclusion !== "reuse-approved-design") fail("Semantic scope and design reuse review is incomplete", "NEEDS_CLARIFICATION");
  // Any repository-sensitive satisfaction proof must be explicitly revalidated
  // by the semantic reviewer at this exact current snapshot, never inferred from paths.
  const priorRepository = prior.value.inputBindings.find(b => ["repository-context","current-repository-snapshot"].includes(b.role))?.artifact;
  if (!sameBoundedRef(repository.ref, priorRepository)) for (const disposition of prior.value.coverageDispositions) {
    if (disposition.disposition === "already-satisfied") for (const evidence of disposition.currentEvidence) {
      if (!assessment.value.revalidatedEvidence.some(ref => sameBoundedRef(ref, evidence))) fail("Prior satisfied evidence needs current-snapshot review: " + evidence.artifactId, "NEEDS_CLARIFICATION");
    }
  }
  return { prior, architecture, assessment, repository };
}
export function applyBoundedWork({ baseline, workItem }) {
  if (baseline.workItems.some(item => item.id === workItem.id)) fail("Bounded work must add one new item, not replace an existing item", "FULL_CHANGE_REQUIRED");
  const workItems = [...structuredClone(baseline.workItems), structuredClone(workItem)].sort((a,b)=>a.id < b.id ? -1 : 1);
  const coverage = new Map(baseline.coverageDispositions.map(entry=>[key(entry),structuredClone(entry)]));
  if (coverage.size !== baseline.coverageDispositions.length) fail("Prior coverage contains duplicate scope");
  for (const [scopeKind, scopeRef] of refs(workItem)) {
    const existing = coverage.get(`${scopeKind}\0${scopeRef}`);
    if (!existing) fail("New criterion/design/contract scope requires the full change path", "FULL_CHANGE_REQUIRED");
    if (existing.disposition === "no-work-required") fail("Changing approved no-work scope requires the full change path", "FULL_CHANGE_REQUIRED");
    if (existing.disposition === "already-satisfied") {
      // Its original evidence remains in previousBaseline history. A new item
      // needs planned coverage; it must not be represented as already verified.
      coverage.set(`${scopeKind}\0${scopeRef}`, {scopeKind,scopeRef,disposition:"planned",workItemRefs:[workItem.id]});
    } else existing.workItemRefs = sort([...new Set([...existing.workItemRefs,workItem.id])]);
  }
  const coverageDispositions = [...coverage.values()].sort((a,b)=>key(a)<key(b)?-1:1);
  return { workItems, coverageDispositions, workItemsDigest: canonicalJsonDigest(workItems) };
}
export function validateBoundedWorkCandidate({ candidate, loadedInputs, architectureModelAttachment }) {
  validateBoundedWorkArtifact(candidate);
  const { prior, architecture, assessment } = validateBoundedWorkInputs(loadedInputs);
  exactBoundedRef("Candidate prior baseline",candidate.currentBaseline,prior.ref);
  if (candidate.inputBindings.length !== boundedWorkRoles.length || new Set(candidate.inputBindings.map(b=>b.role)).size !== boundedWorkRoles.length) fail("Candidate must close over exact bounded inputs");
  for (const role of boundedWorkRoles) exactBoundedRef("Candidate input " + role,candidate.inputBindings.find(b=>b.role===role)?.artifact,boundedLoaded(loadedInputs,role).ref);
  const item = candidate.workItem;
  if (!["code-change","test-change"].includes(item["work-type"])) fail("Only one ordinary code/test item belongs in the bounded lane", "FULL_CHANGE_REQUIRED");
  if (!item["acceptance-criterion-refs"].length || !item["architecture-refs"].length) fail("Existing criterion and approved design mapping are required");
  const model = resolveVerifiedArchitectureModelContent(architecture.value, { resolveAttached: () => architectureModelAttachment });
  const contract = boundedLoaded(loadedInputs,"contract-disposition").value;
  const universe = { "acceptance-criterion": boundedLoaded(loadedInputs,"requirements-baseline").value.requirements.acceptanceCriteria.map(c=>c.id), architecture:model.elements.map(e=>e.id), contract:contract.mode === "baseline" ? contract.contractTargets.map(c=>c.id) : [] };
  for (const [field, property, kind] of [["acceptance-criterion-refs","criterionIds","acceptance-criterion"],["architecture-refs","architectureIds","architecture"],["contract-refs","contractIds","contract"]]) {
    if (!equal(sort(item[field]),sort(assessment.value[property]))) fail("Work item differs from the exact reviewed scope", "FULL_CHANGE_REQUIRED");
    for (const id of item[field]) if (!universe[kind].includes(id)) fail("Unknown approved " + kind + ": " + id,"FULL_CHANGE_REQUIRED");
  }
  const capabilities = boundedLoaded(loadedInputs,"capability-catalog").value.capabilities.map(c=>c.id);
  if (item["required-capabilities"].some(id=>!capabilities.includes(id))) fail("Unknown work capability");
  sources(item["source-refs"],loadedInputs); sources(candidate.sourceRefs,loadedInputs);
  const applied = applyBoundedWork({baseline:prior.value,workItem:item});
  if (candidate.resultingWorkItemsDigest !== applied.workItemsDigest || !equal(candidate.coverageDispositions,applied.coverageDispositions)) fail("Candidate does not preserve complete prior work and coverage");
  const allScope = Object.entries(universe).flatMap(([kind,ids])=>ids.map(id=>`${kind}\0${id}`));
  if (!equal(sort(allScope),sort(applied.coverageDispositions.map(key)))) fail("Prior baseline does not account for complete approved scope", "BASELINE_ALIGNMENT_REQUIRED");
  for (const priorItem of applied.workItems) for (const [kind,id] of refs(priorItem)) {
    const coverage=applied.coverageDispositions.find(c=>c.scopeKind===kind && c.scopeRef===id);
    if (coverage?.disposition !== "planned" || !coverage.workItemRefs.includes(priorItem.id)) fail("Complete resulting coverage omits prior work");
  }
  for (const coverage of applied.coverageDispositions) if (coverage.disposition === "planned") for (const id of coverage.workItemRefs) {
    const mapped=applied.workItems.find(item=>item.id===id);
    if (!mapped || !refs(mapped).some(([kind,scope])=>kind===coverage.scopeKind && scope===coverage.scopeRef)) fail("Resulting coverage contains a dangling or unreciprocated item");
  }
  return applied;
}
async function loadExact(context, ref) {
  if (typeof context.loadArtifact !== "function") fail("Exact artifact loading is required");
  const loaded = await context.loadArtifact(ref); exactBoundedRef("Artifact closure",loaded?.ref,ref); return loaded;
}
export function boundedWorkRuntimeArtifactContracts() {
  const extra = Object.entries(boundedWorkContracts).map(([kind, contract]) => ({ schema:contract.schema, async validate(value, context) {
    validateBoundedWorkArtifact(value, context);
    if (kind === "assessment" && context.phase === "input") for (const ref of [...value.inspectionEvidence,value.review.evidence,...value.revalidatedEvidence]) await loadExact(context,ref);
    if (kind === "candidate" && context.phase === "output") {
      const architecture=boundedLoaded(context.loadedInputs,"architecture-baseline").value;
      const section=architecture.sections.architectureModel;
      const architectureModelAttachment=section.mode === "attached" ? await loadExact(context,section.artifact) : undefined;
      validateBoundedWorkCandidate({candidate:value,loadedInputs:context.loadedInputs,architectureModelAttachment});
      for (const ref of value.nativeArtifacts) await loadExact(context,ref);
    }
    return value;
  }, ...(kind === "state" ? { inputGuard: {id:"bounded-work-input-lineage",version:"0.1.0",outcomes:["baseline_drift"],evaluate(context) {
    try { validateBoundedWorkInputs(context.loadedInputs); } catch(error) { return {apiVersion:"devrelay.dev/v1alpha1",kind:"ModuleResult",invocationId:context.invocation.invocationId,status:"completed",outcome:"baseline_drift",outputs:{},evidence:[],diagnostics:[{severity:"error",code:error.code??"BOUNDED_WORK_INVALID",message:error.message}]}; }
  } } } : {}) }));
  return [...workBreakdownRuntimeArtifactContracts(),...extra];
}

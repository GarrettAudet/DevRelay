import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const artifactValidator = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/specialist-assignment-artifacts.schema.json", import.meta.url), "utf8")));

export const SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS = Object.freeze({
  EligibilityEvaluationSet: Object.freeze({ schema: "https://devrelay.dev/artifacts/eligibility-evaluation-set/v1", mediaType: "application/vnd.devrelay.eligibility-evaluation-set+json" }),
  RankerSelectionSet: Object.freeze({ schema: "https://devrelay.dev/artifacts/ranker-selection-set/v1", mediaType: "application/vnd.devrelay.ranker-selection-set+json" }),
  SpecialistAssignmentDraft: Object.freeze({ schema: "https://devrelay.dev/artifacts/specialist-assignment-draft/v1", mediaType: "application/vnd.devrelay.specialist-assignment-draft+json" }),
  SpecialistAssignmentBaseline: Object.freeze({ schema: "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1", mediaType: "application/vnd.devrelay.specialist-assignment-baseline+json" }),
});
export class SpecialistAssignmentArtifactValidationError extends Error {
  constructor(message) { super(`specialist assignment artifact is invalid: ${message}`); this.name = "SpecialistAssignmentArtifactValidationError"; this.code = "DR4050"; }
}
const fail = (message) => { throw new SpecialistAssignmentArtifactValidationError(message); };
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function exactKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !(key in value));
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length || extra.length) fail(`${value.kind ?? "artifact"} has invalid fields; missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
}
function unique(values, label) { if (new Set(values).size !== values.length) fail(`${label} must be unique`); }
function sorted(values, label) { if (JSON.stringify(values) !== JSON.stringify([...values].sort(compare))) fail(`${label} must use lexical order`); }
function validateEvaluation(value) {
  exactKeys(value, ["workItemId", "requiredCapabilityIds", "requiredToolIds", "requiredGrantIds", "eligibleProfileIds", "profileEvaluations"]);
  for (const key of ["requiredCapabilityIds", "requiredToolIds", "requiredGrantIds", "eligibleProfileIds"]) { unique(value[key], `${value.workItemId} ${key}`); sorted(value[key], `${value.workItemId} ${key}`); }
  unique(value.profileEvaluations.map(({ profileId }) => profileId), `${value.workItemId} profile evaluations`);
  for (const profile of value.profileEvaluations) {
    exactKeys(profile, ["profileId", "eligible", "exclusionReasons"]);
    if (profile.eligible !== (profile.exclusionReasons.length === 0)) fail(`${value.workItemId}/${profile.profileId} eligibility contradicts exclusion reasons`);
  }
  const derived = value.profileEvaluations.filter(({ eligible }) => eligible).map(({ profileId }) => profileId);
  if (canonicalJsonDigest(derived) !== canonicalJsonDigest(value.eligibleProfileIds)) fail(`${value.workItemId} eligible profile projection is invalid`);
}
export function validateSpecialistAssignmentArtifact(value) {
  if (!artifactValidator(value)) fail(validationDetail(artifactValidator));
  if (value?.apiVersion !== "devrelay.dev/v1alpha1") fail("apiVersion must be devrelay.dev/v1alpha1");
  if (!SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS[value.kind]) fail(`unsupported kind ${value?.kind}`);
  if (value.kind === "EligibilityEvaluationSet") {
    exactKeys(value, ["apiVersion", "kind", "workItemsDigest", "capabilityCatalogDigest", "specialistCatalogDigest", "assignmentPolicyDigest", "evaluations", "evaluationDigest"]);
    unique(value.evaluations.map(({ workItemId }) => workItemId), "eligibility work items");
    sorted(value.evaluations.map(({ workItemId }) => workItemId), "eligibility work items");
    value.evaluations.forEach(validateEvaluation);
    const { evaluationDigest, apiVersion, kind, ...material } = value;
    if (evaluationDigest !== canonicalJsonDigest(material)) fail("evaluationDigest does not bind evaluation material");
  } else if (value.kind === "RankerSelectionSet") {
    exactKeys(value, ["apiVersion", "kind", "ranker", "eligibilityDigest", "selections"]);
    unique(value.selections.map(({ workItemId }) => workItemId), "ranker selections");
    for (const selection of value.selections) exactKeys(selection, ["workItemId", "profileId", "rationale"]);
  } else if (value.kind === "SpecialistAssignmentDraft") {
    exactKeys(value, ["apiVersion", "kind", "draftId", "inputBindings", "eligibilityDigest", "assignments", "assignmentDigest"]);
    unique(value.assignments.map(({ workItemRef }) => workItemRef), "draft assignments");
    if (value.assignmentDigest !== canonicalJsonDigest(value.assignments)) fail("assignmentDigest does not bind assignments");
    for (const assignment of value.assignments) exactKeys(assignment, ["workItemRef", "specialistProfileRef", "capabilityCoverage", "requiredTools", "requiredGrants", "assignmentRationale"]);
  } else {
    exactKeys(value, ["apiVersion", "kind", "baselineId", "version", "approvedDraft", "assignments", "assignmentDigest", "approvalEvidence"]);
    unique(value.assignments.map(({ workItemRef }) => workItemRef), "baseline assignments");
    if (value.assignmentDigest !== canonicalJsonDigest(value.assignments)) fail("baseline assignmentDigest does not bind assignments");
  }
  return value;
}
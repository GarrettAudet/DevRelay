import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";

export class SpecialistAssignmentError extends Error {
  constructor(message, code = "DR4000") { super(`specialist assignment failed: ${message}`); this.name = "SpecialistAssignmentError"; this.code = code; }
}
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values = []) => [...new Set(values)].sort(compare);
const fail = (message, code) => { throw new SpecialistAssignmentError(message, code); };
function unique(items, key, label) {
  const seen = new Set();
  for (const item of items) { const value = key(item); if (seen.has(value)) fail(`${label} repeats ${value}`); seen.add(value); }
}
export function normalizeA2AAgentCard({ snapshot, mappings }) {
  if (!snapshot?.agentCard || !snapshot?.source?.digest || !snapshot?.source?.version) fail("A2A input requires an exact Agent Card plus source version and digest", "DR4010");
  const card = snapshot.agentCard;
  if (!card.name || !Array.isArray(card.skills)) fail("A2A Agent Card requires name and skills", "DR4010");
  unique(card.skills, ({ id }) => id, "A2A skill IDs");
  unique(mappings, ({ skillId }) => skillId, "A2A skill mappings");
  const mappingBySkill = new Map(mappings.map((entry) => [entry.skillId, entry]));
  const unmapped = card.skills.map(({ id }) => id).filter((id) => !mappingBySkill.has(id));
  if (unmapped.length) fail(`A2A skills lack explicit capability mappings: ${unmapped.join(", ")}`, "DR4011");
  const capabilities = sortedUnique(card.skills.flatMap(({ id }) => mappingBySkill.get(id).capabilityIds));
  const profileMaterial = { sourceDigest: snapshot.source.digest, agentName: card.name, capabilities };
  return Object.freeze({
    id: `A2A-${canonicalJsonDigest(profileMaterial).slice(7, 23).toUpperCase()}`,
    name: card.name,
    source: { type: "a2a-agent-card", version: snapshot.source.version, digest: snapshot.source.digest, ...(snapshot.source.uri ? { uri: snapshot.source.uri } : {}) },
    capabilityIds: capabilities,
    toolIds: sortedUnique(snapshot.toolIds),
    grantIds: sortedUnique(snapshot.grantIds),
    evidence: card.skills.map(({ id }) => ({ kind: "a2a-skill-declaration", externalId: id, capabilityIds: sortedUnique(mappingBySkill.get(id).capabilityIds), sourceDigest: snapshot.source.digest })).sort((a, b) => compare(a.externalId, b.externalId)),
  });
}
export function evaluateSpecialistEligibility({ workItems, capabilityCatalog, specialistCatalog, assignmentPolicy }) {
  unique(workItems, ({ id }) => id, "work items");
  unique(capabilityCatalog.capabilities, ({ id }) => id, "capabilities");
  unique(specialistCatalog.profiles, ({ id }) => id, "specialist profiles");
  const capabilities = new Map(capabilityCatalog.capabilities.map((entry) => [entry.id, entry]));
  const policies = new Map((assignmentPolicy.workItemRules ?? []).map((entry) => [entry.workItemId, entry]));
  const evaluations = [...workItems].sort((a, b) => compare(a.id, b.id)).map((workItem) => {
    const rule = policies.get(workItem.id) ?? {};
    const requiredCapabilityIds = sortedUnique([...(workItem["required-capabilities"] ?? []), ...(rule.requiredCapabilityIds ?? [])]);
    const unknown = requiredCapabilityIds.filter((id) => !capabilities.has(id));
    if (unknown.length) fail(`work item ${workItem.id} references unknown capabilities: ${unknown.join(", ")}`, "DR4020");
    const requiredToolIds = sortedUnique([...requiredCapabilityIds.flatMap((id) => capabilities.get(id).requiredToolIds ?? []), ...(rule.requiredToolIds ?? [])]);
    const requiredGrantIds = sortedUnique([...requiredCapabilityIds.flatMap((id) => capabilities.get(id).requiredGrantIds ?? []), ...(rule.requiredGrantIds ?? [])]);
    const denied = new Set(rule.deniedProfileIds ?? []);
    const profileEvaluations = [...specialistCatalog.profiles].sort((a, b) => compare(a.id, b.id)).map((profile) => {
      const reasons = [];
      const possessedCapabilities = new Set(profile.capabilityIds ?? []);
      const possessedTools = new Set(profile.toolIds ?? []);
      const possessedGrants = new Set(profile.grantIds ?? []);
      for (const id of requiredCapabilityIds) if (!possessedCapabilities.has(id)) reasons.push(`missing-capability:${id}`);
      for (const id of requiredToolIds) if (!possessedTools.has(id)) reasons.push(`missing-tool:${id}`);
      for (const id of requiredGrantIds) if (!possessedGrants.has(id)) reasons.push(`missing-grant:${id}`);
      if (denied.has(profile.id)) reasons.push("denied-by-policy");
      return { profileId: profile.id, eligible: reasons.length === 0, exclusionReasons: reasons };
    });
    return { workItemId: workItem.id, requiredCapabilityIds, requiredToolIds, requiredGrantIds, eligibleProfileIds: profileEvaluations.filter(({ eligible }) => eligible).map(({ profileId }) => profileId), profileEvaluations };
  });
  const material = { workItemsDigest: canonicalJsonDigest(workItems), capabilityCatalogDigest: canonicalJsonDigest(capabilityCatalog), specialistCatalogDigest: canonicalJsonDigest(specialistCatalog), assignmentPolicyDigest: canonicalJsonDigest(assignmentPolicy), evaluations };
  return validateSpecialistAssignmentArtifact({ apiVersion: "devrelay.dev/v1alpha1", kind: "EligibilityEvaluationSet", ...material, evaluationDigest: canonicalJsonDigest(material) });
}
export function rankSpecialistsDeterministically(eligibility, assignmentPolicy = {}) {
  const priorities = new Map((assignmentPolicy.profilePriorities ?? []).map(({ profileId, priority }) => [profileId, priority]));
  const selections = eligibility.evaluations.map(({ workItemId, eligibleProfileIds }) => {
    if (eligibleProfileIds.length === 0) fail(`work item ${workItemId} has no eligible specialist profile`, "DR4030");
    const ranked = [...eligibleProfileIds].sort((a, b) => (priorities.get(b) ?? 0) - (priorities.get(a) ?? 0) || compare(a, b));
    return { workItemId, profileId: ranked[0], rationale: "Highest explicit policy priority, then lexical profile ID." };
  });
  return validateSpecialistAssignmentArtifact({ apiVersion: "devrelay.dev/v1alpha1", kind: "RankerSelectionSet", ranker: { id: "devrelay.native-specialist-ranker", version: "1.0.0" }, eligibilityDigest: eligibility.evaluationDigest, selections });
}
export function assembleSpecialistAssignmentDraft({ eligibility, rankerSelections, inputBindings = [] }) {
  if (rankerSelections.eligibilityDigest !== eligibility.evaluationDigest) fail("ranker output is not bound to the exact eligibility evaluation", "DR4040");
  unique(rankerSelections.selections, ({ workItemId }) => workItemId, "ranker work-item selections");
  const byWorkItem = new Map(rankerSelections.selections.map((entry) => [entry.workItemId, entry]));
  const assignments = eligibility.evaluations.map((evaluation) => {
    const selection = byWorkItem.get(evaluation.workItemId);
    if (!selection) fail(`ranker omitted work item ${evaluation.workItemId}`, "DR4041");
    if (!evaluation.eligibleProfileIds.includes(selection.profileId)) fail(`ranker selected ineligible profile ${selection.profileId} for ${evaluation.workItemId}`, "DR4042");
    return { workItemRef: evaluation.workItemId, specialistProfileRef: selection.profileId, capabilityCoverage: evaluation.requiredCapabilityIds, requiredTools: evaluation.requiredToolIds, requiredGrants: evaluation.requiredGrantIds, assignmentRationale: selection.rationale };
  });
  if (byWorkItem.size !== assignments.length) fail("ranker returned an unscoped work-item selection", "DR4043");
  const material = { inputBindings: [...inputBindings].sort((a, b) => compare(a.role, b.role)), eligibilityDigest: eligibility.evaluationDigest, assignments };
  return validateSpecialistAssignmentArtifact({ apiVersion: "devrelay.dev/v1alpha1", kind: "SpecialistAssignmentDraft", draftId: `SAD-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`, ...material, assignmentDigest: canonicalJsonDigest(assignments) });
}
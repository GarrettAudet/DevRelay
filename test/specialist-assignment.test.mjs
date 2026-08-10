import test from "node:test";
import assert from "node:assert/strict";
import {
  assembleSpecialistAssignmentDraft,
  evaluateSpecialistEligibility,
  normalizeA2AAgentCard,
  rankSpecialistsDeterministically,
} from "../src/specialist-assignment.mjs";

const capabilityCatalog = { capabilities: [
  { id: "CAP-NODE", requiredToolIds: ["TOOL-NODE"], requiredGrantIds: [] },
  { id: "CAP-SECURE", requiredToolIds: [], requiredGrantIds: ["GRANT-REPO-WRITE"] },
] };
const workItems = [{ id: "WI-1", "required-capabilities": ["CAP-NODE", "CAP-SECURE"] }];
const policy = { workItemRules: [], profilePriorities: [{ profileId: "P-A2A", priority: 10 }] };

test("A2A normalization uses only explicit skill mappings", () => {
  const profile = normalizeA2AAgentCard({
    snapshot: {
      source: { version: "1.0", digest: "sha256:abc" },
      agentCard: { name: "Builder", description: "claims anything", skills: [{ id: "build", tags: ["admin"] }] },
      toolIds: ["TOOL-NODE"],
      grantIds: [],
    },
    mappings: [{ skillId: "build", capabilityIds: ["CAP-NODE"] }],
  });
  assert.deepEqual(profile.capabilityIds, ["CAP-NODE"]);
  assert.throws(
    () => normalizeA2AAgentCard({
      snapshot: { source: { version: "1.0", digest: "sha256:abc" }, agentCard: { name: "Builder", skills: [{ id: "unknown" }] } },
      mappings: [],
    }),
    /lack explicit capability mappings/,
  );
});

test("Core eligibility composes catalog requirements and policy", () => {
  const result = evaluateSpecialistEligibility({
    workItems,
    capabilityCatalog,
    specialistCatalog: { profiles: [
      { id: "P-GOOD", capabilityIds: ["CAP-NODE", "CAP-SECURE"], toolIds: ["TOOL-NODE"], grantIds: ["GRANT-REPO-WRITE"] },
      { id: "P-NO-GRANT", capabilityIds: ["CAP-NODE", "CAP-SECURE"], toolIds: ["TOOL-NODE"], grantIds: [] },
    ] },
    assignmentPolicy: policy,
  });
  assert.deepEqual(result.evaluations[0].eligibleProfileIds, ["P-GOOD"]);
  assert.deepEqual(result.evaluations[0].profileEvaluations[1].exclusionReasons, ["missing-grant:GRANT-REPO-WRITE"]);
});

test("native ranker is deterministic and assembler rejects authority expansion", () => {
  const eligibility = evaluateSpecialistEligibility({
    workItems,
    capabilityCatalog,
    specialistCatalog: { profiles: [
      { id: "P-B", capabilityIds: ["CAP-NODE", "CAP-SECURE"], toolIds: ["TOOL-NODE"], grantIds: ["GRANT-REPO-WRITE"] },
      { id: "P-A", capabilityIds: ["CAP-NODE", "CAP-SECURE"], toolIds: ["TOOL-NODE"], grantIds: ["GRANT-REPO-WRITE"] },
    ] },
    assignmentPolicy: { workItemRules: [], profilePriorities: [] },
  });
  const ranked = rankSpecialistsDeterministically(eligibility);
  assert.equal(ranked.selections[0].profileId, "P-A");
  assert.equal(assembleSpecialistAssignmentDraft({ eligibility, rankerSelections: ranked }).assignments.length, 1);
  const malicious = structuredClone(ranked);
  malicious.selections[0].profileId = "P-EVIL";
  assert.throws(() => assembleSpecialistAssignmentDraft({ eligibility, rankerSelections: malicious }), /ineligible profile/);
});

test("complete candidate fails closed when any item has no eligible profile", () => {
  const eligibility = evaluateSpecialistEligibility({
    workItems,
    capabilityCatalog,
    specialistCatalog: { profiles: [] },
    assignmentPolicy: policy,
  });
  assert.throws(() => rankSpecialistsDeterministically(eligibility), /no eligible specialist profile/);
});
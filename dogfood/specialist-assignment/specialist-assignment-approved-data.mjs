const collectionKeys = new Set([
  "acceptanceCriteria",
  "assumptions",
  "businessObjectives",
  "capabilities",
  "constraints",
  "nonFunctionalRequirements",
  "nonGoals",
  "scope",
  "stakeholders",
  "successMetrics",
  "terminology",
  "userJourneys",
  "userStories",
  "users",
]);

const stringArrayKeys = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "deliverables",
  "dependencies",
  "interests",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

const compare = (left, right) =>
  left.localeCompare(right, "en", { sensitivity: "variant" });

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compare(
          [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
          [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
        ),
      );
    }
    if (collectionKeys.has(key)) return entries.sort((left, right) => compare(left.id, right.id));
    if (stringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) {
      return [...new Set(entries)].sort(compare);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]),
  );
}

export const ownerDecisions = Object.freeze([
  Object.freeze({
    questionId: "Q-SA-ASSIGNMENT-SCOPE-001",
    answer: "Assign every approved work item, not only the current ready frontier (recommended)",
  }),
  Object.freeze({
    questionId: "Q-SA-CARDINALITY-001",
    answer: "Exactly one provider-neutral specialist profile per work item (recommended)",
  }),
  Object.freeze({
    questionId: "Q-SA-SELECTION-AUTHORITY-001",
    answer: "Core enforces hard capability, tool, grant, and policy constraints; a replaceable ranker chooses only among eligible profiles (recommended)",
  }),
  Object.freeze({
    questionId: "Q-SA-FAILURE-POLICY-001",
    answer: "Any unassignable work item blocks the complete candidate with needs-clarification; no partial baseline in V1 (recommended)",
  }),
  Object.freeze({
    questionId: "Q-SA-BOUNDARY-001",
    answer: "Scheduling, availability, concrete runtime or model binding, execution, and DAG modification remain downstream (recommended)",
  }),
]);

export function buildSpecialistAssignmentRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => {
    requirements[key] = [...requirements[key], ...values];
  };

  append("capabilities", [{
    id: "CAP-DEV-SPECIALIST-ASSIGNMENT-001",
    name: "Deterministic specialist assignment",
    description: "Match every approved work item to one provider-neutral specialist profile through trusted eligibility rules and replaceable ranking.",
    businessObjectiveIds: ["BO-DEV-DETERMINISM-001", "BO-DEV-MODULARITY-001", "BO-DEV-TRACEABILITY-001"],
    userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
    audience: "user-facing",
    key: true,
    priority: "must",
    sourceRefs: refs(),
  }]);

  append("userJourneys", [{
    id: "UJ-DEV-SPECIALIST-ASSIGNMENT-001",
    name: "Assign approved work to eligible specialist profiles",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityIds: ["CAP-DEV-SPECIALIST-ASSIGNMENT-001"],
    trigger: "Approved WorkBreakdown and WorkDependency baselines are ready for assignment.",
    outcome: "Every work item has exactly one approved provider-neutral specialist profile, or progression stops for clarification.",
    steps: [
      { sequence: 1, action: "Core resolves exact work, dependency, catalog, policy, and project inputs.", expectedOutcome: "Assignment is evaluated against immutable approved context." },
      { sequence: 2, action: "Core filters profiles using hard capability, tool, grant, and policy constraints.", expectedOutcome: "Only eligible profiles can enter ranking." },
      { sequence: 3, action: "The configured ranker deterministically selects one profile for each work item.", expectedOutcome: "A complete assignment candidate or exact clarification diagnostics are produced." },
    ],
    sourceRefs: refs(),
  }]);

  append("userStories", [{
    id: "US-DEV-SPECIALIST-ASSIGNMENT-001",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityId: "CAP-DEV-SPECIALIST-ASSIGNMENT-001",
    userJourneyIds: ["UJ-DEV-SPECIALIST-ASSIGNMENT-001"],
    need: "Assign every approved work item to exactly one eligible provider-neutral specialist profile before execution begins.",
    benefit: "Execution can bind interchangeable humans or AI runtimes without allowing providers to control engineering authority.",
    priority: "must",
    acceptanceCriterionIds: [
      "AC-DEV-SA-BOUNDARY-001",
      "AC-DEV-SA-COMPLETE-001",
      "AC-DEV-SA-DETERMINISM-001",
      "AC-DEV-SA-ELIGIBILITY-001",
      "AC-DEV-SA-FAIL-CLOSED-001",
      "AC-DEV-SA-PLUGIN-001",
      "AC-DEV-SA-TRACEABILITY-001",
    ],
    sourceRefs: refs(),
  }]);

  append("acceptanceCriteria", [
    { id: "AC-DEV-SA-BOUNDARY-001", statement: "SpecialistAssignment assigns profiles only and cannot schedule work, bind a concrete runtime or model, execute work, or modify the dependency DAG.", verification: "Attempt every forbidden downstream effect through module inputs, ranker output, and adapter output and require rejection.", sourceRefs: refs() },
    { id: "AC-DEV-SA-COMPLETE-001", statement: "A successful SpecialistAssignmentDraft contains exactly one assignment for every work item in the approved WorkBreakdownBaseline, including items outside the current ready frontier.", verification: "Run complete, missing-item, duplicate-item, and ready-frontier-only fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-SA-DETERMINISM-001", statement: "Exact baselines, catalogs, policy, ranker binding, and configuration produce byte-identical eligibility evidence, selections, diagnostics, and Gate inputs.", verification: "Repeat across insertion order, checkpoint replay, and process restart and compare exact digests.", sourceRefs: refs() },
    { id: "AC-DEV-SA-ELIGIBILITY-001", statement: "Core excludes every profile that fails a required capability, tool, grant, or assignment-policy constraint before any replaceable ranker is invoked.", verification: "Run fixtures for each hard constraint and a malicious ranker that proposes an ineligible profile.", sourceRefs: refs() },
    { id: "AC-DEV-SA-FAIL-CLOSED-001", statement: "If any approved work item has no eligible profile, the module returns needs-clarification for the complete candidate and cannot emit or promote a partial assignment baseline.", verification: "Make one item unassignable in a multi-item plan and reject partial output and Gate promotion.", sourceRefs: refs() },
    { id: "AC-DEV-SA-PLUGIN-001", statement: "The configured ranker selects only among Core-provided eligible profiles through a provider-neutral contract with no work-item, provider, or product branches in generic Core.", verification: "Swap conformant rankers and scan generic Core for ranker, provider, and work-item special cases.", sourceRefs: refs() },
    { id: "AC-DEV-SA-TRACEABILITY-001", statement: "A trusted contributor projects forward WorkItem-to-SpecialistProfile assignment relationships from a validated candidate; rankers and adapters cannot author graph operations or approved facts.", verification: "Validate candidate and approved graph scopes, edge vocabulary, provenance, atomic merge receipt, and forbidden graph access.", sourceRefs: refs() },
  ]);

  append("scope", [{
    id: "SCOPE-DEV-SPECIALIST-ASSIGNMENT-DETAIL-001",
    statement: "One SpecialistAssignment module and Gate covering full-plan profile assignment, Core-owned eligibility, replaceable deterministic ranking, typed clarification, candidate traceability, and exact baseline promotion.",
    sourceRefs: refs(),
  }]);

  append("constraints", [
    { id: "CON-DEV-SA-AUTHORITY-001", category: "business", statement: "Core owns hard eligibility and Gate authority; rankers may choose only among the exact eligible profiles supplied by Core.", rationale: "An extension cannot safely certify its own authority or eligibility.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-SA-ELIGIBILITY-001", "AC-DEV-SA-PLUGIN-001"], sourceRefs: refs() },
    { id: "CON-DEV-SA-ONE-PROFILE-001", category: "business", statement: "V1 assigns exactly one provider-neutral specialist profile to each approved work item and rejects partial assignment candidates.", rationale: "This keeps the handoff deterministic while leaving multi-party execution and collaboration for a later extension.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-SA-COMPLETE-001", "AC-DEV-SA-FAIL-CLOSED-001"], sourceRefs: refs() },
    { id: "CON-DEV-SA-EXECUTION-BARRIER-001", category: "business", statement: "WorkExecution cannot progress without an exact approved SpecialistAssignmentBaseline covering the selected work item.", rationale: "Concrete executors must be bound against approved profile intent rather than improvised assignment.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-SA-BOUNDARY-001"], sourceRefs: refs() },
  ]);

  append("nonFunctionalRequirements", [{
    id: "NFR-DEV-SA-DETERMINISM-001",
    category: "reliability",
    statement: "Eligibility filtering, ranker input ordering, tie handling, candidate construction, diagnostics, and Gate inputs must be deterministic for exact version-pinned inputs.",
    applicability: { level: "project" },
    measure: "Canonical digest equality across equivalent executions and zero-call checkpoint replay.",
    target: "100 percent equality for Core-owned outputs.",
    priority: "must",
    acceptanceCriterionIds: ["AC-DEV-SA-DETERMINISM-001", "AC-DEV-SA-ELIGIBILITY-001"],
    sourceRefs: refs(),
  }]);

  append("assumptions", [{
    id: "ASM-DEV-SA-V1-001",
    statement: "V1 assigns provider-neutral profiles across the complete approved work plan; WorkExecution later binds profiles to concrete AI, human, or automation runtimes and Core separately derives ready frontiers.",
    status: "confirmed",
    blocking: false,
    sourceRefs: refs(),
  }]);

  append("terminology", [{
    id: "TERM-DEV-SPECIALIST-PROFILE-001",
    term: "Specialist profile",
    definition: "A provider-neutral, versioned description of capabilities, tools, grants, and execution-policy compatibility required to perform a class of work; it is not a concrete executor or runtime binding.",
    aliases: ["SpecialistProfile"],
    sourceRefs: refs(),
  }]);

  requirements.currentStatus = {
    lifecycle: "existing",
    phase: "planning",
    summary: "SpecialistAssignment requirements are clarified: full-plan one-profile assignment, Core-owned hard eligibility, replaceable ranking among eligible profiles, fail-closed all-or-nothing output, and no scheduling, runtime binding, execution, or DAG mutation.",
    sourceRefs: refs(),
  };
  requirements.deliverables = [...requirements.deliverables, "Provider-neutral SpecialistAssignment module and Gate contracts", "SpecialistCatalog, CapabilityCatalog, AssignmentPolicy, and ranker port contracts", "Trusted candidate and approved assignment traceability contributors"];
  requirements.dependencies = [...requirements.dependencies, "Approved WorkBreakdownBaseline and WorkDependencyBaseline", "Version-pinned SpecialistCatalog, CapabilityCatalog, AssignmentPolicy, and configured ranker"];
  requirements.requiredEvidence = [...requirements.requiredEvidence, "assignment/coverage", "assignment/eligibility", "assignment/determinism", "assignment/checkpoint-replay", "assignment/gate-promotion", "assignment/traceability-merge"];
  requirements.risks = [...requirements.risks, "A ranker could bypass eligibility unless Core constrains its exact candidate set.", "Partial assignment could allow unassignable work to propagate downstream.", "Provider-specific profiles could couple workflow semantics to the current execution engine.", "Assignment could accidentally expand into scheduling or execution authority."];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}

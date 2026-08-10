export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-specialist-assignment-module-v1",
  statement: "Define DevRelay's SpecialistAssignment module and Gate so every approved work item is matched to one eligible provider-neutral specialist profile before execution.",
  objectives: [
    "Assign the complete approved work plan rather than only the current ready frontier.",
    "Keep eligibility and approval authority in Core while allowing replaceable deterministic ranking.",
    "Keep profiles provider-neutral so WorkExecution can later bind a human, AI model, agent, or automation runtime.",
    "Fail closed when any work item is unassignable instead of promoting a partial baseline.",
    "Extend TraceabilityGraph through trusted contributors rather than ranker-authored graph operations.",
  ],
  constraints: [
    "The exact approved WorkBreakdownBaseline owns the work-item universe.",
    "The exact approved WorkDependencyBaseline is immutable assignment context and cannot be modified by this module.",
    "Core owns hard capability, tool, grant, and policy eligibility checks.",
    "Rankers can choose only among the exact eligible profiles supplied by Core.",
    "Scheduling, availability, concrete runtime binding, execution, and DAG mutation remain downstream.",
  ],
  acceptanceCriteria: [
    "Every approved work item receives exactly one eligible provider-neutral specialist profile or the complete candidate returns needs-clarification.",
    "Exact baselines, catalogs, policies, bindings, selections, and Gate approval are content-bound.",
    "Changing a conformant ranker requires no provider, product, or work-item branch in generic Core.",
    "A ranker cannot select a profile excluded by Core eligibility checks.",
    "Checkpoint replay never reinvokes an effectful ranker and input drift stops before extension entry.",
    "Trusted traceability projection links work items forward to assigned profiles without claiming execution or completion.",
  ],
  assumptions: [
    "Assignment scope, cardinality, authority, failure behavior, and downstream boundary require owner confirmation.",
    "The OpenSpec chat bridge records this clarification run but does not claim OpenSpec CLI execution.",
  ],
});
export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary: "DevRelay has approved requirements, architecture, contract, work-breakdown, and work-dependency baselines. Core has selected SpecialistAssignment as the next lifecycle module; WorkExecution remains blocked until its Gate promotes a complete assignment baseline.",
  stakeholders: [
    "DevRelay product owner",
    "Module, profile, and ranker authors",
    "Workflow and IDE hosts",
    "WorkExecution hosts and human executors",
    "Security and policy reviewers",
  ],
  domainConstraints: [
    "Generic Core owns exact loading, deterministic eligibility, routing, adapter resolution, checkpoints, traceability merge, and progression.",
    "WorkBreakdown defines required capabilities; SpecialistAssignment cannot change work scope.",
    "WorkDependencyAnalysis owns the static dependency DAG; SpecialistAssignment cannot change readiness or ordering.",
    "Candidate and approved assignment authority remain distinct and SpecialistAssignmentGate promotion is explicit.",
    "Extensions receive declared immutable inputs only and never receive TraceabilityGraph or approval authority.",
  ],
  conventions: [
    "Use SHA-256-bound artifacts and exact semantic versions at runtime boundaries.",
    "Use provider-neutral specialist profiles and lowercase kebab-case operations, ports, relationships, and outcomes.",
    "Store forward lifecycle relationships and derive inverse traversal at query time.",
    "Distinguish contract-defined, fixture-conformant, live-conformant, and release-ready bindings.",
    "Prove positive, negative, replay, drift, substitution, malicious-ranker, and Gate behavior.",
  ],
  sourceRefs: [],
});
export const questions = Object.freeze([
  Object.freeze({
    id: "Q-SA-ASSIGNMENT-SCOPE-001",
    prompt: "Should SpecialistAssignment assign every approved work item or only work in the current ready DAG frontier?",
    rationale: "Assignment intent is stable planning data, while readiness is dynamic runtime state derived by Core.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Assign every approved work item, not only the current ready frontier (recommended)",
      "Assign only the current ready frontier",
    ],
  }),
  Object.freeze({
    id: "Q-SA-CARDINALITY-001",
    prompt: "How many specialist profiles may be assigned to one work item in V1?",
    rationale: "A fixed cardinality keeps the handoff deterministic and avoids introducing collaboration orchestration into assignment.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Exactly one provider-neutral specialist profile per work item (recommended)",
      "One or more collaborating profiles per work item",
    ],
  }),
  Object.freeze({
    id: "Q-SA-SELECTION-AUTHORITY-001",
    prompt: "Which boundary owns profile eligibility and ranking?",
    rationale: "Replaceable ranking is useful, but an extension cannot bypass required capabilities, tools, grants, or policy.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Core enforces hard capability, tool, grant, and policy constraints; a replaceable ranker chooses only among eligible profiles (recommended)",
      "The configured ranker owns both eligibility and ranking",
    ],
  }),
  Object.freeze({
    id: "Q-SA-FAILURE-POLICY-001",
    prompt: "What happens when one approved work item has no eligible specialist profile?",
    rationale: "Partial promotion could let an incomplete work plan reach execution.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Any unassignable work item blocks the complete candidate with needs-clarification; no partial baseline in V1 (recommended)",
      "Promote assignments for eligible items and defer the rest",
    ],
  }),
  Object.freeze({
    id: "Q-SA-BOUNDARY-001",
    prompt: "Should SpecialistAssignment also schedule work, choose concrete AI models or humans, execute work, or modify the dependency DAG?",
    rationale: "Those effects belong to Core frontier control or WorkExecution rather than profile assignment.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Scheduling, availability, concrete runtime or model binding, execution, and DAG modification remain downstream (recommended)",
      "Include runtime binding and scheduling in SpecialistAssignment",
    ],
  }),
]);
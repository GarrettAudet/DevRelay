export const V1_LIFECYCLE = Object.freeze([
  Object.freeze({
    id: "SCOPE-DEV-V1-010-REQUIREMENTS-GATHERING",
    name: "RequirementsGathering",
    kind: "module",
    conditional: false,
    statement:
      "RequirementsGathering converts an explicit goal and project context into a canonical requirements candidate and deterministic ProjectOverview candidate.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-020-REQUIREMENTS-GATE",
    name: "RequirementsGate",
    kind: "gate",
    conditional: false,
    statement:
      "RequirementsGate validates and approves one exact RequirementsBaseline and ProjectOverviewBaseline pair before architecture progression.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-030-ARCHITECTURE-DISCOVERY",
    name: "ArchitectureDiscovery",
    kind: "module",
    conditional: true,
    statement:
      "ArchitectureDiscovery conditionally establishes a validated current-architecture snapshot for an existing repository that has no architecture baseline.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-040-ARCHITECTURE-DESIGN",
    name: "ArchitectureDesign",
    kind: "module",
    conditional: false,
    statement:
      "ArchitectureDesign converts approved requirements into a new architecture candidate or a proposed architecture change.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-050-ARCHITECTURE-GATE",
    name: "ArchitectureGate",
    kind: "gate",
    conditional: false,
    statement:
      "ArchitectureGate validates architectural fitness, evidence, and approval before establishing or updating the ArchitectureBaseline.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-060-CONTRACT-GENERATION",
    name: "ContractGeneration",
    kind: "module",
    conditional: true,
    statement:
      "ContractGeneration conditionally produces and validates API, schema, event, protocol, and other machine-readable interface contracts when the approved design requires them.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-065-CONTRACT-GATE",
    name: "ContractGate",
    kind: "gate",
    conditional: false,
    statement:
      "ContractGate validates exact generated contracts or authorizes an explicit ApprovedNotApplicable disposition before work planning.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-070-WORK-BREAKDOWN",
    name: "WorkBreakdown",
    kind: "module",
    conditional: false,
    statement:
      "WorkBreakdown converts approved scope into a complete set of bounded, traceable, independently executable and verifiable work items without executing them.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-075-WORK-BREAKDOWN-GATE",
    name: "WorkBreakdownGate",
    kind: "gate",
    conditional: false,
    statement:
      "WorkBreakdownGate validates complete approved-scope coverage and promotes the exact WorkBreakdownBaseline without deciding dependency order.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-080-WORK-DEPENDENCY-ANALYSIS",
    name: "WorkDependencyAnalysis",
    kind: "module",
    conditional: false,
    statement:
      "WorkDependencyAnalysis validates authoritative ordering and dependencies between approved work items before assignment or execution.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-085-WORK-DEPENDENCY-GATE",
    name: "WorkDependencyGate",
    kind: "gate",
    conditional: false,
    statement:
      "WorkDependencyGate validates graph mechanics, policy, consistency evidence, semantic completeness, and exact approval before promoting the static WorkDependencyBaseline.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-090-SPECIALIST-ASSIGNMENT",
    name: "SpecialistAssignment",
    kind: "module",
    conditional: false,
    statement:
      "SpecialistAssignment matches every approved work item to a provider-neutral specialist profile satisfying required capabilities without selecting readiness, scheduling, or binding a concrete executor.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-095-SPECIALIST-ASSIGNMENT-GATE",
    name: "SpecialistAssignmentGate",
    kind: "gate",
    conditional: false,
    statement:
      "SpecialistAssignmentGate validates complete work-item assignment coverage, capability satisfaction, policy, grants, rationale, and approval before runtime executor binding.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-100-WORK-EXECUTION",
    name: "WorkExecution",
    kind: "module",
    conditional: false,
    statement:
      "WorkExecution binds an authorized ready work item and approved specialist profile to an exact runtime executor, performs only that bounded work, and returns a candidate ChangeSet without owning verification or integration.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-110-WORK-ITEM-VERIFICATION",
    name: "WorkItemVerification",
    kind: "module",
    conditional: false,
    statement:
      "WorkItemVerification checks each executed work item against its verification plan and required evidence before it can enter integration.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-120-CHANGE-INTEGRATION",
    name: "ChangeIntegration",
    kind: "module",
    conditional: false,
    statement:
      "ChangeIntegration combines individually verified changes in dependency-safe order and records the exact integrated state.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-130-SYSTEM-VERIFICATION",
    name: "SystemVerification",
    kind: "module",
    conditional: false,
    statement:
      "SystemVerification validates the integrated system across functional, security, performance, operational, documentation, and other configured quality policies.",
  }),
  Object.freeze({
    id: "SCOPE-DEV-V1-140-BUSINESS-ACCEPTANCE",
    name: "BusinessAcceptanceGate",
    kind: "gate",
    conditional: false,
    statement:
      "BusinessAcceptanceGate evaluates the exact SystemVerification result against approved business objectives, success metrics, scope, acceptance criteria, and required evidence and records the final disposition.",
  }),
]);

export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-devrelay-v1-project-baseline",
  statement:
    "Establish one project-wide DevRelay V1 requirements and ProjectOverview baseline that defines the complete deterministic engineering lifecycle and becomes explicit context for every downstream module.",
  objectives: [
    "Define the complete V1 lifecycle from requirements gathering through business acceptance.",
    "Keep every lifecycle capability provider-neutral, modular, replaceable, and contract-driven.",
    "Make progression deterministic through explicit artifacts, validation, evidence, and approval boundaries.",
    "Maintain end-to-end traceability without allowing adapters to own orchestration or graph authority.",
    "Preserve existing module-specific dogfood baselines as immutable historical evidence rather than treating them as the global project overview.",
  ],
  constraints: [
    "ArchitectureDiscovery runs only for an existing repository without a validated architecture baseline or current-architecture snapshot.",
    "ContractGeneration runs only when the approved architecture requires APIs, schemas, events, protocols, or another formal interface contract.",
    "AI models and external engineering tools remain interchangeable bounded implementation engines.",
    "Gates are explicit approval boundaries and are not silently collapsed into producing modules.",
    "ProjectOverview.md is a deterministic projection of the paired structured requirements baseline and is never edited independently.",
    "TraceabilityGraph remains a cross-cutting Core service rather than a lifecycle stage.",
  ],
  acceptanceCriteria: [
    "The project overview lists exactly the eighteen owner-approved V1 lifecycle components in their approved order.",
    "ArchitectureDiscovery and ContractGeneration are explicitly marked conditional with deterministic invocation conditions.",
    "The project overview is derived from a validated requirements candidate and promoted as an atomic RequirementsBaseline and ProjectOverviewBaseline pair.",
    "Every future downstream module invocation can receive the exact global ProjectOverviewBaseline through a declared input.",
    "Feature and module requirements evolve the global pair through change sets rather than overwriting historical baselines.",
  ],
  assumptions: [
    "The owner-approved V1 lifecycle inventory is complete for V1.",
    "RequirementsGate, ArchitectureGate, ContractGate, WorkBreakdownGate, WorkDependencyGate, SpecialistAssignmentGate, and BusinessAcceptanceGate are explicit owner-approved lifecycle components.",
  ],
});

export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary:
    "DevRelay is a provider-neutral deterministic orchestration runtime for spec-driven software engineering. V1 spans requirements, architecture, contracts, work planning, dependency analysis, specialist assignment, execution, verification, integration, and business acceptance, with TraceabilityGraph running alongside the lifecycle.",
  stakeholders: [
    "DevRelay product owner",
    "DevRelay maintainers",
    "Workflow and module authors",
    "Adapter authors",
    "IDE and orchestration hosts",
    "Engineering reviewers and approvers",
  ],
  domainConstraints: [
    "Every stage exchanges explicit immutable artifacts rather than conversational memory.",
    "Generic Core owns routing, adapter resolution, validation, checkpointing, traceability merge, and progression.",
    "Modules define provider-neutral semantics while adapters expose bounded external-tool capabilities.",
    "Adapters never receive TraceabilityGraph and never author graph operations.",
    "Candidate and approved authority remain separate and Gate promotion is explicit.",
    "Verification is required before downstream progression.",
  ],
  conventions: [
    "Use exact semantic versions and SHA-256-bound artifacts at runtime boundaries.",
    "Use JSON Schema draft 2020-12 for portable contracts.",
    "Use lowercase kebab-case operation, port, relationship, and outcome identifiers.",
    "Store forward lifecycle relationships and derive reverse traversal at query time.",
    "Keep native tool artifacts as subordinate evidence rather than canonical authority.",
    "Treat the root ProjectOverview.md as generated readable evidence for the structured project baseline.",
  ],
  sourceRefs: [],
});

const RECORD_COLLECTIONS = new Set([
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

const STRING_SETS = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "dependencies",
  "deliverables",
  "interests",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

function sourceRefKey(sourceRef) {
  return [
    sourceRef.role,
    sourceRef.artifact.artifactId,
    sourceRef.artifact.digest,
    sourceRef.location ?? "",
  ].join("\u0000");
}

function canonicalize(value, field) {
  if (Array.isArray(value)) {
    const items = value.map((entry) => canonicalize(entry));
    if (field === "sourceRefs") {
      return items.sort((left, right) =>
        sourceRefKey(left).localeCompare(sourceRefKey(right)),
      );
    }
    if (STRING_SETS.has(field)) {
      return items.sort((left, right) => left.localeCompare(right));
    }
    if (RECORD_COLLECTIONS.has(field)) {
      return items.sort((left, right) => left.id.localeCompare(right.id));
    }
    return items;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        canonicalize(child, key),
      ]),
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function buildProjectRequirements(makeSourceRefs) {
  const sourced = (value) => ({ ...value, sourceRefs: makeSourceRefs() });
  const requirements = {
    purpose: sourced({
      statement:
        "Provide a deterministic, provider-neutral orchestration runtime that turns approved goals into accepted software through explicit modular engineering contracts, evidence, gates, and traceable lifecycle progression.",
    }),
    businessObjectives: [
      sourced({
        id: "BO-DEV-DETERMINISM-001",
        statement:
          "Make software-engineering progression reproducible and fail closed when required inputs, evidence, or approvals are invalid.",
        stakeholderIds: [
          "STK-DEV-MAINTAINER-001",
          "STK-DEV-OWNER-001",
          "STK-DEV-WORKFLOW-AUTHOR-001",
        ],
        priority: "must",
      }),
      sourced({
        id: "BO-DEV-MODULARITY-001",
        statement:
          "Allow best-in-class engineering capabilities to be replaced without changing canonical workflow semantics or generic Core.",
        stakeholderIds: [
          "STK-DEV-MAINTAINER-001",
          "STK-DEV-OWNER-001",
          "STK-DEV-WORKFLOW-AUTHOR-001",
        ],
        priority: "must",
      }),
      sourced({
        id: "BO-DEV-QUALITY-001",
        statement:
          "Require scoped verification and evidence before work, changes, systems, or business outcomes advance.",
        stakeholderIds: [
          "STK-DEV-OWNER-001",
          "STK-DEV-WORKFLOW-AUTHOR-001",
        ],
        priority: "must",
      }),
      sourced({
        id: "BO-DEV-TRACEABILITY-001",
        statement:
          "Trace every approved business objective through requirements, design, planned work, implementation, verification, integration, and acceptance.",
        stakeholderIds: [
          "STK-DEV-MAINTAINER-001",
          "STK-DEV-OWNER-001",
          "STK-DEV-WORKFLOW-AUTHOR-001",
        ],
        priority: "must",
      }),
    ],
    successMetrics: [
      sourced({
        id: "SM-DEV-DETERMINISM-001",
        name: "Deterministic progression",
        businessObjectiveIds: ["BO-DEV-DETERMINISM-001"],
        measure:
          "Repeated Core-owned routing, validation, replay, and gate decisions for identical content-addressed inputs.",
        target: "100 percent identical outcomes and digests.",
        measurementMethod:
          "Run positive, negative, drift, checkpoint, replay, and gate conformance suites.",
      }),
      sourced({
        id: "SM-DEV-MODULARITY-001",
        name: "Adapter-independent semantics",
        businessObjectiveIds: ["BO-DEV-MODULARITY-001"],
        measure:
          "Compatible adapter replacements requiring a product-specific behavioral branch in generic Core.",
        target: "Zero branches.",
        measurementMethod:
          "Execute adapter replacement fixtures and scan generic Core for product identifiers.",
      }),
      sourced({
        id: "SM-DEV-QUALITY-001",
        name: "Verified progression",
        businessObjectiveIds: ["BO-DEV-QUALITY-001"],
        measure:
          "Lifecycle transitions occurring without the configured passing evidence and approval record.",
        target: "Zero transitions.",
        measurementMethod:
          "Audit module execution records, gate decisions, verification evidence, and acceptance receipts.",
      }),
      sourced({
        id: "SM-DEV-TRACEABILITY-001",
        name: "Lifecycle trace coverage",
        businessObjectiveIds: ["BO-DEV-TRACEABILITY-001"],
        measure:
          "Approved business objectives with a complete trace to implementation and passing verification evidence by BusinessAcceptance.",
        target: "100 percent or an explicit approved disposition.",
        measurementMethod:
          "Run TraceabilityGraph coverage and orphan diagnostics at each lifecycle horizon.",
      }),
    ],
    stakeholders: [
      sourced({
        id: "STK-DEV-MAINTAINER-001",
        name: "DevRelay maintainer",
        role: "Own the provider-neutral kernel, contracts, gates, and trusted contributors.",
        category: "owner",
        interests: [
          "Minimal Core special cases.",
          "Versioned extensible contracts.",
        ],
      }),
      sourced({
        id: "STK-DEV-OWNER-001",
        name: "DevRelay product owner",
        role: "Defines business intent, V1 scope, and approval policy.",
        category: "owner",
        interests: [
          "Complete V1 lifecycle.",
          "Reproducible accepted software outcomes.",
        ],
      }),
      sourced({
        id: "STK-DEV-WORKFLOW-AUTHOR-001",
        name: "Workflow author",
        role: "Configures modules, adapters, gates, and evidence policy for an engineering project.",
        category: "user",
        interests: [
          "Clear module handoffs.",
          "Replaceable engineering capabilities.",
        ],
      }),
    ],
    users: [
      sourced({
        id: "USR-DEV-WORKFLOW-AUTHOR-001",
        name: "Engineering workflow author",
        description:
          "A maintainer or engineering lead who configures and operates DevRelay from a goal through business acceptance.",
        stakeholderIds: ["STK-DEV-WORKFLOW-AUTHOR-001"],
        needs: [
          "Inspect exact artifacts, decisions, evidence, and progression state.",
          "Run a complete engineering lifecycle without relying on model memory.",
          "Swap compatible adapters without redesigning the workflow.",
        ],
      }),
    ],
    capabilities: [
      sourced({
        id: "CAP-DEV-EXTENSIBILITY-001",
        name: "Replaceable engineering capabilities",
        description:
          "Bind interchangeable bounded adapters to stable provider-neutral module operations.",
        businessObjectiveIds: ["BO-DEV-MODULARITY-001"],
        userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
      }),
      sourced({
        id: "CAP-DEV-LIFECYCLE-001",
        name: "Deterministic lifecycle orchestration",
        description:
          "Route exact state through the approved V1 lifecycle and stop invalid work before it propagates.",
        businessObjectiveIds: [
          "BO-DEV-DETERMINISM-001",
          "BO-DEV-QUALITY-001",
        ],
        userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
      }),
      sourced({
        id: "CAP-DEV-SPECIFICATION-001",
        name: "Structured engineering contracts",
        description:
          "Represent requirements, architecture, contracts, work, changes, evidence, and acceptance as versioned artifacts.",
        businessObjectiveIds: [
          "BO-DEV-DETERMINISM-001",
          "BO-DEV-TRACEABILITY-001",
        ],
        userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
      }),
      sourced({
        id: "CAP-DEV-VERIFICATION-001",
        name: "Evidence-based verification and acceptance",
        description:
          "Require scoped evidence at work-item, integrated-system, and business-acceptance boundaries.",
        businessObjectiveIds: [
          "BO-DEV-QUALITY-001",
          "BO-DEV-TRACEABILITY-001",
        ],
        userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
      }),
    ],
    userJourneys: [
      sourced({
        id: "UJ-DEV-GOAL-TO-ACCEPTANCE-001",
        name: "Move an approved goal to business acceptance",
        userId: "USR-DEV-WORKFLOW-AUTHOR-001",
        capabilityIds: [
          "CAP-DEV-EXTENSIBILITY-001",
          "CAP-DEV-LIFECYCLE-001",
          "CAP-DEV-SPECIFICATION-001",
          "CAP-DEV-VERIFICATION-001",
        ],
        trigger: "A project goal or approved change enters DevRelay.",
        outcome:
          "The integrated system is accepted or progression stops with explicit clarification, diagnostics, redesign, rejection, or missing evidence.",
        steps: [
          {
            sequence: 1,
            action: "Establish approved requirements, architecture, and applicable interface contracts.",
            expectedOutcome: "The authorized scope and design are explicit and traceable.",
          },
          {
            sequence: 2,
            action: "Decompose, order, and assign bounded work.",
            expectedOutcome: "Only dependency-ready work reaches compatible specialists.",
          },
          {
            sequence: 3,
            action: "Execute and verify each work item before integration.",
            expectedOutcome: "Only individually verified changes enter integration.",
          },
          {
            sequence: 4,
            action: "Verify the integrated system and evaluate business acceptance.",
            expectedOutcome: "Acceptance is bound to objectives, criteria, and passing evidence.",
          },
        ],
      }),
    ],
    userStories: [
      sourced({
        id: "US-DEV-EXTEND-001",
        userId: "USR-DEV-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-DEV-EXTENSIBILITY-001",
        userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
        need:
          "Replace a configured engineering capability without changing the lifecycle contract.",
        benefit: "The workflow can remain best-in-class as tools evolve.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-DEV-ADAPTER-BOUNDARY-001",
          "AC-DEV-MODEL-INDEPENDENCE-001",
        ],
      }),
      sourced({
        id: "US-DEV-ORCHESTRATE-001",
        userId: "USR-DEV-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-DEV-LIFECYCLE-001",
        userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
        need:
          "Run the exact V1 lifecycle with deterministic conditional routing and approval boundaries.",
        benefit: "Invalid or incomplete work cannot silently propagate downstream.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-DEV-CONDITIONAL-ROUTING-001",
          "AC-DEV-FULL-V1-SCOPE-001",
          "AC-DEV-GATE-PROGRESSION-001",
          "AC-DEV-RESUME-001",
        ],
      }),
      sourced({
        id: "US-DEV-SPECIFY-001",
        userId: "USR-DEV-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-DEV-SPECIFICATION-001",
        userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
        need:
          "Use explicit structured artifacts for every lifecycle handoff.",
        benefit: "Engineering state is reproducible without conversational memory.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-DEV-ARTIFACT-HANDOFF-001",
          "AC-DEV-TRACEABILITY-001",
        ],
      }),
      sourced({
        id: "US-DEV-VERIFY-001",
        userId: "USR-DEV-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-DEV-VERIFICATION-001",
        userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
        need:
          "Require evidence before work items, integrated changes, or business outcomes are accepted.",
        benefit: "Progression reflects proven engineering completion rather than model confidence.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-DEV-GATE-PROGRESSION-001",
          "AC-DEV-VERIFICATION-001",
        ],
      }),
    ],
    acceptanceCriteria: [
      sourced({
        id: "AC-DEV-ADAPTER-BOUNDARY-001",
        statement:
          "Adapters receive only declared inputs and capability grants and cannot route workflow, approve artifacts, mutate TraceabilityGraph, or create undeclared Core behavior.",
        verification:
          "Run prohibited-capability, hidden-context, graph-access, and Core-special-case fixtures for each adapter family.",
      }),
      sourced({
        id: "AC-DEV-ARTIFACT-HANDOFF-001",
        statement:
          "Every lifecycle handoff uses a schema-valid, immutable, content-addressed artifact with explicit lineage and no reliance on conversational memory.",
        verification:
          "Audit every V1 module manifest, invocation, result contract, checkpoint, and downstream input binding.",
      }),
      sourced({
        id: "AC-DEV-CONDITIONAL-ROUTING-001",
        statement:
          "ArchitectureDiscovery runs only for an existing repository without a validated architecture baseline or current snapshot, and ContractGeneration runs only when approved interface intent requires formal contracts.",
        verification:
          "Execute every eligible and ineligible state fixture and verify Core-owned route decisions and zero adapter calls on rejected routes.",
      }),
      sourced({
        id: "AC-DEV-FULL-V1-SCOPE-001",
        statement:
          "The approved project overview contains exactly RequirementsGathering, RequirementsGate, ArchitectureDiscovery, ArchitectureDesign, ArchitectureGate, ContractGeneration, WorkBreakdown, WorkDependencyAnalysis, SpecialistAssignment, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, and BusinessAcceptance in that order.",
        verification:
          "Compare the ordered owner-approved inventory with the deterministic scope projection and fail on omission, addition, reordering, or conditionality drift.",
      }),
      sourced({
        id: "AC-DEV-GATE-PROGRESSION-001",
        statement:
          "A configured gate prevents progression until exact candidate, policy, evidence, approval, and baseline-promotion requirements pass.",
        verification:
          "Attempt progression with missing, stale, forged, rejected, and passing gate inputs at each implemented boundary.",
      }),
      sourced({
        id: "AC-DEV-MODEL-INDEPENDENCE-001",
        statement:
          "Changing the AI model or bounded implementation tool does not alter the canonical module sequence, artifact contracts, gates, or traceability vocabulary.",
        verification:
          "Run compatible adapter substitutions and compare canonical outputs, validation, route, and graph contracts.",
      }),
      sourced({
        id: "AC-DEV-RESUME-001",
        statement:
          "Interrupted effectful executions resume only from exact validated checkpoints and do not repeat already checkpointed effects.",
        verification:
          "Interrupt and replay each effectful execution profile and assert exact lineage with zero duplicate adapter calls.",
      }),
      sourced({
        id: "AC-DEV-TRACEABILITY-001",
        statement:
          "TraceabilityGraph can traverse each accepted business objective through requirements, architecture, contracts when applicable, planned work, changes, tests, evidence, integration, and acceptance while diagnosing missing links.",
        verification:
          "Run forward and reverse lifecycle queries plus orphan, unscoped-work, and missing-evidence diagnostics at each implemented horizon.",
      }),
      sourced({
        id: "AC-DEV-VERIFICATION-001",
        statement:
          "WorkItemVerification and SystemVerification record scoped passing evidence before ChangeIntegration and BusinessAcceptance respectively.",
        verification:
          "Exercise passing and failing evidence packages and verify downstream progression remains blocked until the required proof passes.",
      }),
    ],
    nonFunctionalRequirements: [
      sourced({
        id: "NFR-DEV-DETERMINISM-001",
        category: "reliability",
        statement:
          "Core-owned routing, validation, checkpoint replay, traceability projection, and gate preparation must be deterministic for exact inputs.",
        applicability: { level: "project" },
        measure: "Canonical route, result, diagnostic, update, and receipt digest equality.",
        target: "100 percent equality for deterministic Core-owned behavior.",
        priority: "must",
        acceptanceCriterionIds: ["AC-DEV-RESUME-001"],
      }),
      sourced({
        id: "NFR-DEV-PORTABILITY-001",
        category: "compatibility",
        statement:
          "Canonical lifecycle contracts must remain independent of IDE, AI provider, model, operating host, and bounded external tool.",
        applicability: { level: "project" },
        measure: "Compatible host and adapter substitutions requiring canonical contract changes.",
        target: "Zero substitutions.",
        priority: "must",
        acceptanceCriterionIds: ["AC-DEV-MODEL-INDEPENDENCE-001"],
      }),
      sourced({
        id: "NFR-DEV-TRACEABILITY-001",
        category: "observability",
        statement:
          "Every accepted lifecycle assertion must retain exact artifact, contributor, execution, authority, and graph-version provenance.",
        applicability: { level: "project" },
        measure: "Accepted graph assertions lacking complete resolvable provenance.",
        target: "Zero assertions.",
        priority: "must",
        acceptanceCriterionIds: ["AC-DEV-TRACEABILITY-001"],
      }),
    ],
    constraints: [
      sourced({
        id: "CON-DEV-ARTIFACT-CONTRACTS-001",
        category: "technical",
        statement:
          "Every stage must exchange canonical structured artifacts and cannot rely on conversational memory as authority.",
        rationale: "Explicit artifacts make lifecycle state reproducible and verifiable.",
        applicability: { level: "project" },
        acceptanceCriterionIds: ["AC-DEV-ARTIFACT-HANDOFF-001"],
      }),
      sourced({
        id: "CON-DEV-GATE-SEPARATION-001",
        category: "business",
        statement:
          "Producing modules cannot approve or promote their own candidates; configured gates own progression decisions.",
        rationale: "Separate authority prevents production from becoming self-approval.",
        applicability: { level: "project" },
        acceptanceCriterionIds: ["AC-DEV-GATE-PROGRESSION-001"],
      }),
      sourced({
        id: "CON-DEV-MODULE-INVENTORY-001",
        category: "business",
        statement:
          "V1 lifecycle scope is limited to the fourteen owner-approved components recorded in the project overview.",
        rationale: "A closed inventory prevents silent V1 scope expansion.",
        applicability: { level: "project" },
        acceptanceCriterionIds: [
          "AC-DEV-CONDITIONAL-ROUTING-001",
          "AC-DEV-FULL-V1-SCOPE-001",
        ],
      }),
      sourced({
        id: "CON-DEV-PROVIDER-NEUTRAL-001",
        category: "technical",
        statement:
          "Canonical Core and module contracts cannot depend on one AI model, provider, IDE, or external engineering product.",
        rationale: "The workflow owns engineering semantics; tools only perform bounded capabilities.",
        applicability: { level: "project" },
        acceptanceCriterionIds: [
          "AC-DEV-ADAPTER-BOUNDARY-001",
          "AC-DEV-MODEL-INDEPENDENCE-001",
        ],
      }),
    ],
    scope: V1_LIFECYCLE.map(({ id, statement, name, kind, conditional }) =>
      sourced({
        id,
        statement: `${name} [${kind}${conditional ? "; conditional" : ""}]: ${statement}`,
      }),
    ),
    nonGoals: [
      sourced({
        id: "NG-DEV-AI-WRAPPER-001",
        statement: "Build another monolithic coding agent or AI-provider wrapper.",
        rationale:
          "DevRelay standardizes deterministic engineering workflow rather than code generation.",
      }),
      sourced({
        id: "NG-DEV-IMPLICIT-AUTHORITY-001",
        statement:
          "Treat model confidence, adapter output, chat history, or successful execution as implicit approval.",
        rationale: "Only explicit validated gates and evidence authorize progression.",
      }),
      sourced({
        id: "NG-DEV-UPSTREAM-REIMPLEMENTATION-001",
        statement:
          "Reimplement full upstream tools such as OpenSpec, Spec Kit, Structurizr, or MADR inside Core.",
        rationale: "DevRelay invokes only bounded replaceable capabilities.",
      }),
      sourced({
        id: "NG-DEV-V1-SCOPE-EXPANSION-001",
        statement:
          "Add lifecycle modules outside the approved V1 inventory without a new requirements change and overview baseline.",
        rationale: "V1 scope must remain deliberate and auditable.",
      }),
    ],
    terminology: [
      sourced({
        id: "TERM-DEV-CONDITIONAL-MODULE-001",
        term: "Conditional module",
        definition:
          "A lifecycle module invoked only when exact Core-owned state and approved policy satisfy its declared condition.",
        aliases: [],
      }),
      sourced({
        id: "TERM-DEV-ENGINEERING-GATE-001",
        term: "Engineering gate",
        definition:
          "A separate validation and approval boundary that decides whether an exact candidate may become an approved baseline or progress downstream.",
        aliases: ["Gate"],
      }),
      sourced({
        id: "TERM-DEV-MODULE-001",
        term: "Module",
        definition:
          "A provider-neutral lifecycle contract defining exact inputs, action, outputs, outcomes, evidence, and progression boundary.",
        aliases: ["Engineering module"],
      }),
      sourced({
        id: "TERM-DEV-PROJECT-OVERVIEW-001",
        term: "ProjectOverviewBaseline",
        definition:
          "The compact approved project-wide context deterministically projected from the paired RequirementsBaseline and explicitly supplied to downstream modules.",
        aliases: ["Project overview"],
      }),
      sourced({
        id: "TERM-DEV-TRACEABILITY-GRAPH-001",
        term: "TraceabilityGraph",
        definition:
          "A Core-owned cross-cutting lifecycle index that records validated artifact relationships beside the module sequence without becoming a workflow stage.",
        aliases: ["Traceability graph"],
      }),
    ],
    currentStatus: sourced({
      lifecycle: "existing",
      phase: "planning",
      summary:
        "DevRelay V1 scope is fixed at fourteen lifecycle components. RequirementsGathering, ArchitectureDesign, WorkBreakdown, and the TraceabilityGraph sidecar are implemented; WorkDependencyAnalysis is the next module under requirements clarification.",
    }),
    assumptions: [
      sourced({
        id: "ASM-DEV-CONDITIONAL-MODULES-001",
        statement:
          "ArchitectureDiscovery and ContractGeneration are conditional lifecycle modules rather than mandatory work for every project or change.",
        status: "confirmed",
        blocking: false,
      }),
      sourced({
        id: "ASM-DEV-V1-INVENTORY-001",
        statement:
          "The fourteen lifecycle components in the approved scope are the complete DevRelay V1 inventory.",
        status: "confirmed",
        blocking: false,
      }),
    ],
    dependencies: [
      "A durable host for artifact, checkpoint, graph, approval, and execution-record persistence.",
      "Bounded adapters or compatible implementations for configured module capabilities.",
      "Explicit human or automated approval policy at configured gates.",
      "Versioned canonical contracts for each V1 module and lifecycle artifact.",
    ],
    risks: [
      "Adapter-native semantics may leak into canonical contracts unless conformance remains strict.",
      "Conditional routing may become implicit unless every condition remains state-driven and evidence-bound.",
      "Gate proliferation may add friction unless quick paths remain clear and policy is risk-adjusted.",
      "Module boundaries may drift into duplicated responsibility unless every contract keeps one primary purpose.",
      "Traceability may become incomplete when future contributors omit required lifecycle relationships or evidence horizons.",
    ],
    deliverables: [
      "A complete V1 module and gate contract inventory.",
      "A deterministic provider-neutral orchestration kernel and host integration boundary.",
      "A project-wide RequirementsBaseline, ProjectOverviewBaseline, and generated ProjectOverview.md.",
      "Executable conformance fixtures and verification evidence for every implemented lifecycle slice.",
      "TraceabilityGraph coverage from business objectives through business acceptance.",
      "Versioned bounded adapter manifests for replaceable external engineering capabilities.",
    ],
    requiredEvidence: [
      "architecture/gate-approval",
      "business/acceptance",
      "integration/change-proof",
      "release/full-verification",
      "requirements/gate-promotion",
      "requirements/source-provenance",
      "traceability/checkpoint-merge",
      "verification/system-evidence",
      "verification/work-item-evidence",
    ],
    sourceRefs: makeSourceRefs(),
  };

  return canonicalize(requirements);
}

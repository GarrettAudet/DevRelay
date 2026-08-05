export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-work-dependency-analysis-module-v1",
  statement:
    "Define DevRelay's WorkDependencyAnalysis module through RequirementsGathering and ArchitectureDesign so an approved WorkBreakdownBaseline becomes a verified dependency DAG before specialist assignment or execution.",
  objectives: [
    "Turn non-authoritative WorkItem dependency hints into a complete candidate dependency graph.",
    "Make dependency ordering authoritative only after a separate WorkDependency Gate.",
    "Reject cycles, missing dependencies, invalid references, and impossible ordering before downstream assignment.",
    "Enable safe dependency-aware parallel execution without assigning, scheduling, or executing work.",
    "Keep dependency analysis provider-neutral and replaceable through bounded plug-ins.",
    "Extend TraceabilityGraph through a trusted contributor rather than adapter-authored graph operations.",
  ],
  constraints: [
    "The exact approved WorkBreakdownBaseline is the source of the work-item universe.",
    "WorkBreakdown dependency hints remain proposals until analysis and Gate approval.",
    "Adapters cannot access or mutate TraceabilityGraph.",
    "Specialist assignment, scheduling, status, implementation, and verification remain downstream.",
    "The module cannot claim semantic completeness from graph-shape validation alone.",
    "The first implementation remains an incremental module slice rather than a scheduler or general control plane.",
  ],
  acceptanceCriteria: [
    "Every approved work item appears exactly once in the dependency candidate graph.",
    "Every dependency hint receives an explicit evidence-backed disposition.",
    "Only WorkDependency Gate can promote a candidate to an authoritative WorkDependencyBaseline.",
    "The Gate rejects invalid endpoints, duplicate or self edges, cycles, unresolved missing dependencies, and impossible ordering.",
    "A later scheduler can derive runnable work from the approved DAG without stored assignments or execution waves.",
    "Configured adapters are replaceable without changing generic Core or the canonical dependency contract.",
    "Trusted traceability projection stores forward planning relationships only and never claims work completion.",
  ],
  assumptions: [
    "The operation lifecycle, trust boundary, input set, parallelism projection, and V1 plug-in bindings require owner confirmation.",
    "The OpenSpec chat bridge records this run but does not claim OpenSpec CLI execution.",
  ],
});

export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary:
    "DevRelay has one approved project-wide V1 RequirementsBaseline and ProjectOverviewBaseline covering the complete fourteen-component lifecycle. RequirementsGathering, ArchitectureDesign, WorkBreakdown, and the TraceabilityGraph sidecar are implemented; WorkDependencyAnalysis is the next module at interactive requirements clarification.",
  stakeholders: [
    "DevRelay maintainers",
    "Workflow authors",
    "Module and adapter authors",
    "IDE and orchestration hosts",
    "Specialist-assignment and execution modules",
    "Reviewers responsible for safe parallel execution",
  ],
  domainConstraints: [
    "Generic Core owns exact artifact loading, deterministic routing, adapter resolution, checkpointing, validation, and progression.",
    "Modules own provider-neutral contracts while adapters own bounded native-tool capabilities.",
    "Candidate and approved authority remain distinct and Gate promotion is explicit.",
    "Effectful model output is checkpointed and replayed rather than assumed bit-reproducible.",
    "Adapters never receive TraceabilityGraph and never submit graph operations.",
    "Dependency analysis cannot become assignment, scheduling, work execution, or a provider wrapper.",
  ],
  conventions: [
    "Use exact immutable module and adapter versions.",
    "Use SHA-256-bound artifacts and raw-byte verification at runtime boundaries.",
    "Use JSON Schema draft 2020-12 and Ajv validation.",
    "Use lowercase kebab-case ports, operations, relationships, and machine outcomes.",
    "Store forward graph relationships only and derive reverse traversal at query time.",
    "Preserve native analyzer output as subordinate evidence rather than canonical authority.",
    "Prove generic behavior through positive, negative, replay, drift, and Core special-case tests.",
  ],
  sourceRefs: [],
});

export const questions = Object.freeze([
  Object.freeze({
    id: "Q-WDA-OPERATION-LIFECYCLE-001",
    prompt:
      "Should WorkDependencyAnalysis expose one analyze-dependencies operation that recomputes a complete graph for each exact WorkBreakdownBaseline, or separate establish and change operations?",
    rationale:
      "This determines routing, baseline evolution, change semantics, and whether stale dependency state can accumulate.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "One full-snapshot analyze-dependencies operation (recommended)",
      "Separate establish-dependencies and analyze-change operations",
    ],
  }),
  Object.freeze({
    id: "Q-WDA-TRUST-BOUNDARY-001",
    prompt:
      "Which boundary should own dependency proposals, graph mechanics, semantic completeness, and authoritative promotion?",
    rationale:
      "Graph mechanics are deterministic, but an untrusted analyzer cannot prove by omission that no semantic dependency is missing.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Adapter proposes; trusted Core validates mechanics; WorkDependencyGate verifies semantic completeness and promotes (recommended)",
      "Core derives dependencies only from explicit WorkBreakdown hints",
      "Adapter returns the final authoritative dependency graph",
    ],
  }),
  Object.freeze({
    id: "Q-WDA-INPUT-CONTEXT-001",
    prompt:
      "What exact context should the analyzer receive in addition to WorkBreakdownBaseline and ProjectOverviewBaseline?",
    rationale:
      "Acceptance criteria, architecture boundaries, contracts, repository structure, and explicit policy can reveal dependencies absent from terse work-item hints.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Exact requirements, architecture, contract disposition, repository context, and versioned DependencyPolicy, coherence-checked against WorkBreakdown (recommended)",
      "Only WorkBreakdownBaseline and ProjectOverviewBaseline",
      "Let each adapter request undeclared context as needed",
    ],
  }),
  Object.freeze({
    id: "Q-WDA-PARALLELISM-001",
    prompt:
      "Should WorkDependencyAnalysis store execution waves, or only the DAG from which a later scheduler derives the runnable frontier?",
    rationale:
      "Persisted waves become stale when runtime capacity or completion state changes and blur analysis with scheduling.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Store the DAG only; derive runnable frontiers downstream (recommended)",
      "Store the DAG plus canonical parallel execution waves",
    ],
  }),
  Object.freeze({
    id: "Q-WDA-PLUGIN-SURFACE-001",
    prompt: "Which bounded dependency-analysis plug-ins should V1 define?",
    rationale:
      "Spec Kit has dependency-ordered tasks and read-only cross-artifact analysis; default OpenSpec tasks lack a formal item-level DAG, so an OpenSpec binding needs a custom DevRelay artifact schema.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "SpecKitAnalyzeAdapter plus an OpenSpec custom dependency-artifact adapter (recommended)",
      "Provider-neutral adapter contract and deterministic validator only in V1",
      "Reuse existing task-generation adapters without a new bounded capability",
    ],
  }),
]);

export function buildWorkingRequirements(makeSourceRefs) {
  const sourced = (value) => ({ ...value, sourceRefs: makeSourceRefs() });
  return {
    purpose: sourced({
      statement:
        "Convert an exact approved WorkBreakdownBaseline into a complete candidate dependency graph that becomes authoritative only after deterministic and semantic Gate verification.",
    }),
    businessObjectives: [
      sourced({
        id: "BO-WDA-CORRECTNESS-001",
        statement:
          "Prevent invalid, cyclic, incomplete, or impossible dependency plans from reaching assignment and execution.",
        stakeholderIds: [
          "STK-WDA-MAINTAINER-001",
          "STK-WDA-WORKFLOW-AUTHOR-001",
        ],
        priority: "must",
      }),
      sourced({
        id: "BO-WDA-MODULARITY-001",
        statement:
          "Replace dependency-analysis capabilities without changing canonical semantics or generic Core.",
        stakeholderIds: [
          "STK-WDA-MAINTAINER-001",
          "STK-WDA-ADAPTER-AUTHOR-001",
        ],
        priority: "must",
      }),
      sourced({
        id: "BO-WDA-PARALLEL-SAFETY-001",
        statement:
          "Provide authoritative ordering sufficient for downstream systems to identify safely runnable work.",
        stakeholderIds: [
          "STK-WDA-WORKFLOW-AUTHOR-001",
          "STK-WDA-EXECUTION-HOST-001",
        ],
        priority: "must",
      }),
    ],
    successMetrics: [
      sourced({
        id: "SM-WDA-INVALID-PROGRESSION-001",
        name: "Invalid dependency progression",
        businessObjectiveIds: ["BO-WDA-CORRECTNESS-001"],
        measure:
          "Invalid endpoint, duplicate or self edge, cycle, unresolved missing dependency, or impossible ordering cases reaching an approved baseline.",
        target: "Zero cases.",
        measurementMethod:
          "Run positive and negative WorkDependency Gate fixtures and inspect exact promotion receipts.",
      }),
      sourced({
        id: "SM-WDA-CORE-SPECIAL-CASES-001",
        name: "Generic Core product branches",
        businessObjectiveIds: ["BO-WDA-MODULARITY-001"],
        measure:
          "WorkDependencyAnalysis, Spec Kit, or OpenSpec identifier branches in generic Core.",
        target: "Zero branches.",
        measurementMethod:
          "Run static special-case scans and adapter-replacement conformance tests.",
      }),
      sourced({
        id: "SM-WDA-FRONTIER-SAFETY-001",
        name: "Unsafe runnable frontier",
        businessObjectiveIds: ["BO-WDA-PARALLEL-SAFETY-001"],
        measure:
          "Work items exposed as runnable while an authoritative predecessor remains incomplete.",
        target: "Zero items across graph fixtures.",
        measurementMethod:
          "Derive runnable frontiers from approved DAG fixtures and predecessor completion state.",
      }),
    ],
    stakeholders: [
      sourced({
        id: "STK-WDA-MAINTAINER-001",
        name: "DevRelay maintainer",
        role: "Own the canonical module, Gate, and trusted validation boundary.",
        category: "owner",
        interests: ["No Core special cases.", "Deterministic progression."],
      }),
      sourced({
        id: "STK-WDA-WORKFLOW-AUTHOR-001",
        name: "Workflow author",
        role: "Configure dependency analysis and review proposed ordering.",
        category: "user",
        interests: [
          "Complete dependency reasoning.",
          "Actionable clarification and diagnostics.",
        ],
      }),
      sourced({
        id: "STK-WDA-ADAPTER-AUTHOR-001",
        name: "Dependency adapter author",
        role: "Map a bounded native capability to the canonical contract.",
        category: "affected",
        interests: ["Stable ports.", "Explicit evidence requirements."],
      }),
      sourced({
        id: "STK-WDA-EXECUTION-HOST-001",
        name: "Downstream execution host",
        role: "Use the approved DAG when selecting runnable work.",
        category: "operator",
        interests: [
          "No work starts before predecessors complete.",
          "Parallelism reflects current runtime state.",
        ],
      }),
    ],
    users: [
      sourced({
        id: "USR-WDA-WORKFLOW-AUTHOR-001",
        name: "Dependency-planning workflow author",
        description:
          "A maintainer or host operator who runs and reviews dependency analysis before assignment.",
        stakeholderIds: ["STK-WDA-WORKFLOW-AUTHOR-001"],
        needs: [
          "Obtain an evidence-backed dependency proposal.",
          "Resolve blocking dependency findings.",
          "Approve only a valid and reviewed DAG.",
        ],
      }),
    ],
    capabilities: [
      sourced({
        id: "CAP-WDA-ANALYZE-001",
        name: "Work dependency analysis",
        description:
          "Analyze an approved work breakdown and propose directed dependencies and dispositions.",
        businessObjectiveIds: [
          "BO-WDA-CORRECTNESS-001",
          "BO-WDA-MODULARITY-001",
          "BO-WDA-PARALLEL-SAFETY-001",
        ],
        userIds: ["USR-WDA-WORKFLOW-AUTHOR-001"],
        audience: "internal",
        key: true,
        priority: "must",
      }),
      sourced({
        id: "CAP-WDA-GATE-001",
        name: "Dependency Gate verification",
        description:
          "Validate graph mechanics and semantic policy before authoritative promotion.",
        businessObjectiveIds: [
          "BO-WDA-CORRECTNESS-001",
          "BO-WDA-PARALLEL-SAFETY-001",
        ],
        userIds: ["USR-WDA-WORKFLOW-AUTHOR-001"],
        audience: "internal",
        key: true,
        priority: "must",
      }),
    ],
    userJourneys: [
      sourced({
        id: "UJ-WDA-APPROVE-001",
        name: "Analyze and approve work dependencies",
        userId: "USR-WDA-WORKFLOW-AUTHOR-001",
        capabilityIds: ["CAP-WDA-ANALYZE-001", "CAP-WDA-GATE-001"],
        trigger: "An exact WorkBreakdownBaseline is approved.",
        outcome:
          "An authoritative dependency baseline is approved or progression stops with findings.",
        steps: [
          {
            sequence: 1,
            action: "Invoke the configured bounded dependency analyzer.",
            expectedOutcome:
              "A checkpointed canonical candidate or clarification is produced.",
          },
          {
            sequence: 2,
            action: "Run graph and semantic policy checks.",
            expectedOutcome:
              "Invalid references, cycles, missing dependencies, and impossible ordering block progression.",
          },
          {
            sequence: 3,
            action: "Approve the exact candidate at WorkDependency Gate.",
            expectedOutcome:
              "The candidate becomes the authoritative baseline with evidence.",
          },
        ],
      }),
    ],
    userStories: [
      sourced({
        id: "US-WDA-ANALYZE-001",
        userId: "USR-WDA-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-WDA-ANALYZE-001",
        userJourneyIds: ["UJ-WDA-APPROVE-001"],
        need:
          "Analyze every work item and dependency hint against exact upstream context.",
        benefit: "I receive a complete, traceable dependency proposal.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-WDA-GRAPH-COVERAGE-001",
          "AC-WDA-HINT-DISPOSITION-001",
          "AC-WDA-INPUT-COHERENCE-001",
        ],
      }),
      sourced({
        id: "US-WDA-VERIFY-001",
        userId: "USR-WDA-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-WDA-GATE-001",
        userJourneyIds: ["UJ-WDA-APPROVE-001"],
        need:
          "Reject invalid or semantically incomplete dependency candidates.",
        benefit: "Downstream work cannot inherit known-invalid ordering.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-WDA-CYCLE-001",
          "AC-WDA-MISSING-001",
          "AC-WDA-ORDERING-001",
        ],
      }),
      sourced({
        id: "US-WDA-PLUGINS-001",
        userId: "USR-WDA-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-WDA-ANALYZE-001",
        userJourneyIds: ["UJ-WDA-APPROVE-001"],
        need: "Replace the analyzer through exact host configuration.",
        benefit:
          "The workflow can adopt better tools without changing Core or contracts.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-WDA-PLUGIN-BOUNDARY-001",
          "AC-WDA-DETERMINISM-001",
        ],
      }),
      sourced({
        id: "US-WDA-PARALLEL-001",
        userId: "USR-WDA-WORKFLOW-AUTHOR-001",
        capabilityId: "CAP-WDA-GATE-001",
        userJourneyIds: ["UJ-WDA-APPROVE-001"],
        need:
          "Provide authoritative predecessors without scheduling or executing work.",
        benefit:
          "A later scheduler can derive current safe parallel opportunities.",
        priority: "must",
        acceptanceCriterionIds: [
          "AC-WDA-PARALLEL-BOUNDARY-001",
          "AC-WDA-NO-EXECUTION-001",
          "AC-WDA-TRACEABILITY-001",
        ],
      }),
    ],
    acceptanceCriteria: [
      sourced({
        id: "AC-WDA-GRAPH-COVERAGE-001",
        statement:
          "A candidate is bound to one exact WorkBreakdownBaseline and contains every baseline work-item ID exactly once with no additional IDs.",
        verification:
          "Run exact-set fixtures for omitted, duplicated, and foreign IDs.",
      }),
      sourced({
        id: "AC-WDA-HINT-DISPOSITION-001",
        statement:
          "Every dependency hint receives exactly one evidence-backed disposition.",
        verification:
          "Exercise accepted, rejected, replaced, duplicated, and omitted dispositions.",
      }),
      sourced({
        id: "AC-WDA-INPUT-COHERENCE-001",
        statement:
          "All direct baselines, repository context, and policy inputs are immutable and coherence-checked against WorkBreakdown before adapter entry.",
        verification:
          "Mutate each version, digest, repository revision, tree digest, or lineage pointer and verify pre-adapter drift with zero adapter calls.",
      }),
      sourced({
        id: "AC-WDA-CYCLE-001",
        statement:
          "WorkDependency Gate rejects self-dependencies and every directed cycle with a deterministic cycle witness.",
        verification:
          "Exercise self-loop, two-node, nested, and disjoint cycles across replays.",
      }),
      sourced({
        id: "AC-WDA-MISSING-001",
        statement:
          "WorkDependency Gate rejects unresolved blocking missing-dependency findings under the exact DependencyPolicy and verification evidence.",
        verification:
          "Use independent semantic-check fixtures with omitted prerequisites and verify no promotion until resolved or explicitly approved by policy.",
      }),
      sourced({
        id: "AC-WDA-ORDERING-001",
        statement:
          "WorkDependency Gate rejects invalid endpoints, duplicate edges, contradictory evidence, and policy-forbidden ordering.",
        verification:
          "Run one negative fixture per rejection and verify stable codes and no commit payload.",
      }),
      sourced({
        id: "AC-WDA-PLUGIN-BOUNDARY-001",
        statement:
          "A bounded analyzer may propose dependencies, dispositions, findings, and native evidence but cannot route, promote, access TraceabilityGraph, or author graph operations.",
        verification:
          "Swap adapters and attempt prohibited behavior while scanning generic Core.",
      }),
      sourced({
        id: "AC-WDA-DETERMINISM-001",
        statement:
          "Exact inputs, adapter identity, configuration, grants, policy, and checkpoint state produce the same Core-owned route, validation, graph digest, diagnostics, and replay without reinvocation.",
        verification:
          "Execute repeated and replayed runs and compare outputs and call counts.",
      }),
      sourced({
        id: "AC-WDA-PARALLEL-BOUNDARY-001",
        statement:
          "The approved artifact provides predecessor relationships sufficient for a later scheduler to derive runnable work without mutable assignment or execution state.",
        verification:
          "Derive frontiers for multiple completion states while the dependency artifact remains unchanged.",
      }),
      sourced({
        id: "AC-WDA-NO-EXECUTION-001",
        statement:
          "WorkDependencyAnalysis does not assign, estimate, schedule, execute, modify code, record completion, or collect implementation evidence.",
        verification:
          "Inspect schemas, capabilities, effects, fixtures, and graph assertions for prohibited fields and effects.",
      }),
      sourced({
        id: "AC-WDA-TRACEABILITY-001",
        statement:
          "A trusted contributor derives only forward candidate dependency relationships; Core checkpoint-merges them and Gate approval activates separate authoritative scope without inverse or completion edges.",
        verification:
          "Attempt adapter graph operations, then verify projection, merge proof, replay, retirement, and approved authority.",
      }),
    ],
    nonFunctionalRequirements: [
      sourced({
        id: "NFR-WDA-DETERMINISM-001",
        category: "reliability",
        statement:
          "Routing, mechanical validation, canonical ordering, replay, and Gate commit preparation must be deterministic for exact inputs.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-WDA-ANALYZE-001", "CAP-WDA-GATE-001"],
        },
        measure:
          "Canonical output, diagnostic, route, and replay digest equality.",
        target: "100 percent equality for deterministic Core-owned behavior.",
        priority: "must",
        acceptanceCriterionIds: ["AC-WDA-DETERMINISM-001"],
      }),
    ],
    constraints: [
      sourced({
        id: "CON-WDA-PROVIDER-NEUTRAL-001",
        category: "technical",
        statement:
          "Canonical contracts and Core cannot depend on a model, Spec Kit, OpenSpec, or another analyzer product.",
        rationale: "Analysis tools must remain replaceable.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-WDA-ANALYZE-001"],
        },
        acceptanceCriterionIds: ["AC-WDA-PLUGIN-BOUNDARY-001"],
      }),
      sourced({
        id: "CON-WDA-NO-EXECUTION-001",
        category: "technical",
        statement:
          "WorkDependencyAnalysis is analysis and approval, not assignment, scheduling, or execution.",
        rationale:
          "Separate lifecycle authority prevents planned ordering from becoming an execution claim.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-WDA-ANALYZE-001", "CAP-WDA-GATE-001"],
        },
        acceptanceCriterionIds: ["AC-WDA-NO-EXECUTION-001"],
      }),
      sourced({
        id: "CON-WDA-TRACE-DIRECTION-001",
        category: "technical",
        statement:
          "Traceability stores forward dependency assertions only and derives reverse traversal at query time.",
        rationale: "One direction avoids duplicated inconsistent facts.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-WDA-ANALYZE-001", "CAP-WDA-GATE-001"],
        },
        acceptanceCriterionIds: ["AC-WDA-TRACEABILITY-001"],
      }),
    ],
    scope: [
      sourced({
        id: "SCOPE-WDA-ARTIFACTS-001",
        statement:
          "Dependency state, policy, hint-disposition, edge, finding, candidate, baseline, clarification, diagnostic, and Gate evidence artifacts.",
      }),
      sourced({
        id: "SCOPE-WDA-ANALYSIS-001",
        statement:
          "Provider-neutral dependency analysis bound to exact WorkBreakdown and upstream context.",
      }),
      sourced({
        id: "SCOPE-WDA-GATE-001",
        statement:
          "A separate Gate for graph mechanics, semantic policy, approval, and exact promotion.",
      }),
      sourced({
        id: "SCOPE-WDA-TRACEABILITY-001",
        statement:
          "A trusted contributor and candidate-to-approved authority transition.",
      }),
      sourced({
        id: "SCOPE-WDA-ADAPTERS-001",
        statement:
          "Bounded replaceable analysis manifests and conformance fixtures.",
      }),
    ],
    nonGoals: [
      sourced({
        id: "NG-WDA-ASSIGNMENT-001",
        statement: "Choose a specialist, model, agent, or human.",
        rationale: "SpecialistAssignment owns executor selection.",
      }),
      sourced({
        id: "NG-WDA-SCHEDULING-001",
        statement:
          "Persist schedules, estimates, capacity, or runtime execution waves.",
        rationale: "Scheduling depends on changing runtime state.",
      }),
      sourced({
        id: "NG-WDA-EXECUTION-001",
        statement: "Execute, implement, test, or verify a work item.",
        rationale: "Those effects belong downstream.",
      }),
      sourced({
        id: "NG-WDA-CONTROL-PLANE-001",
        statement:
          "Introduce a distributed scheduler, agent framework, provider wrapper, or general control plane.",
        rationale: "This release is an incremental module slice.",
      }),
    ],
    terminology: [
      sourced({
        id: "TERM-WDA-DEPENDENCY-DAG-001",
        term: "Work dependency DAG",
        definition:
          "A directed acyclic graph where each forward edge says one predecessor must complete before one successor may start.",
        aliases: ["Dependency graph"],
      }),
      sourced({
        id: "TERM-WDA-HINT-DISPOSITION-001",
        term: "Dependency hint disposition",
        definition:
          "The evidence-backed treatment of one non-authoritative WorkBreakdown dependency hint.",
        aliases: [],
      }),
      sourced({
        id: "TERM-WDA-RUNNABLE-FRONTIER-001",
        term: "Runnable frontier",
        definition:
          "Work items whose authoritative predecessors are complete under current runtime state.",
        aliases: ["Ready set"],
      }),
      sourced({
        id: "TERM-WDA-IMPOSSIBLE-ORDERING-001",
        term: "Impossible ordering",
        definition:
          "A dependency forbidden by exact domain, architecture, contract, repository, or policy evidence even when acyclic.",
        aliases: [],
      }),
    ],
    currentStatus: sourced({
      lifecycle: "existing",
      phase: "planning",
      summary:
        "WorkBreakdown 0.1.0 is committed. WorkDependencyAnalysis RequirementsGathering is paused on five blocking decisions before baseline promotion or ArchitectureDesign.",
    }),
    assumptions: [
      sourced({
        id: "ASM-WDA-OPERATION-LIFECYCLE-001",
        statement:
          "One full-snapshot analyze-dependencies operation is preferable to establish and change operations.",
        status: "unconfirmed",
        blocking: true,
      }),
      sourced({
        id: "ASM-WDA-TRUST-BOUNDARY-001",
        statement:
          "Adapters propose dependencies, Core validates mechanics, and the Gate independently verifies semantics and promotes.",
        status: "unconfirmed",
        blocking: true,
      }),
      sourced({
        id: "ASM-WDA-INPUT-CONTEXT-001",
        statement:
          "The analyzer receives exact requirements, architecture, contract, repository, overview, WorkBreakdown, and policy context.",
        status: "unconfirmed",
        blocking: true,
      }),
      sourced({
        id: "ASM-WDA-PARALLELISM-001",
        statement:
          "The module stores only the DAG while a downstream scheduler derives runnable frontiers.",
        status: "unconfirmed",
        blocking: true,
      }),
      sourced({
        id: "ASM-WDA-PLUGIN-SURFACE-001",
        statement:
          "V1 defines bounded Spec Kit analyze and custom OpenSpec dependency-artifact contracts without claiming live interoperability.",
        status: "unconfirmed",
        blocking: true,
      }),
    ],
    dependencies: [
      "Approved WorkBreakdown 0.1.0 and exact WorkBreakdownBaseline contract.",
      "Approved ProjectOverview, requirements, architecture, contract-disposition, and repository contracts.",
      "Generic registry, effect checkpoint, Gate replay, and TraceabilityGraph boundaries.",
      "Owner responses to the five blocking requirements questions.",
    ],
    risks: [
      "Analyzer silence could be mistaken for proof that no dependency is missing.",
      "Stored execution waves could couple static dependencies to changing runtime state.",
      "Reused task adapters could blur decomposition and dependency authority.",
      "Hidden adapter-selected context could violate deterministic invocation contracts.",
      "Ambiguous edge direction could duplicate inverse facts.",
    ],
    deliverables: [
      "Approved WorkDependencyAnalysis requirements and ProjectOverview baseline.",
      "Approved WorkDependencyAnalysis architecture.",
      "Canonical artifacts, manifest, Gate, runtime contracts, and trusted contributor.",
      "Bounded manifests, fixtures, dogfood evidence, release docs, and audit results.",
    ],
    requiredEvidence: [
      "requirements/interactive-clarification",
      "requirements/gate-promotion",
      "architecture/gate-approval",
      "dependency/graph-mechanics",
      "dependency/semantic-policy",
      "dependency/checkpoint-replay",
      "traceability/checkpoint-merge",
      "release/full-verification",
    ],
    sourceRefs: makeSourceRefs(),
  };
}

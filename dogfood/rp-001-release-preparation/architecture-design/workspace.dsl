workspace "DevRelay RP-001 ReleasePreparation and ReleaseVerification" "Profile-bound release candidate preparation, stored-byte verification, readiness, and no-publication authority" {
  !identifiers flat
  !impliedRelationships false
  properties {
    "structurizr.inspection.model.element.disconnected" "warning"
    "structurizr.inspection.model.element.noview" "warning"
  }
  model {
    e1 = softwareSystem "DevRelay" "Deterministic orchestration runtime for composable software-engineering modules." {
      properties {
        "devrelay.id" "EL-DEVRELAY-SYSTEM"
      }
      !docs architecture-docs
      !adrs architecture-adrs
      e2 = container "Generic Core" "Owns generic registration, state-derived routing, exact adapter resolution, checkpoints, replay, and progression." "Node.js" {
        properties {
          "devrelay.id" "EL-DEVRELAY-CORE"
        }
        e7 = component "Registered WorkBreakdown Preflight" "Generic guard registered on the loaded ProjectWorkBreakdownState artifact contract with its own persisted producer identity." "Registered artifact-contract guard" {
          properties {
            "devrelay.id" "EL-WB-PREFLIGHT"
          }
        }
        e13 = component "Snapshot Builder" "Builds one immutable full WorkBreakdown snapshot and verifies declared context slices." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-SNAPSHOT"
          }
        }
        e14 = component "Graph Mechanics" "Owns canonical DAG mechanics while using pinned Graphology and Graphology-DAG internally." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-GRAPH-MECHANICS"
          }
        }
        e15 = component "OPA Policy Evaluator" "Evaluates a pinned policy bundle over one canonical JSON input and normalizes the decision set." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-OPA"
          }
        }
        e16 = component "WorkDependency Gate" "Owns semantic completeness review, exact approval, and dependency-baseline promotion." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-GATE"
          }
        }
        e17 = component "Traceability Contributor" "Derives forward candidate dependency relationships after candidate validation." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-CONTRIBUTOR"
          }
        }
        e23 = component "Workflow Fact Recorder" "Derives standardized immutable run records from trusted Core transitions and Gate results." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-FACT-RECORDER"
          }
        }
        e24 = component "Integrated Completion Registry" "Stores separately approved verified integration facts without mutating the static dependency DAG." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-COMPLETION-REGISTRY"
          }
        }
        e25 = component "Ready Frontier Resolver" "Derives the current runnable work frontier from the immutable WorkDependencyBaseline and integrated completion facts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-FRONTIER-RESOLVER"
          }
        }
        e38 = component "Contract State Route Guard" "Selects the ContractGeneration operation from exact approved contract state and architecture intent." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-ROUTE-GUARD"
          }
        }
        e39 = component "Pinned Contract Validator Registry" "Runs version-pinned kind-specific format validators independently of generators." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-VALIDATOR-REGISTRY"
          }
        }
        e40 = component "Canonical Contract Differ" "Computes additions, modifications, removals, prior and target digests, and compatibility facts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-CANONICAL-DIFFER"
          }
        }
        e41 = component "Contract Gate" "Owns semantic completeness, compatibility policy, approval, and exact baseline or not-applicable promotion." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-GATE"
          }
        }
        e48 = component "Assignment Input Guard" "Validates exact approved work, dependency, catalog, policy, project, and repository inputs before extension entry." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-INPUT-GUARD"
          }
        }
        e49 = component "Core Eligibility Evaluator" "Computes the exact eligible specialist profiles for each work item from capabilities, tools, grants, and assignment policy before ranking." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-ELIGIBILITY-EVALUATOR"
          }
        }
        e50 = component "Candidate Assembler" "Validates ranker selections against the eligible sets and assembles one complete canonical assignment candidate." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-CANDIDATE-ASSEMBLER"
          }
        }
        e51 = component "Specialist Assignment Gate" "Owns semantic completeness, assignment-policy policy, approval, and exact baseline promotion." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-GATE"
          }
        }
        e58 = component "Execution Input Guard" "Validates exact work, dependency, assignment, repository, project, policy, and retry lineage before effects." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-INPUT-GUARD"
          }
        }
        e59 = component "Runnable Frontier Validator" "Derives the current runnable frontier from the static DAG and approved integrated completion facts." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-FRONTIER-VALIDATOR"
          }
        }
        e60 = component "Execution Binding Validator" "Validates the version-pinned SpecialistProfile-to-executor mapping and exact declared permission demand." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-BINDING-VALIDATOR"
          }
        }
        e61 = component "Execution Result Assembler" "Builds canonical immutable attempt, ChangeSetDraft, and ExecutionEvidenceBundle artifacts from validated executor bytes." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-RESULT-ASSEMBLER"
          }
        }
        e62 = component "Execution Checkpoint Controller" "Persists effect results before progression and replays exact attempts without reinvoking executors." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-CHECKPOINT"
          }
        }
        e68 = component "Verification Input Guard" "Binds one exact WorkItem, ExecutionAttempt, ChangeSetDraft, evidence bundle, policy, baselines, repository base, and candidate workspace." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-INPUT-GUARD"
          }
        }
        e69 = component "Verification Obligation Expander" "Deterministically expands every approved verification-plan check and required-evidence obligation." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-OBLIGATION-EXPANDER"
          }
        }
        e70 = component "Verifier Binding Validator" "Selects and validates configured verifier adapters from approved evidence kinds and policy." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-BINDING-VALIDATOR"
          }
        }
        e71 = component "Evidence Normalizer" "Normalizes checkpointed verifier bytes into canonical subject-bound evidence and explicit obligation dispositions." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-EVIDENCE-NORMALIZER"
          }
        }
        e72 = component "Verification Policy Evaluator" "Evaluates complete normalized evidence against the exact version-pinned VerificationPolicy." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-POLICY-EVALUATOR"
          }
        }
        e73 = component "WorkItemVerification Gate" "Independently validates the exact checkpointed candidate, policy result, evidence closure, and approval bytes." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-GATE"
          }
        }
        e74 = component "Verification Checkpoint Controller" "Persists raw verifier results before canonical evaluation and replays exact inputs without reinvoking adapters." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-CHECKPOINT"
          }
        }
        e80 = component "Integration Input Guard" "Binds one approved WorkItemVerification result, verified change, target snapshot, target ref, expected commit, policy, baselines, and grants." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-INPUT-GUARD"
          }
        }
        e81 = component "Integration Plan Builder" "Builds a deterministic immutable plan for one verified change and one target transition." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-PLAN-BUILDER"
          }
        }
        e82 = component "Target Ref Compare-and-Swap Coordinator" "Owns target-state authority and requires an atomic conditional ref update through the host boundary." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-CAS-COORDINATOR"
          }
        }
        e83 = component "Integration Checkpoint Controller" "Persists prepared plans and native effect receipts and recovers uncertain effects without duplicate mutation." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-CHECKPOINT"
          }
        }
        e84 = component "Integration Result Validator" "Normalizes adapter observations into closed canonical integration outcomes." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-RESULT-VALIDATOR"
          }
        }
        e90 = component "Discovery Route Guard" "Selects discovery only from exact existing-undiscovered project state." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-ROUTER"
          }
        }
        e91 = component "Discovery Input and Privacy Guard" "Binds exact project, repository, policy, adapter-chain, options, and grant inputs." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-INPUT-GUARD"
          }
        }
        e92 = component "Discovery Observation Normalizer" "Normalizes inventory and analyzer observations into provider-neutral current-state findings." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-NORMALIZER"
          }
        }
        e93 = component "Discovery Confidence and Gap Gate" "Evaluates material gaps separately from explicit non-blocking uncertainty." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-GAP-GATE"
          }
        }
        e94 = component "Discovery Checkpoint Controller" "Persists exact inventory and analyzer results before canonical projection." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-CHECKPOINT"
          }
        }
        e102 = component "Adaptive Interview Orchestrator" "Orders typed explore, challenge, clarify, and validate strategies while Core owns breadth-first waves, coverage, contradiction detection, and mandatory closure." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-INTERVIEW"
          }
        }
        e103 = component "Provider Toolchain Manager" "Resolves project-local checksum-pinned provider tools after explicit acquisition approval and never silently upgrades or substitutes them." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-PROVIDER-MANAGER"
          }
        }
        e104 = component "Execution Receipt Recorder" "Canonicalizes immutable local raw execution receipts and digest-bound redacted Git views for bounded provider effects." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-RECEIPT-RECORDER"
          }
        }
        e105 = component "Local Performance Metrics Recorder" "Attaches host-observed cycle, retry, test, cache, change, receipt, token, and tool metrics to ModuleExecutionRecord without inventing unavailable values." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-METRICS"
          }
        }
        e117 = component "DevRelay Public Facade" "Presents eight ordinary lifecycle operations while delegating every authority-bearing decision to existing Core services." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-FACADE"
          }
        }
        e118 = component "Workflow Profile Resolver" "Resolves quick, standard, assurance, or inspect into one immutable explicit policy without bypassing Core validation or applicable Gates." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-PROFILES"
          }
        }
        e119 = component "API Tier Boundary" "Enforces root facade, advanced subpath, compat/v1, and optional-pack import boundaries before any physical package split." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-API-BOUNDARY"
          }
        }
        e120 = component "Prerelease Compatibility Adapter" "Maps displaced prerelease APIs through compat/v1 for one release cycle with explicit deprecation and migration metadata." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-COMPAT"
          }
        }
        e134 = component "Roadmap Gate" "Validates exact candidate bytes, coverage, recommendation, replay, owner approval, and baseline drift before atomic promotion." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-ROADMAP-GATE"
          }
        }
        e135 = component "Roadmap Baseline and Projection Service" "Persists the authoritative structured RoadmapBaseline and deterministically projects concise Roadmap.md bytes." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-BASELINE-PROJECTOR"
          }
        }
        e136 = component "DevRelay Session Bootstrap" "Loads mandatory current orientation context at the start of each fresh DevRelay task in a configured workspace." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-SESSION-BOOTSTRAP"
          }
        }
        e137 = component "Session Context Validator" "Validates required context, digest bindings, task/workspace identity, current baselines, Gate, frontier, blockers, and refresh state." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-CONTEXT-VALIDATOR"
          }
        }
        e138 = component "Roadmap Traceability Contributor" "Derives approved upstream-to-downstream roadmap and session provenance facts from validated canonical artifacts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-TRACE-CONTRIBUTOR"
          }
        }
        e145 = component "ProjectMemory Gate" "Validates exact candidate bytes, conflicts, closure, owner disposition, and baseline drift before promotion." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-GATE"
          }
        }
        e146 = component "Conclusion Coordinator" "Implements the idempotent /conclude transition for main and worker tasks." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-CONCLUDE"
          }
        }
        e147 = component "Current Synopsis Projector" "Renders CurrentSynopsis.md as a concise deterministic full-coverage projection of ProjectMemoryBaseline." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-SYNOPSIS"
          }
        }
        e148 = component "Traceability Context Projector" "Builds a bounded read-only memory context from the approved TraceabilityGraph checkpoint." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-TRACE-PROJECTOR"
          }
        }
        e149 = component "Memory Traceability Contributor" "Derives approved memory lineage and supersession relationships from promoted canonical artifacts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-TRACE-CONTRIBUTOR"
          }
        }
        e157 = component "Environment Operation Router" "Selects establish-environment, prepare-frontier, revalidate-frontier, or remediate-drift from exact project state." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-ROUTER"
          }
        }
        e158 = component "Environment Fingerprint Service" "Derives profile-scoped redacted fingerprints from validated current facts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-FINGERPRINT"
          }
        }
        e159 = component "Environment Effect Checkpoint Controller" "Durably checkpoints preparation effects and replays exact results without repeated mutations." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-CHECKPOINT"
          }
        }
        e160 = component "Environment Verification Gate" "Evaluates exact current evidence and policy and alone authorizes the bound WorkExecution attempt." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-GATE"
          }
        }
        e161 = component "Execution Readiness Binder" "Binds an approved readiness receipt to one ready frontier and execution attempt." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-READINESS-BINDER"
          }
        }
        e162 = component "Environment Traceability Contributor" "Projects approved forward profile, work, readiness, and execution relationships." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-TRACE-CONTRIBUTOR"
          }
        }
        e164 = component "SystemVerification Contract Boundary" "Represents the exact passing SystemVerification result consumed by RP-001 without claiming that the SystemVerification implementation is delivered by this change." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-SYSTEM-VERIFICATION-BOUNDARY"
          }
        }
        e165 = component "BusinessAcceptance Contract Boundary" "Represents the downstream BusinessAcceptance input boundary without claiming that BusinessAcceptance implementation is delivered by this change." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-BUSINESS-ACCEPTANCE-BOUNDARY"
          }
        }
        e170 = component "Release Operation Router" "Selects prepare-candidate, verify-candidate, resume-candidate, or approved-not-applicable from exact state after SystemVerification." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-ROUTER"
          }
        }
        e171 = component "Release Effect Checkpoint Controller" "Durably checkpoints exact prepared candidate outputs before merge or external effect and replays without repeated work." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-CHECKPOINT"
          }
        }
        e172 = component "Stored Candidate Byte Verifier" "Reloads content-addressed candidate bytes and expands the versioned release verification obligations." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-STORED-BYTE-VERIFIER"
          }
        }
        e173 = component "Release Verification Gate" "Evaluates exact candidate, policy, evidence, maturity, and owner intent and alone activates release readiness before BusinessAcceptance." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-GATE"
          }
        }
        e174 = component "Release Readiness Summary Projector" "Projects one compact Desktop summary of candidate identity, artifacts, coverage, blockers, warnings, effects, and evidence links." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-SUMMARY"
          }
        }
        e175 = component "Release Traceability Contributor" "Projects candidate and approved forward release relationships from already validated canonical artifacts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-TRACE-CONTRIBUTOR"
          }
        }
      }
      e3 = container "TraceabilityGraph" "Core-owned sidecar for trusted lifecycle traceability contributions and atomic merge proofs." "Provider-neutral graph contract" {
        properties {
          "devrelay.id" "EL-DEVRELAY-GRAPH"
        }
        e9 = component "WorkBreakdown Traceability Contributor" "Trusted projector of validated candidate work items into limited planning relationships." "Trusted versioned contributor" {
          properties {
            "devrelay.id" "EL-WB-CONTRIBUTOR"
          }
        }
        e10 = component "Approved Baseline Observers" "Replays approved RequirementsBaseline, ArchitectureBaseline, and applicable ContractBaseline graph contributions before WorkBreakdown candidate edges." "Trusted observer contracts" {
          properties {
            "devrelay.id" "EL-WB-OBSERVERS"
          }
        }
        e42 = component "Contract Candidate Traceability Contributor" "Projects validated candidate contract relationships without making them authoritative." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-CANDIDATE-CONTRIBUTOR"
          }
        }
        e43 = component "Approved Contract Baseline Observer" "Projects active contract facts only from an exact ContractGate promotion proof." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-APPROVED-OBSERVER"
          }
        }
        e52 = component "Assignment Candidate Traceability Contributor" "Projects validated candidate assignment relationships without making them authoritative." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-CANDIDATE-CONTRIBUTOR"
          }
        }
        e53 = component "Approved Assignment Baseline Observer" "Projects active assignment facts only from an exact SpecialistAssignmentGate promotion proof." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-APPROVED-CONTRIBUTOR"
          }
        }
        e63 = component "Execution Attempt Traceability Contributor" "Projects attempted-by and produces relationships from validated execution artifacts only." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-TRACEABILITY-CONTRIBUTOR"
          }
        }
        e75 = component "Verification Candidate Traceability Contributor" "Projects candidate verification-attempt relationships from validated canonical artifacts only." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-CANDIDATE-TRACE"
          }
        }
        e76 = component "Approved Verification Traceability Contributor" "Projects approved evidence relationships only after exact Gate approval." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-APPROVED-TRACE"
          }
        }
        e85 = component "Integrated Change Traceability Contributor" "Projects factual integration relationships only from a validated IntegratedChangeRecord." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-TRACEABILITY"
          }
        }
        e95 = component "Current Architecture Traceability Contributor" "Projects validated observational current-state lineage without approved-design claims." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-TRACEABILITY"
          }
        }
        e106 = component "Read-only Trace Query Service" "Answers provenance, coverage, evidence, impact, and orphan questions from approved graph state using compact deterministic paths." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-TRACE-QUERY"
          }
        }
      }
      e4 = container "WorkBreakdown Module" "Converts exact approved scope into bounded, traceable, independently executable and verifiable work-item candidates." "JSON Schema and JavaScript" {
        properties {
          "devrelay.id" "EL-WB-MODULE"
        }
        e5 = component "Context-neutral Upstream Validators" "Composes schema and semantic validators for requirements, project overview, architecture, contract, repository, and capability inputs without reusing ArchitectureDesign operation-specific runtime contracts." "JavaScript validation contracts" {
          properties {
            "devrelay.id" "EL-WB-VALIDATORS"
          }
        }
        e6 = component "Configured Planning Adapter Port" "Provider-neutral port for one bounded work-decomposition capability selected by configuration." "Agent-command bridge" {
          properties {
            "devrelay.id" "EL-WB-ADAPTER-PORT"
          }
        }
        e8 = component "WorkBreakdown Gate" "Derives the authoritative coverage universe, resolves evidence, owns no-work approval, and promotes approved planned work." "Deterministic gate policy" {
          properties {
            "devrelay.id" "EL-WB-GATE"
          }
        }
      }
      e11 = container "Downstream Work Modules" "WorkDependencyAnalysis, SpecialistAssignment, WorkExecution, and Verification own ordering, assignment, execution, and proof." "Future provider-neutral modules" {
        properties {
          "devrelay.id" "EL-WB-DOWNSTREAM"
        }
      }
      e12 = container "WorkDependencyAnalysis" "Coordinates one complete static dependency-analysis candidate without assigning or executing work." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-WDA-MODULE"
        }
        e18 = component "Dependency Proposal Port" "Admits the native structured proposer or an optional configured proposal adapter through one contract." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-PROPOSER-PORT"
          }
        }
        e19 = component "Native Structured Proposer" "Default provider-neutral proposer over the complete snapshot and declared context slices." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-NATIVE-PROPOSER"
          }
        }
        e20 = component "Optional Adapter Bridge" "Task Master and OpenSpec bindings that may propose only the canonical DependencyProposal." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-OPTIONAL-PROPOSERS"
          }
        }
        e21 = component "Spec Kit Consistency Reviewer" "Advisory consistency and coverage reviewer over the normalized proposal." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-WDA-SPECKIT-REVIEWER"
          }
        }
      }
      e22 = container "Lifecycle Reporting" "Cross-cutting operational history and human-readable projection without workflow authority." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-RUN-REPORTING"
        }
        e26 = component "Run Ledger Store" "Append-only content-addressed store for trusted workflow records and explicitly non-authoritative observations." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-LEDGER"
          }
        }
        e27 = component "Host Observation Ingress" "Admits sourced timing, wait, call, token, cost, retry, and replay observations without workflow authority." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-OBSERVATION-INGRESS"
          }
        }
        e28 = component "Adapter Maturity Resolver" "Resolves evidence-backed adapter binding maturity separately from Core-owned implementations." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-MATURITY-RESOLVER"
          }
        }
        e29 = component "Run Comparability Evaluator" "Allows relative performance claims only for explicitly comparable executions." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-COMPARABILITY"
          }
        }
        e30 = component "Lifecycle Snapshot Projector" "Purely projects the run ledger, graph checkpoint, maturity evidence, and policy results into one canonical snapshot." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-SNAPSHOT-PROJECTOR"
          }
        }
        e31 = component "Report Content Policy" "Applies deterministic allow, omit, and redact dispositions before human-readable projection." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-CONTENT-POLICY"
          }
        }
        e32 = component "Lifecycle Markdown Renderer" "Renders byte-deterministic LifecycleRunReport.md from one validated canonical snapshot." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-MARKDOWN-RENDERER"
          }
        }
        e33 = component "Report Access Port" "Exposes the exact structured snapshot, Markdown report, and linked evidence to IDE and host consumers." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RUN-REPORT-PORT"
          }
        }
      }
      e34 = container "ContractGeneration" "Generates typed machine-readable contract candidates through configured replaceable adapters without owning approval." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-CG-MODULE"
        }
        e35 = component "Contract Generator Port" "Provider-neutral adapter boundary for generating typed contract candidates from exact interface intent." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-GENERATOR-PORT"
          }
        }
        e36 = component "JSON Schema Generator Binding" "V1 live-conformant binding for JSON Schema draft 2020-12 generation." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-JSON-SCHEMA-ADAPTER"
          }
        }
        e37 = component "Optional Contract Adapter Bridge" "Shared bounded port for OpenAPI, AsyncAPI, Protobuf, and future contract generators." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-CG-OPTIONAL-ADAPTERS"
          }
        }
      }
      e44 = container "SpecialistAssignment" "Produces one complete typed assignment candidate by combining Core-approved eligibility sets with configured replaceable ranking, without owning approval." "Provider-neutral DevRelay assignment" {
        properties {
          "devrelay.id" "EL-SA-MODULE"
        }
        e45 = component "Specialist Ranker Port" "Provider-neutral ranker boundary that accepts only Core-computed eligible profile sets for exact work items." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-RANKER-PORT"
          }
        }
        e46 = component "Native Structured Ranker" "V1 deterministic default ranker over Core-supplied eligible profile sets." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-NATIVE-RANKER"
          }
        }
        e47 = component "Optional Ranker Adapter Bridge" "Shared bounded port for optional policy-aware or future ranking implementations." "Provider-neutral DevRelay assignment" {
          properties {
            "devrelay.id" "EL-SA-OPTIONAL-ADAPTERS"
          }
        }
      }
      e54 = container "WorkExecution" "Executes one Core-selected runnable work item per immutable attempt through a provider-neutral executor port." "Provider-neutral DevRelay execution" {
        properties {
          "devrelay.id" "EL-WE-MODULE"
        }
        e55 = component "Executor Port" "Provider-neutral boundary for one exact execution attempt." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-EXECUTOR-PORT"
          }
        }
        e56 = component "Codex Task Executor Adapter" "First dogfood binding that maps one attempt to one user-visible Codex task and preserves its structured handoff." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-CODEX-TASK-ADAPTER"
          }
        }
        e57 = component "A2A Executor Adapter" "Optional binding that performs the same attempt contract through a version-pinned A2A agent endpoint." "Provider-neutral DevRelay execution" {
          properties {
            "devrelay.id" "EL-WE-A2A-EXECUTOR-ADAPTER"
          }
        }
      }
      e64 = container "WorkItemVerification" "Verifies one exact immutable WorkExecution result against approved obligations and prepares a Gate candidate without integration authority." "Provider-neutral DevRelay verification" {
        properties {
          "devrelay.id" "EL-WIV-MODULE"
        }
        e65 = component "Verifier Port" "Provider-neutral boundary for evidence-producing verifier adapters." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-VERIFIER-PORT"
          }
        }
        e66 = component "Test Verifier Adapter" "Runs configured test capabilities and returns subject-bound raw evidence." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-TEST-ADAPTER"
          }
        }
        e67 = component "Review Verifier Adapter" "Runs configured static, security, documentation, or human-review capabilities through the same evidence contract." "Provider-neutral DevRelay verification" {
          properties {
            "devrelay.id" "EL-WIV-REVIEW-ADAPTER"
          }
        }
      }
      e77 = container "ChangeIntegration" "Incorporates one exactly verified work-item change into one configured local Git target without system-verification or business-acceptance authority." "Provider-neutral DevRelay integration" {
        properties {
          "devrelay.id" "EL-CI-MODULE"
        }
        e78 = component "Integration Adapter Port" "Provider-neutral boundary for one bounded repository integration effect." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-INTEGRATION-PORT"
          }
        }
        e79 = component "Local Git Integration Adapter" "V1 adapter that applies one verified change and conditionally updates one configured local Git ref." "Provider-neutral DevRelay integration" {
          properties {
            "devrelay.id" "EL-CI-LOCAL-GIT-ADAPTER"
          }
        }
        e107 = component "Two-phase Evidence Seal Coordinator" "Separates the implementation commit from a later evidence-sealing commit so neither commit embeds its own identity." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-EVIDENCE-SEAL"
          }
        }
      }
      e86 = container "ArchitectureDiscovery" "Conditionally discovers implemented architecture for an existing repository lacking an approved baseline or valid current snapshot." "Provider-neutral DevRelay discovery" {
        properties {
          "devrelay.id" "EL-AD-MODULE"
        }
        e87 = component "Repository Inventory Port" "Provider-neutral boundary for the mandatory deterministic local repository inventory." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-INVENTORY-PORT"
          }
        }
        e88 = component "Native Repository Inventory Adapter" "Live V1 local adapter that inventories tracked or explicitly declared repository inputs deterministically." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-NATIVE-INVENTORY"
          }
        }
        e89 = component "Optional Architecture Analyzer Port" "Bounded contributor port for tools such as dependency-cruiser, SCIP, or future analyzers." "Provider-neutral DevRelay discovery" {
          properties {
            "devrelay.id" "EL-AD-ANALYZER-PORT"
          }
        }
      }
      e96 = container "Release Tooling" "Deterministically materializes and verifies the GitHub source/library release candidate without becoming lifecycle authority." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-REL-TOOLING"
        }
        e97 = component "Package Export Projector" "Derives the complete fixed and wildcard public-subpath inventory directly from package.json exports." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-REL-EXPORT-PROJECTOR"
          }
        }
        e98 = component "Tarball Materializer" "Builds the exact installable GitHub release tarball from the approved source candidate." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-REL-TARBALL-MATERIALIZER"
          }
        }
        e99 = component "Installed Package Verifier" "Installs the tarball into a clean consumer and exercises every declared public subpath." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-REL-INSTALLED-VERIFIER"
          }
        }
        e100 = component "Release Evidence Assembler" "Assembles exact catalog, checksums, test results, installed-consumer evidence, governance evidence, and dogfood receipts." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-REL-EVIDENCE-ASSEMBLER"
          }
        }
        e101 = component "GitHub Promotion Adapter" "Projects an approved release candidate into GitHub source, protected-main, and release-asset operations enforced by the host." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-REL-GITHUB-PROMOTION"
          }
        }
        e121 = component "Release Evidence Asset Publisher" "Publishes full immutable evidence as checksum-bound GitHub Release assets while Git retains compact summaries, fixtures, manifests, and checksums." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-EVIDENCE-ASSET"
          }
        }
      }
      e108 = container "Live Provider Adapters" "Hosts bounded live specification, architecture-modeling, and decision-recording adapters without owning workflow progression." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-MQ-LIVE-PROVIDERS"
        }
        e109 = component "Specification Provider Adapters" "Executes bounded OpenSpec and Spec Kit operations and evaluates BMAD, GSD, and Superpowers only as typed requirements strategies." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-SPEC-PROVIDERS"
          }
        }
        e110 = component "Architecture Provider Adapters" "Runs current Structurizr validation, inspection, and export plus template-pinned MADR rendering and validation." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-ARCH-PROVIDERS"
          }
        }
      }
      e111 = container "ChatGPT Desktop Skills" "Provides repository-scoped DevRelay operator guidance for Windows Desktop without acquiring Module, Gate, or graph authority." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-MQ-DESKTOP-SKILLS"
        }
        e112 = component "Repository Skill Bridge" "Maps devrelay-cycle, devrelay-godot-release, devrelay-plugin-conformance, and devrelay-trace-query guidance to released library operations." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-SKILL-BRIDGE"
          }
        }
      }
      e113 = container "Optional Godot Engineering Pack" "Adds Godot-specific inspection, execution, testing, export, screenshots, and receipts without adding a Godot dependency to Generic Core." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-MQ-GODOT-PACK"
        }
        e114 = component "Godot AI MCP Adapter" "Provides capability-granted scene inspection, input simulation, screenshots, execution, and log observations through a bounded MCP adapter." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-GODOT-MCP"
          }
        }
        e115 = component "GdUnit4 Verification Adapter" "Collects structured focused, full, scene, fuzz, flake, soak, JUnit, export, and exported-build smoke evidence." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-GDUNIT4"
          }
        }
        e116 = component "Godot Compatibility Registry" "Publishes only version combinations backed by pinned live conformance and end-to-end evidence." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-MQ-GODOT-COMPAT"
          }
        }
      }
      e122 = container "Windows Local Reference Host" "Provides the durable operator and executor boundary beneath ChatGPT Desktop on Windows." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-SIM-LOCAL-HOST"
        }
        e123 = component "SQLite State Store" "Persists runs, transitions, approvals, checkpoints, graph references, leases, and schema migrations transactionally." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-STATE"
          }
        }
        e124 = component "Content-addressed Artifact Store" "Stores exact immutable artifact bytes by digest and verifies media type, size, provenance, and retrieval identity." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-ARTIFACTS"
          }
        }
        e125 = component "Isolated Worktree Manager" "Creates exact Git worktrees for bounded work items and reconciles their base, candidate, and cleanup state." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-WORKSPACES"
          }
        }
        e126 = component "Capability Grant Enforcer" "Enforces declared filesystem, process, network, and secret grants at the host effect boundary." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-GRANTS"
          }
        }
        e127 = component "Desktop Executor Binding" "Binds one exact ChatGPT Desktop/Codex executor identity and its declared capabilities to an authorized work item." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-EXECUTOR"
          }
        }
        e128 = component "Run Recovery Coordinator" "Reconciles state, artifact, graph, worktree, effect, and Git commit boundaries after interruption without duplicating completed effects." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-RECOVERY"
          }
        }
        e129 = component "Deterministic Operator CLI" "Exposes init, run, resume, status, verify, inspect, and evidence commands with stable machine-readable output and exit codes." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-SIM-HOST-CLI"
          }
        }
      }
      e130 = container "RoadmapManagement" "Cross-cutting semantic module for deterministic roadmap review, candidate triage, and reprioritization without construction-stage or scheduling authority." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-RM-ROADMAP-MANAGEMENT"
        }
        e131 = component "Roadmap Operation Router" "Selects triage-candidate, review-roadmap, or reprioritize from the explicit invocation and current roadmap disposition." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-ROUTER"
          }
        }
        e132 = component "Native Structured Roadmap Proposer" "Produces provider-neutral roadmap proposals, deterministic priority facts, and exactly one disposition recommendation." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-NATIVE-PROPOSER"
          }
        }
        e133 = component "Optional Planning Adapter Bridge" "Normalizes proposals from optional external planning systems without granting them roadmap or workflow authority." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RM-OPTIONAL-ADAPTERS"
          }
        }
      }
      e139 = container "ProjectMemory" "Cross-cutting semantic module for exact project context retrieval and candidate memory updates." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-PM-PROJECT-MEMORY"
        }
        e140 = component "Memory Operation Router" "Selects load-context, propose-update, refresh-context, or conclude-session from explicit state and invocation." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-ROUTER"
          }
        }
        e141 = component "Native Memory Baseline Engine" "Reads exact local baselines and creates canonical candidate deltas." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-NATIVE-ENGINE"
          }
        }
        e142 = component "Memory Provider Port" "Defines bounded retrieval and indexing capabilities for replaceable providers." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-PROVIDER-PORT"
          }
        }
        e143 = component "Mem0 Adapter" "Uses Mem0 for derived local session and module-scoped retrieval/indexing without authoritative storage or graph access." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-MEM0-ADAPTER"
          }
        }
        e144 = component "Memory Context Assembler" "Combines authoritative project memory, recent session context, provider retrieval, and trace projection into one bounded handoff." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-PM-CONTEXT-ASSEMBLER"
          }
        }
      }
      e150 = container "EnvironmentPreparation" "Semantic module that resolves profiles, inventories state, and proposes or performs capability-gated preparation without readiness authority." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-EP-MODULE"
        }
        e151 = component "Environment Profile Resolver" "Resolves approved host and named project profiles against work and assignment context." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-PROFILE-RESOLVER"
          }
        }
        e152 = component "Environment Inventory Port" "Defines bounded provider-neutral environment observation capabilities." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-INVENTORY-PORT"
          }
        }
        e153 = component "Native Windows Inventory Adapter" "Inventories the controlled Windows Desktop host and project-local toolchain without implying arbitrary target support." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-NATIVE-WINDOWS-INVENTORY"
          }
        }
        e154 = component "Environment Preparation Planner" "Builds one deterministic consolidated plan for all required gaps." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-PREPARATION-PLANNER"
          }
        }
        e155 = component "Environment Capability Adapter Bridge" "Binds optional acquire, configure, service-check, and target-probe adapters by capability rather than product identity." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-CAPABILITY-BRIDGE"
          }
        }
        e156 = component "Environment Evidence Assembler" "Normalizes redacted observation and effect receipts into the candidate preparation result." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-EP-EVIDENCE-ASSEMBLER"
          }
        }
      }
      e163 = container "ReleasePreparation" "Conditional semantic module that binds approved state, materializes one exact source/library candidate, and proposes verification evidence without publication authority." "Provider-neutral DevRelay contract" {
        properties {
          "devrelay.id" "EL-RP-MODULE"
        }
        e166 = component "Release Candidate Identity Resolver" "Resolves exact source, project baselines, version, configuration, toolchain, policy, and environment readiness into one immutable attempt identity." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-IDENTITY"
          }
        }
        e167 = component "Release Materializer Port" "Defines bounded provider-neutral candidate materialization capabilities." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-MATERIALIZER-PORT"
          }
        }
        e168 = component "Native Node and Windows Release Adapter" "Catalogs, packs, hashes, builds the SBOM, and verifies installed-package behavior on the controlled Windows Desktop host." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-NATIVE-WINDOWS"
          }
        }
        e169 = component "Release Evidence Assembler" "Normalizes materialization and verification observations into compact redacted evidence bound to stored candidate bytes." "Provider-neutral DevRelay contract" {
          properties {
            "devrelay.id" "EL-RP-EVIDENCE"
          }
        }
      }
    }
    e2 -> e3 "Submits checkpointed updates from trusted contributors." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CORE-GRAPH"
      }
    }
    e2 -> e4 "Derives establish-breakdown or decompose-change from loaded trusted project state." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CORE-WB-ROUTE"
      }
    }
    e7 -> e6 "Allows adapter entry only when exact lineage and drift checks pass." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PREFLIGHT-ADAPTER"
      }
    }
    e8 -> e11 "Releases only an approved WorkBreakdownBaseline or applied change set." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-GATE-DOWNSTREAM"
      }
    }
    e2 -> e9 "Invokes the trusted contributor only for a validated canonical candidate." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CORE-CONTRIBUTOR"
      }
    }
    e2 -> e12 "Executes the registered provider-neutral WorkDependencyAnalysis contract." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CORE-WDA"
      }
    }
    e4 -> e12 "Supplies one exact approved WorkBreakdownBaseline for analysis." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WB-WDA"
      }
    }
    e12 -> e3 "Submits only trusted checkpointed dependency traceability updates." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WDA-GRAPH"
      }
    }
    e12 -> e11 "Releases only an approved static dependency DAG to SpecialistAssignment." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WDA-DOWNSTREAM"
      }
    }
    e13 -> e18 "Provides the complete snapshot and only declared pinned context slices." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SNAPSHOT-PROPOSER"
      }
    }
    e18 -> e19 "Dispatches to the default native structured proposer." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PROPOSER-NATIVE"
      }
    }
    e18 -> e20 "Dispatches to the configured optional adapter bridge when selected." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PROPOSER-OPTIONAL"
      }
    }
    e18 -> e14 "Submits a normalized proposal for Core-owned structural validation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PROPOSER-MECHANICS"
      }
    }
    e14 -> e15 "Supplies the canonical graph and mechanical diagnostics for pinned policy evaluation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MECHANICS-OPA"
      }
    }
    e18 -> e21 "Requests an advisory cross-artifact consistency review." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PROPOSER-REVIEWER"
      }
    }
    e14 -> e16 "Supplies canonical graph mechanics and cycle evidence." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MECHANICS-GATE"
      }
    }
    e15 -> e16 "Supplies normalized pinned policy decisions and raw-result evidence." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-OPA-GATE"
      }
    }
    e21 -> e16 "Supplies bounded advisory findings without approval authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-REVIEWER-GATE"
      }
    }
    e16 -> e17 "Supplies a validated exact candidate for deterministic graph projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-GATE-CONTRIBUTOR"
      }
    }
    e17 -> e3 "Submits checkpointed forward candidate relationships for atomic merge." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WDA-CONTRIBUTOR-GRAPH"
      }
    }
    e2 -> e22 "Supplies trusted standardized lifecycle facts without granting reporting progression authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CORE-RUN-REPORTING"
      }
    }
    e3 -> e22 "Supplies one exact TraceabilityGraph checkpoint for read-only report projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-GRAPH-RUN-REPORTING"
      }
    }
    e23 -> e26 "Appends trusted content-addressed module, Gate, checkpoint, approval, and progression records." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-FACTS-LEDGER"
      }
    }
    e27 -> e26 "Appends sourced non-authoritative host observations with explicit availability dispositions." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-OBSERVATIONS-LEDGER"
      }
    }
    e26 -> e30 "Supplies one exact run lineage and observation set." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-LEDGER-PROJECTOR"
      }
    }
    e3 -> e30 "Supplies one exact graph snapshot and deterministic query results." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-GRAPH-PROJECTOR"
      }
    }
    e28 -> e30 "Supplies evidence-backed adapter binding and Core implementation maturity." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-MATURITY-PROJECTOR"
      }
    }
    e29 -> e30 "Supplies explicit comparable or non-comparable dispositions." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-COMPARABILITY-PROJECTOR"
      }
    }
    e30 -> e31 "Submits the canonical report field set for deterministic content policy." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-PROJECTOR-POLICY"
      }
    }
    e31 -> e32 "Supplies an allowed or explicitly redacted canonical snapshot." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-POLICY-RENDERER"
      }
    }
    e32 -> e33 "Publishes the exact Markdown report and structured snapshot references." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-RENDERER-PORT"
      }
    }
    e11 -> e24 "Submits only verified integrated-completion facts from ChangeIntegration." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-INTEGRATION-COMPLETION"
      }
    }
    e24 -> e25 "Supplies the exact separately approved completion fact set." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-COMPLETION-FRONTIER"
      }
    }
    e12 -> e25 "Supplies the immutable approved WorkDependencyBaseline DAG." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-DAG-FRONTIER"
      }
    }
    e25 -> e11 "Releases only the currently derived dependency-ready work-item frontier." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RUN-FRONTIER-DOWNSTREAM"
      }
    }
    e38 -> e35 "Supplies the state-selected operation and exact configured generator binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-ROUTE-INVOKE"
      }
    }
    e35 -> e36 "Invokes the declared JSON Schema 2020-12 generator binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-JSON-SCHEMA-PORT"
      }
    }
    e35 -> e37 "Invokes one configured optional contract-kind generator through the same semantic port." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-OPTIONAL-PORT"
      }
    }
    e35 -> e39 "Submits canonical draft entries and native bytes for independent format validation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-PORT-VALIDATOR"
      }
    }
    e39 -> e40 "Supplies only validated normalized entries for exact baseline comparison." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-VALIDATOR-DIFFER"
      }
    }
    e40 -> e41 "Supplies canonical change facts and compatibility evidence for Gate policy." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-DIFFER-GATE"
      }
    }
    e39 -> e41 "Supplies format validation evidence for semantic completeness review." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-VALIDATOR-GATE"
      }
    }
    e35 -> e42 "Supplies the validated candidate result for non-authoritative traceability projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-CANDIDATE-TRACE"
      }
    }
    e41 -> e43 "Supplies exact ContractGate promotion proof for active contract projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-GATE-APPROVED-TRACE"
      }
    }
    e41 -> e4 "Releases WorkBreakdown only with an approved ContractBaseline or ApprovedNotApplicable disposition." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CG-GATE-WORK-BREAKDOWN"
      }
    }
    e48 -> e45 "Supplies the state-selected operation and exact configured ranker binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-ROUTE-INVOKE"
      }
    }
    e45 -> e46 "Invokes the declared native structured ranking ranker binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-NATIVE-RANKER-PORT"
      }
    }
    e45 -> e47 "Invokes one configured optional profile-capability ranker through the same semantic port." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-OPTIONAL-PORT"
      }
    }
    e45 -> e49 "Submits canonical draft entries and native bytes for independent eligibility validation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-RANKER-ELIGIBILITY"
      }
    }
    e49 -> e50 "Supplies only validated normalized entries for exact baseline comparison." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-ELIGIBILITY-ASSEMBLER"
      }
    }
    e50 -> e51 "Supplies canonical change facts and assignment-policy evidence for Gate policy." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-ASSEMBLER-GATE"
      }
    }
    e49 -> e51 "Supplies eligibility validation evidence for semantic completeness review." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-ELIGIBILITY-GATE"
      }
    }
    e45 -> e52 "Supplies the validated candidate result for non-authoritative traceability projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-CANDIDATE-TRACE"
      }
    }
    e51 -> e53 "Supplies exact SpecialistAssignmentGate promotion proof for active assignment projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-GATE-APPROVED-TRACE"
      }
    }
    e51 -> e12 "Supplies the approved complete assignment baseline for dependency-ordered WorkExecution frontier calculation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SA-GATE-WORK-EXECUTION"
      }
    }
    e58 -> e59 "Requests readiness proof for the exact work item." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-GUARD-FRONTIER"
      }
    }
    e59 -> e60 "Releases only a readiness-approved work item for binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-FRONTIER-BINDING"
      }
    }
    e60 -> e55 "Supplies one exact validated execution binding and permission demand." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-BINDING-PORT"
      }
    }
    e55 -> e56 "Invokes one user-visible Codex task through the common executor contract." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-PORT-CODEX"
      }
    }
    e55 -> e57 "Optionally invokes a version-pinned A2A agent through the same contract." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-PORT-A2A"
      }
    }
    e55 -> e62 "Persists exact effect bytes before canonical progression." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-PORT-CHECKPOINT"
      }
    }
    e62 -> e61 "Supplies replay-verified executor bytes for canonical assembly." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-CHECKPOINT-ASSEMBLER"
      }
    }
    e61 -> e63 "Supplies validated attempt and proposed change artifacts for candidate traceability." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WE-ASSEMBLER-TRACE"
      }
    }
    e68 -> e69 "Releases one exact verified subject for deterministic obligation expansion." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-GUARD-OBLIGATIONS"
      }
    }
    e69 -> e70 "Supplies the complete obligation set for deterministic verifier selection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-OBLIGATIONS-BINDING"
      }
    }
    e70 -> e65 "Supplies exact validated verifier bindings, obligation partitions, and permission demand." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-BINDING-PORT"
      }
    }
    e65 -> e66 "Invokes configured test evidence capabilities." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-PORT-TEST"
      }
    }
    e65 -> e67 "Invokes configured review evidence capabilities." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-PORT-REVIEW"
      }
    }
    e65 -> e74 "Persists exact effect bytes before canonical evaluation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-PORT-CHECKPOINT"
      }
    }
    e74 -> e71 "Supplies replay-verified raw results for evidence normalization." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-CHECKPOINT-NORMALIZER"
      }
    }
    e71 -> e72 "Supplies complete subject-bound evidence and obligation dispositions." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-NORMALIZER-POLICY"
      }
    }
    e72 -> e73 "Supplies the closed policy disposition and exact candidate." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-POLICY-GATE"
      }
    }
    e71 -> e75 "Supplies validated attempt and evidence provenance for candidate traceability." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-NORMALIZER-CANDIDATE-TRACE"
      }
    }
    e73 -> e76 "Supplies exact Gate approval for approved verification evidence projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-WIV-GATE-APPROVED-TRACE"
      }
    }
    e80 -> e81 "Releases one exact approved verification subject for deterministic integration planning." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-GUARD-PLAN"
      }
    }
    e81 -> e82 "Supplies the exact target ref, expected commit, policy, and idempotency identity." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-PLAN-CAS"
      }
    }
    e82 -> e78 "Authorizes one bounded conditional integration attempt only when target pre-state matches." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-CAS-PORT"
      }
    }
    e78 -> e79 "Invokes the configured local Git integration capability." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-PORT-GIT"
      }
    }
    e78 -> e83 "Persists exact effect observations before canonical success or failure projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-PORT-CHECKPOINT"
      }
    }
    e83 -> e84 "Supplies replay-verified native observations for closed outcome validation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-CHECKPOINT-VALIDATOR"
      }
    }
    e84 -> e85 "Supplies only a validated factual integrated-change record for atomic graph projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CI-VALIDATOR-TRACE"
      }
    }
    e90 -> e91 "Releases one exact existing-undiscovered project state for discovery input validation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-ROUTER-GUARD"
      }
    }
    e91 -> e87 "Authorizes the mandatory local inventory over the exact declared repository surface." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-GUARD-INVENTORY"
      }
    }
    e87 -> e88 "Invokes the version-pinned native repository inventory capability." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-INVENTORY-NATIVE"
      }
    }
    e91 -> e89 "Authorizes only configured optional analyzer context slices and grants." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-GUARD-ANALYZER"
      }
    }
    e87 -> e94 "Persists exact mandatory inventory observations before normalization." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-INVENTORY-CHECKPOINT"
      }
    }
    e89 -> e94 "Persists each bounded analyzer result or failure before normalization." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-ANALYZER-CHECKPOINT"
      }
    }
    e94 -> e92 "Supplies replay-verified native observations for canonical current-state normalization." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-CHECKPOINT-NORMALIZER"
      }
    }
    e92 -> e93 "Supplies explicit findings, confidence, contradictions, unknowns, and candidate gaps." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-NORMALIZER-GAP"
      }
    }
    e93 -> e95 "Supplies only a validated non-blocking observational snapshot for traceability projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-AD-GAP-TRACE"
      }
    }
    e2 -> e96 "Supplies exact approved lifecycle, source, and acceptance identities without delegating Gate authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-CORE-RELEASE-TOOLING"
      }
    }
    e97 -> e98 "Supplies the canonical expanded public export inventory." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-REL-EXPORT-TARBALL"
      }
    }
    e98 -> e99 "Supplies the exact candidate tarball for isolated installation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-REL-TARBALL-VERIFY"
      }
    }
    e99 -> e100 "Supplies exact Windows and Node installed-consumer results." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-REL-VERIFY-EVIDENCE"
      }
    }
    e100 -> e101 "Supplies the exact accepted release evidence and exclusions." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-REL-EVIDENCE-PROMOTION"
      }
    }
    e102 -> e109 "Invokes only configured typed strategy roles and retains Core-owned closure." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-INTERVIEW-PROVIDERS"
      }
    }
    e103 -> e109 "Supplies an approved checksum-verified project-local provider binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-PROVIDER-SPEC"
      }
    }
    e103 -> e110 "Supplies an approved checksum-verified architecture tool binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-PROVIDER-ARCH"
      }
    }
    e103 -> e113 "Supplies only approved version-pinned Godot toolchain bindings." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-PROVIDER-GODOT"
      }
    }
    e108 -> e104 "Streams exact native output, process observations, and artifact identities into immutable receipts." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-PROVIDERS-RECEIPTS"
      }
    }
    e113 -> e104 "Streams granted input, screenshot, engine, test, export, and smoke evidence." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-GODOT-RECEIPTS"
      }
    }
    e104 -> e105 "Supplies exact observed durations, sizes, retries, and availability dispositions." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-RECEIPTS-METRICS"
      }
    }
    e112 -> e2 "Invokes released DevRelay operations through ChatGPT Desktop without hidden policy." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-DESKTOP-CORE"
      }
    }
    e84 -> e107 "Supplies the verified implementation commit and integration evidence after successful integration." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-CI-SEAL"
      }
    }
    e107 -> e104 "Records separate implementation and evidence-seal commit identities." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-SEAL-RECEIPT"
      }
    }
    e115 -> e116 "Contributes live-tested compatibility observations only after verification." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-MQ-GODOT-TEST-COMPAT"
      }
    }
    e117 -> e118 "Resolves one exact profile policy before lifecycle execution." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-FACADE-PROFILES"
      }
    }
    e117 -> e119 "Exposes only approved root operations and explicit advanced paths." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-FACADE-API"
      }
    }
    e120 -> e117 "Delegates compatible calls through the canonical facade and records migration diagnostics." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-COMPAT-FACADE"
      }
    }
    e129 -> e117 "Invokes the same deterministic facade used by installed library consumers." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-CLI-FACADE"
      }
    }
    e122 -> e2 "Supplies durable stores, grants, workspaces, and the exact executor without acquiring lifecycle authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-HOST-CORE"
      }
    }
    e123 -> e124 "Stores only content-addressed artifact references and validates them on every transition." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-STATE-ARTIFACTS"
      }
    }
    e126 -> e127 "Enforces exact declared grants for every executor effect." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-GRANTS-EXECUTOR"
      }
    }
    e125 -> e127 "Provides one revision-bound isolated worktree for the authorized work item." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-WORKSPACE-EXECUTOR"
      }
    }
    e128 -> e123 "Reconciles durable transaction and lease state after interruption." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-RECOVERY-STATE"
      }
    }
    e128 -> e124 "Verifies all referenced bytes before resuming or quarantining a run." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-RECOVERY-ARTIFACTS"
      }
    }
    e121 -> e124 "Packages exact full evidence and publishes a committed checksum manifest and retrieval identity." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-SIM-EVIDENCE-ARTIFACTS"
      }
    }
    e131 -> e132 "Invokes the default native proposer for the selected roadmap operation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-ROUTER-PROPOSER"
      }
    }
    e131 -> e133 "Invokes an explicitly configured optional proposer adapter when available and approved." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-ROUTER-ADAPTERS"
      }
    }
    e132 -> e134 "Submits a validated proposal and recommendation without promotion authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-PROPOSER-GATE"
      }
    }
    e134 -> e135 "Atomically promotes the approved structured baseline and matching Markdown projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-GATE-BASELINE"
      }
    }
    e136 -> e137 "Validates the complete fresh-task snapshot before issuing a passing receipt." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-BOOTSTRAP-VALIDATOR"
      }
    }
    e135 -> e136 "Supplies the exact current RoadmapBaseline and projection or RoadmapNotInitialized disposition." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-BASELINE-BOOTSTRAP"
      }
    }
    e134 -> e137 "Marks the prior session snapshot stale after promotion so the next module boundary must refresh it." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-GATE-CONTEXT"
      }
    }
    e134 -> e138 "Supplies only approved baseline changes for deterministic graph contribution." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RM-GATE-TRACE"
      }
    }
    e140 -> e141 "Invokes deterministic local baseline loading and delta construction." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-ROUTER-NATIVE"
      }
    }
    e140 -> e142 "Invokes a configured bounded provider capability." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-ROUTER-PROVIDER"
      }
    }
    e142 -> e143 "Binds the V1 Mem0 retrieval and indexing adapter." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-PROVIDER-MEM0"
      }
    }
    e141 -> e144 "Supplies authoritative baseline facts and candidate deltas." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-NATIVE-ASSEMBLER"
      }
    }
    e143 -> e144 "Supplies derived cited retrieval results without authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-MEM0-ASSEMBLER"
      }
    }
    e148 -> e144 "Supplies a checkpoint-bound read-only lifecycle projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-TRACE-ASSEMBLER"
      }
    }
    e144 -> e136 "Makes CurrentSynopsis and exact project memory the first semantic context loaded by configured fresh tasks." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-ASSEMBLER-BOOTSTRAP"
      }
    }
    e146 -> e145 "Submits an explicit candidate delta and user disposition for validation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-CONCLUDE-GATE"
      }
    }
    e145 -> e147 "Atomically promotes the baseline and matching synopsis projection." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-GATE-SYNOPSIS"
      }
    }
    e145 -> e149 "Supplies only approved canonical memory changes for graph contribution." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-GATE-TRACE"
      }
    }
    e149 -> e148 "Makes the resulting approved graph checkpoint available to later context projections." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-PM-TRACE-CONTRIBUTOR-PROJECTOR"
      }
    }
    e51 -> e157 "Supplies approved assignments and the next dependency frontier for environment routing." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-SA-ROUTER"
      }
    }
    e157 -> e151 "Invokes exact profile resolution for the bound frontier." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-ROUTER-PROFILE"
      }
    }
    e151 -> e152 "Supplies required and optional facts to inventory." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-PROFILE-INVENTORY"
      }
    }
    e152 -> e153 "Uses the V1 native Windows inventory binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-INVENTORY-NATIVE"
      }
    }
    e152 -> e154 "Supplies normalized gaps without mutation authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-INVENTORY-PLANNER"
      }
    }
    e154 -> e155 "Invokes only approved capability-scoped effects." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-PLANNER-BRIDGE"
      }
    }
    e155 -> e159 "Persists each exact effect result before progression." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-BRIDGE-CHECKPOINT"
      }
    }
    e159 -> e156 "Supplies restart-safe effect receipts and before/after state." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-CHECKPOINT-EVIDENCE"
      }
    }
    e152 -> e156 "Supplies exact raw and normalized observation evidence." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-INVENTORY-EVIDENCE"
      }
    }
    e156 -> e158 "Supplies redacted current facts for deterministic fingerprinting." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-EVIDENCE-FINGERPRINT"
      }
    }
    e158 -> e160 "Supplies current profile-bound fingerprints and drift diagnostics." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-FINGERPRINT-GATE"
      }
    }
    e156 -> e160 "Supplies exact policy evidence and warnings." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-EVIDENCE-GATE"
      }
    }
    e160 -> e161 "Issues an exact ready receipt for one bound frontier and attempt." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-GATE-BINDER"
      }
    }
    e161 -> e58 "Authorizes WorkExecution only after immediate fingerprint revalidation." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-BINDER-WE"
      }
    }
    e160 -> e162 "Supplies approved readiness facts for trusted forward graph contribution." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-EP-GATE-TRACE"
      }
    }
    e164 -> e170 "Supplies the exact passing SystemVerification subject and evidence for conditional release routing." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-SV-ROUTER"
      }
    }
    e160 -> e170 "Supplies an accepted current EnvironmentReadinessReceipt for the release attempt." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-EP-ROUTER"
      }
    }
    e170 -> e166 "Invokes exact candidate identity resolution." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-ROUTER-IDENTITY"
      }
    }
    e166 -> e167 "Supplies the immutable attempt, source, version, configuration, policy, grants, and toolchain binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-IDENTITY-MATERIALIZER"
      }
    }
    e167 -> e168 "Uses the native controlled Windows materialization and verification binding." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-MATERIALIZER-NATIVE"
      }
    }
    e167 -> e171 "Persists exact prepared candidate bytes and raw effect results before progression." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-MATERIALIZER-CHECKPOINT"
      }
    }
    e171 -> e169 "Supplies restart-safe candidate, command, effect, and checkpoint receipts." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-CHECKPOINT-EVIDENCE"
      }
    }
    e171 -> e172 "Supplies content-addressed candidate bytes for exact verification." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-CHECKPOINT-BYTES"
      }
    }
    e168 -> e169 "Supplies exact native materialization and verification observations." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-NATIVE-EVIDENCE"
      }
    }
    e172 -> e173 "Supplies obligation-complete verification over exact stored bytes." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-BYTES-GATE"
      }
    }
    e169 -> e173 "Supplies exact preparation, verification, supply-chain, maturity, and policy evidence." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-EVIDENCE-GATE"
      }
    }
    e173 -> e165 "Supplies Gate-owned release readiness to BusinessAcceptance without publication authority." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-GATE-BA"
      }
    }
    e173 -> e174 "Supplies readiness, blockers, warnings, obligations, and exact evidence links." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-GATE-SUMMARY"
      }
    }
    e173 -> e175 "Supplies approved readiness facts for trusted graph contribution." "Canonical DevRelay artifact contract" {
      properties {
        "devrelay.id" "REL-RP-GATE-TRACE"
      }
    }
  }
  views {
    container e1 "VIEW-WDA-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      autoLayout lr
    }
    component e2 "VIEW-WDA-CORE-COMPONENTS" {
      include e7
      include e13
      include e14
      include e15
      include e16
      include e17
      autoLayout lr
    }
    component e12 "VIEW-WDA-MODULE-COMPONENTS" {
      include e18
      include e19
      include e20
      include e21
      autoLayout lr
    }
    container e1 "VIEW-RUN-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      autoLayout lr
    }
    component e2 "VIEW-RUN-CORE-COMPONENTS" {
      include e24
      include e23
      include e25
      autoLayout lr
    }
    component e22 "VIEW-RUN-REPORTING-COMPONENTS" {
      include e26
      include e27
      include e28
      include e29
      include e30
      include e31
      include e32
      include e33
      autoLayout lr
    }
    container e1 "VIEW-CG-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      autoLayout lr
    }
    component e2 "VIEW-CG-CORE-COMPONENTS" {
      include e38
      include e39
      include e40
      include e41
      autoLayout lr
    }
    component e34 "VIEW-CG-MODULE-COMPONENTS" {
      include e35
      include e36
      include e37
      autoLayout lr
    }
    component e3 "VIEW-CG-TRACEABILITY-COMPONENTS" {
      include e42
      include e43
      autoLayout lr
    }
    container e1 "VIEW-SA-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      autoLayout lr
    }
    component e2 "VIEW-SA-CORE-COMPONENTS" {
      include e48
      include e49
      include e50
      include e51
      autoLayout lr
    }
    component e44 "VIEW-SA-MODULE-COMPONENTS" {
      include e45
      include e46
      include e47
      autoLayout lr
    }
    component e3 "VIEW-SA-TRACEABILITY-COMPONENTS" {
      include e52
      include e53
      autoLayout lr
    }
    container e1 "VIEW-WE-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      autoLayout lr
    }
    component e2 "VIEW-WE-CORE-COMPONENTS" {
      include e58
      include e59
      include e60
      include e61
      include e62
      autoLayout lr
    }
    component e54 "VIEW-WE-MODULE-COMPONENTS" {
      include e55
      include e56
      include e57
      autoLayout lr
    }
    component e3 "VIEW-WE-TRACEABILITY-COMPONENTS" {
      include e63
      autoLayout lr
    }
    container e1 "VIEW-WIV-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      autoLayout lr
    }
    component e2 "VIEW-WIV-CORE-COMPONENTS" {
      include e68
      include e69
      include e70
      include e71
      include e72
      include e73
      include e74
      autoLayout lr
    }
    component e64 "VIEW-WIV-MODULE-COMPONENTS" {
      include e65
      include e66
      include e67
      autoLayout lr
    }
    component e3 "VIEW-WIV-TRACEABILITY-COMPONENTS" {
      include e75
      include e76
      autoLayout lr
    }
    container e1 "VIEW-CI-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      autoLayout lr
    }
    component e2 "VIEW-CI-CORE-COMPONENTS" {
      include e80
      include e81
      include e82
      include e83
      include e84
      autoLayout lr
    }
    component e77 "VIEW-CI-MODULE-COMPONENTS" {
      include e78
      include e79
      autoLayout lr
    }
    component e3 "VIEW-CI-TRACEABILITY-COMPONENTS" {
      include e85
      autoLayout lr
    }
    container e1 "VIEW-AD-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      autoLayout lr
    }
    component e2 "VIEW-AD-CORE-COMPONENTS" {
      include e90
      include e91
      include e92
      include e93
      include e94
      autoLayout lr
    }
    component e86 "VIEW-AD-MODULE-COMPONENTS" {
      include e87
      include e88
      include e89
      autoLayout lr
    }
    component e3 "VIEW-AD-TRACEABILITY-COMPONENTS" {
      include e95
      autoLayout lr
    }
    container e1 "VIEW-REL-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      autoLayout lr
    }
    component e96 "VIEW-REL-COMPONENTS" {
      include e97
      include e98
      include e99
      include e100
      include e101
      autoLayout lr
    }
    container e1 "VIEW-MQ-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      include e108
      include e111
      include e113
      autoLayout lr
    }
    component e2 "VIEW-MQ-CORE-COMPONENTS" {
      include e102
      include e103
      include e104
      include e105
      autoLayout lr
    }
    component e108 "VIEW-MQ-PROVIDER-COMPONENTS" {
      include e109
      include e110
      autoLayout lr
    }
    component e113 "VIEW-MQ-GODOT-COMPONENTS" {
      include e114
      include e115
      include e116
      autoLayout lr
    }
    component e111 "VIEW-MQ-DESKTOP-COMPONENTS" {
      include e112
      autoLayout lr
    }
    container e1 "VIEW-SIM-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      include e108
      include e111
      include e113
      include e122
      autoLayout lr
    }
    component e2 "VIEW-SIM-CORE-COMPONENTS" {
      include e117
      include e118
      include e119
      include e120
      autoLayout lr
    }
    component e122 "VIEW-SIM-HOST-COMPONENTS" {
      include e123
      include e124
      include e125
      include e126
      include e127
      include e128
      include e129
      autoLayout lr
    }
    component e96 "VIEW-SIM-RELEASE-COMPONENTS" {
      include e121
      autoLayout lr
    }
    container e1 "VIEW-RM-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      include e108
      include e111
      include e113
      include e122
      include e130
      autoLayout lr
    }
    component e130 "VIEW-RM-MODULE-COMPONENTS" {
      include e131
      include e132
      include e133
      autoLayout lr
    }
    component e2 "VIEW-RM-CORE-COMPONENTS" {
      include e134
      include e135
      include e136
      include e137
      include e138
      autoLayout lr
    }
    container e1 "VIEW-PM-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      include e108
      include e111
      include e113
      include e122
      include e130
      include e139
      autoLayout lr
    }
    component e139 "VIEW-PM-MODULE-COMPONENTS" {
      include e140
      include e141
      include e142
      include e143
      include e144
      autoLayout lr
    }
    component e2 "VIEW-PM-CORE-COMPONENTS" {
      include e145
      include e146
      include e147
      include e148
      include e149
      autoLayout lr
    }
    container e1 "VIEW-EP-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      include e108
      include e111
      include e113
      include e122
      include e130
      include e139
      include e150
      autoLayout lr
    }
    component e150 "VIEW-EP-MODULE-COMPONENTS" {
      include e151
      include e152
      include e153
      include e154
      include e155
      include e156
      autoLayout lr
    }
    component e2 "VIEW-EP-CORE-COMPONENTS" {
      include e157
      include e158
      include e159
      include e160
      include e161
      include e162
      autoLayout lr
    }
    container e1 "VIEW-RP-CONTAINERS" {
      include e2
      include e3
      include e4
      include e11
      include e12
      include e22
      include e34
      include e44
      include e54
      include e64
      include e77
      include e86
      include e96
      include e108
      include e111
      include e113
      include e122
      include e130
      include e139
      include e150
      include e163
      autoLayout lr
    }
    component e163 "VIEW-RP-MODULE-COMPONENTS" {
      include e166
      include e167
      include e168
      include e169
      autoLayout lr
    }
    component e2 "VIEW-RP-CORE-COMPONENTS" {
      include e164
      include e165
      include e170
      include e171
      include e172
      include e173
      include e174
      include e175
      autoLayout lr
    }
  }
  configuration {
    scope softwaresystem
  }
}

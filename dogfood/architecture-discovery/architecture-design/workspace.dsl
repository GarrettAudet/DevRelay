workspace "DevRelay ArchitectureDiscovery" "Evidence-bound verification and Gate target architecture" {
  !identifiers flat
  !impliedRelationships false
  model {
    e1 = softwareSystem "DevRelay" "Deterministic orchestration runtime for composable software-engineering modules." {
      properties {
        "devrelay.id" "EL-DEVRELAY-SYSTEM"
      }
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
    }
    e2 -> e3 "Submits checkpointed updates from trusted contributors." {
      properties {
        "devrelay.id" "REL-CORE-GRAPH"
      }
    }
    e2 -> e4 "Derives establish-breakdown or decompose-change from loaded trusted project state." {
      properties {
        "devrelay.id" "REL-CORE-WB-ROUTE"
      }
    }
    e7 -> e6 "Allows adapter entry only when exact lineage and drift checks pass." {
      properties {
        "devrelay.id" "REL-PREFLIGHT-ADAPTER"
      }
    }
    e8 -> e11 "Releases only an approved WorkBreakdownBaseline or applied change set." {
      properties {
        "devrelay.id" "REL-GATE-DOWNSTREAM"
      }
    }
    e2 -> e9 "Invokes the trusted contributor only for a validated canonical candidate." {
      properties {
        "devrelay.id" "REL-CORE-CONTRIBUTOR"
      }
    }
    e2 -> e12 "Executes the registered provider-neutral WorkDependencyAnalysis contract." {
      properties {
        "devrelay.id" "REL-CORE-WDA"
      }
    }
    e4 -> e12 "Supplies one exact approved WorkBreakdownBaseline for analysis." {
      properties {
        "devrelay.id" "REL-WB-WDA"
      }
    }
    e12 -> e3 "Submits only trusted checkpointed dependency traceability updates." {
      properties {
        "devrelay.id" "REL-WDA-GRAPH"
      }
    }
    e12 -> e11 "Releases only an approved static dependency DAG to SpecialistAssignment." {
      properties {
        "devrelay.id" "REL-WDA-DOWNSTREAM"
      }
    }
    e13 -> e18 "Provides the complete snapshot and only declared pinned context slices." {
      properties {
        "devrelay.id" "REL-SNAPSHOT-PROPOSER"
      }
    }
    e18 -> e19 "Dispatches to the default native structured proposer." {
      properties {
        "devrelay.id" "REL-PROPOSER-NATIVE"
      }
    }
    e18 -> e20 "Dispatches to the configured optional adapter bridge when selected." {
      properties {
        "devrelay.id" "REL-PROPOSER-OPTIONAL"
      }
    }
    e18 -> e14 "Submits a normalized proposal for Core-owned structural validation." {
      properties {
        "devrelay.id" "REL-PROPOSER-MECHANICS"
      }
    }
    e14 -> e15 "Supplies the canonical graph and mechanical diagnostics for pinned policy evaluation." {
      properties {
        "devrelay.id" "REL-MECHANICS-OPA"
      }
    }
    e18 -> e21 "Requests an advisory cross-artifact consistency review." {
      properties {
        "devrelay.id" "REL-PROPOSER-REVIEWER"
      }
    }
    e14 -> e16 "Supplies canonical graph mechanics and cycle evidence." {
      properties {
        "devrelay.id" "REL-MECHANICS-GATE"
      }
    }
    e15 -> e16 "Supplies normalized pinned policy decisions and raw-result evidence." {
      properties {
        "devrelay.id" "REL-OPA-GATE"
      }
    }
    e21 -> e16 "Supplies bounded advisory findings without approval authority." {
      properties {
        "devrelay.id" "REL-REVIEWER-GATE"
      }
    }
    e16 -> e17 "Supplies a validated exact candidate for deterministic graph projection." {
      properties {
        "devrelay.id" "REL-GATE-CONTRIBUTOR"
      }
    }
    e17 -> e3 "Submits checkpointed forward candidate relationships for atomic merge." {
      properties {
        "devrelay.id" "REL-WDA-CONTRIBUTOR-GRAPH"
      }
    }
    e2 -> e22 "Supplies trusted standardized lifecycle facts without granting reporting progression authority." {
      properties {
        "devrelay.id" "REL-CORE-RUN-REPORTING"
      }
    }
    e3 -> e22 "Supplies one exact TraceabilityGraph checkpoint for read-only report projection." {
      properties {
        "devrelay.id" "REL-GRAPH-RUN-REPORTING"
      }
    }
    e23 -> e26 "Appends trusted content-addressed module, Gate, checkpoint, approval, and progression records." {
      properties {
        "devrelay.id" "REL-RUN-FACTS-LEDGER"
      }
    }
    e27 -> e26 "Appends sourced non-authoritative host observations with explicit availability dispositions." {
      properties {
        "devrelay.id" "REL-RUN-OBSERVATIONS-LEDGER"
      }
    }
    e26 -> e30 "Supplies one exact run lineage and observation set." {
      properties {
        "devrelay.id" "REL-RUN-LEDGER-PROJECTOR"
      }
    }
    e3 -> e30 "Supplies one exact graph snapshot and deterministic query results." {
      properties {
        "devrelay.id" "REL-RUN-GRAPH-PROJECTOR"
      }
    }
    e28 -> e30 "Supplies evidence-backed adapter binding and Core implementation maturity." {
      properties {
        "devrelay.id" "REL-RUN-MATURITY-PROJECTOR"
      }
    }
    e29 -> e30 "Supplies explicit comparable or non-comparable dispositions." {
      properties {
        "devrelay.id" "REL-RUN-COMPARABILITY-PROJECTOR"
      }
    }
    e30 -> e31 "Submits the canonical report field set for deterministic content policy." {
      properties {
        "devrelay.id" "REL-RUN-PROJECTOR-POLICY"
      }
    }
    e31 -> e32 "Supplies an allowed or explicitly redacted canonical snapshot." {
      properties {
        "devrelay.id" "REL-RUN-POLICY-RENDERER"
      }
    }
    e32 -> e33 "Publishes the exact Markdown report and structured snapshot references." {
      properties {
        "devrelay.id" "REL-RUN-RENDERER-PORT"
      }
    }
    e11 -> e24 "Submits only verified integrated-completion facts from ChangeIntegration." {
      properties {
        "devrelay.id" "REL-RUN-INTEGRATION-COMPLETION"
      }
    }
    e24 -> e25 "Supplies the exact separately approved completion fact set." {
      properties {
        "devrelay.id" "REL-RUN-COMPLETION-FRONTIER"
      }
    }
    e12 -> e25 "Supplies the immutable approved WorkDependencyBaseline DAG." {
      properties {
        "devrelay.id" "REL-RUN-DAG-FRONTIER"
      }
    }
    e25 -> e11 "Releases only the currently derived dependency-ready work-item frontier." {
      properties {
        "devrelay.id" "REL-RUN-FRONTIER-DOWNSTREAM"
      }
    }
    e38 -> e35 "Supplies the state-selected operation and exact configured generator binding." {
      properties {
        "devrelay.id" "REL-CG-ROUTE-INVOKE"
      }
    }
    e35 -> e36 "Invokes the declared JSON Schema 2020-12 generator binding." {
      properties {
        "devrelay.id" "REL-CG-JSON-SCHEMA-PORT"
      }
    }
    e35 -> e37 "Invokes one configured optional contract-kind generator through the same semantic port." {
      properties {
        "devrelay.id" "REL-CG-OPTIONAL-PORT"
      }
    }
    e35 -> e39 "Submits canonical draft entries and native bytes for independent format validation." {
      properties {
        "devrelay.id" "REL-CG-PORT-VALIDATOR"
      }
    }
    e39 -> e40 "Supplies only validated normalized entries for exact baseline comparison." {
      properties {
        "devrelay.id" "REL-CG-VALIDATOR-DIFFER"
      }
    }
    e40 -> e41 "Supplies canonical change facts and compatibility evidence for Gate policy." {
      properties {
        "devrelay.id" "REL-CG-DIFFER-GATE"
      }
    }
    e39 -> e41 "Supplies format validation evidence for semantic completeness review." {
      properties {
        "devrelay.id" "REL-CG-VALIDATOR-GATE"
      }
    }
    e35 -> e42 "Supplies the validated candidate result for non-authoritative traceability projection." {
      properties {
        "devrelay.id" "REL-CG-CANDIDATE-TRACE"
      }
    }
    e41 -> e43 "Supplies exact ContractGate promotion proof for active contract projection." {
      properties {
        "devrelay.id" "REL-CG-GATE-APPROVED-TRACE"
      }
    }
    e41 -> e4 "Releases WorkBreakdown only with an approved ContractBaseline or ApprovedNotApplicable disposition." {
      properties {
        "devrelay.id" "REL-CG-GATE-WORK-BREAKDOWN"
      }
    }
    e48 -> e45 "Supplies the state-selected operation and exact configured ranker binding." {
      properties {
        "devrelay.id" "REL-SA-ROUTE-INVOKE"
      }
    }
    e45 -> e46 "Invokes the declared native structured ranking ranker binding." {
      properties {
        "devrelay.id" "REL-SA-NATIVE-RANKER-PORT"
      }
    }
    e45 -> e47 "Invokes one configured optional profile-capability ranker through the same semantic port." {
      properties {
        "devrelay.id" "REL-SA-OPTIONAL-PORT"
      }
    }
    e45 -> e49 "Submits canonical draft entries and native bytes for independent eligibility validation." {
      properties {
        "devrelay.id" "REL-SA-RANKER-ELIGIBILITY"
      }
    }
    e49 -> e50 "Supplies only validated normalized entries for exact baseline comparison." {
      properties {
        "devrelay.id" "REL-SA-ELIGIBILITY-ASSEMBLER"
      }
    }
    e50 -> e51 "Supplies canonical change facts and assignment-policy evidence for Gate policy." {
      properties {
        "devrelay.id" "REL-SA-ASSEMBLER-GATE"
      }
    }
    e49 -> e51 "Supplies eligibility validation evidence for semantic completeness review." {
      properties {
        "devrelay.id" "REL-SA-ELIGIBILITY-GATE"
      }
    }
    e45 -> e52 "Supplies the validated candidate result for non-authoritative traceability projection." {
      properties {
        "devrelay.id" "REL-SA-CANDIDATE-TRACE"
      }
    }
    e51 -> e53 "Supplies exact SpecialistAssignmentGate promotion proof for active assignment projection." {
      properties {
        "devrelay.id" "REL-SA-GATE-APPROVED-TRACE"
      }
    }
    e51 -> e12 "Supplies the approved complete assignment baseline for dependency-ordered WorkExecution frontier calculation." {
      properties {
        "devrelay.id" "REL-SA-GATE-WORK-EXECUTION"
      }
    }
    e58 -> e59 "Requests readiness proof for the exact work item." {
      properties {
        "devrelay.id" "REL-WE-GUARD-FRONTIER"
      }
    }
    e59 -> e60 "Releases only a readiness-approved work item for binding." {
      properties {
        "devrelay.id" "REL-WE-FRONTIER-BINDING"
      }
    }
    e60 -> e55 "Supplies one exact validated execution binding and permission demand." {
      properties {
        "devrelay.id" "REL-WE-BINDING-PORT"
      }
    }
    e55 -> e56 "Invokes one user-visible Codex task through the common executor contract." {
      properties {
        "devrelay.id" "REL-WE-PORT-CODEX"
      }
    }
    e55 -> e57 "Optionally invokes a version-pinned A2A agent through the same contract." {
      properties {
        "devrelay.id" "REL-WE-PORT-A2A"
      }
    }
    e55 -> e62 "Persists exact effect bytes before canonical progression." {
      properties {
        "devrelay.id" "REL-WE-PORT-CHECKPOINT"
      }
    }
    e62 -> e61 "Supplies replay-verified executor bytes for canonical assembly." {
      properties {
        "devrelay.id" "REL-WE-CHECKPOINT-ASSEMBLER"
      }
    }
    e61 -> e63 "Supplies validated attempt and proposed change artifacts for candidate traceability." {
      properties {
        "devrelay.id" "REL-WE-ASSEMBLER-TRACE"
      }
    }
    e68 -> e69 "Releases one exact verified subject for deterministic obligation expansion." {
      properties {
        "devrelay.id" "REL-WIV-GUARD-OBLIGATIONS"
      }
    }
    e69 -> e70 "Supplies the complete obligation set for deterministic verifier selection." {
      properties {
        "devrelay.id" "REL-WIV-OBLIGATIONS-BINDING"
      }
    }
    e70 -> e65 "Supplies exact validated verifier bindings, obligation partitions, and permission demand." {
      properties {
        "devrelay.id" "REL-WIV-BINDING-PORT"
      }
    }
    e65 -> e66 "Invokes configured test evidence capabilities." {
      properties {
        "devrelay.id" "REL-WIV-PORT-TEST"
      }
    }
    e65 -> e67 "Invokes configured review evidence capabilities." {
      properties {
        "devrelay.id" "REL-WIV-PORT-REVIEW"
      }
    }
    e65 -> e74 "Persists exact effect bytes before canonical evaluation." {
      properties {
        "devrelay.id" "REL-WIV-PORT-CHECKPOINT"
      }
    }
    e74 -> e71 "Supplies replay-verified raw results for evidence normalization." {
      properties {
        "devrelay.id" "REL-WIV-CHECKPOINT-NORMALIZER"
      }
    }
    e71 -> e72 "Supplies complete subject-bound evidence and obligation dispositions." {
      properties {
        "devrelay.id" "REL-WIV-NORMALIZER-POLICY"
      }
    }
    e72 -> e73 "Supplies the closed policy disposition and exact candidate." {
      properties {
        "devrelay.id" "REL-WIV-POLICY-GATE"
      }
    }
    e71 -> e75 "Supplies validated attempt and evidence provenance for candidate traceability." {
      properties {
        "devrelay.id" "REL-WIV-NORMALIZER-CANDIDATE-TRACE"
      }
    }
    e73 -> e76 "Supplies exact Gate approval for approved verification evidence projection." {
      properties {
        "devrelay.id" "REL-WIV-GATE-APPROVED-TRACE"
      }
    }
    e80 -> e81 "Releases one exact approved verification subject for deterministic integration planning." {
      properties {
        "devrelay.id" "REL-CI-GUARD-PLAN"
      }
    }
    e81 -> e82 "Supplies the exact target ref, expected commit, policy, and idempotency identity." {
      properties {
        "devrelay.id" "REL-CI-PLAN-CAS"
      }
    }
    e82 -> e78 "Authorizes one bounded conditional integration attempt only when target pre-state matches." {
      properties {
        "devrelay.id" "REL-CI-CAS-PORT"
      }
    }
    e78 -> e79 "Invokes the configured local Git integration capability." {
      properties {
        "devrelay.id" "REL-CI-PORT-GIT"
      }
    }
    e78 -> e83 "Persists exact effect observations before canonical success or failure projection." {
      properties {
        "devrelay.id" "REL-CI-PORT-CHECKPOINT"
      }
    }
    e83 -> e84 "Supplies replay-verified native observations for closed outcome validation." {
      properties {
        "devrelay.id" "REL-CI-CHECKPOINT-VALIDATOR"
      }
    }
    e84 -> e85 "Supplies only a validated factual integrated-change record for atomic graph projection." {
      properties {
        "devrelay.id" "REL-CI-VALIDATOR-TRACE"
      }
    }
    e90 -> e91 "Releases one exact existing-undiscovered project state for discovery input validation." {
      properties {
        "devrelay.id" "REL-AD-ROUTER-GUARD"
      }
    }
    e91 -> e87 "Authorizes the mandatory local inventory over the exact declared repository surface." {
      properties {
        "devrelay.id" "REL-AD-GUARD-INVENTORY"
      }
    }
    e87 -> e88 "Invokes the version-pinned native repository inventory capability." {
      properties {
        "devrelay.id" "REL-AD-INVENTORY-NATIVE"
      }
    }
    e91 -> e89 "Authorizes only configured optional analyzer context slices and grants." {
      properties {
        "devrelay.id" "REL-AD-GUARD-ANALYZER"
      }
    }
    e87 -> e94 "Persists exact mandatory inventory observations before normalization." {
      properties {
        "devrelay.id" "REL-AD-INVENTORY-CHECKPOINT"
      }
    }
    e89 -> e94 "Persists each bounded analyzer result or failure before normalization." {
      properties {
        "devrelay.id" "REL-AD-ANALYZER-CHECKPOINT"
      }
    }
    e94 -> e92 "Supplies replay-verified native observations for canonical current-state normalization." {
      properties {
        "devrelay.id" "REL-AD-CHECKPOINT-NORMALIZER"
      }
    }
    e92 -> e93 "Supplies explicit findings, confidence, contradictions, unknowns, and candidate gaps." {
      properties {
        "devrelay.id" "REL-AD-NORMALIZER-GAP"
      }
    }
    e93 -> e95 "Supplies only a validated non-blocking observational snapshot for traceability projection." {
      properties {
        "devrelay.id" "REL-AD-GAP-TRACE"
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
  }
}

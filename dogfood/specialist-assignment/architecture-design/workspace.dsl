workspace "DevRelay SpecialistAssignment" "Assignment generation and Gate target architecture" {
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
  }
}

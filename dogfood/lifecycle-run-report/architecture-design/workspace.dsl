workspace "DevRelay Lifecycle Reporting" "Run observability and ready-frontier target architecture" {
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
  }
}

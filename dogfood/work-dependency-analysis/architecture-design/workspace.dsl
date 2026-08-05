workspace "DevRelay WorkDependencyAnalysis" "Dependency-analysis target architecture" {
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
  }
}

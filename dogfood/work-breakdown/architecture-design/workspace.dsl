workspace "DevRelay WorkBreakdown 0.1.0" "Planning-only target architecture" {
  model {
    workflowAuthor = person "Workflow Author" "Submits approved scope and reviews the candidate work breakdown."
    downstream = softwareSystem "Downstream Engineering Modules" "Dependency analysis, assignment, execution, and verification."

    devrelay = softwareSystem "DevRelay" "Deterministic orchestration runtime" {
      core = container "Generic Core" "State routing, exact artifact validation, registered preflight, adapter invocation, checkpoints, and gate progression." "Node.js"
      workBreakdown = container "WorkBreakdown Module" "Provider-neutral semantic contract for bounded work-item candidates." "JSON Schema and module manifest"
      adapterPort = container "WorkBreakdown Adapter Port" "Configured planning-only capability boundary." "Agent-command bridge"
      gate = container "WorkBreakdown Gate" "Coverage, reference, approval, and baseline-promotion authority." "Deterministic policy"
      contributor = container "WorkBreakdown Traceability Contributor" "Trusted deterministic projector of planning assertions." "Node.js"
      graph = container "TraceabilityGraph" "Core-owned lifecycle graph and atomic merge boundary." "In-process service"
      stateStore = container "Artifact and Checkpoint Store" "Immutable content-addressed artifacts, effect checkpoints, and merge receipts." "Host-provided storage"
    }

    workflowAuthor -> core "Supplies exact approved baselines, dispositions, and capability catalog"
    core -> workBreakdown "Routes establish-breakdown or decompose-change from trusted state"
    core -> adapterPort "Invokes bounded configured planning capability after preflight"
    workBreakdown -> gate "Returns canonical candidate for policy review"
    gate -> stateStore "Atomically promotes baseline or applies approved delta"
    core -> contributor "Projects only a validated candidate"
    contributor -> graph "Proposes typed planning assertions"
    graph -> stateStore "Checkpoints update and merge proof"
    gate -> downstream "Releases approved work baseline or change set"
  }

  views {
    systemContext devrelay "WB-CONTEXT" {
      include *
      autolayout lr
    }

    container devrelay "WB-CONTAINERS" {
      include *
      autolayout lr
    }

    styles {
      element "Person" { shape person }
      element "Software System" { background #1168bd color #ffffff }
      element "Container" { background #438dd5 color #ffffff }
    }
  }
}

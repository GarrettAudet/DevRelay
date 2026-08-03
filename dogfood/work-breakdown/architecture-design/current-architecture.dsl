workspace "DevRelay current architecture" "Observed at repository revision 7d3b9c16d4c197bf80dce8279e027b953e32f21a" {
  model {
    devrelay = softwareSystem "DevRelay" "Deterministic orchestration runtime" {
      core = container "Generic Core" "Registration, state-derived routing, adapter resolution, checkpoints, and progression." "Node.js"
      modules = container "Released Semantic Modules" "RequirementsGathering and ArchitectureDesign provider-neutral contracts." "JSON Schema and JavaScript"
      graph = container "TraceabilityGraph" "Trusted lifecycle traceability sidecar." "Provider-neutral graph contract"
    }

    core -> modules "Executes registered module contracts through exact configured bindings"
    core -> graph "Submits checkpointed updates from trusted contributors"
  }

  views {
    container devrelay "DEVRELAY-CURRENT-CONTAINERS" {
      include *
      autolayout lr
    }
  }
}

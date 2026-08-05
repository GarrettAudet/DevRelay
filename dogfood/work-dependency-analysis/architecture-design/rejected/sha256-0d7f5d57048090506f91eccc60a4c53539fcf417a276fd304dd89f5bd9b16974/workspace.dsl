workspace "DevRelay WorkDependencyAnalysis" "Dependency-analysis target architecture" {
  model {
    devrelay = softwareSystem "DevRelay" {
      core = container "Generic Core"
      modules = container "Released Semantic Modules"
      graph = container "TraceabilityGraph"
      wda = container "WorkDependencyAnalysis"
      gate = container "WorkDependencyGate"
      proposer = component "Dependency Proposal Port"
      mechanics = component "Graphology-DAG Mechanics"
      policy = component "OPA Policy Evaluator"
      reviewer = component "Spec Kit Consistency Reviewer"
      contributor = component "Traceability Contributor"
      wda -> proposer "Requests canonical proposal"
      wda -> mechanics "Validates DAG mechanics"
      wda -> policy "Evaluates pinned policy"
      wda -> reviewer "Requests advisory consistency review"
      wda -> gate "Presents exact candidate"
      contributor -> graph "Merges forward candidate edges"
    }
  }
  views {
    container devrelay "VIEW-WDA-DEPENDENCY-FLOW" { include * autoLayout lr }
  }
}

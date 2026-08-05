package devrelay.work_dependency

import rego.v1

denials contains {
  "code": "OPA_EDGE_DENIED",
  "edgeId": edge.id,
  "message": sprintf("dependency edge %s is denied by declared policy input", [edge.id]),
} if {
  some edge in input.edges
  edge.policyDisposition == "deny"
}

denials contains {
  "code": "OPA_SELF_DEPENDENCY",
  "edgeId": edge.id,
  "message": sprintf("dependency edge %s is a self-dependency", [edge.id]),
} if {
  some edge in input.edges
  edge.prerequisiteId == edge.dependentId
}

edge_denied(edge_id) if {
  some denial in denials
  denial.edgeId == edge_id
}

edge_decisions contains {"edgeId": edge.id, "allow": true} if {
  some edge in input.edges
  not edge_denied(edge.id)
}

edge_decisions contains {"edgeId": edge.id, "allow": false} if {
  some edge in input.edges
  edge_denied(edge.id)
}

decision := {
  "allow": count(denials) == 0,
  "denials": denials,
  "edgeDecisions": edge_decisions,
}

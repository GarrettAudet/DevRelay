// WorkBreakdown uses different repository ports for its initial and change
// operations. Assignment consumes the exact approved artifact through one port.
export function selectAssignmentRepositoryBinding(workBaseline) {
  const bindings = workBaseline.inputBindings.filter(entry =>
    entry.role === "repository-context" || entry.role === "current-repository-snapshot");
  if (bindings.length !== 1) {
    throw new TypeError("assignment repository binding requires exactly one approved upstream repository role");
  }
  return bindings[0];
}

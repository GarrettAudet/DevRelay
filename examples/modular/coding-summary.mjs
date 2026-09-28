/** Present the recorded outcome without dropping raw evidence or replay state. */
export function summarizeCodingResult(execution) {
  const report = execution.report;
  const current = execution.currentWorkspaceMatches === true;
  const outcome = execution.result.outcome;
  return {
    requestId: report?.requestId ?? null,
    goal: report?.goal ?? null,
    outcome,
    changedPaths: report?.changes.map(change => change.path) ?? [],
    testExitCode: report?.verification.exitCode ?? null,
    testsPassed: current && outcome === "verified" && report?.verification.exitCode === 0,
    replayed: execution.replayed === true,
    currentWorkspaceMatches: current,
  };
}

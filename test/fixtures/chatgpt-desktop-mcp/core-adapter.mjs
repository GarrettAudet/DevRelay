const digest = `sha256:${"a".repeat(64)}`;

export async function executeDesktopCommand(input) {
  return {
    requestId: input.requestId,
    runId: input.runId,
    revision: input.expectedRevision + (input.operation === "inspect-run" || input.operation === "get-evidence" ? 0 : 1),
    status: "completed",
    artifacts: [{ artifactId: "ARTIFACT-1", digest }],
    gateState: "not-applicable",
    diagnostics: [],
    nextAction: { kind: "none" },
  };
}

# ChatGPT Desktop live-path remediation

This package records the corrective lifecycle run opened after final
SystemVerification proved that the repository-backed ChatGPT Desktop plugin
was not executable after installation. It is a human-readable workstream
record; approved baselines, module checkpoints, Gate records, execution
receipts, and graph merge proofs remain authoritative.

## Failure evidence

- `plugins/devrelay/.mcp.json` launched
  `src/chatgpt-desktop-mcp-server.mjs`, which is a server factory and has no
  command-line STDIO bootstrap.
- The installer copied only `plugins/devrelay` and the marketplace manifest,
  so the referenced repository `src/` path did not exist in the installed
  plugin.
- `chatgpt-desktop-mcp-transport.mjs` required an external
  `DEVRELAY_DESKTOP_CORE_MODULE`, while the release contained no production
  module exporting `executeDesktopCommand`.
- The release gate exercised a fixture Core adapter and did not spawn the
  installed plugin command from its receipt.

The prior green package checks therefore prove library and fixture
conformance, not the owner-required clean-installed Desktop lifecycle.

## Upstream circuit disposition

| Stage | Outcome | Reason |
| --- | --- | --- |
| RequirementsGathering / RequirementsGate | `pass` by exact approved-baseline replay | `AC-DEV-DESKTOP-LIVE-PATH-001`, `AC-DEV-DESKTOP-E2E-001`, and `AC-DEV-DESKTOP-MCP-001` already require this behavior. |
| ArchitectureDiscovery | `not-applicable` | The current repository and architecture baseline are known and version-pinned. |
| ArchitectureDesign / ArchitectureGate | `pass` by exact approved-baseline replay | The approved Desktop plugin, bridge, store, capability resolver, and Core elements define the required boundary. |
| ContractGeneration / ContractGate | `pass` by exact approved-baseline replay | The approved Desktop MCP, run-state, and installation contracts cover the failed path. |
| WorkBreakdown | `fix` against approved work items | SystemVerification reopens the affected work-item attempts; it does not invent a second scope baseline. |

## Corrective work sequence

```text
WI-DESKTOP-MCP-BRIDGE corrective attempt
-> WI-DESKTOP-PLUGIN / WI-DESKTOP-INSTALL corrective attempt
-> WI-DESKTOP-LIFECYCLE corrective attempt
-> WI-DESKTOP-VERIFICATION corrective attempt
-> WI-DESKTOP-CLEAN-RUN
```

Each implementation attempt must run in its own visible ChatGPT Desktop task.
WorkItemVerification must use subprocess-level evidence from the installed
plugin path. ChangeIntegration must preserve exact commit, handoff, and test
evidence before the next item becomes ready.

## Release exit condition

A release candidate is ready only when a clean Windows installation can start
the real STDIO MCP server, create and resume a content-addressed run, exercise
the complete required module/Gate circuit for a tiny real software change,
supervise discrete work-item tasks, verify and integrate their outputs, and
reach BusinessAcceptance without fixture adapters or bypassed stages.


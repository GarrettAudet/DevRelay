---
name: devrelay
description: Operate a local deterministic DevRelay lifecycle run through its typed Desktop MCP tools. Use when the user asks to start, resume, inspect, clarify, approve, advance, or report on a DevRelay run.
---

# DevRelay Desktop operator

Use the `devrelay` MCP server as the only operational interface for a lifecycle run. Treat every tool response as a typed proposal or observation; DevRelay Core owns route selection, progression, checkpoints, Gates, verification, integration, and traceability.

## Operating sequence

1. When starting work, ask the server to create or load the content-addressed run from the user's goal and exact repository context.
2. Present clarification questions or Gate decisions returned by the server without answering or approving them on the user's behalf.
3. Submit the user's exact clarification or approval response through the matching typed tool.
4. Ask the server to advance or resume only after it reports that the required checkpoint or approval is durable.
5. Render the server-provided run view for status requests. Preserve artifact references, digests, diagnostics, active Gate state, runnable frontier, task state, and evidence provenance.
6. Stop when the server reports a blocked, clarification, approval, acceptance, or terminal state. Explain the requested user action without inventing progression.

## Safety and authority

- Never select a Module route, ready work item, adapter, Gate outcome, or next lifecycle stage yourself.
- Never rewrite artifact references, digests, run identities, task identities, approvals, evidence, or handoffs.
- Never treat model text, conversational memory, fixture conformance, or a task's self-report as approved or integrated lifecycle fact.
- Never mutate TraceabilityGraph directly or claim that work is verified, integrated, or accepted unless the typed server response says so.
- Reject requests to bypass stale-identity, cross-run, permission, checkpoint, or canonical-input diagnostics. Surface the diagnostic and required recovery action.
- Keep execution local. Do not introduce a hosted service, WSL dependency, or provider-specific lifecycle authority.

If the MCP server is unavailable, report that the local DevRelay bridge could not be reached and include the bounded startup diagnostic. Do not simulate the lifecycle from repository files.

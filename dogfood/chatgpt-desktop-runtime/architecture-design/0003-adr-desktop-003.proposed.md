# Create one Codex app-server task per ready work item

## Status

Proposed

## Context and problem statement

DevRelay needs human-readable run observability and repeating ready-frontier execution without transferring workflow authority to reporting, telemetry, or a mutable scheduler.

## Decision drivers

- Determinism
- Human readability
- Provider neutrality
- Traceability
- Privacy

## Considered options

- OPT-DESKTOP-ONE-TASK-PER-WORK-ITEM
- OPT-DESKTOP-SINGLE-GIANT-IMPLEMENTATION-TURN

## Decision outcome

Chosen: OPT-DESKTOP-ONE-TASK-PER-WORK-ITEM. The selected boundary preserves canonical DevRelay authority while making operational evidence inspectable and comparable.

## Consequences

- Positive: arbitrary circuits remain observable without module-specific renderer branches.
- Negative: structured contracts, content policy, and conformance evidence are required before WorkBreakdown.

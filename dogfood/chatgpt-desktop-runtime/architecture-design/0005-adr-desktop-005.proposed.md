# Release one complete live path and maturity-label alternatives

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

- OPT-DESKTOP-ONE-RELEASE-READY-PATH
- OPT-DESKTOP-ALL-ADAPTERS-LIVE-BEFORE-RELEASE

## Decision outcome

Chosen: OPT-DESKTOP-ONE-RELEASE-READY-PATH. The selected boundary preserves canonical DevRelay authority while making operational evidence inspectable and comparable.

## Consequences

- Positive: arbitrary circuits remain observable without module-specific renderer branches.
- Negative: structured contracts, content policy, and conformance evidence are required before WorkBreakdown.

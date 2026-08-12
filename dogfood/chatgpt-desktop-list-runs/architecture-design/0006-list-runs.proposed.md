# Use store-owned read-only discovery with Core-owned safe projection

## Context and problem statement

Desktop operators need to discover persisted runs without knowing run IDs, while corrupt records and sensitive artifacts must remain isolated.

## Decision

The run store performs non-mutating enumeration and integrity classification. Core projects only the closed safe summary. The MCP bridge validates bounded pagination and carries no repair, route, Gate, graph, or execution authority.

## Consequences

Ordering and cursors are deterministic for the exact store observation. Corrupt entries remain untouched and are represented only by bounded diagnostics.

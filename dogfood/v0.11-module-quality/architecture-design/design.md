# DevRelay V0.11 module-quality architecture change

## Context

The deterministic lifecycle and graph contracts are mature, but several external integrations remain contract-defined or fixture-conformant. Requirements elicitation needs Core-owned adaptive closure, live effects need immutable receipts, traceability needs compact queries, and ChatGPT Desktop on Windows needs an optional production-grade Godot path.

## Decision

Add typed requirements-strategy orchestration, a host-owned provider toolchain manager, a Core-owned receipt and metrics boundary, bounded live specification and architecture adapters, a read-only TraceabilityGraph query service, two-phase Git sealing, repository-scoped Desktop skills, and an optional Godot pack containing Godot AI MCP and GdUnit4 adapters. Generic Core retains routing, closure, validation, checkpointing, traceability, and Gate authority.

## Contract consequence

Provider acquisition, execution receipt, metrics, trace query, evidence seal, Desktop skill bridge, Godot operation, and Godot verification artifacts require machine-validatable contracts before WorkBreakdown.

## Boundaries

No provider owns the workflow. No adapter downloads tools. No Godot dependency enters Generic Core. Raw receipts and metrics remain local. Sentry and PostHog remain disabled and outside V0.11.

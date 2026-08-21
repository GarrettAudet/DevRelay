# DevRelay PM-001 ProjectMemory architecture change

## Context

DevRelay preserves lifecycle artifacts but lacks one authoritative cross-cutting memory baseline and deterministic task conclusion protocol.

## Decision

Add ProjectMemory as a cross-cutting semantic module. Keep ProjectMemoryBaseline authoritative, render CurrentSynopsis.md as its first-loaded projection, use Mem0 only through a bounded provider port, and keep Gate, conclusion, and traceability authority in Core.

## Authority

Modules and providers propose candidates only. Qualitative changes require exact user disposition and ProjectMemoryGate promotion. TraceabilityGraph is accessed only through trusted checkpoint-bound projections and contributors.

## Failure behavior

Missing, stale, conflicting, inaccurate, unconcluded, or provider-unverified memory blocks progression unless a verified equivalent native path satisfies the same contract.

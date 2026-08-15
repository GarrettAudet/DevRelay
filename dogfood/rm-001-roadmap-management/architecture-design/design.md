# DevRelay RM-001 roadmap architecture change

## Context

DevRelay has deterministic construction modules and durable project context, but it lacks a governed place for net-new initiatives and a mandatory fresh-task context receipt.

## Decision

Add one cross-cutting RoadmapManagement semantic module with three explicit operations, a native structured proposer, optional proposer adapters, a Core-owned RoadmapGate, an authoritative RoadmapBaseline with deterministic Roadmap.md projection, and a mandatory DevRelaySessionBootstrap for fresh DevRelay tasks.

## Authority

Adapters propose only. RoadmapGate promotes only exact owner-approved candidates. Session context or conversation memory never substitutes for explicit ModuleInvocation inputs.

## Failure behavior

Missing or stale roadmap/session authority fails closed. An uninitialized roadmap produces RoadmapNotInitialized and routes to baseline establishment while read-only inspection remains available.

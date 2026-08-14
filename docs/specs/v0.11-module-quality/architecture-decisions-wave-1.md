# V0.11 ArchitectureDesign clarification wave 1

Date: 2026-08-13

Stage: `ArchitectureDesign#design-change`

## Bound inputs

- RequirementsBaseline version: `1.9.0`
- RequirementsBaseline digest: `sha256:8f586e039e70f614ccfbf9190cf8f712b2f158529fd0c1f530fa09e72b23eb32`
- ProjectOverviewBaseline version: `1.9.0`
- ProjectOverviewBaseline digest: `sha256:59192795eeb773025158c16a21bc939f86b7113455974d61e5c5a31a5e8a4ffb`
- Architecture route: `design-change`
- ArchitectureDiscovery disposition: `bypassed-existing-approved-baseline`
- Requirements promotion proof: `sha256:2ab55460a599633b6c381c09707add6c2180c76222f9c7a9569c5c6d37d3d477`

## Questions and recommendations

1. **Architecture change shape.** Should V0.11 be one approved architecture change package whose downstream implementation is split into bounded work items? Recommended: yes. This preserves one coherent target design while allowing phased execution.
2. **Requirements strategy composition.** Should RequirementsGathering expose an ordered, typed strategy chain (`explore`, `challenge`, `clarify`, `validate`) whose configured adapters contribute only to declared roles, while Core owns question admission, coverage, closure, and ordering? Recommended: yes.
3. **Provider acquisition authority.** Should a host-owned `ProviderToolchainManager` acquire project-local, checksum-pinned providers only after explicit first-download approval, with adapters forbidden from downloading tools? Recommended: yes.
4. **Live attestation and receipts.** Should a Core-owned cross-cutting `ExecutionReceiptRecorder` canonicalize raw stdout/stderr, exit code, duration, command fingerprint, tool/runtime versions, input/output digests, and redaction disposition for every live adapter execution? Recommended: yes.
5. **Godot packaging.** Should Godot support ship as an optional pack with Godot AI/MCP and GdUnit4 adapters, capability grants, and version-pinned compatibility data, while Generic Core remains domain-neutral and carries no Godot dependency? Recommended: yes.
6. **Queryable traceability.** Should trace queries be exposed through a read-only service/MCP boundary beside TraceabilityGraph, with compact summaries by default and exact evidence expansion on request? Recommended: yes.
7. **Two-phase Git sealing.** Should ChangeIntegration produce the implementation commit first, then a separate evidence-sealing commit bind immutable receipts to that implementation commit, with BusinessAcceptance referencing the seal? Recommended: yes.
8. **Performance telemetry.** Should local-only telemetry attach to `ModuleExecutionRecord` through a cross-cutting metrics service, recording cycle duration, stage waits, retries, cache hits, changed files, test time, and token/tool usage when the host can measure them? Recommended: yes.
9. **Repository skills.** Should the four approved ChatGPT Desktop skills remain repository-scoped under `.agents/skills`, operate as host guidance over DevRelay contracts, and have no independent Gate or graph authority? Recommended: yes.
10. **Upstream boundaries.** Should OpenSpec, Spec Kit, Structurizr, MADR, BMAD, GSD, and Superpowers remain bounded adapters/strategies with exact maturity labels, never whole-workflow owners? Recommended: yes.

## Closure rule

All ten decisions are architecture-blocking. ArchitectureDesign proceeds only after each is approved or replaced with an explicit alternative. Answers are collected as one breadth-first wave; a second wave is emitted only for dependencies or contradictions introduced by the answers.

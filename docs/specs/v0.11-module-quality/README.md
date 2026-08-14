# DevRelay v0.11 module-quality pass

## Goal

Benchmark every released DevRelay lifecycle module and TraceabilityGraph against current maintained upstream engineering workflows, then improve DevRelay where an upstream practice materially strengthens elicitation, correctness, verification, usability, or evidence quality without surrendering Core authority.

## Approved product direction

- RequirementsGathering uses adaptive breadth-first interview waves and mandatory deterministic closure: at least 0.99 weighted coverage, zero blocking unknowns, and zero unresolved contradictions.
- Native and configured interviewing strategies may propose questions and findings; Core alone owns coverage, closure, routing, approval, and baseline promotion.
- Priority provider integrations must be version-pinned and receipt-backed before DevRelay describes them as live-conformant.
- Provider acquisition is host-owned, explicit, project-local, checksum-pinned, and offline-first; adapters cannot download tools.
- A Core-owned execution receipt recorder preserves raw observations, redacted evidence views, command fingerprints, exit codes, durations, versions, and local metrics.
- Godot support is an optional pack using bounded Godot AI and GdUnit4 adapters; Generic Core has no Godot-specific dependency.
- Traceability queries are read-only and compact by default.
- Git evidence uses separate implementation and evidence-seal identities.
- Four repository-scoped ChatGPT Desktop skills guide cycle, Godot release, provider conformance, and trace queries without acquiring workflow authority.
- Sentry and PostHog remain outside V0.11.

## Upstream capability strategy

- GitHub Spec Kit: bounded specification planning, clarification, checklist, analysis, and consistency review.
- BMAD Method, GSD, and Superpowers: useful elicitation practices adopted through typed native strategies unless a separately approved deterministic adapter exists.
- OpenSpec: bounded brownfield requirements, architecture-change, and task proposal operations.
- Structurizr: official parser/export conformance for C4 materialization.
- MADR: bounded architecture-decision rendering and validation.
- Godot AI and GdUnit4: optional Godot inspection, execution, screenshots, input receipts, structured tests, exports, and smoke evidence.

No upstream provider owns DevRelay routing, completion, Gates, promotion, graph mutation, or workflow authority.

## Dogfood circuit

```text
RequirementsGathering
-> RequirementsGate
-> ArchitectureDiscovery (if required)
-> ArchitectureDesign
-> ArchitectureGate
-> ContractGeneration or ApprovedNotApplicable
-> WorkBreakdown
-> WorkBreakdownGate
-> WorkDependencyAnalysis
-> WorkDependencyGate
-> SpecialistAssignment
-> SpecialistAssignmentGate
-> WorkExecution
-> WorkItemVerification
-> ChangeIntegration
-> SystemVerification
-> BusinessAcceptanceGate
```

Every approved module improvement is appended to the released circuit before the next module is changed. TraceabilityGraph and LifecycleRunReport operate across the circuit without controlling progression.

## Current stage

`BusinessAcceptanceGate: accepted`

Construction is complete. All 16 approved work items were executed, independently verified, and integrated through four dependency frontiers. The installed-package Windows dogfood completed all 20 lifecycle components, SystemVerification passed, BusinessAcceptance was recorded, and the final traceability graph has zero blocking diagnostics. See `CURRENT_STATE.md`, `dogfood/v0.11-module-quality/lifecycle-report/module-quality-report.md`, and `dogfood/v0.11-module-quality/final-acceptance/FINAL_ACCEPTANCE.md`.

---
name: devrelay-cycle
description: Run one bounded DevRelay software-engineering improvement through the released deterministic lifecycle. Use for feature, fix, module, adapter, or release work that must preserve requirements, architecture, contracts, work DAG, assignment, execution, verification, integration, traceability, and acceptance evidence in ChatGPT Desktop on Windows.
---

# DevRelay Cycle

1. Read AGENTS.md, ProjectOverview.md, CURRENT_STATUS.md, and the exact project baselines.
2. Run RequirementsGathering interactively in question waves. Continue until mandatory closure; stop with clarify for any unresolved blocking decision.
3. Route through ArchitectureDiscovery only when repository state requires it, then ArchitectureDesign and ArchitectureGate.
4. Run ContractGeneration only when interface intent requires a machine-readable contract; otherwise preserve ApprovedNotApplicable.
5. Run WorkBreakdown, WorkDependencyAnalysis, and SpecialistAssignment. Treat assignment as capability matching only.
6. For each Core-derived ready DAG frontier, run WorkExecution, WorkItemVerification, and ChangeIntegration. Never infer readiness or completion from conversation.
7. Run SystemVerification, then request BusinessAcceptance.
8. Preserve exact artifacts, digests, raw receipts, checkpoints, graph updates, and zero-call replay evidence.
9. Stop on baseline drift, missing evidence, failed verification, unsafe permissions, or unclear product intent.

Core alone owns routing, validation, graph merge, Gate progression, and readiness. This skill never approves a Gate, mutates TraceabilityGraph, selects an operation, installs a provider, or broadens permissions.

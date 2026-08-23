# Next actions

The controlled `v0.10.0-rc.3` GitHub source/library release and its ProjectMemory conclusion are complete. Do not reopen release publication or rebuild its assets.

1. Create a new bounded branch from protected `main` at or after `57459b6d10da277c85e1396343cdb989fd5a9e54`; recommended name: `codex/rp-001-release-preparation`.
2. Load `project/CurrentSynopsis.md` first, then `project/project-memory-baseline.json`, `ProjectOverview.md`, `project/roadmap-baseline.json`, `CURRENT_STATUS.md`, and this handoff package. Verify their exact repository state before work.
3. Select roadmap initiative `RI-98EA0256A27DEFF2`, `ReleasePreparation and ReleaseVerification`. Treat its accepted intake as orientation only; do not infer detailed requirements or implementation authority from it.
4. Run RequirementsGathering visibly in breadth-first question waves until the configured mandatory closure policy passes. Preserve the Windows Desktop boundary, explicit exclusions, accepted EnvironmentPreparation dependency, and all unresolved release-preparation design choices.
5. Promote the paired RequirementsBaseline and ProjectOverviewBaseline only through RequirementsGate. Stop on clarification, drift, missing evidence, or an unapproved product decision.
6. Continue through ArchitectureDesign, ArchitectureGate, ContractGeneration and ContractGate when applicable, WorkBreakdown and Gate, WorkDependencyAnalysis and Gate, SpecialistAssignment and Gate, then the repeating WorkExecution, WorkItemVerification, and ChangeIntegration frontier loop.
7. Before each execution frontier, require an exact accepted EnvironmentPreparation readiness receipt. Finish with SystemVerification, BusinessAcceptance, and `/conclude`.
8. Preserve TraceabilityGraph updates, module and adapter maturity claims, raw receipts, two-phase Git sealing, protected-main checks, and a refreshed self-contained handoff package.

Completion means a requirements-closed, architecture-approved, implemented, verified, integrated, business-accepted, memory-concluded ReleasePreparation/ReleaseVerification increment. Deployment, public npm publication, one-click Desktop installation, hosted operation, and non-Windows support remain out of scope unless a future requirements change explicitly approves them.

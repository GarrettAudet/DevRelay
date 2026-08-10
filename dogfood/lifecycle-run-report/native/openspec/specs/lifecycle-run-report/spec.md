# DevRelay V1 lifecycle and run-report requirements

- Freeze an eighteen-component V1 lifecycle with explicit Contract, WorkBreakdown, WorkDependency, SpecialistAssignment, and BusinessAcceptance Gates.
- After SpecialistAssignment, repeat WorkExecution, WorkItemVerification, and ChangeIntegration for each Core-derived ready DAG frontier, then recalculate readiness from factual integrated completion.
- SpecialistAssignment matches every approved work item to a provider-neutral specialist profile and does not select readiness, schedule, execute, or bind a concrete runtime executor.
- Describe adapter bindings with contract-defined, fixture-conformant, live-conformant, or release-ready maturity rather than implying that every declared plug-in is executable.
- Make a dynamically generated human-readable LifecycleRunReport.md the primary run view, backed by structured records and TraceabilityGraph without controlling progression.
- Build every V1 component, execute one complete end-to-end run, and optimize only after measured run evidence exists.

The report must dynamically represent any circuit shape, lead with a human-readable Markdown view, preserve exact artifact and TraceabilityGraph links, expose only sourced metrics or explicit absence dispositions, distinguish adapter maturity from Core-owned implementations, and remain non-authoritative.

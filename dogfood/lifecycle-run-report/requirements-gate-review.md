# DevRelay V1 lifecycle and run-report Requirements Gate review

Status: **awaiting owner approval**

RequirementsGathering produced one schema-valid, checkpoint-replay-valid full-body requirements change and deterministic ProjectOverview change. It replaces obsolete fourteen-component and SpecialistAssignment statements with the frozen eighteen-component lifecycle, repeating ready-frontier loop, maturity vocabulary, and dynamic human-readable reporting boundary. No baseline promotion or ArchitectureDesign progression is authorized until the owner approves this exact candidate.

## Decisions represented

- **DEC-V1-LIFECYCLE-001:** Freeze an eighteen-component V1 lifecycle with explicit Contract, WorkBreakdown, WorkDependency, SpecialistAssignment, and BusinessAcceptance Gates.
- **DEC-V1-FRONTIER-001:** After SpecialistAssignment, repeat WorkExecution, WorkItemVerification, and ChangeIntegration for each Core-derived ready DAG frontier, then recalculate readiness from factual integrated completion.
- **DEC-SA-BOUNDARY-001:** SpecialistAssignment matches every approved work item to a provider-neutral specialist profile and does not select readiness, schedule, execute, or bind a concrete runtime executor.
- **DEC-ADAPTER-MATURITY-001:** Describe adapter bindings with contract-defined, fixture-conformant, live-conformant, or release-ready maturity rather than implying that every declared plug-in is executable.
- **DEC-RUN-REPORT-001:** Make a dynamically generated human-readable LifecycleRunReport.md the primary run view, backed by structured records and TraceabilityGraph without controlling progression.
- **DEC-V1-E2E-001:** Build every V1 component, execute one complete end-to-end run, and optimize only after measured run evidence exists.

## Exact candidate evidence

- RequirementsBaseline input: sha256:4b072ef574875f3a5659d5e0a33a13564820e32ba866273f6ff2f460b60759b0
- ProjectOverviewBaseline input: sha256:b915cba9e0af8480229611aff735f265d38bd8c1c4d5fabf19b64432549c16bf
- RequirementsChangeSet: sha256:e5b3e637d80093b0ed05497f1b71903993f7230a43b1fb6d83628c9fccbbb8e1
- ProjectOverviewChangeSetDraft: sha256:dce8060598f7e3139debd14b3090c9f7990253eb59b29c2295dc67531a7ff5b1
- Candidate ProjectOverview.md: sha256:a592c999205b8ffba0eb13327cc0f680e091910e9638b82bb6bb5ffd6ccdd930
- NativeSourceBundle: sha256:d53ea72274ccf9a67ba10f15378230a2e166c8123622aa4ba32202153753b16c
- Terminal checkpoint: sha256:49fad8f1cbfeb584d2404eb437da68ab028bcf7e60605c766cf041e489b8f606
- Repository revision: 4bda7fe707ba102bd22fe0001c83aa13ec03b0c5
- Repository tree: sha256:6d27786016084029b7148e33d7200656366120cd986f046d32b9e406c12b33dd

## Gate checks

- PASS: exact current global requirements/project-overview baseline pair supplied
- PASS: V0.4 repository revision and tree bytes are version-pinned and match
- PASS: no unconfirmed blocking assumptions remain
- PASS: obsolete lifecycle and SpecialistAssignment records are replaced rather than contradicted
- PASS: changed-section list is exhaustive and canonical
- PASS: ProjectOverview projection and Markdown bytes are deterministic
- PASS: owner decisions, capability evidence, and bounded OpenSpec native sources are digest-bound
- PASS: the OpenSpec binding is labeled fixture-conformant; no live CLI call is claimed
- PASS: checkpoint replay performs zero adapter reinvocations
- PENDING: owner approval of the exact candidate and atomic baseline-pair promotion

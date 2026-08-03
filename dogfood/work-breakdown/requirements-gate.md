# WorkBreakdown Requirements Gate

Status: **pass**

Decision date: 2026-08-02

The normal RequirementsGathering workflow resolved the operation, input,
trust-boundary, planning-edge, coverage, and downstream-responsibility
boundaries. The latest exact confirmation closes the WorkItemDraft field set;
the same transcript separately preserves the typed add/update/retire delta as a
subsequent ArchitectureDesign decision, not a RequirementsGathering decision.

## Deterministic checks

- Complete: the typed candidate covers objectives, metrics, stakeholders,
  users, capabilities, journey, stories, criteria, NFRs, constraints, scope,
  non-goals, terminology, status, assumptions, risks, deliverables, and evidence.
- Purpose-bound: WorkBreakdown converts approved scope into discrete bounded
  actions and never executes work or builds code.
- State-routed: baseline absence selects establish-breakdown; an exact current
  WorkBreakdownBaseline plus ApprovedChangePackage selects decompose-change.
- Adapter-neutral: adapter choice is configuration-driven; Spec Kit and OpenSpec
  are replaceable defaults and generic Core contains no product route.
- Drift-safe: baseline, disposition, repository commit, and tree mismatches stop
  before adapter invocation with baseline_drift diagnostics and no candidate.
- Work-item closed: each WorkItemDraft contains only id, objective,
  bounded-scope, deliverables, work-type, acceptance-criterion-refs,
  architecture-refs, contract-refs, required-capabilities, dependency-hints,
  verification-plan, required-evidence, and source-refs. Direct requirement-refs
  and user-story-refs are forbidden; upstream linkage is transitive through ACs.
- Covered: every objective has a metric and capability; every user-facing
  capability has journey and story coverage; every criterion is referenced.
- Gate-bounded: WorkBreakdownGate owns scope and reference validity;
  WorkDependencyAnalysis owns the authoritative DAG and ordering policy.
- Traceable: adapters declare domain fields only; the trusted contributor derives
  planning edges, and Core owns validation, checkpoint, atomic merge, and proof.
- Architecture handoff: typed add/update/retire delta representation is approved
  for ArchitectureDesign and is deliberately not promoted as RequirementsGathering
  behavior or attributed to its adapter.
- Canonical: typed records, nested sets, source references, ProjectOverviewDraft,
  and ProjectOverview.md satisfy the released ordering, projection, and rendering
  contracts.
- Execution proof: materialization executes the declared invocation once through
  the released registry, verifies its checkpoint without adapter reinvocation,
  and supplies the in-process receipt to the released Requirements Gate. No
  portable serialized receipt is claimed.

## Atomic promotion

This gate approves the exact RequirementsDraft and ProjectOverviewDraft pair
loaded by the process-local verified-checkpoint receipt. Plain ModuleResult JSON
is insufficient. Both version-aligned baselines must be persisted together with
this same gate evidence, or neither may be persisted.

## Bound artifacts

- ModuleInvocation: sha256:460ebffe5199b959f646321ffff8ecd20ffe832c2e88fa5dd54390096f5b92b9
- ModuleResult: sha256:090de63ab61194e8c857cf308fa8be0255b5db188de70e46cb2a84e4fd6f0cb4
- RequirementsDraft: sha256:0adc23305d536207a488b18a0ce798da0a73d62d721a333d1cd176c640681a04
- ProjectOverviewDraft: sha256:62884e909f576170ca14b20725bdf710e02907dc4c87b0be4c10a9426368ba15
- ProjectOverview.md: sha256:f2240c49db270864df42e48725199e3424fd350615173210e8c59495b30ee4ba
- NativeSourceBundle: sha256:9193f4a2c2c92286efde2e56b28fc7d9a15949ba21baf0d4191ce8e556db8712
- Clarification transcript: sha256:6a8b20f3b798f1180186f2bf0e17f89ba03b52eba906cb3b7b7f1ce32ad19ab4
- GoalArtifact: sha256:9c7be83a649c2d27627b5f5b767e43007962775a3c59aa2c74bfa4b0147040b3
- ProjectContext: sha256:c4154acbf3158e2d3d6e3f6db5bbc794e23c68c0ef09ed714457201f65a977a4
- RepositorySnapshot: sha256:f5da6e8acf059fd26c1c218165f6eb55b2a4748ecd9291c92fc4a30c2e6ac2ba
- Repository commit: 7d3b9c16d4c197bf80dce8279e027b953e32f21a
- Repository tree listing: sha256:1b27077b4c9cb4b749c36241ad50bff8e4af7640470e584980eefd9356e9e161

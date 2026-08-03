# Changelog

All notable DevRelay source releases are recorded here. Module versions are
immutable once released; a semantic contract change requires a new module
version.

## 0.3.0 - 2026-08-02

### Added

- `work-breakdown@0.1.0` with deterministic `establish-breakdown` and
  `decompose-change` routing, exact content-addressed upstream inputs, and a
  pre-adapter `baseline_drift` outcome.
- A closed `WorkItemDraft` contract using deliverable-oriented work types,
  provider-neutral capabilities, non-authoritative dependency hints,
  verification plans, required evidence, and exact source references.
- Complete coverage dispositions and a deterministic WorkBreakdown Gate that
  rejects unscoped work, uncovered approved scope, invalid references, and
  stale typed changes while leaving dependency-DAG policy downstream.
- Checkpoint-only WorkBreakdown Gate promotion that derives its candidate and
  exact inputs from an unforgeable replay receipt, verifies raw baseline bytes,
  and returns an atomic commit payload; plain or cloned results are not
  promotion authority.
- Bounded, replaceable Spec Kit tasks and OpenSpec tasks manifests implementing
  both operations without product-specific Core routing.
- Trusted WorkBreakdown traceability contribution with acceptance-criterion,
  architecture-element, and contract planning edges, plus immutable
  traceability vocabulary `1.1.0` compatibility with exact `1.0.0` artifacts.
- End-to-end dogfood evidence spanning RequirementsGathering,
  ArchitectureDesign, WorkBreakdown, Gate promotion, TraceabilityGraph merge,
  checkpoint replay, and zero-adapter-call baseline drift, with upstream CLI
  limitations recorded explicitly.
- Independent release-audit hardening for attached architecture models,
  upstream and approved-change pre-state coherence, exact graph-node
  membership, revision lineage and mutual exclusion, effect-only adapter
  compatibility, and guard-owned outcomes.
- Semantic-empty graph transitions now retain artifact-reference accounting
  anchors so stale work, planning edges, and contract facts retire without
  asserting implementation progress.

### Release scope

- The source package is `0.3.0`; RequirementsGathering and ArchitectureDesign
  remain at `0.1.0`, and WorkBreakdown is released at `0.1.0`.
- WorkBreakdown plans actions only. Assignment, authoritative dependencies,
  execution, and verification remain downstream responsibilities.
- Live OpenSpec and GitHub Spec Kit command adapters are not shipped.

## 0.2.0 - 2026-08-01

### Added

- Core-owned `TraceabilityGraph` infrastructure with closed graph snapshot,
  standardized update, merge receipt, diagnostic report, and
  `ModuleExecutionRecord` contracts.
- Trusted RequirementsGathering and ArchitectureDesign contributors that
  project validated canonical artifacts without exposing graph state to
  adapters or changing the immutable 0.1.0 Module contracts.
- Checkpoint-first, atomic, idempotent graph application; deterministic retry;
  disjoint stale-update rebase; conflict detection; retirement/supersession
  history; and exact artifact and JSON Pointer provenance.
- Candidate and approved observations as separate authority/scope identities,
  deterministic forward/reverse traversal, and horizon-aware diagnostics for
  orphaned requirements, unscoped work, and missing passing evidence.
- In-memory graph and traceability checkpoint reference stores plus public API,
  schemas, package smoke coverage, and release documentation.

### Release scope

- The source package is `0.2.0`; RequirementsGathering and ArchitectureDesign
  remain at their released `0.1.0` contract versions.
- Durable graph/checkpoint backends and approval-gate contributors remain host
  or future-module responsibilities.

## 0.1.0 - 2026-07-30

### Added

- `requirements-gathering@0.1.0`, with bounded OpenSpec and GitHub Spec Kit
  contract bindings, typed business/product requirements, clarification, and
  optimistic full-body change-set support.
- Deterministic `ProjectOverview.md` projection with digest-bound raw bytes,
  structured ProjectOverview candidates/baselines, and atomic paired
  Requirements Gate promotion. Every approved requirements change creates a
  new paired overview baseline, including when its overview is unchanged.
- `architecture-design@0.1.0`, with deterministic baseline/change routing,
  Spec Kit or OpenSpec designer bindings, Structurizr modeling, MADR decision
  recording, explicit `ProjectOverviewBaseline` context, and
  checkpoint-backed clarification resume that invalidates on context change.
- Generic schema-backed module registration, immutable artifact loading,
  exact adapter chains, evidence validation, and effect checkpoints.
- A source-release package surface with an intentional root API, exact
  dependency pinning, archive verification, and installed-package smoke tests.

### Release scope

- This is a private, source-only release. It is not published to the public npm
  registry.
- OpenSpec, GitHub Spec Kit, Structurizr, and MADR integrations are bounded
  contracts and conformance fixtures. Live upstream command adapters are not
  shipped.
- Requirements and architecture outputs remain candidates. Approval and
  baseline promotion belong to separate gates.
- `ArchitectureDiscovery` is an explicit prerequisite contract but is not an
  executable Module in this release.

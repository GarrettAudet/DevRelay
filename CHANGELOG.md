# Changelog

## 0.9.0 - 2026-08-10

- Added release-ready `architecture-discovery@0.1.0` with deterministic state routing, offline tracked-or-declared native inventory, optional bounded analyzer substitution, observational normalization, Core-owned material-gap clarification, exact checkpoint replay, and candidate-only traceability.
- Added explicit source-transmission consent, opaque evidence byte preservation, real-repository end-to-end dogfood evidence, public package exports, and operator documentation for complete, uncertain, blocked, drifted, resumed, and analyzer-swapped runs.
- Preserved immutable SpecialistAssignment replay generations by advancing WorkExecution to replay-v6 and WorkItemVerification to replay-v7. The remaining full-V1 acceptance gap is LifecycleRunReport.

## 0.8.0 - 2026-08-09

- Added the owner-controlled BusinessAcceptance Gate, exhaustive technical and
  business-scope coverage, exact raw candidate/approval binding, and immutable
  Gate replay.
- Added trusted acceptance traceability and vocabulary 1.5 forward
  `accepted-by` and `verified-by` facts with atomic merge diagnostics.
- Added executable BusinessAcceptance Core, Gate, checkpoint, contributor, and
  graph conformance while keeping full V1 project acceptance pending on
  ArchitectureDiscovery and LifecycleRunReport evidence.

All notable DevRelay source releases are recorded here. Module versions are
immutable once released; a semantic contract change requires a new module
version.

## Unreleased

No changes yet.

## 0.7.0 - 2026-08-08

### Added

- `system-verification@0.1.0` with immutable integrated-system binding,
  deterministic obligation expansion, typed test/review evidence, Core-owned
  policy outcomes, exact checkpoint replay, and trusted forward-only
  acceptance-criterion traceability.
- Fixture-conformant `test-system-verifier@1.0.0` and
  `review-system-verifier@1.0.0` proposer bindings. No external live verifier
  integration is claimed.
- Planning-chain and end-to-end release conformance tests covering verified,
  failed, needs-evidence, baseline drift, verifier substitution, zero-call
  replay, atomic graph merge, and absence of BusinessAcceptance facts.

### Release scope

- SystemVerification may hand a verified result to the separate
  BusinessAcceptance Gate for consideration. This release does not implement
  BusinessAcceptance, deployment, ArchitectureDiscovery, or external tools.

## 0.6.0 - 2026-08-08

### Added

- `specialist-assignment@1.0.0` with A2A Agent Card capability discovery,
  Core-owned eligibility, and a deterministic native ranker that assigns
  provider-neutral specialist profiles without scheduling or execution.
- `work-execution@0.1.0` with exact frontier, assignment, policy, repository,
  retry, checkpoint, and proposer-only executor boundaries.
- `work-item-verification@0.1.0` with explicit obligations, independent
  verifier bindings, evidence normalization, deterministic policy evaluation,
  a separate approval Gate, and forward-only verification traceability.
- `change-integration@0.1.0` with exact verified-subject binding, deterministic
  integration plans, target compare-and-swap, local Git fast-forward,
  merge-commit and cherry-pick strategies, conflict reporting, uncertain-effect
  recovery, closed results, and factual integration traceability.
- A human-readable ChangeIntegration operator and adapter guide, plus one
  visible WorkExecution task per construction work item and exact parent review,
  verification, integration, and retry evidence.

### Verification

- The canonical package gate passes all 612 tests with zero failures after
  isolating historical dogfood promotions from active project baselines.
- The nine-item ChangeIntegration construction DAG is complete, and every item
  has an approved WorkItemVerification result and host-integration fact.
- The private source-package smoke test covers all nine released module
  manifests and 21 bounded plug-in manifests.

### Release scope

- The shipped ChangeIntegration adapter is local Git only. Remote pull-request,
  deployment, SystemVerification, and BusinessAcceptance capabilities remain
  downstream or future extensions.
- A2A, test/review verifier, and local Git bindings are bounded adapters; the
  host remains responsible for runtime supply, durable state, grants, and
  external effects.

## 0.5.0 - 2026-08-05

### Added

- `contract-generation@0.1.0` with deterministic baseline/change routing and a
  Gate-only not-applicable branch selected from exact project state.
- A live deterministic JSON Schema draft 2020-12 generator plus bounded,
  fixture-conformant OpenAPI, AsyncAPI, and Protobuf generator contracts behind
  the same provider-neutral proposal port.
- Core-owned format validation, canonical contract diffing, exact checkpoint
  replay, compatibility policy, and a separate raw-byte-bound Contract Gate.
- Candidate and approved contract traceability with forward-only
  `InterfaceIntent -> contracted-by -> Contract` relationships and atomic merge
  proof.
- Human-readable lifecycle reporting contracts and architecture groundwork for
  dynamically summarizing completed module runs.

### Verification

- Dogfood generated, independently validated, approved, and promoted 14 JSON
  Schema contracts with zero-call replay and restart-safe promotion.
- The 0.5.0 release gate covers all five module manifests and 16 bounded plug-in
  manifests through an installed-package smoke test.

## 0.4.0 - 2026-08-04

### Added

- `work-dependency-analysis@0.1.0` with one deterministic
  `analyze-dependencies` operation over the complete approved
  `WorkBreakdownBaseline` plus version-pinned project and repository context
  slices.
- A native structured dependency proposer as the default, optional Task Master
  and OpenSpec proposal-adapter contracts, and a bounded Spec Kit consistency
  reviewer. Core selects configured roles without product-specific branches.
- Core-owned deterministic snapshot construction, Graphology-DAG mechanics,
  exact OPA WASM policy evaluation, candidate assembly, checkpointing, and
  zero-extension-call replay.
- A separate WorkDependency Gate that derives all approval inputs from an
  unforgeable checkpoint replay receipt, verifies exact approval and baseline
  bytes, and returns the only promotable `WorkDependencyBaseline` payload.
- Trusted post-promotion dependency traceability contribution using only the
  forward planning edge `WorkItem prerequisite -> prerequisite-for -> WorkItem
  dependent`; no inverse edge or implementation claim is stored.
- Traceability vocabulary `1.2.0`, while preserving exact `1.0.0` and `1.1.0`
  validation and avoiding graph-version churn when an update uses only an older
  vocabulary's edge set.
- Dogfood evidence over 11 work items and 10 dependencies, including exact
  context/policy binding, cycle and drift failure boundaries, advisory-review
  separation, OPA denial, traceability authority, and deterministic checkpoint
  replay and promotion evidence.

### Changed

- Established one Gate-validated project-wide DevRelay V1
  `RequirementsBaseline` + `ProjectOverviewBaseline` pair and exact generated
  root `ProjectOverview.md`, recording the complete fourteen-component V1
  lifecycle and conditional ArchitectureDiscovery/ContractGeneration routes.
- Rebound the WorkDependencyAnalysis RequirementsGathering clarification to
  the exact global pair as a requirements change while preserving prior
  module-specific overviews as immutable historical dogfood evidence.
- Corrected TraceabilityGraph documentation to include the released
  WorkBreakdown contributor and planning-only relationships.
- Reworked the WorkDependencyAnalysis ArchitectureDesign candidate into valid
  C4 container/component hierarchy and correctly scoped container/component
  views; added pinned official Structurizr validate/export normalization proof.
- Added `already-designed` architecture coverage for exact unchanged baseline
  entities so new lifecycle links do not churn historical
  `sourceRequirementIds` or manufacture architecture modifications.

### Release scope

- The source package is `0.4.0`; RequirementsGathering, ArchitectureDesign,
  WorkBreakdown, and WorkDependencyAnalysis remain at immutable `0.1.0`
  semantic-module versions.
- WorkDependencyAnalysis produces a static dependency baseline only. Assignment,
  scheduling, execution, and completion facts remain downstream.
- The native structured proposer is shipped. OpenSpec and Task Master proposal
  adapters and the Spec Kit consistency reviewer remain bounded contracts, not
  live upstream command integrations.
- The bundled TraceabilityGraph and checkpoint stores remain in-memory reference
  implementations; production hosts must provide durable atomic stores.

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

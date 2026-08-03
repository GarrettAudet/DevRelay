# Project Overview

## Purpose

Define WorkBreakdown 0.1.0 as one deterministic DevRelay module that converts approved scope into a complete set of bounded, traceable, independently executable and verifiable work-item drafts without executing work or building code.

## Business Objectives

- **`BO-WB-COMPLETENESS-001`** [must] Ensure every authorized requirement, architecture target, and applicable contract concern receives an explicit work coverage disposition.
  - Stakeholders: `STK-WB-MAINTAINER-001`, `STK-WB-WORKFLOW-AUTHOR-001`
- **`BO-WB-DETERMINISM-001`** [must] Make WorkBreakdown routing, input validation, drift detection, result validation, and replay deterministic and auditable.
  - Stakeholders: `STK-WB-MAINTAINER-001`, `STK-WB-WORKFLOW-AUTHOR-001`
- **`BO-WB-MODULARITY-001`** [must] Allow bounded work-breakdown capabilities to be replaced through configuration without changing module semantics or generic Core.
  - Stakeholders: `STK-WB-MAINTAINER-001`, `STK-WB-WORKFLOW-AUTHOR-001`
- **`BO-WB-TRACEABILITY-001`** [must] Preserve exact lineage from approved scope through planned work while keeping graph mutation inside a trusted Core-owned boundary.
  - Stakeholders: `STK-WB-MAINTAINER-001`, `STK-WB-WORKFLOW-AUTHOR-001`

## Users

- **Workflow author** (`USR-WB-WORKFLOW-AUTHOR-001`): A maintainer or integrator converting approved project scope into candidate work items for downstream analysis and execution.
  - Needs: Detect stale inputs before work decomposition.; Inspect complete coverage before approval.; Produce bounded work items from approved scope.; Swap bounded adapters without changing workflow semantics.
  - Stakeholders: `STK-WB-WORKFLOW-AUTHOR-001`

## Key Capabilities

- **Complete scope coverage** (`CAP-WB-COVERAGE-001`): Account explicitly for every authorized requirement, architecture target, and applicable contract concern.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-WB-COMPLETENESS-001`
  - Users: `USR-WB-WORKFLOW-AUTHOR-001`
- **Bounded work decomposition** (`CAP-WB-DECOMPOSITION-001`): Convert approved baseline or change scope into discrete independently executable and verifiable WorkItemDrafts.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-WB-COMPLETENESS-001`, `BO-WB-DETERMINISM-001`
  - Users: `USR-WB-WORKFLOW-AUTHOR-001`
- **Replaceable work-breakdown adapter** (`CAP-WB-EXTENSIBILITY-001`): Resolve one configured provider-neutral adapter binding without coupling an operation to a product implementation.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-WB-MODULARITY-001`
  - Users: `USR-WB-WORKFLOW-AUTHOR-001`
- **Work-breakdown governance** (`CAP-WB-GOVERNANCE-001`): Pin exact inputs, detect drift, validate candidates, preserve evidence, and project planned traceability through a trusted contributor.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-WB-DETERMINISM-001`, `BO-WB-TRACEABILITY-001`
  - Users: `USR-WB-WORKFLOW-AUTHOR-001`

## Success Metrics

- **Core-neutral adapter replacement** (`SM-WB-CORE-NEUTRALITY-001`)
  - Measure: Compatible WorkBreakdown adapter changes requiring a product-specific branch in generic Core.
  - Target: Zero.
  - Measurement method: Execute adapter-swap fixtures and product-identifier scans over generic Core source.
  - Business objectives: `BO-WB-MODULARITY-001`
- **Authorized-scope coverage** (`SM-WB-COVERAGE-001`)
  - Measure: In-scope acceptance criteria, architecture targets or changes, and applicable contract targets or changes with exactly one valid coverage disposition.
  - Target: 100 percent before WorkBreakdown Gate pass.
  - Measurement method: Compare canonical coverage dispositions with the exact approved invocation inputs.
  - Business objectives: `BO-WB-COMPLETENESS-001`
- **Pre-adapter drift detection** (`SM-WB-DRIFT-001`)
  - Measure: Stale baseline, disposition, repository commit, or tree-digest fixtures blocked before adapter invocation.
  - Target: 100 percent with zero adapter calls and no candidate output.
  - Measurement method: Execute independent version, digest, commit, and tree-drift negative fixtures.
  - Business objectives: `BO-WB-DETERMINISM-001`
- **Complete planning provenance** (`SM-WB-TRACEABILITY-001`)
  - Measure: Successful work-breakdown candidates with closed domain references and a verified exact graph merge proof.
  - Target: 100 percent.
  - Measurement method: Validate candidate references, contributor ownership, checkpoint-before-merge ordering, receipt, and result graph lineage.
  - Business objectives: `BO-WB-TRACEABILITY-001`

## Scope

- **`SCOPE-WB-ADAPTERS-001`** Provider-neutral WorkBreakdownAdapter binding plus bounded Spec Kit and OpenSpec default adapter manifests and conformance fixtures.
- **`SCOPE-WB-ARTIFACTS-001`** Canonical state, disposition, approved-change, capability-catalog, work-item, coverage, clarification, revision, draft, change-set, baseline, and diagnostic artifacts.
- **`SCOPE-WB-COVERAGE-GATE-001`** A separate deterministic WorkBreakdown Gate for scope coverage, work-item scope, and reference validity.
- **`SCOPE-WB-DRIFT-001`** Pre-adapter exact baseline, disposition, approved-change-package, repository commit, and tree-digest drift detection.
- **`SCOPE-WB-ROUTING-001`** State-driven establish-breakdown and decompose-change routing with explicit clarification, drift, unable, and failure outcomes.
- **`SCOPE-WB-TRACEABILITY-001`** Trusted deterministic projection of validated work candidates into planning-only TraceabilityGraph relationships and an exact merge proof.
- **`SCOPE-WB-WORK-ITEMS-001`** Complete bounded WorkItemDrafts containing only id, objective, bounded-scope, deliverables, work-type, acceptance-criterion-refs, architecture-refs, contract-refs, required-capabilities, dependency-hints, verification-plan, required-evidence, and source-refs.

## Non-Goals

- **`NG-WB-AUTHORITATIVE-DAG-001`** Construct or validate the authoritative work dependency DAG.
  - Rationale: This belongs to WorkDependencyAnalysis.
- **`NG-WB-CODE-EXECUTION-001`** Execute work, build code, or produce implementation change sets.
  - Rationale: This belongs to WorkExecution and integration stages.
- **`NG-WB-CONTRACT-GENERATION-001`** Generate or approve interface and data contracts.
  - Rationale: WorkBreakdown consumes approved contract context; ContractGeneration owns contract production.
- **`NG-WB-HISTORICAL-RECONSTRUCTION-001`** Reconstruct historical work for an existing project without an approved WorkBreakdownBaseline.
  - Rationale: Such projects establish a current baseline from current approved scope only.
- **`NG-WB-LIVE-CLI-001`** Claim live Spec Kit or OpenSpec CLI interoperability from contract fixtures alone.
  - Rationale: V1 bounded manifests and fixtures prove the boundary; live command adapters require separate evidence.
- **`NG-WB-SPECIALIST-ASSIGNMENT-001`** Select a person, agent, model, provider, or specialist for a work item.
  - Rationale: This belongs to SpecialistAssignment.
- **`NG-WB-WORK-MANAGEMENT-001`** Own estimates, schedules, assignees, status, progress, completion, or verification evidence results.
  - Rationale: Those concerns belong to downstream planning, execution, and verification modules.

## Constraints

- **`CON-WB-ADAPTER-TRUST-001`** [security; capabilities `CAP-WB-GOVERNANCE-001`] A WorkBreakdown adapter cannot receive graph service access, create graph nodes, choose graph relationship kinds, or submit graph mutations.
  - Rationale: Only a trusted versioned contributor may translate a validated canonical domain candidate into graph assertions.
  - Acceptance criteria: `AC-WB-TRACEABILITY-001`
- **`CON-WB-DEPENDENCY-BOUNDARY-001`** [technical; capabilities `CAP-WB-DECOMPOSITION-001`] WorkBreakdown may propose dependency hints but cannot emit or validate the authoritative dependency DAG.
  - Rationale: WorkDependencyAnalysis owns ordering, cycle rejection, missing-dependency detection, and impossible-ordering policy.
  - Acceptance criteria: `AC-WB-GATE-BOUNDARY-001`, `AC-WB-NO-EXECUTION-001`, `AC-WB-WORK-ITEM-CONTRACT-001`
- **`CON-WB-DOWNSTREAM-BOUNDARY-001`** [technical; project] Assignment, ownership, estimates, scheduling, execution status, produced changes, completion edges, and verification results remain downstream concerns.
  - Rationale: WorkBreakdown defines actions; later modules order, assign, perform, and verify them.
  - Acceptance criteria: `AC-WB-NO-EXECUTION-001`
- **`CON-WB-INPUT-IMMUTABILITY-001`** [technical; capabilities `CAP-WB-GOVERNANCE-001`] Baselines, explicit not-applicable dispositions, approved change packages, repository snapshots, capability catalogs, and traceability references must be immutable and content-addressed at invocation.
  - Rationale: Deterministic routing and drift detection require exact current authority rather than labels such as previous or latest.
  - Acceptance criteria: `AC-WB-INPUT-PINNING-001`
- **`CON-WB-NO-EXECUTION-001`** [business; project] WorkBreakdown must not execute work, build code, or claim that a planned action has been completed.
  - Rationale: The module's sole purpose is to produce candidate actions for later deterministic lifecycle modules.
  - Acceptance criteria: `AC-WB-NO-EXECUTION-001`

## Non-Functional Requirements

- **`NFR-WB-ATOMICITY-001`** [reliability; must; capabilities `CAP-WB-GOVERNANCE-001`] A graph-aware successful result must checkpoint the exact validated update before one atomic merge and must return a proof bound to the resulting graph lineage.
  - Measure: Successful graph-aware executions whose update checkpoint, merge receipt, and resulting snapshot verify as one exact lineage.
  - Target: 100 percent; partial or uncheckpointed merges are zero.
  - Acceptance criteria: `AC-WB-TRACEABILITY-001`
- **`NFR-WB-CORE-NEUTRALITY-001`** [maintainability; must; project] Generic Core must resolve WorkBreakdown operations, adapters, contracts, and contributors through declared metadata without product identifiers or WorkBreakdown-specific branches.
  - Measure: Product, adapter, operation, and contributor identifiers used in behavioral branches in generic Core.
  - Target: Zero.
  - Acceptance criteria: `AC-WB-ADAPTER-SELECTION-001`
- **`NFR-WB-DETERMINISM-001`** [reliability; must; capabilities `CAP-WB-DECOMPOSITION-001`, `CAP-WB-GOVERNANCE-001`] The same verified project state, exact invocation and configured adapter binding must select the same operation and enforce the same validation and drift result.
  - Measure: Repeated routing, preflight, validation and drift decisions that match for identical content-addressed inputs.
  - Target: 100 percent.
  - Acceptance criteria: `AC-WB-DECOMPOSE-CHANGE-001`, `AC-WB-DECOMPOSE-ESTABLISH-001`, `AC-WB-INPUT-PINNING-001`
- **`NFR-WB-PROVENANCE-001`** [observability; must; capabilities `CAP-WB-COVERAGE-001`, `CAP-WB-DECOMPOSITION-001`, `CAP-WB-GOVERNANCE-001`] Every work item, coverage disposition, adapter result, source reference, traceability update and execution proof must be attributable to exact immutable inputs without conversational memory.
  - Measure: Successful candidates whose domain entities and merge proof resolve to exact source artifacts and declared locations.
  - Target: 100 percent.
  - Acceptance criteria: `AC-WB-COVERAGE-DISPOSITIONS-001`, `AC-WB-TRACEABILITY-001`, `AC-WB-WORK-ITEM-CONTRACT-001`
- **`NFR-WB-REPLAY-001`** [reliability; must; capabilities `CAP-WB-GOVERNANCE-001`] A durably checkpointed WorkBreakdown execution must be revalidated and replayed for the exact invocation without reinvoking its adapter.
  - Measure: Exact checkpoint replays producing the validated terminal result with zero additional adapter invocations.
  - Target: 100 percent.
  - Acceptance criteria: `AC-WB-OUTPUT-CONTRACT-001`, `AC-WB-TRACEABILITY-001`

## Terminology

- **ApprovedChangePackage** (`TERM-WB-APPROVED-CHANGE-PACKAGE-001`): An immutable authorized delta containing approved requirements and architecture changes, an approved contract change when applicable, and relevant TraceabilityGraph references.
  - Aliases: Approved change package
- **CapabilityCatalog** (`TERM-WB-CAPABILITY-CATALOG-001`): An invocation-pinned provider-neutral catalog of controlled capabilities a WorkItemDraft may require from a later specialist assignment.
  - Aliases: Capability catalog
- **ClarificationContinuation** (`TERM-WB-CLARIFICATION-CONTINUATION-001`): An immutable resumable state artifact returned with a WorkBreakdown clarification request.
  - Aliases: Clarification continuation
- **CoverageDisposition** (`TERM-WB-COVERAGE-DISPOSITION-001`): A complete accounting entry marking authorized scope planned, already-satisfied with evidence, or no-work-required with approval.
  - Aliases: Coverage disposition
- **DependencyHint** (`TERM-WB-DEPENDENCY-HINT-001`): A proposed ordering or dependency observation that has no authority until validated by WorkDependencyAnalysis.
  - Aliases: Dependency hint
- **RevisionRequest** (`TERM-WB-REVISION-REQUEST-001`): An explicit immutable request to revise a WorkBreakdown candidate without relying on an implicit previous draft.
  - Aliases: Revision request
- **WorkBreakdownTraceabilityContributor** (`TERM-WB-TRACEABILITY-CONTRIBUTOR-001`): A trusted versioned projector that derives allowed planning graph assertions from an already validated canonical work-breakdown candidate.
  - Aliases: Work breakdown traceability contributor
- **WorkBreakdownBaseline** (`TERM-WB-WORK-BREAKDOWN-BASELINE-001`): The exact approved current set of planned work against which future authorized changes are decomposed.
  - Aliases: Work breakdown baseline
- **WorkBreakdownChangeSetDraft** (`TERM-WB-WORK-BREAKDOWN-CHANGE-001`): A candidate planned-work delta against an exact current WorkBreakdownBaseline and ApprovedChangePackage.
  - Aliases: Work breakdown change candidate
- **WorkBreakdownDraft** (`TERM-WB-WORK-BREAKDOWN-DRAFT-001`): A complete candidate initial set of planned work for a project with no approved WorkBreakdownBaseline.
  - Aliases: Work breakdown candidate
- **WorkItemDraft** (`TERM-WB-WORK-ITEM-DRAFT-001`): A bounded, traceable, independently executable and verifiable proposed action that has not been ordered, assigned, executed, or verified.
  - Aliases: Work item draft

## Current Status

- Lifecycle: existing
- Phase: planning
- Summary: WorkBreakdown 0.1.0 has completed interactive requirements clarification and is awaiting paired Requirements Gate promotion before ArchitectureDesign.

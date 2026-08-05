# Project Overview

## Purpose

Provide a deterministic, provider-neutral orchestration runtime that turns approved goals into accepted software through explicit modular engineering contracts, evidence, gates, and traceable lifecycle progression.

## Business Objectives

- **`BO-DEV-DETERMINISM-001`** [must] Make software-engineering progression reproducible and fail closed when required inputs, evidence, or approvals are invalid.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-MODULARITY-001`** [must] Allow best-in-class engineering capabilities to be replaced without changing canonical workflow semantics or generic Core.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-QUALITY-001`** [must] Require scoped verification and evidence before work, changes, systems, or business outcomes advance.
  - Stakeholders: `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-TRACEABILITY-001`** [must] Trace every approved business objective through requirements, design, planned work, implementation, verification, integration, and acceptance.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`

## Users

- **Engineering workflow author** (`USR-DEV-WORKFLOW-AUTHOR-001`): A maintainer or engineering lead who configures and operates DevRelay from a goal through business acceptance.
  - Needs: Inspect exact artifacts, decisions, evidence, and progression state.; Run a complete engineering lifecycle without relying on model memory.; Swap compatible adapters without redesigning the workflow.
  - Stakeholders: `STK-DEV-WORKFLOW-AUTHOR-001`

## Key Capabilities

- **Replaceable engineering capabilities** (`CAP-DEV-EXTENSIBILITY-001`): Bind interchangeable bounded adapters to stable provider-neutral module operations.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-DEV-MODULARITY-001`
  - Users: `USR-DEV-WORKFLOW-AUTHOR-001`
- **Deterministic lifecycle orchestration** (`CAP-DEV-LIFECYCLE-001`): Route exact state through the approved V1 lifecycle and stop invalid work before it propagates.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-DEV-DETERMINISM-001`, `BO-DEV-QUALITY-001`
  - Users: `USR-DEV-WORKFLOW-AUTHOR-001`
- **Structured engineering contracts** (`CAP-DEV-SPECIFICATION-001`): Represent requirements, architecture, contracts, work, changes, evidence, and acceptance as versioned artifacts.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-DEV-DETERMINISM-001`, `BO-DEV-TRACEABILITY-001`
  - Users: `USR-DEV-WORKFLOW-AUTHOR-001`
- **Evidence-based verification and acceptance** (`CAP-DEV-VERIFICATION-001`): Require scoped evidence at work-item, integrated-system, and business-acceptance boundaries.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-DEV-QUALITY-001`, `BO-DEV-TRACEABILITY-001`
  - Users: `USR-DEV-WORKFLOW-AUTHOR-001`

## Success Metrics

- **Deterministic progression** (`SM-DEV-DETERMINISM-001`)
  - Measure: Repeated Core-owned routing, validation, replay, and gate decisions for identical content-addressed inputs.
  - Target: 100 percent identical outcomes and digests.
  - Measurement method: Run positive, negative, drift, checkpoint, replay, and gate conformance suites.
  - Business objectives: `BO-DEV-DETERMINISM-001`
- **Adapter-independent semantics** (`SM-DEV-MODULARITY-001`)
  - Measure: Compatible adapter replacements requiring a product-specific behavioral branch in generic Core.
  - Target: Zero branches.
  - Measurement method: Execute adapter replacement fixtures and scan generic Core for product identifiers.
  - Business objectives: `BO-DEV-MODULARITY-001`
- **Verified progression** (`SM-DEV-QUALITY-001`)
  - Measure: Lifecycle transitions occurring without the configured passing evidence and approval record.
  - Target: Zero transitions.
  - Measurement method: Audit module execution records, gate decisions, verification evidence, and acceptance receipts.
  - Business objectives: `BO-DEV-QUALITY-001`
- **Lifecycle trace coverage** (`SM-DEV-TRACEABILITY-001`)
  - Measure: Approved business objectives with a complete trace to implementation and passing verification evidence by BusinessAcceptance.
  - Target: 100 percent or an explicit approved disposition.
  - Measurement method: Run TraceabilityGraph coverage and orphan diagnostics at each lifecycle horizon.
  - Business objectives: `BO-DEV-TRACEABILITY-001`

## Scope

- **`SCOPE-DEV-V1-010-REQUIREMENTS-GATHERING`** RequirementsGathering \[module\]: RequirementsGathering converts an explicit goal and project context into a canonical requirements candidate and deterministic ProjectOverview candidate.
- **`SCOPE-DEV-V1-020-REQUIREMENTS-GATE`** RequirementsGate \[gate\]: RequirementsGate validates and approves one exact RequirementsBaseline and ProjectOverviewBaseline pair before architecture progression.
- **`SCOPE-DEV-V1-030-ARCHITECTURE-DISCOVERY`** ArchitectureDiscovery \[module; conditional\]: ArchitectureDiscovery conditionally establishes a validated current-architecture snapshot for an existing repository that has no architecture baseline.
- **`SCOPE-DEV-V1-040-ARCHITECTURE-DESIGN`** ArchitectureDesign \[module\]: ArchitectureDesign converts approved requirements into a new architecture candidate or a proposed architecture change.
- **`SCOPE-DEV-V1-050-ARCHITECTURE-GATE`** ArchitectureGate \[gate\]: ArchitectureGate validates architectural fitness, evidence, and approval before establishing or updating the ArchitectureBaseline.
- **`SCOPE-DEV-V1-060-CONTRACT-GENERATION`** ContractGeneration \[module; conditional\]: ContractGeneration conditionally produces and validates API, schema, event, protocol, and other machine-readable interface contracts when the approved design requires them.
- **`SCOPE-DEV-V1-070-WORK-BREAKDOWN`** WorkBreakdown \[module\]: WorkBreakdown converts approved scope into a complete set of bounded, traceable, independently executable and verifiable work items without executing them.
- **`SCOPE-DEV-V1-080-WORK-DEPENDENCY-ANALYSIS`** WorkDependencyAnalysis \[module\]: WorkDependencyAnalysis validates authoritative ordering and dependencies between approved work items before assignment or execution.
- **`SCOPE-DEV-V1-090-SPECIALIST-ASSIGNMENT`** SpecialistAssignment \[module\]: SpecialistAssignment selects a compatible human or implementation engine for each ready work item from explicit capability requirements and policy.
- **`SCOPE-DEV-V1-100-WORK-EXECUTION`** WorkExecution \[module\]: WorkExecution performs one authorized work item against exact inputs and returns bounded deliverables, changes, diagnostics, and evidence without owning acceptance.
- **`SCOPE-DEV-V1-110-WORK-ITEM-VERIFICATION`** WorkItemVerification \[module\]: WorkItemVerification checks each executed work item against its verification plan and required evidence before it can enter integration.
- **`SCOPE-DEV-V1-120-CHANGE-INTEGRATION`** ChangeIntegration \[module\]: ChangeIntegration combines individually verified changes in dependency-safe order and records the exact integrated state.
- **`SCOPE-DEV-V1-130-SYSTEM-VERIFICATION`** SystemVerification \[module\]: SystemVerification validates the integrated system across functional, security, performance, operational, documentation, and other configured quality policies.
- **`SCOPE-DEV-V1-140-BUSINESS-ACCEPTANCE`** BusinessAcceptance \[module\]: BusinessAcceptance evaluates the verified system against approved business objectives, success metrics, scope, and acceptance criteria and records the final disposition.

## Non-Goals

- **`NG-DEV-AI-WRAPPER-001`** Build another monolithic coding agent or AI-provider wrapper.
  - Rationale: DevRelay standardizes deterministic engineering workflow rather than code generation.
- **`NG-DEV-IMPLICIT-AUTHORITY-001`** Treat model confidence, adapter output, chat history, or successful execution as implicit approval.
  - Rationale: Only explicit validated gates and evidence authorize progression.
- **`NG-DEV-UPSTREAM-REIMPLEMENTATION-001`** Reimplement full upstream tools such as OpenSpec, Spec Kit, Structurizr, or MADR inside Core.
  - Rationale: DevRelay invokes only bounded replaceable capabilities.
- **`NG-DEV-V1-SCOPE-EXPANSION-001`** Add lifecycle modules outside the approved V1 inventory without a new requirements change and overview baseline.
  - Rationale: V1 scope must remain deliberate and auditable.

## Constraints

- **`CON-DEV-ARTIFACT-CONTRACTS-001`** [technical; project] Every stage must exchange canonical structured artifacts and cannot rely on conversational memory as authority.
  - Rationale: Explicit artifacts make lifecycle state reproducible and verifiable.
  - Acceptance criteria: `AC-DEV-ARTIFACT-HANDOFF-001`
- **`CON-DEV-GATE-SEPARATION-001`** [business; project] Producing modules cannot approve or promote their own candidates; configured gates own progression decisions.
  - Rationale: Separate authority prevents production from becoming self-approval.
  - Acceptance criteria: `AC-DEV-GATE-PROGRESSION-001`
- **`CON-DEV-MODULE-INVENTORY-001`** [business; project] V1 lifecycle scope is limited to the fourteen owner-approved components recorded in the project overview.
  - Rationale: A closed inventory prevents silent V1 scope expansion.
  - Acceptance criteria: `AC-DEV-CONDITIONAL-ROUTING-001`, `AC-DEV-FULL-V1-SCOPE-001`
- **`CON-DEV-PROVIDER-NEUTRAL-001`** [technical; project] Canonical Core and module contracts cannot depend on one AI model, provider, IDE, or external engineering product.
  - Rationale: The workflow owns engineering semantics; tools only perform bounded capabilities.
  - Acceptance criteria: `AC-DEV-ADAPTER-BOUNDARY-001`, `AC-DEV-MODEL-INDEPENDENCE-001`

## Non-Functional Requirements

- **`NFR-DEV-DETERMINISM-001`** [reliability; must; project] Core-owned routing, validation, checkpoint replay, traceability projection, and gate preparation must be deterministic for exact inputs.
  - Measure: Canonical route, result, diagnostic, update, and receipt digest equality.
  - Target: 100 percent equality for deterministic Core-owned behavior.
  - Acceptance criteria: `AC-DEV-RESUME-001`
- **`NFR-DEV-PORTABILITY-001`** [compatibility; must; project] Canonical lifecycle contracts must remain independent of IDE, AI provider, model, operating host, and bounded external tool.
  - Measure: Compatible host and adapter substitutions requiring canonical contract changes.
  - Target: Zero substitutions.
  - Acceptance criteria: `AC-DEV-MODEL-INDEPENDENCE-001`
- **`NFR-DEV-TRACEABILITY-001`** [observability; must; project] Every accepted lifecycle assertion must retain exact artifact, contributor, execution, authority, and graph-version provenance.
  - Measure: Accepted graph assertions lacking complete resolvable provenance.
  - Target: Zero assertions.
  - Acceptance criteria: `AC-DEV-TRACEABILITY-001`

## Terminology

- **Conditional module** (`TERM-DEV-CONDITIONAL-MODULE-001`): A lifecycle module invoked only when exact Core-owned state and approved policy satisfy its declared condition.
- **Engineering gate** (`TERM-DEV-ENGINEERING-GATE-001`): A separate validation and approval boundary that decides whether an exact candidate may become an approved baseline or progress downstream.
  - Aliases: Gate
- **Module** (`TERM-DEV-MODULE-001`): A provider-neutral lifecycle contract defining exact inputs, action, outputs, outcomes, evidence, and progression boundary.
  - Aliases: Engineering module
- **ProjectOverviewBaseline** (`TERM-DEV-PROJECT-OVERVIEW-001`): The compact approved project-wide context deterministically projected from the paired RequirementsBaseline and explicitly supplied to downstream modules.
  - Aliases: Project overview
- **TraceabilityGraph** (`TERM-DEV-TRACEABILITY-GRAPH-001`): A Core-owned cross-cutting lifecycle index that records validated artifact relationships beside the module sequence without becoming a workflow stage.
  - Aliases: Traceability graph

## Current Status

- Lifecycle: existing
- Phase: planning
- Summary: DevRelay V1 scope is fixed at fourteen lifecycle components. RequirementsGathering, ArchitectureDesign, WorkBreakdown, and the TraceabilityGraph sidecar are implemented; WorkDependencyAnalysis is the next module under requirements clarification.

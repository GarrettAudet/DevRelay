# Project Overview

## Purpose

Provide a deterministic, provider-neutral orchestration runtime that turns approved goals into accepted software through explicit modular engineering contracts, evidence, gates, and traceable lifecycle progression.

## Business Objectives

- **`BO-DEV-DETERMINISM-001`** [must] Make software-engineering progression reproducible and fail closed when required inputs, evidence, or approvals are invalid.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-MODULARITY-001`** [must] Allow best-in-class engineering capabilities to be replaced without changing canonical workflow semantics or generic Core.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-OBSERVABILITY-001`** [must] Make every DevRelay run understandable and measurable to a human across any configured number of modules, Gates, adapters, retries, and parallel frontiers.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-QUALITY-001`** [must] Require scoped verification and evidence before work, changes, systems, or business outcomes advance.
  - Stakeholders: `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-DEV-TRACEABILITY-001`** [must] Trace every approved business objective through requirements, design, planned work, implementation, verification, integration, and acceptance.
  - Stakeholders: `STK-DEV-MAINTAINER-001`, `STK-DEV-OWNER-001`, `STK-DEV-WORKFLOW-AUTHOR-001`
- **`BO-WDA-CORRECTNESS-001`** [must] Prevent invalid, cyclic, incomplete, or impossible dependency plans from reaching assignment and execution.
  - Stakeholders: `STK-WDA-MAINTAINER-001`, `STK-WDA-WORKFLOW-AUTHOR-001`
- **`BO-WDA-MODULARITY-001`** [must] Replace dependency-analysis capabilities without changing canonical semantics or generic Core.
  - Stakeholders: `STK-WDA-ADAPTER-AUTHOR-001`, `STK-WDA-MAINTAINER-001`
- **`BO-WDA-PARALLEL-SAFETY-001`** [must] Provide authoritative ordering sufficient for downstream systems to identify safely runnable work.
  - Stakeholders: `STK-WDA-EXECUTION-HOST-001`, `STK-WDA-WORKFLOW-AUTHOR-001`

## Users

- **Engineering workflow author** (`USR-DEV-WORKFLOW-AUTHOR-001`): A maintainer or engineering lead who configures and operates DevRelay from a goal through business acceptance.
  - Needs: Gauge lifecycle and adapter performance without inspecting raw JSON or inventing unavailable metrics.; Inspect exact artifacts, decisions, evidence, and progression state.; Read one concise report of what happened, why progression changed, and where the evidence lives.; Run a complete engineering lifecycle without relying on model memory.; Swap compatible adapters without redesigning the workflow.
  - Stakeholders: `STK-DEV-WORKFLOW-AUTHOR-001`
- **Dependency-planning workflow author** (`USR-WDA-WORKFLOW-AUTHOR-001`): A maintainer or host operator who runs and reviews dependency analysis before assignment.
  - Needs: Approve only a valid and reviewed DAG.; Obtain an evidence-backed dependency proposal.; Resolve blocking dependency findings.
  - Stakeholders: `STK-WDA-WORKFLOW-AUTHOR-001`

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
- **Human-readable lifecycle run reporting** (`CAP-DEV-RUN-REPORTING-001`): Project standardized execution, Gate, observation, artifact, adapter-maturity, and traceability records into one dynamic human-readable run report.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-DEV-OBSERVABILITY-001`
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
- **Work dependency analysis** (`CAP-WDA-ANALYZE-001`): Analyze an approved work breakdown and propose directed dependencies and dispositions.
  - Priority: must
  - Audience: internal
  - Business objectives: `BO-WDA-CORRECTNESS-001`, `BO-WDA-MODULARITY-001`, `BO-WDA-PARALLEL-SAFETY-001`
  - Users: `USR-WDA-WORKFLOW-AUTHOR-001`
- **Dependency Gate verification** (`CAP-WDA-GATE-001`): Validate graph mechanics and semantic policy before authoritative promotion.
  - Priority: must
  - Audience: internal
  - Business objectives: `BO-WDA-CORRECTNESS-001`, `BO-WDA-PARALLEL-SAFETY-001`
  - Users: `USR-WDA-WORKFLOW-AUTHOR-001`

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
- **Complete human-readable run coverage** (`SM-DEV-RUN-COVERAGE-001`)
  - Measure: Attempted and completed circuit components, outcomes, adapter bindings, artifacts, Gates, and rework represented in the generated report.
  - Target: 100 percent of standardized run records represented without a hard-coded module inventory.
  - Measurement method: Generate reports for serial, conditional, skipped, failed, resumed, parallel, and repeating-frontier fixtures and reconcile every source record.
  - Business objectives: `BO-DEV-OBSERVABILITY-001`
- **Observable engineering efficiency** (`SM-DEV-RUN-EFFICIENCY-001`)
  - Measure: Captured execution time, human wait, adapter calls, retries, checkpoint hits, replay savings, tokens, cost, Gate rework, and coverage metrics.
  - Target: Every configured metric has an exact value or an explicit captured, not-reported, or not-applicable disposition.
  - Measurement method: Compare the structured run snapshot with host observations, checkpoint records, Gate proofs, and the rendered Markdown report.
  - Business objectives: `BO-DEV-OBSERVABILITY-001`
- **Lifecycle trace coverage** (`SM-DEV-TRACEABILITY-001`)
  - Measure: Approved business objectives with a complete trace to implementation and passing verification evidence by BusinessAcceptance.
  - Target: 100 percent or an explicit approved disposition.
  - Measurement method: Run TraceabilityGraph coverage and orphan diagnostics at each lifecycle horizon.
  - Business objectives: `BO-DEV-TRACEABILITY-001`
- **Generic Core product branches** (`SM-WDA-CORE-SPECIAL-CASES-001`)
  - Measure: WorkDependencyAnalysis, Spec Kit, or OpenSpec identifier branches in generic Core.
  - Target: Zero branches.
  - Measurement method: Run static special-case scans and adapter-replacement conformance tests.
  - Business objectives: `BO-WDA-MODULARITY-001`
- **Unsafe runnable frontier** (`SM-WDA-FRONTIER-SAFETY-001`)
  - Measure: Work items exposed as runnable while an authoritative predecessor remains incomplete.
  - Target: Zero items across graph fixtures.
  - Measurement method: Derive runnable frontiers from approved DAG fixtures and predecessor completion state.
  - Business objectives: `BO-WDA-PARALLEL-SAFETY-001`
- **Invalid dependency progression** (`SM-WDA-INVALID-PROGRESSION-001`)
  - Measure: Invalid endpoint, duplicate or self edge, cycle, unresolved missing dependency, or impossible ordering cases reaching an approved baseline.
  - Target: Zero cases.
  - Measurement method: Run positive and negative WorkDependency Gate fixtures and inspect exact promotion receipts.
  - Business objectives: `BO-WDA-CORRECTNESS-001`

## Scope

- **`SCOPE-DEV-RUN-REPORTING-001`** Cross-cutting RunLedger and LifecycleRunReport projection that dynamically records what happened, renders a primary human-readable Markdown report, joins exact traceability, and exposes sourced performance evidence without controlling the lifecycle.
- **`SCOPE-DEV-V1-010-REQUIREMENTS-GATHERING`** RequirementsGathering \[module\]: RequirementsGathering converts an explicit goal and project context into a canonical requirements candidate and deterministic ProjectOverview candidate.
- **`SCOPE-DEV-V1-020-REQUIREMENTS-GATE`** RequirementsGate \[gate\]: RequirementsGate validates and approves one exact RequirementsBaseline and ProjectOverviewBaseline pair before architecture progression.
- **`SCOPE-DEV-V1-030-ARCHITECTURE-DISCOVERY`** ArchitectureDiscovery \[module; conditional\]: ArchitectureDiscovery conditionally establishes a validated current-architecture snapshot for an existing repository that has no architecture baseline.
- **`SCOPE-DEV-V1-040-ARCHITECTURE-DESIGN`** ArchitectureDesign \[module\]: ArchitectureDesign converts approved requirements into a new architecture candidate or a proposed architecture change.
- **`SCOPE-DEV-V1-050-ARCHITECTURE-GATE`** ArchitectureGate \[gate\]: ArchitectureGate validates architectural fitness, evidence, and approval before establishing or updating the ArchitectureBaseline.
- **`SCOPE-DEV-V1-060-CONTRACT-GENERATION`** ContractGeneration \[module; conditional\]: ContractGeneration produces candidate machine-readable API, schema, event, protocol, data, or other interface contracts only when approved architecture intent requires them.
- **`SCOPE-DEV-V1-065-CONTRACT-GATE`** ContractGate \[gate\]: ContractGate validates exact generated contracts or authorizes an explicit ApprovedNotApplicable disposition before work planning.
- **`SCOPE-DEV-V1-070-WORK-BREAKDOWN`** WorkBreakdown \[module\]: WorkBreakdown converts approved scope into a complete set of bounded, traceable, independently executable and verifiable work items without executing them.
- **`SCOPE-DEV-V1-075-WORK-BREAKDOWN-GATE`** WorkBreakdownGate \[gate\]: WorkBreakdownGate validates complete approved-scope coverage and promotes the exact WorkBreakdownBaseline without deciding dependency order.
- **`SCOPE-DEV-V1-080-WORK-DEPENDENCY-ANALYSIS`** WorkDependencyAnalysis \[module\]: WorkDependencyAnalysis validates authoritative ordering and dependencies between approved work items before assignment or execution.
- **`SCOPE-DEV-V1-085-WORK-DEPENDENCY-GATE`** WorkDependencyGate \[gate\]: WorkDependencyGate validates graph mechanics, policy, consistency evidence, semantic completeness, and exact approval before promoting the static WorkDependencyBaseline.
- **`SCOPE-DEV-V1-090-SPECIALIST-ASSIGNMENT`** SpecialistAssignment \[module\]: SpecialistAssignment matches every approved work item to a provider-neutral specialist profile satisfying required capabilities without selecting readiness, scheduling, or binding a concrete executor.
- **`SCOPE-DEV-V1-095-SPECIALIST-ASSIGNMENT-GATE`** SpecialistAssignmentGate \[gate\]: SpecialistAssignmentGate validates complete work-item assignment coverage, capability satisfaction, policy, grants, rationale, and approval before runtime executor binding.
- **`SCOPE-DEV-V1-100-WORK-EXECUTION`** WorkExecution \[module; repeating frontier\]: WorkExecution binds an authorized ready work item and approved specialist profile to an exact runtime executor, performs only that bounded work, and returns a candidate ChangeSet without owning verification or integration.
- **`SCOPE-DEV-V1-110-WORK-ITEM-VERIFICATION`** WorkItemVerification \[module; repeating frontier\]: WorkItemVerification evaluates each executed work item against its verification plan, acceptance criteria, and required evidence before integration.
- **`SCOPE-DEV-V1-120-CHANGE-INTEGRATION`** ChangeIntegration \[module; repeating frontier\]: ChangeIntegration incorporates verified ChangeSets under dependency-safe policy, records factual integrated completion, and enables Core to derive the next ready frontier.
- **`SCOPE-DEV-V1-130-SYSTEM-VERIFICATION`** SystemVerification \[module\]: SystemVerification validates the integrated system across functional, security, performance, operational, documentation, and other configured quality policies.
- **`SCOPE-DEV-V1-140-BUSINESS-ACCEPTANCE`** BusinessAcceptanceGate \[gate\]: BusinessAcceptanceGate evaluates the exact SystemVerification result against approved business objectives, success metrics, scope, acceptance criteria, and required evidence and records the final disposition.
- **`SCOPE-WDA-ADAPTERS-001`** Bounded replaceable analysis manifests and conformance fixtures.
- **`SCOPE-WDA-ANALYSIS-001`** Provider-neutral dependency analysis bound to exact WorkBreakdown and upstream context.
- **`SCOPE-WDA-ARTIFACTS-001`** Dependency state, policy, hint-disposition, edge, finding, candidate, baseline, clarification, diagnostic, and Gate evidence artifacts.
- **`SCOPE-WDA-CONTEXT-SLICES-001`** Version-pinned relevant context slicing and pre-proposer coherence validation.
- **`SCOPE-WDA-GATE-001`** A separate Gate for graph mechanics, semantic policy, approval, and exact promotion.
- **`SCOPE-WDA-OPA-001`** Pinned OPA policy bundle evaluation and normalized decision evidence.
- **`SCOPE-WDA-REVIEW-001`** A bounded post-proposal consistency-review slot with Spec Kit as the V1 binding.
- **`SCOPE-WDA-TRACEABILITY-001`** A trusted contributor and candidate-to-approved authority transition.

## Non-Goals

- **`NG-DEV-AI-WRAPPER-001`** Build another monolithic coding agent or AI-provider wrapper.
  - Rationale: DevRelay standardizes deterministic engineering workflow rather than code generation.
- **`NG-DEV-IMPLICIT-AUTHORITY-001`** Treat model confidence, adapter output, chat history, or successful execution as implicit approval.
  - Rationale: Only explicit validated gates and evidence authorize progression.
- **`NG-DEV-METRIC-FABRICATION-001`** Infer missing duration, token, cost, wait, success, or maturity values from absent or incomplete host observations.
  - Rationale: Explicit absence dispositions are more trustworthy than fabricated precision.
- **`NG-DEV-RUN-REPORT-AUTHORITY-001`** Turn the run report, operational telemetry, or performance score into a workflow controller or approval authority.
  - Rationale: Reporting observes trusted workflow facts; it does not create or promote them.
- **`NG-DEV-UPSTREAM-REIMPLEMENTATION-001`** Reimplement full upstream tools such as OpenSpec, Spec Kit, Structurizr, or MADR inside Core.
  - Rationale: DevRelay invokes only bounded replaceable capabilities.
- **`NG-DEV-V1-SCOPE-EXPANSION-001`** Add lifecycle modules outside the approved V1 inventory without a new requirements change and overview baseline.
  - Rationale: V1 scope must remain deliberate and auditable.
- **`NG-WDA-ASSIGNMENT-001`** Choose a specialist, model, agent, or human.
  - Rationale: SpecialistAssignment owns executor selection.
- **`NG-WDA-CONTROL-PLANE-001`** Introduce a distributed scheduler, agent framework, provider wrapper, or general control plane.
  - Rationale: This release is an incremental module slice.
- **`NG-WDA-EXECUTION-001`** Execute, implement, test, or verify a work item.
  - Rationale: Those effects belong downstream.
- **`NG-WDA-SCHEDULING-001`** Persist schedules, estimates, capacity, or runtime execution waves.
  - Rationale: Scheduling depends on changing runtime state.

## Constraints

- **`CON-DEV-ARTIFACT-CONTRACTS-001`** [technical; project] Every stage must exchange canonical structured artifacts and cannot rely on conversational memory as authority.
  - Rationale: Explicit artifacts make lifecycle state reproducible and verifiable.
  - Acceptance criteria: `AC-DEV-ARTIFACT-HANDOFF-001`
- **`CON-DEV-GATE-SEPARATION-001`** [business; project] Producing modules cannot approve or promote their own candidates; configured gates own progression decisions.
  - Rationale: Separate authority prevents production from becoming self-approval.
  - Acceptance criteria: `AC-DEV-GATE-PROGRESSION-001`
- **`CON-DEV-MODULE-INVENTORY-001`** [business; project] V1 lifecycle scope is limited to the eighteen owner-approved components and repeating execution-frontier rule recorded in the project overview; TraceabilityGraph and LifecycleRunReport remain cross-cutting infrastructure rather than additional stages.
  - Rationale: A frozen V1 boundary enables one complete end-to-end run before evidence-driven optimization or later deployment and operations extensions.
  - Acceptance criteria: `AC-DEV-FULL-V1-SCOPE-001`
- **`CON-DEV-PROVIDER-NEUTRAL-001`** [technical; project] Canonical Core and module contracts cannot depend on one AI model, provider, IDE, or external engineering product.
  - Rationale: The workflow owns engineering semantics; tools only perform bounded capabilities.
  - Acceptance criteria: `AC-DEV-ADAPTER-BOUNDARY-001`, `AC-DEV-MODEL-INDEPENDENCE-001`
- **`CON-DEV-RUN-REPORT-NON-AUTHORITY-001`** [technical; project] Run observations and reports cannot participate in semantic artifact identity, Gate authority, evidence satisfaction, routing, or progression.
  - Rationale: Operational telemetry may be incomplete or host-dependent and must not change deterministic engineering outcomes.
  - Acceptance criteria: `AC-DEV-RUN-NON-AUTHORITY-001`
- **`CON-WDA-NO-EXECUTION-001`** [technical; capabilities `CAP-WDA-ANALYZE-001`, `CAP-WDA-GATE-001`] WorkDependencyAnalysis is analysis and approval, not assignment, scheduling, or execution.
  - Rationale: Separate lifecycle authority prevents planned ordering from becoming an execution claim.
  - Acceptance criteria: `AC-WDA-NO-EXECUTION-001`
- **`CON-WDA-PROVIDER-NEUTRAL-001`** [technical; capabilities `CAP-WDA-ANALYZE-001`] Canonical contracts and Core cannot depend on a model, Spec Kit, OpenSpec, or another analyzer product.
  - Rationale: Analysis tools must remain replaceable.
  - Acceptance criteria: `AC-WDA-PLUGIN-BOUNDARY-001`
- **`CON-WDA-TRACE-DIRECTION-001`** [technical; capabilities `CAP-WDA-ANALYZE-001`, `CAP-WDA-GATE-001`] Traceability stores forward dependency assertions only and derives reverse traversal at query time.
  - Rationale: One direction avoids duplicated inconsistent facts.
  - Acceptance criteria: `AC-WDA-TRACEABILITY-001`

## Non-Functional Requirements

- **`NFR-DEV-DETERMINISM-001`** [reliability; must; project] Core-owned routing, validation, checkpoint replay, traceability projection, and gate preparation must be deterministic for exact inputs.
  - Measure: Canonical route, result, diagnostic, update, and receipt digest equality.
  - Target: 100 percent equality for deterministic Core-owned behavior.
  - Acceptance criteria: `AC-DEV-RESUME-001`
- **`NFR-DEV-PORTABILITY-001`** [compatibility; must; project] Canonical lifecycle contracts must remain independent of IDE, AI provider, model, operating host, and bounded external tool.
  - Measure: Compatible host and adapter substitutions requiring canonical contract changes.
  - Target: Zero substitutions.
  - Acceptance criteria: `AC-DEV-MODEL-INDEPENDENCE-001`
- **`NFR-DEV-RUN-REPORT-DETERMINISM-001`** [reliability; must; project] Given the same standardized run records, graph snapshot, maturity records, and rendering contract, Core must produce byte-identical structured and Markdown run reports.
  - Measure: Canonical snapshot digest and raw LifecycleRunReport.md digest equality across insertion orders and replays.
  - Target: 100 percent equality for identical report inputs.
  - Acceptance criteria: `AC-DEV-RUN-DYNAMIC-001`, `AC-DEV-RUN-HUMAN-READABLE-001`
- **`NFR-DEV-RUN-REPORT-OBSERVABILITY-001`** [observability; must; project] The run-reporting surface must preserve enough sourced operational evidence to separate active work, queueing, human approval wait, retries, replay, rework, and unavailable measurements.
  - Measure: Percentage of configured report metrics carrying exact provenance or an explicit absence disposition.
  - Target: 100 percent.
  - Acceptance criteria: `AC-DEV-RUN-METRICS-001`
- **`NFR-DEV-RUN-REPORT-PRIVACY-001`** [privacy; must; project] Human-readable reports must minimize sensitive content while preserving content-addressed audit links and explicit redaction or omission dispositions.
  - Measure: Secret-scanning and redaction-policy conformance over structured and Markdown report fixtures.
  - Target: Zero unapproved secret or credential disclosures.
  - Acceptance criteria: `AC-DEV-RUN-SECURITY-001`
- **`NFR-DEV-TRACEABILITY-001`** [observability; must; project] Every accepted lifecycle assertion must retain exact artifact, contributor, execution, authority, and graph-version provenance.
  - Measure: Accepted graph assertions lacking complete resolvable provenance.
  - Target: Zero assertions.
  - Acceptance criteria: `AC-DEV-TRACEABILITY-001`
- **`NFR-WDA-DETERMINISM-001`** [reliability; must; capabilities `CAP-WDA-ANALYZE-001`, `CAP-WDA-GATE-001`] Routing, mechanical validation, canonical ordering, replay, and Gate commit preparation must be deterministic for exact inputs.
  - Measure: Canonical output, diagnostic, route, and replay digest equality.
  - Target: 100 percent equality for deterministic Core-owned behavior.
  - Acceptance criteria: `AC-WDA-DETERMINISM-001`

## Terminology

- **Adapter binding maturity** (`TERM-DEV-ADAPTER-MATURITY-001`): The evidence-backed implementation state of one exact adapter binding: contract-defined, fixture-conformant, live-conformant, or release-ready.
  - Aliases: Adapter maturity
- **Conditional module** (`TERM-DEV-CONDITIONAL-MODULE-001`): A lifecycle module invoked only when exact Core-owned state and approved policy satisfy its declared condition.
- **Engineering gate** (`TERM-DEV-ENGINEERING-GATE-001`): A separate validation and approval boundary that decides whether an exact candidate may become an approved baseline or progress downstream.
  - Aliases: Gate
- **Lifecycle run report** (`TERM-DEV-LIFECYCLE-RUN-REPORT-001`): The deterministic human-readable projection of one exact circuit run, its operational records, important artifacts, Gate decisions, performance observations, and traceability snapshot.
  - Aliases: Run report
- **Module** (`TERM-DEV-MODULE-001`): A provider-neutral lifecycle contract defining exact inputs, action, outputs, outcomes, evidence, and progression boundary.
  - Aliases: Engineering module
- **ProjectOverviewBaseline** (`TERM-DEV-PROJECT-OVERVIEW-001`): The compact approved project-wide context deterministically projected from the paired RequirementsBaseline and explicitly supplied to downstream modules.
  - Aliases: Project overview
- **Run ledger** (`TERM-DEV-RUN-LEDGER-001`): An append-only, content-addressed sequence of standardized module, Gate, adapter, checkpoint, approval, observation, and progression records for one run.
  - Aliases: Execution ledger
- **Run observation** (`TERM-DEV-RUN-OBSERVATION-001`): A non-authoritative host-recorded measurement such as duration, calls, tokens, cost, wait, retry, or checkpoint use, bound to an exact execution identity and explicit availability disposition.
  - Aliases: Execution observation
- **TraceabilityGraph** (`TERM-DEV-TRACEABILITY-GRAPH-001`): A Core-owned cross-cutting lifecycle index that records validated artifact relationships beside the module sequence without becoming a workflow stage.
  - Aliases: Traceability graph
- **WorkBreakdown analysis snapshot** (`TERM-WDA-ANALYSIS-SNAPSHOT-001`): The complete immutable projection of one exact approved WorkBreakdownBaseline used as the work-item universe for a single full dependency analysis.
  - Aliases: Candidate work-breakdown snapshot
- **Context slice** (`TERM-WDA-CONTEXT-SLICE-001`): A deterministic, relevance-declared extraction from one immutable version-pinned source artifact, supplied as explicit analyzer input with its own content digest.
- **Work dependency DAG** (`TERM-WDA-DEPENDENCY-DAG-001`): A directed acyclic graph where each forward edge says one predecessor must complete before one successor may start.
  - Aliases: Dependency graph
- **Dependency hint disposition** (`TERM-WDA-HINT-DISPOSITION-001`): The evidence-backed treatment of one non-authoritative WorkBreakdown dependency hint.
- **Impossible ordering** (`TERM-WDA-IMPOSSIBLE-ORDERING-001`): A dependency forbidden by exact domain, architecture, contract, repository, or policy evidence even when acyclic.
- **Runnable frontier** (`TERM-WDA-RUNNABLE-FRONTIER-001`): Work items whose authoritative predecessors are complete under current runtime state.
  - Aliases: Ready set

## Current Status

- Lifecycle: existing
- Phase: planning
- Summary: The revised V1 lifecycle, repeating execution frontier, narrow SpecialistAssignment boundary, adapter maturity model, and human-readable dynamic run-report requirements are confirmed and ready for Requirements Gate review.

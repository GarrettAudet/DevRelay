# Project Overview

## Purpose

Define ArchitectureDesign 0.1.0 as one deterministic DevRelay module that converts an approved RequirementsBaseline into either a new architecture baseline candidate or a proposed change to an existing architecture, using a configured chain of bounded, replaceable adapters.

## Business Objectives

- **`BO-ARCH-DETERMINISM-001`** [must] Make architecture workflow selection and execution deterministic and replayable.
  - Stakeholders: `STK-ARCH-MAINTAINER-001`, `STK-ARCH-WORKFLOW-AUTHOR-001`
- **`BO-ARCH-MODULARITY-001`** [must] Allow bounded best-in-class architecture capabilities to be replaced independently.
  - Stakeholders: `STK-ARCH-MAINTAINER-001`, `STK-ARCH-WORKFLOW-AUTHOR-001`
- **`BO-ARCH-TRACEABILITY-001`** [must] Produce traceable architecture candidates ready for separate approval.
  - Stakeholders: `STK-ARCH-MAINTAINER-001`, `STK-ARCH-WORKFLOW-AUTHOR-001`

## Users

- **Workflow author** (`USR-ARCH-WORKFLOW-AUTHOR`): A maintainer or integrator configuring DevRelay architecture workflows.
  - Needs: Design a change against an approved architecture baseline.; Establish a new architecture baseline candidate.; Inspect exact evidence and gate readiness.
  - Stakeholders: `STK-ARCH-WORKFLOW-AUTHOR-001`

## Key Capabilities

- **Canonical architecture candidates** (`CAP-ARCH-ARTIFACTS`): Produce complete, immutable, traceable architecture candidate artifacts.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-ARCH-TRACEABILITY-001`
  - Users: `USR-ARCH-WORKFLOW-AUTHOR`
- **Replaceable architecture adapter chain** (`CAP-ARCH-CHAIN`): Execute designer, modeler, and decision-recorder handoffs in order.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-ARCH-MODULARITY-001`
  - Users: `USR-ARCH-WORKFLOW-AUTHOR`
- **Architecture gate readiness** (`CAP-ARCH-GOVERNANCE`): Separate candidate generation from approval and prove conformance.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-ARCH-TRACEABILITY-001`
  - Users: `USR-ARCH-WORKFLOW-AUTHOR`
- **ArchitectureDesign module boundary** (`CAP-ARCH-MODULE`): Expose one module with two explicit state-routed operations.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-ARCH-DETERMINISM-001`
  - Users: `USR-ARCH-WORKFLOW-AUTHOR`
- **Architecture state routing** (`CAP-ARCH-ROUTING`): Select baseline, change, or discovery prerequisite from persisted state.
  - Priority: must
  - Audience: user-facing
  - Business objectives: `BO-ARCH-DETERMINISM-001`
  - Users: `USR-ARCH-WORKFLOW-AUTHOR`

## Success Metrics

- **Complete candidate provenance** (`SM-ARCH-PROVENANCE-001`)
  - Measure: Successful primary candidates with verified complete chain provenance.
  - Target: 100 percent.
  - Measurement method: Execute artifact, native-source, handoff, and traceability validation.
  - Business objectives: `BO-ARCH-TRACEABILITY-001`
- **Deterministic route conformance** (`SM-ARCH-ROUTING-001`)
  - Measure: Declared ArchitectureDesign routing fixtures that select exactly one expected route.
  - Target: 100 percent.
  - Measurement method: Execute positive and negative deterministic router tests.
  - Business objectives: `BO-ARCH-DETERMINISM-001`
- **Adapter replaceability** (`SM-ARCH-SWAP-001`)
  - Measure: Compatible adapter swaps requiring a generic-core code branch.
  - Target: Zero.
  - Measurement method: Execute adapter-swap and core-neutrality tests.
  - Business objectives: `BO-ARCH-MODULARITY-001`

## Scope

- **`SCOPE-ARCH-001`** One ArchitectureDesign module with establish-baseline and design-change operations.
- **`SCOPE-ARCH-002`** Deterministic operation routing from persisted project architecture state.
- **`SCOPE-ARCH-003`** A prerequisite ArchitectureDiscovery route for existing repositories without a current architecture snapshot.
- **`SCOPE-ARCH-004`** Ordered designer, modeler, and decision-recorder adapter steps.
- **`SCOPE-ARCH-005`** Canonical ArchitectureDraft and ArchitectureChangeSetDraft artifacts.
- **`SCOPE-ARCH-006`** Step handoffs, clarification checkpoints, native-source preservation, validation, conformance fixtures, and documentation.
- **`SCOPE-ARCH-007`** V1 adapter manifests for Spec Kit plan, OpenSpec design, Structurizr, and MADR.

## Non-Goals

- **`NG-ARCH-001`** Requirements approval logic beyond the recorded Requirements Gate.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.
- **`NG-ARCH-002`** Architecture approval or ArchitectureBaseline promotion, which belongs to the Architecture Gate.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.
- **`NG-ARCH-003`** A complete ArchitectureDiscovery module implementation.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.
- **`NG-ARCH-004`** Detailed OpenAPI, AsyncAPI, protobuf, database, or other interface contract generation.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.
- **`NG-ARCH-005`** Architecture enforcement, security review, performance verification, task decomposition, code generation, or integration.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.
- **`NG-ARCH-006`** Installation or execution of upstream Spec Kit, OpenSpec, Structurizr, or MADR tooling.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.
- **`NG-ARCH-007`** A distributed scheduler, agent framework, provider wrapper, package marketplace, or model-specific workflow.
  - Rationale: This responsibility belongs to another explicit lifecycle stage or release.

## Constraints

- **`CON-ARCH-APPROVED-REQUIREMENTS`** [business; capabilities `CAP-ARCH-MODULE`] ArchitectureDesign must consume an approved RequirementsBaseline.
  - Rationale: Architecture work must start from approved requirements.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-REQUIREMENTS-001`
- **`CON-ARCH-BOUNDED-CAPABILITY`** [technical; capabilities `CAP-ARCH-CHAIN`] Each adapter manifest must bind only the relevant upstream capability for its declared ArchitectureDesign step; DevRelay must not treat an upstream repository's full workflow as one module.
  - Rationale: Bounded capabilities preserve module ownership and permit independent best-in-class replacement.
  - Acceptance criteria: `AC-ARCH-BOUNDED-CAPABILITY-001`, `AC-ARCH-BOUNDED-CAPABILITY-002`
- **`CON-ARCH-CANDIDATE-ONLY`** [business; capabilities `CAP-ARCH-GOVERNANCE`] ArchitectureDesign produces candidates only; it cannot approve or promote its own result.
  - Rationale: Approval belongs to the separate Architecture Gate.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-CANDIDATE-001`
- **`CON-ARCH-CORE-AUTHORITY`** [technical; capabilities `CAP-ARCH-ROUTING`] DevRelay Core, not a model or adapter, selects the operation, configured adapters, sequence, validation path, and gate progression.
  - Rationale: DevRelay Core retains deterministic workflow authority.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-CORE-001`
- **`CON-ARCH-IMMUTABLE-BOUNDARIES`** [technical; capabilities `CAP-ARCH-ARTIFACTS`] Every runtime boundary uses immutable artifact references and exact adapter versions.
  - Rationale: Replay and verification require immutable boundaries.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-IMMUTABLE-001`
- **`CON-ARCH-INTERFACE-BOUNDARY`** [technical; capabilities `CAP-ARCH-ARTIFACTS`] ArchitectureDesign must capture interface intent and architectural constraints, while detailed API, event, data, and protocol contracts remain in downstream ContractGeneration.
  - Rationale: Architecture should define boundaries without collapsing a later deterministic lifecycle stage.
  - Acceptance criteria: `AC-ARCH-INTERFACE-BOUNDARY-001`
- **`CON-ARCH-PROVIDER-NEUTRALITY`** [technical; capabilities `CAP-ARCH-CHAIN`] Module contracts remain provider-neutral and cannot branch on adapter or upstream-tool identifiers in generic core.
  - Rationale: The kernel must remain independently extensible.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-NEUTRALITY-001`
- **`CON-ARCH-REQUIREMENTS-COMPATIBILITY`** [compatibility; capabilities `CAP-ARCH-GOVERNANCE`] The implementation must preserve compatibility with RequirementsGathering 0.1.0.
  - Rationale: The new module must compose with the released requirements boundary.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-COMPATIBILITY-001`
- **`CON-ARCH-SMALL-KERNEL`** [technical; capabilities `CAP-ARCH-MODULE`] The first pass must remain small enough to prove modular composition without creating a general workflow platform.
  - Rationale: The proof must not become a general workflow platform.
  - Acceptance criteria: `AC-ARCH-CONSTRAINT-SCOPE-001`
- **`CON-ARCH-V1-ADAPTERS`** [technical; capabilities `CAP-ARCH-CHAIN`] The V1 default chain must use SpecKitPlanAdapter for establish-baseline or OpenSpecDesignAdapter for design-change, followed by StructurizrAdapter and MADRAdapter.
  - Rationale: These are selected V1 implementations of stable semantic step contracts, not hard-coded kernel behavior.
  - Acceptance criteria: `AC-ARCH-V1-ADAPTERS-001`, `AC-ARCH-V1-ADAPTERS-002`, `AC-ARCH-V1-ADAPTERS-003`

## Non-Functional Requirements

- **`NFR-ARCH-CONFORMANCE`** [reliability; must; capabilities `CAP-ARCH-GOVERNANCE`] The implementation must include positive and negative schema, routing, registry, chain, artifact, clarification, provenance, backward-compatibility, and core-neutrality tests.
  - Measure: Required schema, routing, chain, artifact, clarification, provenance, compatibility, and neutrality checks passing.
  - Target: 100 percent.
  - Acceptance criteria: `AC-ARCH-CONFORMANCE-001`, `AC-ARCH-CONFORMANCE-002`, `AC-ARCH-CONFORMANCE-003`
- **`NFR-ARCH-PROVENANCE`** [observability; must; capabilities `CAP-ARCH-ARTIFACTS`] Every step handoff and primary output must preserve exact input, adapter, native-source, normalization, and output provenance without relying on conversational or provider session memory.
  - Measure: Percentage of step handoffs and primary outputs with complete exact provenance.
  - Target: 100 percent.
  - Acceptance criteria: `AC-ARCH-PROVENANCE-001`, `AC-ARCH-PROVENANCE-002`

## Terminology

- **Bounded adapter** (`TERM-ARCH-ADAPTER-001`): A replaceable implementation of one declared module operation or step capability.
- **ArchitectureBaseline** (`TERM-ARCH-BASELINE-001`): An approved architecture state used as the target for future changes.
  - Aliases: Architecture baseline
- **ArchitectureChangeSetDraft** (`TERM-ARCH-CHANGE-001`): A proposed change against an exact approved ArchitectureBaseline.
  - Aliases: Architecture change candidate
- **ArchitectureDraft** (`TERM-ARCH-DRAFT-001`): A candidate new architecture baseline that has not passed the Architecture Gate.
  - Aliases: Baseline candidate

## Current Status

- Lifecycle: existing
- Phase: implementation
- Summary: ArchitectureDesign 0.1.0 is being implemented against an approved typed requirements candidate.

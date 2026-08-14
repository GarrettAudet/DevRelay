# Feature Specification: Live Requirements Provider Conformance

**Feature Branch**: `not-applicable-fixture`

**Created**: 2026-08-14

**Status**: Ready for DevRelay normalization

**Input**: User description: "Prove that a version-pinned Spec Kit requirements capability can produce a bounded native specification for DevRelay without receiving Gate or workflow authority."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect real provider evidence (Priority: P1)

As a ChatGPT Desktop operator, I want DevRelay to preserve an exact native specification created through the pinned provider capability so that I can distinguish live execution from a contract-only binding.

**Why this priority**: Provider provenance is the release-blocking integration-depth concern.

**Independent Test**: Initialize the isolated fixture with the exact provider, resolve its active template, materialize this specification, and verify every resulting file digest and command receipt.

**Acceptance Scenarios**:

1. **Given** the exact project-local provider is available, **When** the requirements capability runs, **Then** the native specification and quality checklist are preserved with exact provenance.
2. **Given** the provider is missing or its version drifts, **When** the capability is requested, **Then** DevRelay reports the provider unavailable and does not silently fall back.

### Edge Cases

- A generated provider file that contains Gate, graph, approval, or progression authority is rejected during normalization.
- An incomplete checklist cannot be reported as a ready requirements artifact.
- Reordered or modified native bytes produce a different digest and require new evidence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: DevRelay MUST select the provider from explicit configuration rather than model improvisation.
- **FR-002**: DevRelay MUST bind the exact provider version, installation digest, capability, request, and native output bytes.
- **FR-003**: The provider MUST remain limited to proposing requirements artifacts.
- **FR-004**: DevRelay Core MUST retain validation, Gate, traceability merge, and progression authority.
- **FR-005**: A missing, drifting, malformed, or non-zero provider execution MUST fail explicitly without an implicit fallback.
- **FR-006**: Native artifacts MUST be archived before canonical normalization.

### Key Entities

- **Provider Binding**: The exact provider identity, version, installation, capability, and configuration.
- **Native Artifact Bundle**: The exact provider-created files and their content digests.
- **Host Attestation**: The trusted observation that binds command, timing, output, exit status, and native artifacts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of live-provider results include an exact version, request digest, command receipt, and native artifact digest.
- **SC-002**: 100% of provider-missing, version-drift, malformed-output, and non-zero-exit fixtures terminate without a canonical Gate candidate.
- **SC-003**: Two runs over identical native inputs produce byte-identical canonical requirements output.
- **SC-004**: Operators can determine provider maturity and provenance from one bounded result without inspecting conversational history.

## Assumptions

- The official Spec Kit v0.16.3 tag and resolved commit are the approved source for this fixture.
- The generated Codex requirements capability is invoked only inside this isolated evidence root.
- The placeholder constitution contains no adopted project principles and therefore adds no normative constraint.
- Public package publication and hosted-provider execution are outside this work item.

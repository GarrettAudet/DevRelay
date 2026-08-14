## Capability

CAP-LIVE-001 supports BO-LIVE-001 for USR-LIVE-001 with source evidence from the pinned provider manifest.

## User Journeys

### Journey: Validate a bounded provider artifact

UJ-LIVE-001 starts when USR-LIVE-001 requests conformance, invokes CAP-LIVE-001, preserves the observation, and ends with reviewable evidence.

## User Stories

### Story: Inspect provider conformance

US-LIVE-001: As USR-LIVE-001, I want CAP-LIVE-001 to preserve the exact OpenSpec validation result so that I can distinguish live execution from a contract-only binding. Covered by AC-LIVE-001.

## ADDED Requirements

### Requirement: Strict OpenSpec validation is host-observed

The system SHALL invoke the exact project-local OpenSpec 1.9.0 executable and SHALL preserve its strict validation output without granting the provider Gate or progression authority.

#### Scenario: Valid requirements-only artifact

- **WHEN** the trusted host invokes `openspec validate --all --strict` in the isolated conformance root
- **THEN** the command exits successfully and its exact execution evidence is available to DevRelay Core

## Acceptance Criteria

### Criterion: Live execution is distinguishable

AC-LIVE-001 links US-LIVE-001 and passes only when the exact OpenSpec version, command, exit code, stdout, stderr, native artifacts, and host attestation are preserved.

## Non-Functional Requirements

NFR-LIVE-001 requires deterministic semantic validation for identical fixture bytes and is covered by AC-LIVE-001.

## Constraints

CON-LIVE-001 forbids floating versions, adapter-owned downloads, provider-authored approval, and silent native fallback.

## Boundaries

This artifact contains requirements only; it does not contain architecture, tasks, implementation steps, approval, or graph operations.

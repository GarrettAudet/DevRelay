## Purpose

Prove that DevRelay can invoke a version-pinned OpenSpec requirements capability, preserve its native artifacts, and keep progression authority in DevRelay Core.

## Business Objectives

- BO-LIVE-001: Produce independently reproducible provider execution evidence.

## Success Metrics

- SM-LIVE-001: OpenSpec 1.9.0 strict validation exits successfully for this bounded fixture.

## Stakeholders

- STK-LIVE-001: DevRelay maintainers need trustworthy provider conformance evidence.

## Users

- USR-LIVE-001: ChatGPT Desktop operators inspect the resulting evidence.

## Capabilities

- CAP-LIVE-001: Validate requirements-only native artifacts without granting workflow authority.

## Scope

- SCOPE-LIVE-001: OpenSpec schema validation, artifact validation, and output archival.

## Non-Goals

- NG-LIVE-001: OpenSpec does not approve requirements or select the next DevRelay stage.

## Constraints

- CON-LIVE-001: The provider version and project-local installation are exact and immutable during execution.

## Non-Functional Requirements

- NFR-LIVE-001: Repeated validation of identical bytes MUST produce the same semantic result.

## Terminology

- TERM-LIVE-001: Live-conformant means a trusted host observed the real provider execute.

## Current Status

V0.11 conformance fixture; no production project state is modified.

## Assumptions And Open Questions

- ASM-LIVE-001: OpenSpec 1.9.0 is the approved pinned provider; status confirmed; blocking false; source is the official npm registry metadata.

## Dependencies, Risks, Deliverables, And Required Evidence

The fixture depends on the project-local OpenSpec installation. Required evidence is the exact command, version, exit code, stdout, stderr, native artifact digests, and host attestation.

## Change Summary

Initial isolated conformance baseline.

## Boundaries

No architecture, tasks, implementation, Gate approval, graph mutation, or progression claim is included.

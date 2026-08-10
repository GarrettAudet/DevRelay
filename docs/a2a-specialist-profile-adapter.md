# A2A Specialist Profile Adapter

Status: **fixture-conformant**. Protocol target: **A2A 1.0**.

## Role

`A2AProfileAdapter` is a profile-source adapter for `SpecialistAssignment`. It imports an exact, version-pinned A2A Agent Card and normalizes declared skills into a proposed DevRelay `SpecialistProfile`.

Every A2A skill ID requires an explicit, reviewed mapping to canonical `CapabilityCatalog` IDs. Names, descriptions, examples, and tags are non-authoritative and never grant capabilities. The normalized profile preserves the source version, content digest, optional URI, and per-skill mapping evidence. Tools and grants remain separately declared evidence and are never inferred from a skill.

## Authority boundary

The adapter may propose profiles only. DevRelay Core validates catalogs, composes intrinsic capability requirements with project policy, computes exact eligible sets, rejects uncovered work, and independently checks solver output. `SpecialistAssignmentGate` alone promotes a complete baseline.

The adapter does not discover live endpoints, authenticate, test availability, invoke A2A tasks, schedule work, mutate the dependency DAG, bind runtimes, or write `TraceabilityGraph`. Live A2A communication belongs to a future `WorkExecution` adapter.

## Failure and rollback

Unknown or unmapped skills fail closed. Modified Agent Card bytes require a new source digest and candidate. Rollback is configuration-only: remove the A2A profile source and use the native file-based `SpecialistCatalog`; Core eligibility and assignment contracts remain unchanged.

## Promotion criteria

Promotion from fixture-conformant to live-conformant requires validation against the official A2A schema, signed-card/source verification where configured, compatibility fixtures for the pinned protocol version, and a real discovery/import conformance test. No upstream package or service is required for the V1 fixture binding.
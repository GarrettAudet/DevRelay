# DevRelay V0.10 public OSS source/library preview design

## Context

The accepted 0.9.0 source is deterministic, but its packed artifact omits two declared ArchitectureDiscovery exports and its repository is not yet prepared for the approved Apache-2.0/DCO public GitHub preview.

## Decision

Add a bounded Release Tooling container. Derive the public-subpath inventory only from package.json exports, materialize an installable tarball without registry publication, install it in a clean consumer, exercise every expanded export on the supported Windows/Node matrix, assemble exact release evidence, and expose a host-enforced GitHub promotion adapter. Generic Core and lifecycle Gates retain all progression authority.

## Contract consequence

The expanded PackageExportInventory, ReleaseCandidateEvidenceSet, and GitHubPromotionRequest require JSON Schema contracts before WorkBreakdown.

## Boundaries

The design does not add an npm publisher, Desktop plug-in, hosted backend, or release-specific branch inside Generic Core.

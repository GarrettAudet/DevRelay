# Changelog

All notable DevRelay source releases are recorded here. Module versions are
immutable once released; a semantic contract change requires a new module
version.

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

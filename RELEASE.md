# DevRelay source release

## Release identity

This repository packages DevRelay Core, `requirements-gathering@0.1.0`,
`architecture-discovery@0.1.0`, `architecture-design@0.1.0`, `contract-generation@0.1.0`,
`work-breakdown@0.1.0`, `work-dependency-analysis@0.1.0`,
`specialist-assignment@1.0.0`,
`work-execution@0.1.0`, `work-item-verification@0.1.0`, and
`change-integration@0.1.0`, and `system-verification@0.1.0` as one private
source release, version `0.9.0`. The source package also advances the immutable TraceabilityGraph
vocabulary to current `1.5.0` acceptance semantics while preserving
exact `1.0.0` and `1.1.0` support.

`package.json` intentionally retains `"private": true` and
`"license": "UNLICENSED"`. Do not run `npm publish`. The local package tarball
is a verification and controlled-distribution artifact, not a public npm
release.

## Supported release surface

- Node.js 20 and 22.
- The public JavaScript API exported by `src/index.mjs`.
- JSON Schema contracts under `contracts/`.
- Versioned module and bounded adapter manifests under `examples/modules/` and
  `examples/plugins/`.
- OpenSpec bridge schemas under `openspec/`.
- Typed requirements, deterministic ProjectOverview projection/rendering,
  atomic paired Requirements Gate validation, and ArchitectureDesign's explicit
  project-overview context contract through the public JavaScript API.
- ArchitectureDiscovery deterministic state routing, offline tracked-or-declared native inventory, optional bounded analyzer port, observational normalization, Core-owned confidence and material-gap policy, exact checkpoint replay, trusted candidate-only traceability, and explicit source-transmission consent through the public API.
- WorkBreakdown state routing, pre-adapter baseline drift detection, closed
  work-item and coverage contracts, typed change application, deterministic
  checkpoint-only Gate validation, raw-byte-bound baseline commit payloads,
  and exact project-overview context through the public API.
- Release-audited WorkBreakdown handoffs: exact attached architecture-model
  resolution, architecture/upstream and approved-change pre-state coherence,
  authoritative graph-node membership, revision-control lineage and mutual
  exclusion, effect-only compatible adapters, and Core-reserved guard
  outcomes.
- WorkDependencyAnalysis full-snapshot routing, native structured proposals,
  Core-owned Graphology-DAG mechanics, exact OPA WASM policy evaluation,
  bounded advisory review, deterministic checkpoints, and a separate
  raw-byte-bound WorkDependency Gate through the public API.
- ContractGeneration state routing, live JSON Schema generation, independent
  format validation, canonical compatibility diffing, checkpoint replay, and a
  separate raw-byte-bound Contract Gate through the public API.
- SpecialistAssignment A2A profile discovery, Core-owned eligibility, deterministic
  ranking, and separate assignment Gate authority.
- WorkExecution exact readiness, assignment, policy, repository, retry, and
  checkpoint boundaries with a proposer-only executor port.
- WorkItemVerification obligation expansion, independent verifier binding,
  normalized evidence, deterministic policy evaluation, approval Gate, and
  verification traceability.
- ChangeIntegration exact verified-subject binding, integration planning, target
  compare-and-swap, bounded local Git effects, conflict and uncertain-effect
  recovery, closed outcomes, and factual integration traceability.
- SystemVerification immutable integrated-system binding, complete
  acceptance-criterion and NFR obligations, typed test/review evidence,
  deterministic policy outcomes, zero-call replay, and trusted forward-only
  verification traceability without BusinessAcceptance authority.
- Closed TraceabilityGraph snapshot, update, receipt, diagnostic-report, and
  ModuleExecutionRecord contracts through the public JavaScript API.
- Trusted RequirementsGathering, ArchitectureDesign, ContractGeneration,
  WorkBreakdown, and WorkDependencyAnalysis contributors; exact planning-edge authority;
  legacy/current vocabulary
  compatibility; checkpoint-first idempotent application; optimistic disjoint
  rebase; forward/reverse traversal; and lifecycle coverage diagnostics.
- Artifact-reference accounting anchors for semantic-empty transitions, so
  stale WorkItem planning edges and contract facts retire deterministically
  without inventing implementation progress.
- Explicit assumption blocking/source provenance, checkpoint-only gate proof
  through an in-process unforgeable replay receipt, and raw-byte-bound baseline
  commit payloads. Portable cross-process verification receipts are not
  included in V1.

The bundled graph and traceability checkpoint stores are in-memory reference
implementations. Production hosts must supply durable atomic stores. Gate
contributors require explicit validated Gate context; successful module results
never imply approval.

Live OpenSpec, GitHub Spec Kit, Task Master, Structurizr, and MADR command
adapters are not included. The manifests define bounded capabilities and the
tests exercise contract adapters and fixtures. WorkDependencyAnalysis does
ship its provider-neutral native structured proposer; OpenSpec and Task Master
remain optional proposal contracts, and Spec Kit remains a bounded advisory
review contract. ContractGeneration ships its deterministic JSON Schema
generator; OpenAPI, AsyncAPI, and Protobuf remain fixture-conformant contracts.
ChangeIntegration ships a bounded local Git adapter. SystemVerification ships
fixture-conformant test and review verifier bindings only; remote repository,
pull-request, deployment, live external verification, and BusinessAcceptance
integrations are not included.
Release notes and user-facing descriptions must preserve that
distinction. ArchitectureDiscovery ships its executable provider-neutral Core building blocks and deterministic native inventory binding. Optional analyzers remain contract-defined and are not claimed live-conformant.

Source-checkout Architecture Gate evidence may invoke a pinned official
Structurizr validator and JSON exporter to prove that a native workspace
normalizes into its canonical DevRelay candidate. This is a conformance
verifier, not a shipped command adapter.

The source checkout also carries one Gate-validated project-wide DevRelay V1
RequirementsBaseline and ProjectOverviewBaseline under `project/`, with the
exact generated root `ProjectOverview.md` recording all fourteen approved
lifecycle components. These repository-operating artifacts are intentionally
outside the controlled npm tarball surface.

## Reproduce the release checks

From a clean checkout:

```sh
npm ci
npm run release:check
```

`release:check` performs all of the following without leaving a tarball in the
working tree:

1. Parses every repository JSON file.
2. syntax-checks every `.mjs` file.
3. rejects CR or CRLF in versioned text.
4. runs the complete test suite.
5. verifies the mandatory final release digest catalog.
6. builds an allowlisted package in a temporary directory.
7. installs that tarball offline and smoke-tests the package root,
   TraceabilityGraph surface, and all eleven module manifests from a disposable
   consumer.

Use `npm run verify` for the static checks and test suite without packaging.

## Release checklist

- [ ] Work from a clean checkout of the intended commit.
- [ ] Confirm package, RequirementsGathering, ArchitectureDesign,
      WorkBreakdown, and WorkDependencyAnalysis versions.
- [ ] Confirm paired Requirements/ProjectOverview promotion and explicit
      ArchitectureDesign project-overview input coverage.
- [ ] Confirm WorkBreakdown drift blocks before adapter entry and the Gate
      rejects unscoped, uncovered, stale, or invalid-reference candidates using
      only an unforgeable replay receipt and exact baseline bytes.
- [ ] Confirm WorkDependencyAnalysis uses the complete pinned work-breakdown
      snapshot, rejects cycles and policy violations, and promotes only the
      exact replay-bound candidate and baseline bytes.
- [ ] Confirm the trusted dependency contributor stores only forward
      `prerequisite-for` planning edges and records the atomic graph merge proof.
- [ ] Confirm graph-aware execution checkpoints before merge, retries without
      adapter reinvocation, and proves the exact applied update.
- [ ] Confirm candidate/approved scope separation, contributor ownership, and
      orphan/unscoped/missing-evidence diagnostics.
- [ ] Confirm `npm run release:check` passes on Node 20 and Node 22.
- [ ] Review the package file list and mandatory release digest catalog.
- [ ] Confirm the no-live-command-adapters limitation remains visible.
- [ ] Review `CHANGELOG.md`, security guidance, and residual risks.
- [ ] Merge through the normal review process.
- [ ] Create any source archive and checksum only from the reviewed commit.

Publishing, pushing, tagging, or attaching a release is a separate,
owner-authorized action.

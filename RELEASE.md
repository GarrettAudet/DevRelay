# DevRelay source release

## Release identity

This repository packages DevRelay Core, `requirements-gathering@0.1.0`,
`architecture-discovery@0.1.0`, `architecture-design@0.1.0`, `contract-generation@0.1.0`,
`work-breakdown@0.1.0`, `work-dependency-analysis@0.1.0`,
`specialist-assignment@2.0.0` (with the immutable `1.0.0` manifest retained),
`work-execution@0.1.0`, `work-item-verification@0.1.0`, and
`change-integration@0.1.0`, `system-verification@0.1.0`, the cross-cutting
`roadmap-management@0.1.0`, `project-memory@0.1.0`, `quality-policy@0.1.0`,
`work-continuity@0.1.0`, `project-control@0.1.0`, and the separate
`business-acceptance-gate@0.1.0` as one Apache-2.0
open-source release candidate, version `0.11.0-rc.2`. The source package retains `1.5.0` as the compatibility default and adds
explicit `1.6.0` execution-attempt semantics while preserving historical
vocabulary support.

The `0.11.0-rc.2` source/library candidate is prepared locally for exact verification and separate owner-controlled publication. Tagging, protected-main promotion, and GitHub publication are not implied by candidate readiness. The latest previously published controlled prerelease remains [v0.11.0-rc.1](https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.1).

`package.json` declares `"private": false` and `"license": "Apache-2.0"` so
the GitHub-source tarball has accurate package metadata. This release does not
publish to the public npm registry; the installable tarball is derived from the
exact accepted GitHub source.

## Supported release surface

- Node.js 22 and 24 on Windows.
- The nine-operation facade exported by `devrelay`, provider-neutral low-level contracts under `devrelay/advanced`, the deprecated `devrelay/compat/v1` bridge, and optional `devrelay/packs/*` bindings.
- JSON Schema contracts under `contracts/`.
- Versioned module and bounded adapter manifests under `examples/modules/` and
  `examples/plugins/`.
- OpenSpec bridge schemas under `openspec/`.
- Typed requirements, deterministic ProjectOverview projection/rendering,
  atomic paired Requirements Gate validation, and ArchitectureDesign's explicit
  project-overview context contract through the public JavaScript API.
- ArchitectureDiscovery deterministic state routing, offline tracked-or-declared native inventory, optional bounded analyzer port, observational normalization, Core-owned confidence and material-gap policy, exact checkpoint replay, trusted candidate-only traceability, and explicit source-transmission consent through the advanced API.
- Standard, fast, and high-assurance workflow profiles; a filesystem-backed Windows local-host storage/isolation/execution boundary; and the versioned `init`, `run`, `resume`, `status`, `verify`, `inspect`, and `evidence` CLI commands.
- Optional pack conformance with Godot/GdUnit4 and provider-neutral web-service fixtures; domain behavior does not enter Generic Core.
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
- SpecialistAssignment 2.0 A2A profile discovery, Core-owned eligibility,
  deterministic ranking, unforgeable checkpoint-replay Gate authority, exact
  draft/approval byte binding, and zero-call replay. The 1.0 manifest remains
  packaged for compatibility and is not the trusted release route.
- WorkExecution exact readiness, assignment, policy, repository, retry, and
  checkpoint boundaries; exact raw executor-byte preservation; zero-call replay;
  closed candidate result assembly; and trusted forward-only attempt traceability
  with explicit vocabulary 1.6 opt-in behind a proposer-only executor port.
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
- RoadmapManagement deterministic triage, review, reprioritization, exact weighted scoring, a human-owned Gate, structured baseline, concise projection, and trusted containment traceability.
- Mandatory DevRelaySessionBootstrap for every fresh configured ChatGPT Desktop task on Windows, with exact context receipts and next-Module-boundary refresh.
- A validated, deliberately installed `devrelay-desktop` plug-in with isolated dependency-frontier task orchestration, durable worktree leases, independent adversarial review policy, restart recovery, operator projection, and dependency-free repository-scoped ProjectMemory bootstrap. ChatGPT Desktop project instructions plus the managed task prompt are the supported startup boundary; no undeclared automatic hook is claimed, and the plug-in has no lifecycle authority.
- Exact ModuleDefinition-bound cross-cutting composition plus QualityPolicy, WorkContinuity, and ProjectControl Modules for policy-derived verification obligations, exact duplicate-work prevention/reuse, and deterministic read-only project state across lifecycle Modules, Desktop tasks, worktrees, restarts, and session boundaries.
- BusinessAcceptance exhaustive technical coverage, business objective/metric/scope
  evaluation, exact owner approval, zero-call replay, accepted-record authority,
  and forward-only acceptance traceability.
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

The bundled graph and traceability checkpoint stores remain in-memory reference
implementations. The rc.3 local host adds filesystem-backed run, checkpoint,
artifact, grant, isolation, and recovery primitives for Windows; the complete
long-lived reference-host milestone remains reserved for 0.11. Gate
contributors require explicit validated Gate context; successful module results
never imply approval.

Provider maturity is evidence-bound. The source package includes bounded live-provider adapter factories and validates host-observed execution attestations; manifests or provider self-claims alone never establish live conformance. Historical fixture-only runs remain fixture-conformant and are not rewritten. WorkDependencyAnalysis does
ship its provider-neutral native structured proposer; OpenSpec and Task Master
remain optional proposal contracts, and Spec Kit remains a bounded advisory
review contract. ContractGeneration ships its deterministic JSON Schema
generator; OpenAPI, AsyncAPI, and Protobuf remain fixture-conformant contracts.
ChangeIntegration ships a bounded local Git adapter. SystemVerification ships
fixture-conformant test and review verifier bindings only; remote repository,
pull-request, deployment, live external verification, and external owner-interface
integrations are not included. BusinessAcceptance Core and its Gate are included.
Release notes and user-facing descriptions must preserve that
distinction. ArchitectureDiscovery ships its executable provider-neutral Core building blocks and deterministic native inventory binding. Optional analyzers remain contract-defined and are not claimed live-conformant.

Source-checkout Architecture Gate evidence may invoke a pinned official
Structurizr validator and JSON exporter to prove that a native workspace
normalizes into its canonical DevRelay candidate. This is a conformance
verifier, not a shipped command adapter.

The source checkout also carries one Gate-validated project-wide DevRelay V1
RequirementsBaseline and ProjectOverviewBaseline under `project/`, with the
exact generated root `ProjectOverview.md` recording the approved lifecycle
components. These repository-operating artifacts are intentionally outside the
installable tarball surface.

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
   TraceabilityGraph surface, and every declared fixed and wildcard public
   package export from a disposable consumer.

Use `npm run verify` for the static checks and test suite without packaging.

## Release checklist

- [ ] Work from a clean checkout of the intended commit.
- [ ] Confirm package and every released lifecycle Module/Gate version.
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
- [ ] Confirm `npm run release:check` passes on Node 22 and 24 across Windows and Ubuntu.
- [ ] Confirm the exact SystemVerification result, owner approval, BusinessAcceptance
      record, and final graph carry zero blocking diagnostics.
- [ ] Review the package file list and mandatory release digest catalog.
- [ ] Confirm the no-live-command-adapters limitation remains visible.
- [ ] Review `CHANGELOG.md`, security guidance, and residual risks.
- [ ] Merge through the normal review process.
- [ ] Create any source archive and checksum only from the reviewed commit.

Publishing, pushing, tagging, or attaching a release is a separate,
owner-authorized action.

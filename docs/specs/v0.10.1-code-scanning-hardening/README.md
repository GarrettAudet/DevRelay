# DevRelay v0.10.1 code-scanning hardening

## Goal

Close every actionable scanner finding in repository-owned executable code and
explicitly disposition every non-code governance signal before calling the
public GitHub source/library preview release-ready.

## Requirements decision

The approved `1.8.0` RequirementsBaseline and ProjectOverview already cover the
change through artifact integrity, public OSS dogfood, protected-main,
governance, human-readable reporting, and report-security criteria. No product
behavior, public API, supported host, data boundary, or distribution decision
changes. RequirementsGathering therefore emitted a content-addressed reuse
disposition rather than an artificial no-op requirements change.

Release rule:

> No actionable scanner finding may remain in repository-owned executable
> code; non-code governance signals require explicit evidence-backed
> dispositions.

## Architecture decision

The correction remains inside approved elements `EL-DEVRELAY-CORE`,
`EL-RUN-MARKDOWN-RENDERER`, `EL-REL-EVIDENCE-ASSEMBLER`,
`EL-REL-GITHUB-PROMOTION`, and `EL-REL-TOOLING`. The design uses descriptor-bound
file operations, exclusive immutable writes, exact code-owned download URLs,
least-privilege workflow jobs, and ordered Markdown escaping. ContractGeneration
is `ApprovedNotApplicable` because no API, schema, event, package export, or
protocol changes.

## Work breakdown

```text
WI-SCAN-EXECUTABLE-CODE ─────────┐
WI-SCAN-RELEASE-PERMISSIONS ─────┼─> WI-SCAN-VERIFICATION
WI-SCAN-GOVERNANCE-DISPOSITIONS ─┘
```

The complete candidate snapshot, including the prior WorkBreakdownBaseline and
version-pinned requirements, architecture, repository, and contract context,
was passed through the native dependency proposer, Graphology-DAG mechanics,
and the pinned OPA WASM policy. The policy allowed the static DAG. Native
specialist assignment selected the provider-neutral ChatGPT Desktop
security/release profile for all four items.

## Current lifecycle state

```text
RequirementsGathering through SpecialistAssignmentGate: pass
WorkExecution: candidate change materialized for the three ready work items
WorkItemVerification: local gate pass; external scanner and protected-CI evidence pending
ChangeIntegration: pending protected PR
SystemVerification: pending protected CI and scanner reevaluation
BusinessAcceptance: pending exact post-merge evidence
```

Authoritative planning checkpoint:

```text
sha256:823081f24c5eb1d018302889eba209823184b4dc31c0c061901a2ab1de6fec3b
```

Canonical local verification completed with 866 tests, 864 passes, zero
failures, and two intentional skips. The local evidence deliberately reports
`needs-external-evidence`; it does not claim scanner closure or integration
before the exact GitHub candidate is evaluated.

See `dogfood/v0.10.1-code-scanning-hardening/` for the module-by-module records,
full work snapshot, dependency and OPA evidence, assignments, traceability
proposal, and human-readable LifecycleRunReport.

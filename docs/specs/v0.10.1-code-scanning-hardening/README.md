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
file operations, single-descriptor atomic assignment replacement, exact code-owned download URLs,
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
RequirementsGathering through SpecialistAssignmentGate: COMPLETE
WorkExecution: COMPLETE
WorkItemVerification: VERIFIED
ChangeIntegration: INTEGRATED
SystemVerification: VERIFIED
BusinessAcceptance: ACCEPTED
TraceabilityGraph: REVISION 48 / ZERO BLOCKERS
Controlled GitHub source release: COMPLETE
```

Final protected-main commit: `fa5320374efd2228d924f4aa1c49ad4b418b5770`.

Canonical local verification completed with 867 tests, 865 passes, zero failures,
and two intentional skips. Protected main passed Node 22/24 on Windows and
Ubuntu, CodeQL with zero actionable alerts, Scorecard with five documented
non-code dispositions, and controlled source-release run `31701807978` with
attested immutable artifact `9181708671`.

See `dogfood/v0.10.1-code-scanning-hardening/` for the module-by-module records,
full work snapshot, dependency and OPA evidence, assignments, traceability
merge proof, completion evidence, and human-readable LifecycleRunReport.

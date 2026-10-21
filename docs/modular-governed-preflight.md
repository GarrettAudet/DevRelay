# Governed modular preflight

This additive **programmatic, existing-repository** entry point protects the
modular coding workflow's file edits and Node test launches. It reuses RequirementsGate, ArchitectureGate,
WorkBreakdownGate and Core; it is not another approval store or lifecycle engine.
The existing `createCodingWorkflow`, `code.mjs`, and Desktop `run` remain the
**legacy preview**, not governed execution. This change does not switch an
installed Desktop default.

## One bounded change card

Attach one JSON card to the existing WorkBreakdown candidate's `nativeArtifacts`
before its normal Gate review. Use schema
`https://devrelay.dev/examples/modular/coding/change-card/v1`, media type
`application/json`, and the SHA-256 digest of its exact bytes:

```json
{
  "workItemId": "WI-ADD",
  "criterionIds": ["AC-ADD"],
  "readPaths": ["add.mjs", "test/add.test.mjs"],
  "writePaths": ["add.mjs"],
  "testFiles": ["test/add.test.mjs"],
  "reuse": {
    "disposition": "reuse",
    "rationale": "Keep the existing addition function and test harness.",
    "paths": ["add.mjs", "test/add.test.mjs"]
  }
}
```

For genuinely inapplicable reuse, use `not-applicable`, a specific rationale,
and an empty `paths` list. N/A never waives approval, design, criteria, or a
failed check. The selected work item must already be bounded, contain design
references, and retain all of its acceptance criteria in the card. The existing
Gate validates those references. Requests may narrow allowed paths/test files,
not expand them or omit required reuse inspection. All write/test/reuse paths
must also be declared reads. Tests use only the pinned Node executable with
`--test --test-concurrency=1` and explicit requested test files.

The baseline does **not** acquire a new field: its existing `approvedCandidate`
points to the genuine Core-replayed candidate, whose `nativeArtifacts` binds the
card. An unattached card, rehashed substitution, or `approved: true` is rejected.
No new documents per lifecycle stage or alternate promotion workflow are needed.
This does not introduce a lighter replacement for the existing lifecycle Gates.

## Trusted host integration

```js
import { createGovernedCodingWorkflow } from "devrelay/examples/modular/coding.mjs";

const host = await createGovernedCodingWorkflow({
  workspace,
  stateDirectory, // The trusted host owns its durable workspace store.
  governance: {
    requirements, // Normal validateRequirementsGatePromotion arguments.
    architecture, // Normal validateArchitectureGatePromotion arguments.
    workBreakdown, // Normal validateWorkBreakdownGatePromotion arguments.
    changeCard: { ref, bytes },
    readCurrentHeads, // Trusted host reader, NOT a caller approval callback.
  },
});
try { const evidence = await host.execute(request); }
finally { host.close(); }
```

Each Gate receives its genuine in-process Core checkpoint-replay receipt and
exact baseline/approval bytes. Plain or serialized receipt objects cannot
replace these. A durable host can regenerate genuine receipts through Core's
`verifyCheckpointedExecution` using its existing exact artifact/checkpoint store
without rerunning an adapter. The opt-in [durable CLI bridge](modular-governed-host.md)
now implements this using the same SQLite/CAS store and a host-owned head lease.
The requirements and overview context used by coding is derived from the
validated Gate payload, never borrowed from preview setup.

`readCurrentHeads()` returns exact active ArtifactRefs named
`requirementsBaseline`, `projectOverviewBaseline`, `architectureBaseline`,
`workBreakdownBaseline`, `projectContext`, `repositorySnapshot`,
`contractDisposition`, and `capabilityCatalog`. Missing/withdrawn or changed
heads block. Design and work dependencies must agree with the approved pair,
including the exact repository snapshot. The reader must consult the host's
canonical current state, not echo the supplied approvals or a setup snapshot.
The trusted host must bind that reader to the selected workspace/project; a
repository identifier is not necessarily a local checkout path. Do not reuse
another project's reader. This slice requires an actual approved repository
snapshot; Gate-valid greenfield/ApprovedNotApplicable repository contexts remain
blocked rather than being treated as evidence of an existing checkout.

Checks run before creating a governed host, before execution, and inside both
effect adapters. Calling the returned registry directly cannot bypass the
before-effect check. Core fingerprints bind the validated approval digest;
existing preimage checks and uncertain-effect quarantine remain in force.
Completed replay is historical evidence, not fresh execution or acceptance.
New approved cards can reuse the same governed state directory with new request
IDs: only stable host identity is workspace-bound, while approval identity is
pinned per invocation. Old request/checkpoint history is preserved, not reset.

## Discovery and limits

`inspectCodingWorkspace({workspace, paths})`, or
`node examples/modular/desktop.mjs inspect <workspace> <paths...>`, reads bounded
explicit files without setup, state creation, approval, or process execution.
`governed-run <workspace> <plan.json>` uses the opt-in durable bridge. Without
an activated approved source bundle it reports `GOVERNED_HOST_REQUIRED` and
does not edit. Legacy preview setup alone is not sufficient authority.
Do not delete/recreate preview state to disguise stale context or silently fall
back from a blocked governed request to legacy `run`.

The bare programmatic preflight is stale-head **detection**, not atomic fencing
against concurrent head writers. Its trusted caller must serialize activation,
refresh, and effects. The opt-in CLI host implements that boundary with the
existing project lease and a durable active intent that survives lease expiry,
without adding another store. In-process receipts and approval JSON do not authenticate a
human against a hostile host. Path checks/process grants are not an OS sandbox:
trusted test code can itself cause effects. Arbitrary edits outside this governed
DevRelay entry point are not protected.

Real Gate-derived test fixtures prove contract behavior, not live provider
interoperability, installed Desktop operation, or owner acceptance. Test success,
criterion evidence, and BusinessAcceptance remain separate; governed results
explicitly report `acceptance: "not-recorded"`.

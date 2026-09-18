# Runtime dogfooding reconciliation — diagnostic, not approval

Recorded 2026-09-14. This document does not promote artifacts or establish a
Core-ready frontier. Existing source edits remain unaccepted implementation work.

## Observed mismatch

The current requirements baseline is
`requirements-baseline-devrelay-v1-ho-001-human-orchestration-001`, version 2.8.0.
The current work breakdown is `WBB-WB-DOGFOOD`, version 2.4.0, and binds the older
`requirements-baseline-devrelay-v1-rp-001-release-preparation-001` requirements
artifact, digest `sha256:cf9b4018d7572c3955b477cddcc91cb8753b24cc55ab338073898110159b96ea`.
Its overview input is likewise the historical RP-001 overview, not the current pair.

Its nine work items are WI-RP-ADAPTER-EFFECTS, WI-RP-ARTIFACT-CONTRACTS,
WI-RP-GATE-SUMMARY, WI-RP-IDENTITY-ROUTING, WI-RP-NATIVE-MATERIALIZATION,
WI-RP-REGRESSION, WI-RP-TRACEABILITY, WI-RP-VERIFY-POLICY and WI-RP-WINDOWS-E2E.
The dependency baseline is WDB-RP-001-001 v2.4.0; specialist assignment is
SAB-E2DC9ABCD4320972 v2.0.0 and assigns those RP work items.

These artifacts do not demonstrate approved planning/execution lineage for the
recent local-host task preparation, claims, operator handoff and recovery changes.
Component, fixture and host regression tests are verification evidence only;
they do not retroactively establish that DevRelay orchestrated their development.

## Current raw SHA-256 evidence

| File under project/ | Digest |
| --- | --- |
| requirements-baseline.json | bc30f849481c962c66e33ced6791f37e227e949744e54ca42164fcb4df518284 |
| project-overview-baseline.json | 071ba150c1c1c760cc88839f1d84f3b829e49f9ece1b96557a7f7f023a72004d |
| work-breakdown-baseline.json | cdd3bd5ec23ff2b1d5d9a324a72ab16a2c40b0335e1f89f2782c5dbf53d61653 |
| work-dependency-baseline.json | 2d55d1d221d52a54daab212801865cc1c773051f79e1c17c4a72a5e496e2847f |
| specialist-assignment-baseline.json | 617ad8d0d1534ed4f6dba7f376ba43f2a500cd2179e44e84b9c6ece484e7a118 |

## Required recovery

1. Preserve existing edits and prior evidence without calling them accepted.
2. Resolve the lifecycle alignment with the owner; inspect any newer bounded
   dogfood artifacts before concluding that no valid slice exists elsewhere.
3. Resume the normal RequirementsGathering/change workflow against the exact
   current global pair, with visible clarification and Gate decisions.
4. Reconcile architecture/contracts and derive approved work breakdown, dependency
   and assignment artifacts for the remaining runtime work through their Modules.
5. Execute the resulting Core-ready work through WorkExecution, verification and
   integration; treat existing edits as candidate input, not completed work.
6. Retain explicit evidence for system verification and business acceptance before
   claiming a release or full self-hosted dogfooding.

No approved baseline or ProjectMemory fact was edited by this audit.

## Resume decision and existing-project route — 2026-09-18

The owner authorized reconciliation and dependency-safe parallel work. Existing
implementation remains candidate work. This authorization does not substitute
for Module results, owning Gate validation, or a Core-derived ready frontier.

The mismatch also reaches `project/architecture-baseline.json` and
`project/project-architecture-state.json`, which bind RP-001; the current
contract baseline is `CB-DEVRELAY-015`. Do not treat the repository as a new
unbaselined project to bypass its existing change history.

The current local host's fresh-project handoffs are insufficient for this repair:
`createLocalArchitectureContext` requires `establish-baseline`, and
`local-contract-planning.mjs` rejects an existing contract baseline. Its long
fresh-project test is therefore not proof of existing-project change support.

Use the released change lifecycle with exact current input bytes:

1. Reconcile the owner's runtime-first scope against the current HO requirements
   and overview. Preserve the pair unless a real requirements change is needed.
2. Establish current repository/context evidence and resolve the prior approved
   architecture. Let Core derive the route; prepare an ArchitectureChangeSetDraft
   and obtain the genuine replay receipt and ArchitectureGate result.
3. Reconcile interface intents with the prior contract baseline through
   ContractGeneration and ContractGate, retaining exact change lineage.
4. Provide the resulting ApprovedChangePackage, capability catalog and previous
   work baseline to WorkBreakdown; validate its candidate through the owning Gate.
5. Run dependency analysis and assignment with explicit policy/catalog inputs.
   Only then dispatch the derived ready frontier with bound memory receipts.

Reference invocation shapes are
`examples/invocations/architecture-design-change.invocation.json` and
`examples/invocations/work-breakdown-decompose-change-001.invocation.json`.
Their example grants and provider bindings are not authorization for this task.
Existing direct APIs include `validateArchitectureGatePromotion`,
`createContractGenerationRuntime`, `promoteContractBaseline`,
`validateWorkBreakdownGatePromotion`, `createWorkDependencyAnalysisRuntime`, and
`createSpecialistAssignmentRuntime`. Historical materialization scripts must
not be rerun against current project files as a shortcut to approval.

## Recovered verification result — 2026-09-18

The saved `full-host-claim-current-20260914.log` ended with one failed test,
not a pending or successful run. Duration: 12445783.0596ms. At
`test/desktop-local-host.test.mjs:650`, resume returned exit 2 instead of expected
5, with DR4924: lease renewal requires the exact current unexpired lease and
version. The root cause still requires diagnosis; do not weaken lease validation
or attribute the failure to suspension without evidence.

Follow-up metrics narrow the diagnosis: failing sequence 103 took 7135109ms
wall time, 172766ms process CPU, and recorded a 7009387ms maximum event-loop
gap. This is consistent with suspension or prolonged descheduling, but does not
prove OS sleep. A two-minute lease cannot safely remain owned across that gap.
The focused lease-renewal and cooperative-yield tests passed 4/4 (230.7654ms).
These prove local rejection/renewal/yield behavior, not complete interrupted-host
recovery. Keep expiry fail-closed and verify recovery from durable checkpoints
before rerunning the expensive composed acceptance scenario.

Bounded recovery verification to include in the reconciled work plan:

- Use a controlled clock around queue preparation to expire ownership before
  the parent transition; assert DR4924, unchanged parent checkpoint and no dispatch.
- Reopen and resume the exact saved request with fresh ownership; prove one
  logical completion ledger/readiness result and state-preserving exact replay.
- Prove a stale owner cannot commit or release a successor's lease.

The host currently lacks a clock/scheduler injection seam. Queue preparation
also writes its completion ledger and readiness result before the final parent
transition, so those intermediate writes need explicit recovery coverage.
Heartbeat failure is retained until final commit rather than promptly aborting
artifact loading. These are candidate work items, not approved tasks or fixes.
Do not generalize queue recovery into automatic retries of effect-bearing work.

The requirements/overview preservation test passed again on 2026-09-18 (1/1,
5047.0328ms total). It proves that pair and its projection, not downstream
alignment or release readiness.

## Bounded historical-plan check

A read-only scan of 26 `work-breakdown-baseline*.json` files found by `rg --files`
under `dogfood/` found no requirements input matching the current raw requirements
digest. This filename-bounded scan is not proof that no other evidence exists.

Separate inspection found HO-001 `work-breakdown/work-items.json` and
`specialist-assignment/assignment-baseline.json`. Both failed their current owning
artifact validators (`validateWorkBreakdownArtifact` and
`validateSpecialistAssignmentArtifact`). Their embedded `gateDecision: approve`
strings are not a substitute for canonical promotion evidence. Retain them as
historical material; do not silently rewrite or promote them.

`dogfood/release-completion-20260913/README.md` explicitly describes candidate
repairs under the unchanged 2.8.0 pair and disclaims WorkBreakdown promotion.
Its `desktop-cli-host.md` likewise disclaims complete lifecycle acceptance and
managed agent dispatch. These records corroborate, rather than close, the gap.

The read-only `test/release-completion-baseline.test.mjs` check passed 1/1
(948.2957ms) after this audit. It verifies the exact approved global requirements/
overview pair and projection. Therefore this audit does not establish that the
current requirements themselves are invalid or need replacement; the unresolved
issue is downstream planning/execution lineage for the candidate runtime changes.

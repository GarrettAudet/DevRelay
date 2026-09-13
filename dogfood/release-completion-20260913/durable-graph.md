# Host connection increment: durable graph storage

Candidate implementation under the unchanged approved requirements/overview
pair 2.8.0, following checkpoint commit
`1d1d05fbaf7d7d7c98bb9256282f951ef784ec82` in PR #27 (all eleven checks passed).
The owner's actual clarification remains: Desktop is the agent operator; the
CLI handles local durability, validation and recovery, not independent agents.

## Scope and authority

This implements the existing trusted graph-store interface over LocalHostStorage
and the checkpoint bridge. It addresses the existing durable-host/crash-recovery
requirements. It does not change requirements, Generic Core routing, Module or
plug-in versions, contributor ownership, prepared-update authority, Gate policy,
the approved project graph, or ProjectMemory.

The host contracts are `local-host-traceability-head.schema.json` and
`local-host-traceability-commit.schema.json`; both reuse Core's ArtifactRef schema
owner. New storage reads support indexed exact transition identity/version
queries without changing the existing unfiltered result contract or schema
version. Artifact/result bytes are checkpointed before a single atomic head and
receipt journal transition. Uncommitted candidates never prove application.

## Verification observed on 2026-09-13

The combined command covered local-host-traceability, local-host-storage,
local-host-checkpoints, traceability-runtime-integration, traceability-merge and
release-completion-baseline tests: **54 tests, 54 pass, zero failures/skips**,
50,844.4285 milliseconds.

The actual RequirementsGathering Core and its released trusted contributors run
with an explicitly fixture-conformant adapter. Separate processes recover both
Core and graph checkpoints; the replay adapter throws if invoked. The result
retains a genuine in-process VerifiedCheckpointReplayReceipt, the exact prepared
update, committed graph/receipt proof and one total adapter call.

Five subprocess scenarios passed: normal completion, caught interruption before
commit, caught interruption after commit, abrupt process exit before commit,
and abrupt process exit after commit. Each uses two fresh replay processes.
Abrupt-exit cases prove active-lease rejection, then recovery after expiry using
an explicit controlled clock. They do not claim disk power-loss simulation.

Negative coverage includes head/journal/CAS corruption, complete ArtifactRef
substitution, namespace/graph isolation, stale heads, rollback at three SQLite
boundaries, and interleaved independent storage connections. SQL query-plan
evidence confirms the exact identity lookup uses its index.

## Remaining acceptance boundary

The package smoke now also runs a real installed graph commit, storage reopen,
prepared-update revalidation and exact receipt replay. Its final execution is
recorded only after package verification completes. This is not an actual
produced-code Desktop acceptance run or live upstream-provider conformance.

The installed CLI is not yet fully connected. Pre-existing in-memory graph import
is not exposed by this increment. Memory/roadmap reconciliation through owning
Gates, historical security disposition, complete installed-product execution,
independent human review, BusinessAcceptance and new-version sealing remain
open under issue #25. This record does not fabricate lifecycle progression or
Gate approval; the approved paired project baseline remains unchanged.

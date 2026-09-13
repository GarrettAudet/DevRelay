# Host connection increment: durable checkpoints

Candidate source implementation under the unchanged approved 2.8.0
requirements/overview pair. The complete release goal remains open in issue #25.
This follows repair commit 630116f937a73689855ad7f5ebb6c721419b1362 (draft PR #26,
all eleven GitHub checks passed).

## Actual owner clarification

On 2026-09-13, this task asked whether Desktop should remain the agent operator
with CLI durability/validation/recovery, or whether the CLI must launch agents
independently of a Desktop conversation. The user answered:

> Desktop remains the agent operator

This confirms Q-SIM-HOST-001 and ARCH-SIM-DECISION-007/008/009. It does not grant
a new executor, network service, credential connection, or workflow authority.

## Contract and implementation

The existing Core immutable checkpoint interface is implemented against the
existing LocalHostStorage SQLite/CAS primitives. The host owns the new closed
wire envelope `contracts/local-host-checkpoint.schema.json`; Generic Core and
published Module/plug-in contracts are unchanged. The advanced export is
`createLocalHostCheckpointStore`, documented in `docs/local-host-checkpoints.md`.

Both ordinary effect checkpoints and atomic trace checkpoints retain namespace,
key, raw-byte integrity and immutable winner identity. Exact repeats are
idempotent; different replacements fail; corruption never becomes a cache miss.
The bridge does not call an adapter, mutate a graph, create a task, or approve
a Gate. Unsupported JavaScript objects cannot execute serialization hooks.

## Verification

The combined targeted command completed 33 tests with 33 passing, zero failures
and zero skips, covering the new store, existing SQLite/CAS storage, Desktop
effect coordination, traceability replay and exact baseline-pair consistency.

The Core subprocess test uses an explicitly fixture-conformant adapter. It first
executes Core and persists its terminal checkpoint, then starts a separate
process whose adapter throws if called. Core verifies the exact stored result
and produces a genuine in-process VerifiedCheckpointReplayReceipt with zero
adapter calls. This is not a live-provider or complete installed-product test.

The graph-aware test forces a merge outage after durable checkpoint persistence,
reopens storage and reuses the exact prepared update and resulting graph proof.
Core's trusted projection validation may repeat; the adapter does not. The graph
service remains in memory in this test, so full graph persistence is unproven.

No new requirements interview, baseline promotion, architecture Gate,
WorkBreakdown promotion, final verification Gate, or BusinessAcceptance is
manufactured by this record. The full connected Desktop host/CLI, actual
installed-product run, roadmap/memory reconciliation, historical security
disposition and independent human review remain required release work.

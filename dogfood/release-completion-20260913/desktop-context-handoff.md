# Desktop requirements-context handoff candidate

Status: scoped implementation verified; not release acceptance. Recorded 2026-09-14.
Parent: `b58d3c6ecf8521705621b0a23a91b4b1efa7f800` (PR #30).
Branch: `codex/desktop-context-handoff`.

## Scope

This repairs existing deterministic CLI and exact-context requirements under the
unchanged approved project-wide 2.8.0 pair. No new global baseline, Gate approval,
next-stage route, agent dispatch or human acceptance is inferred.

The host revalidates the genuine Core/Gate/activation proof and exact current
requirements head before refreshing context. Approved memory, synopsis, memory
graph and roadmap bindings are retained and reloaded. Invalidated downstream
bindings remain history, not completed work. The runtime graph receipt is bound
separately and never replaces the approved memory graph.

Materialization preflights explicit grants and path confinement, publishes exact
artifact/snapshot bytes without clobbering existing files, and publishes the next
configuration last. Interrupted publication can retry; conflicting bytes fail.
The operator explicitly initializes the returned configuration path/digest.
Historical runs require their original context; the new context cannot adopt them.

## Observed verification

- Combined source suite: 35 passed, zero failed/skipped, 255263.2642 ms across
  operator-cli, requirements-gate, requirements-traceability, desktop-local-host
  and release-completion-baseline tests.
- Separate Windows executable processes cover candidate ingestion, Gate,
  activation, refresh, publication, read-only verification, exact replay, new
  initialization, cross-context rejection and historical inspection.
- Negative checks cover missing head, retained-context drift, interrupted
  publication/retry, grant denial and conflicting published bytes.
- Historical inspect originally failed with DR4779 because CLI forwarding added
  an undefined subject. A focused regression reproduced it before the fix.
  Strict canonical digest validation and test expectations remain unchanged.
- Executable argument/error tests: 4 passed, zero failed/skipped.
- Static checks: 9832 JSON, 974 JavaScript, 11530 LF-only text files, and 28
  downstream operations with explicit ProjectOverview context.
- Offline package verification: 462 exact catalog-bound files and 232 installed
  export targets. Installed Windows smoke includes the full context boundary,
  durable checkpoint/graph recovery and the CLI command matrix.

These checks used fixture candidates/approval evidence, not live code-production
or independent human acceptance. Counts precede this documentation record;
regenerate the catalog for final documentation bytes. No release tag or public
npm publication is claimed.

## Remaining work and candidate-only conclusion

Normal lifecycle progression, approved-frontier worktree dispatch, real worker
and independent reviewer code production, memory conclusion/fresh-task recovery,
quality/continuity/operator integration, security disposition, independent review
and BusinessAcceptance remain required. AC-SIM-WINDOWS-E2E-001 remains open.

The context boundary and inspection repair are verified within the scope above.
This record is not a ProjectMemory promotion or full release acceptance.

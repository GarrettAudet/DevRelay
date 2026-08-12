# DevRelay current implementation status

Last reconciled: 2026-08-11 MDT
Active branch: `codex/lifecycle-run-report-completion`
Exact verified release-source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
Exact verification run: `31564635275`
Active boundary: corrected candidate materialization and exact owner approval

This file is a human-readable status projection. Exact module artifacts, Gate
records, graph checkpoints, release evidence, commits, and CI runs remain the
authoritative records.

## Executive status

The portable DevRelay V1 source/library circuit is implemented through
BusinessAcceptance. The pre-approval lifecycle circuit has already executed
successfully through released APIs: complete graph recovery, the two
authorized design links, 99-obligation SystemVerification, zero-call replay,
trusted verification traceability, exhaustive BusinessAcceptance technical
coverage, BusinessAcceptance evaluation, and zero-call replay.

The corrected release source is now stable and independently verified. Workflow
run `31564607304` created the catalog-only source commit
`9d2b0d8e6b358dd6aed922de420224fe9efc320c`, then dispatched verify run
`31564635275` for that exact SHA. All four supported jobs passed:

- Node 20 on Ubuntu: pass
- Node 22 on Ubuntu: pass
- Node 20 on Windows: pass
- Node 22 on Windows: pass

The materialization workflow has bound that exact commit and run ID and is now
executing the corrected candidate through the released SystemVerification,
BusinessAcceptance, checkpoint, contributor, and TraceabilityGraph APIs. No
stale-source exception remains.

The next authoritative boundary is the corrected exact owner-approval request.
The earlier approval named superseded source and must not be reused.

Current position:

```text
RequirementsGathering through ChangeIntegration     COMPLETE
Historical graph recovery                            PROVEN
Two owner-authorized designed-by links               PROVEN
SystemVerification implementation                    COMPLETE
99-obligation SystemVerification execution           PROVEN
SystemVerification zero-call replay                  PROVEN
Trusted verification traceability merge              PROVEN
BusinessAcceptance technical coverage                PROVEN EXHAUSTIVE
BusinessAcceptance evaluation and replay              PROVEN
Exact source catalog                                  COMMITTED
Node 20/22 Ubuntu/Windows source matrix                PASS 4/4
Corrected candidate materialization                   IN PROGRESS
Corrected approval request persistence                PENDING CANDIDATE
Exact owner approval                                  PENDING REQUEST
BusinessAcceptanceGate                                PENDING APPROVAL
Trusted acceptance traceability merge                 PENDING GATE
Final evidence, catalog, handoff, and matrix           PENDING
```

No public npm publication, one-click ChatGPT Desktop plug-in, hosted backend,
deployment, or production-service claim is in scope.

## Verified implementation repairs

- `3d9ad2f`: completed the portable lifecycle source candidate and regenerated
  content-addressed evidence.
- `de32a5f`: made the release catalog independent of checkout location.
- `bbda9a6`: preserved immutable JSON release evidence across Windows/Linux
  checkouts.
- `14955a9`: made installed-package smoke verification cache-independent and
  offline.
- `33e65ba`: bound Java 21 on Windows CI.
- `477e7a4`: carried the semantic `SystemVerificationResult` reference required
  by downstream BusinessAcceptance coverage derivation.
- `648b267`: marked trusted verified-evidence nodes with graph-level passing
  status.
- `d3090aa`: prohibited candidate generation without exact target-commit and
  verification-run bindings.
- `dbd85ba`: added guarded source-catalog generation and exact verify discovery.
- `efb09ff`: added bounded catalog-only self-bootstrap and explicit verify
  dispatch.
- `9d2b0d8`: committed the exact self-excluded 3,467-entry source catalog.

## Verification evidence

Verify run `31564635275` is bound to exact head SHA `9d2b0d8...` and completed
successfully on all four supported jobs. Each job completed dependency install,
Java binding, the complete source release check, and cleanup successfully.

The cataloged source records:

- release type: `private-source`
- modules: 11
- plug-ins: 24
- raw-byte file digests: 3,467
- npm-package files: 281

Materialization run `31564607304` passed its catalog commit, branch
compare-and-swap, verify dispatch, and exact successful-run binding steps before
entering candidate execution.

## Owner authority

The owner authorized the controlled source/library release scope, satisfaction
accounting for 81 acceptance criteria, 18 NFRs, 8 business objectives, 9 success
metrics, and 32 scope identities, plus these forward links:

- `US-DEV-SPECIFY-001 -> designed-by -> EL-DEVRELAY-CORE`
- `NFR-DEV-DETERMINISM-001 -> designed-by -> EL-DEVRELAY-CORE`

The earlier exact approval named superseded source. The corrected candidate must
expose its exact target commit, semantic digest, raw digest,
technical-coverage digest, graph checkpoint, and exclusions before
BusinessAcceptanceGate may create an authoritative record.

## Next trusted transition

```text
complete corrected candidate materialization
-> inspect and persist exact candidate and approval request
-> present exact request to the owner
-> apply the exact owner decision through BusinessAcceptanceGate
-> prove Gate replay invokes the owner zero additional times
-> merge and replay trusted BusinessAcceptance traceability
-> require zero blocking graph diagnostics
-> persist final evidence, release metadata, and coherent handoff package
-> regenerate the final content-addressed catalog
-> run and verify the final four-job release matrix
```

## Pickup

Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The
older `2026-08-10` package remains immutable historical context.

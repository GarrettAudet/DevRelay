# DevRelay current implementation status

Last reconciled: 2026-08-11 MDT
Active branch: `codex/lifecycle-run-report-completion`
Latest source checkpoint before this update: `dbd85ba1bdb0dd6ec93824b93aa1eec5fec95f64`
Active boundary: establish one exact cataloged and four-matrix-verified source commit

This file is a human-readable status projection. Exact module artifacts, Gate
records, graph checkpoints, release evidence, commits, and CI runs remain the
authoritative records.

## Executive status

The portable DevRelay V1 source/library circuit is implemented through
BusinessAcceptance. The final pre-approval circuit has executed successfully
through released APIs: complete graph recovery, the two owner-authorized design
links, 99-obligation SystemVerification, zero-call replay, trusted verification
traceability, exhaustive BusinessAcceptance coverage, BusinessAcceptance
evaluation, and zero-call replay.

The previously materialized candidate cannot be promoted because it names the
older source commit `477e7a4`. A subsequent required correction added the
graph-level `verificationStatus: "pass"` classification consumed by
BusinessAcceptance, so the corrected candidate must bind one newer exact source
commit and its successful four-job verify run.

Commit `dbd85ba` introduced a guarded catalog bootstrap. Materialization run
`31564333006` regenerated and uploaded the exact 3,467-entry source catalog, then
stopped at the committed-catalog check before verification binding or lifecycle
execution. Artifact `9128889947` is the generated catalog for that exact tree.
This proves the workflow and status changes are the only content-addressed drift.

The workflow is now being advanced to a bounded self-bootstrap:

1. regenerate and upload the exact source catalog;
2. verify that only `release/0.9.0.json` changed;
3. commit only that self-excluded catalog with a compare-and-swap branch check;
4. dispatch the four-job `verify` workflow for the new catalog commit;
5. bind the exact successful run ID and commit SHA;
6. materialize and upload the corrected candidate only after success.

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
Exact source-catalog bootstrap                        PROVEN
Catalog-only source stabilization                     IN PROGRESS
Exact four-job verification binding                   PENDING CATALOG COMMIT
Corrected candidate persistence                       PENDING VERIFICATION
Exact owner approval for corrected candidate          PENDING CANDIDATE
BusinessAcceptanceGate                                PENDING APPROVAL
Trusted acceptance traceability merge                 PENDING GATE
Final release metadata, handoff, catalog, matrix       PENDING
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
- `d3090aa`: prohibited candidate generation without an exact target commit and
  exact verification run.
- `dbd85ba`: added same-tree catalog guarding and exact verify-run discovery.

## Most recent evidence

- Materialization run `31563383966`: full corrected pre-approval circuit passed,
  but its candidate targeted superseded source `477e7a4` and was not accepted.
- Materialization run `31563855621`: correctly failed closed because exact target
  commit and CI-run bindings were absent.
- Materialization run `31564333006`: produced catalog artifact `9128889947`,
  then correctly stopped because that catalog was not yet committed.

The catalog artifact contains:

- release type: `private-source`
- modules: 11
- plug-ins: 24
- raw-byte file digests: 3,467
- npm-package files: 281, including the self-excluded catalog path

## Owner authority

The owner authorized the controlled source/library release scope, satisfaction
accounting for 81 acceptance criteria, 18 NFRs, 8 business objectives, 9 success
metrics, and 32 scope identities, plus these forward links:

- `US-DEV-SPECIFY-001 -> designed-by -> EL-DEVRELAY-CORE`
- `NFR-DEV-DETERMINISM-001 -> designed-by -> EL-DEVRELAY-CORE`

The earlier exact approval named superseded source. The corrected candidate must
expose its exact target commit, semantic digest, raw digest,
technical-coverage digest, and exclusions before BusinessAcceptanceGate may
create an authoritative record.

## Next trusted transition

```text
commit workflow + status reconciliation
-> workflow commits only the exact generated source catalog
-> workflow dispatches and requires exact four-job verify success
-> materialize corrected candidate bound to that commit and run
-> inspect and persist exact approval request
-> apply exact owner decision through BusinessAcceptanceGate
-> merge trusted BusinessAcceptance traceability
-> require zero blocking diagnostics
-> persist final evidence, catalog, handoff, and release metadata
-> run and verify the final four-job release matrix
```

## Pickup

Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The
older `2026-08-10` package remains immutable historical context.

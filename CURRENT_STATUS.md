# DevRelay current implementation status

Last reconciled: 2026-08-11 MDT
Active branch: `codex/lifecycle-run-report-completion`
Latest source checkpoint before this update: `d3090aaca2e5198c5b71b467a4cf742af58d3825`
Active boundary: bind and persist an exact verified release candidate

This file is a human-readable status projection. Exact module artifacts, Gate
records, graph checkpoints, release evidence, commits, and CI runs remain the
authoritative records.

## Executive status

The portable DevRelay V1 source/library circuit is implemented through
BusinessAcceptance. The ordinary source release gate was previously green on
Windows and Ubuntu under Node 20 and 22. The final pre-approval lifecycle circuit
has also executed successfully through released APIs: graph recovery, the two
owner-authorized design links, 99-obligation SystemVerification, zero-call
replay, trusted verification traceability, exhaustive BusinessAcceptance
coverage, BusinessAcceptance evaluation, and zero-call replay.

That successful candidate was not accepted because it named the older verified
source commit `477e7a4`. A later required correction added the graph-level
`verificationStatus: "pass"` classification consumed by BusinessAcceptance.
The candidate must therefore be regenerated against one exact commit that has
itself passed the four-job verify matrix.

Commit `d3090aa` made the materializer require exact target-commit and CI-run
environment bindings. Materialization run `31563855621` then failed closed before
lifecycle execution because its workflow did not supply those bindings. This is
a workflow wiring defect, not a SystemVerification, BusinessAcceptance, or graph
failure.

The workflow is now being changed to:

1. regenerate and upload the exact source catalog before any acceptance work;
2. require that catalog to match the committed source tree;
3. locate the successful `verify` workflow run for the same `GITHUB_SHA`;
4. bind that exact SHA and run ID into the materializer;
5. execute and upload the candidate only after those checks pass.

The first run after this workflow change is expected to stop at the committed
catalog check and provide the exact replacement catalog as an artifact. A
catalog-only follow-up commit will then be source-verification eligible and
will trigger exact same-commit candidate materialization.

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
Exact same-commit verify binding                      IN PROGRESS
Corrected candidate artifact persistence              PENDING BINDING
Exact owner approval for corrected candidate          PENDING CANDIDATE
BusinessAcceptanceGate                                PENDING APPROVAL
Trusted acceptance traceability merge                 PENDING GATE
Final release catalog, handoff, and matrix             PENDING
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
- `648b267`: marked trusted verified evidence nodes with graph-level passing
  status so BusinessAcceptance can traverse approved criterion-to-evidence
  paths.
- `d3090aa`: prohibited candidate generation without an exact target commit and
  exact verification run.

## Most recent evidence

GitHub Actions materialization run `31563383966` proved the full corrected
pre-approval circuit and uploaded a candidate package. It was intentionally not
accepted because its subject still named `477e7a4` rather than the corrected
source lineage.

Materialization run `31563855621` at `d3090aa` regenerated a 3,467-entry source
catalog, then failed closed with:

```text
DEVRELAY_RELEASE_TARGET_COMMIT must be an exact Git commit
```

The accompanying four-job verify run is not sufficient by itself to authorize a
candidate unless the materializer binds its exact run ID and head SHA.

## Owner authority

The owner has authorized the controlled source/library release scope, the
satisfaction accounting for 81 acceptance criteria, 18 NFRs, 8 business
objectives, 9 success metrics, and 32 scope identities, plus these two forward
links:

- `US-DEV-SPECIFY-001 -> designed-by -> EL-DEVRELAY-CORE`
- `NFR-DEV-DETERMINISM-001 -> designed-by -> EL-DEVRELAY-CORE`

The earlier exact approval was bound to superseded source. The corrected
candidate must expose its exact target commit, candidate semantic digest,
candidate raw digest, technical-coverage digest, and exclusions before
BusinessAcceptanceGate may create an authoritative record.

## Next trusted transition

```text
commit workflow + status reconciliation
-> retrieve exact generated source catalog
-> commit only that self-excluded catalog
-> require all four verify jobs green for the catalog commit
-> materialize corrected candidate bound to that exact commit and run
-> inspect exact approval request
-> apply exact owner decision through BusinessAcceptanceGate
-> merge trusted BusinessAcceptance traceability
-> require zero blocking diagnostics
-> persist final evidence, catalog, handoff, and release metadata
-> run and verify the full four-job release matrix
```

## Pickup

Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The
older `2026-08-10` package remains immutable historical context.

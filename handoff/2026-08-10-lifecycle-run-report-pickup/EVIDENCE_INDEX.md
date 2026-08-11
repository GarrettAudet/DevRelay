# Evidence index

Paths are repository-relative. SHA-256 values bind raw bytes unless stated
otherwise.

## Controlling lifecycle evidence

| Evidence | Path | Digest |
| --- | --- | --- |
| Route B human analysis | `analysis/dg1-contract-generation-48-vs-57-authority-analysis.md` | `sha256:981ab4dd7472108506e20d2d65d7236a015c2c57816b3a1e07f2c95f6c0a75a2` |
| Route B machine analysis | `analysis/dg1-contract-generation-48-vs-57-authority-analysis.json` | `sha256:a088dceb7c94cab1b69565e945588c35fd4e9816bce4b03a9d5b58a9da0989df` |
| Superseding 20-entry manifest | `dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/evidence-manifest.json` | `sha256:80882dc2fdbe1178f2728812175eebb5cde8ccaf97957076142f8e6c1861b8f0` |
| WorkExecution handoff | `dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/work-execution-handoff.json` | `sha256:97a319c40822ceb3572a8ceef9debec8e821670bdefe2a327b41afab4b38edba` |
| Runtime proof | `dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/runtime-execution-proof.json` | `sha256:a4c03f4b080e4e11360ea79bcf581c490c4df5d32d4a05d8ac42fe45666e0647` |
| Corrected capability gap | `dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/contract-generation-capability-gap.corrected.json` | `sha256:e2895d4d59e3fc8f99715fcb4731215f68bcc0115fb05124d9d4a6c6b5f2c107` |
| Terminal contract candidate | `dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/contract-change-set-draft.json` | `sha256:361173cb70a33c2631daef341512cd5115f806b25cd9a48b759cc612968e2d2b` |
| Independent PASS handoff | `dogfood/bootstrap-contract-generation-host-executor/verification/dg1-contract-generation-route-b-independent-verification-handoff.json` | `sha256:fc21173074510c478a34f1f406569f1e2412c33b208413d3d6ec0db6ebc74140` |
| Saved-project integration PASS | `dogfood/bootstrap-contract-generation-host-executor/verification/change-integration-receipt-superseding-pause.json` | `sha256:3ecac32bfab8f823204e3af4800c827dc424e5d481e9b670c7ce2db60efd25ba` |
| Immutable paused lineage | `dogfood/bootstrap-contract-generation-host-executor/verification/change-integration-receipt-paused-2026-08-10.json` | `sha256:7aed334ea818445a85519fe98980590b82b982a89749394c6a818263622c15ef` |
| Architecture host-binding integration | `dogfood/bootstrap-architecture-host-executor-adapters/verification/change-integration-receipt-superseding-export-repair.json` | `sha256:86a907932a4c897a5ea5523038c6c0987ab27abc32d49fa68cb124b66244d489` |

## Repository/CI checkpoint evidence

- Last fully green release proof:
  `31d79faed9a1b926188dc0eea34b0d443fda3a35`.
- CI history/Java repair:
  `2c4b6e3b67045544555983d408dec112eeab238f`.
- Local-Git fixture portability repair:
  `c957db0865ef990b27eb86d6671ed0df2e35aa9e`.
- Completed post-toolchain workflow run:
  `31454853164`. Representative Ubuntu/Node 20 result:
  811 pass, 16 fail, 1 skip from 828 tests.
- Active post-local-Git workflow run:
  `31457082371`. Status at package checkpoint: in progress.

Additional controlling sources:

- `AGENTS.md` — repository scope and invariants.
- `CURRENT_STATUS.md` — current human-readable projection.
- `ProjectOverview.md` and `project/project-overview-baseline.json` — canonical
  project context pair; do not edit as part of portability closure.
- `dogfood/v1-module-sequence.working.md` — recursive working ledger.
- `dogfood/lifecycle-run-report/` — active candidate evidence.

The original manifest with digest
`sha256:6dddece4148cee24389595e2d971993f859f62df2fb0fd4da9fc1f00416bd311`
is immutable superseded evidence. It is intentionally absent from the
repository/handoff and must not be reconstructed, overwritten, or replaced by
different current bytes merely to satisfy a historical replay.

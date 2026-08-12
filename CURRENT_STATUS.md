# DevRelay current implementation status

Last reconciled: 2026-08-12 MDT
Active branch: `codex/lifecycle-run-report-completion`
Documentation reconciliation base: `f1b62238dbd39e83526290abf41edf880faa493d`
Exact verified release-source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
Exact source verification run: `31564635275`
Active boundary: persist the exact validated candidate after the rejected persistence push

This file is a human-readable status projection. Exact module artifacts, Gate records, graph checkpoints, release evidence, commits, GitHub Actions runs, and repository bytes remain authoritative.

## Executive status

The portable DevRelay V1 source/library circuit is implemented through the pre-approval BusinessAcceptance boundary. Source target `9d2b0d8` passed Node 20 and Node 22 on Ubuntu and Windows. Materialization run `31564607304` completed the corrected lifecycle circuit through released APIs and produced one exact 25-file candidate package.

The candidate package was independently downloaded by exact run, artifact name, artifact ID, and ZIP digest. Persistence run `31566991321` revalidated all 25 canonical JSON files and their critical cross-artifact bindings, regenerated the release catalog, passed the release gate with 842 tests, and passed installed-package verification.

The remote persistence did not complete. The workflow created runner-local commit `6f7a84a`, but GitHub rejected the push because the GitHub App attempted to update `.github/workflows/materialize-release-candidate.yml` without workflow-file permission. The runner-local commit is not on the remote branch. Therefore the exact candidate package and approval request are validated artifacts, but they are not yet authoritative repository state.

Current position:

```text
RequirementsGathering through ChangeIntegration     COMPLETE
Historical graph recovery                            PROVEN
Two owner-authorized designed-by links               PROVEN
99-obligation SystemVerification                     VERIFIED
SystemVerification zero-call replay                  VERIFIED
Trusted verification traceability merge              VERIFIED
BusinessAcceptance technical coverage                EXHAUSTIVE
BusinessAcceptance evaluation and replay              VERIFIED
Exact source matrix                                  PASS 4/4
Exact candidate workflow artifact                    VALIDATED
Candidate persistence validation                      PASS
Candidate persistence push                            REJECTED
Candidate package in remote repository                NOT PERSISTED
Exact approval request in remote repository           NOT PERSISTED
Exact owner approval                                  BLOCKED ON PERSISTENCE
BusinessAcceptanceGate                                PENDING OWNER
Trusted acceptance traceability merge                 PENDING GATE
Final release evidence/catalog/matrix                 PENDING ACCEPTANCE
```

No public npm publication, one-click ChatGPT Desktop plug-in, hosted backend, deployment, or production-service claim is in scope.

## Exact candidate awaiting repository persistence

- Artifact name: `controlled-release-candidate-9d2b0d8e6b358dd6aed922de420224fe9efc320c`
- Materialization run: `31564607304`
- Workflow artifact ID: `9129184024`
- Artifact ZIP digest: `sha256:137f05e9685d5c504f26b53c31c2814243b538ab0a7101d451afc1fed7b12ed6`
- Candidate: `BA-CANDIDATE-ed2476ac90e1359f796d1ab8`
- Candidate semantic digest: `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22`
- Candidate raw digest: `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`
- Technical coverage: `BA-TECH-COVERAGE-fb1044a00dcbd9cd94fe4243` / `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`
- Approval request: `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001`
- Request digest: `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`
- Candidate proof: `DEVRELAY-CONTROLLED-RELEASE-CANDIDATE-001` / `sha256:39794039b87830b5ad89aa37c9603680f3c64b90f852ed1c3260ffef13609265`
- SystemVerification result: `SVR-3A6BA4ABED95BD19` / `sha256:e2aec86627f6afbd1116dc16d1bfd96ff14e66f6679b66d9e2dc0ed9f74610f4`
- Traceability checkpoint: `traceability-graph-devrelay-work-breakdown-r3` / `sha256:b0b64c6453fe02a9b7fbda50bd63139a7e71adcea28e0c3940db269a5974f754`
- Coverage: 81 acceptance criteria, 18 non-functional requirements, 8 objectives, 9 metrics, and 32 business-scope identities.
- Exclusions: public npm publication; one-click ChatGPT Desktop plug-in; hosted backend.

## Failed persistence transaction

- Run: `31566991321`
- Transaction base: `f1b62238dbd39e83526290abf41edf880faa493d`
- Runner-local commit: `6f7a84a` (not pushed)
- Validation: 842 tests, 840 passed, 0 failed, 2 skipped
- Catalog check: 3,492 repository digests, 281 npm-package paths, 11 modules, and 24 plug-ins
- Package check: 281 exact catalog-bound files plus installed root-import smoke test
- Push result: rejected because the GitHub App lacked permission to update a workflow file

No candidate byte was accepted into the remote branch by that transaction. This documentation reconciliation does not change that authority boundary and must not be treated as candidate persistence or release verification.

## Next trusted transition

1. Recover the exact workflow artifact by run, name, ID, and ZIP digest. Do not reconstruct the candidate.
2. Revalidate the exact 25-file package and persist it under `dogfood/release-acceptance/candidate-001/`.
3. Complete workflow cleanup or freezing with credentials permitted to update workflow files, or split workflow-file changes into a separately authorized commit.
4. Regenerate the release catalog only after every candidate, status, handoff, script, and workflow byte is final.
5. Run `npm run release:check`, push under branch compare-and-swap, and require the four-job Node/OS matrix.
6. Only after the exact request is persisted, obtain an explicit owner decision over those exact bytes.
7. If approved, execute BusinessAcceptanceGate with zero-call replay, merge and replay trusted acceptance traceability, and require zero blocking diagnostics.

The earlier exact approval named superseded source and cannot be reused. General instructions to continue are not the exact owner decision required by BusinessAcceptanceGate.

## Pickup

Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The older `2026-08-10` package remains immutable historical context.

# DevRelay current implementation status

Last reconciled: 2026-08-11 MDT
Active branch: `codex/lifecycle-run-report-completion`
Exact verified release-source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
Exact source verification run: `31564635275`
Active boundary: persist the exact corrected candidate and regenerate one coherent pre-approval catalog

This file is a human-readable status projection. Exact module artifacts, Gate records, graph checkpoints, release evidence, commits, and CI runs remain authoritative.

## Executive status

The portable DevRelay V1 source/library circuit is implemented through BusinessAcceptance. Source commit `9d2b0d8` passed Node 20 and Node 22 on Ubuntu and Windows. Materialization run `31564607304` then completed the corrected pre-approval circuit through released APIs and produced an exact 25-file candidate package.

The candidate artifact has now been independently redownloaded and checked against workflow artifact ID `9129184024` and ZIP digest `sha256:137f05e9685d5c504f26b53c31c2814243b538ab0a7101d451afc1fed7b12ed6`. Its canonical candidate, technical-coverage, approval-request, proof, SystemVerification, and graph bindings all match the materialization evidence.

A guarded persistence transaction is active at commit `8539aeda203a28ad105d2b4a03e812e0450c88d6`. It validates all 25 canonical JSON files, persists the exact package, updates the complete handoff, freezes automatic rematerialization, regenerates the release catalog after every final byte is written, runs `release:check`, commits under branch compare-and-swap, and explicitly requires the four-job final matrix.

The latest ordinary verify run at `8e280127` passed all 842 tests and failed only because this status file changed after the catalog was generated. No implementation or test regression remains in that run.

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
Exact candidate artifact                             VALIDATED
Candidate persistence transaction                    IN PROGRESS
Exact owner approval                                  PENDING PERSISTENCE
BusinessAcceptanceGate                                PENDING OWNER
Trusted acceptance traceability merge                 PENDING GATE
Final release evidence/catalog/matrix                 PENDING ACCEPTANCE
```

No public npm publication, one-click ChatGPT Desktop plug-in, hosted backend, deployment, or production-service claim is in scope.

## Exact candidate awaiting persistence

- Candidate: `BA-CANDIDATE-ed2476ac90e1359f796d1ab8`
- Semantic digest: `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22`
- Raw digest: `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`
- Technical coverage: `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`
- Approval request: `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001`
- Request digest: `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`
- Status: `awaiting-exact-owner-approval`

The earlier exact approval named superseded source and cannot be reused. The next authority boundary remains an explicit owner decision over the exact persisted request.

## Pickup

Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The older `2026-08-10` package remains immutable historical context.

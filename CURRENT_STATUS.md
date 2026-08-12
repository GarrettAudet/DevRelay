# DevRelay current implementation status

Last reconciled: 2026-08-12 MDT
Active branch: `codex/lifecycle-run-report-completion`
Exact verified release-source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
Latest passing persisted-source matrix: `31627413374`
Active boundary: final catalog, local release gate, and final four-job promotion matrix

This file is a human-readable status projection. Exact module artifacts, Gate records, graph checkpoints, release evidence, commits, and CI checks remain authoritative.

## Executive status

The portable DevRelay V1 deterministic source/library circuit is implemented through BusinessAcceptance for use through ChatGPT Desktop on Windows.

The owner explicitly approved request `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e` for candidate `BA-CANDIDATE-ed2476ac90e1359f796d1ab8`. The released BusinessAcceptanceGate produced accepted record `BA-RECORD-a6d15fb968dfbeeb5704fb42` / `sha256:a1e17d68bdf057ef5df2ceabca0befa1b4d0a79e5267a3d7a0478e3a96494cea`; exact replay made zero additional owner calls.

The historical graph lacked the 32 approved `business-scope` observations and could not be taken over by the expanded requirements observer because Core detected contributor-contract drift. A bounded trusted reconciliation reused the released requirements projector to add only those missing scope nodes and `defines` edges. BusinessAcceptance traceability then merged and replayed atomically. Final graph `traceability-graph-devrelay-work-breakdown-r5` / `sha256:50837069d2057932fce54375155fddb674edb65f9407a1b93b6554436ffc34d1` has zero blocking diagnostics.

Current position:

```text
RequirementsGathering through ChangeIntegration     COMPLETE
99-obligation SystemVerification                     VERIFIED
SystemVerification zero-call replay                  VERIFIED
BusinessAcceptance technical coverage                EXHAUSTIVE
Exact owner approval                                  APPROVED
BusinessAcceptanceGate                                ACCEPTED
BusinessAcceptance zero-call replay                   VERIFIED
Trusted acceptance traceability merge                 VERIFIED
Blocking traceability diagnostics                     ZERO
Final acceptance evidence                             PERSISTED
Final catalog/local gate/matrix                       IN PROGRESS
```

## Exact acceptance evidence

- Candidate: `BA-CANDIDATE-ed2476ac90e1359f796d1ab8` / `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22`
- Candidate raw digest: `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`
- Technical coverage: `BA-TECH-COVERAGE-fb1044a00dcbd9cd94fe4243` / `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`
- Owner approval: `BA-APPROVAL-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:e5ea7f73bb210f01dda3f0ea1528b910970999c90ed7d66b58d6233400c74282`
- Gate checkpoint: `sha256:5552f3802b1800f5cb092a0bae3bfd62eb36656bdc70106d3f24213b3fac79cb`
- Accepted record: `BA-RECORD-a6d15fb968dfbeeb5704fb42` / `sha256:a1e17d68bdf057ef5df2ceabca0befa1b4d0a79e5267a3d7a0478e3a96494cea`
- Acceptance graph: `traceability-graph-devrelay-work-breakdown-r5` / `sha256:50837069d2057932fce54375155fddb674edb65f9407a1b93b6554436ffc34d1`
- Final proof: `DEVRELAY-CONTROLLED-SOURCE-RELEASE-ACCEPTANCE-001` / `sha256:4766324761b24dc5b6146b9cbfa399505dfa110c11f969415b32e115b2c02aca`
- Coverage: 81 acceptance criteria, 18 NFRs, 8 objectives, 9 metrics, and 32 business scopes.

## Accepted delivery boundary

This acceptance covers the deterministic DevRelay source/library for ChatGPT Desktop on Windows. It does not claim public npm publication, a one-click Desktop plug-in, or a hosted backend.

## Next trusted transition

```text
regenerate content-addressed catalog
-> run complete local release gate
-> commit and push exact accepted evidence
-> require Node 20/22 on Windows/Ubuntu to pass 4/4
-> report controlled source/library release ready
```

## Pickup

Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The older `2026-08-10` package remains immutable historical context.

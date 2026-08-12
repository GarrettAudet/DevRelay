# Evidence index

## Accepted candidate

- Source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
- Candidate: `BA-CANDIDATE-ed2476ac90e1359f796d1ab8` / `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22`
- Candidate raw digest: `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`
- Technical coverage: `BA-TECH-COVERAGE-fb1044a00dcbd9cd94fe4243` / `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`
- Coverage: 81 acceptance criteria, 18 NFRs, 8 objectives, 9 metrics, 32 business scopes.

## Owner decision and Gate

- Request: `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`
- Decision: approved.
- Approval: `BA-APPROVAL-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:e5ea7f73bb210f01dda3f0ea1528b910970999c90ed7d66b58d6233400c74282`
- Gate checkpoint: `sha256:5552f3802b1800f5cb092a0bae3bfd62eb36656bdc70106d3f24213b3fac79cb`
- Record: `BA-RECORD-a6d15fb968dfbeeb5704fb42` / `sha256:a1e17d68bdf057ef5df2ceabca0befa1b4d0a79e5267a3d7a0478e3a96494cea`
- Outcome: `accepted`; lifecycle disposition: `construction-complete`.
- Replay: one initial owner call; zero replay owner calls.

## Traceability

- Business-scope reconciliation update: `dogfood/release-acceptance/candidate-001/29-requirements-baseline-observer-update.json`
- BusinessAcceptance update: `traceability-update-f29f2e757d971ade` / `sha256:b369e065b7f5bb63fd5c1abffd307aedb58491952cb526e40978e4c614fa8f01`
- Merge receipt: `traceability-merge-receipt-f29f2e757d971ade` / `sha256:9dd40b16f49cb2edfe598bb8b67a1e9ad200d6116cccaa7d8fb8035c2508a90a`
- Final graph: `traceability-graph-devrelay-work-breakdown-r5` / `sha256:50837069d2057932fce54375155fddb674edb65f9407a1b93b6554436ffc34d1`
- Blocking diagnostics: 0.
- Final proof: `DEVRELAY-CONTROLLED-SOURCE-RELEASE-ACCEPTANCE-001` / `sha256:4766324761b24dc5b6146b9cbfa399505dfa110c11f969415b32e115b2c02aca`

## Delivery boundary

- Included: deterministic controlled source/library use through ChatGPT Desktop on Windows.
- Excluded: public npm publication, one-click Desktop plug-in, hosted backend.

## Promotion evidence

- Latest prior passing matrix: run `31627413374`, 4/4 jobs.
- Final exact-commit local and remote promotion evidence is the remaining release step.

# Current state

## Exact repository position

- Branch: `codex/lifecycle-run-report-completion`
- Verified source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
- Latest passing persisted-source matrix: `31627413374` (Node 20/22 on Ubuntu/Windows: 4/4 pass)
- Candidate path: `dogfood/release-acceptance/candidate-001/`
- Active boundary: final promotion verification

## Completed and authoritative

The complete lifecycle circuit is persisted through BusinessAcceptance. Exact request `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e` was approved for candidate `BA-CANDIDATE-ed2476ac90e1359f796d1ab8`.

The released Gate created approval `BA-APPROVAL-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:e5ea7f73bb210f01dda3f0ea1528b910970999c90ed7d66b58d6233400c74282`, checkpoint `sha256:5552f3802b1800f5cb092a0bae3bfd62eb36656bdc70106d3f24213b3fac79cb`, and accepted record `BA-RECORD-a6d15fb968dfbeeb5704fb42` / `sha256:a1e17d68bdf057ef5df2ceabca0befa1b4d0a79e5267a3d7a0478e3a96494cea`. Replay invoked the owner zero additional times.

A bounded trusted reconciliation added the 32 missing business-scope observations without taking over historical contributor ownership. Trusted BusinessAcceptance traceability then advanced the graph to revision 5, digest `sha256:50837069d2057932fce54375155fddb674edb65f9407a1b93b6554436ffc34d1`, with zero blocking diagnostics.

## Remaining release check

The accepted evidence is authoritative, but release promotion still requires the exact final repository bytes to pass:

1. deterministic catalog generation;
2. local `npm.cmd run release:check`;
3. push of the exact accepted commit; and
4. the four-job Node 20/22 Windows/Ubuntu matrix.

No additional product or BusinessAcceptance decision is required unless any accepted artifact changes.

## Trust boundary

Do not alter the candidate, approval, accepted record, coverage, exclusions, or graph facts without regenerating their dependent artifacts. Do not claim npm publication, a one-click Desktop plug-in, hosted service, deployment, or production operations.

# Pickup prompt

Continue DevRelay from the exact persisted corrected candidate on branch `codex/lifecycle-run-report-completion`.

The verified source target is `9d2b0d8e6b358dd6aed922de420224fe9efc320c`; verify run `31564635275` passed Node 20/22 on Ubuntu/Windows. The 25-file candidate package is persisted at `dogfood/release-acceptance/candidate-001/`.

The candidate is `BA-CANDIDATE-ed2476ac90e1359f796d1ab8` with semantic digest `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22` and raw digest `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`. Technical coverage digest: `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`.

The exact approval request is `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` with digest `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e` and status `awaiting-exact-owner-approval`.

First obtain an explicit owner decision over that exact request. Do not infer approval from the stale earlier approval or broad instructions. If approved, execute BusinessAcceptanceGate and zero-call replay, merge trusted BusinessAcceptance traceability and replay, require zero blocking diagnostics, then update final evidence/handoff/catalog and verify the four-job matrix.

Preserve the exclusions: public npm publication, one-click ChatGPT Desktop plug-in, and hosted backend.

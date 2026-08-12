# Pickup prompt

Continue DevRelay on branch `codex/lifecycle-run-report-completion` from the exact candidate-persistence boundary.

Read `CURRENT_STATUS.md` and every file under `handoff/2026-08-11-controlled-release-acceptance-pickup/` before acting.

The verified release-source target is `9d2b0d8e6b358dd6aed922de420224fe9efc320c`. Verify run `31564635275` passed Node 20/22 on Ubuntu/Windows. Materialization run `31564607304` produced the exact 25-file candidate artifact `9129184024` with ZIP digest `sha256:137f05e9685d5c504f26b53c31c2814243b538ab0a7101d451afc1fed7b12ed6`.

Persistence run `31566991321` successfully downloaded and revalidated the exact artifact, regenerated the catalog, passed 842 tests with zero failures, and created runner-local commit `6f7a84a`. GitHub rejected the push because the GitHub App attempted to update a workflow file without workflow-file permission. The local commit is not on the remote branch, so the candidate package and approval request are not yet persisted.

The exact candidate is `BA-CANDIDATE-ed2476ac90e1359f796d1ab8` with semantic digest `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22` and raw digest `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`. Technical coverage digest: `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`. Exact request: `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`.

First persist the exact 25 candidate files without changing their bytes. Split workflow-file changes into a separately authorized commit unless the actor has workflow permission. After all bytes are final, regenerate the release catalog, pass `release:check` and the four-job matrix, then obtain an explicit owner decision over the persisted request.

Only after exact approval may you execute BusinessAcceptanceGate, prove zero-call owner replay, merge trusted acceptance traceability, and claim the corresponding accepted state.

Preserve the exclusions: public npm publication, one-click ChatGPT Desktop plug-in, and hosted backend. Stop on drift, missing evidence, workflow-permission ambiguity, non-zero replay calls, incomplete coverage, blocking diagnostics, or substituted approval.

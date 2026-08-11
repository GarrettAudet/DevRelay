# Controlled release acceptance pickup

This is the active pause/resume package for the controlled DevRelay
source/library release targeting ChatGPT Desktop on Windows.

- Repository: `https://github.com/GarrettAudet/DevRelay.git`
- Branch: `codex/lifecycle-run-report-completion`
- Verified source target: `477e7a449cb90d4ecb86c7271cb59f3e2d09b0d6`
- CI run: `31497854653` (four of four jobs passed)
- Current boundary: executable final SystemVerification and BusinessAcceptance
- Release status: source-verification green; BusinessAcceptance not yet recorded

Read `CURRENT_STATE.md`, then `NEXT_ACTIONS.md`. `EVIDENCE_INDEX.md` maps the
supporting evidence. `PICKUP_PROMPT.md` can be passed directly to the next
implementation owner. `candidate-materializer.wip.txt` preserves the exact
unfinished draft; it is not trusted execution evidence.

The release boundary excludes public npm publication, a one-click Desktop
plug-in, a hosted backend, deployment, and production-service operation.

The previous package under
`handoff/2026-08-10-lifecycle-run-report-pickup/` is historical. Its red-CI and
portability-blocker status has been superseded by the green evidence in this
package.

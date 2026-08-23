# Pickup prompt

Continue DevRelay from protected `main` at or after `57459b6d10da277c85e1396343cdb989fd5a9e54`. Create `codex/rp-001-release-preparation` for the next bounded increment.

Read `project/CurrentSynopsis.md` first, then `project/project-memory-baseline.json`, `ProjectOverview.md`, `project/roadmap-baseline.json`, `CURRENT_STATUS.md`, and this handoff package. Verify exact bytes and repository state before progressing.

The public `v0.10.0-rc.3` release exists, its exact assets are verified, and its publication automation repair is integrated. ProjectMemory `/conclude` baseline 1.0.3 is integrated through PR #14 at protected-main commit `57459b6d10da277c85e1396343cdb989fd5a9e54`; canonical verify `32594735309`, CodeQL `32594735306`, and scorecard `32594735329` passed. No scoped release blocker remains.

The next objective is roadmap initiative `RI-98EA0256A27DEFF2`, `ReleasePreparation and ReleaseVerification`. Begin with a visible adaptive RequirementsGathering interview; the roadmap intake is not a substitute for RequirementsGate closure. Then run every released DevRelay module and Gate in order, require accepted EnvironmentPreparation readiness before execution, complete repeating execution/verification/integration frontiers, run SystemVerification and BusinessAcceptance, and finish with `/conclude`.

Do not rebuild or replace the published `v0.10.0-rc.3` assets. Do not claim deployment, public npm publication, one-click Desktop installation, hosted operation, or non-Windows support without a separately approved requirements change.

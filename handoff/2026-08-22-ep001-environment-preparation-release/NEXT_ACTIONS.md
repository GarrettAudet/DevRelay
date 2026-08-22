# Next actions

1. Regenerate the release catalog for the status and handoff bytes bound to implementation/evidence commit `dba17c64249cc315bd0387acb95c3d2ce44125e9`.
2. Run `npm.cmd run release:check`; source, catalog, package contents, and the clean installed consumer must remain green.
3. Commit the exact checked tree as the final evidence seal without adding a self-referential seal-commit claim.
4. Push `codex/ep-001-environment-preparation` and confirm GitHub checks.
5. Promote through protected `main` only after the remote checks pass.
6. Start ReleasePreparation/ReleaseVerification by loading ProjectMemory and running RequirementsGathering; do not implement directly from the roadmap summary.

If any final gate fails, route the exact failure through diagnose, fix, verification, and integration. Regenerate downstream acceptance or memory evidence only when a bound artifact changes.

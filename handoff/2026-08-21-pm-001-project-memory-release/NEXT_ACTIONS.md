# Next actions

1. Materialize the complete dirty evidence delta on the exact PM-001 integration commit.
2. Regenerate `release/0.10.0-rc.3.json` from the complete staged candidate.
3. Run `npm.cmd run verify` and the installed-package check on that exact candidate.
4. Commit the evidence-sealed branch tip and push `codex/pm-001-project-memory`.
5. Require protected-main checks before promotion.
6. Begin EnvironmentPreparation/Verification by loading `project/CurrentSynopsis.md` first and running the complete released DevRelay circuit.

If any candidate byte changes after verification, regenerate the catalog and rerun the affected release proof. Never rewrite the implementation commit or accepted lifecycle artifacts.
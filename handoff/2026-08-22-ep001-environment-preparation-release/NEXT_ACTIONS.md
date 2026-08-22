# Next actions

1. Generate the release catalog with `npm.cmd run release:catalog` and inspect the exact diff.
2. Run `npm.cmd run release:check`; it must verify source, catalog, package contents, and a clean installed consumer.
3. If the catalog changes packaged bytes, regenerate the Windows installed-package receipt and replay only the downstream evidence that binds it.
4. Create the implementation/evidence-sealing commit pair without self-referential commit claims.
5. Push `codex/ep-001-environment-preparation` and confirm GitHub checks.
6. Promote through protected `main` only after the remote checks pass.
7. Start ReleasePreparation/ReleaseVerification by loading ProjectMemory and running RequirementsGathering; do not implement directly from the roadmap summary.

If any final gate fails, route the exact failure through diagnose, fix, verification, and integration. Regenerate downstream acceptance or memory evidence only when a bound artifact changes.

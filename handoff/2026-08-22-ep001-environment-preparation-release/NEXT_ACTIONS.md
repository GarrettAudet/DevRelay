# Next actions

1. Run the authoritative release check on the CodeQL-repaired candidate; all tests, catalog, package contents, and the clean installed consumer must pass.
2. Commit the exact checked implementation/evidence tree.
3. Bind that immutable commit in status and handoff, regenerate the catalog, rerun the release check, and commit the final seal without self-reference.
4. Push the superseding seal to PR #11 and require CodeQL, dependency review, and all four protected Node/OS checks to pass.
5. Promote through protected `main` only after every remote check passes and all conversations are resolved.
6. Start ReleasePreparation/ReleaseVerification by loading ProjectMemory and running RequirementsGathering; do not implement directly from the roadmap summary.

If any final gate fails, route the exact failure through diagnose, fix, verification, and integration. Regenerate downstream acceptance or memory evidence only when a bound artifact changes.

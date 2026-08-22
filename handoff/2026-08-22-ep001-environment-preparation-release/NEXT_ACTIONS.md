# Next actions

1. Regenerate the handoff manifest, release catalog, and exact status bindings for implementation/evidence commit `1e3933f1aaa0ab1c667ad5093e1e6e35d3d4dbbc`.
2. Run the authoritative release check against that final exact tree and commit the seal without self-reference.
3. Push the superseding seal to PR #11 and require CodeQL, dependency review, and all four protected Node/OS checks to pass.
4. Promote through protected `main` only after every remote check passes and all conversations are resolved.
5. Start ReleasePreparation/ReleaseVerification by loading ProjectMemory and running RequirementsGathering; do not implement directly from the roadmap summary.

If any final gate fails, route the exact failure through diagnose, fix, verification, and integration. Regenerate downstream acceptance or memory evidence only when a bound artifact changes.

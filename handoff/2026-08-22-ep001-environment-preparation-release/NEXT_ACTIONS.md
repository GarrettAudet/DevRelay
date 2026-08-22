# Next actions

1. Regenerate the handoff manifest and release catalog to bind immutable implementation/evidence commit `4e67574f2811c943c77facca05bccf1ed2bb671d`.
2. Repeat the authoritative `release:check` over the exact status/catalog seal and commit it without self-reference.
3. Push `codex/ep-001-main-provenance-reconciliation`, open the protected-main PR, and require CodeQL, dependency review, and all four Node/OS jobs to pass.
4. Merge through protected `main`, then require canonical-main verify, CodeQL, and scorecard to pass with the rebase-equivalent provenance proof.
5. Confirm tag `v0.10.0-rc.3` does not exist, create it at the exact green main commit, and require the GitHub source-release workflow to publish the prerelease successfully.
6. Verify the GitHub release, source archive, package tarball, checksums, SBOM, and provenance attestations before declaring release-ready.
7. Start ReleasePreparation/ReleaseVerification only after loading ProjectMemory and running RequirementsGathering; do not implement directly from the roadmap summary.

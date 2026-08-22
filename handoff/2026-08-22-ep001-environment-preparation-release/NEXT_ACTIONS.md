# Next actions

1. Stage the complete provenance-reconciliation artifact set and regenerate the tracked-source release catalog and handoff manifest.
2. Run the authoritative `release:check` against those exact bytes; fix any failure through the released execution/verification/integration loop.
3. Commit and push `codex/ep-001-main-provenance-reconciliation`, open the protected-main PR, and require CodeQL, dependency review, and all four Node/OS jobs to pass.
4. Merge through protected `main`, then require canonical-main verify, CodeQL, and scorecard to pass with the rebase-equivalent provenance proof.
5. Confirm tag `v0.10.0-rc.3` does not exist, create it at the exact green main commit, and require the GitHub source-release workflow to publish the prerelease successfully.
6. Verify the GitHub release, source archive, package tarball, checksums, SBOM, and provenance attestations before declaring release-ready.
7. Start ReleasePreparation/ReleaseVerification only after loading ProjectMemory and running RequirementsGathering; do not implement directly from the roadmap summary.

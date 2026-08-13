# Next actions

1. Commit and push the exact audit-remediation candidate.
2. Open a ready pull request to protected `main` and require all configured checks.
3. Merge only the exact green candidate; record the resulting `main` commit.
4. Create annotated tag `v0.10.0-rc.1` on that exact merge commit and push it.
5. Verify the GitHub prerelease workflow, checksums, CycloneDX SBOM, provenance attestation, catalog, and tarball.
6. On Windows, install the released tarball into a clean consumer and verify the root plus every exported subpath.
7. Append the second-frontier WorkExecution, WorkItemVerification, ChangeIntegration disposition, SystemVerification, BusinessAcceptance, and trusted TraceabilityGraph completion evidence.
8. Update the release notes and active handoff with exact run, artifact, tag, and release identities.

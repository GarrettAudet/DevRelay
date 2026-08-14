# Next actions

1. Review PR #7 and merge only the exact green candidate through protected `main`.
2. Record the merge commit and create annotated tag `v0.10.0-rc.1` on that exact commit.
3. Verify GitHub prerelease checksums, CycloneDX SBOM, provenance, catalog, and tarball.
4. Install the released tarball in a clean Windows consumer and verify all exports.
5. Bind final SystemVerification and BusinessAcceptance to the exact released artifact.
6. For any optional provider claimed `live-conformant`, execute it through the trusted host and preserve a validated `ProviderExecutionAttestation`; otherwise retain its lower maturity.

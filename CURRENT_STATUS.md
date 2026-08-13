# DevRelay current implementation status

Last reconciled: 2026-08-13 MDT
Protected branch: `main`
Canonical audited base: `fa5320374efd2228d924f4aa1c49ad4b418b5770`
Integrated implementation commit: `a8deb6b2616c55da735e517da723f91f851926d9`
Candidate version: `0.10.0-rc.1`
Active branch: `codex/v0.10.2-audit-remediation`
Release boundary: public GitHub source/installable library for ChatGPT Desktop on Windows

## Executive status

DevRelay is a locally verified **GitHub prerelease candidate**, not a stable
production release and not an operational orchestration deployment. The audit's
first four P0 controls are closed in the integrated implementation. The exact
annotated tag, GitHub prerelease assets, and released-artifact consumer proof do
not exist yet and remain the sole release frontier.

## P0 release controls

- Canonical status, roadmap, release evidence, and pickup reconciliation: complete.
- SpecialistAssignment Gate 2.0 checkpoint-replay authority: complete; v1 retained unchanged.
- Exact tag-to-package-version binding: complete and release-fatal.
- Lockfile-owned reproducible CycloneDX generation without ignored npm errors: complete.
- Protected annotated tag and immutable GitHub prerelease: pending protected-main integration.

## Exact local evidence

- Complete release gate: 868 tests; 866 passed; 0 failed; 2 intentionally skipped.
- Release catalog: 4,599 exact repository digests and 298 package paths.
- Installed package: 298 catalog-bound files and 174 export targets verified.
- SpecialistAssignment v2: checkpoint replay performs zero ranker calls and rejects cloned, serialized, and spread pseudo-receipts.
- Prior audited-main evidence remains historical evidence for `fa532037…`; it is not substituted for this candidate's new CI evidence.

## Boundary and exclusions

This candidate covers GitHub source plus the deterministic installable library
used through ChatGPT Desktop on Windows. It does not claim public npm
publication, a one-click Desktop plug-in, a hosted backend, a durable reference
host, live execution of every fixture-conformant upstream CLI, or stable
production-deployment readiness.

## Next action

Push the exact candidate, merge only through protected `main` after all required
checks pass, create annotated tag `v0.10.0-rc.1` on that exact merge commit,
verify the GitHub prerelease and clean Windows consumer install, then append the
remaining DevRelay lifecycle, traceability, SystemVerification, and
BusinessAcceptance evidence. The active pickup is
[handoff/2026-08-13-v0100-rc1-audit-remediation/README.md](handoff/2026-08-13-v0100-rc1-audit-remediation/README.md).

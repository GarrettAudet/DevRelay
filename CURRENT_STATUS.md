# DevRelay current implementation status

Last reconciled: 2026-08-13 MDT
Protected branch: `main`
Canonical audited commit: `fa5320374efd2228d924f4aa1c49ad4b418b5770`
Candidate version: `0.10.0-rc.1`
Active remediation branch: `codex/v0.10.2-audit-remediation`
Release boundary: public GitHub source/installable library for ChatGPT Desktop on Windows

## Executive status

DevRelay is a **conditional GitHub prerelease candidate**, not a stable production release and not yet an operational orchestration deployment. The construction lifecycle and controlled source artifact have passed their prior gates, but final prerelease promotion is intentionally blocked while the independent audit's P0 controls are executed and reverified.

## P0 release controls

- Canonical status and release evidence reconciliation: in progress.
- SpecialistAssignment Gate 2.0 checkpoint-replay authority: implemented; focused verification passing.
- Exact tag-to-package-version binding: implemented; full verification pending.
- Lockfile-owned reproducible CycloneDX generation: implemented; full verification pending.
- Protected annotated tag and immutable GitHub prerelease: pending all prior controls and BusinessAcceptance.

## Verified evidence retained

- Main verification run `31701048939`: four Node/OS lanes passed.
- CodeQL run `31701049017`: zero actionable alerts.
- Scorecard run `31701048991`: five documented governance signals.
- Controlled source workflow run `31701807978`: artifact `9181708671`.

Those records remain valid evidence for `main@fa532037…`; they are not evidence for the bytes in the active remediation candidate. New evidence will be generated after integration.

## Boundary and exclusions

This candidate covers GitHub source plus the deterministic installable library used through ChatGPT Desktop on Windows. It does not claim public npm publication, a one-click Desktop plug-in, a hosted backend, a durable reference host, or live execution of every fixture-conformant upstream CLI.

## Next action

Complete the DevRelay lifecycle for the five audit work items, regenerate the release catalog and handoff, merge through protected `main`, then create and independently verify `v0.10.0-rc.1`.

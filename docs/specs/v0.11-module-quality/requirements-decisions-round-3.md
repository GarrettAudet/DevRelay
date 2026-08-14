# RequirementsGathering decision record - round 3

Date: 2026-08-13

Status: sixteen decisions approved; one invalid question withdrawn and replaced

## Approved decisions from RG-MQ-WAVE-002

The owner approved questions 1-7 and 9-17 exactly as recommended. The resulting
requirements are:

1. Live provider executables use project-local checksum-pinned acquisition,
   explicit first-download approval, and no global installation.
2. Provider versions remain locked until controlled adapter evaluation and
   promotion; floating `latest` and automatic upgrades are forbidden.
3. Adapters default to local/offline execution. Network calls or source
   transmission require an explicit `network.connect` grant.
4. Silent fallback is forbidden. Native fallback occurs only when explicitly
   configured, and provider failure or unavailability remains visible.
5. Non-blocking unknowns proceed only as owner-approved assumptions. Security,
   privacy, destructive behavior, public API, data-loss, and acceptance
   ambiguities remain blocking.
6. Interviews have no arbitrary question limit and expose coverage, blockers,
   completed domains, and resumable state.
7. Strategy disagreement becomes one deduplicated conflict set with
   alternatives and trade-offs for owner resolution.
8. Godot inspection is read-only by default. Writes, input simulation,
   execution, screenshots, and tests require separately allowlisted grants.
9. Screenshot evidence preserves original bytes, hashes, and capture metadata.
   Input evidence preserves the exact action sequence, timing, target, and
   result. Vision descriptions are supplemental only.
10. Godot release acceptance requires focused tests, the complete GdUnit4
    suite, flake or soak testing, export, exported-build smoke testing, and
    artifact hashing, with explicit ApprovedNotApplicable dispositions.
11. Raw receipts are immutable local artifacts. Git receives digest-bound
    redacted views, and detected secrets or unsafe content block persistence.
12. Performance telemetry is local and enabled by default with no network
    export, recording only host-observed values.
13. Sentry and PostHog remain disabled, uninstalled, and outside V0.11 pending
    separate privacy requirements.
14. OpenSpec, Spec Kit, current Structurizr tooling, MADR format conformance,
    Godot AI, and GdUnit4 must become live-conformant; the combined path must be
    release-ready through Windows Desktop dogfooding.
15. BMAD, GSD, and Superpowers receive completed adapter evaluations. Live
    maturity is claimed only for bounded, deterministic, license-compatible
    operations; otherwise their practices enter the native strategy and the
    external binding is labeled honestly.
16. Final acceptance requires a clean GitHub checkout operated through ChatGPT
    Desktop on Windows to complete a small Godot change through the full
    circuit, including receipts, trace queries, two-phase Git sealing, compact
    reporting, and all four repository skills.

## Withdrawn question and source correction

The original question 8 referenced the unrelated BubbleGift project. That
project is not an input, dependency, target, fixture, or source of truth for
DevRelay. The reference resulted from an invalid workspace inference and is
withdrawn. No BubbleGift observation may influence the DevRelay Godot pack's
requirements or compatibility claims.

## Replacement wave RG-MQ-WAVE-003

1. Should the Godot pack derive support exclusively from a version-pinned,
   live-attested compatibility matrix for DevRelay's selected Godot AI and
   GdUnit4 adapter versions, with no project-specific assumptions and no claim
   for any Godot version not exercised by conformance and end-to-end tests?
   Recommended: yes.

## Current outcome

`clarify`

This is the only presently known unresolved requirements question. After it is
answered, Core must produce and validate the closure assessment before a
RequirementsGate candidate can be presented.

# Verification state and commands

## Last fully green baseline

Commit `31d79faed9a1b926188dc0eea34b0d443fda3a35` remains the last complete green release proof.
That historical result is still valid for its exact tree; it is not evidence
that the active portability branch is green.

The immutable earlier integration receipt remains unchanged at:

- 821 tests total
- 810 passed
- 10 environment-only missing-dependency failures
- 1 skipped

A later exact publication checkout installed 15 packages, audited 16, reported
0 vulnerabilities, and completed `verify` plus `release:check` green. Preserve
both historical records exactly.

## Active portability verification

### Toolchain/history repair

Commit: `2c4b6e3b67045544555983d408dec112eeab238f`
Workflow run: `31454853164`

All four matrix jobs successfully completed checkout, Node setup, Java 21
setup, and exact dependency installation. They then failed inside
`release:check`.

Representative Ubuntu/Node 20 evidence:

- static verification: PASS
- JSON files: 2655
- JavaScript modules: 421
- LF-only text files: 3336
- downstream operations with explicit ProjectOverview context: 13
- tests: 828
- passed: 811
- failed: 16
- skipped: 1
- Java: Temurin 21.0.11+10

The prior representative run had 18 failures. The workflow repair therefore
reduced the failure count to 16 and, more importantly, converted missing-Java
failures into real Structurizr verification.

The 16 failures grouped as:

- 4 historical/machine-path source failures;
- 6 Windows-only local-Git fixture failures;
- 6 architecture proof/review digest or exact-promotion failures.

### Local-Git fixture repair

Commit: `c957db0865ef990b27eb86d6671ed0df2e35aa9e`
Workflow run: `31457082371`

The test harness now uses OS-native absolute temporary paths in the mocked
negative cases. Production adapter semantics are unchanged. The four-way run is
still in progress at this package checkpoint, so the six failures are **not yet
recorded as closed**.

## Important passing evidence inside the red run

The active suite is not broadly broken. Among the passing paths:

- ContractGeneration dogfood remained deterministic, complete, traceable, and
  stopped at ContractGate.
- The exact historical `6ddd` continuation test skipped when
  `DEVRELAY_DG1_SOURCE_BUNDLE` was not configured rather than fabricating
  source evidence.
- LifecycleRunReport ArchitectureDesign dogfood passed.
- WorkBreakdown, WorkDependencyAnalysis core/runtime, SpecialistAssignment,
  WorkExecution, WorkItemVerification core, SystemVerification,
  BusinessAcceptance, ChangeIntegration core paths, and TraceabilityGraph tests
  largely remained green.

## Do not “fix” these failures by assertion drift

For ContractGeneration, SpecialistAssignment, WorkDependencyAnalysis, and
WorkItemVerification architecture dogfoods, Java 21 execution produced stable
semantic architecture change digests but different Structurizr conformance /
ArchitectureGate review digests from the committed expectations. Promotion then
failed exact-byte owner-review resolution as designed.

Do not update expected digests until the host-dependent proof field is isolated
and the generated evidence is made portable. A golden-hash refresh without that
analysis would hide the portability defect.

## Package verification

`MANIFEST.json` binds every packaged handoff document except itself.
`SHA256SUMS` binds those documents plus `MANIFEST.json`.

When editing the package, preserve UTF-8, NFC, LF-only text, and trailing LF.
Run the repository's normal static/release checks after source repairs rather
than treating documentation hashes as product verification.

# Verification state and commands

## Last fully green baseline

Commit `31d79faed9a1b926188dc0eea34b0d443fda3a35` remains the last complete green
release proof. That historical result is still valid for its exact tree; it is
not evidence that the active portability branch is green.

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

All four matrix jobs completed checkout, Node setup, Java 21 setup, and exact
dependency installation successfully, then failed inside `release:check`.

Representative Ubuntu/Node 20:

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

The prior representative failure count was 18.

### Local-Git fixture repair

Commit: `c957db0865ef990b27eb86d6671ed0df2e35aa9e`
Workflow run: `31457082371`

All four matrix jobs again completed setup successfully and failed only in
`release:check`.

Representative Ubuntu/Node 20:

- tests: 828
- passed: 817
- failed: 10
- skipped: 1

The six `change-integration-local-git-adapter.test.mjs` failures from the prior
run are absent from the complete `not ok` set. PB-004 is therefore closed.

The remaining ten failures are:

1. bootstrap architecture-host executor adversarial verifier: historical
   machine-local source module unavailable;
2. bootstrap OpenSpec requirements adversarial verifier: historical
   machine-local source module unavailable;
3. LifecycleRunReport independent adversarial verifier: duplicated Linux root
   caused by Windows-shaped path handling;
4. DG-1 architecture host executor materializer: historical prefix evidence
   manifest unavailable;
5. ContractGeneration ArchitectureDesign proof digest mismatch;
6. ContractGeneration architecture promotion exact-review failure;
7. SpecialistAssignment ArchitectureDesign proof digest mismatch;
8. WorkDependencyAnalysis ArchitectureDesign exact-review/proof failure;
9. WorkItemVerification ArchitectureDesign proof digest mismatch;
10. WorkItemVerification architecture promotion exact-review failure.

## Important passing evidence inside the red run

- ContractGeneration dogfood remained deterministic, complete, traceable, and
  stopped at ContractGate.
- The exact historical `6ddd` continuation test skipped when
  `DEVRELAY_DG1_SOURCE_BUNDLE` was not configured rather than fabricating
  source evidence.
- LifecycleRunReport ArchitectureDesign dogfood passed.
- Most WorkBreakdown, WorkDependencyAnalysis core/runtime,
  SpecialistAssignment, WorkExecution, WorkItemVerification core,
  SystemVerification, BusinessAcceptance, ChangeIntegration core, and
  TraceabilityGraph paths remained green.

## Do not “fix” architecture failures by assertion drift

For ContractGeneration, SpecialistAssignment, WorkDependencyAnalysis, and
WorkItemVerification architecture dogfoods, Java 21 execution produces stable
semantic architecture change digests but different Structurizr conformance /
ArchitectureGate review digests from the committed expectations. Promotion then
fails exact-byte owner-review resolution as designed.

Do not update expected digests until the host-dependent proof field is isolated
and the generated evidence is made portable. A golden-hash refresh without that
analysis would hide the portability defect.

## Package verification

`MANIFEST.json` binds every packaged handoff document except itself.
`SHA256SUMS` binds those documents plus `MANIFEST.json`.

When editing the package, preserve UTF-8, NFC, LF-only text, and trailing LF.
Run the repository's normal static/release checks after source repairs rather
than treating documentation hashes as product verification.

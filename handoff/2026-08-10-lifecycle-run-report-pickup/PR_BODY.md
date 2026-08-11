# What changed

This paused branch contains two bounded portability repairs plus an updated
LifecycleRunReport handoff package.

- `2c4b6e3b67045544555983d408dec112eeab238f` makes GitHub Actions preserve full
  Git history, install Temurin Java 21, and bind the Linux DevRelay Java
  executable.
- `c957db0865ef990b27eb86d6671ed0df2e35aa9e` makes local-Git adapter test
  fixtures use OS-native absolute temporary paths instead of Windows-only
  mocked paths. Product adapter semantics are unchanged.
- The handoff identifies `codex/lifecycle-run-report-completion` as the active
  resume branch, preserves `31d79faed9a1b926188dc0eea34b0d443fda3a35` as the
  last fully green release proof, and records the current red verification
  state honestly.

# Verification

Workflow `31454853164` after the CI/toolchain repair:

- all four jobs passed checkout, Node setup, Java 21 setup, and dependency
  installation;
- representative Ubuntu/Node 20 static verification passed;
- 828 tests: 811 passed, 16 failed, 1 skipped;
- failure count improved from 18 to 16.

Workflow `31457082371` after the local-Git fixture repair:

- all four jobs again passed setup and failed in `release:check`;
- representative Ubuntu/Node 20: 828 tests, 817 passed, 10 failed, 1 skipped;
- none of the six local-Git fixture tests remained in the failing set.

The remaining ten failures are four historical/path-source cases and six
architecture proof/review or exact-promotion cases.

# Known limitations / blockers

- Historical bootstrap verifiers reference original source bytes that are not
  committed. Do not reconstruct or silently substitute those bytes.
- One LifecycleRunReport adversarial verifier still has a cross-platform
  repository-root defect.
- Java 21 now exposes host-dependent Structurizr/ArchitectureGate evidence
  digests on Linux. Semantic architecture change digests remain stable, but
  exact-byte promotion correctly fails. Isolate the unstable proof field
  instead of refreshing expected hashes.
- PB-004 is closed.
- PB-005 and PB-006 remain open/partial.
- PB-002 remains intentionally unstarted and must execute transactionally last.
- LifecycleRunReport DG-2 through DG-6 remain pending.

# Release position

The last green baseline remains `31d79faed9a1b926188dc0eea34b0d443fda3a35`.
The active branch is close in implementation coverage but is not a release
candidate while the supported checkout is red. Finish portability/evidence
closure, PB-005/PB-006, the single PB-002 lineage transaction, and clean
verification before resuming the remaining LifecycleRunReport lifecycle.

# Current state

## Repository and increment

- Repository: `https://github.com/GarrettAudet/DevRelay.git`
- Active resume branch: `codex/lifecycle-run-report-completion`
- Source-work checkpoint: `c957db0865ef990b27eb86d6671ed0df2e35aa9e`
- CI/toolchain repair commit: `2c4b6e3b67045544555983d408dec112eeab238f`
- Last fully green release proof: `31d79faed9a1b926188dc0eea34b0d443fda3a35`
- Immutable execution anchor: `6ddd8d78f009ccb7d07d298bd214f520244e4496`
- Active increment: `DGI-LIFECYCLE-RUN-REPORT-2026-08-10`
- Current Gate/work boundary: `DG-1`, paused for portability closure
- LifecycleRunReport DG-2: not started

The exact package commit is the branch head containing this handoff. The
`31d79fa` identity is the last fully green release proof, not the current branch
head. Preserve the immutable `6ddd` historical lineage and all unrelated bytes.

## Work completed before pausing

Two bounded portability changes are committed:

1. `2c4b6e3b67045544555983d408dec112eeab238f` makes CI use full Git history and
   Temurin Java 21, with the Linux DevRelay Java executable explicitly bound.
2. `c957db0865ef990b27eb86d6671ed0df2e35aa9e` makes the local-Git adapter test
   fixtures use OS-native absolute temporary paths. Product adapter behavior is
   unchanged.

The first post-toolchain matrix run `31454853164` reduced the representative
Ubuntu/Node 20 failure count from 18 to 16. Static verification, history setup,
Java 21 setup, and dependency installation all passed.

The follow-up matrix run `31457082371` completed red on all four Node/OS jobs.
Its representative Ubuntu/Node 20 job ran 828 tests: 817 passed, 10 failed, and
1 skipped. None of the six local-Git fixture tests remained in the failing set,
so PB-004 is closed by source repair plus CI evidence.

The ten remaining representative failures are exactly:

- four historical/path-source portability failures; and
- six architecture proof/review digest or exact-promotion failures.

## Exact lifecycle position

The integrated ContractGeneration Route B lineage remains the controlling
semantic candidate:

- artifact: `CCS-DC7A978C15992619`
- raw digest:
  `sha256:361173cb70a33c2631daef341512cd5115f806b25cd9a48b759cc612968e2d2b`
- required interface intents: 48 of 57
- explicitly excluded intents: 9 with
  `interface.contractGeneration.required == false`

ContractGeneration dogfood still reaches a deterministic candidate and stops at
ContractGate. The exact historical `6ddd` continuation itself is not portable
because its original source bundle is not committed; the CI test correctly
skips that replay when a trusted source bundle is absent.

Do not reconstruct or fabricate the old source manifest. A forward repair must
use committed superseding evidence/checkpoints or an explicitly supplied,
digest-verified trusted source bundle.

## Remaining portability/evidence closure

1. **Historical/bootstrap source closure.** Two bootstrap verifiers and one
   DG-1 materializer refer to source locations that existed only in the
   originating environment. Their original bytes are not committed, so a
   repository-path rewrite would silently substitute evidence.
2. **LifecycleRunReport verifier root portability.** One independent adversarial
   verifier computes the repository root in a Windows-shaped way and fails on
   Linux. This is a focused path-only repair.
3. **Structurizr/ArchitectureGate proof portability.** Java 21 now runs in CI,
   exposing host-dependent proof/review digests for several architecture
   dogfoods. Semantic architecture change digests remain stable, but exact-byte
   promotion correctly fails. Isolate and remove the host-dependent field;
   never update golden digests merely to match one host.
4. **PB-005/PB-006.** Finish provenance and catalog/documentation closure once
   the source bytes are portable.
5. **PB-002.** Regenerate superseding content-addressed lineage once, last,
   after upstream bytes are stable.

## Product maturity

All 18 owner-approved V1 lifecycle components retain construction coverage.
That is strong implementation coverage, not release authority. The active
branch is not a release candidate while the supported matrix is red.

No Gate promotion, baseline mutation, TraceabilityGraph authority change,
accepted-prefix mutation, PB authority mutation, canonical lineage regeneration,
or LifecycleRunReport DG-2 implementation was performed in this pause cycle.

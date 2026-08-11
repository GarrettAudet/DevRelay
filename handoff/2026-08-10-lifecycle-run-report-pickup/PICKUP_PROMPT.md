# Ready-to-paste implementation-owner prompt

```text
Work only in the saved DevRelay repository on branch
codex/lifecycle-run-report-completion for increment
DGI-LIFECYCLE-RUN-REPORT-2026-08-10.

Read AGENTS.md and every file under
handoff/2026-08-10-lifecycle-run-report-pickup/ before acting. Treat the
handoff as a status projection and resolve authority using
DECISIONS_AND_INVARIANTS.md.

The source-work checkpoint for this handoff is
c957db0865ef990b27eb86d6671ed0df2e35aa9e. The last fully green release proof
is 31d79faed9a1b926188dc0eea34b0d443fda3a35; it is historical baseline
evidence, not proof that the active branch is green.

The latest representative CI run is 817 pass, 10 fail, 1 skip from 828 tests.
PB-004 local-Git portability is closed. Do not start LifecycleRunReport DG-2
yet. Resume by closing the remaining portability/evidence blockers:

1. Fix the LifecycleRunReport independent adversarial verifier's repository-root
   calculation cross-platform without changing its assertions.
2. Preserve the immutable historical 6ddd source evidence. Its original source
   bundle is not committed and must not be reconstructed. Use committed
   superseding checkpoints/evidence or an explicitly supplied digest-verified
   trusted source bundle.
3. Isolate the host-dependent bytes causing Structurizr conformance and
   ArchitectureGate review digest drift. Make the evidence portable; never
   refresh golden hashes just to match one host.
4. Close PB-005 and PB-006 only after the portable bytes are stable.
5. Perform PB-002 once, transactionally and last, then prove a no-change rerun.

Run focused checks during repairs, then full release:check and the supported
GitHub Actions matrix. Only after the supported prefix is green should you
resume DG-1 at the exact ContractGeneration candidate
CCS-DC7A978C15992619
(sha256:361173cb70a33c2631daef341512cd5115f806b25cd9a48b759cc612968e2d2b),
with exactly 48 required intents and nine explicit false-disposition exclusions.

Stop at ContractGate for a separate decision. Do not infer promotion. Do not
mutate Gate, baseline, TraceabilityGraph, accepted-prefix, PB authority, or
historical evidence to make tests pass. Fail closed on unavailable source
bytes, unexplained digest drift, host-dependent proof bytes, or any request for
implicit authority.
```

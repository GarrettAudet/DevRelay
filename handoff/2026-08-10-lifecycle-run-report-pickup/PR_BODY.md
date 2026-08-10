# What changed

- Added a self-contained LifecycleRunReport pickup package for active increment
  `DGI-LIFECYCLE-RUN-REPORT-2026-08-10`.
- Captured the controlling authority order, recursive dogfood rule, fixed design
  invariants, adapter maturity truth, PB closure order, evidence index,
  verification state, stop conditions, and a ready-to-paste owner prompt.
- Recorded the exact DG-1 pickup point: make the ContractGeneration continuation
  repository-relative and content-addressed, replay the 48-intent Route B
  candidate, and stop for a separate ContractGate review.
- Documented the remaining DG-1 planning prefix after exact ContractGate owner
  approval: WorkBreakdown, WorkDependencyAnalysis, SpecialistAssignment, their
  separate Gates, and the evidence that must be frozen before DG-1 completes.
- Linked the pickup from the root README and current status publication section.

# Why

The cumulative branch contains substantial accepted-working lifecycle and
host-binding evidence, but chat history is not authority and cannot be the only
way a new engineer understands the safe resume boundary. This package makes the
current state reviewable and portable while keeping baselines, Gate decisions,
TraceabilityGraph state, implementation, and test artifacts untouched.

# Impact / pickup point

The controlling ContractGeneration candidate is `CCS-DC7A978C15992619` with
raw digest
`sha256:361173cb70a33c2631daef341512cd5115f806b25cd9a48b759cc612968e2d2b`.
Exactly 48 of 57 approved interface intents require generation. Nine internal
WorkBreakdown/WorkDependencyAnalysis interfaces remain excluded because their
nested `contractGeneration.required` disposition is `false`.

The next implementation owner must first remove the external-directory
dependency from
`dogfood/bootstrap-contract-generation-host-executor/materialize-dg1.mjs` by
making its immutable input repository-relative and content-addressed. After
exact ContractGeneration replay, work stops at ContractGate. Promotion requires
a separate owner decision.

# Verification

- Verified all referenced evidence paths and 11 controlling raw SHA-256 values.
- Verified the handoff text as UTF-8, NFC, LF-only, with trailing LF.
- Verified no developer-machine absolute path is present.
- Verified `git diff --check` for the bounded documentation scope.
- Preserved the historical integration receipt exactly at 821 tests: 810
  passed, 10 environment-only dependency failures, and 1 skipped.
- Installed exact lockfile dependencies with `npm.cmd ci`: 15 packages added,
  16 audited, 0 vulnerabilities.
- `npm.cmd run verify` exited 0 with 2655 JSON files, 421 JavaScript modules,
  3336 LF-only text files, 13 downstream ProjectOverview operations, and the
  complete serial tests green.
- `npm.cmd run release:check` exited 0 with the same static gate plus release
  catalog, package, offline-install, and smoke verification.

# Known limitations

- The ContractGeneration materializer still needs the documented portability
  correction before repository-only replay.
- The historical integration receipt's Graphology/OPA dependency limitation is
  closed for this exact publication checkout; its original 821/810/10/1 record
  remains immutable historical context.
- External Structurizr validation was unavailable; fixture or bounded-host
  evidence does not prove general live interoperability.
- DG-5 still requires cross-platform supported-matrix proof twice; one green
  publication checkout does not satisfy that future criterion.
- All 18 V1 lifecycle components have construction coverage, but they are not
  all release-ready.

# Next steps

1. Apply and independently verify the bounded ContractGeneration portability
   correction.
2. Replay the exact 48-intent candidate and present it for separate ContractGate
   review.
3. After exact owner approval/promotion, complete the visible, configured
   production-like WorkBreakdown, WorkDependencyAnalysis, and
   SpecialistAssignment paths and their separate Gates.
4. Freeze the exact work-breakdown snapshot, DAG, assignments, pinned context,
   traceability, call counts, checkpoints, and replay evidence before closing
   DG-1.
5. Continue DG-2 through DG-6 and close PB items only in the recorded order.

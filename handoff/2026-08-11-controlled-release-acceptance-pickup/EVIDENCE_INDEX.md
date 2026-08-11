# Evidence index

## Verified source release

- Commit: `477e7a449cb90d4ecb86c7271cb59f3e2d09b0d6`
- GitHub Actions: `https://github.com/GarrettAudet/DevRelay/actions/runs/31497854653`
- Matrix: Node 20/22 on Windows/Ubuntu, four of four passed
- Local gate: `npm.cmd run release:check`, 842 total, 840 passed, 0 failed,
  2 skipped
- Catalog: 3,456 digests, 281 package paths, 11 modules, 24 plug-ins
- Installed-package smoke: offline, no dependency-cache requirement, passed

## Release-lineage correction

- Source: `src/system-verification-traceability-contributor.mjs`
- Regression: `test/system-verification-release.test.mjs`
- Commit: `477e7a4`
- Semantic rule: verification-evidence nodes carry
  `SystemVerificationResult.resultId/resultDigest`, not the raw loaded artifact
  envelope digest.

## Inputs for final graph and acceptance run

- Requirements: `project/requirements-baseline.json`
- Overview: `project/project-overview-baseline.json`
- Architecture: `project/architecture-baseline.json`
- Contracts: `project/contract-disposition.json`
- Work breakdown:
  `dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/04-work-breakdown/work-breakdown-baseline.json`
- Dependency baseline:
  `dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/05-dependency-analysis/work-dependency-baseline.json`
- Assignment baseline:
  `dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/06-assignment/specialist-assignment-baseline.json`
- Graph recovery seed:
  `dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/graph-recovery-epoch/revision-002/candidate-seed-snapshot.json`
- Integrated graph head and receipt:
  `dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/10-change-integration/`
- ChangeIntegration receipts and facts:
  `dogfood/lifecycle-run-report/execution/host-integration/` and
  `dogfood/lifecycle-run-report/execution/integrated-completion-facts/`

## Historical approval

The owner approval in chat is source evidence for the intended business
decision, coverage counts, links, and exclusions. It is not reusable as the
canonical owner approval artifact for the corrected candidate because it names
exact commit `33e65ba` and predates `477e7a4`.

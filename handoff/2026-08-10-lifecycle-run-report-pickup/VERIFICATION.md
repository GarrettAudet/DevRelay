# Verification state and commands

## Historical integration evidence

- Candidate manifest: 20 entries, all byte lengths and SHA-256 digests matched.
- Required intent selection: 48 selected from 57; nine explicit false
  dispositions excluded.
- Explicit DG-1 continuation: passed.
- Two materializations: each observed one generator call, one checkpoint, zero
  additional replay calls, identical manifest bytes, and terminal digest
  `sha256:361173cb70a33c2631daef341512cd5115f806b25cd9a48b759cc612968e2d2b`.
- Focused selector/adapter/runtime/canonical/surface/adversarial checks passed.
- Static verifier passed: 2649 JSON files, 421 JavaScript modules, 3320 LF-only
  text files, and 13 downstream operations.
- The immutable integration receipt records its complete custom suite, run once:
  821 total, 810 passed, 10 failed, 1 skipped. Its 10 failures were classified
  as environment-only missing `graphology` or
  `@open-policy-agent/opa-wasm`. Preserve those historical numbers exactly; do
  not rewrite the receipt from later checkout evidence.
- ChangeIntegration closure found zero unrelated dirty-byte changes and no
  staged, committed, pushed, Gate, baseline, graph, completion, prefix, or PB
  mutation.

External Structurizr validation was unavailable under the recorded environment.
Do not claim general live Structurizr compatibility.

## Current publication-checkout evidence

The publication checkout subsequently installed the exact lockfile dependencies
with `npm.cmd ci`: 15 packages added, 16 audited, 0 vulnerabilities.

- `npm.cmd run verify` exited 0. Its static gate counted 2655 JSON files, 421
  JavaScript modules, 3336 LF-only text files, and 13 downstream operations with
  explicit ProjectOverview context; the complete serial test suite was green.
- `npm.cmd run release:check` exited 0. It repeated the same static gate and
  completed the release catalog, package construction, offline installation,
  and package/module smoke flow.

This closes the historical Graphology/OPA dependency limitation for this exact
publication checkout. It does not replace the immutable integration receipt,
prove the cross-platform supported matrix twice required by DG-5, or establish
live Structurizr conformance.

## Pickup-package checks

Run these bounded checks after editing the handoff; they do not replay product
work:

```powershell
rg --files handoff/2026-08-10-lifecycle-run-report-pickup
rg --pcre2 -n "(?<![A-Za-z])[A-Za-z]:[\\\\/](?![\\\\/])" handoff/2026-08-10-lifecycle-run-report-pickup
git diff --check -- README.md CURRENT_STATUS.md handoff/2026-08-10-lifecycle-run-report-pickup
```

Parse `handoff.yaml` with an already-available YAML parser if one exists. Do not
install a parser merely for this documentation checkpoint.

## Before portable replay

Do not rerun the prior long suite merely to begin. First snapshot the dirty
tree, verify the evidence digests in `EVIDENCE_INDEX.md`, and diagnose any
drift. After the repository-relative/content-addressed portability correction,
run only the focused ContractGeneration checks necessary to prove the changed
boundary. Cross-platform supported-matrix proof twice is required later by
DG-5; the green publication checkout is one exact checkout result, not that
later proof.

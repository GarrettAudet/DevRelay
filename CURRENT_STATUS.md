# DevRelay current implementation status

Last reconciled: 2026-08-11
Active branch: `codex/lifecycle-run-report-completion`
Verified controlled-release source commit: `477e7a449cb90d4ecb86c7271cb59f3e2d09b0d6`
Active boundary: executable release-candidate materialization

This file is a human-readable status projection. Exact module artifacts, Gate
records, graph checkpoints, release evidence, commits, and CI runs remain the
authoritative records.

## Executive status

The portable DevRelay source/library candidate for ChatGPT Desktop on Windows
is source-verification green. Commit `477e7a4` passed the complete local release
gate and all four GitHub Actions Node/OS jobs. The repository is not yet marked
BusinessAccepted because the final executable lifecycle proof has not yet been
persisted and the owner's prior exact approval named superseded commit
`33e65ba`.

A dedicated GitHub Actions materialization workflow was added in commit
`17cfcff0ef8cb306e6f1439eaa270db15293e3b9`. It executes the preserved candidate
materializer through the released SystemVerification, BusinessAcceptance, and
TraceabilityGraph APIs, regenerates the release catalog for the produced bytes,
and uploads both the candidate package and generated catalog for inspection.
The workflow result is pending at this checkpoint. No candidate or acceptance
claim may be made until its exact output is retrieved and validated.

Current position:

```text
RequirementsGathering through ChangeIntegration     COMPLETE
Traceability reconciliation                         COMPLETE except final persisted two-link update
SystemVerification implementation                   COMPLETE and release-green
BusinessAcceptance implementation                   COMPLETE and release-green
Candidate materialization workflow                  STARTED
Final executable SystemVerification run             IN WORKFLOW
Final BusinessAcceptance candidate                  IN WORKFLOW
Exact owner approval for corrected candidate        REQUIRED AFTER MATERIALIZATION
BusinessAcceptanceGate + acceptance graph merge     PENDING
Release handoff / final metadata commit              PENDING
```

The ordinary release-check matrix is expected to remain temporarily red after
adding the workflow because the content-addressed release catalog has not yet
been committed for that new repository byte. The materialization workflow
regenerates the exact catalog alongside the candidate so both can be committed
transactionally after inspection.

No public npm publication, one-click ChatGPT Desktop plug-in, hosted backend,
deployment, or production-service claim is in scope.

## Completed release repair

- `3d9ad2f`: completed the portable lifecycle release candidate and regenerated
  its content-addressed evidence.
- `de32a5f`: made the release catalog independent of checkout location.
- `bbda9a6`: preserved immutable JSON release evidence across Windows/Linux
  checkouts.
- `14955a9`: made installed-package smoke verification cache-independent and
  offline.
- `33e65ba`: bound the provisioned Java 21 executable on Windows CI.
- `477e7a4`: corrected SystemVerification traceability to carry the semantic
  `SystemVerificationResult` reference required by downstream
  BusinessAcceptance coverage derivation.
- `17cfcff`: added an isolated candidate-materialization workflow that does not
  grant Gate, graph, owner-approval, publication, or deployment authority.

## Verification evidence

Local `npm.cmd run release:check` at `477e7a4`:

- tests: 842
- passed: 840
- failed: 0
- skipped: 2 intentional environment-dependent checks
- release-catalog digests: 3,456
- installed package paths: 281
- modules: 11
- plug-ins: 24
- offline installed-package smoke: pass

GitHub Actions run `31497854653` at exact commit `477e7a4`:

- Node 20 / Windows: pass
- Node 22 / Windows: pass
- Node 20 / Ubuntu: pass
- Node 22 / Ubuntu: pass

GitHub Actions run `31499685375` at handoff commit `60ee968` also passed all
four jobs. This confirms that the handoff and pending release metadata remained
source-verification green before the materialization workflow was introduced.

## Final acceptance scope already authorized by the owner

The owner authorized recording 81 acceptance criteria, 18 non-functional
requirements, 8 business objectives, 9 success metrics, and 32 scope identities
as satisfied from the cited evidence. The owner also authorized these two
forward, already-designed links to `EL-DEVRELAY-CORE`:

- `US-DEV-SPECIFY-001 -> designed-by -> EL-DEVRELAY-CORE`
- `NFR-DEV-DETERMINISM-001 -> designed-by -> EL-DEVRELAY-CORE`

The exact approval text was bound to `33e65ba`. Commit `477e7a4` is a necessary
downstream-lineage correction, so a trustworthy final Gate must present the
new exact candidate and obtain approval bound to its candidate raw digest and
corrected target commit. Do not silently reuse the old exact approval.

## Active materialization circuit

The workflow copies the preserved materializer into a temporary repository-root
module so its relative imports and repository root remain exact, then executes:

```text
restore approved graph checkpoint
-> merge the two approved designed-by links
-> execute SystemVerification through both released adapters
-> prove zero-call replay
-> merge trusted SystemVerification traceability
-> derive exhaustive BusinessAcceptance technical coverage
-> execute BusinessAcceptance and zero-call replay
-> emit an exact owner-approval request
```

The temporary module is deleted before release-catalog regeneration. Only the
persisted candidate artifacts, workflow byte, and other tracked repository
files may enter the generated catalog.

After exact approval, execute BusinessAcceptanceGate, merge the trusted
BusinessAcceptance contributor, require zero blocking graph diagnostics, update
release and handoff artifacts, run the full release gate, commit, push, and
verify the four-job matrix.

## Pickup

Start with `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`.
The prior `2026-08-10` package remains immutable historical context and is
superseded for active pickup by the new package.

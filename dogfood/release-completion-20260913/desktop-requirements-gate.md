# Desktop requirements Gate integration — candidate evidence

Date: 2026-09-14. Parent: `5e75a70f1f5a05087cf31949d996057c30f13b4f`.
Working branch: `codex/desktop-requirements-gate`; uncommitted candidate.

The host accepts a separate digest-bound requirements Gate submission after
Core completes an exact change invocation. Both prior baselines must equal the
configured approved context. Actual Gate validation yields one immutable pair
checkpoint including raw baseline bytes and the exact rendered overview.

The follow-up requires every cited approval's nonempty raw bytes and full file
binding in baseline citation order. Missing, extra, substituted and altered
evidence is rejected before publication. The checkpoint preserves those bytes
with the pair; read-only verification does not depend on a mutable approval
source file. This is integrity verification, not identity authentication or
independent human approval. Follow-up CLI verification passed as recorded below.

Saved-pair verification reconstructs those bytes through the owning Gate using
a genuine Core checkpoint receipt. A closed schema, canonical byte encoding,
exact commit reconstruction and content-derived key prevent a stored JSON claim
from substituting for validation. Verification opens storage read-only. Exact
resume retry preserves the run state version.

## Reproducible targeted evidence

Command: `node --test test/requirements-gate.test.mjs test/desktop-local-host.test.mjs test/release-completion-baseline.test.mjs`

On Windows, Node 24.19.0: **16 tests passed, zero failed, zero skipped**;
146863.7783 ms; process exit 0. The requirements-change test invokes the actual
CLI in independent processes for initialization, execution, response ingestion,
Gate submission, evidence, exact retry and verification. It uses a closed example
project and supplied Desktop result fixture, not live agent-produced code.

Negative cases include forged replay receipts, altered byte lengths, noncanonical
base64, altered invocation binding, added authority claims, malformed submissions
and interrupted pair publication. The baseline regression verifies the unchanged
real DevRelay requirements/overview pair; no new global promotion was performed.
The CLI test changes the approval source after a successful commit: resubmission
fails with exit 6, while read-only verification passes using the preserved bytes.

## Not established by this evidence

Pair submission returns `awaiting-gate-activation`, exit 5. A separate activation
now returns `requirements-activated`, also exit 5; `lifecycleComplete` stays false.
The saved-pair proof has scope `validated-requirements-pair`. Refreshed current
context and next-stage lifecycle routing remain incomplete. This is not an
installed-tarball proof of this increment, independent
human approval, final code-production acceptance or release sealing. The release
catalog still requires regeneration against the final committed candidate.

## Explicit activation follow-up

Observer 1.1.0 is an additive version selected explicitly in the host configuration;
the released 1.0.0 observer and default bundle remain unchanged. The owning Gate
revalidates the stored pair and evidence before passing explicit baseline outputs
to the trusted contributor. It does not fabricate a downstream module invocation.
Generic Core and adapters receive no new approval authority.

The host persists the exact prepared update before merge. Retry uses its original
base and exact reprojection, and returns the original graph receipt. Read-only
verification checks the checkpoint and applied graph ancestry. Candidate facts
remain separate from approved requirements facts. Approval artifact references
are preserved in the update's source-artifact closure, not invented semantic nodes.

Focused checks passed: seven requirements projection tests; a Windows executable
activation/replay/read-only verification flow; and a durable crash-before-merge
recovery test. The source-closure regression initially asserted a semantic node,
which is not how opaque evidence is represented; the corrected assertion checks
the stored update's exact source-artifact list and passes. The final four-file run
passed **24/24 tests**, zero failures/skips, 264767.7774 ms, including explicit-version,
stale-activation and stale-new-run rejection. Command:
`node --test test/requirements-gate.test.mjs test/requirements-traceability.test.mjs test/desktop-local-host.test.mjs test/release-completion-baseline.test.mjs`.

Review also identified a competing-activation race. A closed, project-wide
requirements-head reservation now binds the pending Gate before graph merge,
then advances the current pair after exact application proof. A competing Gate
cannot overwrite the winner, including while recovery is pending. Tests interrupt
both before and after merge, recover the same receipt, reject the competitor and
confirm no duplicate graph revision. New module work with old context is rejected;
historical read-only inspection and exact Gate recovery remain available.

An earlier installed tarball passed the Windows Gate/activation/verification/replay
smoke (455 packaged files, 227 installed export targets). That pass precedes the
reservation fix and does not verify the final package; final package verification
must be rerun against the regenerated catalog before submission.

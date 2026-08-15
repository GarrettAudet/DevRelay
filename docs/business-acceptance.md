# BusinessAcceptance Gate

BusinessAcceptance is the owner-controlled lifecycle Gate after
SystemVerification. It accepts only an exact verified `SystemVerificationResult`,
the current approved requirements/project-overview pair, the integrated-system
subject, an exact supported TraceabilityGraph checkpoint, and canonical raw
business evidence. It does not execute technical tests.

Core derives exhaustive technical coverage for every approved acceptance
criterion by following approved forward graph paths to passing
SystemVerification evidence. It separately evaluates every approved business objective, success metric, and business-scope identity.
A missing, duplicated,
stale, failing, or inconclusive disposition fails closed.

The owner receives the canonical raw candidate bytes and returns only canonical raw approval bytes.
The Gate checkpoints both raw-byte digests before producing
an accepted or rejected record. Only an accepted record is eligible for the
trusted `business-acceptance/accepted` contributor. Core prepares and
checkpoints that update before an atomic merge; replay reuses the exact receipt.
Blocking graph diagnostics prevent release sealing.

DevRelay 0.10.0-rc.2 executes this boundary through the complete V1
construction lifecycle for the GitHub source and deterministic installable
tarball operated through ChatGPT Desktop on Windows. The exact current
SystemVerification result, BusinessAcceptance record, and final graph are
published under `dogfood/v0.10-release-hardening/final-acceptance/`. The
historical pre-v0.10 pending disposition is retained as provenance only and is
not the current project status.

The exact attempt-004 handoff and parent rejection are preserved as history;
the fabricated generated artifacts were deliberately excluded from integration and
are not execution or release evidence.

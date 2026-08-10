# BusinessAcceptance Gate

BusinessAcceptance is the owner-controlled lifecycle Gate after
SystemVerification. It accepts only an exact verified `SystemVerificationResult`,
the current approved requirements/project-overview pair, the integrated-system
subject, an exact vocabulary-1.5 TraceabilityGraph checkpoint, and canonical raw
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

DevRelay 0.8.0 releases this module boundary from executable Core, Gate,
checkpoint-replay, trusted-contributor, and TraceabilityGraph conformance tests.
It does not claim that the full V1 project is accepted. ArchitectureDiscovery
and the dynamic LifecycleRunReport still lack authoritative evidence, so the
project disposition is pending and no current `SCOPE-*` identity is asserted
satisfied by the release.

The exact attempt-004 handoff and parent rejection are preserved as history;
the fabricated generated artifacts were deliberately excluded from integration and
are not execution or release evidence.

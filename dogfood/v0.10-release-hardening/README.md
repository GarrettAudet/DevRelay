# V0.10 release-hardening dogfood

Current state: the complete released DevRelay circuit has been run for the
v0.10 public open-source preview. Requirements, architecture, contracts, work
breakdown, dependencies, specialist assignment, eight WorkExecution /
WorkItemVerification / ChangeIntegration closures, SystemVerification, and
BusinessAcceptance are persisted with exact replay evidence.

Authoritative final evidence is under:

- `acceptance/` — seven-criterion release evidence candidate;
- `desktop-dogfood/` — isolated installed-tarball Windows Desktop run;
- `execution/`, `verification/`, `integration/`, and `traceability/` — per-work-item lifecycle records;
- `final-acceptance/` — SystemVerification, BusinessAcceptance, final graph, and promotion proof.

The accepted boundary is GitHub source plus a deterministic installable tarball
used through ChatGPT Desktop on Windows. Final protected-main promotion checks
remain before the source release can be reported ready.

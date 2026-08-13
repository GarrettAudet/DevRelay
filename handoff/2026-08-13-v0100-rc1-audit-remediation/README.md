# DevRelay v0.10.0-rc.1 audit-remediation handoff

This package is the active pickup for the independent-audit remediation and
GitHub prerelease promotion. The implementation frontier is integrated at
`a8deb6b2616c55da735e517da723f91f851926d9`; the final local release gate passes. The only
remaining work is the external operational-readiness frontier: push, protected
`main` review/checks, annotated tag, GitHub prerelease, and clean Windows
consumer verification.

Start with `CURRENT_STATE.md`, follow `NEXT_ACTIONS.md` exactly, and use
`EVIDENCE_INDEX.md` for the authoritative source artifacts. Do not claim a
stable production deployment, public npm publication, hosted backend, or
one-click Desktop plug-in.

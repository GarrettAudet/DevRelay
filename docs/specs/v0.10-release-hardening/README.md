# DevRelay v0.10 release hardening

## Goal

Replace the invalidated `0.9.0` release claim with a new content-addressed
candidate whose package, runtime support, release truth, repository controls,
and onboarding evidence match its declared release boundary.

The accepted `0.9.0` candidate at
`a38d2ffde71b5226721a45fedf203c62fc093739` remains immutable historical
provenance. No approval or digest from that candidate authorizes this change.

## Owner decisions

- Release model: public open-source preview.
- License: Apache-2.0.
- Contribution model: Developer Certificate of Origin sign-off.
- Candidate version: `0.10.0-rc.1`.

## Current stage

```text
intake: pass
clarify: pass
spec: in progress
architecture check: pass (release engineering only; no Core redesign)
task plan: in progress
implement: started
verify: pending
review: pending
memory update: pending
```

## Confirmed release blockers

1. Two declared package exports were excluded from the `0.9.0` tarball:
   `architecture-discovery.module.json` and
   `native-architecture-discovery.plugin.json`.
2. Package verification duplicated a hand-maintained export smoke list instead
   of deriving consumer tests from `package.json.exports`.
3. Node 20 is outside the new release support boundary; the maintained matrix
   is Node 22 and 24 on Windows and Ubuntu.
4. Release status and security documents contain stale identities and support
   claims.
5. The repository lacks the public governance, security automation, immutable
   release artifacts, and owner-side controls required for an OSS launch.

## Implementation plan

1. Derive tarball target and installed-consumer verification from every
   `package.json.exports` entry.
2. Import every exported JavaScript and JSON subpath from the installed
   tarball, including JSON import attributes.
3. Resolve every other fixed or wildcard-expanded export from the installed
   package.
4. Test the release on Node 22 and 24 across Windows and Ubuntu.
5. Pin release workflow actions to reviewed full commit SHAs.
6. Convert legal and contribution terms to Apache-2.0 plus DCO.
7. Generate and validate one release-truth artifact, then project human status
   documents from it.
8. Add public governance, security automation, SBOM, checksums, and release
   provenance.
9. Create a new candidate, catalog, verification record, and acceptance record.

## Verification evidence required

- focused regression proving omitted declared exports fail the package gate;
- installed-tarball import inventory for every JavaScript and JSON export;
- canonical local `npm run release:check` pass;
- four-job Node 22/24 Windows/Ubuntu matrix pass;
- regenerated content-addressed release catalog;
- no stale release identities or unsupported runtime claims;
- a new owner approval bound to the final candidate bytes.

## Deferred production-stability milestone

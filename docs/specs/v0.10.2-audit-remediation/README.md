# DevRelay v0.10.2 audit remediation

## Goal

Close the independent audit's five P0 findings without expanding the supported
product boundary, then promote the exact protected-main source to the
`v0.10.0-rc.1` GitHub prerelease.

## Requirements decision

The approved requirements and ProjectOverview already require deterministic
authority, exact artifact handoffs, protected-main release evidence, Windows
Desktop dogfood, and GitHub source/tarball distribution. RequirementsGathering
therefore emitted a content-addressed reuse disposition. No new business
requirement, public npm claim, hosted service, or one-click Desktop plug-in is
introduced.

## Architecture and contract decisions

The correction stays within Core Gate authority and release tooling. The
published SpecialistAssignment `1.0.0` contract is preserved unchanged.
SpecialistAssignment `2.0.0` is the active trusted route and requires:

```text
exact checkpoint replay
-> runtime-derived candidate and raw bytes
-> exact content-addressed owner approval
-> Gate-owned baseline promotion
```

ContractGeneration is applicable only to this versioned SpecialistAssignment
contract and its two adapter manifests. Tag identity, SBOM generation, status,
and release evidence are internal release-control changes.

## Work plan

- `WI-AUDIT-GATE-V2`: checkpoint-replayed SpecialistAssignment Gate `2.0.0`.
- `WI-AUDIT-RELEASE-IDENTITY`: exact tag/package/catalog/release identity.
- `WI-AUDIT-SBOM-LOCK`: lockfile-owned CycloneDX generation.
- `WI-AUDIT-STATUS`: canonical status, roadmap, and handoff reconciliation.
- `WI-AUDIT-TAG-PRERELEASE`: protected-main integration, annotated tag,
  prerelease, and clean consumer verification.

The first four work items are independent. The tag work item depends on all
four and on the complete release gate.

## Verification

Required evidence includes v1 byte immutability, v2 replay/substitution
adversarial tests, release-identity tests, exact lockfile ownership, catalog
verification, full serial conformance, package install/export verification,
four Node/OS protected-main jobs, security checks, release asset attestations,
and a clean Windows install from the GitHub release artifact.

## Traceability and status

The executable dogfood record is under
`dogfood/v0.10.0-rc.1-audit-remediation/`. `ROADMAP.md` records the subsequent
durable-host and Desktop-integration milestones. Promotion remains blocked
until every external GitHub release fact is evidenced.

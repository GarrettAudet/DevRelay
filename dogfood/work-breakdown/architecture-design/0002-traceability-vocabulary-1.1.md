---
status: proposed
date: 2026-08-02
---

# Version the WorkBreakdown traceability vocabulary as 1.1.0

## Context

WorkBreakdown needs new planning nodes and edges without silently changing the released `devrelay.traceability/v1@1.0.0` contract.

## Decision

Publish a compatible `1.1.0` vocabulary whose contract digest binds horizons, node kinds, edge kinds, and endpoint-policy version. Preserve exact legacy `1.0.0` recognition and legacy kinds. A valid 1.0 snapshot may accept a current 1.1 update only by producing a 1.1 child snapshot that preserves the exact old parent and update lineage. New WorkBreakdown contributors emit 1.1 only and retain the existing `implementation` horizon.

## Alternatives

- Mutate 1.0 in place: rejected because published exact versions are immutable.
- Reject all 1.0 parents: rejected because it creates an unnecessary migration cliff.

## Consequences

- Migration and replay tests must cover 1.0 validation, 1.1 update application, 1.1 child identity, and preserved parent/update lineage.
- The 1.1 contract digest becomes the authority for the expanded planning vocabulary.

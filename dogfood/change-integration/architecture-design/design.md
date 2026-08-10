# ChangeIntegration design

## Decision

Core binds one exact WorkItemVerificationGate approval and verified change to one configured local Git ref, expected target commit, integration policy, adapter binding, and idempotency identity. Core owns the compare-and-swap decision, checkpoint recovery, result validation, traceability, and progression. The adapter performs only one bounded conditional Git effect.

## Conflict boundary

No V1 component resolves conflicts automatically. Any conflict returns an immutable IntegrationConflictSet with the target unchanged. Reconciliation creates new implementation bytes and therefore must return through WorkExecution and WorkItemVerification.

## Consequences

A successful result proves repository incorporation only. It returns an IntegratedChangeRecord and updated RepositorySnapshot, creates factual integration traceability, and permits Core to consider frontier recalculation and SystemVerification; it never claims either downstream outcome.
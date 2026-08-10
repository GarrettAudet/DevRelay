# ChangeIntegration confirmed design basis

No blocking clarification is required: the owner-approved local Git target, compare-and-swap, no-auto-resolution, and success-output decisions fully constrain this V1 boundary.

1. **D-CI-TARGET-001**

   V1 integrates exactly one verified work-item change per invocation into one configured local Git ref; remote pull-request and merge systems are future replaceable adapters.

2. **D-CI-CAS-001**

   Core requires the target ref to equal the version-pinned expected target commit immediately before mutation; concurrent verified changes serialize and drift requires reconciliation plus re-verification.

3. **D-CI-CONFLICT-001**

   V1 never automatically resolves integration conflicts; it returns an immutable IntegrationConflictSet, leaves the target unchanged, and routes authorized reconciliation through WorkExecution and WorkItemVerification.

4. **D-CI-SUCCESS-001**

   Successful integration returns an IntegratedChangeRecord, updated RepositorySnapshot, and TraceabilityGraph merge proof; SystemVerification remains downstream.

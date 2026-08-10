# WorkItemVerification confirmed design basis

No blocking clarification is required: the approved V1 lifecycle, WorkExecution verification barrier, evidence-first quality objective, and immutable per-item execution model already constrain these decisions.

1. **D-WIV-UNIT-001**

   Verify exactly one immutable ExecutionAttempt and its ChangeSetDraft against one approved WorkItem per invocation.

2. **D-WIV-AUTHORITY-001**

   Verifier adapters produce evidence only; Core validates evidence and WorkItemVerificationGate owns the authoritative disposition.

3. **D-WIV-INTEGRATION-001**

   A passing item verification authorizes ChangeIntegration consideration but cannot integrate or create an integrated-completion fact.

4. **D-WIV-RETRY-001**

   Every verification run is immutable; rerun or additional evidence creates a new linked VerificationAttempt.

5. **D-WIV-ADAPTER-001**

   Core selects configured verifier adapters deterministically from approved evidence kinds and policy, never from model improvisation.

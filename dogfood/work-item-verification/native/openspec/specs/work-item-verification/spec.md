# WorkItemVerification requirements

- Verify exactly one immutable ExecutionAttempt and its ChangeSetDraft against one approved WorkItem per invocation.
- Verifier adapters produce evidence only; Core validates evidence and WorkItemVerificationGate owns the authoritative disposition.
- A passing item verification authorizes ChangeIntegration consideration but cannot integrate or create an integrated-completion fact.
- Every verification run is immutable; rerun or additional evidence creates a new linked VerificationAttempt.
- Core selects configured verifier adapters deterministically from approved evidence kinds and policy, never from model improvisation.

One invocation verifies one immutable execution result. All verification-plan and required-evidence obligations require an explicit validated disposition; only a separate exact Gate approval may advance the candidate to ChangeIntegration.

# WorkExecution owner decisions

The project owner answered the checkpoint-bound RequirementsGathering request with: `Approve all five recommended decisions`.

1. **Q-WE-EXECUTION-UNIT-001**

   One runnable WorkItem per invocation; Core fans out the frontier (recommended)

2. **Q-WE-RUNTIME-BINDING-001**

   A version-pinned ExecutionBinding resolves the profile to a configured executor adapter; Core validates it (recommended)

3. **Q-WE-OUTPUT-BOUNDARY-001**

   Return ChangeSetDraft plus ExecutionEvidenceBundle only; no verified, complete, or integrated claim (recommended)

4. **Q-WE-RETRY-IDENTITY-001**

   Create a new immutable ExecutionAttempt linked to the prior attempt; never overwrite (recommended)

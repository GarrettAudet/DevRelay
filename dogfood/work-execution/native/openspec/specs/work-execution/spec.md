# WorkExecution requirements

- One runnable WorkItem per invocation; Core fans out the frontier (recommended)
- A version-pinned ExecutionBinding resolves the profile to a configured executor adapter; Core validates it (recommended)
- Return ChangeSetDraft plus ExecutionEvidenceBundle only; no verified, complete, or integrated claim (recommended)
- Create a new immutable ExecutionAttempt linked to the prior attempt; never overwrite (recommended)

V1 assigns the complete approved work plan. Any unassignable item returns needs-clarification for the complete candidate; no partial assignment baseline is promotable.

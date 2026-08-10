# WorkExecution RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and WorkExecution architecture and implementation are blocked until every question below is answered.

1. **Should one WorkExecution invocation execute exactly one runnable WorkItem in an isolated workspace, while Core fans out the current ready DAG frontier?**

   - One runnable WorkItem per invocation; Core fans out the frontier (recommended)
   - One invocation executes the entire ready frontier

   Why it matters: Per-item attempts isolate retries, evidence, permissions, and failures while retaining dependency-safe parallelism.

2. **How should an assigned provider-neutral SpecialistProfile become a concrete executor?**

   - A version-pinned ExecutionBinding resolves the profile to a configured executor adapter; Core validates it (recommended)
   - The SpecialistProfile directly names and controls its executor

   Why it matters: The binding must be replaceable without giving the executor authority over eligibility, readiness, or policy.

3. **What may a successful WorkExecution attempt claim?**

   - Return ChangeSetDraft plus ExecutionEvidenceBundle only; no verified, complete, or integrated claim (recommended)
   - Return a completed and verified WorkItem

   Why it matters: Execution can prove that an attempt produced bytes and observations, but downstream modules own correctness and integration.

4. **How should retries be represented after failure or interruption?**

   - Create a new immutable ExecutionAttempt linked to the prior attempt; never overwrite (recommended)
   - Reuse and update the original attempt record

   Why it matters: Overwriting an attempt would destroy auditability and make replay ambiguous.

# WorkItemVerification design

## Decision

Core binds one exact WorkItem, ExecutionAttempt, ChangeSetDraft, ExecutionEvidenceBundle, policy, approved baselines, repository base, and candidate workspace. It expands every approved verification obligation, selects version-pinned verifier bindings, checkpoints raw results, normalizes subject-bound evidence, and evaluates closed policy outcomes. WorkItemVerificationGate alone approves progression to ChangeIntegration.

## Adapter boundary

Test, static-analysis, security, documentation, and human-review adapters produce observations and evidence only. They cannot reduce obligations, self-declare independence, approve verification, integrate changes, or author graph operations.

## Consequences

Every rerun or evidence continuation creates a new immutable VerificationAttempt. Exact replay invokes no verifier. Passing verification remains distinct from integration and integrated completion.
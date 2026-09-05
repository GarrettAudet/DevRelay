# DO-001 architecture change

Status: **Architecture Gate approved**

DO-001 sits above the released lifecycle. It consumes exact Core-owned dependency frontiers and emits host observations; it never becomes a Module stage or authority.

## Components

- Desktop plan and frontier projector: validates one DAG horizon and derives a deterministic concurrency-bounded frontier.
- Orchestration journal: persists work transitions and external-effect receipts through SQLite/CAS compare-and-swap leases.
- Durable Git worktree manager: binds one attempt, work item, revision, path, task, and cleanup disposition across restart.
- Desktop task adapter: provider-neutral `create`, `inspect`, `wait`, `message`, and `handoff` observation boundary.
- Review policy and merge-readiness evaluator: requires independent test/review evidence and risk-selected adversarial review.
- Operator projection: renders immutable task, worktree, memory, blocker, and recovery state.
- Desktop memory journal and plug-in hooks: validate ProjectMemory at startup, checkpoint turns, preserve candidate conclusions, and surface recovery to the next task.

## Authority boundaries

- Core remains the only readiness and lifecycle progression authority.
- Existing WorkItemVerification and ChangeIntegration remain the only verification and integration authorities.
- ProjectMemoryGate remains the only semantic-memory promotion authority.
- Trusted contributors may later project validated host facts; adapters and hooks receive no graph service.
- Ambiguous conflicts, trust failures, new external authority, and semantic product decisions stop for the owner.

## Failure and recovery

External effects are prepared durably before dispatch. A restart with a prepared, dispatched, or running item returns `reconciliation-required`; it never repeats the effect. Missing or revision-drifted worktrees quarantine. Cleanup requires an explicit completed, abandoned, or quarantined disposition and an exact managed path.

## Gate findings

- PASS: the design covers all 18 DO-001 acceptance criteria and five NFRs.
- PASS: no product-specific branch enters Generic Core.
- PASS: every task and worktree is exact-identity and least-privilege bound.
- PASS: hooks preserve context without treating transcripts or provider caches as authority.
- PASS: independent adversarial review and conflict escalation precede integration.
- PASS: the plug-in is the Desktop delivery surface and the advanced API remains provider-neutral.

# DevRelay Desktop orchestration

DevRelay Desktop is a cross-cutting host and plug-in layer for ChatGPT/Codex Desktop on Windows. It coordinates the already-released lifecycle; it is not a new lifecycle stage and never becomes a second source of readiness, Gate, verification, integration, graph, publication, or semantic-memory authority.

## What it adds

- `createDesktopOrchestrationPlan` validates one approved dependency horizon and a concurrency limit of one through eight.
- `deriveDesktopReadyFrontier` selects only pending items whose dependencies have exact integrated or concluded facts. Equivalent inputs produce the same sorted frontier.
- `createDesktopOrchestrationRuntime` journals every work transition in the existing SQLite/CAS host store. Prepared, dispatched, or running external effects become reconciliation-required after restart instead of being blindly repeated.
- `createDurableGitWorktreeManager` prepares, creates, binds, recovers, quarantines, and explicitly disposes exact detached Git worktree leases. Its records survive process restart.
- `createDesktopTaskPlan` binds one work item to its project, starting revision, worktree lease, assignment, executor, grants, prompt digest, exact loader-prepared ProjectMemory context and digest, and idempotency key. Serialized restart plans require exact fresh-bootstrap revalidation before dispatch.
- `createDesktopTaskAdapter` wraps the ChatGPT Desktop task surface through injected `create`, `inspect`, `wait`, `message`, and `handoff` handlers. Receipts are observation-only.
- `resolveDesktopReviewRequirement` requires tests and independent review for all work. High-risk, critical, cross-cutting, security, migration, integration, and release work also requires an independent adversarial reviewer.
- `evaluateDesktopMergeReadiness` blocks missing, failed, inconclusive, self-reviewed, stale-target, or conflicting work. Ambiguous conflicts always require owner review.
- `DesktopOperatorSnapshot` is a deterministic read-only view of work, worktrees, memory, blockers, and recovery.
- `HumanOrchestrationView` composes the complete agent/sub-agent tree, deterministic work queue, blockers, quality obligations, approvals, worktree leases, and ProjectMemory sessions without acquiring lifecycle authority.
- `HumanInterventionRequest` routes message, handoff, pause, resume, cancel, retry, approve, reject, and reprioritize requests to the exact owning adapter, orchestrator, Gate, or WorkDependencyAnalysis boundary. State-version and view-digest checks reject stale requests before effects, and exact replay never repeats a dispatched effect.

These APIs are exported from `devrelay/advanced`, the explicit `devrelay/desktop/*` package subpaths, and `devrelay/human-orchestration`. The package root remains the stable nine-operation facade.

## Persistent ProjectMemory

The repository-backed `ProjectMemoryBaseline`, `CurrentSynopsis.md`, and ProjectMemory Gate remain authoritative. Every fresh DevRelay task runs the dependency-free repository bootstrap from its own checkout before substantive work:

1. `plugins/devrelay-desktop/scripts/memory-bootstrap.mjs` validates the exact baseline, synopsis projection, promotion proof, and graph checkpoint without requiring package installation.
2. The resulting bootstrap receipt and memory-context digest are bound into the exact `DesktopTaskPlan`; fabricated or stale resealed contexts cannot dispatch.
3. A managed task returns a candidate-only session conclusion to its parent before ending. It never parses an unstable transcript into authoritative facts and never promotes semantic memory.
4. Uncertain external work and unapproved conclusions remain explicit recovery blockers instead of being blindly repeated or promoted.
5. The normal `/conclude` workflow validates owner dispositions, promotes ProjectMemory atomically, and supplies the exact `ConcludeReceipt` that closes the journal entry.

This provides deterministic cross-task survival without treating cached provider memory, prompt text, or conversation history as authority.

## Desktop plug-in

The source plug-in is in `plugins/devrelay-desktop` and contains:

- the `devrelay-orchestrate` skill;
- the dependency-free `memory-bootstrap.mjs` entry point;
- a bounded explicit lifecycle bridge retained for hosts that deliberately configure compatible events.

ChatGPT Desktop project instructions and the managed task prompt are the supported startup trigger. The released plug-in does not declare or claim an automatic lifecycle hook. Installing it therefore does not silently grant lifecycle-script execution authority.

## Orchestration sequence

```text
approved DAG + integrated facts
  -> deterministic ready frontier
  -> durable worktree lease + exact task plan
  -> ChatGPT Desktop task receipt
  -> WorkExecution
  -> WorkItemVerification + independent review
  -> policy-selected adversarial review
  -> merge-readiness
  -> ChangeIntegration
  -> worker conclusion
  -> next frontier
  -> SystemVerification -> BusinessAcceptance -> parent /conclude
```

If task creation may have succeeded before its receipt was journaled, or a worktree/target changed unexpectedly, recovery returns `reconciliation-required` or `quarantined`. The operator must supply exact host evidence or make the material conflict decision; DevRelay never creates a second task or selects a conflict side speculatively.

## Verification

Run:

```powershell
npm run verify
npm run release:check
```

The focused suites cover DAG cycles and concurrency, invalid state transitions, task substitution, stale or fabricated memory contexts, restart revalidation, exact worktree recreation, review-subject and actor lineage, conflict escalation, operator determinism, repository bootstrap, cross-task memory recovery, unrelated-directory isolation, schema validation, and ProjectMemory baseline integrity.

# DevRelay Desktop orchestration

DevRelay Desktop is a cross-cutting host and plug-in layer for ChatGPT/Codex Desktop on Windows. It coordinates the already-released lifecycle; it is not a new lifecycle stage and never becomes a second source of readiness, Gate, verification, integration, graph, publication, or semantic-memory authority.

## What it adds

- `createDesktopOrchestrationPlan` validates one approved dependency horizon and a concurrency limit of one through eight.
- `deriveDesktopReadyFrontier` selects only pending items whose dependencies have exact integrated or concluded facts. Equivalent inputs produce the same sorted frontier.
- `createDesktopOrchestrationRuntime` journals every work transition in the existing SQLite/CAS host store. Prepared, dispatched, or running external effects become reconciliation-required after restart instead of being blindly repeated.
- `createDurableGitWorktreeManager` prepares, creates, binds, recovers, quarantines, and explicitly disposes exact detached Git worktree leases. Its records survive process restart.
- `createDesktopTaskPlan` binds one work item to its project, starting revision, worktree lease, assignment, executor, grants, prompt digest, and idempotency key.
- `createDesktopTaskAdapter` wraps the ChatGPT Desktop task surface through injected `create`, `inspect`, `wait`, `message`, and `handoff` handlers. Receipts are observation-only.
- `resolveDesktopReviewRequirement` requires tests and independent review for all work. High-risk, critical, cross-cutting, security, migration, integration, and release work also requires an independent adversarial reviewer.
- `evaluateDesktopMergeReadiness` blocks missing, failed, inconclusive, self-reviewed, stale-target, or conflicting work. Ambiguous conflicts always require owner review.
- `DesktopOperatorSnapshot` is a deterministic read-only view of work, worktrees, memory, blockers, and recovery.

These APIs are exported from `devrelay/advanced` and the explicit `devrelay/desktop/*` package subpaths. The package root remains the stable nine-operation facade.

## Persistent ProjectMemory

The repository-backed `ProjectMemoryBaseline`, `CurrentSynopsis.md`, and ProjectMemory Gate remain authoritative. The Desktop plug-in adds an automatic local lifecycle journal under `PLUGIN_DATA`:

1. `SessionStart` locates a DevRelay project, validates the exact ProjectMemory baseline, hashes the synopsis bytes, persists a session binding, and injects compact orientation context.
2. `Stop` and `Interrupt` persist idempotent transcript/checkpoint digests when available.
3. `SessionEnd` persists a candidate-only conclusion. It never parses an unstable transcript format into authoritative facts and never promotes semantic memory.
4. The next fresh task receives any unapproved conclusion candidates as explicit recovery blockers.
5. The normal `/conclude` workflow validates owner dispositions, promotes ProjectMemory atomically, and supplies the exact `ConcludeReceipt` that closes the journal entry.

This provides automatic cross-task survival without treating cached provider memory, hook output, or conversation history as authority.

## Desktop plug-in

The source plug-in is in `plugins/devrelay-desktop` and contains:

- the `devrelay-orchestrate` skill;
- `SessionStart`, `Stop`, `Interrupt`, and `SessionEnd` command hooks;
- a bounded Node.js hook runner that no-ops outside a DevRelay project.

Codex requires a user to inspect and trust new or changed unmanaged hooks before they run. This is intentional: installation does not silently grant lifecycle-script trust. After installation, inspect the exact hook definitions with `/hooks`, trust them, and start a new task so the skill and startup hook are loaded.

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

The focused suites cover DAG cycles and concurrency, invalid state transitions, task substitution, restart recovery, exact worktree recreation, review independence, conflict escalation, operator determinism, plug-in startup/checkpoint/conclusion/recovery, unrelated-directory isolation, schema validation, and ProjectMemory baseline integrity.

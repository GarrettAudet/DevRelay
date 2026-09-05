---
name: devrelay-orchestrate
description: Orchestrate an approved DevRelay dependency frontier across isolated ChatGPT Desktop tasks and Git worktrees with durable ProjectMemory, policy-driven review, recovery, and operator visibility.
---

# DevRelay Desktop orchestration

Use this skill only inside a repository containing an approved DevRelay project baseline and `project/CurrentSynopsis.md`.

1. Verify the SessionStart ProjectMemory context and resolve every referenced approved baseline, graph checkpoint, work dependency baseline, assignment baseline, and target revision. Stop on drift or an unapproved prior conclusion.
2. Create a `DesktopOrchestrationPlan` with `createDesktopOrchestrationPlan`; never invent readiness. Derive each frontier only with `deriveDesktopReadyFrontier` from Core-owned dependency and integrated-completion evidence.
3. For each ready item, acquire one durable worktree lease, create one exact `DesktopTaskPlan`, and use ChatGPT Desktop task tools to create a project worktree task. Record the returned task ID before advancing. No task may work directly in the protected target checkout.
4. Wait for bounded sets of active tasks. Record task receipts and quarantine an uncertain create, handoff, or execution effect until the exact task can be reconciled; never blindly repeat it.
5. Route completed work through WorkItemVerification. Apply `resolveDesktopReviewRequirement`; use an independent task for required adversarial review. The implementer cannot review or approve its own work.
6. Call `evaluateDesktopMergeReadiness`. Missing, failed, inconclusive, stale, or conflicting evidence blocks integration. Never choose a side in an ambiguous conflict; request owner review.
7. Use ChangeIntegration for merge authority and persist its exact receipt before deriving the next frontier.
8. Keep the owner informed with `DesktopOperatorSnapshot`: current lifecycle stage, ready/active work, tasks, worktrees, test/review state, blockers, recovery, and memory conclusion status.
9. Every worker returns a candidate-only `SessionConclusion` to the parent. Before the parent stops, run the existing ProjectMemory conclusion workflow and bind the approved `ConcludeReceipt` to the desktop memory journal. Hooks preserve checkpoints and an unapproved candidate if the task is interrupted or ends unexpectedly.

The Desktop adapter, tasks, hooks, and this skill have no Gate, graph, readiness, verification, integration, publication, or semantic-memory promotion authority.

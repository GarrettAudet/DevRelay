---
name: devrelay-orchestrate
description: Orchestrate an approved DevRelay dependency frontier across isolated ChatGPT Desktop tasks and Git worktrees with durable ProjectMemory, policy-driven review, recovery, and operator visibility.
---

# DevRelay Desktop orchestration

Use this skill only inside a repository containing an approved DevRelay project baseline and `project/CurrentSynopsis.md`.

1. From the fresh task's own worktree, run `& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" plugins/devrelay-desktop/scripts/memory-bootstrap.mjs --task-id <stable-task-or-attempt-id>` before substantive work. The entry point is dependency-free; never substitute another checkout's script or project root. Verify its exact ProjectMemory baseline, synopsis, promotion proof, and graph checkpoint, then resolve every referenced approved baseline, work dependency baseline, assignment baseline, and target revision. Stop on drift or an unapproved prior conclusion. ChatGPT Desktop project instructions and the managed prompt are the startup trigger; do not claim an automatic plug-in hook ran.
2. Create a `DesktopOrchestrationPlan` with `createDesktopOrchestrationPlan`; never invent readiness. Derive each frontier only with `deriveDesktopReadyFrontier` from Core-owned dependency and integrated-completion evidence.
3. For each ready item, acquire one durable worktree lease, create one exact `DesktopTaskPlan` that pins the bootstrap receipt and memory-context digest, and use ChatGPT Desktop task tools to create a project worktree task. Include the verified memory context in the immutable prompt artifact and record the returned task ID before advancing. No task may work directly in the protected target checkout.
4. Wait for bounded sets of active tasks. Record task receipts and quarantine an uncertain create, handoff, or execution effect until the exact task can be reconciled; never blindly repeat it.
5. Route completed work through WorkItemVerification. Apply `resolveDesktopReviewRequirement`; use an independent task for required adversarial review. The implementer cannot review or approve its own work.
6. Call `evaluateDesktopMergeReadiness`. Missing, failed, inconclusive, stale, or conflicting evidence blocks integration. Never choose a side in an ambiguous conflict; request owner review.
7. Use ChangeIntegration for merge authority and persist its exact receipt before deriving the next frontier.
8. Build a `HumanOrchestrationSourceBundle` from the exact durable run plus bounded Desktop task observations, worktree leases, ProjectMemory sessions, approval requests, quality evidence, and prior intervention receipts. Project and render a `HumanOrchestrationView` so the owner sees the Core-derived frontier, full dependency-safe queue, agent/sub-agent topology, attention items, review state, worktrees, and memory continuity in one conversation-native view. The view is read-only and cannot invent readiness.
9. Convert owner controls into an exact `HumanInterventionRequest` bound to the displayed view digest and run state version. Dispatch it through `createHumanOrchestrationController`; never translate free text directly into a host effect. Message and handoff requests route to the Desktop task adapter, pause/resume/cancel/retry to the Desktop orchestrator, approval decisions to the named Gate, and reprioritization to WorkDependencyAnalysis. A stale state version or unavailable route fails closed, and exact retries reuse the checkpointed request receipt.
10. Every worker returns a candidate-only `SessionConclusion` to the parent. Before the parent stops, run the existing ProjectMemory conclusion workflow and bind the approved `ConcludeReceipt` to the desktop memory journal. Persist explicit checkpoint and conclusion artifacts when a task is interrupted or ends unexpectedly.

The Desktop adapter, tasks, bootstrap helper, and this skill have no Gate, graph, readiness, verification, integration, publication, or semantic-memory promotion authority.

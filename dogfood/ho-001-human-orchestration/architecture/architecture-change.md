# HO-001 architecture change

Status: **Architecture Gate approved**

HO-001 adds one independently versioned HumanOrchestration semantic Module around the released construction lifecycle. It is cross-cutting, not a lifecycle stage. The Module projects existing authoritative state for a human and routes typed requests to the exact authority that already owns the requested change.

## Read model

`HumanOrchestrationSourceBundle` binds one exact durable `LocalHostRunState` plus bounded observations for Desktop tasks, parent-child task relationships, worktree leases, ProjectMemory sessions, Gate approvals, quality evidence, and prior intervention receipts. The source bundle is immutable and canonical-digest bound.

`HumanOrchestrationView` derives the complete queue from the exact orchestration plan and state. It calls Core's `deriveDesktopReadyFrontier` and never accepts readiness from an adapter or caller. Every queue entry distinguishes ready, active, complete, terminal, dependency-waiting, and capacity-waiting states. Task observations form a validated acyclic agent/sub-agent topology; duplicates, missing parents, and cycles fail closed.

The view reports attention items, quality and approval summaries, worktree and memory continuity, and the available request types. Its authority object explicitly denies readiness, Gate, integration, ProjectMemory, TraceabilityGraph, and task-mutation authority.

## Command model

`HumanInterventionRequest` is the only control boundary. It pins the exact rendered-view digest, expected durable run state version, requester, timestamp, reason, action, target, payload, and deterministic route.

- message and handoff route to the Desktop task adapter;
- pause, resume, cancel, and retry route to the Desktop orchestrator;
- approve and reject route to the named Gate; and
- reprioritize routes to WorkDependencyAnalysis.

`createHumanOrchestrationController` re-reads the durable run before dispatch. State drift and unavailable handlers yield explicit rejection receipts. Handler failure yields a failed receipt. Exact request retries reuse the prior receipt without another effect. Receipts remain observation-only and cannot substitute for the target authority's own checkpoint or decision.

## Desktop integration

The repository plug-in skill constructs and renders the view at active frontiers and converts explicit owner instructions to typed requests. Chat text itself is never an effect input. Host-specific handlers remain replaceable, capability-bounded adapters; the Module contract is provider-neutral.

## Failure, recovery, and scale

Every artifact is canonical-digest bound. Source or topology drift blocks projection. Optimistic concurrency prevents a control created from an old view from mutating newer state. The projection sorts all bounded observations and performs linear task-topology, work-queue, and attention analysis. Acceptance includes a 1,000-work-item/1,000-task benchmark and clean installed-package Desktop evidence.

## Gate findings

- PASS: all seven HO-001 acceptance criteria and three NFRs map to explicit components.
- PASS: the construction lifecycle is unchanged and Core remains the sole readiness source.
- PASS: the view is read-only and request dispatch does not inherit target authority.
- PASS: optimistic concurrency and exact replay prevent stale or duplicate effects.
- PASS: task hierarchy validation rejects missing, duplicate, or cyclic identities.
- PASS: the ChatGPT Desktop skill uses the same public deterministic contracts.

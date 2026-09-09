# HumanOrchestration 0.1.0

HumanOrchestration is a cross-cutting semantic Module for ChatGPT/Codex Desktop operators. It does not add a construction stage. It combines exact lifecycle state with bounded host observations so a person can understand the whole run and submit explicit controls without creating a second source of truth.

## Operator view

`createHumanOrchestrationSourceBundle` binds one durable `LocalHostRunState` and the observations that live beside it:

- Desktop tasks and their parent-child relationships;
- Git worktree leases;
- ProjectMemory session and conclusion state;
- pending or decided Gate approvals;
- quality and review evidence; and
- prior human-intervention receipts.

`createHumanOrchestrationView` verifies that bundle and emits a digest-bound, read-only projection. Its queue includes every work item, current status, dependencies, blockers, and one of `ready`, `active`, `complete`, `terminal`, `waiting-on-dependencies`, or `waiting-for-capacity`. Only `deriveDesktopReadyFrontier` supplies readiness. The view also exposes an agent/sub-agent tree, attention list, worktrees, memory sessions, approvals, and quality evidence.

`renderHumanOrchestrationView` produces the compact conversation-native status view used by the Desktop skill.

## Human controls

An operator action first becomes a `HumanInterventionRequest`. The request pins:

- the displayed view digest;
- the expected durable run state version;
- requester, time, reason, target, action, and payload; and
- its deterministic authority route.

Supported requests are:

| Action | Route |
| --- | --- |
| message, handoff | Desktop task adapter |
| pause, resume, cancel, retry | Desktop orchestrator |
| approve, reject | the named Gate |
| reprioritize | WorkDependencyAnalysis |

`createHumanOrchestrationController` re-reads the durable run before dispatch. State drift rejects the request. A missing route handler rejects the request. Exact retries reuse the prior receipt and do not repeat the effect. The returned `HumanInterventionReceipt` is observation-only; it cannot stand in for a Gate decision, integration receipt, graph activation, memory promotion, or work completion.

## Desktop use

The bundled `devrelay-orchestrate` skill instructs a ChatGPT Desktop task to render the operator view during each frontier and translate owner controls into typed requests. Free text is never sent directly to an effect handler. The installed plug-in remains host guidance over the released contracts and has no independent lifecycle authority.

## Package surface

Use `devrelay/human-orchestration` for the focused API or `devrelay/advanced` for the full surface. The Module contract is exported as `devrelay/modules/human-orchestration.module.json`, and its artifact contract is available under `devrelay/contracts/human-orchestration-artifacts.schema.json`.

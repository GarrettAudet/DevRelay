# RM-001: RoadmapManagement and session context bootstrap

## Status

Requirements, architecture, contracts, work breakdown, dependency analysis, and specialist assignment are approved. The seven-item implementation is complete and the canonical gate is green. RM-001 is now at clean implementation sealing, Windows Desktop E2E, SystemVerification, and BusinessAcceptance. It remains a separate RC3 increment and does not alter the accepted SIM-001 RC2 evidence.

## Goal

Give DevRelay a deterministic, human-controlled way to capture, evaluate,
prioritize, and review potential roadmap initiatives while ensuring that every
fresh DevRelay task starts from the same approved project and roadmap context.

## Approved module boundary

`RoadmapManagement` is a cross-cutting semantic Module, not a mandatory stage
in the software-construction lifecycle. It owns three operations:

- `triage-candidate`
- `review-roadmap`
- `reprioritize`

A ChatGPT Desktop host may detect a potential net-new initiative and create a
`RoadmapIntakeCandidate`, but detection never mutates the roadmap. The existing
`RequirementsGathering` Module clarifies the idea through breadth-first waves
to mandatory 0.99 closure. `RoadmapManagement` then recommends exactly one
disposition: `keep`, `defer`, `merge`, or `discard`. A separate human-owned
`RoadmapGate` approves any baseline change.

The authoritative artifact is a structured, content-addressed
`RoadmapBaseline`. `Roadmap.md` is its concise deterministic human-readable
projection. Discarded and merged candidates remain auditable.

## Approved prioritization inputs

- strategic alignment
- user value
- urgency
- risk reduction
- effort range
- dependencies
- confidence

Weights are explicit configuration. The Module must also compare a candidate
with the current requirements, architecture, contracts, work breakdown,
dependency state, active work, and accepted work so it can identify duplicate,
conflicting, or already-covered initiatives.

V1 does not own dates, staffing, scheduling, execution, or work-item status.
GitHub Issues/Projects, Linear, Productboard, and similar systems are optional
adapters; the native file contract remains sufficient and authoritative.

## Mandatory fresh-task context

Mandatory context loading is a host/session-bootstrap responsibility, not an
operation of `RoadmapManagement` and not hidden Core state.
`DevRelaySessionBootstrap` runs once at the start of every fresh DevRelay task
opened in the configured project workspace, including a new tab or a new-day
task. It does not apply to unrelated ChatGPT conversations.

The bootstrap loads a compact `SessionContextSnapshot` containing exact,
digest-bound references to:

- `ProjectOverviewBaseline` and its `ProjectOverview.md` projection;
- `RoadmapBaseline` and its compact `Roadmap.md` projection;
- current project status and the active lifecycle run, when present;
- current approved baselines, pending Gate, and Core-derived ready frontier;
- unresolved clarification, approval, drift, and blocking diagnostics.

It emits a `SessionContextReceipt` that records the project identity, task/run
identity, artifact versions, content digests, repository revision, load time,
and outcome. Missing, malformed, stale, substituted, or digest-mismatched
required context fails closed. A project with no roadmap yet uses the explicit
`RoadmapNotInitialized` disposition and routes to baseline establishment; it
does not silently fabricate an empty roadmap or block unrelated inspection.

If an approved baseline changes during a task, the host must refresh and bind
a new snapshot at the next Module boundary. Each ModuleInvocation still
declares and receives its exact required artifacts. The session snapshot aids
orientation and candidate detection; it never replaces explicit Module inputs
or conversationally injects authority.

## Invocation points

RoadmapManagement may run:

- when the host detects and the user confirms a potential net-new initiative;
- when the user explicitly asks to inspect or review the roadmap;
- after `BusinessAcceptance`, to reconcile completed and newly discovered work.

## Next lifecycle step

The released circuit has completed through SpecialistAssignmentGate. Next, seal the clean implementation commit; execute, verify, and integrate the seven-item static DAG; run the installed Windows Desktop roadmap scenario; then complete SystemVerification, BusinessAcceptance, evidence sealing, and protected-main promotion.

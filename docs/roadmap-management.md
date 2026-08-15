# RoadmapManagement

`RoadmapManagement@0.1.0` is a cross-cutting semantic Module. It governs potential initiatives without becoming a mandatory construction stage and without owning scheduling, staffing, execution, or work status.

## Operations

| Operation | Purpose | Primary output |
| --- | --- | --- |
| `triage-candidate` | Compare one requirements-closed, owner-confirmed net-new candidate with exact current project state and recommend exactly one of `keep`, `defer`, `merge`, or `discard`. | `RoadmapChangeSetDraft` |
| `review-roadmap` | Re-evaluate and render the complete approved roadmap without mutating it. | `RoadmapDraft` |
| `reprioritize` | Recompute stable ordering from one exact versioned priority policy and current factor facts. | `RoadmapChangeSetDraft` |

Every invocation declares its exact `ProjectOverviewBaseline`, roadmap disposition, priority policy, and version-pinned context slices. Conversational memory is never an input contract.

## Authority boundary

The configured proposer may return initiatives and domain references only. The native proposer is the default deterministic binding; external planning systems may implement the same proposer port. Core owns context comparison, scoring, stable ordering, validation, checkpointing, and replay. `RoadmapGate` alone validates owner approval and promotes a `RoadmapBaseline` plus its exact `Roadmap.md` projection.

The structured baseline is authoritative. `Roadmap.md` is a UTF-8, NFC, LF-only projection whose raw digest is stored in the baseline. Gate promotion returns `refreshRequired: true`, causing the Desktop host to refresh session context at the next Module boundary.

## Priority policy

V1 uses explicit normalized weights over strategic alignment, user value, urgency, risk reduction, effort, dependencies, and confidence. Exact ties resolve by stable initiative identity. No model or adapter may introduce hidden factors.

## Initialization

A project with no baseline has the explicit `RoadmapNotInitialized` disposition. Read-only inspection remains available, while mutating execution is constrained to roadmap baseline establishment. DevRelay never fabricates an empty approved roadmap.

## Traceability

A trusted contributor projects only approved roadmap baselines and their contained initiatives. Adapters cannot create graph operations or claim implementation, verification, or acceptance.
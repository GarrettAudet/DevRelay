# WorkDependencyAnalysis design

## Context

DevRelay needs an authoritative dependency DAG between approved WorkBreakdown and SpecialistAssignment without coupling canonical semantics to one analyzer.

## Decision

Core constructs one complete immutable analysis snapshot and validates declared pinned context slices. A configured proposer emits only DependencyProposal. Core then owns graph mechanics through a replaceable Graphology-DAG implementation, evaluates pinned OPA policy, requests a bounded Spec Kit consistency review, and prepares the exact candidate for WorkDependencyGate. Task Master and OpenSpec remain optional proposal adapters.

## Boundaries

The module does not assign, estimate, schedule, execute, modify code, or record completion. It persists a static approved DAG; later modules derive runnable frontiers from current state.

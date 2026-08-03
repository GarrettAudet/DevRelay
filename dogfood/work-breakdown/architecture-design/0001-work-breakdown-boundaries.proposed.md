---
status: proposed
date: 2026-08-02
decision-makers: DevRelay maintainers
consulted: Workflow authors
informed: Adapter authors and downstream module owners
---

# Keep WorkBreakdown planning-only and provider-neutral

## Context and problem statement

DevRelay needs to convert approved requirements, architecture, and applicable contracts into discrete work without turning the module into a coding agent, dependency scheduler, or product-specific wrapper. Plug-ins are untrusted bounded capability providers, while graph assertions and baseline promotion require trusted deterministic authority.

## Decision drivers

- Deterministic routing and replay.
- Replaceable best-in-class adapters.
- Exact source and coverage traceability.
- No implementation or code execution inside WorkBreakdown.
- Clear downstream ownership boundaries.

## Considered options

### One provider-neutral planning module with configured adapters

- Good, because canonical semantics remain stable when tools are swapped.
- Good, because Core can validate one contract and one gate policy.
- Good, because planning capability grants can exclude implementation effects.
- Bad, because adapters require normalization into the canonical draft.

### Couple each operation permanently to Spec Kit or OpenSpec

- Good, because the first implementation is simpler.
- Bad, because tool replacement changes module semantics.
- Bad, because product identities leak into routing and Core.

### Let the adapter author traceability updates and dependency edges

- Good, because fewer Core-side contributors are required.
- Bad, because an untrusted plug-in could invent graph nodes, relationships, authority, or factual completion.
- Bad, because dependency hints would become authoritative before WorkDependencyAnalysis.

## Proposed outcome

Use one state-routed `WorkBreakdown` module with independently configured planning adapters. Core invokes a generic registered preflight before adapter effects. The adapter returns a canonical candidate containing the exact approved `WorkItemDraft` field set, including the literal kebab-case properties `bounded-scope`, `acceptance-criterion-refs`, `architecture-refs`, `contract-refs`, `required-capabilities`, `dependency-hints`, `verification-plan`, `required-evidence`, and `source-refs`. A separate WorkBreakdown Gate owns approval and baseline promotion. A trusted contributor derives the limited upstream-to-downstream planning graph assertions.

Typed work-breakdown changes use exact `add`, `update`, and `retire` operations bound to the current baseline. The deterministic pre-adapter drift outcome is `baseline_drift`. Factual execution and verification edges are prohibited at this stage.

## Consequences

- Positive: Spec Kit tasks, OpenSpec tasks, and future compatible planners can be swapped by configuration.
- Positive: no WorkBreakdown or provider-specific branch is needed in generic Core.
- Positive: the graph cannot claim implementation or verification from planned work.
- Negative: canonical normalization and contributor contracts add explicit schema and test surface.
- Negative: downstream dependency analysis remains a required separate module before assignment.

## Confirmation

Release verification must prove state-derived routing, pre-adapter drift rejection, adapter replacement, exact candidate validation, gate promotion, typed delta application, planning-only grants, trusted traceability projection, checkpoint-before-merge, and no factual completion edges.

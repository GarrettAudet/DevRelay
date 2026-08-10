# Decisions and invariants

## Authority order

When records disagree, use this order and fail closed:

1. Owner-approved, raw-byte-bound current baselines and Gate promotion records.
2. Published Module, operation, routing, step, plug-in, and artifact contracts.
3. Core-created exact checkpoints, replay receipts, and application proofs.
4. Independent verification handoffs bound to the exact candidate bytes.
5. Closed ChangeIntegration receipts proving saved-project incorporation.
6. Human-readable status, reports, handoffs, prompts, and chat history.

Lower layers explain higher authority; they cannot replace, promote, or amend
it. The LifecycleRunReport and this package are read-only projections.

## Recursive dogfood rule

Use the accepted working prefix to construct the next lifecycle slice through
the same public Module/Gate contracts a real project would use. Present and
preserve clarifications and Gate decisions. Never infer that an interactive
stage, verification, approval, or promotion happened merely because fixtures,
code, or a later artifact exist. New work may extend the prefix only after its
exact candidate is independently verified and integrated.

## Fixed design invariants

- Generic Core never branches on product, Module, operation, adapter, or
  interface IDs and never injects hidden project context.
- Every downstream Module receives its exact declared ProjectOverview baseline.
- Core derives routing from digest-verified persisted state and recomputes it at
  execution; callers and adapters cannot select or override the operation.
- Resolve the full exact adapter chain before execution and run steps only in
  declared order. Every handoff is immutable and schema-declared.
- Effect reuse requires an exact durable checkpoint. Graph-aware execution
  checkpoints the prepared update before merge and proves the stored receipt.
- Adapters are bounded proposers or executors. They receive no graph service and
  cannot claim Gate, routing, promotion, completion, or progression authority.
- Candidate and approved observations coexist under distinct authority and
  scope. History is superseded or retired, never deleted.
- Requirements, Architecture, WorkBreakdown, ContractGeneration, verification,
  and integration candidates never self-promote; their separate Gates own
  approval and progression.
- Published exact Module and plug-in versions are immutable.
- TraceabilityGraph is a Core-owned sidecar, not a Module, adapter, Gate, or
  workflow stage.

## Route B decision

Route B is controlling. ContractGeneration selects only entries for which
`interface.contractGeneration.required === true`. The approved architecture has
57 interface intents, 48 of which require generated contracts. The nine
excluded internal WorkBreakdown/WorkDependencyAnalysis interfaces explicitly
carry `required: false` and empty suggested kinds. Do not reopen Route A or
create an ArchitectureRevisionRequest without a new owner product decision.

The original `6ddd...` evidence manifest is immutable. The `80882...`
replacement manifest supersedes it; it does not rewrite history.

## Adapter truth and maturity

Use only the evidence-backed maturity vocabulary: `contract-defined`,
`fixture-conformant`, `live-conformant`, or `release-ready`. Core-owned native
implementations are not adapter maturity claims. OpenSpec requirements/design,
Structurizr, MADR, JSON Schema generation, and other bindings must be described
at their exact proven level. Fixtures and bounded host execution do not prove
general live upstream interoperability. The current Structurizr evidence is
environment-limited.

## Promotion-blocker order

Close blockers exactly in this order:

1. `PB-001` — remove committed developer-machine paths from portable report artifacts.
2. `PB-003` — make Structurizr/Java bootstrap hermetic with immutable toolchain evidence.
3. `PB-004` — repair local-Git negative fixtures so intended security properties are exercised.
4. `PB-005` — make provenance checks shallow-CI-safe or fixture-bound.
5. `PB-006` — reconcile exports, catalog, documentation, and compatibility from one source of truth.
6. `PB-002` — only after source repairs, transactionally regenerate stale content-addressed lineage and prove a clean no-change rerun.

PB-002 is deliberately last; manual hash repair would conceal upstream drift.

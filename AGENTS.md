# AGENTS.md

## Purpose

DevRelay is a small deterministic runner for composable
software-engineering Modules and interchangeable bounded adapters.

## Current scope

The executable V1 lifecycle is:

```text
RequirementsGathering -> RequirementsGate -> ArchitectureDiscovery?
-> ArchitectureDesign -> ArchitectureGate -> ContractGeneration?
-> ContractGate | ApprovedNotApplicable -> WorkBreakdown -> WorkBreakdownGate
-> WorkDependencyAnalysis -> WorkDependencyGate -> SpecialistAssignment
-> SpecialistAssignmentGate -> repeat each ready DAG frontier:
   WorkExecution -> WorkItemVerification -> ChangeIntegration
-> SystemVerification -> BusinessAcceptanceGate
```

Question marks are deterministic conditional routes, not missing product scope.
TraceabilityGraph runs beside every stage and is never a workflow stage or
plug-in authority.

Released semantic modules, gates, Core runtimes, schemas, manifests,
conformance fixtures, checkpoint/replay boundaries, and trusted traceability
contributors are shipped. The bundled graph and checkpoint stores are reference
implementations; durable host persistence remains external.

Adapter maturity must be stated precisely:

- deterministic native implementations ship for repository inventory,
  JSON Schema generation, dependency proposal/DAG mechanics, specialist
  selection, local Git integration, lifecycle-run reporting, and gate/runtime
  mechanics;
- OpenSpec, GitHub Spec Kit, Task Master, Structurizr, MADR, A2A, test, and
  review bindings are bounded contracts or fixture-conformant adapters unless
  a specific live execution record proves otherwise;
- no implicit model, provider, command, adapter, or network operation exists.

The supported `0.10.0-rc.2` release boundary is GitHub source plus a
deterministic installable tarball operated through ChatGPT Desktop on Windows.
Do not claim public npm publication, a one-click Desktop plug-in, a hosted
backend, or live upstream interoperability from fixture evidence.

## Invariants

- Generic Core never branches on a Module, operation, adapter, or product ID,
  and never injects hidden project context. Every downstream Module receives
  its exact `project-overview-baseline` through a declared input port.
- Adapters never receive the graph service and never author graph assertions.
  Trusted, versioned contributors may project only already validated canonical
  artifacts and only within their declared kinds and scopes.
- Graph-aware execution checkpoints the exact prepared update before merge.
  Replay must reuse that checkpoint without rerunning the adapter and must
  prove the exact stored receipt and result graph.
- Candidate and approved observations coexist as distinct authority/scope
  identities. A Module result never promotes graph facts; approval gates own
  activation. Graph history is retired or superseded, never deleted.
- An output- or evidence-bearing graph-aware result without a matching
  contributor fails closed. Generic Core must not contain contributor-specific routing.
- The bundled graph/checkpoint stores are reference implementations; durable
  atomic persistence remains a host responsibility.
- A Module owns provider-neutral ports, outcomes, result contracts, evidence,
  deterministic routing rules, and ordered step contracts.
- A plug-in owns one exact Module operation/step binding, execution mode,
  implementation configuration, and capability demand.
- Core loads persisted state bytes, verifies their digest and semantic
  contract, derives a `ModuleRouteDecision`, and recomputes it at execution.
  A model, adapter, or caller cannot select or override the operation.
- A chained invocation pins every step, exact adapter version, configuration,
  grant, option, and input artifact.
- Core resolves the complete chain before execution and invokes steps only in
  declared order.
- Every handoff is an immutable, schema-declared artifact result. Adapters do
  not share conversational or native session memory.
- Only the terminal step can return a successful primary Module result.
  Declared clarification, unable-to-proceed, and execution-failed outcomes may
  terminate early.
- An effect result is reused only after it was durably checkpointed and
  revalidated for the exact invocation ID, fingerprint, step, and plug-in.
  Cross-invocation clarification resume requires explicit lineage.
- Supporting architecture material is embedded or attached inside one
  `ArchitectureDraft` or `ArchitectureChangeSetDraft`; it is not exposed as
  separate successful Module outcomes.
- RequirementsGathering, ArchitectureDesign, and WorkBreakdown emit
  candidates, clarification, or diagnostics. Separate gates own validation
  policy, approval, and baseline promotion.
- A canonical requirements body is typed around purpose, business objectives,
  success metrics, stakeholders, users, capabilities, user journeys, user
  stories, acceptance criteria, non-functional requirements, constraints,
  scope, non-goals, terminology, current status, and supporting engineering
  context. Do not restore a generic duplicate `requirements[]` spine.
- `ProjectOverview.md` is a deterministic UTF-8/NFC/LF rendering of a
  structured ProjectOverview artifact. Its raw bytes are digest-bound evidence,
  never an independently editable source of truth.
- DevRelay has one current project-wide `RequirementsBaseline` +
  `ProjectOverviewBaseline` pair under `project/`. Feature- or Module-specific
  dogfood overviews are immutable historical evidence, not replacement project
  context. Future lifecycle slices evolve the global pair through change sets.
- The Requirements Gate promotes a requirements candidate and its matching
  project-overview candidate as one atomic pair. A requirements change always
  creates a new paired `ProjectOverviewBaseline`, even when the projected
  overview sections are unchanged.
- A `RequirementsChangeSet` is an optimistic full-body replacement bound to the
  exact prior requirements digest and exhaustive changed-section list.
- ContractGeneration generators propose native bytes only. Core owns kind-selected pinned format validation and canonical diff; ContractGate alone owns semantic compatibility policy, approval, ContractBaseline or ApprovedNotApplicable promotion, and progression to WorkBreakdown.
- Candidate and approved contract graph facts use separate trusted scopes; adapters never submit graph operations or activate approved contract facts.
- Detailed interface contracts belong to ContractGeneration. Architecture
  enforcement belongs to Verification.
- Cross-module artifact IDs have one schema owner.
- WorkBreakdown emits only deliverable-oriented candidate actions. Its exact
  work types are code-change, test-change, migration, configuration-change,
  infrastructure-change, documentation-change, and operational-readiness.
- WorkBreakdown Gate promotion derives the candidate and exact inputs only from
  Core's unforgeable checkpoint-replay receipt and commits only a
  raw-byte-bound baseline payload. Plain or cloned results are not approval
  authority.
- WorkBreakdown operations require effect adapters so Gate promotion always
  has a durable terminal checkpoint. `baseline_drift` is guard-owned and
  cannot be returned by an adapter.
- Attached architecture models, ArchitectureBaseline upstream pointers,
  ApprovedChangePackage pre-state and target pointers, and graph node
  references must resolve to their exact approved artifacts before planning.
- A WorkBreakdown `RevisionRequest` resolves its exact prior candidate and
  Gate evidence and is mutually exclusive with the clarification continuation
  trio.
- WorkBreakdown dependency hints are non-authoritative; WorkDependencyAnalysis
  owns the dependency DAG, cycle checks, and ordering validation.
- WorkBreakdown adapters declare domain references only. Trusted contributors
  derive upstream-to-downstream planning edges; adapters never create graph
  nodes, select edge kinds, or claim implementation or verification.
- Published exact Module and plug-in versions are immutable.
- Module-owned schemas compile through the generic schema helper; do not add
  module-ID conditionals to Core.

## Workflow

Before implementation:

1. Establish or update an approved, version-aligned
   `RequirementsBaseline` + `ProjectOverviewBaseline` pair.
2. Update the semantic Module, routing, step, or plug-in contract.
3. Add a valid invocation and positive/negative conformance fixtures.
4. Verify raw-byte digests, the exact `ProjectOverview.md` projection,
   deterministic routing, full-chain preflight, effect checkpoints, handoff
   validation, terminal results, and legacy compatibility.
5. Verify exact traceability projection, checkpoint-before-merge ordering,
   retry/idempotency, ownership isolation, and horizon diagnostics.
6. Prove generic source contains no product identifier branch.
7. Keep dependencies minimal. Ajv is the contract validator.

When the user says to use a Module, run its normal user-facing workflow:
present its clarification questions and gate decision in chat, then preserve
the resulting artifacts. Do not infer a completed interactive stage without
performing it.

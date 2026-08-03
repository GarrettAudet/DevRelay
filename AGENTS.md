# AGENTS.md

## Purpose

DevRelay is a small deterministic runner for composable
software-engineering Modules and interchangeable bounded adapters.

## Current scope

The executable contract slices are:

- `requirements-gathering@0.1.0`, which turns a goal and project context into
  a typed requirements candidate, its deterministic project-overview
  projection, or a clarification checkpoint through one configured plug-in;
- `architecture-design@0.1.0`, which state-routes an approved paired
  `RequirementsBaseline` and `ProjectOverviewBaseline` into
  `establish-baseline` or `design-change` and executes a configured designer,
  modeler, decision-recorder chain;
- `work-breakdown@0.1.0`, which state-routes exact approved requirements,
  project-overview, architecture, contract-disposition, repository, and
  capability inputs into `establish-breakdown` or `decompose-change`, producing
  one bounded planning candidate without executing work;
- `TraceabilityGraph`, a Core-owned sidecar that projects validated results
  from all three Modules into one living lifecycle graph and returns a standardized
  update plus merge proof in `ModuleExecutionRecord`. It is not a Module,
  adapter, gate, or workflow stage.

RequirementsGathering supports bounded OpenSpec and GitHub Spec Kit
requirements bindings. ArchitectureDesign V1 uses bounded Spec Kit plan or
OpenSpec design bindings, followed by Structurizr and MADR bindings.
WorkBreakdown supports bounded Spec Kit tasks and OpenSpec tasks bindings for
both operations; host configuration selects the preferred adapter.

The manifests and conformance fixtures are present; live upstream command
adapters are not shipped. Do not claim live interoperability from contract
fixtures. `ArchitectureDiscovery` is an explicit prerequisite contract for an
unknown existing system, but no executable discovery Module ships in `0.1.0`.

Do not add a workflow platform, agent framework, package marketplace,
distributed scheduler, provider wrapper, or plug-in-specific kernel behavior.

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
- The Requirements Gate promotes a requirements candidate and its matching
  project-overview candidate as one atomic pair. A requirements change always
  creates a new paired `ProjectOverviewBaseline`, even when the projected
  overview sections are unchanged.
- A `RequirementsChangeSet` is an optimistic full-body replacement bound to the
  exact prior requirements digest and exhaustive changed-section list.
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

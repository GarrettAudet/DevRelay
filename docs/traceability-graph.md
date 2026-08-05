# TraceabilityGraph

`TraceabilityGraph` is DevRelay Core's cross-cutting lifecycle index. It is an
infrastructure service, not a Module, adapter, workflow stage, or approval
gate. The workflow remains a sequence of engineering Modules; the graph runs
beside that sequence and records the verified semantic facts each completed
execution contributes.

## Position in execution

The canonical graph-aware execution path is:

```text
validated ModuleResult and exact artifact bytes
  -> trusted, versioned contributor projects graph assertions
  -> Core validates and checkpoints the exact TraceabilityUpdate
  -> graph store atomically and idempotently applies the update
  -> Core returns a ModuleExecutionRecord
  -> workflow progression becomes eligible
```

An adapter never receives the graph service and never authors graph facts.
OpenSpec, GitHub Spec Kit, Spec Kit plan, Structurizr, and MADR continue to
produce their bounded native and canonical artifacts. A module-owned
contributor projects only the already validated canonical artifacts into the
provider-neutral graph vocabulary.

A registry configured with `traceability: { graph, checkpoints }` makes this
path mandatory: ordinary `execute()` returns a `ModuleExecutionRecord`, and a
caller cannot replace or disable the configured services through invocation
context. `executeWithTraceability()` remains the explicit advanced seam.
An unconfigured registry retains exact 0.1 `execute()` behavior and returns a
plain `ModuleResult`; this is the compatibility boundary for applications that
have not adopted the 0.2 infrastructure service. Adapters see neither service
in either case.

## Standard records

Every graph-aware execution produces a closed `ModuleExecutionRecord` that
binds:

- the original validated `ModuleResult`;
- the exact invocation and result identity used by the contributor;
- one canonical `TraceabilityUpdate`, including an explicit no-change update
  for a declared non-contributing outcome;
- the exact persisted traceability checkpoint and its self/component digests;
- the graph merge receipt, resulting snapshot identity, diagnostics, and
  application proof.

The graph service also exposes validated snapshot and diagnostic records.
An output- or evidence-bearing result without an exact contributor fails closed. Core never
silently omits its traceability work, including when Module status is failed.

## Graph identity and provenance

A semantic node is identified by graph, closed node kind, stable logical ID,
authority, and contributor scope. This lets candidate and approved
observations coexist and prevents identifiers reused by different domains or
owners from colliding. Global immutable artifact-reference nodes are the one
exception: Core coalesces them by graph and exact artifact identity. Project
identity is bound by every graph snapshot and update. An edge is identified by
its closed relationship kind, exact typed endpoints, authority, and scope.

Requirements-internal relationships are authority- and scope-closed at both
endpoints; a candidate contributor cannot forge a link inside an approved
requirements set. Candidate architecture `designed-by` links may intentionally
originate at approved requirements and point to candidate architecture. That
relationship describes a proposed design without promoting the candidate
endpoint. All such assertions still retain their own candidate authority and
contributor scope.

Every assertion carries contributor, source-artifact, and JSON Pointer
provenance. Module-execution provenance is bound through the assertion's exact
TraceabilityUpdate and the graph's immutable applied-update history. Attached
architecture sections are resolved through the same trusted, content-addressed
artifact boundary as their parent output;
an unresolved attachment fails projection rather than disappearing from the
graph.

Each trusted contributor has a closed ownership descriptor containing its
scope, authority, allowed node kinds, and allowed edge kinds. Its contract
digest binds that descriptor. Different contributor contracts cannot claim
the same authority/scope, simultaneous handlers cannot emit the same logical
owner, and a contributor cannot replace or retire facts from another
contributor contract. Core owns artifact-reference assertions in the separate
`core/artifact-reference` scope.

Requirements contributors can replace or retire only requirements assertions.
Architecture contributors can create architecture assertions and links to
requirements, but cannot modify or retire requirements nodes. Later Modules
receive similarly bounded authority.

## Current contributors

RequirementsGathering projects the canonical candidate and its relationships,
including business objectives, success metrics, stakeholders, users,
capabilities, user journeys, user stories, acceptance criteria,
non-functional requirements, and requirements constraints.
`ProjectOverview` is represented as a projection artifact linked to the
canonical requirements candidate; its copied fields do not become competing
owners of duplicate semantic nodes.

The primary requirements path is:

```text
business objective
  -> capability
  -> user story | non-functional requirement | constraint
  -> acceptance criterion
```

ArchitectureDesign projects its candidate, technical design, architecture
elements and relationships, views, interface intent, architecture
constraints, and decision records. Each architecture target is linked to the
exact normative requirement IDs declared by the validated architecture
artifact. Acceptance-criterion coverage is reached transitively through its
owning requirement; the contributor does not invent direct architecture-to-AC
claims.

ArchitectureDesign also observes its exact approved RequirementsBaseline and
ProjectOverviewBaseline inputs. This allows a new graph to acquire approved
requirements observations before architecture links are applied. The observer
does not promote a draft; it creates a separate source-bound
`requirements/baseline` scope.

WorkBreakdown observes its exact approved requirements, ProjectOverview, and
architecture inputs, then projects candidate WorkItem nodes and only these
forward planning relationships:

```text
AcceptanceCriterion -> planned-by -> WorkItem
ArchitectureElement -> implementation-planned-by -> WorkItem
Contract -> realization-planned-by -> WorkItem
```

Those assertions remain candidate authority and never claim execution,
implementation, realization, testing, or verification. Future contributors
extend the same graph with contract, code-change, test, integration,
verification-evidence, and acceptance nodes. They use the same update,
authority, provenance, checkpoint, and merge contracts rather than adding a
new orchestration special case.

## Merge and history semantics

Snapshots are immutable, canonical, and fully materialized. Updates use
per-entity optimistic preconditions. A stale update may rebase only when every
assertion it touches still satisfies its precondition; disjoint concurrent
updates therefore converge, while overlapping updates return a deterministic,
sorted conflict. Core never uses last-writer-wins.

An exact update application is idempotent. The traceability checkpoint is
written before graph application, so a graph failure can be retried without
rerunning the Module adapter. Retrying after the graph already accepted the
update returns the original application result rather than duplicating facts.
Persistent compare-and-swap loss stops after a bounded retry budget.

Every accepted update, including a semantic no-op, creates one new immutable
graph revision. The snapshot binds its parent, exact last update, complete
applied-update set, and resulting assertions. Core reloads the update, receipt,
snapshot, prior graph, and current head from the store, deterministically
recomputes the application, and requires the result snapshot to be in the
persisted head lineage before returning application proof.

Graph history uses retirement and supersession, not physical deletion. Queries
can select current or historical observations, and stale relationships remain
auditable even when their endpoint is retired.

RequirementsGathering and ArchitectureDesign emit candidates. Their facts
remain `candidate` until the corresponding approval gate contributes a
lifecycle activation update. A draft must never appear approved merely because
it was merged into the graph. WorkBreakdown follows the same rule; its approved
baseline facts require a later trusted activation observer.

## Queries and diagnostics

The package root exports `queryTraceabilityGraph(snapshot, options)`,
`diagnoseTraceabilityGraph(snapshot)`, and
`createTraceabilityDiagnosticReport(snapshot, refs)`. A query selects starts
by exact node IDs or by `{ kind, stableId, authority?, scope? }`, traverses
`outgoing`, `incoming`, or `both`, and returns a deterministic reached subgraph
plus one shortest discovered path per reached node. `maxDepth` is bounded and
retired history is excluded unless explicitly requested.

A host wires the built-in contributors and reference stores as follows:

```js
import {
  architectureTraceabilityContributors,
  createInMemoryTraceabilityCheckpointStore,
  createInMemoryTraceabilityStore,
  createModuleRegistry,
  createTraceabilityGraphService,
  requirementsTraceabilityContributors,
} from "devrelay";

const graph = createTraceabilityGraphService({
  graphId: "graph-project",
  projectId: "project",
  store: createInMemoryTraceabilityStore(),
  contributors: [
    ...requirementsTraceabilityContributors,
    ...architectureTraceabilityContributors,
  ],
});
const registry = createModuleRegistry({
  modules,
  plugins,
  artifactContracts,
  traceability: {
    graph,
    checkpoints: createInMemoryTraceabilityCheckpointStore(),
  },
});
```

Traversal is deterministic and can follow relationships forward, backward, or
in both directions. This supports impact analysis and paths such as:

```text
business objective -> architecture decision -> code change -> test -> evidence
```

Coverage diagnostics are horizon-aware:

- At the requirements horizon, internal requirements gaps are meaningful;
  missing architecture and evidence are not yet applicable. A capability may
  receive quality coverage from a capability-scoped non-functional requirement
  or constraint, or from a project-scoped quality requirement.
- At the architecture horizon, normative requirements without a designed or
  explicitly justified no-impact disposition are reported as uncovered.
- At the implementation horizon, work and code with no accepted upstream
  justification are reported as unscoped.
- At the verification horizon, acceptance criteria without approved or
  observed passing evidence are reported as missing evidence. Candidate tests,
  evidence, or assurance edges are proposals, not proof. Traversal follows
  only approved or observed assertions and sanctioned lifecycle edges such as
  `tested-by`, `produces`, and `verified-by`. Reverse `applies-to` and `defines`
  relationships may connect scoped quality requirements to their evidence; a
  generic `depends-on` edge to a passing evidence node cannot satisfy the
  diagnostic.

Diagnostics are reports, not implicit gates. A Module or gate declares which
diagnostic codes are progression-blocking for its pipeline.
A report's optional update reference must be an exact typed member of the
snapshot's applied-update history; a same-digest or unrelated update cannot be
substituted.

## Storage boundary and 0.2 limits

The package includes a deterministic in-memory store for tests, local use, and
conformance, plus a separate in-memory immutable trace checkpoint store.
Durable hosts implement both atomic boundaries. Store responses are treated as
untrusted data and validated for exact bytes, contract, deterministic update
application, and head lineage; the durable store implementation remains the
persistence trust root. DevRelay does not claim a distributed transaction
across arbitrary checkpoint and graph databases. Its portable guarantee is
checkpoint-first application with exact idempotency and replay reconciliation.

This release does not ship Neo4j, a hosted graph service, live upstream tool
adapters, or approval-gate contributors. It defines the graph contracts,
reference engine, RequirementsGathering, ArchitectureDesign, and WorkBreakdown
contributors, and the graph-aware Core execution boundary on which those
integrations can be added without changing Module semantics.

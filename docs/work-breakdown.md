# WorkBreakdown

`work-breakdown@0.1.0` converts exact approved scope into a complete candidate
set of bounded, traceable, independently executable and verifiable work items.
It plans actions. It does not perform them.

```text
approved requirements + project overview + architecture + contracts
                              |
                              v
                    WorkBreakdown adapter
                              |
                              v
       WorkBreakdownDraft | WorkBreakdownChangeSetDraft
                              |
                              v
                    WorkBreakdown Gate
                              |
                              v
                  WorkBreakdownBaseline
```

## Deterministic operations

Core selects the operation from a digest-verified `ProjectWorkBreakdownState`.
The invocation cannot select a different operation by omitting an input or by
asking a model to reinterpret project state.

- `unbaselined` selects `establish-breakdown`.
- `baselined` with the exact current baseline and approved change package
  selects `decompose-change`.

An existing repository with no work-breakdown baseline uses
`establish-breakdown`. The module never invents or reconstructs historical
work.

Adapter selection is separate from operation routing. Both included plug-in
manifests implement both operations. Host configuration may use Spec Kit tasks
for a greenfield baseline and OpenSpec tasks for existing systems or changes,
but those are replaceable defaults rather than Core behavior.

## Exact inputs

Both operations require content-addressed references to:

- `ProjectWorkBreakdownState` and the Core-authored route decision;
- `RequirementsBaseline`;
- `ProjectOverviewBaseline`;
- `ArchitectureBaseline`;
- `ContractDisposition`;
- a provider-neutral `CapabilityCatalog`.

`ArchitectureBaseline` may embed its architecture model or attach it as an
exact content-addressed artifact. Core validates attached bytes, schema,
content ID, and model structure before using element IDs. Its requirements and
ProjectOverview pointers must exactly match the separately loaded baselines;
URI relocation alone does not change artifact identity.

`ContractDisposition` is either an exact contract-baseline reference plus its
normalized contract targets, or an authority-bearing `ApprovedNotApplicable`.
The normalized target set lets WorkBreakdown validate contract references
without claiming ownership of a future ContractGeneration module.

`establish-breakdown` additionally requires exactly one correlated
`repository-context` variant: either an exact `RepositorySnapshot`, including
revision and tree digest, or an authority-bearing `ApprovedNotApplicable` for
baseline establishment without a repository. Schema and media type are paired;
cross-pairing the two variants is invalid.

`decompose-change` additionally requires the exact current
`WorkBreakdownBaseline`, an `ApprovedChangePackage`, and a distinct exact
`current-repository-snapshot`. The package binds
approval evidence, pre-change baselines, target requirements and architecture,
contract-change disposition, repository revision and tree, relevant graph
references, and the authorized delta.


The package's `preChange` references must equal the corresponding input
bindings of the exact current WorkBreakdown baseline, while its target
references must equal the invocation's current approved baselines. Every
traceability reference names the exact `TraceabilityGraphSnapshot` that owns
it and a canonical node ID present in that snapshot; Core resolves and
validates both before adapter entry.
## Pre-adapter drift guard

The `ProjectWorkBreakdownState` runtime contract registers a trusted generic
input guard. Core discovers that guard from the loaded artifact contract after
raw bytes and deterministic routing have been validated. The guard has no
adapter, graph, or host capability.

A version, digest, disposition, revision, tree, current-baseline, or approved
change-package mismatch produces:

```text
status: completed
outcome: baseline_drift
outputs: none
diagnostics: required
```

Core validates that result against the ordinary module-result contract and
persists it under a producer identity distinct from the configured plug-in.
Replay revalidates the same guard checkpoint and never enters the adapter.
Generic Core contains no WorkBreakdown, Spec Kit, or OpenSpec branch.

`baseline_drift` is owned by the registered guard. Core rejects a configured
adapter that attempts to return that outcome after the guard has passed, so
the distinct producer and zero-adapter-call invariant cannot be forged.

## Work item contract

Every `WorkItemDraft` is a closed object with exactly these literal fields:

```yaml
id:
objective:
bounded-scope:
deliverables:
work-type:
acceptance-criterion-refs:
architecture-refs:
contract-refs:
required-capabilities:
dependency-hints:
verification-plan:
required-evidence:
source-refs:
```

No direct `requirement-refs` or `user-story-refs` field is allowed. Those
upstream relationships remain reachable through approved acceptance criteria.

`work-type` is one of:

- `code-change`
- `test-change`
- `migration`
- `configuration-change`
- `infrastructure-change`
- `documentation-change`
- `operational-readiness`

Required capabilities must exist in the invocation-pinned capability catalog.
Dependency hints are proposals only. WorkDependencyAnalysis later constructs
and validates the authoritative DAG, including cycles, missing dependencies,
and impossible ordering.

## Coverage authority

Core and the WorkBreakdown Gate derive the exhaustive coverage universe from
the exact approved inputs. The adapter cannot declare what counts as complete.
Every in-scope acceptance criterion, architecture target or approved
architecture change, and applicable contract target or approved contract
change has exactly one disposition:

- `planned`, with one or more linked work items;
- `already-satisfied`, with rationale and current evidence resolvable from the
  invocation evidence boundary;
- `no-work-required`, with rationale and explicit Gate-owned approval.

The candidate cannot embed or mint no-work approval. The trusted Gate caller
supplies a separately candidate-bound proof, and the host authenticates its
approval evidence under the responsibilities in `SECURITY.md`.

A draft or baseline may contain zero work items only when no disposition is
`planned`. A change set may likewise contain zero item changes when it updates
coverage only; its full resulting item digest still binds the unchanged set.

The Gate rejects uncovered authorized scope, unscoped work, invalid source or
domain references, unresolved already-satisfied evidence, unapproved no-work
dispositions, and blocking diagnostics. It does not validate dependency cycles
or scheduling policy.

The Gate accepts only an unforgeable in-process receipt returned by
`registry.verifyCheckpointedExecution()`. It derives the selected operation,
candidate, candidate reference, exact loaded inputs, and diagnostics from that
receipt; plain `ModuleResult`, candidate JSON, or a cloned receipt cannot be
promoted. A proposed `WorkBreakdownBaseline` must also be supplied as exact
raw UTF-8 JSON bound to a closed `ArtifactRef`. Promotion returns a frozen
`commitPayload`; the host must commit those exact bytes atomically or commit
nothing. Portable cross-process Gate receipts are not included in V1.

When the architecture model is attached, the host also supplies an
`architectureAttachmentResolver` that returns its exact reference, parsed
value, and raw bytes. Gate validation reruns the same content and model checks
against the replay-owned ArchitectureBaseline before promotion.

The Gate validates coverage and source/domain closure. WorkDependencyAnalysis
alone validates dependency-hint targets, cycles, and ordering.

## Outputs and outcomes

A successful operation has one primary output only:

```text
establish-breakdown -> WorkBreakdownDraft
decompose-change   -> WorkBreakdownChangeSetDraft
```

Native planner artifacts are subordinate evidence inside the candidate. They
are never a second primary result or an alternate source of truth.

Declared outcomes are:

- `decomposed`
- `needs_clarification`
- `baseline_drift`
- `unable_to_proceed`
- `execution_failed`

Clarification resumes through exact request, response, and continuation
artifacts. Gate-requested rework uses an exact `RevisionRequest`; there is no
ambiguous `previous-draft` input.

The clarification trio and `revision-request` are mutually exclusive inputs.
For revision, Core resolves the exact prior candidate and Gate-evidence bytes
before adapter entry. The candidate must be the correct WorkBreakdown kind for
the selected operation and remain semantically valid against the current
inputs. The host authenticates the Gate evidence's meaning; Core binds its
exact content-addressed identity.

## Typed changes and promotion

A `WorkBreakdownChangeSetDraft` is bound to the exact current baseline and uses
ID-unique `add`, `update`, and `retire` operations. Adds require an absent ID.
Updates and retires require a present ID and the exact prior item digest.
Updates preserve the stable work-item identity. Gate application uses a stable
operation order, rejects stale or contradictory changes, preserves unrelated
planned work, and binds the complete resulting baseline.

For a removal, the approved delta may cite an ID in the target baselines or an
ID already covered by the exact current WorkBreakdown baseline. This permits
planned removal work without accepting arbitrary stale references. After every
change, the complete resulting baseline must remain reciprocal: every planned
coverage link names an existing work item that declares that scope, and every
work-item domain reference has matching planned coverage.

## Traceability

Adapters return domain references only. They cannot create graph nodes, choose
edge kinds, or submit graph operations. After candidate validation, trusted
baseline observers establish approved upstream nodes and the versioned
`WorkBreakdownTraceabilityContributor` derives only:

```text
AcceptanceCriterion -> planned-by -> WorkItem
ArchitectureElement -> implementation-planned-by -> WorkItem
Contract            -> realization-planned-by -> WorkItem
```

Candidate and contract-disposition projections also include their exact
`artifact-reference` control node. That node records source identity only and
does not assert implementation progress. It keeps a successful zero-work or
not-applicable projection nonempty so omission reconciliation can retire stale
WorkItem, planning-edge, and contract facts deterministically.

Work items and planning edges remain candidate authority in this release.
Gate promotion creates the approved baseline separately; a trusted downstream
baseline observer must activate approved graph facts in a later module.
No inverse, dependency, implemented, produced, realized, tested, or verified
edge is emitted by WorkBreakdown.

WorkBreakdown uses the existing `implementation` graph horizon without claiming
implementation. Traceability vocabulary `1.1.0` adds the exact planning-edge
contract without mutating published `1.0.0` bytes. Exact 1.0 snapshots remain
valid; applying a 1.1 update produces a 1.1 child that preserves the old parent
and update lineage.

## Bounded adapters

Both operations declare `adapterExecution: effect`. Registration rejects a
pure binding because WorkBreakdown Gate promotion requires the exact durable
terminal checkpoint produced by an effect execution; compatibility cannot be
discovered only after work has run.

The included manifests demand only:

- exact project reads;
- writes to a configured planning-artifact directory;
- an implementation-engine bridge.

They do not demand process spawning, build execution, source-tree writes, or
graph access. `/speckit.implement` and `/opsx:apply` are outside this module.
Capability declarations are demands for a host to enforce; DevRelay does not
claim that a JSON manifest alone sandboxes an arbitrary implementation.

The package includes bounded manifests, schemas, and conformance fixtures. It
does not ship or claim live OpenSpec or GitHub Spec Kit command adapters.

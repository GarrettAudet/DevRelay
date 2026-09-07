# Quality, continuity, and project control

DevRelay can compose three independently versioned cross-cutting Modules around its existing deterministic software-construction lifecycle:

- **QualityPolicy** turns an approved project policy, workflow profile, risk context, changed surfaces, technologies, and acceptance criteria into exact verification obligations.
- **WorkContinuity** gives work a content-derived identity, blocks concurrent duplicate attempts, persists exact attempt lineage, and permits automatic reuse only for a fully revalidated exact match.
- **ProjectControl** projects a read-only view of lifecycle state, ready work, blockers, quality gaps, reuse, worktrees, memory, verification, and local productivity evidence.

They do not add construction stages. Existing Requirements, Architecture, Contract, WorkBreakdown, WorkDependency, SpecialistAssignment, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, and BusinessAcceptance authorities remain unchanged.

## Deterministic composition

Create a `CrossCuttingCompositionPlan` from declarative bindings. Each binding pins an exact Module version and operation, one named boundary, explicit input and output ports, dependency IDs, configuration and grant digests, and `stop` or `diagnostic` failure behavior.

The resolver preflights the complete binding graph against the exact supplied `ModuleDefinition` and operation contract. The resulting binding pins both contract digests. It rejects stale or invented operations and ports, missing dependencies, cycles, later-boundary dependencies, unavailable inputs, ambiguous output producers, unknown boundaries, and unpinned versions or digests. Ordering is boundary, dependency, then stable binding ID. Generic composition code never branches on a product or Module identity.

Supported boundaries are `session-start`, `before-work-planning`, `before-task-dispatch`, `after-work-execution`, `before-integration`, `frontier-complete`, and `session-conclusion`.

## Quality guarantees and limits

QualityPolicy makes quality requirements explicit and enforceable; it does not guarantee defect-free code. The testable guarantee is narrower: work cannot satisfy the quality assessment when a resolved obligation lacks required passing evidence, independent review is missing, a baseline or resolution digest drifted, or a waiver lacks explicit approval authority.

The same quality resolution is bound into `DesktopTaskPlan` and translated into mandatory WorkItemVerification and SystemVerification obligations. Those existing verification Modules and their Gates retain decision authority.

Workflow profiles remain useful:

- `quick` gives fast changed-scope feedback while preserving deferred final-assurance obligations.
- `standard` is the balanced default.
- `assurance` requires the complete configured verification set immediately.
- `inspect` remains read-only.

## Reuse without repeating mistakes

WorkContinuity fingerprints the exact project, requirements and overview baselines, work item, target revision, dependency closure, assignment, quality resolution, input artifacts, and implementation configuration.

Automatic reuse requires the same fingerprint, target revision, and quality resolution plus a completed record with exact receipt, result, and evidence digests. Similarity is only an owner-review candidate. It is never automatic reuse or completion authority. Prepared, dispatched, running, expired, or uncertain effects require reconciliation and are never blindly repeated.

`createDurableWorkContinuityStore` persists canonical index bytes through the existing SQLite and content-addressed local host. Updates use both host-state and continuity-index compare-and-swap revisions. The bundled store is a local reference implementation; another host remains responsible for equivalent durable atomic persistence.

## Desktop and worktree operation

`DesktopOrchestrationPlan` may bind the exact cross-cutting plan. A managed `DesktopTaskPlan` continues to require the exact ProjectMemory bootstrap receipt and may additionally bind a quality resolution, work fingerprint, and continuity decision as an inseparable triple. Their digests participate in task idempotency, so changed policy or work identity creates a different dispatch identity.

Git worktree isolation remains owned by the durable worktree manager. These Modules consume its exact observations; they do not create hidden worktrees or infer provider state. ProjectControl can be added to the Desktop operator snapshot to show the exact frontier, remaining work, and reconciliation diagnostics.

## Traceability and authority

Trusted QC contributors accept only exact canonical bytes for the declared Module, version, and operation. Candidate and approved scopes are distinct and append-only. Adapters cannot author graph operations, and ProjectControl cannot mutate workflow state, approve Gates, integrate code, promote memory, or activate graph facts.

## Verification

The QC-001 evidence set includes positive and adversarial composition, policy, reuse, CAS, restart, drift, and authority tests; mandatory WorkItemVerification and SystemVerification integration tests; a real local Git-worktree Desktop harness across `quick`, `standard`, and `assurance`; and a Windows reference benchmark at 100 bindings, 1,000 work items, and 10,000 attempt records.

The Desktop provider in the automated end-to-end harness is fixture-conformant. It does not claim live upstream provider interoperability. The repository's existing live ProjectMemory bootstrap and local Git worktree tests remain the evidence for those native boundaries.

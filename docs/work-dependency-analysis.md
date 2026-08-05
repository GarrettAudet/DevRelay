# WorkDependencyAnalysis 0.1.0

`WorkDependencyAnalysis` converts one complete approved work breakdown into a deterministic static dependency DAG. It does not assign, estimate, schedule, execute, or track work.

```text
WorkBreakdownBaseline + ProjectOverviewBaseline
        + version-pinned ContextSliceSet
        + OpaPolicyBundle
                    ↓
Core Snapshot Builder
                    ↓
configured Dependency Proposer
                    ↓
Core Graphology-DAG Mechanics
                    ↓
Core OPA Policy Evaluation
                    ↓
configured Consistency Reviewer
                    ↓
WorkDependencyCandidate
                    ↓
WorkDependencyGate
                    ↓
WorkDependencyBaseline
```

## Operation

The module has one operation: `analyze-dependencies`. It always recomputes the full candidate graph. There is no greenfield/change split because a dependency change can invalidate ordering anywhere in the graph.

The full `WorkBreakdownBaseline` is authoritative scope. `ContextSliceSet` admits only relevant, immutable context and pins every slice by artifact version, content digest, or repository commit. Core resolves and verifies every declared slice before any proposer runs. Undeclared repository or graph access is unavailable to adapters.

## Trust boundary

The generic orchestration plan is declared in the module definition:

1. Core builds `WorkBreakdownAnalysisSnapshot`.
2. The `dependency-proposer` port returns `DependencyProposal`.
3. Core computes graph mechanics with Graphology-DAG.
4. Core evaluates the exact graph with the pinned OPA-WASM bundle.
5. The `consistency-reviewer` port returns an advisory review.
6. Core assembles and checkpoints `WorkDependencyCandidate`.

Adapters cannot create authoritative graph nodes or edges, call the Gate, evaluate policy, merge traceability updates, or execute work. The checkpoint fingerprint binds the operation, exact inputs, adapter identities, policy entrypoint, and execution ID. Replay reads and revalidates the exact checkpoint without calling resolvers or adapters.

## Adapters

- `native-structured-dependency-proposer` is the default. It converts directional WorkItem hints into proposals and rejects non-ordering `related` hints.
- `openspec-dependency-proposer` is an optional bounded proposal adapter.
- `task-master-dependency-proposer` is an optional bounded proposal adapter.
- `spec-kit-dependency-reviewer` reviews the Core-computed graph for consistency. It is advisory; it cannot approve promotion.

All proposers receive the same `WorkBreakdownAnalysisSnapshot` and return the same `DependencyProposal` contract. Adapter selection is configuration-driven; Core contains no adapter-specific branch.

## Artifacts

The primary module output is exactly one `WorkDependencyCandidate`. Its subordinate evidence binds:

- the complete work-breakdown analysis snapshot;
- every hint disposition and proposed edge;
- the Graphology-DAG mechanics result, deterministic topological order, generations, cycle witness, and diagnostics;
- the OPA policy manifest, exact WASM digest, entrypoint, input digest, engine/compiler versions, raw result, edge decisions, and denials;
- the consistency review;
- admitted source references and native evidence.

`WorkDependencyBaseline` contains only the approved static DAG: nodes, forward prerequisite edges, graph digest, and deterministic topological order. Runnable frontiers are derived downstream from the immutable baseline plus separately supplied completion facts; mutable readiness does not enter this module.

## Gate

`WorkDependencyGate` accepts only an unforgeable, checkpoint-only replay receipt. It rejects:

- incomplete work-item coverage;
- unknown endpoints, self-dependencies, duplicate edges, or cycles;
- stale snapshots, policies, or attachments;
- undefined, malformed, failed, or denying OPA evaluation;
- missing, duplicate, or denying per-edge policy decisions;
- non-passing or stale consistency review;
- mismatched hint dispositions, candidate, baseline, or approval evidence.

Human approval is supported through the exact `WorkDependencyGateApproval` artifact. The release dogfood run binds that approval to the exact candidate, Gate review, replay receipt, proposed baseline bytes, and repository revision; promotion then records the immutable baseline and atomic traceability merge proof.

## Traceability

Only a promoted `WorkDependencyBaseline` contributes authoritative dependency relationships. The trusted contributor derives one forward edge for each approved dependency:

```text
Prerequisite WorkItem → prerequisite-for → Dependent WorkItem
```

No inverse edge is stored. Traceability vocabulary 1.2 adds this relationship while preserving validation of 1.0 and 1.1 artifacts. Unrelated 1.1-only updates remain on 1.1 to avoid content-addressed artifact churn; an update upgrades to 1.2 only when it uses the new edge kind.

## V1 boundary

V1 supports static acyclic graphs only. Conditional dependencies, resource constraints, assignment, estimates, scheduling, execution state, retries, and dynamic replanning belong to later modules or versions.

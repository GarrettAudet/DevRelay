# WorkDependencyAnalysis dogfood

This directory records the cumulative module-by-module run for DevRelay's next lifecycle slice.

Current state: Requirements Gate atomically promoted the approved
`RequirementsBaseline` and `ProjectOverviewBaseline` pair to version `1.1.0`.
`ArchitectureDesign` deterministically selected `design-change` through the
configured OpenSpec design -> Structurizr -> MADR chain. Architecture Gate
rejected and preserved the first exact candidate, then approved and promoted
the corrected candidate after valid C4 containment, scoped views, and pinned
official Structurizr validate/export normalization proof were supplied.
`WorkBreakdown` then selected `decompose-change`, produced 11 bounded work
items, and passed WorkBreakdown Gate promotion.

`WorkDependencyAnalysis@0.1.0` is now implemented and has executed over the
complete promoted work-breakdown snapshot plus version-pinned requirements,
architecture, project-overview, policy, and repository context. The native
structured proposer emitted typed edges, Core computed graph mechanics with
Graphology-DAG, Core evaluated the exact OPA WASM policy bundle, and the
bounded Spec Kit reviewer returned an advisory consistency review. A second
execution replayed the exact terminal checkpoint with zero additional proposer
or reviewer calls. The owner approved the exact candidate, Gate review, Gate
candidate, and checkpoint identities. WorkDependency Gate promoted the exact
`WorkDependencyBaseline`; the trusted contributor atomically merged all 10
forward `prerequisite-for` edges into TraceabilityGraph vocabulary `1.2.0`,
revision `3`. A validated `ModuleExecutionRecord` stores the update,
checkpoint, merge receipt, application proof, and resulting graph. Progression
to `SpecialistAssignment` is now allowed.

Approved candidate and promotion bindings:

- `WorkDependencyCandidate`: `sha256:f929a756793927c894aada19bbf544a228445dc085ecf78aa4fe8dbda7afa61a`
- WorkDependency Gate review: `sha256:d5afcefa8140b81a6dfa6ec16d84ca6df8306739a7755727f627a247691bc0ce`
- WorkDependency Gate candidate: `sha256:07290d240e0ec60ace267c68aa8d3a61e2ddb89c80bb714220d98fc3ccd0d6b3`
- Terminal checkpoint: `sha256:771ccbd1a1f9a5d898bb79ac734808abdb10edc342fb92c229c3955ae0cb9a9e`
- Repository revision: `9cb4f2b8d340142557027fc0477440722d4f8286`
- Owner approval: `sha256:74f10b74bde9c2c3cbb4c86975fb9ca5e5795f97c1dd5052fbbe4ac4f8df1d12`
- `WorkDependencyBaseline`: `sha256:f11d0a1031781a8645da3db637462af4775c4861afc355054ad52df4d19ab52c`
- Traceability update: `sha256:04e17bb9558cdb8a6bebfa450abdbe76875061106680cc3883bb08d3de2ad932`
- Resulting graph: `sha256:53d3f7872cd5cb3d23ab47d641833f5a72a4fb2ee2bf3a1ea3f8ffc2c349d738`
- `ModuleExecutionRecord`: `sha256:c1f11b136c167d1fbaf2fc5eb9d1f14e9ed48fc60893875d694fc0b8b8339c79`

Reproduce the complete approved dogfood chain from repository root with:

```powershell
node dogfood\work-dependency-analysis\materialize-clarification.mjs
node dogfood\work-dependency-analysis\materialize-requirements-change.mjs
node dogfood\work-dependency-analysis\materialize-requirements-promotion.mjs
node dogfood\work-dependency-analysis\architecture-design\materialize.mjs
node dogfood\work-dependency-analysis\work-breakdown\materialize.mjs
node dogfood\work-dependency-analysis\dependency-analysis\materialize.mjs
node dogfood\work-dependency-analysis\dependency-analysis\promote.mjs
```

The ArchitectureDesign run uses separate exact inputs for the historical
architecture baseline's project context and repository snapshot when they
differ from the current change invocation. This preserves both lineages instead
of rewriting the approved baseline or treating repository drift as equivalent
to a baseline mutation.

Approved promotion replay is idempotent and verifies every exact digest before
writing. Do not regenerate or promote an already approved artifact merely to
refresh derived documentation. Any modified candidate requires a new review
and approval.

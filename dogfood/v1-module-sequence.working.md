# DevRelay V1 module sequence (working ledger)

Status: temporary, non-authoritative coordination record
Current target: `SpecialistAssignment`
Last advanced: WorkDependencyAnalysis baseline promoted; dependency traceability merged and verified

The canonical product scope remains the approved `ProjectOverviewBaseline` and
its root `ProjectOverview.md` projection. This file only tracks construction and
dogfood order; it cannot approve a module, gate, baseline, or lifecycle change.

## Operating rule

1. Build exactly one module at a time.
2. Use every applicable, completed upstream module through its normal invocation
   and gate workflow to produce the next module's approved inputs.
3. Add the new module to the executable dogfood stack only after its contract,
   routing, artifacts, adapters, runtime behavior, gate boundary, traceability
   contribution, conformance fixtures, documentation, and release verification
   pass.
4. Use the enlarged stack to build the following module.
5. A clarification, failed gate, drift result, or verification failure does not
   advance this ledger.
6. `TraceabilityGraph` runs beside every graph-aware module execution. It is
   never inserted into the lifecycle as a stage.
7. Gates control progression but are not adapter-executed engineering modules.
8. Conditional modules execute only when deterministic project state selects
   them. A validated `ApprovedNotApplicable` disposition remains an explicit
   input where the downstream contract requires one.

## Executable dogfood stack

| Order | Component | Kind | Current status | Used to build |
| ---: | --- | --- | --- | --- |
| 1 | `RequirementsGathering@0.1.0` | module | completed | `ArchitectureDesign`, `WorkBreakdown`, and the approved `WorkDependencyAnalysis` requirements change |
| 2 | `RequirementsGate` | gate | current change passed | promoted the paired requirements and project-overview baselines to `1.1.0` |
| 3 | `ArchitectureDesign@0.1.0` | module | completed | first candidate rejected and preserved; corrected candidate passed canonical and native-model verification |
| 4 | `ArchitectureGate` | gate | passed | promoted the corrected `ArchitectureBaseline` |
| 5 | `WorkBreakdown@0.1.0` | module | completed | produced 11 bounded work items for `WorkDependencyAnalysis` |
| 6 | `WorkBreakdownGate` | gate | passed | promoted the current `WorkBreakdownBaseline` |
| 7 | `WorkDependencyAnalysis@0.1.0` | module | completed | produced the policy-allowed static DAG and exact replay proof |
| 8 | `WorkDependencyGate` | gate | passed | promoted `WorkDependencyBaseline@1.0.0` and enabled progression |
| sidecar | `TraceabilityGraph` | Core infrastructure | current through WorkDependencyAnalysis | merged 10 trusted forward dependency edges with a validated execution record |

Current effective circuit:

```text
RequirementsGathering
-> RequirementsGate
-> ArchitectureDesign
-> ArchitectureGate
-> WorkBreakdown
-> WorkBreakdownGate
-> WorkDependencyAnalysis
-> WorkDependencyGate

TraceabilityGraph runs beside each validated module result.
```

## Last completed module: WorkDependencyAnalysis

Stage: `WorkDependencyAnalysis -> WorkDependencyGate -> promoted`

The approved requirements and ProjectOverview change pair, corrected
architecture candidate, and WorkBreakdown change supplied the exact upstream
baselines. WorkDependencyAnalysis consumed the complete 11-item work-breakdown
snapshot and three version-pinned context slices. The native proposer ran once;
Core used Graphology-DAG and the exact OPA WASM policy bundle; the bounded Spec
Kit consistency reviewer ran once. Exact retry used the terminal checkpoint
and made zero additional extension calls.

Owner approval bound candidate
`sha256:f929a756793927c894aada19bbf544a228445dc085ecf78aa4fe8dbda7afa61a`,
review `sha256:d5afcefa8140b81a6dfa6ec16d84ca6df8306739a7755727f627a247691bc0ce`,
Gate candidate `sha256:07290d240e0ec60ace267c68aa8d3a61e2ddb89c80bb714220d98fc3ccd0d6b3`,
and checkpoint `sha256:771ccbd1a1f9a5d898bb79ac734808abdb10edc342fb92c229c3955ae0cb9a9e`.
It produced approval `sha256:74f10b74bde9c2c3cbb4c86975fb9ca5e5795f97c1dd5052fbbe4ac4f8df1d12`
and promoted baseline `sha256:f11d0a1031781a8645da3db637462af4775c4861afc355054ad52df4d19ab52c`.

The trusted contributor merged 10 forward `prerequisite-for` edges into graph
vocabulary `1.2.0`, revision `3`. `ModuleExecutionRecord`
`sha256:c1f11b136c167d1fbaf2fc5eb9d1f14e9ed48fc60893875d694fc0b8b8339c79`
binds the checkpoint, update, merge receipt, application proof, and resulting
graph. The exact baseline is now an approved input to `SpecialistAssignment`.

The rejected architecture candidate remains preserved under
`architecture-design/rejected/`; its rejection evidence is immutable history.

## Remaining primary-path construction queue

| Sequence | Target | Prerequisite dogfood stack addition |
| ---: | --- | --- |
| 1 | `SpecialistAssignment` | approved `WorkDependencyAnalysis` |
| 2 | `WorkExecution` | approved `SpecialistAssignment` |
| 3 | `WorkItemVerification` | completed `WorkExecution` result |
| 4 | `ChangeIntegration` | individually verified work items |
| 5 | `SystemVerification` | integrated change set |
| 6 | `BusinessAcceptance` | verified integrated system |

## Conditional V1 modules still to implement

- `ArchitectureDiscovery`: required for an existing repository whose current
  architecture is not represented by a validated baseline or snapshot.
- `ContractGeneration`: required when approved interface intent calls for
  machine-readable API, schema, event, data, or protocol contracts.

These remain mandatory V1 scope, even when the current DevRelay dogfood route
deterministically bypasses them. Their construction order must be fixed before
V1 lifecycle closeout; bypassing them for this project is not evidence that the
modules are complete.

## Advancement checklist

A target is `completed` only when all items below are evidenced:

- provider-neutral module and artifact contracts;
- deterministic input-state routing and closed outcomes;
- bounded replaceable adapter manifests without Core product branches;
- immutable handoffs, checkpoints, resume, drift, and failure behavior;
- separate gate policy and baseline-promotion authority;
- trusted TraceabilityGraph contributor and merge proof;
- positive, negative, replay, substitution, and release conformance tests;
- docs, examples, package surface, release notes, and canonical verification;
- user approval of the module boundary and gate result.

## Recorded assumption

`A-SEQUENCE-001`: Continue with `SpecialistAssignment` as the next construction
target using the exact approved dependency baseline. The two earlier conditional
lifecycle modules remain tracked and are not silently treated as implemented.

# DevRelay V1 module sequence (working ledger)

Status: active, temporary, non-authoritative coordination record
Current target: `LifecycleRunReport` prefix-integrity increment
Last advanced: DG-1 integrated the reusable ContractGeneration host binding and
closed the 48-vs-57 authority conflict in favor of the 48 version-pinned
interface intents. ContractGate is the next separate authority boundary.

Current reconciled status is maintained in
[`CURRENT_STATUS.md`](../CURRENT_STATUS.md). This working ledger retains
historical construction detail and cannot approve or promote anything.

This ledger makes the recursive dogfood run human-readable. Canonical authority
remains in digest-bound module artifacts, Gate approvals, promoted baselines,
execution records, and TraceabilityGraph checkpoints. This file cannot approve
or promote anything.

## Current checkpoint (2026-08-10)

```text
WorkItemVerification construction
  RequirementsGathering     passed through bounded OpenSpec binding
  RequirementsGate          promoted Requirements/ProjectOverview 1.5.0
  ArchitectureDiscovery     skipped: approved architecture baseline exists
  ArchitectureDesign        passed OpenSpec Design + Structurizr + MADR
  ArchitectureGate          promoted exact WIV architecture
  ContractGeneration        generated nine canonical interface contracts
  ContractGate              promoted ContractBaseline 1.3.0
  WorkBreakdown             promoted ten bounded work items and 128 dispositions
  WorkDependencyAnalysis    promoted ten-node, eighteen-edge static DAG
  SpecialistAssignment      promoted ten exact provider-neutral assignments
  WorkExecution             all ten WIV items provisionally host-integrated
```

Exact planning and assignment checkpoints:

- WorkBreakdown candidate: `sha256:4f902c8a3c04179b9f95e85d2af15e1d1e557e82dc726b4cdbe5175e9813c47e`
- WorkBreakdownBaseline 1.4.0: `sha256:198033f545c394b6d58cbc5f8b66c62dd4fd810898689ebc5af3eeffc59c2128`
- WorkDependency candidate: `sha256:03b25ae784984523e965b7cedc8cb4a965751e749bf9d5d712bced32b52431ce`
- WorkDependencyBaseline: `sha256:6b5dd263c737a780fa4f9a09abfd550b911d890913af45b6ad14d7f5ee0d76d8`
- SpecialistAssignment canonical baseline: `sha256:04bdb254fbeec0f64f32aa1f51fddd85b872d92eb8ad9b709ba5d359a0caed97`
- Approved assignment graph: revision 8, `sha256:0d4aa5cb40acfe6fcec482eb81e2b870790c119a4129a0813786d933088772f6`

Focused upstream WIV evidence: 3/3 planning, dependency, and assignment dogfood
tests pass. WorkBreakdown replay invokes its adapter zero times; dependency
analysis uses one native proposer call, one Spec Kit review call, and zero calls
on replay. The current ready frontier contains only `WI-WIV-VERIFICATION`.

## SystemVerification bootstrap plan

The enlarged circuit has restarted for SystemVerification with six bounded work
items, eleven validated acyclic dependency edges, and one provider-neutral
specialist assignment per item. The exact plan is
`dogfood/system-verification/planning/system-verification-dogfood-plan.json`
with digest `sha256:1b425df7e0e30d5e726ee9482f9dce98b93cf96c3944f6579e33b1080d7ec5a1`.
The first ready frontier is exactly `WI-SV-CONTRACTS`; its visible Codex task
has been requested.

## SystemVerification completion

All six construction items are parent-integrated. The integrated focused gate
passes 39/39 tests, including closed verified, failed, needs-evidence,
baseline-drift, verifier-substitution, zero-call replay, typed evidence, atomic
forward traceability, and explicit absence of BusinessAcceptance authority.
The canonical 0.7.0 release gate binds the final repository bytes.

## BusinessAcceptanceGate bootstrap plan

The full released circuit has produced five bounded work items and six validated
acyclic dependency edges for the Core-owned final Gate. The exact plan is
`dogfood/business-acceptance/planning/business-acceptance-dogfood-plan.json`
with digest
`sha256:b9ab3d52fab8c6542ef5a28c9e98d33d5b25dbe6040a7be8df9fe773702a9228`.
All six upstream context artifacts are version-pinned. The first ready frontier
is exactly `WI-BA-CONTRACTS`; its visible Codex task is the only task that may
start before its handoff is verified and integrated.

## ArchitectureDiscovery completion

All eight work items completed through visible WorkExecution tasks, independent WorkItemVerification, and byte-exact host integration. The real-repository release circuit proves offline inventory, optional analyzer normalization, Core-owned gap policy, exact replay, candidate-only traceability, and safe ArchitectureDesign progression. Final verification passed 735/735 package tests before documentation; documentation and the complete module suite then passed 2/2 and 36/36.

- Verification integration receipt: `sha256:048e8653106c09e4e1f3b6360bbe98722e4b1d1d14c55a2636f3a1439d8c7118`
- Documentation integration receipt: `sha256:f9cb55c81b0641bf47975e0b0f9dcc49604bc52e696b9a51e792c353b0a26099`
- Release evidence: `sha256:eb3a74fcbc8f6e671f59469a24dd274806fb30812ee91e3ff47ac1b71aa94098`

## Recursive dogfood rule

After a module becomes release-ready, add it to the active circuit. To build
the next module, restart at RequirementsGathering and execute every applicable
released module and Gate in order. Conditional stages use explicit state and an
`ApprovedNotApplicable` disposition where required. A failed Gate, drift result,
or unresolved clarification cannot advance this ledger.

TraceabilityGraph runs beside graph-aware module executions. It is not a stage,
does not call adapters, and does not control progression.

## Active V1 circuit

| Order | Component | Kind | Status | Active adapter binding |
| ---: | --- | --- | --- | --- |
| 1 | RequirementsGathering | module | release-ready | OpenSpec; Spec Kit binding supported |
| 2 | RequirementsGate | Core Gate | release-ready | Core policy and owner approval |
| 3 | ArchitectureDiscovery | conditional module | release-ready | deterministic native offline inventory; optional bounded analyzer port |
| 4 | ArchitectureDesign | module | release-ready | Spec Kit Plan for baseline; OpenSpec Design for change; Structurizr; MADR |
| 5 | ArchitectureGate | Core Gate | release-ready | Core policy and owner approval |
| 6 | ContractGeneration | conditional module | release-ready | live JSON Schema generator; OpenAPI, AsyncAPI, Protobuf adapter contracts |
| 7 | ContractGate | Core Gate | release-ready | Core validation and owner approval / ApprovedNotApplicable |
| 8 | WorkBreakdown | module | release-ready | Spec Kit Tasks; OpenSpec Tasks |
| 9 | WorkBreakdownGate | Core Gate | release-ready | Core coverage policy and owner approval |
| 10 | WorkDependencyAnalysis | module | release-ready | native structured proposer; OPA; Graphology-DAG; Spec Kit reviewer; optional Task Master/OpenSpec proposers |
| 11 | WorkDependencyGate | Core Gate | release-ready | Core DAG/policy authority |
| 12 | SpecialistAssignment | module | release-ready | A2A capability discovery; native deterministic ranker |
| 13 | SpecialistAssignmentGate | Core Gate | release-ready | Core eligibility and assignment authority |
| 14 | WorkExecution | module | release-ready | user-visible Codex task host binding; provider-neutral executor port |
| 15 | WorkItemVerification | module | release-ready | test/review verifier adapters; Core policy/Gate authority |
| 16 | ChangeIntegration | module | release-ready | local Git adapter; Core-owned TARGET-CAS |
| 17 | SystemVerification | module | release-ready | fixture-conformant test/review system-verifier adapter contracts |
| 18 | BusinessAcceptanceGate | Core Gate | release-ready | Core evidence policy and exact owner acceptance |
| sidecar | TraceabilityGraph | Core infrastructure | active | trusted deterministic contributors only |
| sidecar | LifecycleRunReport | Core infrastructure | partial | dynamic artifact/graph projection |

## Execution-loop state

The approved WorkExecution dependency DAG contains ten work items. The first
runnable frontier was exactly `WI-WE-CONTRACTS`, and a user-visible Codex task
implemented that item through three immutable attempts. Attempt 003 passed the
parent integration review.

```text
WI-WE-CONTRACTS
  task-contract: sha256:acf5c65c476689e439d7e8df43b91d95937b80c3f0759825e3e43bba7fcf3713
  pass-handoff:  sha256:4f66dd128bfa607e92f6362a6ab8b68306668378318c23e87f272fe3c298432f
  parent-review: sha256:c046013fd696e4020d488b4e71177912c161b766fdfe41f0762c5fca19b41f9e
  host-receipt:  sha256:c3d09b5b44ea81ee918319d73d0b92cb167f03f7d486f106d5b92d5aba9843f3
  disposition:   provisional-host-integrated
```

No authoritative integrated-completion fact exists yet. The item must pass the
released WorkItemVerification module and then ChangeIntegration. Only then may
Core recalculate the next runnable DAG frontier.

The WorkItemVerification construction DAG is separately active:

```text
Provisionally host-integrated: WI-WIV-CONTRACTS, WI-WIV-SUBJECT-OBLIGATIONS,
                               WI-WIV-ATTEMPT-CHECKPOINT, WI-WIV-VERIFIER-BINDING,
                               WI-WIV-VERIFIER-ADAPTERS, WI-WIV-EVIDENCE-NORMALIZATION,
                               WI-WIV-POLICY-GATE, WI-WIV-TRACEABILITY,
                               WI-WIV-VERIFICATION, WI-WIV-DOCUMENTATION
Ready frontier:                none; construction DAG complete
Host binding:                  one visible Codex worktree task per DAG item
Assignment:                    PROFILE-DEVRELAY-ENGINEERING
State:                         bootstrap implementation only; no authoritative
                               verification or integration fact exists
```

## Remaining construction order

1. Finish the dynamic human-readable LifecycleRunReport.
2. Execute the complete released circuit and produce one exact accepted end-to-end V1 lifecycle record.
3. Optimize measured friction, latency, adapter calls, retries, evidence coverage, and orphan rate.

## Release-ready definition

A module advances only when its provider-neutral contract, routing, closed
outcomes, adapter boundary, immutable checkpoints, drift/failure behavior,
Gate authority, trusted traceability contribution, positive/negative/replay
tests, docs, examples, package surface, and canonical verification all pass.

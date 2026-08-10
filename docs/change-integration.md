# ChangeIntegration 0.1.0

## Purpose and lifecycle boundary

ChangeIntegration incorporates one exactly verified work-item change into one
authorized repository target:

```text
WorkItemVerification -> ChangeIntegration -> SystemVerification -> BusinessAcceptance
```

It does not verify the integrated system, deploy software, or accept business
outcomes. A successful integration produces immutable integration and
repository-state evidence for the next stage; SystemVerification and
BusinessAcceptance remain separate downstream decisions.

The current adapter is **local-Git and fixture-conformant, not remote-provider
conformant**. It does not create pull requests, call hosting services, or
promise deployment.

## Exact inputs and deterministic plan

The `integrate-change` operation receives exactly three explicit required
Module inputs: `ProjectOverviewBaseline` through the
`project-overview-baseline` port, `VerifiedWorkItemSubject` through
`verified-work-item-subject`, and `IntegrationInputBinding` through
`integration-input-binding`. The direct `ProjectOverviewBaseline` input is
mandatory in addition to the project-overview baseline reference nested in
`IntegrationInputBinding`; nested data is not a substitute for the operation
input.

Core validates the directly loaded `ProjectOverviewBaseline` bytes and digest
against the exact `projectOverviewBaseline` reference already bound in
`IntegrationInputBinding`. A missing, stale, substituted, conversationally
inferred, or otherwise implicit project overview is invalid. Core never injects
ambient project context.

Core first constructs a `VerifiedWorkItemSubject` from the exact WorkItem,
verified change bytes, authoritative WorkItemVerification Gate approval, and
the complete Gate-accepted evidence set. `IntegrationInputBinding` then pins:

- the requirements, project-overview, architecture, contract-disposition,
  work-breakdown, work-dependency, and specialist-assignment baselines;
- the target `RepositorySnapshot`, target ref, and expected commit;
- the integration policy, exact adapter ID/version/configuration digest,
  permission demands, matching host grants, and idempotency key.

Every artifact reference and raw-byte digest is checked. The target snapshot
must equal the approved verification subject's repository context, and the
permission demands must exactly equal the grants. Stale, missing, substituted,
cross-item, over-granted, or unauthorized inputs fail closed.

Core deterministically builds an `IntegrationPlan` from those bindings and the
verified change bytes. It adds the exact source commit and one supported
strategy: `fast-forward`, `merge-commit`, or `cherry-pick`. A caller may compare
a proposed plan, but cannot change, reorder, or override the derived plan.

## Execution and target compare-and-swap

The operation sequence is fixed:

```text
input binding -> plan -> TARGET-CAS -> integration adapter
  -> checkpoint/recovery -> result validation
```

Core serializes authorization by target ref, observes the live ref, and grants
an adapter invocation only when it still equals `expectedTargetCommit`. Drift
returns `baseline-drift` before the adapter effect. The adapter must then apply
one atomic conditional effect or apply nothing; authorization is bound to the
invocation fingerprint, target ref, and expected commit.

The bundled local Git adapter works in a temporary clone. It prepares the
requested transition there, fetches the candidate commit into the configured
local repository, and uses:

```text
git update-ref <target-ref> <candidate-commit> <expected-target-commit>
```

That final command is the atomic target compare-and-swap. The adapter supports
only local repositories and the three plan-selected strategies. It never
chooses policy, a strategy, a target, or additional permissions.

## Conflict, drift, failure, and recovery

There is no automatic conflict resolution. A merge or cherry-pick conflict is
aborted in the temporary clone and returned as a sorted conflicting-path set
with `effectState: not-applied`. Core persists an `IntegrationConflictSet` only
after freshly proving the target unchanged.

Target mismatch before authorization is `baseline-drift`. A failure before an
effect attempt is not-applied. A timeout, signal, thrown effect, or failure
after the atomic update may be uncertain; it is never guessed to be success or
failure.

The checkpoint controller persists `prepared` before effect execution and
stores exact raw result bytes in `effect-recorded` before interpretation.
Interrupted or uncertain effects require a fresh target observation and
immutable observation evidence. Reconciliation classifies the evidence as
applied, not-applied, or still ambiguous and seals `reconciled` before result
assembly. Successful recovery additionally requires authorization for the
exact produced commit plus persisted incorporation proof.

An exact resume reuses the stored checkpoint and raw bytes with zero adapter
calls. Changed plan, invocation, fingerprint, idempotency identity, observation,
or bytes require a new attempt; they cannot be smuggled into replay. Retry
creates that new identity and preserves prior evidence.

## Terminal outcomes and operator routes

ChangeIntegration has exactly these Module outcomes:

- `integrated`: outputs one `IntegratedChangeRecord` and one post-state
  `RepositorySnapshot`, with pass evidence for the native effect and post-state.
- `integration-conflict`: outputs one `IntegrationConflictSet`, requires
  diagnostics, and proves the target unchanged.
- `baseline-drift`: output-free, diagnostic result for a changed or absent
  authorized target.
- `unable-to-proceed`: output-free, diagnostic result when bounded execution
  cannot safely start or finish.
- `execution-failed`: failed, output-free result with diagnostics.

Operator routes are not extra Module outcomes:

| Route | Example |
| --- | --- |
| `pass` | Preserve the exact integrated record and snapshot, then hand them to separate SystemVerification. |
| `fix` | Correct a malformed binding, invalid evidence, or implementation defect and create a new attempt. |
| `diagnose` | Inspect checkpointed native evidence for an adapter/process failure or ambiguous observation. |
| `clarify` | Request authoritative policy or target intent when the approved inputs are contradictory. |
| `block` | Preserve evidence when the target, permissions, durable stores, or safe reconciliation are unavailable. |
| `retry` | Use a new invocation identity after any input, target, plan, or policy change. |
| `resume` | Replay the exact checkpoint and continue with zero additional adapter calls. |

## Traceability and downstream handoff

Only an exact completed `integrated` result with its loaded canonical outputs
matches the trusted contributor. Adapters never receive the graph service and
never author graph operations. The contributor projects approved
`change-integration/integrated` facts within its declared ownership:

```text
WorkItem -> produces -> ChangeSet
ArchitectureElement -> implemented-by -> ChangeSet
Contract -> realized-by -> ChangeSet
ChangeSet -> integrated-as -> IntegratedChangeRecord
```

Core prepares and atomically merges the update. The projection does not claim
SystemVerification, deployment, BusinessAcceptance, or arbitrary inverse
edges. Integration evidence is an input to later lifecycle stages, not proof
that those stages occurred.

## Operator and IDE runbook

Display artifact state, never an inference from chat:

```text
subject:       <subject ID> @ sha256:...
plan:          <plan ID> @ sha256:...; <strategy>
target:        <ref> expected <commit>
checkpoint:    prepared | effect-recorded | reconciled @ sha256:...
effect:        not-started | not-applied | applied | unknown
outcome:       integrated | integration-conflict | baseline-drift | ...
next stage:    SystemVerification / separate / not-started
```

For each run:

1. Show exact subject, Gate approval, accepted evidence, baseline, target,
   policy, adapter, plan, invocation, checkpoint, and output IDs and digests.
2. Show the expected and observed target commits before any effect.
3. On conflict, show sorted paths and the evidence proving no target change;
   offer no automatic resolution.
4. On uncertainty, stop interpretation and collect a fresh persisted target
   observation for reconciliation.
5. On resume, show that the identity is exact and the adapter-call count is
   zero. On changed input, require a new retry identity.
6. After `integrated`, show SystemVerification as a separate, not-started
   handoff. Never label integration as verification, deployment, or acceptance.

## Adding another integration adapter

Implement the provider-neutral `integration-adapter` extension port for
`change-integration@0.1.0/integrate-change`:

1. Accept only the validated `IntegrationAdapterInvocation` and exact Core
   TARGET-CAS runtime authorization.
2. Pin adapter version and configuration digest; declare only the required
   capabilities and exact permission demands.
3. Implement an atomic conditional target update or prove not-applied. Return
   canonical `RawIntegrationEffectResult`; preserve bounded immutable native
   evidence and never claim policy, Gate, graph, verification, deployment, or
   acceptance authority.
4. Represent provider conflicts without resolving them. Return uncertainty
   after any ambiguous effect and support evidence-based reconciliation.
5. Use Core checkpoint/replay and result validation. Add positive and negative
   conformance tests for CAS, conflict, interruption, uncertain recovery,
   exact replay, incorporation proof, permissions, and authority rejection.
6. Label remote-provider or live-service maturity only after separately
   proving it; the bundled adapter establishes local Git behavior only.

The Module definition is `examples/modules/change-integration.module.json` and
the current binding is `examples/plugins/local-git-integration.plugin.json`.

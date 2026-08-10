# SystemVerification 0.1.0

## Purpose and lifecycle boundary

SystemVerification evaluates one immutable, fully integrated system candidate
against approved system-level obligations:

```text
ChangeIntegration -> SystemVerification -> BusinessAcceptanceGate
```

It does not modify code, integrate changes, deploy software, alter approved
scope, or grant business acceptance. A `verified` result permits only
consideration by the separate `BusinessAcceptanceGate`; it is not business
acceptance and it creates no acceptance decision or fact.

The bundled test and review verifier bindings are **fixture-conformant, not
live-provider conformant**. They prove the bounded adapter contract, not live
interoperability with an external test or review service.

## Exact operation and inputs

`system-verification@0.1.0/verify-system` is one effect operation. Its Module
invocation declares exactly three required inputs:

- `integrated-system-candidate`: one `IntegratedSystemCandidate`;
- `system-verification-policy`: one `SystemVerificationPolicy`;
- `project-overview-baseline`: the exact `ProjectOverviewBaseline` also
  referenced by the subject.

Core must load and digest-check the direct project-overview input and match it
to the subject reference. Nested data, ambient repository state, conversation,
or provider-native session memory is not a substitute.

`IntegratedSystemCandidate` is the immutable verification subject. It binds
the final `RepositorySnapshot`, every required `IntegratedChangeRecord`, the
authoritative `integratedCompletionFactSet`, and the exact requirements,
project-overview, architecture, contract-disposition, work-breakdown,
work-dependency, and specialist-assignment baselines. It also binds the policy
and an explicit version-pinned `VerificationEnvironmentSnapshot`, or an
`approved-not-applicable` environment disposition with rationale.

The `integratedChangeRecords` array may be empty. This is the valid zero-change
case: the candidate still binds the final repository snapshot, authoritative
completion facts, complete approved baselines, environment, policy, and its
own digest. Zero change never means an implicit, mutable, or partially
integrated subject.

Before adapter entry, Core compares the complete subject with the expected
subject. Repository, integration-record, completion-fact, baseline,
environment, or policy substitution is `baseline-drift` and fails closed.

## Obligations and evidence

Core deterministically expands all approved system-level acceptance criteria
and every applicable non-functional requirement into one non-empty
`SystemVerificationObligationSet`. Each obligation has a stable ID, kind,
source reference, and sorted set of required evidence kinds. An NFR explicitly
marked not applicable is excluded; adapters cannot add, remove, waive, or
redefine obligations.

For every assigned obligation, an adapter returns a typed observation status
(`pass`, `fail`, or `inconclusive`) and typed `evidenceBindings`. Each binding
names an allowed evidence kind and an exact artifact ID and digest. Conclusive
observations require a binding. Core rejects unknown obligations, unconfigured
evidence kinds, duplicate bindings, and substituted producer versions.

Typed evidence bindings and native provenance are different:

- `evidenceBindings` connect a specific obligation and evidence kind to the
  exact artifact that policy may evaluate;
- `nativeEvidence` records the digest-bound native test/review source used by
  the adapter and is mandatory provenance, but it does not satisfy an
  obligation merely by existing.

Adapters preserve native bytes and provenance in the immutable attempt
checkpoint. Core alone normalizes them into
`NormalizedSystemVerificationEvidence`, evaluates the pinned policy, and
assembles the result.

## Policy, outcomes, and operator action

`SystemVerificationPolicy@1.0.0` makes every expanded obligation mandatory,
rejects unknown evidence, and fixes precedence as `failed`, then
`needs-evidence`, then `verified`. Each obligation receives exactly one
`satisfied`, `failed`, or `missing-evidence` disposition.

The Module has exactly these outcomes:

- `verified`: every obligation has all required passing evidence; progression
  is `business-acceptance-gate`.
- `failed`: at least one obligation has failing evidence; progression is
  `none`.
- `needs-evidence`: no failure takes precedence, but required passing evidence
  is missing or inconclusive; progression is `none`.
- `baseline-drift`: the exact subject or an expected binding changed before
  evaluation; it is output-free and diagnostic.
- `unable-to-proceed`: inputs, binding, checkpoint, or adapter material cannot
  be validly processed; it is output-free and diagnostic.

Only `verified` may advance to `BusinessAcceptanceGate`. Operator actions such
as fix, diagnose, clarify, block, retry, and resume are workflow routes, not
additional Module outcomes.

## Checkpoint replay

Every effectful verifier invocation pins its subject, obligation set, policy,
verifier ID/version, assigned obligation IDs, environment, exact grants, and
invocation fingerprint. Core durably checkpoints the returned native bytes or
the thrown failure/interruption before interpreting the effect.

Exact replay requires the stored invocation ID and fingerprint and revalidates
the checkpoint digest, complete invocation, subject, obligations, policy, and
native-byte digest. It returns the same bytes with **zero additional verifier
calls**. Reusing an identity with changed inputs, corrupt bytes, missing
checkpoint state, or a substituted fingerprint fails closed. Changed inputs
require a new invocation identity and fingerprint.

## Trust and traceability

Verifier adapters are proposer-only. They receive only their bounded
`SystemVerifierInvocation`; they may collect native observations but may not
choose obligations, normalize evidence, evaluate policy, select a Module
outcome, approve progression, receive the graph service, or author graph
operations.

The trusted `devrelay.system-verification@1.0.0` contributor matches only an
exact completed `verified` execution with pass evidence bound to the exact
`SystemVerificationResult`. After validating raw bytes, digests, lineage, and
every satisfied evidence disposition, it projects only approved forward facts:

```text
AcceptanceCriterion -> verified-by -> VerificationEvidence
```

It creates evidence nodes and forward `verified-by` edges only for passing
evidence attached to acceptance-criterion obligations. It creates no inverse
edge, NFR relationship, candidate/failed/missing-evidence fact, integration
fact, deployment fact, or business-acceptance fact. Core owns checkpoint-before-
merge and atomic graph application; the adapter never sees graph authority.

## Operator runbook

1. Load and digest-check all three declared inputs and resolve every subject
   reference to its exact approved artifact.
2. Display the subject ID/digest, repository snapshot, integration-record
   count (including `0`), completion facts, baseline digests, environment, and
   policy version.
3. Expand and display every acceptance-criterion and applicable NFR obligation
   with its required evidence kinds.
4. Resolve immutable verifier IDs/versions, exact obligation partitions, and
   least-privilege grants; execute through the checkpoint controller.
5. Distinguish typed evidence bindings from native provenance, then display
   every policy disposition and evidence gap.
6. On exact replay, show the checkpoint digest and zero verifier calls. On any
   substitution, stop with `baseline-drift` or `unable-to-proceed`.
7. For `verified`, checkpoint and merge only the trusted forward traceability
   proposal, then show `BusinessAcceptanceGate` as a separate, not-started
   handoff. Never display business acceptance as granted.

## Adding a verifier adapter

1. Implement the `system-verifier` proposer port for the exact
   `system-verification@0.1.0/verify-system` effect operation and publish an
   immutable plug-in and verifier version.
2. Accept only `SystemVerifierInvocation`; honor its assigned obligations,
   explicit environment, and exact grants. Do not discover ambient context.
3. Preserve exact native bytes as digest-bound `nativeEvidence` and map each
   bounded result to canonical observations with typed `evidenceBindings`.
4. Never return policy decisions, Module outcomes, approvals, progression, or
   graph operations. Reject unknown fields and unrelated obligations.
5. Use Core checkpointing and add positive and negative conformance tests for
   identity substitution, evidence attribution, permissions, failure,
   interruption, and zero-call replay.
6. Report maturity as `contract-defined` or `fixture-conformant` until real
   upstream execution proves `live-conformant`; release readiness requires its
   own package and release evidence. The bundled `test-system-verifier` and
   `review-system-verifier` are fixture-conformant examples only.

## BusinessAcceptanceGate handoff

The handoff consists of the exact digest-bound `SystemVerificationResult` and
its resolvable subject, obligations, policy, normalized evidence, evaluation,
checkpoint, and traceability merge proof. `BusinessAcceptanceGate` separately
evaluates business objectives, success metrics, scope, acceptance criteria,
and its required evidence under its own authority. SystemVerification neither
implements nor bypasses that Gate.

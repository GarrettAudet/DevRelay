# WorkItemVerification 0.1.0

## Purpose and position

WorkItemVerification proves one exact proposed change against its approved
work-item obligations:

```text
WorkExecution -> WorkItemVerification -> ChangeIntegration
```

Verification neither performs implementation nor integrates a change. A
verified result is a candidate until the separate WorkItemVerification Gate
approves its exact evidence. Even that approval only authorizes a verification
fact; downstream ChangeIntegration remains a separate lifecycle stage and
decision.

The current implementation is **fixture-conformant, not live-provider
conformant**. `TestVerifier` and `ReviewVerifier` fixtures exercise the public
boundary, but no live verifier command integration is claimed.

## Public boundary

The exact sequence is:

```text
validated subject/input bindings
  -> obligation expansion
  -> independent verifier binding
  -> checkpointed verifier invocation
  -> raw result
  -> canonical evidence normalization
  -> version-pinned policy evaluation
  -> candidate-only Gate artifact
  -> exact Gate approval
  -> candidate/approved trace projection
  -> Core atomic graph merge
  -> downstream ChangeIntegration remains separate
```

Core validates inputs and their references before expanding obligations. It
binds an exact verifier version, configuration, permissions, obligation
partition, and candidate workspace. The effectful verifier invocation is
checkpointed before its native result is interpreted. Core then normalizes the
adapter's `RawVerifierResult`, evaluates `VerificationPolicy@1.0.0` with
`devrelay.work-item-verification/v1` semantics, and deterministically assembles
the candidate. Gate approval and both trace projections consume exact,
digest-bound artifacts; the graph service prepares and merges the canonical
update atomically.

No step relies on conversational memory or a provider-native session.

## Inputs, artifacts, and provenance

`ValidatedVerificationSubject` binds one `workItemId` to exact references for
`workItem`, `executionAttempt`, `changeSetDraft`, `executionEvidenceBundle`,
`verificationPolicy`, `requirementsBaseline`, `projectOverviewBaseline`,
`architectureBaseline`, `contractDisposition`, `workBreakdownBaseline`,
`workDependencyBaseline`, `specialistAssignmentBaseline`, `repositoryBase`, and
`candidateWorkspace`. Every loaded artifact must match its reference digest;
the work item must be the exact member of the bound WorkBreakdown baseline.

The remaining public artifacts are:

| Artifact | Identity and boundary |
| --- | --- |
| `VerificationObligationSet` | `obligationSetId` plus `obligationSetDigest`; deterministically expands acceptance criteria, the work-item verification plan, required evidence, and policy duties. |
| `ValidatedVerifierBindingSet` | `bindingId` plus `bindingDigest`; pins subject, obligations, executor identity, exact verifier IDs/versions, partitions, permission demand, and independence evidence. |
| `VerifierInvocation` | `verificationAttemptId` plus `invocationFingerprint`; carries only the assigned obligations, candidate-workspace reference, and granted permissions for one verifier. |
| `VerificationAttemptCheckpoint` | Exact attempt ID/fingerprint, invocation, binding, predecessor when present, and either raw native bytes or a thrown-failure record, sealed by `checkpointDigest`. |
| `RawVerifierResult` | Adapter proposal bound to attempt fingerprint, binding digest, exact verifier, observations, diagnostics, native-artifact references, and `rawResultDigest`. |
| `NormalizedVerificationEvidence` | Core-owned evidence items bound to subject, attempt, binding, checkpoint, raw result, collection-time disposition, and `evidenceDigest`. |
| `VerificationPolicy` | Version-pinned policy with `policyDigest`; native artifacts are provenance only, never policy evidence by themselves. |
| `VerificationPolicyEvaluation` | Deterministic dispositions and one of the three policy outcomes, sealed by `evaluationDigest`. |
| `WorkItemVerificationGateCandidate` | Candidate-only exact subject, obligation, binding, evidence, and evaluation references plus `candidateDigest`. |
| `WorkItemVerificationGateApproval` | Gate-owned approval of one exact verified candidate and accepted normalized evidence, sealed by `approvalDigest`. |
| `WorkItemVerificationTraceabilityCandidate` | Evidence-only candidate scope, sealed by `traceabilityDigest`. |
| `ApprovedWorkItemVerificationTraceability` | Exact Gate-approval-bound approved scope, sealed by `traceabilityDigest`. |

Native verifier bytes remain immutable provenance in the attempt checkpoint.
Adapters translate bounded native input into canonical `RawVerifierResult`;
they do not normalize evidence, evaluate policy, approve results, or write the
graph. Artifact references and canonical body digests bind identity and
content. Raw loaded bytes are checked at authority boundaries; recreating a
similar object or changing an outer ID is not equivalent.

## Trust boundaries

| Owner | May | Must not |
| --- | --- | --- |
| Core / Gate | Validate bindings, checkpoint effects, normalize evidence, evaluate pinned policy, assemble the candidate, approve its exact verified form, and prepare an atomic graph merge. | Implement work, accept substituted artifacts, treat prose as authority, or imply integration. |
| Verifier adapters | Read only the bounded invocation, invoke their configured test/review mechanism, and propose `RawVerifierResult` with native provenance. | Implement or modify the change, choose policy or Gate outcomes, approve themselves, access the graph, or claim completion/integration. |
| Host | Resolve exact registry bindings and grants, provide durable checkpoint/graph stores, display state, invoke the Gate, and hand approved verification to the next stage. | Reuse identity after inputs change, bypass validation/checkpoints, invent approval, or collapse ChangeIntegration into verification. |
| TraceabilityGraph contributor | Project already validated canonical candidate or approved artifacts within its declared authority and scope. | Receive adapter input, accept arbitrary graph operations, create inverse edges, or activate candidate facts. |
| ChangeIntegration | Independently consume an approved verification handoff under its own future contract. | Treat a verifier pass, WIV candidate, or graph edge as automatic integration authority. |

Independent verification is mandatory when policy requires it. The bound
verifier ID and every `identityAliases` value must differ from the executor and
all change-producer identities. Self-verification, aliased producer identity,
version substitution, stale configuration, incomplete obligation coverage,
and excess permissions fail closed.

## Outcomes and operator routes

WIV policy evaluation and its Gate candidate have exactly these outcomes:

- `verified`: every mandatory obligation has acceptable, explicitly bound
  evidence from an independent verifier.
- `failed`: at least one obligation has failing evidence.
- `needs-evidence`: no failure wins precedence, but required acceptable
  evidence is missing or inconclusive.

`baseline-drift` and `unable-to-proceed` are output-free, pre-evaluation Module
outcomes. They never carry a Gate candidate.

`pass`, `fix`, `diagnose`, `clarify`, `block`, `retry`, and `resume` are outer
operator/workflow routes, not additional WIV Gate outcomes:

| Route | Concise operator example |
| --- | --- |
| `pass` | Exact policy evaluation is `verified`; submit the candidate and evidence for exact Gate approval. |
| `fix` | Evaluation is `failed`; return the failing obligation IDs and evidence to WorkExecution for a new change attempt. |
| `diagnose` | Verifier failed, timed out, was denied, or emitted malformed native output; inspect checkpointed diagnostics without treating them as a Gate outcome. |
| `clarify` | Required obligation, evidence-kind, binding, or policy intent is ambiguous; request authoritative input before evaluation. |
| `block` | Independence, permission, registry, or required external evidence cannot currently be satisfied; preserve evidence and stop. |
| `retry` | Create a new `verificationAttemptId` and fingerprint for a changed invocation, retaining the prior checkpoint as predecessor. |
| `resume` | Replay the exact stored attempt ID/fingerprint and continue normalization/evaluation with zero additional verifier calls. |

Operator prose explains the next action; only validated artifacts and Gate
decisions carry authority.

## Retry and resume

Every effect return, thrown failure, and interruption is durably checkpointed.
An exact repeat with the same `verificationAttemptId`, invocation fingerprint,
binding, inputs, and predecessor replays the stored bytes or failure with zero
additional verifier calls. Corrupt native bytes, changed inputs under a reused
identity, predecessor drift, or a mismatched fingerprint fail closed.

Changed inputs require a new attempt identity and fingerprint. A true retry may
reference the validated predecessor checkpoint; it is independently
checkpointed and replayed. Resume never reruns the adapter merely to rebuild a
lost in-memory result.

## Traceability and ChangeIntegration handoff

Candidate traceability is evidence-only. It may project verification-evidence
nodes but cannot emit `verified-by`, approval, completion, or integration
relationships.

Approved traceability requires the exact canonical
`WorkItemVerificationGateApproval`. It emits only forward relationships:

```text
AcceptanceCriterion -> verified-by -> Evidence
WorkItem             -> verified-by -> Evidence
```

It emits no inverse edges, integration facts, completion facts, or arbitrary
adapter-supplied graph operations. Core performs the atomic merge. The host
then presents the approval and its accepted evidence as a separate handoff to
ChangeIntegration; WIV does not perform that stage.

## IDE and operator runbook

Display a compact status panel sourced from artifacts, never inferred from
chat:

```text
subject:       SUB-42 @ sha256:...
attempt:       VAT-42 @ sha256:... (checkpoint sha256:...)
binding:       BIND-42 @ sha256:...; verifier.test@1.0.0
stage:         policy-evaluation
Gate:          candidate / verified / not-approved
evidence gaps: none
next action:   request exact WIV Gate approval
handoff:       ChangeIntegration / separate / not-started
```

At each run:

1. Show artifact IDs and digests for subject, obligations, binding, attempt,
   checkpoint, normalized evidence, policy evaluation, candidate, and approval.
2. Show the current boundary stage and whether the Gate is absent, candidate,
   or exactly approved.
3. List evidence gaps by obligation ID and required evidence kind.
4. Offer only the applicable outer route and explain why.
5. Show ChangeIntegration as a separate, not-started handoff until that module
   independently accepts it.

## Adding a verifier adapter

1. Define one provider-neutral proposer binding for
   `work-item-verification@0.1.0/verify-work-item`; pin adapter, verifier, and
   configuration versions.
2. Accept only the bounded `VerifierInvocation`, assigned obligations,
   candidate-workspace reference, and exact grants. Do not accept ambient
   project context or conversational/native session memory.
3. Preserve native bytes and native-artifact provenance, then return canonical
   `RawVerifierResult` observations explicitly attributed to the evidence kind
   and obligation ID.
4. Declare the minimum permissions. Registry/binding conformance must prove
   supported evidence kinds, capabilities, tools, configuration digest,
   complete non-overlapping coverage, and independent identities/aliases.
5. Use the Core attempt controller so effect results and failures are
   checkpointed before interpretation and exact replay makes no provider call.
6. Add positive and negative adapter, binding, raw-byte, evidence-attribution,
   checkpoint/replay, policy, Gate, and traceability tests.
7. Publish an immutable package/plugin version only after its package paths and
   release evidence pass independently. Label maturity honestly as
   `fixture-conformant` until live-provider conformance is separately proven.

The bundled `test-verifier` and `review-verifier` plug-ins are replaceable,
provider-neutral proposer examples, not privileged Core behavior.

## Public surfaces and executable evidence

The package root `devrelay` exports
`validateWorkItemVerificationArtifact`, `bindWorkItemVerificationSubject`,
`expandWorkItemVerificationObligations`, `validateVerifierBindingSet`,
`createWorkItemVerificationCheckpointController`,
`normalizeWorkItemVerificationEvidence`,
`evaluateWorkItemVerificationPolicy`,
`assembleWorkItemVerificationGateCandidate`, `approveWorkItemVerification`,
`adaptTestVerifierResult`, `adaptReviewVerifierResult`, and the candidate and
approved traceability contributors.

Published source-package subpaths are:

- `devrelay/modules/work-item-verification.module.json`
- `devrelay/plugins/test-verifier.plugin.json`
- `devrelay/plugins/review-verifier.plugin.json`
- `devrelay/contracts/work-item-verification-artifacts.schema.json`

The exact executable release evidence is
`test/work-item-verification-release.test.mjs`, with its record at
`dogfood/work-item-verification/release-verification/release-evidence.json`.
The bootstrap release test derives canonical WIV subject artifacts from the
exact historical `WI-WE-CONTRACTS` host receipt. Those derived artifacts are
test setup; the test does **not** claim they were historical WorkExecution
runtime outputs. It also records that live-provider conformance, authoritative
verification completion, and ChangeIntegration are not claimed.

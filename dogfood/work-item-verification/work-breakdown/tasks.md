# WorkItemVerification work breakdown

This is the human-readable OpenSpec tasks projection for DevRelay's `decompose-change` operation. DevRelay Core validates and normalizes it; this file has no dependency, assignment, execution, Gate, integration, or graph authority.

## WI-WIV-CONTRACTS — Canonical verification contracts

- Deliver closed provider-neutral schemas, the module definition, and verifier port.
- Cover exact inputs, obligations, bindings, invocation, evidence, outcomes, and traceability.

## WI-WIV-SUBJECT-OBLIGATIONS — Subject binding and verification plan

- Bind the exact work item, proposed change, execution evidence, baselines, repository snapshot, and verification plan.
- Expand every required check and evidence duty into a stable obligation.

## WI-WIV-VERIFIER-BINDING — Independent verifier selection

- Bind eligible test and review verifiers to every obligation.
- Reject producer conflicts, incomplete coverage, stale configuration, and excessive authority.

## WI-WIV-ATTEMPT-CHECKPOINT — Immutable attempts and replay

- Checkpoint exact native verifier bytes before normalization.
- Preserve interruption, failure, retry lineage, and zero-call replay.

## WI-WIV-VERIFIER-ADAPTERS — Test and review adapters

- Implement bounded evidence-only test and independent-review adapters.
- Prove adapter substitution cannot change Core-owned policy or Gate authority.

## WI-WIV-EVIDENCE-NORMALIZATION — Canonical evidence

- Preserve native artifacts and provenance while binding evidence to the exact subject.
- Require an explicit disposition for every verification obligation.

## WI-WIV-POLICY-GATE — Deterministic outcomes

- Evaluate evidence through policy and return exactly one of `pass`, `fix`, `diagnose`, `clarify`, or `block`.
- Permit progression only when all mandatory obligations pass independently.

## WI-WIV-TRACEABILITY — Trusted verification projection

- Derive candidate evidence relationships without claiming success.
- Add factual `verified-by` relationships only after exact Gate approval.

## WI-WIV-VERIFICATION — Release evidence

- Run focused and full regression, drift, replay, retry, authority, substitution, package, and end-to-end dogfood checks.
- Keep ChangeIntegration explicitly downstream.

## WI-WIV-DOCUMENTATION — Operator and extension guidance

- Document inputs, obligations, adapters, evidence, outcomes, retries, trust boundaries, and examples.
- Make clear that WorkItemVerification verifies proposed work; it neither implements nor integrates it.

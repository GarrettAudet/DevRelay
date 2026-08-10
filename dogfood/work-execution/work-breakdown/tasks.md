# SpecialistAssignment work breakdown

This is the bounded OpenSpec tasks projection used by the configured `OpenSpecTasksAdapter` for DevRelay's `decompose-change` operation. DevRelay Core validates and normalizes it; this file has no Gate, graph, assignment, scheduling, or execution authority.

## WI-SA-CONTRACTS — Canonical assignment contracts

- Deliver closed provider-neutral schemas and the versioned module definition.
- Cover invocation, eligibility, candidate assembly, Gate candidate, and candidate/approved traceability interfaces.
- Exclude concrete providers, scheduling, readiness selection, and execution.

## WI-SA-CATALOGS-POLICY — Catalog and policy fixtures

- Deliver versioned SpecialistCatalog, CapabilityCatalog, AssignmentPolicy, tool, and grant fixtures.
- Define exact references and fail-closed unknown-value behavior.

## WI-SA-ELIGIBILITY — Core eligibility evaluator

- Deterministically filter profiles using required capabilities, tools, grants, and policy.
- Return evidence-backed rejection reasons; do not rank candidates.

## WI-SA-NATIVE-RANKER — Native structured ranker

- Select exactly one profile only from each Core-supplied eligible set.
- Produce deterministic rationale without gaining eligibility or approval authority.

## WI-SA-OPTIONAL-ADAPTERS — Optional ranker adapters

- Publish bounded adapter manifests and fixtures behind the same ranker port.
- Prove substitution cannot change canonical contracts or Core authority.

## WI-SA-ASSEMBLY-GATE — Candidate assembly and promotion Gate

- Assemble one complete assignment for every approved work item.
- Fail the whole candidate when any item is unassignable.
- Promote only exact replay-verified bytes after approval.

## WI-SA-TRACEABILITY — Trusted assignment projection

- Derive candidate and approved forward-only assignment relationships.
- Validate and atomically merge updates with execution and checkpoint proof.

## WI-SA-VERIFICATION — Release evidence

- Prove deterministic replay, drift rejection, authority separation, completeness, substitution, and fail-closed behavior.
- Run focused and canonical package gates.

## WI-SA-DOCUMENTATION — Operator and extension guidance

- Document configuration, trust boundaries, artifacts, outcomes, maturity, and downstream runtime binding.
- Make clear that SpecialistAssignment assigns a provider-neutral profile; it does not build or execute the work.

# WorkBreakdown 0.1.0 Architecture Plan

## Planning provenance

This is the normalized native planning artifact for the bounded Spec Kit `plan` capability. No Spec Kit CLI, OpenSpec CLI, Structurizr CLI, or MADR CLI was executed. DevRelay owns routing, validation, approval, and progression; the named tools are planning-only adapter identities.

## Objective

Add one provider-neutral `WorkBreakdown` module that converts exact approved project scope into a complete candidate set of bounded, traceable, independently executable and verifiable work items. The module plans work only. It does not order an authoritative dependency graph, assign specialists, execute work, build code, or verify completion.

## Deterministic state and routing

Core loads and validates an immutable `ProjectWorkBreakdownState`, recomputes the route, and rejects caller-selected operations.

- No `WorkBreakdownBaseline`: `establish-breakdown`.
- Exact current baseline plus an exact `ApprovedChangePackage`: `decompose-change`.
- Existing repositories without a historical work baseline still use `establish-breakdown`; historical work is not reconstructed.

The selected adapter is configured independently of the operation. Spec Kit tasks is the default initial-breakdown binding for greenfield projects, while OpenSpec tasks is the default for existing projects and approved changes. Compatible adapters can replace either default without changing Core or the canonical artifact contract.

## Exact input boundary

Every invocation pins the exact requirements baseline, project-overview baseline, architecture baseline or approved architecture change, contract disposition, repository disposition, provider-neutral capability catalog, state, route decision, and applicable current work baseline/change package. Baselines bind versions and digests; repository snapshots also bind revision and tree digest.

Before any adapter effect, a generic registered preflight guard validates lineage and emits the completed `baseline_drift` outcome with diagnostics and no candidate when supplied facts do not match. The guard is selected by contract registration, never by a WorkBreakdown product-ID branch in Core.

## Canonical output

`establish-breakdown` returns one `WorkBreakdownDraft`; `decompose-change` returns one exact optimistic `WorkBreakdownChangeSetDraft` bound to the current baseline and composed of typed `add`, `update`, and `retire` operations. Gate promotion applies the exact delta and preserves unrelated planned work.

Each `WorkItemDraft` has exactly these semantic fields:

- `id`
- `objective`
- `bounded-scope`
- `deliverables`
- `work-type`
- `acceptance-criterion-refs`
- `architecture-refs`
- `contract-refs`
- `required-capabilities`
- `dependency-hints`
- `verification-plan`
- `required-evidence`
- `source-refs`

Allowed deliverable-oriented work types are `code-change`, `test-change`, `migration`, `configuration-change`, `infrastructure-change`, `documentation-change`, and `operational-readiness`.

## Coverage and gate

The candidate accounts for every authorized acceptance criterion, architecture target/change, and applicable contract target/change with exactly one disposition:

- `planned` with linked work items;
- `already-satisfied` with rationale and current evidence;
- `no-work-required` with rationale and explicit approval.

The WorkBreakdown Gate rejects unscoped work, uncovered authorized changes, invalid references, unapproved no-work dispositions, and unresolved blocking diagnostics. On pass it promotes the candidate atomically to a `WorkBreakdownBaseline` or applies the exact change set to the current baseline.

## Trust and traceability

The adapter receives immutable domain inputs and returns only a canonical candidate plus bounded native evidence. It cannot access `TraceabilityGraph`, create graph nodes, choose relationship kinds, or submit graph operations. A trusted versioned `WorkBreakdownTraceabilityContributor` deterministically derives planning assertions from an already validated candidate. Core validates, checkpoints, and atomically merges the update, then records the graph version, update digest, execution ID, and resulting checkpoint in the module execution record.

Planning edges are upstream-to-downstream only:

- `AcceptanceCriterion -> planned-by -> WorkItem`
- `ArchitectureElement -> implementation-planned-by -> WorkItem`
- `Contract -> realization-planned-by -> WorkItem`

No inverse or factual completion edge is emitted during work breakdown.

## Downstream boundaries

`dependency-hints` are non-authoritative suggestions. `WorkDependencyAnalysis` owns the validated dependency DAG and rejects cycles, missing dependencies, and impossible ordering. `SpecialistAssignment` owns assignment, `WorkExecution` performs work, and `Verification` proves completion. Ownership, estimates, scheduling, status, produced changes, and completion evidence are excluded from WorkBreakdown.

## Verification intent

- Positive and negative schema fixtures for both operations and every outcome.
- Trusted-state routing tests and caller-override rejection.
- Drift tests proving zero adapter calls and no candidate.
- Adapter replacement tests proving no Core change.
- Exact coverage and source-reference closure tests.
- Gate promotion and typed delta application tests.
- Traceability ownership, checkpoint-before-merge, replay, and horizon-diagnostic tests.
- Static scans and capability-grant tests proving the planning adapter cannot execute or build code.

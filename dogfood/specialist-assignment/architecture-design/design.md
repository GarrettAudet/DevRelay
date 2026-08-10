# SpecialistAssignment design

## Context

Approved ArchitectureBaseline work items require machine-readable assignments before WorkExecution can plan implementation. Rankers must remain replaceable, while routing, validation, assignment-policy truth, traceability authority, and promotion stay in DevRelay Core and SpecialistAssignmentGate.

## Decision

SpecialistAssignment exposes one assign-specialists operation. Core supplies the complete approved work plan and exact catalogs and policies. Core computes exact eligible profile sets. A configured ranker selects only from those sets, Core validates every selection and assembles the complete typed candidate, and SpecialistAssignmentGate alone promotes the exact complete baseline. Trusted graph contributors separately project candidate and approved relationships.

## V1 bindings

A deterministic native structured ranker is the first live path. Optional future rankers use the same eligible-set and ranked-selection port and begin as fixture-conformant bindings.

## Consequences

The module remains provider-neutral and deterministic, ranker output is never approval authority, WorkExecution receives one explicit assignment disposition, and later ranking tools can be swapped without changing lifecycle semantics.

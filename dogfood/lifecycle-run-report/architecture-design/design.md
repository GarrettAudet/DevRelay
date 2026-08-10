# Lifecycle run reporting design

## Context

DevRelay needs one human-readable view of an arbitrary deterministic circuit without allowing telemetry or presentation to become workflow authority. The approved dependency artifact is static, while execution must repeatedly derive current ready work from verified integrated completion.

## Decision

Generic Core emits trusted standardized lifecycle facts and stores verified integrated-completion facts separately from the static DAG. A Core-owned resolver derives each ready frontier. Cross-cutting Lifecycle Reporting appends trusted records and explicitly non-authoritative host observations to a content-addressed ledger, resolves evidence-backed adapter maturity and run comparability, joins one exact TraceabilityGraph snapshot, applies deterministic content policy, and renders byte-stable LifecycleRunReport.md.

## Contract consequence

Run records, observations, lifecycle snapshots, content-policy decisions, integrated completion facts, and ready-frontier results require provider-neutral JSON Schema contracts before WorkBreakdown.

## Boundaries

Reporting cannot route modules, select adapters, mutate canonical artifacts or TraceabilityGraph, satisfy evidence, approve Gates, or alter progression. Missing observations remain explicitly not-reported or not-applicable.

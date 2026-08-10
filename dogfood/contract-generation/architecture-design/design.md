# ContractGeneration design

## Context

Approved ArchitectureBaseline interface intents require machine-readable contracts before WorkBreakdown can plan implementation. Generators must remain replaceable, while routing, validation, compatibility truth, traceability authority, and promotion stay in DevRelay Core and ContractGate.

## Decision

ContractGeneration exposes establish-contracts and generate-contract-change. Core selects the operation from exact contract state. A configured contract-kind adapter generates a typed candidate and native artifacts. Core independently runs a pinned validator and canonical differ. ContractGate evaluates completeness and compatibility and alone promotes ContractBaseline or ApprovedNotApplicable. Trusted graph contributors separately project candidate and approved relationships.

## V1 bindings

JSON Schema draft 2020-12 is the first live generation and validation path. OpenAPI, AsyncAPI, Protobuf, and future formats use the same semantic port and begin as fixture-conformant optional bindings.

## Consequences

The module remains provider-neutral and deterministic, generator output is never approval authority, WorkBreakdown receives one explicit contract disposition, and later format tools can be swapped without changing lifecycle semantics.

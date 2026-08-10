# ContractGeneration

`ContractGeneration@0.1.0` converts every approved architecture interface intent
whose `contractGeneration.required` value is `true` into one typed,
machine-readable contract candidate. It does not approve contracts or let a
generator certify its own output.

```text
ProjectContractState + ArchitectureBaseline + ProjectOverviewBaseline
  -> deterministic route guard
  -> configured generator by contract kind
  -> Core format validator registry
  -> Core canonical diff
  -> ContractDraftSet | ContractChangeSetDraft
  -> candidate TraceabilityGraph update
  -> ContractGate
  -> ContractBaseline | ApprovedNotApplicable
```

## Operations

- `establish-contracts` runs when required interface intents exist and no
  `ContractBaseline` exists. Its sole primary success output is
  `ContractDraftSet`.
- `generate-contract-change` runs when the exact current `ContractBaseline`
  exists. Its sole primary success output is `ContractChangeSetDraft`.
- A state with zero required intents bypasses generator execution and routes to
  the Gate-owned `ApprovedNotApplicable` branch.

The operation is selected from validated project state. Neither callers nor
generators can override it.

## Trust boundary

Generators receive a bounded `ContractGeneratorRequest` and may return only a
`GeneratedContractBundle` containing native bytes and domain identifiers. Core
independently validates those bytes with a version-pinned validator selected by
contract kind, computes the canonical baseline diff, checks exact interface
coverage, and checkpoints the result. ContractGate alone evaluates semantic
completeness and compatibility policy, records approval, promotes a baseline,
and enables WorkBreakdown.

The live V1 path is JSON Schema draft 2020-12. OpenAPI, AsyncAPI, and Protobuf
bindings currently provide fixture-conformant manifests behind the same port;
they are not claimed as live upstream integrations.

## Traceability

The trusted candidate contributor derives only forward
`InterfaceIntent -> contracted-by -> Contract` relationships in
`contracts/candidate`. ContractGate promotion is observed separately in
`contracts/baseline`; candidate facts never satisfy approved contract
references. Generator adapters never receive graph or Gate authority.

The dogfood run under `dogfood/contract-generation/contract-generation/`
materializes 14 JSON Schemas, Core validation and diff evidence, a zero-call
replay checkpoint, an atomic graph merge proof, a `ModuleExecutionRecord`, and
the exact candidate awaiting ContractGate approval.

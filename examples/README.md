# Examples

See the [ChangeIntegration 0.1.0 operator and adapter guide](../docs/change-integration.md)
for the exact local Git adapter boundary, target compare-and-swap, recovery,
and extension contract.

See the [SystemVerification 0.1.0 operator and adapter guide](../docs/system-verification.md)
for the exact integrated-system subject, obligation/evidence policy, replay,
traceability, verifier extension contract, and BusinessAcceptanceGate handoff.

These files demonstrate DevRelay contract shapes and deterministic bindings.

Most historical `ArtifactRef` values use visibly repeated, synthetic SHA-256
digests so the examples stay readable. They are not runtime integrity evidence.
The `module-route-decision-*.json` references are content-derived. The
RequirementsGathering native-source fixtures are backed by exact packaged bytes
under `examples/native/`. ProjectOverview fixtures bind their exact structured
projection to the raw UTF-8/NFC/LF bytes of `ProjectOverview.md`. Runtime tests
construct or load every input, native source, rendered document, handoff,
checkpoint, and output from real bytes and verify its computed digest before
progression.

Requirements examples use the typed canonical business/product fields and
full-body optimistic change sets. A successful initial gate creates one
version-aligned `RequirementsBaseline` + `ProjectOverviewBaseline` pair; a
change creates a new pair even when the projected overview has an `unchanged`
disposition. Architecture examples pass the approved
`project-overview-baseline` explicitly. Core does not inject it from global or
conversational state.

ContractGeneration examples cover exact state routing, Core-owned validation and
canonical diffing, 14 generated JSON Schema contracts, checkpoint replay,
ContractGate promotion, and separate candidate/approved traceability.

WorkBreakdown examples include both deterministic routes, exact state and
change-package bindings, bounded Spec Kit/OpenSpec native task artifacts, one
closed initial draft and promoted baseline, an add/update/retire change that
preserves unrelated work, clarification lineage, and the exact
`baseline_drift` guard result. These newer fixtures use real packaged-byte
digests and remain planning-only; they do not execute either upstream tool or
any proposed work item.

Executable proof lives in:

- `test/requirements-runtime.test.mjs`, `test/requirements-runtime-lineage.test.mjs`, and `test/requirements-typed-contract.test.mjs` for both requirements plug-ins, typed candidates, provenance, full-body changes, and clarification resume;
- `test/project-overview.test.mjs`, `test/project-overview-runtime.test.mjs`, and `test/requirements-gate.test.mjs` for deterministic rendering, exact byte loading, projection lineage, and paired promotion;
- `test/adapter-chain.test.mjs` for byte validation and effect checkpoints;
- `test/operation-router.test.mjs` for state-bound route derivation;
- `test/architecture-runtime.test.mjs` for baseline execution and
  checkpoint-backed resume;
- `test/architecture-change-runtime.test.mjs` for design-change execution and
  compatible modeler replacement, with ProjectOverview context included in
  invocation and resume lineage;
- `test/work-breakdown-examples.test.mjs` for packaged establish/change,
  clarification, native-source, adapter-selection, typed-delta, and drift
  fixtures;
- `test/work-breakdown-dogfood.test.mjs` for the full released runtime,
  checkpoint replay, Gate commit payload, TraceabilityGraph merge, forward
  planning edges, exhaustive coverage, and zero-adapter-call drift proof.
- `test/contract-generation-dogfood.test.mjs` and
  `test/contract-generation-promotion-dogfood.test.mjs` for live generation,
  independent validation, replay, exact Gate promotion, and approved graph facts.

The plug-in examples are bounded manifests and conformance fixtures. They are
not live OpenSpec, GitHub Spec Kit, Structurizr, or MADR command adapters. The JSON Schema contract generator is live; OpenAPI, AsyncAPI, and Protobuf remain fixture-conformant bindings.

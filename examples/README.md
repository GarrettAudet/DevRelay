# Examples

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

Executable proof lives in:

- `test/requirements-runtime.test.mjs`, `test/requirements-runtime-lineage.test.mjs`, and `test/requirements-typed-contract.test.mjs` for both requirements plug-ins, typed candidates, provenance, full-body changes, and clarification resume;
- `test/project-overview.test.mjs`, `test/project-overview-runtime.test.mjs`, and `test/requirements-gate.test.mjs` for deterministic rendering, exact byte loading, projection lineage, and paired promotion;
- `test/adapter-chain.test.mjs` for byte validation and effect checkpoints;
- `test/operation-router.test.mjs` for state-bound route derivation;
- `test/architecture-runtime.test.mjs` for baseline execution and
  checkpoint-backed resume;
- `test/architecture-change-runtime.test.mjs` for design-change execution and
  compatible modeler replacement, with ProjectOverview context included in
  invocation and resume lineage.

The plug-in examples are bounded manifests and conformance fixtures. They are
not live OpenSpec, GitHub Spec Kit, Structurizr, or MADR command adapters.

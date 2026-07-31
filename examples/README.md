# Examples

These files demonstrate DevRelay contract shapes and deterministic bindings.

Most historical `ArtifactRef` values use visibly repeated, synthetic SHA-256
digests so the examples stay readable. They are not runtime integrity evidence.
The `module-route-decision-*.json` references are content-derived, while runtime
tests construct every input, handoff, checkpoint, and output from real UTF-8
bytes and verify its computed digest before progression.

Executable proof lives in:

- `test/adapter-chain.test.mjs` for byte validation and effect checkpoints;
- `test/operation-router.test.mjs` for state-bound route derivation;
- `test/architecture-runtime.test.mjs` for baseline execution and
  checkpoint-backed resume;
- `test/architecture-change-runtime.test.mjs` for design-change execution and
  compatible modeler replacement.

# PM-001 SystemVerification attempt 1 diagnosis

- Candidate: `44ce24d146b17247dc70a3fb407e0ec78a2a7a36`.
- Gate: failed closed; no SystemVerification progression was authorized.
- Seven failures shared one root cause: the ChatGPT Desktop host exposed Windows PowerShell with an incomplete module search path, so `Expand-Archive` could not autoload its built-in module.
- One failure exposed an evidence-sealing defect: the implementation commit intentionally preceded the approved 2.2.0 baseline pair, but the first clean candidate did not yet include the evidence-sealing delta.
- Fix: import the built-in Archive module by absolute Windows path, regression-test that invocation, then assemble the implementation and lifecycle evidence as a separate sealing commit.
- Verification: rerun the focused six-test failure lane, then the complete clean-tree gate and isolated installed-package Windows scenario.

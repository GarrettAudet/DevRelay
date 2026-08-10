# ContractGeneration requirements

- Separate state-routed operations; ContractGate owns ApprovedNotApplicable (recommended)
- Adapters generate; Core runs pinned format validators and canonical diff; ContractGate verifies semantics and promotes (recommended)
- Live JSON Schema 2020-12 path first; define fixture-conformant optional format adapters behind the same contract (recommended)
- Typed draft/change-set outputs with separate candidate and approved traceability projections (recommended)

V1 executes a live JSON Schema 2020-12 path first and defines optional OpenAPI, AsyncAPI, and Protobuf bindings behind the same contract. Every required InterfaceIntent receives one typed contract entry or a blocking diagnostic.

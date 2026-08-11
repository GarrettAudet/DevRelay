# Architecture Gate candidate: WorkDependencyAnalysis 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:4b072ef574875f3a5659d5e0a33a13564820e32ba866273f6ff2f460b60759b0
- ProjectOverviewBaseline: sha256:b915cba9e0af8480229611aff735f265d38bd8c1c4d5fabf19b64432549c16bf
- ProjectContext: sha256:9dc8364cee5a24660c757d5c9b8dd3684e15c57a9eee8f0aa09b07489588d35c
- RepositorySnapshot: sha256:1092f90bf5ebed8096dd12879a2511645b53116eb0d0b82483460053eee88481
- ArchitectureBaseline: sha256:6d3d36bb72754bf057aa504ee86a0f9296a2e1e0cb1637fb5748570f52062d58
- ProjectArchitectureState: sha256:3cc676aa1e988b166d21c5cc63f16def169c67f19bb48d7b07946bb5cdb37052
- ModuleRouteDecision: sha256:fdda1f77f552cc7d82ddc4bd678b8113c85b1bdd6fb98ea101f6411a710736df
- DesignerWorkingArtifact: sha256:3ab49b68c61718230ccfa705a589d7af97f675eadeb4141b59609012ec1abf33
- ModelerWorkingArtifact: sha256:ef94a35ee6c7755fd2233a52ded447ecf5d050e056abbcc57ae9f62783bdf950
- ArchitectureChangeSetDraft: sha256:962026b876a429bf06ca82d93a1410e8203804e89009999ff727fe5741e71691
- Native OpenSpec design: sha256:e1523cd5a34acdbfbfb21d6b504be5c32661ed84fc3cef5b41bb4dc3ed22938d
- Native Structurizr workspace: sha256:33f7ae4b7271a6f889b4089cf1adb73de669d1d4f997ce22781ed756cb522127
- StructurizrConformanceProof: sha256:ca892d566584406f5ecd7fbb4cd6d6602193c1a190adbe58708d57a29aa8afa6
- Native ADR-WDA-001: sha256:f792899c83bd16eb8aba50d31f10c3b276a5b01ace505d742db8f1c9df91e081
- Native ADR-WDA-002: sha256:d14b8056afb8d3b79e6695d6fc01dbe53a257d5565c2d410b900be9a8919559b
- Native ADR-WDA-003: sha256:c9a7f1602af0d5cb7a17cb22fa47bb668b86124c57381e2ac95195e42e8aa81a
- Native ADR-WDA-004: sha256:32ebab4f85775df444d0709cb32851a0fde4e5cc40f977968590310121bb2d2c
- Native ADR-WDA-005: sha256:dabef9eb9d9d024f0b953b11746d9e3c11edec95c5cca1b988bfac69f882947a
- ModuleInvocation: sha256:56f3f2e724f122e6a4363c66b7befa7b699fd2914524830985ac97abd44cd9a3
- ModuleResult: sha256:9ac86a429ec8ba2d378602185f0eace6b5b778d4d9d776c34b13507935f7e9ec
- RuntimeExecutionProof: sha256:a4b85bad2be88e008b8e4b10071a7ffcd1d8f7f1f1c9178a726fd6af3f1d8795

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 21 elements, 20 relationships, the hierarchy, one container view, and two component views.
- PASS: the target architecture consumes one full WorkBreakdown snapshot plus only declared, version- or commit-pinned ContextSlices.
- PASS: proposal generation is a replaceable port; the native structured proposer is default and Task Master/OpenSpec are optional adapters.
- PASS: Core owns canonical graph mechanics behind Graphology-DAG and policy evaluation behind a pinned OPA boundary.
- PASS: Spec Kit is advisory consistency review only; it cannot create authoritative edges or approve progression.
- PASS: WorkDependencyGate owns semantic completeness and promotion; adapters cannot route, approve, mutate TraceabilityGraph, or execute work.
- PASS: the approved artifact is a static DAG; SpecialistAssignment or a later scheduler derives current runnable frontiers.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.
- PASS: traceability emits forward candidate dependency assertions only; reverse traversal is derived.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

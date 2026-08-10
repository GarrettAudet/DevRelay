# Architecture Gate candidate: lifecycle run reporting 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:c75fd7eab03c6409613cf2a9032794c133ca53aefccafeb6dd66931c16d0dff1
- ProjectOverviewBaseline: sha256:eb4a5ea9db4c67cff641ffdc50168ee2c4d257ab307be909fe515759ee88239e
- ProjectContext: sha256:b031933401e1904b50f664351919337976e14b193a266d0f77b4c44451f1142c
- RepositorySnapshot: sha256:93661467d24c69a9798e8c0e52ee79bc68c32fa2a2966ff413064da1e9b79e75
- ArchitectureBaseline: sha256:aa75ec1e76a862f31edb5b39a820ebb76da5cb6a8e8a868730e129f5e58be2ab
- ProjectArchitectureState: sha256:1a8ba9de46600693ad58ff5e6fa702887510bd5226e860f982b7ffd6c62b3144
- ModuleRouteDecision: sha256:4f43f69ecea8bc5ab0e180b3a48c1d4c13b10e734bc69fd39d562393d108e34e
- DesignerWorkingArtifact: sha256:d3ea9c8e757ea1aecfb3162782aaf8dd462ad0fb3789bbfaaf7cdc480f37e45e
- ModelerWorkingArtifact: sha256:ea2b92d798a1fd07003782ffd81f45f10329cfd69407ec0a59bf6c387e33e2dd
- ArchitectureChangeSetDraft: sha256:9ec76ffaeb6a65280f408e6fd7bd673ef3e0de028012d2ea15530453d8605ef3
- Native OpenSpec design: sha256:6d1da121d5052a0838a5108080a0224f236dd05640e0d415d5d62181ac919e95
- Native Structurizr workspace: sha256:6e24c85cf9a6d180a062eb542b142a23689d0753fc2911b8633e19813e3b659a
- StructurizrConformanceProof: sha256:41b943f2a69e96d7b6ecff84a08ea4a47f41a2736363762bafced01e1fc63ca6
- Native ADR-RUN-001: sha256:f53102849c3d28de70bb355e5ec7e7db8c2edd5a9e3f2700e06a53b39b7cea8a
- Native ADR-RUN-002: sha256:c30c6a37950c52e79c5efb0748bcb243b0dda6797a8a391ebb69e1b20d4abb63
- Native ADR-RUN-003: sha256:21a8ef6c3905c46828b288cbaf0c48524298f57a88abac8eacf1df13ec2d7ec8
- Native ADR-RUN-004: sha256:408b9dcc034a0cb6c9d46c2f5799e23affe8f5659dac542207fb582dfb29ca79
- Native ADR-RUN-005: sha256:ad2192040a31a42a7294539ac3ed21bd773107432b43dd3e49dcf9ca7ed44cfc
- Native ADR-RUN-006: sha256:9c4bb3eafc2bde5d8dc6eb49d54a56e1aea1e72a7bbc301ac786efb3fb166ba4
- Native ADR-RUN-007: sha256:6dc2d91828e33bd8eee1d194d7a50e84319f6dc3ca36d2feac404413f8021179
- ModuleInvocation: sha256:4d60b9e02186818d7c644d5c545057b81230ce1da071fafdd8431be830fa91aa
- ModuleResult: sha256:831f88f46e5ec0e0953f4bc8c34550700dae41ce0cf3ee132eda502e679d2ce2
- RuntimeExecutionProof: sha256:ff247a0a2e73a40a2c7d5a98372678f59c0ebbdaa94959bb6c028c675e9940ee

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 33 elements, 35 relationships, the hierarchy, and 6 declared views.
- PASS: RunLedger records canonical workflow facts append-only; LifecycleRunReport projects arbitrary circuit history without controlling progression.
- PASS: host observations remain non-authoritative and require explicit measured, estimated, unavailable, or not-applicable dispositions.
- PASS: report bytes are deterministic for the same ledger checkpoint, configuration, and rendering version; snapshots declare comparability and maturity explicitly.
- PASS: Core records integrated completion facts and derives ready frontiers from the approved static WorkDependency DAG plus current completion state.
- PASS: all eight new structured interfaces require ContractGeneration JSON Schemas before WorkBreakdown progression.
- PASS: reporting remains cross-cutting and cannot route, approve, mutate TraceabilityGraph, execute work, or become a lifecycle stage.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.
- PASS: reporting and frontier traceability are forward-only; inverse traversal remains derived by TraceabilityGraph.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

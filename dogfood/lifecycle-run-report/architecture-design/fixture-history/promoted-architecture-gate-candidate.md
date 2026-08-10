# Architecture Gate candidate: lifecycle run reporting 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:c75fd7eab03c6409613cf2a9032794c133ca53aefccafeb6dd66931c16d0dff1
- ProjectOverviewBaseline: sha256:eb4a5ea9db4c67cff641ffdc50168ee2c4d257ab307be909fe515759ee88239e
- ProjectContext: sha256:b031933401e1904b50f664351919337976e14b193a266d0f77b4c44451f1142c
- RepositorySnapshot: sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73
- ArchitectureBaseline: sha256:aa75ec1e76a862f31edb5b39a820ebb76da5cb6a8e8a868730e129f5e58be2ab
- ProjectArchitectureState: sha256:49b586797d8416b6a874ea13a2c3272eb6837d4f7faceab84309c32d5c1e966c
- ModuleRouteDecision: sha256:41ec0382e2e0873f46771036e5c3ddc802c0ccc6bfc1a541f6bbe0f6fd198a0e
- DesignerWorkingArtifact: sha256:153b3f534ae789b1adab1f5020b5389e0a71af91d9b4e1d14a86e574fe73d261
- ModelerWorkingArtifact: sha256:14c15ff5dc9e821676ffa21cf4240f744fa14759d2e8fe35d8bf24e7b00a579c
- ArchitectureChangeSetDraft: sha256:9ee1936ae7aafd8484466024273b6fabbc342a3553687dbd903d8d82515593d6
- Native OpenSpec design: sha256:6d1da121d5052a0838a5108080a0224f236dd05640e0d415d5d62181ac919e95
- Native Structurizr workspace: sha256:6e24c85cf9a6d180a062eb542b142a23689d0753fc2911b8633e19813e3b659a
- StructurizrConformanceProof: sha256:55355080bb1b50366b10dec9b9ba82a9dadbe4fdeb2654e19feedfdefb53436c
- Native ADR-RUN-001: sha256:f53102849c3d28de70bb355e5ec7e7db8c2edd5a9e3f2700e06a53b39b7cea8a
- Native ADR-RUN-002: sha256:c30c6a37950c52e79c5efb0748bcb243b0dda6797a8a391ebb69e1b20d4abb63
- Native ADR-RUN-003: sha256:21a8ef6c3905c46828b288cbaf0c48524298f57a88abac8eacf1df13ec2d7ec8
- Native ADR-RUN-004: sha256:408b9dcc034a0cb6c9d46c2f5799e23affe8f5659dac542207fb582dfb29ca79
- Native ADR-RUN-005: sha256:ad2192040a31a42a7294539ac3ed21bd773107432b43dd3e49dcf9ca7ed44cfc
- Native ADR-RUN-006: sha256:9c4bb3eafc2bde5d8dc6eb49d54a56e1aea1e72a7bbc301ac786efb3fb166ba4
- Native ADR-RUN-007: sha256:6dc2d91828e33bd8eee1d194d7a50e84319f6dc3ca36d2feac404413f8021179
- ModuleInvocation: sha256:e1b5d9f6d017a40a2e45e1a39afbb796842c931e68f66c447bb6551eb22a7e90
- ModuleResult: sha256:5f9e65fc510e2ed19881faa0d11f6f4b0cc4f609025ed471d33f7aedf33fe1c7
- RuntimeExecutionProof: sha256:bd00c36467defc655d84cc6f6f36328920dbc4cf298bb48d08c9a4b3ca7601d1

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

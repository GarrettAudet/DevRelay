# Architecture Gate candidate: DevRelay PM-001 ProjectMemory

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:fad5cb780e38554a3c8f4adc8e34b8354b8503419debe448f1c80526dc07d658
- ProjectOverviewBaseline: sha256:370f814ce76ea79c9a05ec981a2031a77be63e9a2a3247da47b36947b6df6d22
- ProjectContext: sha256:1d0b0f1ce6db73cab2926336bafe3502c25831897f1ac69e466780f23f3a17a4
- RepositorySnapshot: sha256:544787b3fa91b8c7b38594b1d0c7effc9feb2b4494dd1f63b6a93d58c0efe903
- ArchitectureBaseline: sha256:265711e213a313d162d09b4b46e9cb2c1c84b29e48b03d21875a851fb9a8a4d3
- ProjectArchitectureState: sha256:f006ff3af91bcbdc8c465545c60d088db152b045063f57dacf4042231206c8cd
- ModuleRouteDecision: sha256:77c8cb331c9e29e420388169eb1ba0546e433a109165af5b6f65bfbafcaefb90
- ArchitectureDiscoveryDecision: sha256:987fc0fc059abd08e20f989fe1d6a3ead10ed0f251a4fbc7a009ef44eef4c8a6
- OwnerArchitectureDecisionSet: sha256:3fe68cb2c86799712cb27635fc381dc1183593e82ec13fe146097d07426c1ada
- DesignerWorkingArtifact: sha256:e4dbcdb40512e8e9581f24bc191de46c4a686ac98ec3c5a047985393a21a2ed5
- ModelerWorkingArtifact: sha256:51d9491c24d2c7150871f5160358e829317600c2a325ca565c581d4310329dca
- ArchitectureChangeSetDraft: sha256:10b8564679541c9b5bb40cb1cd9a554868c36153e05f6c3dacc73b0a7a04f88b
- Native OpenSpec design: sha256:cca0d1b6c3b331582c8dd63a860034e86ca390d33ebad4d72508a36d9a19b0be
- Native Structurizr workspace: sha256:90d2c02ac9f529dbb31367579df704759e69aba086f8e5d29ab2c835c808b683
- StructurizrConformanceProof: sha256:02002f5bc4339ed8d402d4fe7d746cd6c2914aa30dfac7eab7885f06e0d5136e
- Native ADR-PM-001: sha256:b7485055db2e42fffd90dfe38b5b275e668b63a5cfcceb010668a7f7b2f21f67
- Native ADR-PM-002: sha256:f9e1f4a7566fc225f5252f11401a4f077eb3f32a490ef451aa2f65b5dea18a9d
- Native ADR-PM-003: sha256:b48fd60d52776f52562bd7684f9dd122ad3d45501b093e700f32016d605e4bef
- Native ADR-PM-004: sha256:7226365fcd76392d0cb4f2e8b2f5d2061a4c781b9c93612a254e406f69cc4807
- Native ADR-PM-005: sha256:0750ba2dc1e4701daec9178b020abe3a537baa62fa70e7a8d263284fe6830793
- Native ADR-PM-006: sha256:66988f6d0de3b838127e0b879111222cc34c9abf459668019208647a7fe4d072
- Native ADR-PM-007: sha256:c83648f96ffaa49b929f608ad7498bdaa8f70e568bf37198ea464e326e552a8a
- ModuleInvocation: sha256:52c5767b95795c58423149afacb80c4ce4bf44bd66c8b1615d6259d0e93db6cc
- ModuleResult: sha256:1fe12d5337a009fc5f2a9a3bd2942fa7ede0ec3373be565d3e0a8c090472eeb3
- RuntimeExecutionProof: sha256:2f0f1759533580be0ea60ff95c6df301c68f2898017f021d3645448be8cf3137
- TraceabilityUpdate: sha256:2ee9e221658560be773527601ba500044c3e5aef47766e178c29e7c2bf9153d4
- TraceabilityMergeReceipt: sha256:5904a424f65fc462bdbd8d0fb6c11fbf6c36c787d122cd3c8184a8f2d1c4be14
- TraceabilityGraphSnapshot: sha256:c070ab4d10416a1743a33b17489b8cc3fc105e29b08cd4446b54abcefdcfca10
- ModuleExecutionRecord: sha256:349de544b6db0004d80eb4d0622c7eb6363095abb99f8248406b29c887f55894

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- ArchitectureDiscovery was deterministically bypassed because the exact approved ArchitectureBaseline exists.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects are bounded deterministic provider fixtures at this design stage; the official Structurizr binary separately parses and exports the real workspace. PM-001 implementation must produce live receipts before either fixture-only binding is promoted.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy and the exported model normalized exactly to the canonical elements, relationships, hierarchy, and declared views.
- PASS: ProjectMemoryBaseline is the sole memory authority; CurrentSynopsis.md, session/module retrieval, and Mem0 indexes are deterministic derived views.
- PASS: Mem0 is isolated behind a provider-neutral port, local-only by default, namespace-bound, receipt-backed, and unable to mutate baselines, Gates, or TraceabilityGraph.
- PASS: fresh configured tasks load the digest-bound CurrentSynopsis and authoritative project memory before any other semantic context.
- PASS: context assembly orders approved artifact authority before recency and requires explicit conflict or supersession resolution.
- PASS: modules emit typed MemoryUpdateCandidates; qualitative add, replace, supersede, retain, or reject actions require exact user disposition.
- PASS: /conclude is idempotent, worker tasks remain candidate-only, the parent serializes parallel results, and ConcludeReceipt binds the resulting baseline and graph checkpoint.
- PASS: a prior unconcluded configured session blocks a fresh task until resume, conclude, or explicit abandon resolves it.
- PASS: TraceabilityGraph content reaches memory only through a trusted checkpoint-bound read projection; approved memory lineage returns through a separate trusted contributor.
- PASS: provider failure can continue only through a verified semantically equivalent native path; otherwise memory accuracy fails closed.
- PASS: raw chat is not authoritative or retained by default, and external model, embedding, or source transmission requires explicit operation-scoped opt-in.
- PASS: p95 budgets are explicit: warm authoritative context load <=250 ms and bounded provider retrieval <=750 ms, with duration and cache behavior receipted.
- PASS: all new structured interfaces are explicitly routed through ContractGeneration before WorkBreakdown.
- PASS: graph-aware execution merged approved RequirementsBaseline and candidate ArchitectureDesign observations atomically, then replayed with zero adapter calls.
- PASS: exhaustive typed changes and forward-only traceability cover every approved normative requirement without rewriting unchanged baseline entities.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

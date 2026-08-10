# Architecture Gate candidate: contract generation 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:cd07170d8ea48ba98a1c4f45d30ade2e83992e0fd4433cb049fbf0af7c34e8cb
- ProjectOverviewBaseline: sha256:c440350f162c530a0180661ad7f6812551d0a184298f256a52239e5b2e9de699
- ProjectContext: sha256:574fbd2a9a41598854b4328a23e3f4e5628469d3bd8a294da2017ffd9b0eaa0e
- RepositorySnapshot: sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73
- ArchitectureBaseline: sha256:a2bc5b38377337dbc6e86eb45821b9fab4eca4be044693944442c6c45153fa29
- ProjectArchitectureState: sha256:6c02a91b3f1259bff0f4eeb4fad84f5f08b072323e99405a392488088e0b9937
- ModuleRouteDecision: sha256:74885ec58d42ee4982c9392c1c5e407e8ced5de3c87c47040e254ad72457f431
- DesignerWorkingArtifact: sha256:95295443b8ac624c2275703fa20c2e34a360cf8651452c144015cd070b942b78
- ModelerWorkingArtifact: sha256:3415290cec1853a24a3d6a1ba1415257d4f9b3145579371ac09cb0941476f9aa
- ArchitectureChangeSetDraft: sha256:c410dd4888d660a9467d964dc447b588aac4d21290dc8045bd7b74c2f79c683c
- Native OpenSpec design: sha256:d91ed90b743c0ce2fd5241b277e9a8acb5f1d2364bb44e97f48361a6c16e167b
- Native Structurizr workspace: sha256:81398bbb2d585d869024868f0f126ad0a2c604cdf6f7ba08e0896a5131a161a5
- StructurizrConformanceProof: sha256:e50aaab16f6a807916acddd641e5c9983db6b20138abf15852682678d0f29e29
- Native ADR-CG-001: sha256:04e33b9ac250e9469a43f589d7348c4c0adfef3d73155a5723f173490cd28ffd
- Native ADR-CG-002: sha256:ce7c235360f0d2def4eeacedd9e40d35da429d6738827bff77d535d21c4bfca8
- Native ADR-CG-003: sha256:b2e3382265cc9e5c8db97331cbd8faa62116166c8c0f521668a82998bdb3b54f
- Native ADR-CG-004: sha256:4e9f3414aefabd76b9b68585e3e1ae38dc825e16c5e61552ac28d670977e6ea2
- Native ADR-CG-005: sha256:c6fee6b3763afb4229304b71a990aaae11cac920333b1b9114957688668d14a4
- ModuleInvocation: sha256:127ff6081121f79028bee0e533e6db3390e3176c2b45a442f798f64e1b6e52f9
- ModuleResult: sha256:1e62e8ebb62394ea936f3ae13010d2859f4b87212729af720e00de67c03b9b5a
- RuntimeExecutionProof: sha256:618f2b66fcc29cd57ecc4230d1facfaa58a5b3522393a01daadfcd4c49db289d

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 43 elements, 45 relationships, the hierarchy, and 10 declared views.
- PASS: Core selects establish-contracts or generate-contract-change from exact contract state; ContractGate alone owns ApprovedNotApplicable.
- PASS: configured adapters generate typed proposals but cannot validate their own authority, approve compatibility, promote contracts, mutate TraceabilityGraph, or release WorkBreakdown.
- PASS: Core independently runs version-pinned kind-specific validation and a canonical complete contract diff.
- PASS: the module returns exactly one typed ContractDraftSet or ContractChangeSetDraft with native artifacts subordinate to canonical output.
- PASS: the eight existing required interface intents and six new ContractGeneration intents require JSON Schema contracts before WorkBreakdown progression.
- PASS: JSON Schema draft 2020-12 is the first live path; optional OpenAPI, AsyncAPI, and Protobuf bindings remain replaceable and fixture-conformant.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.
- PASS: candidate and approved contract traceability use separate trusted contributors and authority scopes; adapters submit no graph operations.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

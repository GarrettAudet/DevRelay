# Architecture Gate candidate: ArchitectureDiscovery 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:c53332998c1b46848b0131f54341bed23b174d727e635731258fecf03aec5948
- ProjectOverviewBaseline: sha256:b8f2910a06e208b73854baa64b24103193936a3c2a9a5bde61b294300f008985
- ProjectContext: sha256:98553600fd8344af9db86eddfdc832dc6ab1997034fbe730e06c9ea787037478
- RepositorySnapshot: sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73
- ArchitectureBaseline: sha256:b5914c8c4490fb2ad962725ebe5acec9baf6ac5db5dfc154b3eee45c15adff9f
- ProjectArchitectureState: sha256:56d05bc259e8a690f04287c40438f5259fdffb734ff5bdfd7ba2b64cadfa67e3
- ModuleRouteDecision: sha256:6abda7172539c88efd9df129d74461c0e12468898dd05cb9481b77366ad81586
- DesignerWorkingArtifact: sha256:3c205b754a43ae37c869a2ee2b40af89815eb26cc6576d04e478555dfba33b68
- ModelerWorkingArtifact: sha256:52d35d644362c517ef837f9fcb872f022cff8bb9396619b82984b14ea66a7126
- ArchitectureChangeSetDraft: sha256:9447d17e88b5a24095ef4cadfd08a6ce00f24615cba96c4974416133339b6102
- Native OpenSpec design: sha256:632b2f973a3ed8e197f0fb05e6cd8fa7ade2d2478109d63576ef9f1dcdaeb2d2
- Native Structurizr workspace: sha256:43c6b81e7050b0058710359bff7f134eda985f309bc2bda0b1bf901308ef6731
- StructurizrConformanceProof: sha256:012017a7620d9df62e0e8124a85d51a57a4869e3af62ce6eccf69a57bfc52456
- Native ADR-AD-001: sha256:02ad5187fe23613f9ec3e2fc836a404e900b7a21d2b20da7d30cd28846e67eff
- Native ADR-AD-002: sha256:f9d108d6f3775c11ba6ec4192fcbd5d2234237d7b27196200c44fe3b1acd8f8d
- Native ADR-AD-003: sha256:7194cc447a9eb629d3b43f861ad627de299b9d9558c8803abc125c958eaca655
- Native ADR-AD-004: sha256:6bb712c04a1ae2da21eb8d1ae532f5db110ce79640ebab04fa54fe5fd6f843b8
- Native ADR-AD-005: sha256:29d99ec4cc14943d3f16b7a275e5f9fd5d0811a7fe57ae2c59dc2e6c001187b7
- ModuleInvocation: sha256:a6620182385bf4bb694c157399a5c6345fbc432af8899f605608a41b0296440f
- ModuleResult: sha256:5147ce51d8835e73c77fd0486021a4e890dff88753eb29fb211661e5f09a9a36
- RuntimeExecutionProof: sha256:fe635bc4149eb130c65827b8bfb6f7b1ce205b94feeb3eac9047e60265dca6c9

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 95 elements, 90 relationships, the hierarchy, and 30 declared views.
- PASS: Core binds exact project state, promoted requirements/ProjectOverview, repository snapshot, discovery policy, adapter chain, options, and grants.
- PASS: Core owns conditional routing, input/privacy validation, observation normalization, material-gap evaluation, checkpoint replay, lifecycle progression, and traceability projection.
- PASS: every run uses the version-pinned native local inventory; dependency-cruiser, SCIP, and future analyzers remain optional bounded observation contributors.
- PASS: default analysis is offline over tracked or explicitly declared files and requires exact opt-in policy before source content leaves the host.
- PASS: observed, derived, inferred, unknown, and not-applicable findings remain distinct; material gaps block while other uncertainty remains explicit.
- PASS: seven provider-neutral interface intents are marked for JSON Schema contract generation before implementation.
- PASS: exact replay uses durable checkpoints with zero adapter calls, and repository or adapter substitution fails closed.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.
- PASS: the trusted contributor projects observational current-state lineage only and creates no intended-design or ArchitectureBaseline fact.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

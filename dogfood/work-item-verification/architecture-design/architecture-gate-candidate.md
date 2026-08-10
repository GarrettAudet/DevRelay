# Architecture Gate candidate: WorkItemVerification 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:f9ea89ac760902ee1f3285b9816603dd82ecf47c2451a6b4558b51772c939438
- ProjectOverviewBaseline: sha256:5c5a6678356be97ff75a68b357262e1a49b50fe010f4401897fed497b682b886
- ProjectContext: sha256:e920fcb8a5bcf01771fae363f2b752ca751622f0291c2232cc041c6e0ac97ae9
- RepositorySnapshot: sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73
- ArchitectureBaseline: sha256:08d77bce4e294a4ba25374acc8a338dd0c159cd760577d991000c0efe00d5c1d
- ProjectArchitectureState: sha256:df37086cf2bb1c10d3b85a1eb1fb0bfb820b2c17e547dedfb96ec3bb8ab04889
- ModuleRouteDecision: sha256:01dafe5740decc202c02e1751b9ff2ce9bb1c96d68f418c1c7a7bab6fd96e384
- DesignerWorkingArtifact: sha256:09e34bd685cb78e8573aaf84bcdb767e8bacfa3ba563b1fb453562aee62fc667
- ModelerWorkingArtifact: sha256:90b6ebe081a912ef90e500d39a6bc79c841e90fe7463674a858e7c2fed3feec1
- ArchitectureChangeSetDraft: sha256:62cf155b41fb9a4d490a2dd6c785d9c195bc63d291e47ff146cbd6b702ad0540
- Native OpenSpec design: sha256:3f02f0bc9ea39043b4c0d9f927dad52e2a3c02782b1e306d330b5a501283893b
- Native Structurizr workspace: sha256:00071942646a497b31746a70776b9895e41d23e729ca4d9f8154e3878ed3dcb4
- StructurizrConformanceProof: sha256:f69b0ba993e45ecc06e1541a758744dadc610b3208eb276cb561d4269b289e55
- Native ADR-WIV-001: sha256:9f7a1e00d98d6773efa0bb836ba2d1eebb45d987fd38c4013807a9ac1a5ae14e
- Native ADR-WIV-002: sha256:8b71bb29ab2d6914d491b17c75d535a7c0f19e568d7a2318a84543a5d7686848
- Native ADR-WIV-003: sha256:d5444a18e4ec278cc57554aac490e530dfb8bcc026c738247f99a6bb46b09487
- Native ADR-WIV-004: sha256:0909b28b1cadb712855072b25f6e59db13f8fd933a9615c84d0c02a2a4db6dd9
- Native ADR-WIV-005: sha256:5ee19a174748eb0bae1091e1b3e5c1e2fede5fdb30811afaf3e93d8a25c18b47
- ModuleInvocation: sha256:2e9d5b4c26883d3781e752b8c8242965e3cb895eeddc92204eb848309e1b0a08
- ModuleResult: sha256:648e403b44365af785eb3d652ae7fc16833c100cea4cf4f125abd914c26d7579
- RuntimeExecutionProof: sha256:52f655fab34b4af84a544745ab250549547c5588694c126d4ad539ac50896be7

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 76 elements, 74 relationships, the hierarchy, and 22 declared views.
- PASS: Core binds one exact WorkItem and immutable WorkExecution result, expands every approved obligation, and rejects cross-subject or stale evidence before verifier entry.
- PASS: Core selects version-pinned verifier bindings from controlled evidence kinds, validates declared permissions, and proves executor/verifier independence when policy requires it.
- PASS: every actual verifier invocation creates one immutable VerificationAttempt; exact replay uses its terminal checkpoint with zero verifier calls, while retry creates a linked successor.
- PASS: Core normalizes subject-bound evidence, requires one disposition per obligation, and produces only the closed verified, failed, needs-evidence, baseline-drift, or unable-to-proceed outcome set.
- PASS: nine provider-neutral interface intents are marked for JSON Schema contract generation before WorkItemVerification implementation.
- PASS: test and review verifiers are evidence-only bindings behind one provider-neutral port; future verifier capabilities use the same contract without Core product branches.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.
- PASS: trusted contributors separately project candidate VerificationAttempt links and Gate-approved AcceptanceCriterion verified-by Evidence links; verifier adapters submit no graph operations and no contributor creates integration facts.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

# Architecture Gate candidate: WorkExecution 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:c66224db72ab53947d045720e87e0d6929d4fcb80fbf1fa2f4b607e967caae30
- ProjectOverviewBaseline: sha256:6cae194ccf525e5cd3190fd021aed052fc10f373fd1c1eb09d6b6ee002e844f7
- ProjectContext: sha256:69f8cf96a407d2255cf4156651169218f65ed4b5ab5e925bb00ca55f2a104faa
- RepositorySnapshot: sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73
- ArchitectureBaseline: sha256:d522ee2f849778fbdfb88dea822ec8c33a3f1ca87548bb0a8960e335a7c3833d
- ProjectArchitectureState: sha256:7842820d4ac82d266d52d41393809cd576760f33111965469715831ce953cb73
- ModuleRouteDecision: sha256:4ec950c81b164c7633ec59fa12cbfd2309a9d3b3a6308b83e2372079ec1c0091
- DesignerWorkingArtifact: sha256:f076297e82599434a8f14cc8f9fbe23d84a860083be5ee251f9320e644027aaf
- ModelerWorkingArtifact: sha256:f07eed14c6b5609dba3d3ae418166dac60e2e983847fb6efa34f382d551aa76a
- ArchitectureChangeSetDraft: sha256:268a6143a6322e7afc8872fe0f2323b4baf48c003266a70d5b4252f4cc653bf8
- Native OpenSpec design: sha256:e347283c6494694c89e9ef2b2b09cb995ce433046223b2f9a0429ca377ebe44e
- Native Structurizr workspace: sha256:8208da1e768053f8315ea84c6a1db110c2adcdb4367113bce64d43d63d9213be
- StructurizrConformanceProof: sha256:759fbccac7193692557f6b8d64ae2ff3baeb3f0abbb6c4ed98b3352ada9c52b1
- Native ADR-WE-001: sha256:bca99ad0f059f9f7f635b3d83a9d858c82cb4fe46014d0877ceeaab40e500cd3
- Native ADR-WE-002: sha256:f87786aadb88d4b691746ba565e24f719234b05314207595151305400b84a62e
- Native ADR-WE-003: sha256:f233943156f47686eb319069d6c9621ed8c96907a4641e850f508f07067917ec
- Native ADR-WE-004: sha256:dbb901d3f71d6afa4e550bdde83f7c5c5d01a29c4bd6f75af2c5066b9953eca2
- Native ADR-WE-005: sha256:753ef43a1f02615732ad6aae54730bfefd72b0cc4b2fac3e66f67aa2d89f94ae
- ModuleInvocation: sha256:0739ff6025e04fea12afd942903438641ba8ff8cf3054fccffcb85e73e617740
- ModuleResult: sha256:64fbd4acb9c543bfce034793bf6fa03a86608b6c2b512ff56a84ae704ba485c9
- RuntimeExecutionProof: sha256:94d4b6002241144be13355f8c30320763dc71c28ad82d37693c43e1212db2ebd

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 63 elements, 63 relationships, the hierarchy, and 18 declared views.
- PASS: Core derives one runnable WorkItem from the exact approved dependency DAG and integrated completion facts; neither an executor nor a binding can select readiness.
- PASS: Core validates the exact SpecialistProfile-to-executor binding, declared tools and grants, adapter version, and host policy before invoking the bounded executor port.
- PASS: one immutable ExecutionAttempt invokes exactly one ready work item; frontier parallelism is represented as separate independently checkpointed invocations.
- PASS: the module returns a checkpoint-bound ExecutionAttempt with a ChangeSetDraft and ExecutionEvidenceBundle, or a durable typed non-success outcome; it cannot claim verification or integration.
- PASS: five provider-neutral interface intents are marked for JSON Schema contract generation before WorkExecution implementation.
- PASS: the Codex task adapter is the first configured binding; optional A2A and future executors use the same execution-attempt contract without Core product branches.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.
- PASS: the trusted contributor projects candidate attempted-by and produces relationships only; executor adapters submit no graph operations and cannot create verified or integrated facts.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

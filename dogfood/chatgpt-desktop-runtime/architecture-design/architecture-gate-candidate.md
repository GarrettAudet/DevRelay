# Architecture Gate candidate: ChatGPT Desktop Windows runtime 0.1.0

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:e08a1235f4535bca902a3c8a11c4067e55075d0c6b05c935bb0c24bb9a50d7b6
- ProjectOverviewBaseline: sha256:30889842e88d079a91e9e33e5c288db9a0fa9c7a5d6d9c251f1ac22d669f20df
- ProjectContext: sha256:54ce2e60cf0a5d4309c529bb6b06867bca53d174b703784dc46c9d5a596696d0
- RepositorySnapshot: sha256:c0dd3271f26a397d533ff30c6a50abe5a1debcc37af7e7ab206c9cf4daca1e0f
- ArchitectureBaseline: sha256:dcab07305935477707fdeda7c0c99a0a88afc246539844f8737ccfef29abc3bc
- ProjectArchitectureState: sha256:35e07e37df5f5049c67145d0b8ba6747fcfa168f2d95182b0ff6d6c63d28e1fc
- ModuleRouteDecision: sha256:89c7e1b1d2a298c5c225ac881cebee8d6100e73032ab51f6445cd51b14bf481d
- DesignerWorkingArtifact: sha256:6cb44f220fcce3e5902e5f87414b85c569dc12643b2469fa599fd2035d0b19d5
- ModelerWorkingArtifact: sha256:0a14f5d91bf477b1cfef58299b997bd22066f6f8d097862ec50530254b473d01
- ArchitectureChangeSetDraft: sha256:6e91fc3fbcca077c3d774c34560143cc95b4ef023880a88ac73a5731683f1f96
- Native OpenSpec design: sha256:5981b6200121daeaf255cc1a738de058d55fc5d41a61ae93533c14712c071e35
- Native Structurizr workspace: sha256:5be931cbcbe5c5b72756df7c324be88271550183960532401d79a637a70afcb5
- StructurizrConformanceProof: sha256:73e5e2551d3f59414baa64bf3dd17fcd4838137166278dd8347d46561bc8d7b5
- Native ADR-DESKTOP-001: sha256:a319bbadeba05481d544083992fcd684f9ae3d87c039d7558ba1ac2fd5b83265
- Native ADR-DESKTOP-002: sha256:a7256f125e7cfb3eb585e8fa88ca3ba341e56c283987878c20747851fa8e734e
- Native ADR-DESKTOP-003: sha256:23b6dd3759664c5bc3b7680e1491f1fd5330530a198562322e1c2740ce596bae
- Native ADR-DESKTOP-004: sha256:4a3cd0b619495697520f1cdb2b10c98c40e0999a770c0db7880ddb1f5d77e308
- Native ADR-DESKTOP-005: sha256:eb46e8f2568636c8b7884b5cea0426ecd56621e40ab418dec3703602e25e04ad
- ModuleInvocation: sha256:6f2e0b320be82056d1ab92d80b0e4d14bf9d4189780b10391adb15244598ea50
- ModuleResult: sha256:4664f8d92f38b60036f75ab53545f47eef265dcf4e67d97980a23c812a2fec9a
- RuntimeExecutionProof: sha256:176c7bcfd3e87b381207be6c4ec8e02d02d25d7f7e66073911e2742342571874

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 103 elements, 100 relationships, the hierarchy, and 32 declared views.
- PASS: the candidate models the repository marketplace plugin as a bounded ChatGPT Desktop host adapter rather than workflow authority.
- PASS: the typed local STDIO MCP interface delegates route and decision authority to Core and rejects caller-authored authority by contract.
- PASS: the Codex app-server supervisor boundary maps one Core-derived ready work item to one immutable task attempt and raw handoff.
- PASS: the durable run-state contract binds checkpoints, task identities, raw handoffs, and uncertain-effect reconciliation for restart-safe implementation.
- PASS: capability resolution requires one release-ready binding per mandatory lifecycle capability and preserves evidence-backed maturity for alternatives.
- PASS: all six new structured Desktop interfaces require ContractGeneration JSON Schemas before WorkBreakdown progression.
- PASS: Windows installation, upgrade, rollback, uninstall, least-privilege grants, and clean-install release proof are explicit downstream obligations.
- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements without rewriting unchanged baseline entities.
- PASS: the candidate defines forward-only Desktop traceability; inverse traversal remains derived by TraceabilityGraph.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

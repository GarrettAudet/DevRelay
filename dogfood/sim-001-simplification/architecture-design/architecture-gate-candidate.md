# Architecture Gate candidate: DevRelay SIM-001 simplification

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:d6bf55b38cbe96d4c1fdca87d0ed07e2697a7a90e5ab33bb7c27098f88229de5
- ProjectOverviewBaseline: sha256:17fc515e1da2ed916692e87e73567ab18289eeb00b2dd4faecc7372e875bfa00
- ProjectContext: sha256:d20e78741c02270ce55c1b5ecf4a7f3a958c7c966d9ff61095b7289ac298e103
- RepositorySnapshot: sha256:d683f78299576e36b4c57bd1f40b883f17abee07698f0920bcca013be9de97ca
- ArchitectureBaseline: sha256:248e888701ce3aa30481bdda40624faa8fec95a45aefc76334ba5fd648fe48bb
- ProjectArchitectureState: sha256:1a142e690fdc4e62424974beda3feea707aa988ed0a6ac1181441523e9bb0575
- ModuleRouteDecision: sha256:3fcb4fb28c194ccf938de9500c7240067a6cd460a222cb67caad5b5345c0001a
- ArchitectureDiscoveryDecision: sha256:c95198ebcdd676dcd8a30ce7f0371e42a5e02e22ffb4a451dea111ac8a075a52
- OwnerArchitectureDecisionSet: sha256:71cf5f4e857a464b4cb50694a6be99cf45995c3a346b9877639989c93146b709
- DesignerWorkingArtifact: sha256:eb00c588280d3db6e1dfc57b4a6d9e24c2c074a6cd4aa4ca9a2b995ba094d178
- ModelerWorkingArtifact: sha256:c24e7c230ecd36482104cc02367923e5b16a015962353479c5088870115309ab
- ArchitectureChangeSetDraft: sha256:ce5f9f202f983a91e7ebb5fd690194ecf82c3564d33b743390fed1986f97b8ee
- Native OpenSpec design: sha256:b61bec2e0d33c1ebf5526e25459bcf5e20da02677e005f1618b0a9502e734f0d
- Native Structurizr workspace: sha256:6bd2ee0159db5624aec61c0a032d064148dde96b62309a5e5323911852bab70a
- StructurizrConformanceProof: sha256:64b8632cfb0c71a22a6b7e23d17a18e9097576f0aff80e3e6a7fc643ac8ba7ba
- Native ADR-SIM-001: sha256:8e55712e8c3026136fc58ad546a908851c4209a73ea6f61260914f2488adae06
- Native ADR-SIM-002: sha256:6fbffc2da98ddfd5d465d5c03bdb8fb8e8b2a9e7f452a49b5f3cc46be7632f03
- Native ADR-SIM-003: sha256:6c6fb518b5f36eeacef8c4271915f457c5f4d869e13d4c73f6bc6e9217f46959
- Native ADR-SIM-004: sha256:4a92b88bc87c4882bc9b9834acb3cf7c984ff86eef4587b70ebe8aa16412c468
- Native ADR-SIM-005: sha256:870ec189630bc5b4ebcb4f6e072bc78acd9986efab7845f9590d0d5a10c312cc
- Native ADR-SIM-006: sha256:e12a9da1e2d9a87c64def508c376ee53226f0de88a182b3400a1a15542e2c949
- Native ADR-SIM-007: sha256:e087e1a901d7552f6613401cb7bdf7dd30b4e97fec60704dbb2565c6774a655b
- Native ADR-SIM-008: sha256:92c5444679390b57189b7f0f5dfa1f315c8cb5322a2d6319d1a118d7d2f4d2a0
- Native ADR-SIM-009: sha256:05af3d70d37355c23374b8f785bc6f29ea533125250303ab598ce4022766aaf7
- Native ADR-SIM-010: sha256:eac46f774edbb60c13e79393499a978c5263290e563a340d6deb198369119cf5
- ModuleInvocation: sha256:a1a77471204dc55fe194f93c36d9740e9ac3e52def35558447132a66ad937b65
- ModuleResult: sha256:434e74b6143f6fae5301faa26f327b69b725ee333745b7d3645db345f52ec0ef
- RuntimeExecutionProof: sha256:22c458ff886a77a5e346efa77c869f1d410cf04afb40cd41e66b5cd0e564bd4a
- TraceabilityUpdate: sha256:2cda70cd2765f5ee42b9bc9a0630f27ee8d560b33d1c0eaeae630b5a19bb2506
- TraceabilityMergeReceipt: sha256:d7215f384ce260ee92637193d01968b092a5815c73da1e68ce00a6ae3f02fce5
- TraceabilityGraphSnapshot: sha256:0047de93b5f3cd0b2dec69358de550724facfbc2ca8e69481a025fac6d410e40
- ModuleExecutionRecord: sha256:bd574ee4170ebb43613c3aadd820d0be35abcaefea8d4ce91117799880538b19

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- ArchitectureDiscovery was deterministically bypassed because the exact approved ArchitectureBaseline exists.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects are bounded deterministic provider fixtures at this design stage; the official Structurizr binary separately parses and exports the real workspace. SIM-001 implementation must produce live receipts before either fixture-only binding is promoted.

## Gate findings

- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy and the exported model normalized exactly to the canonical elements, relationships, hierarchy, and declared views.
- PASS: the public facade is a thin component over released Core operations and acquires no routing, validation, Gate, checkpoint, traceability, or progression authority.
- PASS: quick, standard, assurance, and inspect resolve to immutable explicit policy; standard is the default and every profile retains adaptive 0.99 requirements closure, Core validation, and applicable Gates.
- PASS: quick-profile omissions become explicit downstream verification obligations rather than passing evidence.
- PASS: the root facade, advanced subpaths, compat/v1 surface, and optional domain packs are explicit boundaries with conformance checks before any physical package split.
- PASS: full evidence externalization preserves immutable candidate identity, SHA-256 digests, media types, sizes, provenance, and clean-checkout retrieval verification without rewriting Git history.
- PASS: Godot and GdUnit4 remain in the existing optional pack and Generic Core remains domain-neutral.
- PASS: the Windows local host separates SQLite transactional state, content-addressed bytes, isolated worktrees, grants, one exact Desktop executor, crash reconciliation, and deterministic CLI responsibilities.
- PASS: crash recovery uses optimistic versions, idempotency keys, durable journals, exact reconciliation, and quarantine for ambiguous external effects.
- PASS: p95 budgets are explicit: init/status/inspect <=500 ms, bounded recovery <=5 s, minimal quick feedback <=60 s, and durable-host overhead <=15 percent of a matched in-memory run.
- PASS: compat/v1 lasts one prerelease cycle; 0.10.0-rc.2 remains a preview and stable promotion requires exact independent human review.
- PASS: all new structured interfaces are explicitly routed through ContractGeneration before WorkBreakdown.
- PASS: graph-aware execution merged approved RequirementsBaseline and candidate ArchitectureDesign observations atomically, then replayed with zero adapter calls.
- PASS: exhaustive typed changes and forward-only traceability cover every approved normative requirement without rewriting unchanged baseline entities.

## Approval boundary

Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.

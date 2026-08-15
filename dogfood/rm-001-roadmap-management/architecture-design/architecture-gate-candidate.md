# Architecture Gate candidate: DevRelay RM-001 simplification

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:c2420bde2e483dbd9e38509cae3eefa69b8f1c8032554a505e90b1dd087b33eb
- ProjectOverviewBaseline: sha256:9e1d862557194706eab075f677ea9c95b0cc153b6af4ca1423774aabbbf820c9
- ProjectContext: sha256:130342b380fd1db8e4f3eaefbc5847821a915454a29fc439631b90994b75d446
- RepositorySnapshot: sha256:9ce13359c2c00cd2c84d852fea04c34b7f6b9f0f99c7da6b2c02edc114cbd7db
- ArchitectureBaseline: sha256:5f128797406f80ad7455bb8f9819e4bde3705df665120a016c2dfa9d4189c4ed
- ProjectArchitectureState: sha256:0163d429057a78e193b7c666e895a2e0a670cb457ab19635be086fd61e32d581
- ModuleRouteDecision: sha256:b9e6efaf253bf4b8c3ee5d579452171784fd46784ede5530fdb60d3a2d1e636b
- ArchitectureDiscoveryDecision: sha256:9f3eca778c4bb06f1a40132f1d9bb7b5b0619f0299af892b96f993a35137fed5
- OwnerArchitectureDecisionSet: sha256:f7d5814cbb77c74e60d8c43ab82b495db98be3be7d6f7f579c80383e691a9aae
- DesignerWorkingArtifact: sha256:9f21d90af27c9f02830771596c737541c9dc91b615bdbe7b5368ea72ccfde553
- ModelerWorkingArtifact: sha256:733da429d360f5c7abe5d2da748bedbbebf5bfb8382fb3b21b98670af222865f
- ArchitectureChangeSetDraft: sha256:4270eadcb3c8cce78256589ae4a597a603e7c994189e21f5af31628ab72f83c7
- Native OpenSpec design: sha256:2b81ca229586edd454afb95f01fd7ac7adc22d6aaad6bd421a2c36839da7b0f0
- Native Structurizr workspace: sha256:9d9075c3b4a813b72d60f2b8aa001629a18abf350f523d099e9d403866d1474c
- StructurizrConformanceProof: sha256:3b514e54e02b0e7861daad1aa3db90730c3895774d71d75ed7c7be3197b617a8
- Native ADR-RM-001: sha256:8d4355e2962f5264c975f977eb37aabd18526793978a1d460fb42153ce68bea9
- Native ADR-RM-002: sha256:7c95db6c54dc102822ccb24a02baa48d6c964bfab74abf7909779831c6597f6c
- Native ADR-RM-003: sha256:6094fc75adbfbc20e5b666a1c21639bc8e2d6cb876c58695be0c4ccc63514db8
- Native ADR-RM-004: sha256:35fafff64ae1ba0c5869f947849cab3d457670bb48fdbe400e43bd443d0a9165
- Native ADR-RM-005: sha256:7705de59cb2a6950c1a0f92f05cea0acc88732b6518a9333783bdb57077df56c
- Native ADR-RM-006: sha256:430d4c263cd03626ca903795378d89cb9fad38338865ffd6b6621d1184ed0713
- ModuleInvocation: sha256:1b6d6fb6195fb7435013c568af775f9bad40545bc6c3dbd0483faf69ac912bdb
- ModuleResult: sha256:2aff7e6d1e3cabf73999ccaea532e671be9ce88b00ef56b03a53353fe6dddfe4
- RuntimeExecutionProof: sha256:a34b1762ff83629800498502762d75f315181592dae0f4d1fabffed8e50308f6
- TraceabilityUpdate: sha256:812375aec4430430af859389a2d09fbfb016d01ec0a256476fc9863820883b61
- TraceabilityMergeReceipt: sha256:1a3c357a6bc1751f24bfa6e61e99a24370058939608b35ea1f8f353a3f648ec3
- TraceabilityGraphSnapshot: sha256:cbef201207d2e579a819c795744384edea536642deb6ea51f04b08c12ce10e8c
- ModuleExecutionRecord: sha256:3acd7d55fe32b3369f51fc66dc1c90d1716509cfa4b31439d62e1c6709720e35

## Deterministic route and chain

- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.
- ArchitectureDiscovery was deterministically bypassed because the exact approved ArchitectureBaseline exists.
- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.
- OpenSpec and MADR effects are bounded deterministic provider fixtures at this design stage; the official Structurizr binary separately parses and exports the real workspace. RM-001 implementation must produce live receipts before either fixture-only binding is promoted.

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

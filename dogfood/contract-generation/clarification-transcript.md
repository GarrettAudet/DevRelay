# ContractGeneration RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and ContractGeneration architecture and implementation are blocked until every question below is answered.

1. **Should ContractGeneration use separate establish-contracts and generate-contract-change operations selected from project state, while ContractGate owns ApprovedNotApplicable when no contracts are required?**

   - Separate state-routed operations; ContractGate owns ApprovedNotApplicable (recommended)
   - One full-snapshot generate-contracts operation for both establishment and change

   Why it matters: This keeps establishment, compatibility-aware evolution, and the conditional not-applicable branch deterministic without asking a model to choose the path.

2. **Which boundary should own generation, format validation, compatibility analysis, semantic completeness, and promotion?**

   - Adapters generate; Core runs pinned format validators and canonical diff; ContractGate verifies semantics and promotes (recommended)
   - Separate generator and validator adapters jointly produce the authoritative candidate
   - The configured generator owns validation and compatibility evidence

   Why it matters: A generator can propose useful native contracts but cannot safely certify its own completeness, compatibility, or authority.

3. **How broad should the first executable ContractGeneration binding be?**

   - Live JSON Schema 2020-12 path first; define fixture-conformant optional format adapters behind the same contract (recommended)
   - Implement live JSON Schema, OpenAPI, AsyncAPI, and Protobuf paths together
   - Define contracts only and defer every executable format binding

   Why it matters: The current approved architecture requires JSON Schema only, while the provider-neutral contract should remain extensible to OpenAPI, AsyncAPI, Protobuf, and future formats.

4. **Should the module return ContractDraftSet or ContractChangeSetDraft with one typed entry per interface, while trusted contributors project candidate and approved forward traceability separately?**

   - Typed draft/change-set outputs with separate candidate and approved traceability projections (recommended)
   - Return only a native artifact bundle and derive contract identity at the Gate

   Why it matters: This preserves exact interface coverage, compatibility change semantics, and candidate-versus-approved authority without letting adapters author graph operations.

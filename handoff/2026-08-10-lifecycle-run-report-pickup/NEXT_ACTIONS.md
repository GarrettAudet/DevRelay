# Next actions

## Immediate DG-1 boundary

1. Snapshot branch, HEAD, tree, divergence, index, and every pre-existing dirty
   path with byte length and SHA-256. Preserve unrelated bytes.
2. Make `dogfood/bootstrap-contract-generation-host-executor/materialize-dg1.mjs`
   consume a repository-relative, content-addressed immutable continuation
   bundle. Do not record or require a developer-machine path.
3. Update the exact invocation/evidence contract and focused fixtures needed for
   that portability correction. Do not alter approved baselines or Gate records.
4. Verify the immutable source manifest, superseding manifest, all 20 manifest
   entries, 48-intent selection, one-call/one-checkpoint/zero-replay-call
   behavior, and terminal digest equality.
5. Perform the portable, exact checkpoint-bound ContractGeneration replay.
6. Stop and present the ContractGate candidate and evidence for a separate
   ContractGate decision. Do not infer or perform promotion.

## Rest of DG-1 after ContractGate

Continue only after exact owner approval and ContractGate promotion of the
byte-bound candidate. Then complete the remaining released planning prefix in
this order:

1. Run `WorkBreakdown@decompose-change` with the full candidate work-breakdown
   snapshot and the relevant version-pinned RequirementsBaseline,
   ProjectOverviewBaseline, ArchitectureBaseline, ContractDisposition,
   repository context, and current WorkBreakdownBaseline.
2. Present the exact WorkBreakdown candidate to `WorkBreakdownGate` and proceed
   only from its independently authorized promotion.
3. Run `WorkDependencyAnalysis` with its configured native structured proposer,
   OPA policy evaluation, Graphology DAG mechanics, and advisory Spec Kit
   reviewer; then present the candidate to `WorkDependencyGate`.
4. After exact dependency promotion, run `SpecialistAssignment` with A2A
   capability discovery and the native deterministic ranker; then present the
   complete assignment candidate to `SpecialistAssignmentGate`.
5. Before declaring DG-1 complete, freeze the exact candidate work-breakdown
   snapshot, approved dependency DAG, complete assignments, every version-pinned
   context slice, traceability inputs/updates/receipts, adapter call counts,
   checkpoints, and byte-identical replay evidence.

Each Module must use its configured production-like bounded binding and its
normal visible user-facing interaction. Ask the owner only clarifications that
block a product, design, security, or acceptance decision; do not ask for
non-blocking implementation preferences and do not infer approval from silence,
successful execution, fixtures, or chat history.

## Remaining increment path

- `DG-2`: implement the bounded LifecycleRunReport candidate only after DG-1
  freezes the exact upstream candidate work-breakdown snapshot and context.
- `DG-3`: independently verify the DG-2 candidate, including authority,
  determinism, redaction, provenance, and arbitrary/repeating-frontier cases.
- Close `PB-001`, `PB-003`, `PB-004`, `PB-005`, and `PB-006` in that exact order;
  then perform the single transactional `PB-002` regeneration.
- `DG-4`: replay the expanded prefix end to end, including repeating
  WorkExecution, WorkItemVerification, and ChangeIntegration frontiers.
- `DG-5`: prove deterministic no-change replay and a clean supported matrix
  twice. Environment-limited results are not supported-matrix green.
- `DG-6`: atomically promote only the exact eligible candidate, then update the
  accepted prefix, maturity records, findings, risks, and next frontier.

## Stop conditions

Stop without mutation and preserve evidence if any of these occurs:

- source, manifest, checkpoint, baseline, candidate, or verifier digest drift;
- a referenced path is missing or resolves outside the repository;
- a proposed portability change needs hidden context or a machine-specific path;
- shared dirty-file deltas overlap or cannot be proven disjoint;
- the required-intent count differs from 48 or any of the nine false-disposition
  interfaces is selected;
- replay invokes the generator again, changes the terminal digest, or loses the
  exact checkpoint;
- a tool or adapter attempts Gate, graph, completion, routing, or promotion
  authority;
- supported dependencies or external validation are unavailable and the next
  claim would require supported-matrix or live-conformance evidence;
- ContractGate approval, baseline promotion, staging, commit, push, or a broader
  lifecycle action would be required without explicit authority.

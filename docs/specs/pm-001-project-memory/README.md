# PM-001: ProjectMemory

## Status

RequirementsGathering, ArchitectureDesign, ContractGeneration, and
WorkBreakdown are complete through their approved Gates and atomic baseline
promotions. WorkDependencyAnalysis produced a validated nine-node, twelve-edge
acyclic DAG and is awaiting exact owner approval at WorkDependencyGate. No
PM-001 implementation has started.

## Goal

Add authoritative project and session memory so every configured DevRelay task
begins from accurate approved context and every completed worker frontier or
task concludes through an explicit traceable memory delta and resumable
synopsis.

## Approved boundary

- `ProjectMemory` is cross-cutting and owns a content-addressed
  `ProjectMemoryBaseline`; `ProjectMemoryGate` owns qualitative promotion.
- `Mem0Adapter` is local, version-pinned, derived, replaceable, and
  proposer-only. Provider failure blocks unless Core proves an accurate native
  equivalent context bundle.
- A trusted contributor creates a checkpoint-bound
  `TraceabilityContextProjection`; Mem0 never receives graph-service or graph
  mutation authority.
- Every completed parallel frontier and terminal worker or main task runs the
  conclude operation and presents `add`, `replace`, `supersede`, `retain`, and
  `reject` dispositions for exact user approval.
- `/conclude` creates a `SessionConclusion`, routes cross-domain deltas through
  their owning Modules and Gates, renders `CurrentSynopsis.md`, verifies Mem0
  synchronization, and emits a `ConcludeReceipt`.
- `CurrentSynopsis.md` is the first semantic handoff loaded in a fresh task and
  is a concise deterministic complete-coverage projection, not independent
  authority.

## Current evidence

- Requirements closure: `1.00`; two breadth-first clarification waves; zero
  blocking unknowns; zero contradictions.
- RequirementsGathering adapter calls: `1`; checkpoint replay adapter calls:
  `0`.
- Focused requirements, lineage, ProjectOverview, runtime, and Gate regression:
  `34/34` passed.
- RequirementsGate replay invoked zero adapters; promotion proof digest:
  `sha256:237ec74a1250486b3c787bd523c02558042316c6a053d66668c614f062def655`.
- The refreshed nine-binding session context passed with receipt digest
  `sha256:c6453b131b19d0830efac9ab9dd293011f66fdceaaf9417f21c6d995b3db8ab0`.
- ArchitectureDesign executed OpenSpec design, Structurizr, and MADR in order,
  checkpointed all three stages, and replayed with zero adapter calls.
- The real Structurizr parser/export normalized exactly to 149 elements, 136
  relationships, the canonical hierarchy, and all 47 declared views.
- Focused ArchitectureDesign regression: `102/102` passed.
- Deterministic regeneration preserved ArchitectureGate candidate digest
  `sha256:424a8eaba37e3fc2edae0c8621f55748dde6b69fd13ad83f1ef4057b58294e69`.
- ArchitectureBaseline promotion digest:
  `sha256:9b7595a01b9730d5d8e5294a6ae59b259bc2ddcd130f1bc19990e73dfa632ed5`.
- ContractGeneration produced and promoted `CB-DEVRELAY-013` with 82 contracts;
  the eight PM-001 additions are backward-compatible and the exact approved
  ContractChangeSet digest is
  `sha256:7a11e9c5a4c559b3ae2e61bf56f23ca100e35ff423fcbc1b79b2ef62a0b4aac4`.
- WorkBreakdown covers all 19 PM-001 acceptance criteria, 11 architecture
  elements, and 8 contracts with nine work items. Its Gate candidate digest is
  `sha256:3590b3bf1dd010ce5936eb0841b19bfdc121819d6228a721727e3c988afb1b18`;
  checkpoint replay invoked zero adapters.
- WorkBreakdownBaseline `2.2.0` is promoted at
  `sha256:881809f809b3093f4ccac2ac331daf29e78cb4f7abb54b7c5078c6520abedd89`;
  promotion proof is
  `sha256:5bccf118c226af5518bb5b83c2014bf3a0de283399f84a4b1a5853bf8c107423`.
- WorkDependencyAnalysis used the native structured proposer, Core-owned
  Graphology-DAG mechanics and OPA policy, and advisory Spec Kit review. OPA
  returned zero denials, Spec Kit returned zero findings, and checkpoint replay
  was zero-call deterministic. Exact Gate candidate:
  `sha256:0efcfbbcaf02bd5815fd01a22d133b033b7c810ef7bc1300c72d64519467df21`.

## Next

After exact WorkDependencyGate approval, promote the authoritative dependency
baseline, refresh session context, and run SpecialistAssignment against the
ready DAG and provider-neutral capability catalog. Assignment selects profiles
only; it does not execute work.
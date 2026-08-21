# PM-001 ProjectMemory owner decisions

All decisions were resolved through two breadth-first RequirementsGathering clarification waves. A completed wave means a completed parallel execution frontier. The owner must approve or reject the exact qualitative delta before activation.

1. **Q-PM-AUTHORITY-001**

   ProjectMemory is a cross-cutting DevRelay semantic module; its content-addressed ProjectMemoryBaseline is authoritative and Mem0 is a bounded derived retrieval and indexing adapter.

2. **Q-PM-BOOTSTRAP-001**

   ProjectMemory is the first semantic context loaded for every configured DevRelay task and is refreshed after every approved module boundary.

3. **Q-PM-FAIL-CLOSED-001**

   A missing, malformed, stale, substituted, digest-mismatched, or otherwise inaccurate canonical memory context blocks execution until repaired.

4. **Q-PM-FALLBACK-001**

   A Mem0 failure may use native recovery only when Core proves an equivalent accurate MemoryContextBundle; otherwise execution blocks.

5. **Q-PM-LOCAL-001**

   Mem0 operates locally on the Windows reference host by default; external model, embedding, memory, or cloud transmission requires explicit opt-in.

6. **Q-PM-INVARIANTS-001**

   Every module receives mandatory project invariants plus only relevant retrieved memory through an explicit digest-bound MemoryContextBundle.

7. **Q-PM-PRECEDENCE-001**

   Approved project authority outranks recency; current-session recency influences retrieval only among records with equal authority.

8. **Q-PM-MODULE-SCOPE-001**

   Module memory is invocation-scoped context and attribution, not an independent authoritative agent memory.

9. **Q-PM-PROPOSER-001**

   Modules and adapters return typed MemoryUpdateCandidates and cannot directly mutate ProjectMemory, Mem0, or TraceabilityGraph.

10. **Q-PM-PROMOTION-001**

   Evidence-backed status may be promoted after deterministic validation; direction, preferences, assumptions, requirements, and decisions require exact ProjectMemoryGate approval.

11. **Q-PM-TRANSCRIPT-001**

   Raw conversations are not stored by default; DevRelay preserves normalized decisions, rationale, questions, outcomes, and source receipts, with raw transcript capture opt-in.

12. **Q-PM-TRACE-PROJECTION-001**

   A trusted Core contributor derives a digest-bound TraceabilityContextProjection after an approved graph merge; Mem0 never receives graph mutation authority or direct graph-service access.

13. **Q-PM-TRACE-CONTENT-001**

   The traceability projection covers lifecycle nodes, forward relationships, current stage, approvals, blockers, orphan diagnostics, evidence gaps, and objective-to-evidence paths without uncontrolled graph duplication.

14. **Q-PM-RETRIEVAL-RECEIPT-001**

   Every provider retrieval binds query identity, provider version and configuration, project-memory version, graph checkpoint, ranked source references, result digest, and replay identity.

15. **Q-PM-HISTORY-001**

   Memory is append-only and superseded rather than silently overwritten; conflicts require clarification or an explicit supersession candidate.

16. **Q-PM-SENSITIVE-001**

   Credentials, raw secrets, and unapproved sensitive or personal information are rejected or redacted before memory ingestion.

17. **Q-PM-PROJECT-SCOPE-001**

   ProjectMemory is project-scoped; cross-project personal memory is a separate opt-in future capability.

18. **Q-PM-BRIEFING-001**

   Every task starts with a compact briefing of direction, roadmap item, lifecycle position, recent decisions, blockers, and next action.

19. **Q-PM-CONCLUDE-001**

   DevRelay automatically invokes the conclude operation at terminal worker and main-task boundaries and also exposes the user-facing /conclude command.

20. **Q-PM-WORKER-AUTHORITY-001**

   Worker conclusions cannot promote ProjectMemory; the parent or integration owner validates and serially merges exact worker conclusion candidates.

21. **Q-PM-DELTA-REVIEW-001**

   After every completed parallel frontier and terminal task, DevRelay shows explicit add, replace, supersede, retain, and reject memory dispositions for user approval or rejection.

22. **Q-PM-QUALITATIVE-GATE-001**

   Every qualitative direction or decision remains inactive until the user approves the exact ProjectMemory change set.

23. **Q-PM-DOMAIN-ROUTING-001**

   A proposed memory change that affects requirements, architecture, contracts, roadmap, work planning, or another authoritative domain routes through that domain's clarification and Gate before becoming active memory.

24. **Q-PM-SYNOPSIS-001**

   CurrentSynopsis.md is a deterministic compact projection covering the complete active ProjectMemory through included content or exact references and is the first handoff document loaded in a new task.

25. **Q-PM-OPEN-SESSION-001**

   An unconcluded session blocks a new task until it is resumed, concluded from its last checkpoint, or explicitly abandoned with rationale.

26. **Q-PM-CONCURRENCY-001**

   Concurrent worker conclusions bind optimistic baseline versions; the parent rejects or reconciles stale and conflicting candidates before promotion.

27. **Q-PM-CONCLUDE-RECEIPT-001**

   Task completion requires a ConcludeReceipt binding the session, baseline versions, graph checkpoint, update and synopsis digests, Mem0 synchronization status, and resulting checkpoint.

28. **Q-PM-HOST-001**

   ChatGPT/Codex Desktop on Windows hosts ProjectMemory through DevRelay skills, plug-in surfaces, and MCP tools without relying on an undocumented tab-close hook.

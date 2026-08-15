# DevRelay RM-001 RoadmapManagement owner decisions

The project owner resolved every checkpoint-bound RM-001 clarification in one breadth-first clarification wave.

1. **Q-RM-BOUNDARY-001**

   RoadmapManagement is a cross-cutting semantic Module with triage-candidate, review-roadmap, and reprioritize operations.

2. **Q-RM-AUTHORITY-001**

   Detection creates a RoadmapIntakeCandidate only; RoadmapGate alone may approve changes to RoadmapBaseline.

3. **Q-RM-CLARITY-001**

   Potential initiatives use RequirementsGathering breadth-first clarification waves with mandatory 0.99 closure before roadmap disposition.

4. **Q-RM-DISPOSITION-001**

   RoadmapManagement recommends exactly one of keep, defer, merge, or discard, and preserves every disposition for audit.

5. **Q-RM-PRIORITY-001**

   Prioritization uses explicit configurable weights over strategic alignment, user value, urgency, risk reduction, effort range, dependencies, and confidence.

6. **Q-RM-STORAGE-001**

   RoadmapBaseline is the authoritative structured artifact and Roadmap.md is its concise deterministic human-readable projection.

7. **Q-RM-CONTEXT-001**

   Every fresh DevRelay task in the configured project workspace must run DevRelaySessionBootstrap and read compact digest-bound project, roadmap, lifecycle, Gate, and ready-frontier context.

8. **Q-RM-RECEIPT-001**

   Session bootstrap emits a SessionContextReceipt and fails closed on missing, stale, substituted, malformed, or digest-mismatched required context.

9. **Q-RM-REFRESH-001**

   A baseline promotion during a task requires a refreshed context snapshot at the next Module boundary.

10. **Q-RM-EXPLICIT-INPUTS-001**

   Session context never replaces explicit content-addressed ModuleInvocation inputs and never becomes hidden Core or conversational authority.

11. **Q-RM-INITIALIZATION-001**

   A missing roadmap uses an explicit RoadmapNotInitialized disposition and routes to baseline establishment without fabricating an empty roadmap.

12. **Q-RM-ADAPTERS-001**

   The native file contract is authoritative; external planning systems are optional adapters.

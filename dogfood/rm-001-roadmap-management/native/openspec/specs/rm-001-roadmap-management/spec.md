# DevRelay RM-001 RoadmapManagement requirements

- RoadmapManagement is a cross-cutting semantic Module with triage-candidate, review-roadmap, and reprioritize operations.
- Detection creates a RoadmapIntakeCandidate only; RoadmapGate alone may approve changes to RoadmapBaseline.
- Potential initiatives use RequirementsGathering breadth-first clarification waves with mandatory 0.99 closure before roadmap disposition.
- RoadmapManagement recommends exactly one of keep, defer, merge, or discard, and preserves every disposition for audit.
- Prioritization uses explicit configurable weights over strategic alignment, user value, urgency, risk reduction, effort range, dependencies, and confidence.
- RoadmapBaseline is the authoritative structured artifact and Roadmap.md is its concise deterministic human-readable projection.
- Every fresh DevRelay task in the configured project workspace must run DevRelaySessionBootstrap and read compact digest-bound project, roadmap, lifecycle, Gate, and ready-frontier context.
- Session bootstrap emits a SessionContextReceipt and fails closed on missing, stale, substituted, malformed, or digest-mismatched required context.
- A baseline promotion during a task requires a refreshed context snapshot at the next Module boundary.
- Session context never replaces explicit content-addressed ModuleInvocation inputs and never becomes hidden Core or conversational authority.
- A missing roadmap uses an explicit RoadmapNotInitialized disposition and routes to baseline establishment without fabricating an empty roadmap.
- The native file contract is authoritative; external planning systems are optional adapters.

Preserve provider-neutral Core authority, mandatory requirements closure, immutable V0.11 evidence, honest preview labeling, optional domain boundaries, exact recovery semantics, and complete Windows Desktop end-to-end acceptance.

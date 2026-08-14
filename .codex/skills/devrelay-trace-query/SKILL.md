---
name: devrelay-trace-query
description: Answer read-only DevRelay provenance, coverage, and impact questions from TraceabilityGraph. Use for questions such as why code exists, which tests cover an acceptance criterion, what a change affects, which requirements are orphaned, or where evidence is missing.
---

# DevRelay Trace Query

1. Load the exact TraceabilityGraph checkpoint and its artifact digest. Do not use conversational memory as graph state.
2. Normalize the question into one read-only operation: provenance, coverage, impact, orphan, unscoped-work, or missing-evidence.
3. Resolve stable artifact or node identities. If an identity is ambiguous, return clarification candidates without guessing.
4. Query deterministic forward or reverse paths with an explicit horizon and maximum result count.
5. Return a compact answer first: conclusion, path, authority and scope of each fact, checkpoint digest, and any horizon limitation.
6. Link canonical artifacts and evidence. Distinguish planned-by relationships from implemented-by, realized-by, and verified-by facts.
7. State unknown when no approved path exists. Candidate observations must never be presented as approved facts.
8. Never create nodes, edges, approvals, readiness decisions, or workflow transitions.

Use the full edge list only when requested; the default result should be human-readable and concise. Core retains all graph mutation, Gate, readiness, and progression authority.

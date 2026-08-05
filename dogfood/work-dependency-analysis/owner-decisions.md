# WorkDependencyAnalysis owner decisions

The product owner approved decisions 1, 2, and 4 from the original clarification request, refined decision 3, and replaced decision 5. Because decisions 3 and 5 are outside the checkpointed closed choice set, this record authorizes a fresh superseding RequirementsGathering change invocation; it does not mutate or falsely complete the prior continuation.

1. **Q-WDA-OPERATION-LIFECYCLE-001**

   Use one full-snapshot analyze-dependencies operation for every exact WorkBreakdownBaseline.

2. **Q-WDA-TRUST-BOUNDARY-001**

   A proposer returns a candidate; trusted Core validates graph mechanics; WorkDependencyGate verifies semantic completeness and owns promotion.

3. **Q-WDA-INPUT-CONTEXT-001**

   Supply the full immutable candidate work-breakdown snapshot plus only declared relevant context slices, each pinned to an exact artifact version, content digest, or repository commit.

4. **Q-WDA-PARALLELISM-001**

   Persist only the authoritative DAG; downstream runtime state derives the runnable frontier.

5. **Q-WDA-PLUGIN-SURFACE-001**

   Use a native structured proposer, OPA policy evaluation, Graphology-DAG for Core-owned graph mechanics, Spec Kit as a consistency reviewer, and optional Task Master or OpenSpec proposal adapters.

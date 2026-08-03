# WorkDependencyAnalysis RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable requirements candidate exists, and ArchitectureDesign is blocked until every question below is answered.

1. **Should WorkDependencyAnalysis expose one analyze-dependencies operation that recomputes a complete graph for each exact WorkBreakdownBaseline, or separate establish and change operations?**

   - One full-snapshot analyze-dependencies operation (recommended)
   - Separate establish-dependencies and analyze-change operations

   Why it matters: This determines routing, baseline evolution, change semantics, and whether stale dependency state can accumulate.

2. **Which boundary should own dependency proposals, graph mechanics, semantic completeness, and authoritative promotion?**

   - Adapter proposes; trusted Core validates mechanics; WorkDependencyGate verifies semantic completeness and promotes (recommended)
   - Core derives dependencies only from explicit WorkBreakdown hints
   - Adapter returns the final authoritative dependency graph

   Why it matters: Graph mechanics are deterministic, but an untrusted analyzer cannot prove by omission that no semantic dependency is missing.

3. **What exact context should the analyzer receive in addition to WorkBreakdownBaseline and ProjectOverviewBaseline?**

   - Exact requirements, architecture, contract disposition, repository context, and versioned DependencyPolicy, coherence-checked against WorkBreakdown (recommended)
   - Only WorkBreakdownBaseline and ProjectOverviewBaseline
   - Let each adapter request undeclared context as needed

   Why it matters: Acceptance criteria, architecture boundaries, contracts, repository structure, and explicit policy can reveal dependencies absent from terse work-item hints.

4. **Should WorkDependencyAnalysis store execution waves, or only the DAG from which a later scheduler derives the runnable frontier?**

   - Store the DAG only; derive runnable frontiers downstream (recommended)
   - Store the DAG plus canonical parallel execution waves

   Why it matters: Persisted waves become stale when runtime capacity or completion state changes and blur analysis with scheduling.

5. **Which bounded dependency-analysis plug-ins should V1 define?**

   - SpecKitAnalyzeAdapter plus an OpenSpec custom dependency-artifact adapter (recommended)
   - Provider-neutral adapter contract and deterministic validator only in V1
   - Reuse existing task-generation adapters without a new bounded capability

   Why it matters: Spec Kit has dependency-ordered tasks and read-only cross-artifact analysis; default OpenSpec tasks lack a formal item-level DAG, so an OpenSpec binding needs a custom DevRelay artifact schema.

## Upstream capability evidence

- Spec Kit documents dependency-ordered tasks, parallel markers, and read-only cross-artifact analysis: https://github.github.com/spec-kit/reference/agentic-sdd.html
- OpenSpec supports custom artifact schemas, while current conventions allow dependency order to remain proposal prose until formal stacking metadata exists: https://github.com/Fission-AI/OpenSpec/blob/main/openspec/specs/openspec-conventions/spec.md

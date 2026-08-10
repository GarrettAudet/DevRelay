# SpecialistAssignment RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and SpecialistAssignment architecture and implementation are blocked until every question below is answered.

1. **Should SpecialistAssignment assign every approved work item or only work in the current ready DAG frontier?**

   - Assign every approved work item, not only the current ready frontier (recommended)
   - Assign only the current ready frontier

   Why it matters: Assignment intent is stable planning data, while readiness is dynamic runtime state derived by Core.

2. **How many specialist profiles may be assigned to one work item in V1?**

   - Exactly one provider-neutral specialist profile per work item (recommended)
   - One or more collaborating profiles per work item

   Why it matters: A fixed cardinality keeps the handoff deterministic and avoids introducing collaboration orchestration into assignment.

3. **Which boundary owns profile eligibility and ranking?**

   - Core enforces hard capability, tool, grant, and policy constraints; a replaceable ranker chooses only among eligible profiles (recommended)
   - The configured ranker owns both eligibility and ranking

   Why it matters: Replaceable ranking is useful, but an extension cannot bypass required capabilities, tools, grants, or policy.

4. **What happens when one approved work item has no eligible specialist profile?**

   - Any unassignable work item blocks the complete candidate with needs-clarification; no partial baseline in V1 (recommended)
   - Promote assignments for eligible items and defer the rest

   Why it matters: Partial promotion could let an incomplete work plan reach execution.

5. **Should SpecialistAssignment also schedule work, choose concrete AI models or humans, execute work, or modify the dependency DAG?**

   - Scheduling, availability, concrete runtime or model binding, execution, and DAG modification remain downstream (recommended)
   - Include runtime binding and scheduling in SpecialistAssignment

   Why it matters: Those effects belong to Core frontier control or WorkExecution rather than profile assignment.

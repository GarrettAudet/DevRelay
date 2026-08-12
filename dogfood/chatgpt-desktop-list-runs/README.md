# ChatGPT Desktop list-runs clean feature run

This package is the active, cumulative DevRelay dogfood run for the first real
bounded feature built through the controlled ChatGPT Desktop on Windows
release path.

## Goal

Add a read-only `devrelay_list_runs` command that discovers persisted runs in
the current local store without exposing source, prompts, credentials, or raw
evidence.

## Approved product decisions

- Return newest runs first, using run identity as the deterministic tie-breaker.
- Use bounded pagination with a default page size of 50.
- Return run identity, revision, lifecycle state, checkpoint, recovery state,
  and timestamps only.
- Report unreadable or corrupt runs without modifying them.
- Keep the operation local to the current configured project/store.
- Run ContractGeneration because this adds a public Desktop MCP command.

## Required circuit

1. RequirementsGathering -> RequirementsGate
2. ArchitectureDiscovery (deterministically not applicable: baseline exists)
3. ArchitectureDesign -> ArchitectureGate
4. ContractGeneration -> ContractGate
5. WorkBreakdown -> WorkBreakdownGate
6. WorkDependencyAnalysis -> WorkDependencyGate
7. SpecialistAssignment -> SpecialistAssignmentGate
8. Repeat WorkExecution -> WorkItemVerification -> ChangeIntegration for each
   Core-derived ready frontier
9. SystemVerification -> BusinessAcceptance

No implementation work is authorized by this package until the planning
baselines and assignment Gate identify the exact runnable frontier.

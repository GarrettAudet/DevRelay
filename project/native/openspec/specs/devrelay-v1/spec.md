# DevRelay V1 lifecycle specification

## Required lifecycle

- RequirementsGathering: module; required
- RequirementsGate: gate; required
- ArchitectureDiscovery: module; conditional
- ArchitectureDesign: module; required
- ArchitectureGate: gate; required
- ContractGeneration: module; conditional
- WorkBreakdown: module; required
- WorkDependencyAnalysis: module; required
- SpecialistAssignment: module; required
- WorkExecution: module; required
- WorkItemVerification: module; required
- ChangeIntegration: module; required
- SystemVerification: module; required
- BusinessAcceptance: module; required

## Invariants

- DevRelay owns deterministic routing, contracts, gates, evidence, traceability, and progression.
- Adapters expose bounded replaceable capabilities and never own workflow or graph authority.
- ProjectOverview.md is generated from the approved structured pair and is passed explicitly to downstream modules.

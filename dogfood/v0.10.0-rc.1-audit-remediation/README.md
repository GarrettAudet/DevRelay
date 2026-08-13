# v0.10.0-rc.1 audit-remediation dogfood

This directory preserves the human-readable and structured evidence for the
DevRelay circuit used to remediate the independent release audit.

```text
RequirementsGathering -> RequirementsGate -> ArchitectureDiscovery
-> ArchitectureDesign -> ArchitectureGate -> ContractGeneration
-> ContractGate -> WorkBreakdown -> WorkBreakdownGate
-> WorkDependencyAnalysis -> WorkDependencyGate -> SpecialistAssignment
-> SpecialistAssignmentGate -> WorkExecution -> WorkItemVerification
-> ChangeIntegration -> SystemVerification -> BusinessAcceptance
```

Traceability updates run alongside the circuit and never grant plug-in or Gate
authority. The first fifteen numbered records are materialized. The final three
records are added only when their exact integration, verification, and
acceptance evidence exists.

The run uses the approved bounded roles: OpenSpec requirements/design
contracts, native offline discovery, Structurizr already-designed disposition,
MADR decisions, native work proposal, Graphology-DAG, OPA policy, Spec Kit
consistency review, A2A profile discovery, and the native deterministic ranker.
No fixture-conformant adapter is presented as live upstream CLI evidence.

Current result: four implementation items are verified and integrated in `a8deb6b2616c55da735e517da723f91f851926d9`. The release item
remains dependent on the full release gate, protected-main integration,
annotated tag, GitHub prerelease, and clean Windows install from the released
tarball. `LifecycleRunReport.md` is the primary readable projection;
`lifecycle-checkpoint.json` identifies the exact resumable frontier.

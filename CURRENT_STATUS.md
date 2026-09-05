# DevRelay current implementation status

Last reconciled: 2026-09-06 CST
Protected branch: main
Released version: 0.10.0-rc.3
Candidate version: 0.11.0-rc.1
Canonical handoff baseline: main @ 57459b6d10da277c85e1396343cdb989fd5a9e54
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT/Codex Desktop on Windows

## Status

DO-001 is the active release-candidate increment. Its paired RequirementsBaseline and ProjectOverviewBaseline are promoted at version 2.5.0. The implementation includes deterministic dependency-frontier scheduling, provider-neutral Desktop task bindings, durable SQLite-backed Git worktree leases, fail-closed restart reconciliation, policy-driven independent adversarial review, merge-readiness conflict escalation, a deterministic operator snapshot, and a validated ChatGPT Desktop plug-in with automatic ProjectMemory lifecycle hooks.

The implementation remains a host/plug-in layer above the released lifecycle. Hooks and task adapters cannot select readiness, approve Gates, verify their own work, integrate changes, mutate TraceabilityGraph, or promote semantic memory. New or changed unmanaged hooks require explicit trust in the Desktop `/hooks` interface.

DevRelay `v0.10.0-rc.3` is published as a public GitHub prerelease from protected-main tag commit `dc0f4094ce0e178757984e363836d05cfcc0037d`. Its exact workflow-produced catalog, tarball, CycloneDX SBOM, and checksum ledger were independently hash-verified before publication; no asset was rebuilt or substituted.

The publication automation defect is fixed and integrated through PR #13 at protected-main commit `d17bc7dada964c3b669c29407cdabfbfe37c2651`. Canonical-main verify run `32592205364`, CodeQL run `32592205360`, and scorecard run `32592205344` all passed. The publisher now supplies explicit repository identity in the no-checkout job, with regression coverage preventing ambient-Git inference from returning.

ProjectMemory `/conclude` promoted baseline 1.0.3 (`sha256:adf6829dce8a18b27bad2b30c7d4c18f3c557d052a103c96d408847ff0cae6ac`), added the exact published-release status, retained ReleasePreparation as the approved next action, regenerated `CurrentSynopsis.md`, and proved fresh-task first-load plus zero-call replay.

The conclusion package was integrated through PR #14 at protected-main commit `57459b6d10da277c85e1396343cdb989fd5a9e54`. Canonical-main verify run `32594735309`, CodeQL run `32594735306`, and scorecard run `32594735329` all passed. There are no remaining blockers for the scoped `v0.10.0-rc.3` GitHub source/library release.

## Lifecycle

RequirementsGathering / RequirementsGate                  no-change continuation; existing release requirement applies
Architecture / Contract checks                            no change required
WorkBreakdown / WorkDependencyAnalysis                    one configuration change + one test change; acyclic
SpecialistAssignment                                      release-automation maintainer profile
WorkExecution                                             implemented at c4c45ceaced6012bb9631f1dd09354865e00df52
WorkItemVerification                                      focused 2/2 and pre-integration system 1,103/1,101/0/2 passed
ChangeIntegration                                         PR #13 merged at d17bc7dada964c3b669c29407cdabfbfe37c2651
SystemVerification                                        canonical main verify, CodeQL, and scorecard passed
BusinessAcceptance                                        controlled release remains accepted
ProjectMemory /conclude                                   passed; baseline 1.0.3 and fresh-task replay verified
Conclusion integration                                   PR #14 merged at 57459b6d10da277c85e1396343cdb989fd5a9e54
Canonical conclusion verification                        verify, CodeQL, and scorecard passed

## Published evidence

- Release: https://github.com/GarrettAudet/DevRelay/releases/tag/v0.10.0-rc.3
- Protected-main release tag commit: `dc0f4094ce0e178757984e363836d05cfcc0037d`
- Automation follow-up protected-main commit: `d17bc7dada964c3b669c29407cdabfbfe37c2651`
- Release workflow run: `32573676370`
- Canonical-main verify / CodeQL / scorecard: `32592205364` / `32592205360` / `32592205344`
- Release catalog: `sha256:30ebabeb56d1c1ca67222bdc72d2ebaf564ea6fd4b8c2f993d80092070c68564`
- Installable tarball: `sha256:2fbe981e32cb67cefaca95294ce6f56081db746bca185c098cea00704fa65fff`
- CycloneDX SBOM: `sha256:465aa7a123569cea58a772029b03e0e53b8f0ecc21f7627950e791345cf5dc66`
- SHA-256 ledger: `sha256:ce59ca6e6a4a7b02c1d6b245e967e3b9993e4075e99cd0168ac73d4887d8fb73`
- ProjectMemory conclude receipt: `sha256:83e841b9b966fdddce30d6d1534f3b3cfde64f87480ce3d03e287d550567e209`
- Conclusion promotion: PR #14, protected-main commit `57459b6d10da277c85e1396343cdb989fd5a9e54`
- Conclusion canonical-main verify / CodeQL / scorecard: `32594735309` / `32594735306` / `32594735329`

## Next product increment

Begin the kept `ReleasePreparation and ReleaseVerification` roadmap initiative (`RI-98EA0256A27DEFF2`) through a visible RequirementsGathering interview. The roadmap decision prioritizes the initiative but does not replace RequirementsGate closure or authorize implementation by itself. After requirements promotion, run the full released DevRelay circuit and require accepted EnvironmentPreparation readiness receipts before execution.

This release does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support.

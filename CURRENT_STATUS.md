# DevRelay current implementation status

Last reconciled: 2026-09-06 CST
Protected branch: main
Released version: 0.10.0-rc.3
Candidate version: 0.11.0-rc.1
Candidate implementation seal: d75933d50f99368cbfc3eff3a0c4d4bcaa30feb3
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT/Codex Desktop on Windows

## Status

DO-001 is construction-complete and owner-accepted for the controlled `0.11.0-rc.1` release-candidate boundary. Its paired RequirementsBaseline and ProjectOverviewBaseline are promoted at version 2.5.0. The implementation includes deterministic dependency-frontier scheduling, provider-neutral Desktop task bindings, durable SQLite-backed Git worktree leases, fail-closed restart reconciliation, policy-driven independent adversarial review, merge-readiness conflict escalation, a deterministic operator snapshot, and a validated ChatGPT Desktop plug-in with automatic ProjectMemory lifecycle hooks.

The implementation remains a host/plug-in layer above the released lifecycle. Hooks and task adapters cannot select readiness, approve Gates, verify their own work, integrate changes, mutate TraceabilityGraph, or promote semantic memory. The personal `devrelay-desktop@personal` plug-in is installed and enabled at `0.1.0`; new or changed unmanaged hooks still require explicit trust in the Desktop `/hooks` interface.

Canonical verification passed 1,163 tests with 1,161 passing, zero failures, and two intentional skips. The release catalog verified 11,291 exact repository digests and 413 exact package paths; the isolated tarball consumer imported all 202 export targets. Installed hook execution proved startup context injection, durable checkpointing, candidate-only conclusion, restart recovery, and post-conclusion bootstrap from ProjectMemory 1.0.4.

DevRelay `v0.10.0-rc.3` is published as a public GitHub prerelease from protected-main tag commit `dc0f4094ce0e178757984e363836d05cfcc0037d`. Its exact workflow-produced catalog, tarball, CycloneDX SBOM, and checksum ledger were independently hash-verified before publication; no asset was rebuilt or substituted.

The publication automation defect is fixed and integrated through PR #13 at protected-main commit `d17bc7dada964c3b669c29407cdabfbfe37c2651`. Canonical-main verify run `32592205364`, CodeQL run `32592205360`, and scorecard run `32592205344` all passed. The publisher now supplies explicit repository identity in the no-checkout job, with regression coverage preventing ambient-Git inference from returning.

ProjectMemory `/conclude` has now promoted baseline 1.0.4 (`sha256:d539f7aa8abe10b10b586a5071d07507bc5d1ff7860fceb7e87864ac70d5261d`), added the accepted Desktop orchestration boundary and exact DO-001 release-ready status, superseded the completed ReleasePreparation next action, regenerated `CurrentSynopsis.md`, and proved fresh-task recovery through both the runtime and installed Desktop hook.

The conclusion package was integrated through PR #14 at protected-main commit `57459b6d10da277c85e1396343cdb989fd5a9e54`. Canonical-main verify run `32594735309`, CodeQL run `32594735306`, and scorecard run `32594735329` all passed. There are no remaining blockers for the scoped `v0.10.0-rc.3` GitHub source/library release.

## Lifecycle

RequirementsGathering / RequirementsGate                  promoted paired project baseline 2.5.0
ArchitectureDiscovery                                     deterministic skip; current repository inventory sufficient
ArchitectureDesign / ArchitectureGate                     cross-cutting host layer approved without Core authority changes
ContractGeneration / ContractGate                         Desktop artifact contract generated and approved
WorkBreakdown / WorkDependencyAnalysis                    nine deliverables in five acyclic frontiers
SpecialistAssignment                                      bounded implementation, verification, release, and documentation roles
WorkExecution                                             sealed at d75933d50f99368cbfc3eff3a0c4d4bcaa30feb3
WorkItemVerification                                      independent adversarial policy plus focused and canonical tests passed
ChangeIntegration                                         two-phase Git seal; no ambiguous conflicts
SystemVerification                                        18/18 acceptance criteria and 5/5 NFRs passed
BusinessAcceptance                                        owner-approved for controlled 0.11.0-rc.1 boundary
ProjectMemory /conclude                                   passed; baseline 1.0.4 and installed-hook fresh-task recovery verified

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

Merge the two-phase DO-001 seal and publish `0.11.0-rc.1` as the controlled GitHub source/installable-tarball prerelease. Public npm publication and managed one-click plug-in distribution remain outside this release boundary.

This release does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support.

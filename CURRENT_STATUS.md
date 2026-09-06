# DevRelay current implementation status

Last reconciled: 2026-09-06 CST
Protected branch: main
Released version: 0.10.0-rc.3
Candidate version: 0.11.0-rc.1
Candidate implementation seal: 25f6897670797ff472db1f922344735d3c03dfb0
Accepted memory evidence seal: 67cfd9caf9186c81fa415ae839f8720d7931b738
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT/Codex Desktop on Windows

## Status

DO-001 is construction-complete and owner-accepted for the controlled `0.11.0-rc.1` release-candidate boundary. Its paired RequirementsBaseline and ProjectOverviewBaseline are promoted at version 2.6.0. The implementation includes deterministic dependency-frontier scheduling, provider-neutral Desktop task bindings, durable SQLite-backed Git worktree leases, fail-closed restart reconciliation, policy-driven independent adversarial review, merge-readiness conflict escalation, a deterministic operator snapshot, and a validated ChatGPT Desktop plug-in with mandatory repository-triggered ProjectMemory bootstrap.

The implementation remains a host/plug-in layer above the released lifecycle. The plug-in and task adapters cannot select readiness, approve Gates, verify their own work, integrate changes, mutate TraceabilityGraph, or promote semantic memory. The personal `devrelay-desktop@personal` plug-in is installed and enabled at `0.1.1+codex.20260906044519`. ChatGPT Desktop project instructions plus the managed task prompt are the supported startup boundary; no undeclared automatic hook is claimed.

Final canonical verification passed 1,169 tests with 1,167 passing, zero failures, and two intentional skips. Independent adversarial review closed both P1 findings: task plans now require exact loader-prepared or freshly revalidated ProjectMemory context, and approved review projection binds the exact task plan, run, work item, implementer, reviewer, and subject digest.

The regenerated `0.11.0-rc.1` release catalog verifies 11,360 exact repository digests and 415 exact npm-package paths, covering 13 active Modules, 26 active plug-ins, one compatibility Module, and two compatibility plug-ins.

DevRelay `v0.10.0-rc.3` is published as a public GitHub prerelease from protected-main tag commit `dc0f4094ce0e178757984e363836d05cfcc0037d`. Its exact workflow-produced catalog, tarball, CycloneDX SBOM, and checksum ledger were independently hash-verified before publication; no asset was rebuilt or substituted.

The publication automation defect is fixed and integrated through PR #13 at protected-main commit `d17bc7dada964c3b669c29407cdabfbfe37c2651`. Canonical-main verify run `32592205364`, CodeQL run `32592205360`, and scorecard run `32592205344` all passed. The publisher now supplies explicit repository identity in the no-checkout job, with regression coverage preventing ambient-Git inference from returning.

ProjectMemory `/conclude` has promoted baseline 1.0.6 (`sha256:5437e51a8bfd2382134761d9b33ad6716e57aef23a13cc02bd3ae0aa533db2e8`). A pristine ChatGPT Desktop worktree at evidence commit `0c6c812eea81ab2b7cbfbf5ce7b7b57aaca17f8b`, with no `node_modules`, recovered the undisclosed marker `MEMORY-PROBE-20260906-B` from the exact baseline on its first command. The final live-read evidence is sealed at `67cfd9caf9186c81fa415ae839f8720d7931b738`.

The conclusion package was integrated through PR #14 at protected-main commit `57459b6d10da277c85e1396343cdb989fd5a9e54`. Canonical-main verify run `32594735309`, CodeQL run `32594735306`, and scorecard run `32594735329` all passed. There are no remaining blockers for the scoped `v0.10.0-rc.3` GitHub source/library release.

## Lifecycle

RequirementsGathering / RequirementsGate                  promoted paired project baseline 2.6.0
ArchitectureDiscovery                                     deterministic skip; current repository inventory sufficient
ArchitectureDesign / ArchitectureGate                     cross-cutting host layer approved without Core authority changes
ContractGeneration / ContractGate                         Desktop artifact contract generated and approved
WorkBreakdown / WorkDependencyAnalysis                    nine deliverables in five acyclic frontiers
SpecialistAssignment                                      bounded implementation, verification, release, and documentation roles
WorkExecution                                             final remediation sealed at 25f6897670797ff472db1f922344735d3c03dfb0
WorkItemVerification                                      independent adversarial policy plus focused and canonical tests passed
ChangeIntegration                                         evidence sealed at 0c6c812e and 67cfd9ca; no ambiguous conflicts
SystemVerification                                        1,169 canonical tests; 1,167 pass, zero fail, two intentional skips
BusinessAcceptance                                        owner-approved for controlled 0.11.0-rc.1 boundary
ProjectMemory /conclude                                   passed; baseline 1.0.6 and first-command fresh-worktree recovery verified

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

# DevRelay current implementation status

Last reconciled: 2026-09-06 CST
Protected branch: main
Released version: 0.11.0-rc.1
Candidate version: none selected
Candidate implementation seal: 25f6897670797ff472db1f922344735d3c03dfb0
Accepted memory evidence seal: 67cfd9caf9186c81fa415ae839f8720d7931b738
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT/Codex Desktop on Windows

## Status

DO-001 is published in the controlled `v0.11.0-rc.1` GitHub source/installable-library prerelease. PR #19 passed all 11 checks and was integrated through the protected pull-request path at main commit `08be8385966223d16a20150ac804505b5fe40153`. Its paired RequirementsBaseline and ProjectOverviewBaseline remain promoted at version 2.6.0. The implementation includes deterministic dependency-frontier scheduling, provider-neutral Desktop task bindings, durable SQLite-backed Git worktree leases, fail-closed restart reconciliation, policy-driven independent adversarial review, merge-readiness conflict escalation, a deterministic operator snapshot, and a validated ChatGPT Desktop plug-in with mandatory repository-triggered ProjectMemory bootstrap.

The implementation remains a host/plug-in layer above the released lifecycle. The plug-in and task adapters cannot select readiness, approve Gates, verify their own work, integrate changes, mutate TraceabilityGraph, or promote semantic memory. The personal `devrelay-desktop@personal` plug-in is installed and enabled at `0.1.1+codex.20260906044519`. ChatGPT Desktop project instructions plus the managed task prompt are the supported startup boundary; no undeclared automatic hook is claimed.

Final canonical verification passed 1,169 tests with 1,167 passing, zero failures, and two intentional skips. Independent adversarial review closed both P1 findings: task plans now require exact loader-prepared or freshly revalidated ProjectMemory context, and approved review projection binds the exact task plan, run, work item, implementer, reviewer, and subject digest.

The published `0.11.0-rc.1` release catalog verifies 11,360 exact repository digests and 415 exact npm-package paths, covering 13 active Modules, 26 active plug-ins, one compatibility Module, and two compatibility plug-ins. Release workflow `34034582831` passed both the build/verification job and the independent prerelease-creation job.

DevRelay `v0.10.0-rc.3` is published as a public GitHub prerelease from protected-main tag commit `dc0f4094ce0e178757984e363836d05cfcc0037d`. Its exact workflow-produced catalog, tarball, CycloneDX SBOM, and checksum ledger were independently hash-verified before publication; no asset was rebuilt or substituted.

The publication automation defect is fixed and integrated through PR #13 at protected-main commit `d17bc7dada964c3b669c29407cdabfbfe37c2651`. Canonical-main verify run `32592205364`, CodeQL run `32592205360`, and scorecard run `32592205344` all passed. The publisher now supplies explicit repository identity in the no-checkout job, with regression coverage preventing ambient-Git inference from returning.

ProjectMemory `/conclude` has promoted baseline 1.0.7 (`sha256:14ebd552fc35250c9c38679ef517e7ce8706c3f741e614a405acdf5d0a1016d2`). It records the exact protected-main tag, release workflow, and four published asset digests. Fresh-task native recovery and zero-call replay both recovered the newly published release record. The earlier pristine-worktree proof for marker `MEMORY-PROBE-20260906-B` remains retained evidence of the dependency-free Desktop bootstrap.

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
ProjectMemory /conclude                                   passed; baseline 1.0.7, published-release recovery, and zero-call replay verified

## Published evidence

- Release: https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.1
- Release pull request: https://github.com/GarrettAudet/DevRelay/pull/19
- Protected-main release tag commit: `08be8385966223d16a20150ac804505b5fe40153`
- Release workflow run: `34034582831`
- Pull-request checks: 11 passed, zero failed
- Release catalog: `sha256:552287936dcf3e15f5fd4989324bdae579fccefff5c74e74b28d70c8a45f96b6`
- Installable tarball: `sha256:1f9b3fab7ceb325d96e6722f3a6e88b2fcc6a5e41229efdb1d3ad5486ce18b99`
- CycloneDX SBOM: `sha256:140141370fce70b72844947d3976d6441ce3e781ea8bd58ff17bf783da6de7a8`
- SHA-256 ledger: `sha256:28d6a30d112adf7dbd3a3fa29599a05ee6c84c504ea764b727063b1bd07d1e42`
- ProjectMemory conclude receipt: `sha256:3bb4e40e26605edb4b5cd42577d660d6b148a9f9486f1d29cca18eca85dc7da8`

## Next product increment

Run RoadmapManagement against the current approved project baselines before selecting another owner-approved product increment. The publication conclusion records this as a pending roadmap-domain change instead of allowing ProjectMemory Gate to choose new product scope.

This release does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support.

# DevRelay current implementation status

Last reconciled: 2026-08-22 MDT
Protected branch: main
Released version: 0.10.0-rc.3
Active branch: codex/v0.10.0-rc.3-release-conclusion
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT/Codex Desktop on Windows

## Status

DevRelay `v0.10.0-rc.3` is published as a public GitHub prerelease from protected-main tag commit `dc0f4094ce0e178757984e363836d05cfcc0037d`. Its exact workflow-produced catalog, tarball, CycloneDX SBOM, and checksum ledger were independently hash-verified before publication; no asset was rebuilt or substituted.

The publication automation defect is fixed and integrated through PR #13 at protected-main commit `d17bc7dada964c3b669c29407cdabfbfe37c2651`. Canonical-main verify run `32592205364`, CodeQL run `32592205360`, and scorecard run `32592205344` all passed. The publisher now supplies explicit repository identity in the no-checkout job, with regression coverage preventing ambient-Git inference from returning.

ProjectMemory `/conclude` promoted baseline 1.0.3 (`sha256:adf6829dce8a18b27bad2b30c7d4c18f3c557d052a103c96d408847ff0cae6ac`), added the exact published-release status, retained ReleasePreparation as the approved next action, regenerated `CurrentSynopsis.md`, and proved fresh-task first-load plus zero-call replay.

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

## Next gate

Seal and promote the ProjectMemory 1.0.3 conclusion through protected main. After canonical verification, begin ReleasePreparation and ReleaseVerification through RequirementsGathering and the full released circuit.

This release does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support.
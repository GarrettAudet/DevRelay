# DevRelay current implementation status

Last reconciled: 2026-08-22 MDT
Protected branch: main
Candidate: 0.10.0-rc.3
Increment: EP-001 EnvironmentPreparation
Branch: codex/ep-001-environment-preparation
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT Desktop on Windows

## Status

EP-001 is complete through SystemVerification, BusinessAcceptance, RoadmapManagement, and /conclude. All nine approved work items are verified and integrated. A SystemVerification-discovered traceability compatibility defect was routed back through WorkExecution, WorkItemVerification, and ChangeIntegration. The final branch-tip gate then exposed two stale exact-version release assertions; those were independently repaired through the same execution, verification, and integration loop. GitHub CodeQL subsequently found a check-then-read filesystem race in the Windows E2E adapter. The race-safe direct read, focused regression, installed-package evidence, acceptance, and memory were processed through a third WorkExecution, WorkItemVerification, and ChangeIntegration repair loop.

The installed-package Windows Desktop scenario proves native host and project inventory, controlled remediation, capability-gated project-local effects, exact approvals, rollback metadata, single-use readiness receipts, zero-call checkpoint replay, drift detection before execution, blocked progression, approved recovery, resumed execution, telemetry, and forward-only traceability. The package contains 390 files and was installed offline from the exact tarball digest.

SystemVerification covers 175 acceptance criteria and 46 NFRs. BusinessAcceptance covers 20 objectives, 28 success metrics, and 55 business-scope identities. The acceptance graph is revision 33 with zero blocking diagnostics.

ProjectMemory /conclude promoted baseline 1.0.2 and regenerated CurrentSynopsis.md. A fresh-task proof loads CurrentSynopsis, the exact baseline, and bounded traceability context in that order; replay invokes zero providers. RoadmapManagement separately promoted ReleasePreparation and ReleaseVerification as the next kept initiative. Its detailed implementation remains gated on its own future RequirementsGathering.

## Lifecycle

RequirementsGathering -> RequirementsGate                 complete
ArchitectureDesign -> ArchitectureGate                    complete
ContractGeneration -> ContractGate                        complete
WorkBreakdown -> WorkBreakdownGate                        complete
WorkDependencyAnalysis -> WorkDependencyGate              complete
SpecialistAssignment -> SpecialistAssignmentGate          complete
EnvironmentPreparation / EnvironmentVerificationGate      complete
WorkExecution / WorkItemVerification / ChangeIntegration  complete (9 items + 3 repair retries)
SystemVerification                                        verified
BusinessAcceptance                                        accepted
RoadmapManagement -> RoadmapGate                           next initiative promoted
ProjectMemory /conclude                                   concluded
Evidence seal and protected-main promotion                implementation/evidence commit verified; final seal and remote gates pending

## Exact evidence

- Superseded pre-CodeQL seal: 97ded63e90b4d21b4f2d5dc7e7e08fe408603654
- Verified implementation/evidence commit: 1e3933f1aaa0ab1c667ad5093e1e6e35d3d4dbbc
- Integrated security-repair lineage: b9adbeaa68b24725b8d8dad611e9735bac277791
- Release evidence: sha256:dd056f10a2a44feb36f6f1590a3fef9f821e96b3dbf7c864fe050b4ba44e76ef
- SystemVerification: sha256:3cc9d0abe064043c2a5bd88433420b88c8c4e889f73b42d2d3f4fe879c75baea
- BusinessAcceptance: sha256:6fa3030ca873b1b46c3901ba9ce5aebe8a60515031259a7d411de3760043b5f2
- Acceptance graph: sha256:78ebf1ae09669400a7441c5b0e2b0ddabfc24780f3103083bf1af31cdd90582f
- ProjectMemory baseline: sha256:cdf7f3672a461a736773f7e82c554d532ab2209ab466e8dba65ee6061cdb2546
- CurrentSynopsis: sha256:2ea64c1be6a86093c691f5fe248f2732788597de206a1725f073168a1b47bb95
- /conclude receipt: sha256:7cef1a3260bee992cb4b77cf6c74980023a2d8466f7b6cc99ce5e0d44af8a3b5
- Windows installed-package receipt: sha256:513f922a4daa0ffef1cadd824669d152e24063b5aa3c7a619484a21883d1e91b
- Roadmap baseline: sha256:7f69318a8a1adc0d2da26bbb7668893da3ea91f55872c9446a4cf0179ef9a60c
- RoadmapGate proof: sha256:e487f836d17b105da4c815325f40a125ee1fd4a49722dc5568bcfabc1919ed52

## Promotion rule and next work

The CodeQL repair is independently verified and integrated at `b9adbeaa68b24725b8d8dad611e9735bac277791`. The exact implementation/evidence tree is committed at `1e3933f1aaa0ab1c667ad5093e1e6e35d3d4dbbc`; its authoritative release check passed 1,103 tests (1,101 passed, 0 failed, 2 intentional skips), 10,020 catalog digests, 390 package paths, and 193 installed exports. Final status/catalog sealing and the second exact-tree release check remain mandatory before push. Protected main remains the merge authority.

The next product increment is ReleasePreparation and ReleaseVerification. It must begin by loading ProjectMemory, then run RequirementsGathering and the complete currently released DevRelay circuit. This candidate does not claim public npm publication, a one-click Desktop plug-in, a hosted backend, or non-Windows support.
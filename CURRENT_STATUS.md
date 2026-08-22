# DevRelay current implementation status

Last reconciled: 2026-08-22 MDT
Protected branch: main
Candidate: 0.10.0-rc.3
Increment: EP-001 EnvironmentPreparation
Branch: codex/ep-001-main-provenance-reconciliation
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT Desktop on Windows

## Status

EP-001 is complete through SystemVerification, BusinessAcceptance, RoadmapManagement, and `/conclude`. All nine approved work items are verified and integrated. Four evidence-backed defects found during finalization were routed through the released WorkExecution, WorkItemVerification, and ChangeIntegration loop: traceability endpoint closure, stale baseline assertions, a CodeQL filesystem race, and protected-main rebase provenance portability.

PR #11 passed CodeQL, dependency review, and all four Node/OS matrix jobs before protected `main` accepted the linear-history rebase at `a9cb936f894a5ddbb86d26b31a5b3b4a61e2a9f4`. The subsequent canonical-main matrix correctly exposed one release-verifier assumption: it required the original two-phase evidence commit IDs to remain in ancestry even when GitHub had rewritten them without changing either approved tree. The repaired verifier preserves the original approved pair and accepts only one unique, direct-parent, tree-and-subject-equivalent pair in canonical ancestry.

The original V0.11 pair maps deterministically to protected main:

- Implementation `868c00e2dc8c0d610d919dbc68256bab9d0e6ca2` -> `fe8181766a9340e8a64033752d33ee76453b66d8`; identical tree `36e9877f455c224296c5ba14b77d1f22375018c4`.
- Evidence seal `3374e75e4342efde0e395855a85600ed6614b4a8` -> `3257e3086675581f0399c3a4603adde9e6a00255`; identical tree `f7914ec112d8192aaa86105428f8e35d00514b65` and direct parent preserved.

The focused provenance, Windows E2E, acceptance, and ProjectMemory regression passed 17/17. Regenerated SystemVerification covers 175 acceptance criteria and 46 NFRs. BusinessAcceptance covers 20 objectives, 28 success metrics, and 55 business-scope identities. TraceabilityGraph is revision 35 with zero blocking diagnostics. ProjectMemory `/conclude` refreshed the durable baseline and proved a zero-provider-call fresh-task replay.

## Lifecycle

RequirementsGathering -> RequirementsGate                 complete
ArchitectureDesign -> ArchitectureGate                    complete
ContractGeneration -> ContractGate                        complete
WorkBreakdown -> WorkBreakdownGate                        complete
WorkDependencyAnalysis -> WorkDependencyGate              complete
SpecialistAssignment -> SpecialistAssignmentGate          complete
EnvironmentPreparation / EnvironmentVerificationGate      complete
WorkExecution / WorkItemVerification / ChangeIntegration  complete (9 items + 4 repair retries)
SystemVerification                                        verified
BusinessAcceptance                                        accepted
RoadmapManagement -> RoadmapGate                           next initiative promoted
ProjectMemory /conclude                                   concluded
Protected-main provenance reconciliation                  authoritative local release check passed; remote promotion pending
GitHub source prerelease                                   pending protected-main promotion and tag

## Exact evidence

- Protected-main EP-001 promotion: `a9cb936f894a5ddbb86d26b31a5b3b4a61e2a9f4`
- Provenance repair implementation/evidence commit: `4e67574f2811c943c77facca05bccf1ed2bb671d`
- Provenance repair approval: `sha256:a10e707a22371ad39ba6ffd0d1099e7df2fb7434187bd1df6040d70f7770df58`
- Provenance repair integration: `sha256:9933489fe89d7c3438fee2bc407b6fa62c57a89bce5657a4fa8a485dc4d2d6cf`
- Release evidence: `sha256:b3b761206b392858373d2e29ac14334f0ae0703fe5cb6c7661799f4dfdc6281e`
- SystemVerification: `sha256:51b53024f2688bef3f7c962330769c58ea077b1283b84e1b10e87550e1e27d19`
- BusinessAcceptance: `sha256:b7edec24df999f67aa465e53e2d2a27e0a85b7eade843dc50be9402fa20ccba5`
- Acceptance graph: `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee`
- ProjectMemory baseline: `sha256:acbeb57fb0277bde5397efe3aca4211d98ea4c8aae5d145c23fc2e3d99f2bd0e`
- CurrentSynopsis: `sha256:0e9892ef4c57188e7ff3bd9936fbb409368f905690db4df2e1e5ce365deb66fd`
- `/conclude` receipt: `sha256:093bdb8acf0f09883c6139dda1323a1823eb1c2738d0bee577e3442574451712`
- Windows installed-package receipt: `sha256:513f922a4daa0ffef1cadd824669d152e24063b5aa3c7a619484a21883d1e91b`
- Roadmap baseline: `sha256:7f69318a8a1adc0d2da26bbb7668893da3ea91f55872c9446a4cf0179ef9a60c`
- RoadmapGate proof: `sha256:e487f836d17b105da4c815325f40a125ee1fd4a49722dc5568bcfabc1919ed52`

## Promotion rule and next work

The immutable reconciliation implementation/evidence commit `4e67574f2811c943c77facca05bccf1ed2bb671d` passed the authoritative local release check: 1,103 tests (1,101 passed, 0 failed, 2 intentional skips), 10,075 exact repository digests, 390 package paths, and 193 installed exports. The status/catalog seal must repeat that gate over its exact final tree; protected PR and canonical-main checks remain mandatory before exact tag `v0.10.0-rc.3` may trigger the GitHub source prerelease. A failure returns to diagnose -> fix -> verify -> integrate; it is never waived.

The next product increment is ReleasePreparation and ReleaseVerification. It must begin by loading ProjectMemory, then run RequirementsGathering and the complete released DevRelay circuit. This candidate does not claim public npm publication, a one-click Desktop plug-in, a hosted backend, or non-Windows support.

# DevRelay current implementation status

Last reconciled: 2026-08-22 MDT
Protected branch: main
Released version: 0.10.0-rc.3
Active branch: codex/v0.10.0-rc.3-release-followup
Release boundary: GitHub source/installable library operated end-to-end through ChatGPT/Codex Desktop on Windows

## Status

DevRelay `v0.10.0-rc.3` is published as a public GitHub prerelease from protected-main commit `dc0f4094ce0e178757984e363836d05cfcc0037d`. PR #12 and canonical-main verification passed CodeQL, dependency review, scorecard, and the complete Node 22/24 x Ubuntu/Windows release matrix. Local and remote release gates each covered 1,103 tests with 1,101 passing, zero failures, and two intentional skips; 10,075 exact source digests; 390 package files; and 193 installed exports.

The tagged build job verified the exact source/package, materialized the tarball, release catalog, CycloneDX SBOM, and SHA-256 ledger, attested them, and uploaded immutable workflow evidence. Its publication job then failed because `gh release create --verify-tag` attempted repository inference in a no-checkout job. The exact attested assets were downloaded, independently hashed, and published with explicit repository identity. No asset was rebuilt or substituted.

The follow-up implementation commit `c4c45ceaced6012bb9631f1dd09354865e00df52` adds `--repo "${GITHUB_REPOSITORY}"` to the publisher and a regression assertion that prevents ambient-Git repository inference from returning. Focused verification passed 2/2; canonical SystemVerification passed all 1,103 tests. Protected-main promotion of this automation follow-up remains pending.

## Lifecycle

RequirementsGathering / RequirementsGate                  no-change continuation; existing release requirement applies
Architecture / Contract checks                            no change required
WorkBreakdown / WorkDependencyAnalysis                    one configuration change + one test change; acyclic
SpecialistAssignment                                      release-automation maintainer profile
WorkExecution                                             implemented at c4c45ceaced6012bb9631f1dd09354865e00df52
WorkItemVerification                                      focused 2/2 and system 1,103/1,101/0/2 passed
ChangeIntegration                                         protected PR pending
SystemVerification                                        passed locally
BusinessAcceptance                                        release remains accepted; automation closure pending integration
ProjectMemory /conclude                                   pending after protected-main integration

## Published evidence

- Release: https://github.com/GarrettAudet/DevRelay/releases/tag/v0.10.0-rc.3
- Protected-main release commit: `dc0f4094ce0e178757984e363836d05cfcc0037d`
- Release workflow run: `32573676370`
- Release catalog: `sha256:30ebabeb56d1c1ca67222bdc72d2ebaf564ea6fd4b8c2f993d80092070c68564`
- Installable tarball: `sha256:2fbe981e32cb67cefaca95294ce6f56081db746bca185c098cea00704fa65fff`
- CycloneDX SBOM: `sha256:465aa7a123569cea58a772029b03e0e53b8f0ecc21f7627950e791345cf5dc66`
- SHA-256 ledger: `sha256:ce59ca6e6a4a7b02c1d6b245e967e3b9993e4075e99cd0168ac73d4887d8fb73`
- Workflow-fix implementation commit: `c4c45ceaced6012bb9631f1dd09354865e00df52`

## Next gate

Regenerate the release catalog and handoff seal, run the exact release check, push this branch, and promote only after CodeQL, dependency review, and all Node/OS checks pass. After canonical main is green, run `/conclude` so fresh Desktop tasks load the published-release and automation-fix state. The next product increment remains ReleasePreparation and ReleaseVerification and must begin with RequirementsGathering.

This release does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support.

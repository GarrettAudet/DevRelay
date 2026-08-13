# Requirements Gate candidate: DevRelay V0.10 public OSS preview

Status: **awaiting owner approval**

## Exact bindings

- RequirementsBaseline: sha256:c53332998c1b46848b0131f54341bed23b174d727e635731258fecf03aec5948
- ProjectOverviewBaseline: sha256:b8f2910a06e208b73854baa64b24103193936a3c2a9a5bde61b294300f008985
- ClarificationRequest: sha256:28ddb50055adb7978adbee6b0041e24b3a1350205659660094d679fca90a853b
- ClarificationResponse: sha256:d6ce8aa1351b56b9ddb7ff5d205650b3f19224c198470194e1eeefd803eae4d3
- Continuation: sha256:cef7247c9c267d35e71e9f4f90521d2334ac84257e52c01124b1d15e38d1ab6a
- RepositorySnapshot: sha256:a0a7f32db9f68215d68b6bca04ef0800d808fd3d3862c51bbc904115eebf16a9
- RequirementsChangeSet: sha256:54ec1bc4e63f6faf8ca0df3bca1a3006b7f6cd29ef66cdf66d17729479c38011
- ProjectOverviewChangeSetDraft: sha256:b37e2ab9be97e2f9b87976bd921d7ec1fe1ddba5ac7b1cc3f2ec53c8cac7865e
- Candidate ProjectOverview.md: sha256:9d31d62c868e1092cd0a40c4bc0f0f3adfe38ba7ab019ef1563ec2aac01250c9
- NativeSourceBundle: sha256:8e952fc0bc303d58208f34dc3e3e55c258e2e89c89888ae1099713a69fb5b13a
- Terminal checkpoint: sha256:0d3ae7ccbdf528895430fe0590c1effdb671457413acc05a59741d2b09e339ca
- Execution proof: sha256:43b28f947113a9749e20cb9a325abf56d9589323e81761f1629c59df731ec590

## Gate findings

- PASS: all three checkpoint-bound clarification questions have one exact approved response.
- PASS: the candidate preserves unchanged requirement entities and adds V0.10 public-preview scope only.
- PASS: GitHub-only distribution and public npm exclusion are explicit.
- PASS: Apache-2.0/DCO, security contact, protected main, supported Windows Desktop host, and release exclusions are explicit.
- PASS: the accepted repository snapshot is version-pinned and the implementation draft remains non-authoritative.
- PASS: complete release-hardening and minimal-project dogfood evidence are mandatory before acceptance.
- PASS: RequirementsGathering remains a candidate producer; this Gate alone owns atomic baseline-pair promotion.
- PASS: ProjectOverview is a deterministic projection of the exact replacement requirements.

## Approval boundary

Approval must bind the exact paired change, candidate Markdown, native bundle, and terminal checkpoint. Any modification requires a new Requirements Gate candidate.

# Evidence index

## Exact source verification

- Source target: `9d2b0d8e6b358dd6aed922de420224fe9efc320c`
- GitHub Actions verify run: `31564635275`
- Matrix: Node 20 and Node 22 on Ubuntu and Windows, 4/4 pass
- Controlled delivery: source/library for ChatGPT Desktop on Windows

## Candidate materialization

- Materialization run: `31564607304`
- Artifact name: `controlled-release-candidate-9d2b0d8e6b358dd6aed922de420224fe9efc320c`
- Artifact ID: `9129184024`
- Artifact ZIP digest: `sha256:137f05e9685d5c504f26b53c31c2814243b538ab0a7101d451afc1fed7b12ed6`
- File set: 25 canonical JSON files
- Candidate: `BA-CANDIDATE-ed2476ac90e1359f796d1ab8` / `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22`
- Candidate raw digest: `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`
- Technical coverage: `BA-TECH-COVERAGE-fb1044a00dcbd9cd94fe4243` / `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`
- Candidate proof: `DEVRELAY-CONTROLLED-RELEASE-CANDIDATE-001` / `sha256:39794039b87830b5ad89aa37c9603680f3c64b90f852ed1c3260ffef13609265`
- Approval request: `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`
- Artifact request status: `awaiting-exact-owner-approval`

## Verification and traceability

- SystemVerification result: `SVR-3A6BA4ABED95BD19` / `sha256:e2aec86627f6afbd1116dc16d1bfd96ff14e66f6679b66d9e2dc0ed9f74610f4`
- Obligations: 99
- First execution verifier calls: 2
- Exact replay verifier calls: 0
- Traceability checkpoint: `traceability-graph-devrelay-work-breakdown-r3` / `sha256:b0b64c6453fe02a9b7fbda50bd63139a7e71adcea28e0c3940db269a5974f754`
- BusinessAcceptance outcome: `eligible-for-acceptance`
- BusinessAcceptance replay evaluation/evidence calls: 0
- Coverage: 81 acceptance criteria, 18 non-functional requirements, 8 objectives, 9 metrics, and 32 business scopes

## Persistence attempt

- Run: `31566991321`
- Base commit: `f1b62238dbd39e83526290abf41edf880faa493d`
- Runner-local commit: `6f7a84a` (not pushed)
- Release check: 842 tests, 840 passed, 0 failed, 2 skipped
- Release catalog: 3,492 exact repository digests, 281 npm-package paths, 11 modules, 24 plug-ins
- Installed-package check: passed
- Push: rejected
- Rejection: the GitHub App lacked permission to update `.github/workflows/materialize-release-candidate.yml`

## Remote repository gap

The persistence run wrote and validated the candidate only in its runner workspace. Its commit was rejected, so the remote branch does not contain the candidate package or approval request. The validated workflow artifact remains evidence of the candidate bytes, not evidence that the repository accepted them.

## Approval boundary

The earlier owner approval named superseded source and cannot be reused. Exact owner approval must be requested only after `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` is persisted with digest `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`.

No BusinessAcceptanceRecord, accepted disposition, or acceptance traceability merge is authoritative yet.

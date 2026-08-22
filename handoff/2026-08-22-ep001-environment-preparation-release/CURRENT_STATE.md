# Current state

- Public prerelease: `v0.10.0-rc.3` at `https://github.com/GarrettAudet/DevRelay/releases/tag/v0.10.0-rc.3`.
- Protected-main release commit: `dc0f4094ce0e178757984e363836d05cfcc0037d`.
- PR #12, canonical-main verify, CodeQL, dependency review, and scorecard: passed.
- Release gates: 1,103 tests; 1,101 passed; 0 failed; 2 skipped; 10,075 source digests; 390 package files; 193 installed exports.
- Exact published assets were produced and attested by run `32573676370`, then independently reverified before explicit-repository publication.
- Publication-only root cause: no-checkout job made `gh release create --verify-tag` unable to infer the repository.
- Follow-up branch: `codex/v0.10.0-rc.3-release-followup`.
- Workflow-fix implementation commit: `c4c45ceaced6012bb9631f1dd09354865e00df52`.
- Fix: publisher passes `--repo "${GITHUB_REPOSITORY}"`; regression test requires it.
- Verification: focused 2/2 and canonical 1,103/1,101/0/2 passed.
- Next gate: catalog/handoff seal, protected PR, canonical-main verification, then `/conclude`.

Supported scope remains GitHub source plus an installable deterministic library operated through ChatGPT/Codex Desktop on Windows.

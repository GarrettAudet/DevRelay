# Current state

## Exact repository position

- Branch: `codex/v0.10-release-hardening`
- Source base: `430cb5c09f1aa69b60f48fb37b06f3c3d7d8213d`
- Candidate version: `0.10.0-rc.1`
- Final candidate path: `dogfood/v0.10-release-hardening/final-acceptance/`
- Current boundary: final catalog and protected-main promotion

## Completed and authoritative

- Eight release work items are executed, verified, integrated, and traced.
- Independent Windows Desktop installed-tarball dogfood passed and replayed.
- SystemVerification `SVR-67910A823F0F96AA` is verified.
- BusinessAcceptance record `BA-RECORD-994267d2f224bfd3ebb8d928` is accepted.
- TraceabilityGraph revision 47 has zero blocking diagnostics.
- Coverage is 88 acceptance criteria, 20 NFRs, 9 objectives, 11 metrics, 34 scopes, and 8 integrated work items.

## Remaining

Regenerate the catalog, run local gates, commit and push, open the protected-main
pull request, pass the final matrix/security checks, merge, and record the final
commit and source-release evidence.

Do not reuse historical v0.9 or prior v0.10 candidate approvals after changing
the current candidate bytes.

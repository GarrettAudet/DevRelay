# Next actions

BusinessAcceptance is complete. No further owner decision is required unless accepted bytes change.

## Final promotion sequence

1. Regenerate the repository release catalog after all evidence and handoff bytes are final.
2. Run `npm.cmd run release:check` and require the full gate to pass.
3. Commit and push the exact accepted evidence and handoff.
4. Require `verify-source-release` to pass Node 20 and 22 on Windows and Ubuntu (4/4).
5. Report the deterministic controlled source/library release ready for ChatGPT Desktop on Windows.

## If a check fails

Diagnose from the exact failing evidence. Preserve the accepted candidate and Gate artifacts. If a fix changes accepted product bytes or acceptance context, regenerate all dependent verification and acceptance artifacts and obtain a new exact approval.

## Prohibited shortcuts

Do not hand-edit generated acceptance artifacts, bypass the catalog, weaken graph ownership, infer a passing matrix, or expand the accepted delivery boundary.

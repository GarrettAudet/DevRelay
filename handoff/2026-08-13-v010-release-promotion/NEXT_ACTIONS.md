# Next actions

1. Ensure all status, spec, dogfood, and handoff documents describe this exact candidate.
2. Run `npm.cmd run release:catalog` after all cataloged files are stable.
3. Run `npm.cmd run verify` and `npm.cmd run release:check`.
4. Review the full diff and confirm no stale Node 20, v0.9, old candidate, or unsupported-host release claim remains active.
5. Commit and push `codex/v0.10-release-hardening`.
6. Open a pull request to protected `main`.
7. Require the Node 22/24 Windows/Ubuntu matrix plus configured security and source-release checks.
8. Merge only after all required checks pass.
9. Record the merged commit, final check runs, tarball digest, and source-release disposition in current status and this handoff.

If candidate bytes change after catalog generation, regenerate the catalog and
repeat every downstream gate.

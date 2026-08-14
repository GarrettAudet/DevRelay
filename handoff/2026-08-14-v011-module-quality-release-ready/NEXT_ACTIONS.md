# Next actions

1. Confirm the evidence-seal commit directly follows `868c00e2dc8c0d610d919dbc68256bab9d0e6ca2`.
2. Run `npm.cmd run release:check` on that exact commit.
3. Push `codex/v0.11-module-quality` to GitHub.
4. Promote through protected `main` after required checks pass.
5. Optionally create the GitHub prerelease/tag; do not publish to npm unless scope changes.

No additional DevRelay module implementation is required for this release boundary.

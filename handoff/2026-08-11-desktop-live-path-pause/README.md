# Desktop live-path pause handoff

This is the active pickup package for DevRelay V0.10 on branch
`codex/v0.10-chatgpt-desktop-runtime`.

- Current committed checkpoint:
  `458ff419325bc621a4202d5cf6f1a5993adbf96b`
- Target: ChatGPT Desktop on Windows only.
- Current boundary: production lifecycle-stage bindings.
- Release status: not release-ready.

Read `CURRENT_STATE.md`, then `NEXT_ACTIONS.md`. `EVIDENCE.md` records the
completed corrective attempts and verification limitations. `handoff.yaml`
contains the same boundary in a compact machine-readable form.

The prior source/library acceptance and list-runs work remain valid historical
evidence, but the owner tightened the release definition: a clean installed
plugin must run the complete deterministic lifecycle and build a tiny real
software change through BusinessAcceptance. That proof does not yet exist.


# Desktop modular preview verification

Candidate: 0.12.0-modular.2. Branch: codex/modular-desktop-release.
Base: aa269f50e3e64f1d1f6753cfdb0ab7492855a8fd.

This slice reuses DevRelay's exact approved requirements/overview 2.8.0 pair for additive modular usability. It does not promote a new lifecycle baseline or claim full business acceptance. Superpowers at 8ca22dba9a94f28898bbce59f2537ff4d87c747d guided test-first implementation and a final independent review; it is not a runtime dependency.

## Actual installed Desktop execution

The personal devrelay-desktop plug-in was upgraded to semantic version 0.2.0, configured against an explicit local DevRelay runtime, and reinstalled with the standard cachebuster workflow. The cached scripts/code.mjs entry point, not a source-only stand-in, ran both changes below through native inventory, file-change, and Node-test bindings.

- desktop-preview-result-summary-20260929 added coding-summary.mjs and integrated it into the Desktop entry point. Seven tests passed with process exit 0. The raw report and diff were retained. A later test edit made its historical replay stale, correctly returning a nonzero process exit.
- desktop-context-size-before-effects-20260929 fixed a reproduced setup bug. The regression first failed because an oversized combined snapshot created the new directory before rejection. The installed workflow applied the fix and all six Desktop setup/run tests passed.
- The second request then replayed with replayed=true, currentWorkspaceMatches=true, and the same stored test evidence. It did not reapply edits or rerun tests.

The current conversation can invoke the installed launcher explicitly. Automatic skill discovery in a fresh Desktop chat is a separate startup boundary; reinstalling does not refresh this conversation's skill catalog.

## Reproduce

Follow modular-desktop-quickstart.md. Run test/modular-desktop-cli.test.mjs, test/modular-desktop-plugin.test.mjs, test/modular-coding-summary.test.mjs, and the existing coding/plugin tests. The repository's release:check validates the full suite, canonical source catalog, and isolated installed package.

Source and runtime pins are local configuration, not attestations of hostile or concurrently mutable dependencies. No new production dependencies were added. The manual release path defaults to verification only; explicit publication is restricted to main after the release build and asset attestation pass, and never moves an existing tag.

# Pickup prompt

Continue DevRelay EP-001 release finalization from branch `codex/ep-001-main-provenance-reconciliation`.

Read, in order:

1. `project/CurrentSynopsis.md`
2. `project/project-memory-baseline.json`
3. `CURRENT_STATUS.md`
4. this handoff's `CURRENT_STATE.md`
5. `EVIDENCE_INDEX.md`
6. `NEXT_ACTIONS.md`

Do not redo completed semantic gates. PR #11 already passed its remote checks and merged to protected `main` at `a9cb936f894a5ddbb86d26b31a5b3b4a61e2a9f4`. Canonical-main verification then exposed only a commit-ID portability assumption in the V0.11 two-phase evidence verifier. The repair preserves the original approved pair, uniquely proves its tree-and-subject-equivalent direct-parent pair in protected-main ancestry, and has passed the focused 17-test gate plus the released execution, verification, integration, acceptance, traceability, and `/conclude` circuit.

Immutable implementation/evidence commit `4e67574f2811c943c77facca05bccf1ed2bb671d` passed the full local release check. Resume with the exact status/catalog reseal, repeated release gate, protected PR, canonical-main checks, and GitHub tag/release workflow. Preserve the ChatGPT/Codex Desktop on Windows boundary and all stated exclusions.

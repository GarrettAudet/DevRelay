# Pickup prompt

Continue DevRelay EP-001 release finalization from branch `codex/ep-001-environment-preparation`.

Read, in order:

1. `project/CurrentSynopsis.md`
2. `project/project-memory-baseline.json`
3. `CURRENT_STATUS.md`
4. this handoff's `CURRENT_STATE.md`
5. `EVIDENCE_INDEX.md`
6. `NEXT_ACTIONS.md`

Do not redo completed lifecycle stages. EP-001 has passed SystemVerification, BusinessAcceptance, RoadmapManagement, and `/conclude`. The prior seal was superseded after GitHub CodeQL found a filesystem race. The correction is independently verified and integrated at `b9adbeaa68b24725b8d8dad611e9735bac277791`; acceptance and ProjectMemory are refreshed. Run the complete release check, produce a replacement two-phase seal, push PR #11, and require every protected remote check to pass. Preserve the ChatGPT/Codex Desktop on Windows boundary. Preserve the ChatGPT/Codex Desktop on Windows release boundary and all stated exclusions.

# EP-001 EnvironmentPreparation release pickup

EP-001 is implemented, verified, business accepted, roadmap-resolved, and concluded. PR #11 passed all protected checks and merged to `main` at `a9cb936f894a5ddbb86d26b31a5b3b4a61e2a9f4`. The canonical-main matrix found one precise provenance-portability defect caused by GitHub's linear-history rebase rewriting commit IDs while preserving both approved trees. That failure is now routed through WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, BusinessAcceptance, TraceabilityGraph, and ProjectMemory.

The focused repair gate passes 17/17 with zero blocking diagnostics. Immutable implementation/evidence commit `4e67574f2811c943c77facca05bccf1ed2bb671d` also passed the full local release gate: 1,103 tests, 10,075 repository digests, 390 package files, and 193 installed exports. Remaining work is the exact status/catalog reseal, protected-main reconciliation PR, canonical-main gates, and the GitHub-only prerelease tag/workflow.

Start with `CURRENT_STATE.md`, then `EVIDENCE_INDEX.md`, then `NEXT_ACTIONS.md`. Do not rerun completed semantic gates from conversational memory; resume from the exact artifacts and digests.

The supported boundary is GitHub source plus an installable library operated through ChatGPT/Codex Desktop on Windows. Do not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support.

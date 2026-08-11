# ChatGPT Desktop runtime RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` conversation contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and Desktop runtime design and implementation are blocked until every question below is answered.

1. **Should V1 be release-ready when installable from a repository-backed local marketplace in ChatGPT Desktop on Windows, without public OpenAI plugin-directory publication?**

   - Ship V1 as a repository-backed local marketplace plugin installable in ChatGPT Desktop on Windows; public directory publication is not required (recommended)
   - Require public universal plugin-directory publication before calling V1 release-ready

   Why it matters: The distribution boundary determines package layout, installation evidence, upgrade and rollback behavior, and whether external publication review is a release blocker.

2. **Should every Core-derived runnable work item execute in its own Codex task through local app-server, with DevRelay retaining dependency, Gate, verification, and integration authority?**

   - Create one Codex task per runnable work item through local app-server while DevRelay Core retains DAG, Gate, and verified-handoff authority (recommended)
   - Execute all work items inside the single orchestration task

   Why it matters: This choice determines whether the requested discrete-task workflow is a real execution contract or only a chat convention.

3. **Should release acceptance require one live path through every mandatory module plus a clean-install Desktop run that builds and accepts a real bounded software feature, while alternatives remain maturity-labelled?**

   - Require one live path through every mandatory module plus a clean-install Desktop run that builds and accepts a real bounded software feature; keep alternative adapters maturity-labelled (recommended)
   - Treat library tests and fixture-conformant adapter contracts as sufficient release proof

   Why it matters: A green library and fixture-conformant adapters do not prove that a user can actually complete the workflow from the supported Desktop surface.

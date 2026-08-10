# WorkExecution bootstrap task: WI-WE-CONTRACTS

Execute only the exact task contract at:

`dogfood/work-execution/execution/task-contracts/WI-WE-CONTRACTS.task.json`

Repository: `C:\\tmp\\DevRelay-v04-work-dependency-analysis`
Branch/worktree: `codex/v0.5-lifecycle-run-report`

Read `AGENTS.md` first, then verify the task contract's
`contentDigest` by recomputing the digest with the repository's
`canonicalJsonDigest` after omitting that field. Read every declared
context path before editing.

Implement only `WI-WE-CONTRACTS` within its allowed write paths. Preserve
all unrelated dirty-worktree changes. Do not run downstream work, mutate project
baselines, alter the DAG, perform integration, or claim verification authority.

Return the exact `BootstrapWorkItemHandoff` shape declared by the task
contract. Include precise changed files, command exit codes, evidence paths and
digests, residual risks, and one of the closed outcomes. The parent task is the
integration owner.

# DevRelay WorkExecution: WI-DESKTOP-CAPABILITY-RESOLVER

Execute only the exact task contract at:

`dogfood/chatgpt-desktop-runtime/execution/task-contracts/WI-DESKTOP-CAPABILITY-RESOLVER.attempt-001.task.json`

Read `AGENTS.md` first. Verify the task contract `contentDigest` by
recomputing `canonicalJsonDigest` after omitting that field, then read every
declared context path before editing. Implement only the bounded work item and
only within its allowed write paths.


Do not route downstream work, mutate approved project artifacts, approve or
integrate your own change, or create Git commits. Run every exact focused
verification command and return only the closed `BootstrapWorkItemHandoff`
shape declared in the task contract, with exact changed paths, exit codes,
evidence digest, and residual risks. The parent task retains verification and
integration authority.

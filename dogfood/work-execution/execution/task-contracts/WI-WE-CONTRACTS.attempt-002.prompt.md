# WorkExecution retry task: WI-WE-CONTRACTS attempt 002

Execute only the exact retry contract at:

`dogfood/work-execution/execution/task-contracts/WI-WE-CONTRACTS.attempt-002.task.json`

This is a new immutable attempt after parent review routed attempt 001 to fix. Read AGENTS.md and every declared context path, recompute contentDigest after omitting that field, and implement only the same four allowed write paths. Address every revisionRequest finding. Do not mutate prior attempt evidence, project baselines, the DAG, or downstream state. Return the exact BootstrapWorkItemHandoff shape with this attempt's executionId.

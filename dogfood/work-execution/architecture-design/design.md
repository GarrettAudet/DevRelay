# WorkExecution design

## Decision

Core invokes one work item per immutable attempt only after deriving readiness from the approved DAG and integrated completion facts. A version-pinned ExecutionBinding resolves the approved specialist profile to one configured executor. The external host creates and enforces an isolated workspace. Executor output is checkpointed before Core assembles a ChangeSetDraft and ExecutionEvidenceBundle.

## Bindings

The first dogfood binding creates one user-visible Codex task per work item. An A2A executor uses the same port. Neither adapter owns readiness, permissions, verification, integration, or graph authority.

## Consequences

Parallelism is represented as independent invocations across the ready frontier. Failed and interrupted attempts remain immutable; retry creates a new linked attempt.
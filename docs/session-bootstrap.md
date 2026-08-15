# DevRelaySessionBootstrap

`DevRelaySessionBootstrap` is a mandatory ChatGPT Desktop on Windows host boundary for every fresh configured DevRelay task: a new tab, new task identity, app/runtime restart, or new-day task. It does not run for unrelated chats and it is not a `RoadmapManagement` operation.

## Startup contract

Before `run`, `resume`, `verify`, or `inspect`, the host constructs a content-addressed `SessionContextSnapshot` containing exact references to:

- the current `ProjectOverviewBaseline` and projection;
- the current `RoadmapBaseline` and projection, or `RoadmapNotInitialized`;
- lifecycle/current status;
- current requirements, architecture, contract, work-breakdown, and work-dependency baselines;
- the current specialist-assignment baseline, pending Gate, ready frontier, clarifications, and blockers when present.

The bootstrap resolves every declared reference, hashes its raw bytes, and emits a `SessionContextReceipt` bound to the project, task, workspace, repository revision, snapshot digest, duration, and cache disposition. Missing, malformed, stale, substituted, or digest-mismatched required context produces `outcome: fail` and stops before module execution.

## Desktop facade behavior

`createLocalHost` requires a trusted `services.bootstrap` function in addition to `run`, `resume`, `verify`, and `inspect`. Every public request supplies a stable `taskId`. `createDevRelay` invokes bootstrap once per task identity, validates the returned receipt, and passes the exact receipt to the host operation. A new relay process or task identity bootstraps again.

```js
const services = {
  bootstrap: async ({ projectId, taskId }) => loadAndValidateCurrentContext({ projectId, taskId }),
  run,
  resume,
  verify,
  inspect,
};

const host = createLocalHost({ hostId: "desktop.windows", services, grants });
const relay = createDevRelay({ projectId: "example", host, modules, plugins });
const result = await relay.run({ taskId: "desktop-task-42", goal: "Build the feature" });
```

A `RoadmapNotInitialized` receipt is not silent success. The facade binds the `roadmap-baseline-establishment-only` execution constraint so the trusted host can establish the first baseline or perform read-only inspection.

## Refresh rule

If any approved baseline changes during the task, the host calls `refreshSessionContext` at the next Module boundary and binds the new receipt before progressing. The snapshot is orientation and drift evidence only: it never substitutes for explicit `ModuleInvocation` inputs or grants authority through conversational state.
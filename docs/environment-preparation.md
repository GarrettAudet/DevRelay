# EnvironmentPreparation and EnvironmentVerification

`EnvironmentPreparation` is the mandatory pre-execution control for the supported ChatGPT/Codex Desktop on Windows lifecycle. It inventories the exact Windows host and project target, shows proposed changes before any effect, binds owner approval to exact grants, verifies readiness, and issues one short-lived single-use `EnvironmentReadinessReceipt` for the next Core-derived DAG frontier.

```text
ReadyFrontier + SpecialistAssignmentBaseline + RepositorySnapshot
  -> resolve two-layer EnvironmentProfileSet
  -> deterministic native Windows inventory
  -> remediation preview and explicit approval, when required
  -> approved effects with checkpoints and rollback receipts
  -> Environment Gate
  -> single-use EnvironmentReadinessReceipt
  -> consume receipt for the exact execution attempt
  -> WorkExecution
```

## Operations

| Project state | Core operation | Result |
| --- | --- | --- |
| No approved environment baseline | `establish-environment` | `EnvironmentBaseline` plus readiness for the exact frontier |
| Baseline exists and a new frontier is ready | `prepare-frontier` | New single-use readiness receipt |
| Existing frontier must be checked again | `revalidate-frontier` | Fresh readiness or a closed drift outcome |
| Approved facts drifted | `remediate-drift` | Effect/rollback receipts followed by a fresh Gate evaluation |

Core selects the operation. A provider cannot promote a baseline, approve remediation, issue readiness, consume readiness, or write graph operations.

## Profiles and plug-ins

Every invocation resolves two layers: one DevRelay host profile and one or more named project-target profiles. The release includes the `native-windows-environment-inventory` binding for offline Windows, filesystem, runtime, package-manager, SDK, tool, service, environment-variable presence, and attestation checks. Optional adapters use the same provider-neutral manifest and execution-attestation contracts; their maturity must remain `contract-defined`, `fixture-conformant`, `live-conformant`, or `release-ready` based on actual evidence.

Secret observations record presence only. Source values, tokens, passwords, credentials, and API keys are rejected from provider output and human-readable summaries.

## Human approval and effects

Call `renderEnvironmentRemediationPlan(plan)` before seeking approval. It lists each mutation, scope, impact, rollback procedure, exact grants, and required evidence. Project-local effects are the default. Machine-global effects require a separate explicit approval binding. A changed fingerprint, changed grant, missing checkpoint, uncertain effect, failed rollback, or stale receipt blocks progression.

## Desktop library integration

The advanced API exposes `createEnvironmentPreparedDesktopCoordinator`. Its `prepareFrontier` method accepts the exact repository, frontier, assignment, and attempt binding and stores only a Core-approved `ready` result. Its `executePrepared` method atomically consumes that receipt before calling the existing Desktop execution coordinator. Unknown, expired, reused, drifted, or substituted readiness never reaches the executor.

```js
import {
  createEnvironmentPreparedDesktopCoordinator,
  createInMemoryEnvironmentReadinessStore,
} from "devrelay/advanced";

const coordinator = createEnvironmentPreparedDesktopCoordinator({
  environmentRuntime,
  readinessStore: createInMemoryEnvironmentReadinessStore(),
  executionCoordinator,
});

const preparation = await coordinator.prepareFrontier(environmentRequest);
// Present preparation.summary to the user.
const result = await coordinator.executePrepared({
  preparationId: preparation.preparationId,
  consumedAt: new Date().toISOString(),
  executionRequest,
});
```

## Traceability

The trusted contributor uses vocabulary `devrelay.traceability/v1@1.7.0` and derives only forward facts:

```text
EnvironmentProfile -> required-by -> WorkItem
EnvironmentReadinessReceipt -> authorizes-environment-for -> ExecutionAttempt
```

Adapters cannot create nodes, choose relationship kinds, submit graph operations, or mutate the graph. Core validates endpoints and source closure, merges atomically, and records the update and resulting checkpoint.

## Scope boundary

This module proves that the exact local environment is ready for one execution frontier. It does not claim deployment success, staging success, production health, public npm publication, a hosted backend, or a one-click Desktop plug-in. Those remain separate lifecycle concerns.

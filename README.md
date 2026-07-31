# DevRelay

DevRelay is a small deterministic runner for composable
software-engineering Modules.

It does not replace engineering tools, coding agents, or model providers. A
semantic Module defines a stable engineering contract, configured adapters
implement bounded capabilities, and DevRelay Core owns routing, sequencing,
validation, checkpointing, and progression.

## Current vertical slices

```text
GoalArtifact + ProjectContext
  -> RequirementsGathering@gather
  -> configured OpenSpec or GitHub Spec Kit requirements plug-in
  -> RequirementsDraft | RequirementsChangeSet | clarification
  -> separate Requirements Gate
  -> RequirementsBaseline
  -> Core reads ProjectArchitectureState
  -> ArchitectureDiscovery prerequisite when current architecture is unknown
  -> ArchitectureDesign@establish-baseline | @design-change
  -> configured designer -> modeler -> decision-recorder chain
  -> ArchitectureDraft | ArchitectureChangeSetDraft | clarification
  -> separate Architecture Gate
  -> ArchitectureBaseline
```

### RequirementsGathering 0.1.0

RequirementsGathering turns a goal and explicit project context into one
canonical requirements candidate. OpenSpec and GitHub Spec Kit are
interchangeable requirements plug-ins. The Module emits candidates,
clarification checkpoints, or diagnostics; it cannot approve requirements.

### ArchitectureDesign 0.1.0

ArchitectureDesign is one Module with two operations:

- `establish-baseline` when no approved architecture baseline exists;
- `design-change` when an approved architecture baseline exists.

An existing repository with no architecture baseline and no current
architecture snapshot first routes to `architecture-discovery#discover`.
Project state selects the route; a model or adapter cannot improvise it.

The V1 configured chains are:

```text
establish-baseline:
  Spec Kit plan -> Structurizr -> MADR -> ArchitectureDraft

design-change:
  OpenSpec design -> Structurizr -> MADR -> ArchitectureChangeSetDraft
```

Each success returns exactly one primary candidate. Technical design,
architecture model, diagrams, interface intent, architecture constraints,
decision records, and native artifacts are required sections inside that
candidate, not independent Module outcomes.

These manifests bind only relevant upstream capabilities. DevRelay does not
run the full OpenSpec, Spec Kit, Structurizr, or MADR workflow as a monolith.
Live command adapters are not shipped or claimed in this pass.

## Stable contracts

```text
ModuleDefinition + ModulePlugin + ModuleInvocation
                 + ModuleRouteDecision
                         |
                         v
                 ModuleStepInvocation
                         |
              ordered configured adapters
                         |
                         v
            ModuleStepResult + ModuleResult
```

- `ModuleDefinition` owns portable operations, ports, result rules, evidence,
  optional deterministic routing, and ordered adapter-step contracts.
- `ModulePlugin` binds one exact Module operation and, for a chain, one exact
  step to implementation configuration, execution mode, and capabilities.
- `ModuleInvocation` pins the complete adapter chain. There is no implicit
  default or `latest`.
- `ModuleRouteDecision` is Core-owned, content-bound to one state artifact,
  and supplied as a required input to every routed operation.
- `ModuleStepInvocation` contains the original immutable inputs plus all exact
  prior step results.
- `ModuleStepResult` binds the invocation fingerprint, stable chain
  fingerprint, complete step-invocation digest, and exact plug-in version,
  then either continues with a declared handoff or terminates with a valid
  `ModuleResult`.
- `ModuleResult` is checked against Module semantics and never implies gate or
  pipeline acceptance.

Legacy single-adapter invocations remain supported for RequirementsGathering.

## What is executable

The registry and schema-backed runner:

- register exact Module and adapter versions;
- reject duplicate, incompatible, missing, or misordered step bindings;
- require persisted raw bytes, verify their exact SHA-256 digests before
  fatal UTF-8/JSON decoding, and invoke a trusted validator for every input,
  handoff, and terminal output;
- derive a `ModuleRouteDecision` from validated state and reject forged,
  stale, prerequisite, or operation-mismatched invocations;
- resolve every adapter before invoking the first step;
- invoke steps only in declared order;
- validate intermediate handoff content and terminal candidate semantics
  before checkpointing or progression;
- stop deterministically on declared early terminal outcomes;
- require effect results—including legacy single adapters—to be durably
  stored before downstream work;
- key step checkpoints by the complete step invocation, including prior
  results, and fail closed on malformed replay;
- restore completed handoffs from source invocation checkpoints bound by a
  portable continuation, then resume at the recorded ArchitectureDesign step;
- reject non-JSON invocation, result, definition, and adapter-context state,
  and create a distinct immutable data context for every adapter;
- preserve the existing single-adapter RequirementsGathering contract path.

Effectful model or tool execution is checkpointed rather than assumed
bit-for-bit reproducible. Exact-invocation recovery reuses fully bound
checkpoints. Cross-invocation clarification resume uses the declared chain
fingerprint plus a digest-verified continuation and the original validated
step-result checkpoints. The continuation is portable metadata, not a
standalone replacement for those checkpoints; a host moving resume state must
move the complete checkpoint-and-artifact bundle. Only clarification-control
inputs and run identities may differ. Hosts and effectful adapters still need
idempotency for a crash after the external effect succeeds but before the
checkpoint write completes. Tool, model, prompt, environment, native-source,
and normalization provenance remain explicit evidence.

## Requirements dogfood

`dogfood/architecture-design/` contains the authoritative interactive
RequirementsGathering run used before ArchitectureDesign implementation. It
binds the goal, project context, repository snapshot, four visible
clarification exchanges, normalized draft, OpenSpec bridge source bundle,
Module invocation/result, passing Requirements Gate, and approved baseline.

The OpenSpec CLI was not executed. The agent-command bridge and that limitation
are both recorded in the source bundle.

## Repository

```text
contracts/
  module-definition.schema.json
  module-plugin.schema.json
  module-invocation.schema.json
  module-route-decision.schema.json
  module-step-invocation.schema.json
  module-step-result.schema.json
  module-result.schema.json
  requirements-gathering-artifacts.schema.json
  architecture-design-artifacts.schema.json
  shared-artifacts.schema.json
docs/
  module-contract.md
  requirements-gathering.md
  architecture-design.md
dogfood/
  architecture-design/
examples/
  artifacts/
  modules/
  plugins/
  invocations/
  results/
openspec/
  schemas/devrelay-requirements/
  schemas/devrelay-architecture/
src/
  content-digest.mjs
  artifact-runtime.mjs
  module-registry.mjs
  operation-router.mjs
  architecture-runtime-contracts.mjs
  architecture-handoff-validator.mjs
  schema-validation.mjs
  requirements-artifact-validator.mjs
  architecture-artifact-validator.mjs
  shared-artifact-validator.mjs
test/
```

Run:

```powershell
npm.cmd test
```

The next lifecycle boundary is the Architecture Gate. It must bind its decision
to the exact candidate, approved requirements, project state, policy version,
and evidence before creating or updating an `ArchitectureBaseline`.

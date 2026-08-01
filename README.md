# DevRelay

DevRelay is a small deterministic runner for composable
software-engineering Modules.

It does not replace engineering tools, coding agents, or model providers. A
semantic Module defines a stable engineering contract, configured adapters
implement bounded capabilities, and DevRelay Core owns routing, sequencing,
validation, checkpointing, and progression.

## Release status

DevRelay `0.1.0` is a private, source-only release containing
`requirements-gathering@0.1.0` and `architecture-design@0.1.0`. It is
`UNLICENSED` and is not published to the public npm registry. Access to the
source does not grant permission to use or redistribute it; see
[LICENSE](LICENSE) and [RELEASE.md](RELEASE.md).

The release contains Core, schemas, versioned manifests, fixtures, and bounded
adapter contracts. It does not contain live OpenSpec, GitHub Spec Kit,
Structurizr, or MADR command adapters.

## Source setup and verification

From an authorized source checkout with Node.js 20 or 22:

```sh
npm ci
npm run verify
npm run release:check
```

`verify` parses JSON, checks JavaScript syntax and LF-only text, and runs
the complete suite. `release:check` also verifies the release digest catalog
as a mandatory release input, builds an allowlisted tarball in a temporary
directory, installs it offline, and smoke-tests the package root and both
module manifests.

## Library quickstart

The controlled source tarball exposes an intentional package root. A host can
load the semantic modules and supply its own artifact store, checkpoint store,
capability enforcement, and adapter implementations:

```js
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  architectureRuntimeArtifactContracts,
  createModuleRegistry,
  projectOverviewRuntimeArtifactContracts,
  requirementsRuntimeArtifactContracts,
  validateRequirementsGatePromotion,
} from "devrelay";

const require = createRequire(import.meta.url);
const loadJson = async (specifier) =>
  JSON.parse(await readFile(require.resolve(specifier), "utf8"));

const requirements = await loadJson(
  "devrelay/modules/requirements-gathering.module.json",
);
const architecture = await loadJson(
  "devrelay/modules/architecture-design.module.json",
);

const requirementsContracts =
  requirementsRuntimeArtifactContracts();
const requirementsSchemas = new Set(
  requirementsContracts.map(({ schema }) => schema),
);
const artifactContracts = [
  ...requirementsContracts,
  ...architectureRuntimeArtifactContracts().filter(
    ({ schema }) => !requirementsSchemas.has(schema),
  ),
];

const registry = createModuleRegistry({
  modules: [requirements, architecture],
  artifactContracts,
});

// A standalone Requirements Gate or context consumer can register only the
// ProjectOverview artifact family when it does not execute either Module.
const overviewOnlyContracts = projectOverviewRuntimeArtifactContracts();
```

Register exact plug-in manifests and host adapter functions before resolving
or executing an invocation. There is no implicit adapter, version, model, or
external command. `requirementsRuntimeArtifactContracts()` includes the
ProjectOverview family, and `architectureRuntimeArtifactContracts()` includes
that complete requirements bundle transitively; the composition above removes
duplicate schemas.

After normal execution has durably stored its terminal checkpoint, the host
calls `registry.verifyCheckpointedExecution(invocation, { artifacts,
checkpoints })`. This checkpoint-only path loads and revalidates the exact
invocation, inputs, terminal result, canonical outputs, native bytes, and
runtime lineage without invoking an adapter. It returns an unforgeable
in-process receipt. The host passes that receipt as `checkpointReplay`, plus
each proposed baseline object, its closed `ArtifactRef`, its exact raw JSON
bytes, and the exact `ProjectOverview.md` bytes, to
`validateRequirementsGatePromotion()`. The gate hashes and fatally decodes
both baseline documents, verifies that each parsed object exactly matches the
supplied object, and returns a frozen `commitPayload` containing the verified
references and exact bytes encoded as base64. Plain `ModuleResult` JSON or a
serialized/cloned receipt is insufficient, and V1 does not ship a portable
cross-process receipt. The helper does not persist its validated pair; the host
must decode and commit both payload documents atomically or commit neither.

## Schema identifiers

`https://devrelay.dev/...` schema URIs are stable identifiers; this release
does not claim that they are network-hosted endpoints. Core registers the
bundled schemas locally and never fetches them from the network. Consumers can
resolve raw schema documents through exported package paths such as
`devrelay/contracts/module-definition.schema.json`, or directly under
`contracts/` in a source checkout.

## Current vertical slices

```text
GoalArtifact + ProjectContext + optional paired baselines
  -> RequirementsGathering@gather
  -> configured OpenSpec or GitHub Spec Kit requirements plug-in
  -> RequirementsDraft + ProjectOverviewDraft
     | RequirementsChangeSet + ProjectOverviewChangeSetDraft
     | clarification
  -> separate Requirements Gate atomically promotes the pair
  -> RequirementsBaseline + ProjectOverviewBaseline + ProjectOverview.md
  -> caller supplies both baselines and ProjectArchitectureState explicitly
  -> ArchitectureDiscovery prerequisite contract when current architecture is unknown
  -> ArchitectureDesign@establish-baseline | @design-change
  -> configured designer -> modeler -> decision-recorder chain
  -> ArchitectureDraft | ArchitectureChangeSetDraft | clarification
  -> separate Architecture Gate
  -> ArchitectureBaseline
```

### RequirementsGathering 0.1.0

RequirementsGathering turns a goal and explicit project context into one
canonical typed requirements candidate and its deterministic project-overview
candidate. The requirements body contains purpose, business objectives,
success metrics, stakeholders, users, capabilities, user journeys, user
stories, acceptance criteria, non-functional requirements, constraints, scope,
non-goals, terminology, current status, and supporting assumptions,
dependencies, risks, deliverables, required evidence, and source references.
The normative IDs consumed by architecture are user stories, non-functional
requirements, and constraints; acceptance criteria bind their verification.
Each typed assumption carries `status`, `blocking`, and canonical
`sourceRefs`. Only an assumption with `status: "unconfirmed"` and
`blocking: true` prevents Requirements Gate promotion. An unconfirmed
nonblocking assumption remains visible in the approved candidate and baseline.

A change is an optimistic full-body replacement. It carries the exact prior
requirements digest and an exhaustive list of changed top-level sections;
stale, partial, or no-op replacements fail closed. OpenSpec and GitHub Spec Kit
are interchangeable bounded requirements plug-ins. The Module emits candidates,
clarification checkpoints, or diagnostics; it cannot approve requirements.

### ProjectOverview context

`ProjectOverviewBaseline` is the compact, explicit context passed to every
downstream Module. It projects purpose, business objectives, users, key
capabilities, success metrics, scope, non-goals, constraints, non-functional
requirements, terminology, and current status from the canonical requirements
body. `ProjectOverview.md` is a deterministic UTF-8-without-BOM, NFC, LF-only
rendering with a final newline. Its exact raw-byte digest is carried by the
structured artifact, so the Markdown is readable evidence rather than a second
editable source of truth.

The Requirements Gate promotes the requirements and overview candidates as one
version-aligned pair. An approved change always creates a new pair, including
when no projected overview section changed; that case records an `unchanged`
overview disposition and an empty overview changed-section list.

### ArchitectureDesign 0.1.0

ArchitectureDesign is one Module with two operations:

- `establish-baseline` when no approved architecture baseline exists;
- `design-change` when an approved architecture baseline exists.

An existing repository with no architecture baseline and no validated current
architecture snapshot has an explicit `architecture-discovery#discover`
prerequisite. That prerequisite must be satisfied by the caller in `0.1.0`;
DevRelay does not ship an executable ArchitectureDiscovery Module. Project
state selects the route; a model or adapter cannot improvise it.

The V1 configured chains are:

```text
establish-baseline:
  RequirementsBaseline + ProjectOverviewBaseline
  -> Spec Kit plan -> Structurizr -> MADR -> ArchitectureDraft

design-change:
  RequirementsBaseline + ProjectOverviewBaseline + ArchitectureBaseline
  -> OpenSpec design -> Structurizr -> MADR -> ArchitectureChangeSetDraft
```

Each success returns exactly one primary candidate. Technical design,
architecture model, diagrams, interface intent, architecture constraints,
decision records, and native artifacts are required sections inside that
candidate, not independent Module outcomes.

These manifests bind only relevant upstream capabilities. DevRelay does not
run the full OpenSpec, Spec Kit, Structurizr, or MADR workflow as a monolith.
Live command adapters are not shipped or claimed in this pass.

Core does not inject project context from global state or conversational memory.
The exact `project-overview-baseline` is a required declared invocation input,
is copied into architecture state/candidate lineage, and participates in
invocation and resume identity. Changing it invalidates replay.

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
- `ProjectOverviewBaseline` is caller-supplied, content-addressed Module input;
  generic Core validates and forwards it but never discovers or injects it.
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
- resolve capability scope templates and require each invocation's grants to
  exactly equal the selected adapter's demands;
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
- verify that ProjectOverview artifacts are exact requirements projections and
  load the digest-bound `ProjectOverview.md` raw bytes before progression;
- validate paired Requirements/ProjectOverview promotion while leaving policy
  approval and atomic persistence to the host;
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

In a source checkout, `dogfood/architecture-design/` contains the
authoritative interactive RequirementsGathering run used before
ArchitectureDesign implementation. This evidence directory is intentionally
excluded from the controlled npm package and is not available to installed
package consumers. It
binds the goal, project context, repository snapshot, four visible
clarification exchanges, normalized typed draft, deterministic
ProjectOverview candidate and Markdown bytes, OpenSpec bridge source bundle,
Module invocation/result, passing Requirements Gate, and approved paired
baselines.

The OpenSpec CLI was not executed. The agent-command bridge and that limitation
are both recorded in the source bundle.

## Repository

```text
.github/workflows/
  verify.yml
contracts/
  module-definition.schema.json
  module-plugin.schema.json
  module-invocation.schema.json
  module-route-decision.schema.json
  module-step-invocation.schema.json
  module-step-result.schema.json
  module-result.schema.json
  requirements-gathering-artifacts.schema.json
  project-overview-artifacts.schema.json
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
release/
  0.1.0.json
scripts/
  verify.mjs
  release-check.mjs
  check-release-manifest.mjs
src/
  index.mjs
  content-digest.mjs
  artifact-runtime.mjs
  module-registry.mjs
  operation-router.mjs
  project-overview.mjs
  project-overview-artifact-validator.mjs
  project-overview-runtime-contracts.mjs
  requirements-gate.mjs
  architecture-runtime-contracts.mjs
  architecture-handoff-validator.mjs
  schema-validation.mjs
  requirements-artifact-validator.mjs
  requirements-runtime-contracts.mjs
  architecture-artifact-validator.mjs
  shared-artifact-validator.mjs
test/
```

Release verification:

```sh
npm run release:check
```

For the test and static-analysis subset:

```sh
npm run verify
```

The next lifecycle boundary is the Architecture Gate. It must bind its decision
to the exact candidate, approved requirements, approved project overview,
project state, policy version, and evidence before creating or updating an
`ArchitectureBaseline`.

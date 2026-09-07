# DevRelay

DevRelay is a small deterministic runner for composable software-engineering
Modules with a Core-owned lifecycle traceability sidecar.

## Current status and pickup

Use these documents in order when inspecting or resuming DevRelay:

- **Current status:** [CURRENT_STATUS.md](CURRENT_STATUS.md) records the canonical release state, lifecycle position, evidence, blockers, and next product increment.
- **Handoff overview:** [handoff/2026-08-22-ep001-environment-preparation-release/README.md](handoff/2026-08-22-ep001-environment-preparation-release/README.md) summarizes the completed release and the exact pickup boundary.
- **Exact next actions:** [handoff/2026-08-22-ep001-environment-preparation-release/NEXT_ACTIONS.md](handoff/2026-08-22-ep001-environment-preparation-release/NEXT_ACTIONS.md) gives the ordered, gate-by-gate work required next.
- **Pickup prompt:** [handoff/2026-08-22-ep001-environment-preparation-release/PICKUP_PROMPT.md](handoff/2026-08-22-ep001-environment-preparation-release/PICKUP_PROMPT.md) is the self-contained prompt to give the next ChatGPT/Codex Desktop task.
- **Roadmap:** [Roadmap.md](Roadmap.md) contains the approved, prioritized product initiatives.

This status page is a human-readable projection; digest-bound lifecycle
artifacts and Gate records remain authoritative.

It does not replace engineering tools, coding agents, or model providers. A
semantic Module defines a stable engineering contract, configured adapters
implement bounded capabilities, and DevRelay Core owns routing, sequencing,
validation, checkpointing, traceability, and progression.

## Release status

DevRelay `0.11.0-rc.2` is the locally prepared Apache-2.0 source/library release candidate, building on the published [v0.11.0-rc.1 GitHub prerelease](https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.1), containing DevRelay Core,
`TraceabilityGraph`, `requirements-gathering@0.1.0`,
`architecture-discovery@0.1.0`, `architecture-design@0.1.0`, `contract-generation@0.1.0`, `work-breakdown@0.1.0`,
`work-dependency-analysis@0.1.0`, `specialist-assignment@2.0.0`,
`work-execution@0.1.0`, `work-item-verification@0.1.0`, and
`change-integration@0.1.0`, `system-verification@0.1.0`, the cross-cutting `roadmap-management@0.1.0`, `project-memory@0.1.0`, `quality-policy@0.1.0`, `work-continuity@0.1.0`, and `project-control@0.1.0`, `environment-preparation@1.0.0`, and the separate
`business-acceptance-gate@0.1.0`. Source-package
versions and immutable Module
versions are intentionally independent. The supported distribution is GitHub
source plus a deterministic installable tarball; no public npm publication is
claimed. See [LICENSE](LICENSE) and [RELEASE.md](RELEASE.md).

The release contains Core, schemas, versioned manifests, fixtures, bounded
adapter contracts, a small nine-operation facade, workflow profiles, a
filesystem-backed local Windows host boundary, and a deterministic operator CLI.
The next release candidate also includes a validated, deliberately installed
ChatGPT Desktop orchestration plug-in; it is not a one-click managed distribution
or a hosted backend. See [Desktop orchestration](docs/desktop-orchestration.md). The
Windows Desktop facade requires a trusted fresh-task session bootstrap and passes
its exact receipt into every public operation. Provider maturity is evidence-bound: manifests and contract conformance never imply live execution, while validated host-observed provider receipts may raise an exact binding to live-conformant maturity.
ArchitectureDiscovery includes its deterministic offline native inventory plug-in; optional analyzers remain bounded adapter ports.
WorkDependencyAnalysis includes its provider-neutral native structured proposer,
ContractGeneration includes its deterministic JSON Schema generator, and
WorkExecution includes the complete Core-owned readiness, binding, raw-byte
checkpoint, zero-call replay, result-assembly, and trusted candidate-traceability
runtime behind a proposer-only executor port. Execution-era graphs explicitly opt
into traceability vocabulary 1.6; historical circuits remain byte-identical on
the 1.5 default. ChangeIntegration includes its bounded local Git adapter.
SystemVerification includes fixture-conformant test and review verifier
bindings; it creates no BusinessAcceptance fact or decision. EnvironmentPreparation
adds a deterministic native Windows inventory, explicit remediation review,
single-use readiness Gate, and trusted V1.7 environment traceability for the
supported ChatGPT/Codex Desktop on Windows lifecycle.

## Source setup and verification

From a source checkout with Node.js 22 or 24:

```sh
npm ci
npm run verify
npm run release:check
```

`verify` parses JSON, checks JavaScript syntax and LF-only text, and runs
the complete suite. `release:check` also verifies the release digest catalog
as a mandatory release input, builds an allowlisted tarball in a temporary
directory, installs it offline, and exercises every fixed and wildcard public
package export from the installed bytes.

For the dynamic, human-readable run projection available to Desktop hosts, see
[LifecycleRunReport](docs/lifecycle-run-report.md). Its ledger, ready-frontier,
snapshot, content-policy, and Markdown renderer APIs are available from
`devrelay/advanced`; the report remains read-only and never controls a Gate.

For isolated worktree scheduling, bounded Desktop task receipts, adversarial
review policy, restart recovery, and repository-triggered ProjectMemory bootstrap, see
[DevRelay Desktop orchestration](docs/desktop-orchestration.md).

## Library quickstart

The package root is intentionally limited to nine ordinary operations:

```js
import {
  createDevRelay,
  createLocalHost,
  defineModule,
  definePlugin,
  inspect,
  resume,
  run,
  verify,
} from "devrelay";

// services must contain bootstrap, run, resume, verify, and inspect.
const host = createLocalHost({ hostId: "desktop.windows", services, grants });
const relay = createDevRelay({
  projectId: "example",
  host,
  profile: "standard",
  modules: [defineModule(moduleDefinition)],
  plugins: [definePlugin(pluginDefinition)],
});
const result = await run(relay, {
  taskId: "desktop-task-42",
  goal: "Build the feature",
});
```

A fresh `taskId` is the Desktop task/tab boundary. The trusted `bootstrap` service
must return a valid digest-bound `SessionContextReceipt`; missing or stale context
fails closed before the selected operation. See
[DevRelaySessionBootstrap](docs/session-bootstrap.md) and
[RoadmapManagement](docs/roadmap-management.md).

The installed `devrelay` command exposes versioned `init`, `run`, `resume`,
`status`, `verify`, `inspect`, and `evidence` operations. Human output is concise
by default; `--json` is the lossless automation surface.

The Windows Desktop library facade also exposes explicit `conclude`. ProjectMemory loads its digest-bound synopsis, baseline, and trace projection before configured work and uses `/conclude` to present qualitative deltas for owner approval. See [ProjectMemory on ChatGPT Desktop](docs/project-memory.md).

Low-level, provider-neutral Core contracts remain available from the explicit
advanced tier. A host using that tier supplies its own artifact store, checkpoint
store, capability enforcement, and adapter implementations:

```js
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  createModuleRegistry,
  projectOverviewRuntimeArtifactContracts,
  validateRequirementsGatePromotion,
  validateWorkBreakdownGatePromotion,
  workBreakdownRuntimeArtifactContracts,
} from "devrelay/advanced";

const require = createRequire(import.meta.url);
const loadJson = async (specifier) =>
  JSON.parse(await readFile(require.resolve(specifier), "utf8"));

const requirements = await loadJson(
  "devrelay/modules/requirements-gathering.module.json",
);
const architecture = await loadJson(
  "devrelay/modules/architecture-design.module.json",
);
const workBreakdown = await loadJson(
  "devrelay/modules/work-breakdown.module.json",
);

// The downstream WorkBreakdown bundle composes the complete ArchitectureDesign,
// RequirementsGathering, and ProjectOverview artifact families without
// duplicate schema registrations.
const artifactContracts = workBreakdownRuntimeArtifactContracts();

// Plug-ins are exact host-supplied { definition, adapter } bindings. DevRelay
// has no post-construction registration or implicit adapter lookup.
export function createDevRelayRegistry({ plugins }) {
  return createModuleRegistry({
    modules: [requirements, architecture, workBreakdown],
    artifactContracts,
    plugins,
  });
}

// A standalone Requirements Gate or context consumer can still register only
// the ProjectOverview artifact family.
const overviewOnlyContracts = projectOverviewRuntimeArtifactContracts();
```

### Traceability sidecar quickstart

A host configures graph-aware execution once without changing a Module or
adapter. From that point, ordinary `execute()` cannot bypass graph projection:

```js
import {
  architectureTraceabilityContributors,
  createInMemoryTraceabilityCheckpointStore,
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
  requirementsTraceabilityContributors,
  workBreakdownTraceabilityContributors,
} from "devrelay/advanced";

const traceabilityGraph = createTraceabilityGraphService({
  graphId: "graph-example",
  projectId: "project-example",
  store: createInMemoryTraceabilityStore(),
  contributors: [
    ...requirementsTraceabilityContributors,
    ...architectureTraceabilityContributors,
    ...workBreakdownTraceabilityContributors,
  ],
});
const traceabilityCheckpoints =
  createInMemoryTraceabilityCheckpointStore();

const tracedRegistry = createModuleRegistry({
  modules: [requirements, architecture, workBreakdown],
  artifactContracts,
  plugins, // the same exact host-supplied constructor bindings
  traceability: {
    graph: traceabilityGraph,
    checkpoints: traceabilityCheckpoints,
  },
});

const executionRecord = await tracedRegistry.execute(invocation, runtimeContext);
```

`executionRecord` contains the original validated `ModuleResult`, canonical
`TraceabilityUpdate`, exact persisted traceability checkpoint, merge receipt,
resulting graph reference, diagnostics, and application proof. Core checkpoints
the exact prepared update before graph application, so a retry can complete
without rerunning the adapter. Adapters never receive the graph service or
checkpoint store. Use a durable atomic implementation of both store boundaries
outside local and conformance use. An unconfigured registry preserves exact
0.1 `execute()` behavior; `executeWithTraceability()` remains the explicit
advanced seam.

Register exact plug-in manifests and host adapter functions before resolving
or executing an invocation. There is no implicit adapter, version, model, or
external command. `workBreakdownRuntimeArtifactContracts()` includes the
complete ArchitectureDesign, RequirementsGathering, and ProjectOverview
families transitively. Hosts that execute only an earlier lifecycle slice may
register its narrower runtime-contract bundle instead.

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

`validateWorkBreakdownGatePromotion()` uses the same checkpoint-only trust
boundary. It derives the operation, candidate, diagnostics, and exact loaded
inputs from the unforgeable replay receipt; callers cannot substitute them. It
resolves already-satisfied evidence, requires separate Gate-owned approval for
every no-work disposition, verifies the proposed `WorkBreakdownBaseline`
against its exact raw bytes, and returns the only bytes the host may commit.
Dependency-hint semantics remain outside this Gate.

## Schema identifiers

`https://devrelay.dev/...` schema URIs are stable identifiers; this release
does not claim that they are network-hosted endpoints. Core registers the
bundled schemas locally and never fetches them from the network. Consumers can
resolve raw schema documents through exported package paths such as
`devrelay/contracts/module-definition.schema.json`, or directly under
`contracts/` in a source checkout.

## Current vertical slices

Cross-cutting quality, duplicate-work prevention, and read-only project control are documented in [Quality, continuity, and project control](docs/quality-continuity.md).

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
  -> caller supplies the exact architecture baseline, contract disposition,
     repository context, capability catalog, and work-breakdown state
  -> WorkBreakdown@establish-breakdown | @decompose-change
  -> configured Spec Kit tasks, OpenSpec tasks, or compatible bounded adapter
  -> WorkBreakdownDraft | WorkBreakdownChangeSetDraft | clarification
  -> separate WorkBreakdown Gate
  -> WorkBreakdownBaseline
  -> WorkDependencyAnalysis owns the authoritative dependency DAG
  -> SpecialistAssignment selects a compatible executor for ready work
  -> EnvironmentPreparation inventories, remediates, verifies, and issues one
     single-use readiness receipt for the exact ready frontier
  -> WorkExecution consumes that receipt and performs one authorized bounded work item
  -> WorkItemVerification proves that work item against its evidence plan
  -> ChangeIntegration combines individually verified changes safely
  -> SystemVerification validates the integrated system
  -> BusinessAcceptance evaluates objectives, metrics, and acceptance criteria
```

[EnvironmentPreparation 1.0.0 Windows Desktop guide](docs/environment-preparation.md)
documents two-layer profiles, native and optional adapter boundaries, mutation
approval, Gate outcomes, readiness consumption, traceability, and scope limits.

[WorkItemVerification 0.1.0 operator and adapter guide](docs/work-item-verification.md)
documents the verification boundary, exact artifacts, operator routes, and
extension contract. It describes the released provider-neutral verification contract and its
fixture-conformant test/review adapter bindings.

[ChangeIntegration 0.1.0 operator and adapter guide](docs/change-integration.md)
documents exact verified-subject binding, deterministic plans, local target
compare-and-swap, conflict and uncertain-effect recovery, outcomes,
traceability, and the separate downstream SystemVerification boundary.

[ArchitectureDiscovery 0.1.0 operator and adapter guide](docs/architecture-discovery.md)
documents deterministic routing, offline inventory and source-consent controls,
optional analyzers, confidence and gaps, replay, observational traceability,
and the separate ArchitectureDesign authority boundary.

[SystemVerification 0.1.0 operator and adapter guide](docs/system-verification.md)

[BusinessAcceptance Gate operator guide](docs/business-acceptance.md)
documents the immutable integrated-system subject, obligation and evidence
contract, verifier boundary, checkpoint replay, trusted forward traceability,
and the separate downstream BusinessAcceptanceGate boundary.

`ArchitectureDiscovery` is conditional for an existing repository without a
validated architecture baseline or current snapshot. `ContractGeneration` is
conditional when approved interface intent requires formal APIs, schemas,
events, protocols, or other machine-readable contracts. These fourteen
lifecycle components are the complete owner-approved V1 inventory.

`TraceabilityGraph` runs beside this sequence rather than appearing as another
box in it. Requirements executions project objectives, capabilities, stories,
criteria, and their links; ArchitectureDesign executions add technical design,
architecture elements, relationships, constraints, interface intent, and
decision records linked to the requirements they support. WorkBreakdown adds
candidate work items and exact approved-upstream planning edges. Future
contributors extend the same vocabulary with contracts, code changes, tests,
and verification evidence.

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

The current project-wide pair is stored under `project/`, and the generated
readable projection is the repository-root `ProjectOverview.md`. Existing
module-specific overviews under `dogfood/architecture-design/` and
`dogfood/work-breakdown/` remain immutable historical feature evidence; they
are not the current DevRelay project context. Future features and Modules must
evolve the global pair through RequirementsChangeSet and
ProjectOverviewChangeSetDraft artifacts rather than establish another initial
project overview.

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
prerequisite. DevRelay ships the bounded `ArchitectureDiscovery 0.1.0`
contract and its verified Core building blocks; the host composes the effect
execution and durable stores. Project state selects the route; a model or
adapter cannot improvise it.

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
Reusable bounded host-executor adapters for the design-change chain are
available from `devrelay/adapters/architecture-host-executors`, including a
factory that assembles their exact published ModuleRegistry bindings. These
are provider-response and fixture conformant, not a claim of live upstream CLI
conformance. This adapter version rejects all provider-authored
`live-conformant` responses; live maturity requires a future separately
versioned trusted execution-attestation contract. OpenSpec Design has no
`establish-baseline` manifest binding;
that chain continues to require the separately configured Spec Kit designer.

Core does not inject project context from global state or conversational memory.
The exact `project-overview-baseline` is a required declared invocation input,
is copied into architecture state/candidate lineage, and participates in
invocation and resume identity. Changing it invalidates replay.

### WorkBreakdown 0.1.0

WorkBreakdown converts exact approved scope into a complete candidate set of
bounded, traceable, independently executable and verifiable actions. It does
not execute work, build code, assign specialists, estimate, schedule, or claim
completion. Project state deterministically selects `establish-breakdown` when
no work baseline exists and `decompose-change` when an exact current baseline
and approved change package exist.

Each work item is a closed contract containing:

```text
id | objective | bounded-scope | deliverables | work-type
acceptance-criterion-refs | architecture-refs | contract-refs
required-capabilities | dependency-hints | verification-plan
required-evidence | source-refs
```

The seven deliverable-oriented work types are `code-change`, `test-change`,
`migration`, `configuration-change`, `infrastructure-change`,
`documentation-change`, and `operational-readiness`. Dependency hints remain
proposals; WorkDependencyAnalysis owns authoritative ordering and cycle checks.

Every authorized acceptance criterion, architecture target, and applicable
contract target must be planned, already satisfied with current evidence, or
explicitly approved as requiring no work. The WorkBreakdown Gate rejects
unscoped work, uncovered scope, invalid references, and stale typed changes.

Both operations require checkpoint-capable effect adapters because Gate
promotion depends on a verified terminal checkpoint; pure bindings are
rejected at compatibility resolution. Attached architecture models and
ApprovedChangePackage graph references are resolved as exact content-addressed
inputs before candidate acceptance.

Spec Kit tasks and OpenSpec tasks are bounded replaceable adapters implementing
both operations. Their greenfield/change preference is host configuration, not
Core routing. Before adapter entry, the registered state guard detects baseline
or repository drift and returns a checkpointed `baseline_drift` result with no
candidate.
That outcome is guard-owned; an adapter cannot claim it after preflight has
passed.
Successful validated candidates are projected by a trusted contributor as
planning facts only; no implemented, realized, or verified claim is created.

### WorkDependencyAnalysis 0.1.0

WorkDependencyAnalysis turns the complete approved work breakdown and exact
project context into one static, policy-allowed dependency DAG. It consumes a
full `WorkBreakdownBaseline`, `ProjectOverviewBaseline`, repository- and
version-pinned context slices, deterministic routing state, and an exact OPA
policy-bundle manifest.

```text
Full work-breakdown snapshot
  + version-pinned relevant context slices
  -> deterministic snapshot builder
  -> configured dependency proposer
  -> Core Graphology-DAG mechanics
  -> Core OPA WASM policy evaluation
  -> bounded advisory consistency reviewer
  -> WorkDependencyCandidate
  -> terminal checkpoint
```

Proposers may declare typed work-item references and evidence only. They cannot
create graph nodes, choose traceability relationships, evaluate policy, approve
the result, schedule work, or execute it. Core owns graph mechanics and policy
decisions; the configured reviewer is advisory and has no promotion authority.

The Module has one deterministic operation, `analyze-dependencies`, and returns
one primary success artifact, `WorkDependencyCandidate`. The separate
WorkDependency Gate derives the candidate from an unforgeable checkpoint replay
receipt, verifies exact approval and proposed-baseline raw bytes, and returns
the only promotable `WorkDependencyBaseline` payload.

Only a promoted baseline contributes dependency traceability. The trusted
contributor stores the forward planning relationship
`WorkItem prerequisite -> prerequisite-for -> WorkItem dependent`. No inverse
edge, scheduling fact, assignment, implementation claim, or completion claim is
created.

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
                         |
              Core-owned TraceabilityUpdate
                         v
              ModuleExecutionRecord
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
- `ModuleExecutionRecord` is returned by graph-aware Core execution and binds
  the unchanged `ModuleResult` to its validated update, exact persisted
  checkpoint, merge receipt, diagnostics, and application proof. It is not
  authored by an adapter and does not promote a candidate.

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
- discover a trusted input guard from validated artifact contracts, checkpoint
  a terminal `baseline_drift` result under its own producer identity, and
  replay it without invoking the configured adapter;
- resolve every adapter before invoking the first step;
- invoke steps only in declared order;
- validate intermediate handoff content and terminal candidate semantics
  before checkpointing or progression;
- verify that ProjectOverview artifacts are exact requirements projections and
  load the digest-bound `ProjectOverview.md` raw bytes before progression;
- validate paired Requirements/ProjectOverview promotion while leaving policy
  approval and atomic persistence to the host;
- stop deterministically on declared early terminal outcomes;
- validate WorkBreakdown promotion only from an unforgeable checkpoint replay
  and exact raw baseline bytes, returning an atomic commit payload while
  leaving approval and persistence to the host;
- require effect results—including legacy single adapters—to be durably
  stored before downstream work;
- key step checkpoints by the complete step invocation, including prior
  results, and fail closed on malformed replay;
- restore completed handoffs from source invocation checkpoints bound by a
  portable continuation, then resume at the recorded ArchitectureDesign step;
- reject non-JSON invocation, result, definition, and adapter-context state,
  and create a distinct immutable data context for every adapter;
- preserve the existing single-adapter RequirementsGathering contract path;
- project validated Module artifacts through trusted, versioned contributors;
- checkpoint every exact traceability update before atomic, idempotent graph
  application and replay it without rerunning a completed adapter;
- keep candidate and approved observations distinct by authority and scope;
- reject output- or evidence-bearing graph-aware results that have no matching contributor;
- preserve graph history through retirement and supersession;
- query deterministic forward/reverse paths and report horizon-aware orphaned
  requirements, unscoped work, and missing passing evidence.

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

## Dogfood evidence

In a source checkout, `dogfood/work-breakdown/` records the complete
module-by-module run used for this release: interactive RequirementsGathering,
approved paired requirements/project-overview baselines, ArchitectureDesign
discovery and baseline establishment, and the executable WorkBreakdown run.
The evidence tree is intentionally excluded from the installable package.

The WorkBreakdown proof state-routes the existing repository through
`establish-breakdown` with a bounded `openspec-tasks` fixture, produces seven
exact work items, covers all 10 acceptance criteria and 12 architecture
elements, merges 37 forward planning edges into graph revision 1, and records
the merge in `ModuleExecutionRecord`. Checkpoint replay invokes the adapter
zero additional times; a stale-baseline run and its replay also invoke it zero
times. The Gate uses the verified checkpoint receipt and commits the exact
raw-byte-bound baseline payload.

The released WorkBreakdown proof did not execute upstream OpenSpec, Spec Kit,
Structurizr, or MADR command adapters; its checked-in fixtures prove bounded
adapter and normalization contracts, not live command interoperability or
completed implementation work. The later WorkDependencyAnalysis architecture
candidate separately runs a pinned official Structurizr validator and JSON
exporter as Gate conformance evidence. That verifier is not a live Structurizr
adapter and does not expand the released module's authority.

The released WorkDependencyAnalysis dogfood run uses the promoted 11-item work
breakdown, the exact ProjectOverview, and three version-pinned slices covering
requirements, architecture, and repository revision. The native structured
proposer ran once, Core used real Graphology-DAG mechanics and the pinned OPA
WASM policy bundle, and a bounded Spec Kit fixture performed the advisory
review. Exact retry used the terminal checkpoint with zero proposer or reviewer
calls. The candidate, Gate review, approval candidate, and checkpoint are
byte-stable across independent materializations.

The exact owner-approved candidate was promoted to a byte-bound
`WorkDependencyBaseline`. Its trusted contributor atomically merged 10 forward
`prerequisite-for` edges into TraceabilityGraph revision 3 and stored the
checkpoint, update, merge receipt, graph checkpoint, and execution record.
Replaying promotion returns the identical baseline and merge proof without
invoking a proposer or reviewer. That baseline now authorizes progression to
`SpecialistAssignment`.

## Repository

```text
.github/workflows/verify.yml
contracts/
  module-*.schema.json
  requirements-gathering-artifacts.schema.json
  project-overview-artifacts.schema.json
  architecture-design-artifacts.schema.json
  work-breakdown-artifacts.schema.json
  work-dependency-analysis-artifacts.schema.json
  traceability-graph-artifacts.schema.json
docs/
  module-contract.md
  requirements-gathering.md
  architecture-design.md
  work-breakdown.md
  work-dependency-analysis.md
  traceability-graph.md
dogfood/
  architecture-design/
  work-breakdown/
  work-dependency-analysis/
examples/
  artifacts/
  invocations/
  modules/
  native/
  plugins/
  results/
openspec/schemas/
  devrelay-requirements/
  devrelay-architecture/
  devrelay-work-breakdown/
policies/
  work-dependency-analysis/
release/
  0.1.0.json
  0.2.0.json
  0.3.0.json
  0.4.0.json
scripts/
  verify.mjs
  release-check.mjs
  check-release-manifest.mjs
src/
  artifact-runtime.mjs
  module-registry.mjs
  operation-router.mjs
  requirements-*.mjs
  project-overview-*.mjs
  architecture-*.mjs
  work-breakdown-*.mjs
  work-dependency-*.mjs
  traceability-*.mjs
  module-execution-record-validator.mjs
  index.mjs
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

`WorkDependencyAnalysis@0.1.0` is released with its exact byte-bound baseline
and graph merge proof. The next lifecycle module to build through the dogfood
sequence is `SpecialistAssignment`.

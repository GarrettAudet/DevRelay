# ArchitectureDesign

## Status

Executable first-pass contract for DevRelay's second semantic module. It is
defined by the approved paired requirements/project-overview dogfood baseline
under `dogfood/architecture-design/`.

## Purpose

`ArchitectureDesign` converts an approved, version-aligned
`RequirementsBaseline` + `ProjectOverviewBaseline` pair into exactly one
architecture candidate:

- `establish-baseline` produces an `ArchitectureDraft`;
- `design-change` produces an `ArchitectureChangeSetDraft`.

It does not approve that candidate. A separate Architecture Gate decides
whether a draft becomes a new `ArchitectureBaseline` or a change set updates
an existing one. `ProjectOverviewBaseline` is an explicit immutable Module
input, not hidden Core state or conversational context.

## Deterministic routing

The runtime reads a closed `ProjectArchitectureState`; neither the model nor an
adapter chooses the operation.

| Project state | Core decision |
| --- | --- |
| `greenfield-unbaselined` | `architecture-design#establish-baseline` |
| `existing-undiscovered` | prerequisite `architecture-discovery#discover` |
| `existing-discovered-unbaselined` | `architecture-design#establish-baseline` |
| `baselined` | `architecture-design#design-change` |

The discovery prerequisite must produce a `CurrentArchitectureSnapshot`. A
repository snapshot alone is not an architecture baseline. The snapshot's
revision and tree digest must match that exact repository artifact, and a
blocking discovery gap prevents a successful architecture draft until it is
clarified. Once discovery is recorded, Core derives a new provider-neutral
`ModuleRouteDecision` and can invoke `establish-baseline`.

`ArchitectureDiscovery` is only an explicit prerequisite contract in `0.1.0`;
DevRelay does not ship an executable discovery Module. For a brownfield project
without an architecture baseline, the caller must supply a validated
`CurrentArchitectureSnapshot` before ArchitectureDesign can route to
`establish-baseline`.

The state and route decision are required operation inputs. Core verifies the
raw state bytes and digest, validates the state contract, persists the derived
decision through the host, and recomputes it during execution. Routing rules
are declarative Module metadata. The generic router fails closed for missing or
tampered state, an unknown discriminator, duplicate routes, a prerequisite,
an undeclared operation, or an invocation that disagrees with the route.
`projectLifecycle` describes the current repository condition, not historical
origin: an `existing` baselined project requires an exact repository snapshot,
while a `greenfield` baselined project has none. The lifecycle must match the
loaded `ProjectContext` and transitions to `existing` when a repository
becomes authoritative.

The state also pins the exact approved `ProjectOverviewBaseline`, which must
match the invocation's declared `project-overview-baseline` input. Core never
looks it up from a global project record or injects it on the caller's behalf.

## V1 adapter circuits

Adapter selection is exact-version configuration. The Module declares stable
step roles and handoff contracts; the named products below are V1 defaults,
not kernel branches.

```text
establish-baseline
  RequirementsBaseline + ProjectOverviewBaseline + ProjectArchitectureState
  -> designer: SpecKitPlanAdapter
  -> modeler: StructurizrAdapter
  -> decision-recorder: MADRAdapter
  -> ArchitectureDraft

design-change
  RequirementsBaseline + ProjectOverviewBaseline
  + ArchitectureBaseline + ProjectArchitectureState
  -> designer: OpenSpecDesignAdapter
  -> modeler: StructurizrAdapter
  -> decision-recorder: MADRAdapter
  -> ArchitectureChangeSetDraft
```

Core resolves every configured adapter before execution, verifies every input
from raw bytes, invokes steps in declared order, validates exact state and
handoff lineage, persists each effect result before progression, and accepts a
semantically validated terminal `ModuleResult` only from the final step. The
runtime suite executes both V1 circuits and replaces the Structurizr binding
with a second compatible modeler without changing the Module or generic Core.
The same generic machinery passes `project-overview-baseline` to every step;
there is no product- or Module-specific injection branch.

## One primary output

Each successful operation exposes only its one primary candidate. The
candidate contains seven required canonical sections, each either embedded or
attached by immutable `ArtifactRef`:

1. `technicalDesign`
2. `architectureModel`
3. `diagrams`
4. `interfaceIntent`
5. `architectureConstraints`
6. `decisionRecords`
7. `nativeArtifacts`

These are not separate Module outcomes. Native files remain subordinate
evidence with exact producer and normalization provenance. Designer and
modeler handoffs may contain only their own native evidence; the terminal
candidate must carry those exact sets and may add only decision-recorder
evidence. Discovery evidence remains in the referenced discovery snapshot.
Attached canonical sections use their section-specific JSON schema and media
type. Their
`ArtifactRef.digest` always names the exact stored bytes; verified loading does
not silently replace that identity with a canonicalized JSON digest. Every
`NativeArtifactSet` entry is loaded as raw bytes and digest-verified before a
handoff or terminal candidate can be checkpointed. For a producing stage,
`producedBy.tool` must exactly reproduce the tool name and version pinned in
that adapter's invocation configuration.

Every recursive `sourceRefs[]` citation is closed over an exact invocation
input, an already validated prior handoff, or a digest-verified native artifact
from the current artifact. A fabricated or merely well-shaped evidence pointer
fails before progression.

An `ArchitectureDraft` pins `projectOverviewBaseline`; an
`ArchitectureChangeSetDraft` pins `targetProjectOverviewBaseline`. Each must
equal the state and invocation input exactly. This keeps the readable project
purpose, users, key capabilities, business outcomes, scope, constraints, and
current status available to every adapter without making Markdown or chat
memory authoritative.

Every successful candidate contains exactly one traceability disposition for
every normative approved requirement—the union of `US-*` user stories,
`NFR-*` non-functional requirements, and `CON-*` constraints—and may not cite
an ID absent from the loaded `RequirementsBaseline`. Trace targets and each
entity's
`sourceRequirementIds` are exactly reciprocal. Native canonical mappings use
resolvable RFC 6901 pointers into the actual candidate sections. A change set
is also an exhaustive semantic delta: every changed element, relationship,
view, interface, constraint, and decision must have exactly one matching
declared change.

`interfaceIntent` defines ownership, participants, boundaries, and protocol
intent. Detailed OpenAPI, AsyncAPI, protobuf, database, and other contracts
belong to downstream ContractGeneration. Architecture enforcement belongs to
downstream Verification.

## Step contracts

The designer emits provider-neutral technical design work. The modeler
consumes that exact handoff and adds the canonical architecture model and
diagram material. The decision recorder consumes the exact modeler handoff,
records alternatives, rationale, and consequences, and produces the sole
terminal candidate.

Each step invocation binds:

- the parent Module invocation and operation;
- its declared step role and exact adapter version;
- immutable external inputs, including the paired requirements and project
  overview, and the previous step output;
- adapter configuration and capability grants.

Each step result binds:

- its exact step invocation;
- lifecycle status and bounded outcome;
- immutable produced artifacts;
- evidence, native-source provenance, and diagnostics.

Early `needs_clarification`, `unable_to_proceed`, or `execution_failed`
outcomes stop the chain. Later steps are not invoked.

## Clarification and resume

Blocking ambiguity produces architecture-specific clarification requests and a
continuation bound to the source invocation, exact operation, chain fingerprint,
paused step, project state, requirements baseline, project-overview baseline,
lineage inputs, and completed step/result digests.

Resume requires the matching request, responses, continuation, referenced
artifact bytes, and original source step checkpoints together.

Core validates the emitted clarification request and continuation as one
atomic output before checkpointing the pause. It then revalidates each
checkpoint and completed handoff, restores prior results, and starts at
`modeler` or `decision-recorder` without rerunning completed
designer/modeler effects. Each completed stage carries its own source invocation
ID, fingerprint, plug-in, and step-invocation digest, so a second clarification
after a resume can safely combine checkpoints from multiple invocation
generations. The top-level continuation carries the same four-field identity
for the terminal step that emitted it. Resume requires that exact
schema-validated terminal checkpoint, with `needs_clarification` and the exact
request and continuation references; a fabricated artifact triad is
insufficient. The continuation is portable metadata, but it is not a
standalone proof of prior execution. A host moving the workflow must move the
complete resume package. A changed lineage input,
adapter binding, configuration, grant, option, or checkpoint fails closed. No
conversational, model-provider, or native-tool session memory is authoritative.
A changed `ProjectOverviewBaseline` is a changed lineage input and therefore
invalidates the invocation fingerprint, continuation, and replay checkpoints.

## Module validation versus Architecture Gate

Module validation answers whether the route, chain, handoffs, references,
sections, provenance, and result contract are structurally and semantically
valid. It cannot answer whether the proposed architecture is desirable or
approved.

The Architecture Gate evaluates fitness against requirements, constraints,
risks, the approved project overview, interface intent, decisions, and required
evidence. Progression binds the gate decision to the exact primary-candidate,
requirements-baseline, project-overview-baseline, and state digests.

## Bounded upstream capabilities

DevRelay uses only the relevant capability of each upstream project:

| Adapter | Bounded capability |
| --- | --- |
| Spec Kit plan | technical planning for baseline establishment |
| OpenSpec design | `design.md` technical approach for an approved change |
| Structurizr | architecture model and diagram materialization through the logical `structurizr-export` capability |
| MADR | architecture decision records |

DevRelay does not run an upstream repository's full workflow as one Module.
The manifests in `examples/plugins/` define bounded bindings; executable
tests prove default-chain resolution, both operation paths, and compatible
modeler replacement. V1 designer adapters use only the `agent-command` bridge
and request no process-spawn capability. A future `process-json` bridge must
ship as a separately reviewed plug-in version with explicit grants. Live CLI
adapters are not shipped or claimed in this pass. In particular,
`structurizr-export` is a tool-neutral adapter capability name, not a
dependency on the retired legacy Structurizr CLI distribution.

## End-to-end progression

```text
Approved RequirementsBaseline + ProjectOverviewBaseline
  -> Core reads ProjectArchitectureState
  -> host persists Core's content-bound ModuleRouteDecision
  -> execution reloads state and recomputes the same route
  -> Core resolves exact adapter chain
  -> designer handoff validation
  -> modeler handoff validation
  -> decision-recorder terminal validation
  -> ArchitectureDraft | ArchitectureChangeSetDraft
  -> Architecture Gate
  -> approved ArchitectureBaseline | revised candidate | blocked
```

Every arrow carries explicit content-addressed artifacts. Generic Core owns
validation, deterministic route selection, sequencing, checkpointing, and
progression, but it does not synthesize or inject ProjectOverview context.

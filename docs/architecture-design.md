# ArchitectureDesign

## Status

Executable first-pass contract for DevRelay's second semantic module. It is
defined by the approved dogfood baseline under
`dogfood/architecture-design/requirements-baseline.json`.

## Purpose

`ArchitectureDesign` converts an approved `RequirementsBaseline` into exactly
one architecture candidate:

- `establish-baseline` produces an `ArchitectureDraft`;
- `design-change` produces an `ArchitectureChangeSetDraft`.

It does not approve that candidate. A separate Architecture Gate decides
whether a draft becomes a new `ArchitectureBaseline` or a change set updates
an existing one.

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
repository snapshot alone is not an architecture baseline. Once discovery is
recorded, Core derives a new provider-neutral `ModuleRouteDecision` and can
invoke `establish-baseline`.

The state and route decision are required operation inputs. Core verifies the
raw state bytes and digest, validates the state contract, persists the derived
decision through the host, and recomputes it during execution. Routing rules
are declarative Module metadata. The generic router fails closed for missing or
tampered state, an unknown discriminator, duplicate routes, a prerequisite,
an undeclared operation, or an invocation that disagrees with the route.

## V1 adapter circuits

Adapter selection is exact-version configuration. The Module declares stable
step roles and handoff contracts; the named products below are V1 defaults,
not kernel branches.

```text
establish-baseline
  RequirementsBaseline + ProjectArchitectureState
  -> designer: SpecKitPlanAdapter
  -> modeler: StructurizrAdapter
  -> decision-recorder: MADRAdapter
  -> ArchitectureDraft

design-change
  RequirementsBaseline + ArchitectureBaseline + ProjectArchitectureState
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
evidence with exact producer and normalization provenance.

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
- immutable external inputs and the previous step output;
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
paused step, project state, lineage inputs, and completed step/result digests.
Resume requires the matching request, responses, continuation, referenced
artifact bytes, and original source step checkpoints together.

Core revalidates each checkpoint and completed handoff, restores prior results,
and starts at `modeler` or `decision-recorder` without rerunning completed
designer/modeler effects. The continuation is portable metadata, but it is not
a standalone proof of prior execution. A host moving the workflow must move
the complete resume package. A changed lineage input, adapter binding,
configuration, grant, option, or checkpoint fails closed. No conversational,
model-provider, or native-tool session memory is authoritative.

## Module validation versus Architecture Gate

Module validation answers whether the route, chain, handoffs, references,
sections, provenance, and result contract are structurally and semantically
valid. It cannot answer whether the proposed architecture is desirable or
approved.

The Architecture Gate evaluates fitness against requirements, constraints,
risks, interface intent, decisions, and required evidence. Progression binds
the gate decision to the exact primary-candidate digest.

## Bounded upstream capabilities

DevRelay uses only the relevant capability of each upstream project:

| Adapter | Bounded capability |
| --- | --- |
| Spec Kit plan | technical planning for baseline establishment |
| OpenSpec design | `design.md` technical approach for an approved change |
| Structurizr | architecture model and diagram materialization |
| MADR | architecture decision records |

DevRelay does not run an upstream repository's full workflow as one Module.
The manifests in `examples/plugins/` define bounded bindings; executable
tests prove default-chain resolution, both operation paths, and compatible
modeler replacement. Live CLI adapters are not shipped or claimed in this
pass.

## End-to-end progression

```text
Approved RequirementsBaseline
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

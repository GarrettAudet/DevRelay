# RequirementsGathering `0.1.0`

## Executable OpenSpec adapter

The package exports `createOpenSpecRequirementsAdapter` (and the equivalent
`OpenSpecRequirementsAdapter` class) from the root surface and from
`devrelay/adapters/openspec-requirements`. This is the executable binding for
`requirements-gathering@0.1.0` / `openspec@0.1.0`.

The adapter is provider-neutral. A host supplies `executeCapability(request)`
(or the `executor` alias), `loadArtifact(reference)`, and
`persistArtifact(...)` ports. Core owns effect checkpointing: a fresh effect
calls the capability executor exactly once, while exact checkpoint replay does
not invoke the adapter or executor. Clarification resumes carry the exact
request, response, and continuation artifacts without native or conversational
session memory.

For establishment, the executor returns a bounded `OpenSpecRequirementsProposal` or
`OpenSpecRequirementsClarification` envelope and exact native proposal/spec
bytes. Every response must echo the capability binding. Provider fields,
operation or route selection, Gate/promotion assertions, graph operations,
unbound sources, malformed native paths, and binding substitution fail closed.

For baseline revision, the invocation must carry the exact approved
`RequirementsBaseline` and `ProjectOverviewBaseline` pair. The same bounded
proposal response supplies only the full replacement body. The adapter validates
the prior pair, derives the exhaustive lexically sorted requirements diff,
constructs `RequirementsChangeSet`, derives the project-overview projection and
its exhaustive diff/disposition, and emits the paired
`ProjectOverviewChangeSetDraft`. Pair drift, stale projections, no-op revisions,
or a greenfield outcome against baseline inputs fail closed.

Maturity is **reusable executable adapter with a host-supplied capability
executor** for both new-baseline establishment and approved-baseline revision,
including clarification/resume. It does not invoke or prove interoperability
with the OpenSpec CLI.

## Responsibility

`RequirementsGathering` turns an explicit goal and project context into a typed
requirements candidate and its deterministic project-overview projection. It
can use a repository snapshot as evidence. A change requires the exact approved
`RequirementsBaseline` + `ProjectOverviewBaseline` pair.

```txt
Goal + Project Context + optional Snapshot + optional paired baselines
                               |
                               v
                       RequirementsGathering
                               |
        +----------------------+-----------------------+
        |                      |                       |
RequirementsDraft      RequirementsChangeSet     clarification
+ ProjectOverviewDraft + ProjectOverviewChangeSetDraft
        |                      |
        +----------------------+
                               |
                               v
          separate Requirements Gate atomically promotes
                               |
                               v
       RequirementsBaseline + ProjectOverviewBaseline
                         + ProjectOverview.md
```

The module validates artifact structure, exact lineage, and handoff integrity. It does not judge requirements completeness or testability, approve, merge, or baseline its own output; those policy decisions belong to the separate gate.

### Project baseline versus feature work

DevRelay has one current project-wide `RequirementsBaseline` +
`ProjectOverviewBaseline` pair under `project/`. The root
`ProjectOverview.md` is its exact deterministic readable projection and is
the context supplied explicitly to downstream lifecycle Modules.

An initial project uses `drafted` once to establish that pair. Subsequent
feature and Module work supplies the current pair and produces
`RequirementsChangeSet` + `ProjectOverviewChangeSetDraft`. Historical
module-specific dogfood overviews remain immutable source evidence; they do
not replace the current project context.

## Inputs

| Port | Required | Meaning |
| --- | --- | --- |
| `goal` | yes | The objective, constraints, assumptions, and initial acceptance intent. |
| `project-context` | yes | Lifecycle, domain constraints, stakeholders, and source references. |
| `repository-snapshot` | no | Immutable codebase evidence. It is not an approved requirements baseline. |
| `requirements-baseline` | no | Exact approved baseline used by a change set. |
| `project-overview-baseline` | no | Exact overview paired with `requirements-baseline`; if either baseline port is present, both are required. Both are absent for an initial draft. |
| `clarification-request` | no | The exact prior request; required as part of a resume triad. |
| `continuation` | no | Tool-neutral partial work bound to that exact request and base inputs. |
| `clarification-responses` | no | Answers bound to the exact request artifact digest. |

## Outcomes

| Outcome | Required contract |
| --- | --- |
| `drafted` | `completed`; no baseline inputs; `RequirementsDraft`, matching `ProjectOverviewDraft`, native-source bundle, and passing provenance evidence. |
| `change_set_drafted` | `completed`; exact paired baseline inputs; `RequirementsChangeSet`, matching `ProjectOverviewChangeSetDraft`, native-source bundle, and passing provenance evidence. |
| `needs_clarification` | `completed`; question set plus portable continuation; no promotable draft/change set. |
| `unable_to_proceed` | `completed`; diagnostics and no domain outputs. |
| `execution_failed` | `failed`; diagnostics and no domain outputs. |

Clarification is a completed, checkpointed invocation. The pipeline obtains
answers and starts a new invocation. No plug-in session is authoritative.

## Runtime Contract Registration

Executable hosts must register `requirementsRuntimeArtifactContracts()` from
`src/requirements-runtime-contracts.mjs`. That bundle performs both schema
validation and the invocation/output lineage checks described here, including
the ProjectOverview family. `architectureRuntimeArtifactContracts()` composes
this bundle transitively. A standalone gate or context consumer can register
`projectOverviewRuntimeArtifactContracts()` directly.

The lower-level `validateRequirementsArtifact()` and
`validateProjectOverviewArtifact()` functions validate portable structure and
intrinsic identity invariants only; neither authorizes progression. After its
policy checks, the host must prove that the exact promotable result came from a
durable terminal checkpoint. It calls
`registry.verifyCheckpointedExecution(invocation, { artifacts, checkpoints })`,
which revalidates the invocation, inputs, terminal result, canonical outputs,
native bytes, and runtime lineage without invoking an adapter. The returned
`VerifiedCheckpointReplayReceipt` is unforgeable process-local state. The gate
passes it as `checkpointReplay`, with each proposed baseline object, its
closed `ArtifactRef`, its exact raw JSON bytes, and the rendered Markdown
bytes, to `validateRequirementsGatePromotion()`. The helper hashes and
fatally decodes both baseline byte sequences, verifies parsed-object equality,
and returns their exact verified bytes as base64 in a frozen `commitPayload`.

A plain serialized `ModuleResult`, a cloned/serialized receipt, candidate
files without their verified bytes, or an arbitrary baseline digest cannot
authorize promotion. A portable content-addressed cross-process verification
receipt is not shipped in V1. The gate helper validates the inseparable pair
but does not persist it; the host atomically commits both decoded payload
documents or neither.

## Stateless Clarification

The clarification request and continuation carry one exact goal and
project-context digest plus optional snapshot/paired-baseline digests. The
continuation
binds the exact request artifact and records the issuing invocation ID,
invocation fingerprint, step-invocation digest, and plug-in identity. A resume
invocation supplies the request, continuation, and response together. Before
the configured plug-in runs, runtime validation loads the trusted source
checkpoint by step-invocation digest and requires the exact terminal
`needs_clarification` result to point to that request and continuation. It also
compares exact base inputs, validates answer types and declared choices, rejects
duplicate or unknown question IDs, and requires every blocking answer.

Because the continuation preserves a complete typed working state, the
contract permits the next invocation to select another compatible plug-in. The
included example proves that GitHub Spec Kit output can be resolved as OpenSpec
input at the contract boundary; operational cross-tool resume remains a
required host-adapter conformance test.

## Draft And Change Set

A `RequirementsDraft` carries an exact `baseInputs` set for the goal,
project context, and optional repository snapshot. Its retained `goal` and
`projectContext` pointers must equal the matching base-input entries. Its
canonical `requirements` body has no duplicate generic `requirements[]` spine.
It contains these typed business/product collections:

- `purpose`;
- `businessObjectives` and measurable `successMetrics`;
- `stakeholders` and `users`;
- `capabilities`, including the key-capability designation;
- `userJourneys` and `userStories`;
- `acceptanceCriteria`;
- measurable `nonFunctionalRequirements`;
- verifiable `constraints`.

It also preserves the project fields used to construct context:
`scope`, `nonGoals`, `terminology`, and `currentStatus`, plus supporting
`assumptions`, `dependencies`, `risks`, `deliverables`, `requiredEvidence`,
and `sourceRefs`.

Stable typed IDs are unique and references are closed across the body. The
normative requirement set consumed by ArchitectureDesign is the union of
`US-*` user-story, `NFR-*` non-functional-requirement, and `CON-*` constraint
IDs. Each has one or more linked `AC-*` acceptance criteria with deterministic
verification. Business objectives, metrics, stakeholders, users, capabilities,
and journeys have reciprocal coverage rather than existing as orphan prose.
Clarification question/response and assumption IDs are also unique. These are
semantic invariants enforced in addition to JSON Schema shape validation.

## Assumption Policy

Each typed assumption contains:

- a stable `ASM-*` ID and statement;
- `status: confirmed | unconfirmed`;
- an explicit `blocking` boolean;
- canonical, non-empty `sourceRefs` preserving why the assumption exists.

Only the conjunction `status: "unconfirmed"` and `blocking: true` prevents
Requirements Gate promotion. An unconfirmed assumption with `blocking: false`
is not silently resolved or dropped: it remains visible in the candidate,
baseline, and downstream context so later work can verify or revise it. A
confirmed assumption does not block promotion; producers should normally set
`blocking: false` once confirmation resolves the uncertainty.

A `RequirementsChangeSet` carries the exact goal, project context, optional
repository snapshot, and required approved requirements/project-overview pair
in `baseInputs`. Its `baseline` pointer must equal the requirements-baseline
entry. The change set is an optimistic full-body replacement, not a list of
item-level patches:

- `expectedRequirementsDigest` must equal the DevRelay Canonical JSON v1 digest
  of the current baseline body;
- `replacement` is one complete typed requirements body;
- `changedSections` is the exact, exhaustive, lexicographically ordered list of
  changed top-level sections.

Runtime validation rejects stale digests, partial bodies, inaccurate section
lists, invalid typed references, and exact no-ops before checkpointing the
candidate.

An existing repository without an approved baseline does not justify an
inferred change set. The plug-in must emit a full draft or clarification.
One baseline without its paired project overview is also invalid input.

For a promotable candidate, the `NativeSourceBundle` must identify the exact
configured plug-in, configured tool name/version, and configured bounded native
operation. It must list exactly the non-native outputs from that invocation as
its canonical outputs. Every unique native source pointer is loaded as raw bytes
and digest-verified; duplicate references, non-portable or ambiguous paths, and
missing/tampered bytes fail closed. Passing provenance evidence cannot
substitute an unrelated bundle.

Every candidate and continuation `sourceRefs[].artifact` citation is closed
over authoritative evidence. A citation must be an exact current base input or,
for a promotable draft/change set only, a digest-verified source in the
same invocation's `NativeSourceBundle`. Clarification continuations may cite
base inputs only.

## Deterministic ProjectOverview

DevRelay derives the overview from the canonical requirements candidate; a
plug-in cannot author an independent competing summary. The structured body
contains exactly:

- `purpose`;
- `businessObjectives`;
- `users`;
- `keyCapabilities`;
- `successMetrics`;
- `scope`;
- `nonGoals`;
- `constraints`;
- `nonFunctionalRequirements`;
- `terminology`;
- `currentStatus`.

`ProjectOverviewDraft` points to its exact `RequirementsDraft`.
`ProjectOverviewChangeSetDraft` points to the exact requirements change and
prior overview, and carries an exhaustive overview `changedSections` list plus
a `changed` or `unchanged` disposition.

The structured candidate also references `ProjectOverview.md` as a raw-byte
attachment. The renderer is contract-versioned and produces one exact
UTF-8-without-BOM, NFC-normalized, LF-only document with a fixed heading order
and terminal newline. Runtime loads those bytes, verifies their SHA-256 digest,
and regenerates the document for exact comparison. The Markdown is a readable
projection, not another editable source of truth.

## OpenSpec Plug-in

The OpenSpec manifest maps only its requirements capabilities:

- proposal and spec artifacts normalize into the typed `RequirementsDraft`,
  from which DevRelay derives `ProjectOverviewDraft`;
- delta specs normalize into a full-body `RequirementsChangeSet`, from which
  DevRelay derives `ProjectOverviewChangeSetDraft`;
- exploration/clarification becomes a request set and continuation;
- native proposal/spec files are preserved in `NativeSourceBundle`.

The binding requires the bounded `devrelay-requirements` OpenSpec schema.
That exact schema name is invocation-pinned and reproduced in native-source
provenance; a generic or differently configured OpenSpec workflow is rejected.

`design.md` belongs to ArchitectureDesign's bounded OpenSpec designer
capability. `tasks.md` remains outside RequirementsGathering and belongs to
downstream work decomposition.

## GitHub Spec Kit Plug-in

The GitHub Spec Kit manifest maps:

- `/speckit.specify` to a canonical typed requirements candidate and derived
  project overview;
- `/speckit.clarify` to the stateless clarification loop;
- the feature spec and clarification content to `NativeSourceBundle`.

Constitution content enters through `ProjectContext`. `/speckit.plan`, `/speckit.tasks`, and `/speckit.implement` are outside this module.

These are contract mappings, not shipped command bridges. Each plug-in
manifest requires constant `toolName` and `nativeOperation` config fields plus
an invocation-pinned `toolVersion`; runtime provenance must reproduce those
values exactly, including an adapter schema when one is configured. Each
executable adapter must demonstrate every declared
input/outcome profile against the same conformance suite before it is considered
operational.

The release uses only these bounded capabilities; it does not embed either
upstream repository or run its full workflow.

## Traceability contribution

On graph-aware execution, Core's trusted RequirementsGathering contributor
projects the validated candidate into business-objective, success-metric,
stakeholder, user, capability, user-journey, user-story,
acceptance-criterion, non-functional-requirement, and
requirement-constraint nodes with their explicit relationships. The
deterministic ProjectOverview is linked as a projection artifact rather than
creating duplicate semantic owners.

Candidate output enters `requirements/candidate` authority. When an approved
requirements/project-overview pair is later supplied to ArchitectureDesign,
the baseline observer projects those exact approved facts into the separate
`requirements/baseline` authority so candidate and approved history coexist.
The Requirements Gate remains the only owner of promotion; this release does
not infer approval from successful execution.

The contributor's contract digest binds its exact scope, authority, and
allowed node/edge kinds. Core owns coalesced artifact-reference assertions.

## Next Gate

The downstream Requirements Validation module should check:

- schema integrity, closed typed references, and exact cross-artifact digest
  bindings;
- complete business-objective, metric, stakeholder, user, capability, journey,
  story, acceptance, NFR, and constraint coverage;
- clarity, testability, and measurable acceptance;
- domain-policy consistency beyond runtime lineage and optimistic concurrency;
- rejection of `unconfirmed + blocking` assumptions while preserving
  unconfirmed nonblocking assumptions;
- security, performance, and operational coverage as configured;
- approval policy.

For an initial approval, the gate atomically promotes
`RequirementsDraft + ProjectOverviewDraft` into a version-aligned
`RequirementsBaseline + ProjectOverviewBaseline` pair. For a change, it
atomically promotes both change candidates into a new pair that supersedes the
old pair. The new overview baseline is mandatory even when its derived content
is unchanged. Both baselines carry the same approval evidence. The host must
commit both or neither; generic Core does not inject, persist, or globally
publish the overview on the gate's behalf.

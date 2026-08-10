# ArchitectureDiscovery 0.1.0

ArchitectureDiscovery describes implemented current state for one exact
existing repository. It produces an observational `CurrentArchitectureSnapshot`
for ArchitectureDesign, or stops with explicit gaps or diagnostics. It does
not propose intended architecture, approve decisions, promote an
`ArchitectureBaseline`, run an Architecture Gate, or control progression.

## Operator circuit

The host loads the exact raw bytes for `ProjectOverviewBaseline`,
`ProjectArchitectureState`, and `RepositorySnapshot`. Call
`selectArchitectureDiscoveryRoute` with the state object, reference, and raw
bytes. Only `existing-undiscovered` selects `discover`; greenfield,
`existing-discovered-unbaselined`, and baselined states bypass. A caller or
adapter cannot force another route.

Pass the route and exact input bindings to `bindArchitectureDiscoveryInputs`.
The source scope must contain unique repository-relative paths that are tracked
or explicitly declared. Ignored, generated, secret-like, unresolved symlink,
and unresolved submodule entries fail closed. At least the exact version- and
configuration-pinned native inventory adapter must be bound.

Run the mandatory inventory through
`createArchitectureDiscoveryCheckpointController`, using a host-provided
immutable store. `createNativeArchitectureInventory` is the bundled local
inventory implementation. The inventory reads only the already-allowed file
bytes supplied by the host. Zero or more configured analyzers may then be
invoked through `createArchitectureDiscoveryAnalyzerRegistry`; analyzers use
port version `ARCHITECTURE_DISCOVERY_ANALYZER_PORT_VERSION` and are optional,
bounded proposers, not routing or policy authorities.

Normalize the mandatory inventory and any analyzer results with
`normalizeArchitectureDiscoveryObservations`. Then apply Core-owned rules with
`evaluateArchitectureDiscoveryGapPolicy`. A successful result contains exactly
one snapshot. A material missing, conflicting, or insufficiently supported
fact returns `needs_clarification`; non-material uncertainty remains visible in
the snapshot for downstream review.

## Offline and privacy boundary

`transmission: { mode: "offline" }` is the default. It must not include an
external grant, and no source-content transmission is authorized. Choosing
`mode: "external"` is not consent by itself: the input guard requires an
explicit grant with `explicit: true`, `sourceContent: true`, a policy digest,
and the exact adapter bindings. A grant for one adapter configuration cannot be
reused for another. The host remains responsible for enforcing the granted
transport and repository boundary; the Core APIs only validate and bind the
declared authority.

Native evidence and analyzer evidence retain exact artifact references,
locations, methods, adapter identity and version, evidence disposition, and
confidence. Source bytes are evidence, not conversational context, and are not
placed in the guarded input projection.

## Confidence, clarification, and authority

Findings retain `observed`, `deterministically-derived`, `analyzer-inferred`,
`unknown`, or `not-applicable` disposition, a score, and rationale. Low
confidence and analyzer silence never imply completeness. Contradictions are
preserved rather than resolved by whichever adapter ran last.

Materiality is declared by Core-owned gap rules. Every material gap blocks with
`needs_clarification` and diagnostics describing the required fact. A
non-material gap becomes a warning and remains available for explicit
downstream disposition. Adapters cannot declare materiality, make a Gate
decision, author graph operations, activate approved facts, or authorize
progression.

The snapshot authority is `observational`. The trusted
`architectureDiscoveryTraceabilityContributor` projects already-validated
snapshot evidence into candidate-authority traceability. Candidate observations
do not overwrite or become approved intended architecture. ArchitectureDesign
consumes the validated current snapshot as prerequisite context and separately
creates an intended-design candidate; Architecture Gate alone owns approval and
baseline promotion.

## Replay and recovery

Inventory and analyzer effect results are checkpointed by invocation ID,
fingerprint, repository snapshot, step, and exact adapter identity. On retry,
the controller validates the stored envelope, native bytes, result digest, and
semantic contract, then returns `replayed: true` with `adapterCalls: 0`.
Corrupt, stale, or substituted checkpoints fail closed. Durable atomic storage
and transport of the complete checkpoint/artifact bundle are host
responsibilities.

If approved input bytes change after route selection, discard the stale route
and return the guard-owned `baseline_drift` outcome through the host circuit;
do not rerun against mixed baselines. If an effect may have occurred but was
not durably checkpointed, stop with diagnostics instead of guessing or
silently repeating an external effect.

## Operator scenarios

- Complete: route `existing-undiscovered`, bind an offline tracked source
  scope, checkpoint the native inventory, normalize observations, apply rules,
  and hand the observational snapshot to ArchitectureDesign.
- Uncertain: preserve a low-confidence or analyzer-inferred finding. Continue
  only when its applicable Core rule is non-material; retain the warning for
  downstream review.
- Blocked: a material missing or contradictory fact produces
  `needs_clarification`. Collect the requested evidence and start an explicitly
  lineage-bound continuation; do not synthesize the missing fact.
- Drifted: changed state, overview, repository, or raw-byte digest invalidates
  the bound route/input set. Stop with `baseline_drift` and prepare a fresh
  invocation from one coherent approved input set.
- Resumed: retry the same invocation and exact adapter binding. A valid durable
  checkpoint returns identical native bytes without another adapter call.
- Analyzer-swapped: prepare a new exact binding and invocation for the new
  analyzer version or configuration. Reuse of the mandatory inventory is valid
  only through its matching checkpoint; an old analyzer checkpoint cannot be
  replayed under the new identity. No external source transmission is allowed
  unless a new grant names the exact swapped binding.

## Adapter and package maturity

The native inventory implementation is mandatory and local. Specialized
analyzers are optional bindings; the Module remains valid with none. The
repository includes bounded contracts, schemas, conformance fixtures, and
verified Core APIs. Those fixtures do not establish live interoperability with
an upstream analyzer product, and no live upstream command adapter is shipped.
Hosts supply effect orchestration, durable checkpoint storage, artifact
resolution, and any explicitly consented transport.

The public package surface exposes only the ArchitectureDiscovery validators,
routing/input guards, native inventory, analyzer registry, normalization, gap
policy, checkpoint, and trusted traceability contributor already covered by the
ArchitectureDiscovery conformance tests. The module definition remains
`examples/modules/architecture-discovery.module.json`.

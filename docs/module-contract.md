# DevRelay Module Contract

## Status

Executable first-pass contract. The goal is the smallest deterministic boundary
that allows engineering capabilities to be independently replaced without
changing workflow semantics or adding kernel branches.

## Separation of authority

### `ModuleDefinition`

The provider-neutral engineering capability:

- stable ID and exact version;
- operations and semantic input/output ports;
- declarative input relationships;
- finite outcomes and outcome-specific result contracts;
- evidence kinds and portable options;
- optional deterministic routing from one declared state schema;
- optional ordered adapter steps and handoff ports;
- optional declarative continuation mapping that classifies lineage and control
  inputs for portable chain resume.

It does not contain commands, native paths, model choices, requested host
capabilities, or implementation configuration.

### `ModulePlugin`

One exact implementation binding:

- stable plug-in ID and exact version;
- exact Module ID/version and operation;
- exact step when the operation is chained;
- `pure` or `effect` execution;
- implementation-specific configuration schema;
- declared capability demand.

A plug-in cannot redefine Module ports, step order, outcomes, gates, or
evidence semantics. The registry snapshots and binds the supplied
`adapter.invoke` callable at registration, so replacing that property later
cannot change an already registered plug-in. The external host remains
responsible for state and effects intentionally captured by the callable.

### `ModuleInvocation`

One exact request:

- invocation, run, and node identities;
- exact Module ID/version/operation;
- immutable input `ArtifactRef` values;
- portable Module options;
- either one legacy plug-in binding or an ordered adapter binding for every
  declared chain step.

Each adapter binding pins its step, exact plug-in ID/version, configuration,
and grants. There is no implicit adapter, default, or `latest`.

The invocation fingerprint covers all declared execution material. Chained
operations also derive a chain fingerprint from the exact operation, ordered
adapter bindings, options, and declared lineage inputs while excluding
clarification-control inputs and run identities. Neither digest claims that
effectful AI or tool execution is bit-for-bit reproducible.

### `ModuleStepInvocation`

Core constructs one immutable request per step containing:

- the parent invocation identity, invocation fingerprint, and chain
  fingerprint;
- the exact Module operation, step, and plug-in;
- original Module inputs;
- all prior step result digests, plug-ins, and outputs;
- options, step configuration, and grants;
- a step-invocation digest over that complete immutable body.

Adapters cannot inspect arbitrary runtime state or call the next adapter.

### `ModuleStepResult`

Every step result repeats the exact invocation fingerprint, chain
fingerprint, step-invocation digest, and plug-in ID/version from its
`ModuleStepInvocation`. A handoff step returns
`disposition: continue` with only its declared output ports, evidence, and
diagnostics. A terminal step returns `disposition: terminal` with one complete
`ModuleResult`.

A nonfinal step may terminate only with a Module outcome explicitly declared
in `earlyTerminalOutcomes`. Core validates that wrapped result against the
normal Module result contract and never invokes later steps.

### `ModuleResult`

One terminal observation:

- parent invocation identity;
- lifecycle status;
- one declared semantic outcome;
- allowed output `ArtifactRef` values;
- evidence and bounded diagnostics.

A result never means the pipeline or a downstream gate accepted the work.

## Deterministic operation routing

A routed Module declares:

- the required state-input and route-decision-input port names;
- one state-artifact schema and one JSON Pointer discriminator;
- a closed set of unique discriminator values and reason codes;
- exactly one Module operation or exact prerequisite target per value.

Core loads the raw state bytes through `context.artifacts.load(ref)`, verifies
their exact SHA-256 digest, runs the trusted state validator, and materializes a
provider-neutral `ModuleRouteDecision`. The host persists that returned
decision as a normal artifact and supplies it to the selected operation.
Execution independently
reloads state and decision, recomputes the route, and requires canonical
equivalence before any adapter runs.

Core fails closed on absent or tampered state, a missing validator, unknown
values, duplicate rules, undeclared operations, a prerequisite route, or an
invocation that conflicts with the recorded route. Prerequisites are explicit
routes, not hidden calls. After a prerequisite produces its artifact, the host
records new state and routes again.

Routing chooses semantic operations only. Adapter selection remains exact
invocation configuration.

## Chained execution

Before executing a chain, Core validates:

1. every declared step appears exactly once and in order;
2. each plug-in implements the exact Module operation and step;
3. every configuration document validates;
4. the grants exactly equal the plug-in's resolved capability demands, with no
   missing, duplicate, or excess entries;
5. original Module inputs satisfy the selected operation;
6. a trusted validator is registered for every possible input, handoff, and
   output schema;
7. `context.artifacts.load` is available, and a complete
   `context.checkpoints.get/put` store exists for every effectful execution
   and every declared resumable chain, including legacy effectful adapters.

Core then invokes adapters serially. It requires every artifact loader to
return raw bytes, checks the declared digest before decoding, rejects malformed
UTF-8, parses JSON, and runs the trusted semantic validator. Only then does it
checkpoint or pass a handoff into the next
`ModuleStepInvocation`. Only the final step can produce the normal successful
terminal result.

Core creates a distinct immutable, plain JSON data context for each adapter
through `createAdapterContext`; shared mutable context and non-JSON values are
rejected. Authoritative cross-step state still travels only through persisted
artifacts.

This is a bounded linear composition primitive, not a general graph scheduler.
Parallel dependency execution belongs to a later orchestration layer.

## Legacy compatibility

Unchained operations retain the original single-adapter
`plugin + config + grants` invocation shape. Chained operations require
`adapters[]` and forbid those root implementation fields. Legacy plug-ins
cannot declare a step; chained bindings must declare one. An effectful legacy
invocation is wrapped in the same validated terminal
checkpoint envelope and is replayed only for its exact immutable invocation.
Its adapter receives the immutable invocation, its isolated adapter context,
and a producer identity containing the invocation ID and fingerprint, exact
plug-in, and step-invocation digest. This lets a legacy adapter bind generated
artifacts to the same checkpoint identity without inspecting runtime state.

## Artifacts, resume, and evidence

Artifacts and evidence cross every boundary; conversational and provider-native
session memory do not. Before an effect runs, Core requires a checkpoint store
keyed by the digest of the complete step invocation, including prior results.
A returned effect result is fully validated and durably written before
downstream progression. On restart, a present checkpoint is revalidated and
reused; a malformed checkpoint fails closed and is never treated as a cache
miss. A changed upstream pure handoff therefore creates a different downstream
effect key.

For declared resumable chains, every completed step is checkpointed. A
continuation binds the source invocation ID and fingerprint, chain fingerprint,
exact active step, state, lineage inputs, completed plug-ins, step-invocation
digests, step-result digests, output references, and unresolved questions.
Core validates the matching response trio, reloads each original checkpoint,
revalidates its result envelope and artifact bytes, seeds prior results, and
starts at the recorded step.

The portable resume package is the request, response, continuation, referenced
artifact bytes, and source step checkpoints. A continuation alone cannot prove
that a skipped effect occurred. Changes to a lineage input, adapter,
configuration, grant, or option change the chain fingerprint and fail closed;
new run identities and clarification-control artifacts do not. Hosts and
adapters still need idempotency for the crash window between a completed
external effect and its checkpoint write.

Native artifacts remain subordinate evidence with producer version,
normalization warnings, and exact content digests.

## Capabilities

The only capability demand kinds are:

- `filesystem.read`
- `filesystem.write`
- `process.spawn`
- `network.connect`
- `secrets.read`

The registry resolves every declared demand and requires the invocation grants
to be its exact set. Missing, duplicate, and excess grants fail closed. V1
scope templates use a literal scope, `config:<field>`, or
`config:<field>/<literal-suffix>`.
Only one leading configuration token is substituted; composed configuration
expressions are not part of the grammar. For example, MADR uses an absolute
`decisionsPath` with `config:decisionsPath`.

An external host still resolves scope strings and enforces the actual sandbox;
contract validation alone is not a security boundary.

## Rejected first-pass features

- Module-specific or adapter-specific kernel branches;
- model-selected operations or adapters;
- Module-to-Module calls hidden inside adapters;
- arbitrary access to run state;
- Module-owned approval gates;
- automatic package discovery or version resolution;
- arbitrary graph execution or distributed workers;
- a built-in model provider wrapper.

# Workflow composition (agent-bearing v1)

This bounded library resolves the approved IF-MES-COMPOSITION v1 artifacts.
It does not activate a workflow, approve Gates, execute adapters, or mutate a
traceability graph. Native zero-agent selections require the later approved
contract extension; no placeholder agents are inserted.

`createWorkflowCompositionRuntime(host)` accepts explicit artifact loading,
checkpoint storage, and installed registrations. `resolve(requestRef)` returns
a schema-valid configuration only after durable checkpoint readback, or typed
pre-effect diagnostics. `verify(configurationRef)` verifies stored exact bytes
and current host bindings for consumers; it cannot select a Module operation.

Host-owned closed inputs are distinct from semantic contracts:
- Binding catalog: `{kind:"CompositionBindingCatalog", slots:[{slotId,
  invocations:[ArtifactRef]}]}`. Invocations are ordinary ModuleInvocation bytes.
- Host capabilities: `{kind:"CompositionHostCapabilities", grants:[{kind,scope}]}`.
- Grant ceiling and adapter grant artifacts contain `{grants:[{kind,scope}]}`.
- Installed service manifests contain `{id,version,settingsSchema}` for agents,
  executors and harnesses. Gate manifests contain `{id,version}`. Contributor
  manifests contain `{id,version,ownership,match}` with declarative exact Module
  and outcome coverage. These are host declarations, never approval evidence.

The trusted host supplies exact `preset`, `bindingCatalog`, `hostCapabilities`
and `projectOverview` references, `modules` and `plugins` registrations binding
exact pins to actual registry definitions/adapters, and `services` binding pins
to actual installed Gate/contributor/agent/executor/harness implementations.
Gate implementations must expose `evaluate`; contributors must expose `project`.
Contributor implementations also expose `validateRegistration(manifest)`, an
explicit host binding to their owning registration validator; the resolver calls
it before issuing compatibility evidence. It must reject invalid ownership,
version and vocabulary descriptors without projection or graph mutation.
Agent, executor and harness implementations expose `validateSettings(settings)`;
both their pinned JSON Schemas and installed validators must accept the settings.
Artifact validator registrations are closed `{pin,schema,validate}` objects with
optional `representation:"json"`. Their exact versioned pin references a closed
`{id,version,schema,representation}` manifest. The full validator binding list is
part of host identity; removing or changing a validator invalidates old results.
All definition bytes are checked against registrations. Model attestation needs
an explicit installed executor `verifyIdentity` method; fixture identities stay
fixture identities. Inherited identity remains unknown unless actually attested.

Checkpoints expose an exact provider `pin` whose manifest is `{id,version}`,
`read(runId)` and atomic immutable `commit(runId, bytes)`. The provider pin is
loaded, validated and bound into the checkpoint fingerprint.
Commit must reject an existing different value and durably persist before
returning; runtime verifies readback. A memory store is suitable only for tests.
Records bind the request, all loaded byte references, generated compatibility
receipts, and result body. The checkpoint artifact contains the result body
without its checkpoint reference, avoiding a digest cycle. Artifact storage
exposes `load(ref)` and `put(ref,bytes)` and must preserve exact content addresses.
Replay reloads all input bytes and the checkpoint, but does not rerun resolution,
provider identity checks, adapter effects or Gate calls. Consumers must use
`verify` with the same trusted host configuration; host changes invalidate reuse.
Replay and consumer verification still perform static installed-host checks:
Module/plugin definitions must equal their pinned bytes, the actual Module
registry must accept the current registrations, and every required adapter,
Gate, contributor, settings validator and attestation-verifier callable must be
present. This does not invoke those implementations or repeat provider checks.
Pins identify trusted host-installed code; declarations alone cannot install code
or prove provider attestation. The host remains responsible for loading the code
corresponding to each immutable implementation pin.
Run IDs are immutable. Swaps require a different run ID, an exact checkpointed
predecessor and a byte-bound swap request `{kind:"CompositionSwapRequest",
predecessorRunId,predecessorConfiguration,newRunId}`.

This slice supplies resolution and compatibility evidence only. A future owning
Module invocation and matching trusted contributor must project that evidence
before a full lifecycle composition acceptance claim. No installed full-lifecycle
acceptance or production persistence is implied by fixture tests.

Conservative v1 normalization uses the operation ID as the step ID for ordinary
single-adapter operations, and exact declared step IDs for chains. `many` port
cardinality maps to the interface's bounded maximum of 1024. Variant ports or
different operation port shapes are rejected rather than guessed. Exact grant
membership is used; this API does not invent wildcard or path-containment rules.

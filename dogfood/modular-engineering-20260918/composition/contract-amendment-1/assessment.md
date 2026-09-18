# Native composition contract amendment candidate

This proposal addresses the approved composition interface's inability to
represent deterministic Modules without inventing an agent or harness. It is
construction material for ContractGeneration and ContractGate review, not an
approved contract, native execution attestation, or WorkExecution result.

## Exact prior authority

- Interface: `IF-MES-COMPOSITION`.
- Prior schema: `https://devrelay.dev/generated/if-mes-composition/v1`, raw digest
  `sha256:dd21401b933fbfb2e76f4a5b1bee7fb5f9debaaa335febc2a2eeb374baf28b99`.
- Prior ContractBaseline: `CB-DEVRELAY-MES-001`, version `2.4.0`, raw digest
  `sha256:ca14d54c10910ce659b6c8739684e927a7a5a4604a1694503ee5a1ecf5eb3aab`.
- Architecture: `architecture-baseline-devrelay-v1-mes-001`, raw digest
  `sha256:fb7394171148d36091a58f5d96af5632ba31ad9d04ca2b826bb9dc41bd0e18df`.

`proposal.json` binds these exact references and contains the standalone v2
schema at `schema`. It does not modify their bytes or claim approval.

## Shape and compatibility

The existing `SlotSelection` is retained byte-for-value as the closed
`AgentSlotSelection` definition. Its agent roles, inherited model identity
alternatives, mandatory harness, adapters, contributors and overview do not
change. Old valid agent selections are accepted unchanged, without adding a tag.

The new closed `NativeSlotSelection` retains the shared fields and requires:

```json
{
  "agents": [],
  "harness": null,
  "execution": {
    "kind": "native",
    "executor": { "id": "...", "version": "1.0.0", "artifact": "exact ArtifactRef" }
  }
}
```

This fragment illustrates the branch; the complete fixtures contain valid
executor artifact objects and all required selection fields. The native branch
cannot contain an agent, a harness pin, model-selection fields or fallback
settings. Omitting the explicit native choice cannot silently turn an empty
agent list into native execution. A workflow may contain separate native and
agent-bearing slots; contradictory choices inside one slot are rejected.

The branches are disjoint: v1 forbids `execution`, while native requires it,
requires an empty agent array, and requires a null harness. Every other prior
definition and root validation rule is retained exactly. This is a structural
backward-inclusion argument, supported by finite fixtures; final compatibility
classification belongs to ContractGate. Old v1 consumers correctly reject new
native choices, so producers must use the new schema identity for them.

The candidate schema identity is
`https://devrelay.dev/generated/if-mes-composition/v2`. Existing v1 artifacts,
published versions and active runs keep their original identities and raw bytes.
The schema's version is independent of a particular workflow configuration's
`version` field; forcing that field to v2 would reject previously valid choices.

## Owning semantic validation remains required

Native is a declared execution choice, not proof of purity or host capability.
The resolver must verify the pinned executor and bindings actually implement
deterministic execution without agent/model/harness dispatch. Native code can
still perform explicitly granted effects. Existing ModulePlugin effect mode,
capability demand, exact grants, checkpoints and replay rules continue to apply.

Both branches retain Module semantic compatibility, exact adapter-operation
bindings, Gates, trusted contributor coverage, explicit overview, quality
policy, environment readiness and immutable run lineage. No label can bypass
these checks. Unknown native registration fails before execution; it must not
fall back to a Desktop agent.

Fixture artifact references are synthetic shape-test data. They do not prove
that executor code exists, that referenced bytes are retrievable, or that a
model is attested. Those are explicit runtime obligations, not hidden schema
claims. No new requirements or authority are introduced.

## Single-step normalization

The existing adapter-binding schema requires `stepId` and `stepOrder`, whereas
single-operation ModulePlugin bindings omit a Core chain step. The proposed
supporting rule is: for a Module operation without `adapterChain`, composition
uses one binding with `stepId: "terminal"` and `stepOrder: 0`; materialization
emits the existing single invocation shape, with no Core step field. For a
chained operation, retain the exact declared step IDs and order without this
normalization. Derive the choice from the pinned ModuleDefinition.

This rule is a proposed owning semantic rule, not a generic Core change or a
claim that schema validation proves registration compatibility. The resolver
must reject multiple bindings, another step ID or a nonzero ordinal for a
single-operation binding. A chain can legitimately have a declared step named
`terminal`; its ModuleDefinition still determines the interpretation. The
shape fixtures exercise both representations; runtime conformance must test
the owning rule when implemented.

## Validation and migration boundary

Run the read-only `validate.mjs` with the bundled Node runtime. It compiles both
schemas with strict Ajv, includes all three prior positive and four prior
negative composition fixtures unchanged, and adds seven positive and 23
negative fixtures. It checks closed branches, preservation of old definitions,
native forward-version rejection, full exact prior baseline bindings, and
disjoint branch matches. Input sizes and fixture counts are bounded. It does
not invoke adapters, write state, or make network calls.

The parent must review the actual ContractGeneration result and exact change
against the current baseline, preserve the other 102 contract byte sequences,
and run the owning Gate. Migration must then reconcile any downstream planning
references that pin the prior ContractBaseline. Existing historical runs are
not relabeled or revalidated retroactively. No generation, promotion,
activation, migration or native execution is performed by these four files.

Candidate-only ProjectMemory conclusion: retain current approved memory and
baselines; record this proposal and its limitations as a candidate if useful.
Only the ProjectMemory Gate may promote a conclusion.

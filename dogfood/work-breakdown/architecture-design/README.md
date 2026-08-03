# WorkBreakdown ArchitectureDesign dogfood package

This package records the normal `ArchitectureDesign@0.1.0` flow for WorkBreakdown. DevRelay is an existing repository without an approved architecture baseline for this feature, so the released state contract routed:

```text
existing-undiscovered
-> CurrentArchitectureSnapshot
-> existing-discovered-unbaselined
-> establish-baseline
-> Spec Kit plan binding
-> Structurizr binding
-> MADR binding
-> ArchitectureDraft
-> Architecture Gate
-> ArchitectureBaseline
```

The adapters were exercised as bounded deterministic fixtures through the released three-step runtime. No Spec Kit, Structurizr, or MADR upstream CLI was executed. The run invoked the configured bindings in exact order, persisted three effect checkpoints, and a second `registry.execute` returned the identical result with zero new adapter calls.

## Primary artifacts

- `current-architecture-snapshot.json`: observational discovery output for repository revision `7d3b9c16d4c197bf80dce8279e027b953e32f21a`.
- `project-architecture-state.json`: exact `existing-discovered-unbaselined` state.
- `module-route-decision.json`: Core-derived `establish-baseline` selection.
- `architecture-designer-working.json`: bounded Spec Kit plan handoff.
- `architecture-modeler-working.json`: bounded Structurizr handoff.
- `architecture-draft.json`: canonical candidate with scoped reciprocal requirement traceability.
- `architecture-design.invocation.json` and `architecture-design.result.json`: exact released runtime boundary.
- `runtime-execution-proof.json`: adapter order, checkpoint count, replay, and outcome evidence.
- `architecture-gate.md`: exact approval evidence.
- `architecture-baseline.json`: promoted canonical baseline.

The two native MADR files remain immutable `proposed` source evidence. `architecture-gate.md` is the separate acceptance evidence that permits their matching canonical decision records to have `accepted` status in `architecture-baseline.json`; the native proposal bytes are not rewritten to imply they approved themselves.

## Validation evidence

The released validators passed for `ProjectArchitectureState`, `CurrentArchitectureSnapshot`, `ArchitectureDraft`, and `ArchitectureBaseline`. `validateArchitectureDraftAgainstState` also passed against the exact approved RequirementsBaseline and discovery snapshot.

- ArchitectureDraft: `sha256:d7c3eb3dc07eb1c3a61ed917e30be728549296da03d9a8a72985a985315b7475`
- ArchitectureBaseline: `sha256:947f2010fd6383f72fcd7ef9c3352b1b0ffd0aa03163f34cc9b93b6a99a2049b`
- ModuleInvocation: `sha256:49afb4d0fa63988d266b34893c255d98f6d2c957558841a3cee5319365b72802`
- ModuleResult: `sha256:dff2b6fbc588d66bcfccd164757032fd3d949eeed7804a9efe730d2823e25670`
- Runtime proof: `sha256:036c19cc20b5f0d74e05ee8b995979ce706bfe9d7ce92543b53caaac73e49a52`
- Architecture Gate: `sha256:123dfb062a11ab9d22edd2ce07ed818feee0d5102b3a900c77198c89320b66a7`

`materialize.mjs` deterministically regenerates all derived JSON, runtime proof, gate, and baseline from the approved upstream artifacts, locked scoped target model, and native planning evidence.

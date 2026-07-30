# DevRelay

DevRelay is a deterministic runner for composable software-engineering Modules.

It does not replace requirements engineering tools, coding agents, or model providers. It gives them a stable boundary: a semantic Module defines the engineering contract, a plug-in implements it, and DevRelay validates the handoff.

## First Vertical Slice

```txt
GoalArtifact + ProjectContext
              |
              v
RequirementsGathering@gather
              |
       selected plug-in
       /             \
  OpenSpec      GitHub Spec Kit
       \             /
        canonical result
              |
              v
Requirements validation gate (next module)
```

`requirements-gathering@0.1.0` is the one semantic module. OpenSpec and GitHub Spec Kit have contract-compatible manifests selected explicitly by each invocation. Executable host adapters are the next integration slice.

The module can produce:

- a canonical `RequirementsDraft`;
- a `RequirementsChangeSet` against an exact approved baseline;
- a `ClarificationRequestSet` plus a portable continuation;
- a semantic or execution failure with diagnostics.

It never approves requirements or promotes a baseline. Those are separate workflow stages.

## Boundary

```txt
ModuleDefinition + ModulePlugin + ModuleInvocation
                         |
                         v
                    ModuleAdapter
                         |
                         v
                    ModuleResult
```

- `ModuleDefinition` owns portable inputs, outputs, outcomes, result rules, evidence semantics, and options.
- `ModulePlugin` binds exact Module versions/operations to implementation configuration, execution mode, and capabilities.
- `ModuleInvocation` pins both identities. There is no implicit default or `latest`.
- `ModuleResult` is checked against the semantic Module, not against tool-specific files.
- Native OpenSpec or Spec Kit files are preserved as provenance; downstream stages consume canonical artifacts.

## What Is Executable

The small registry in `src/module-registry.mjs`, backed by Ajv JSON Schema validation:

- registers exact Module and plug-in versions;
- rejects incompatible or duplicate bindings;
- executes the published document, Module option, and plug-in configuration schemas;
- resolves an invocation without plug-in-specific branches;
- checks input ports, input relationships, and capability kinds;
- enforces outcome-specific outputs, diagnostics, and evidence status;
- fingerprints the exact invocation material for deterministic checkpoint identity.

The repository includes contract manifests and conformance fixtures for OpenSpec and GitHub Spec Kit. Their agent-facing command bridges are intentionally not faked: a host adapter must implement `adapter.invoke` to execute the installed tool and normalize its native files. This proves deterministic registration and handoff compatibility, not yet operational tool interoperability.

The invocation fingerprint identifies declared execution material for checkpointing. Effectful AI/tool execution is recorded rather than assumed reproducible; an execution lock and adapter/tool/model provenance belong in the host run record.

## Repository

```txt
contracts/
  module-definition.schema.json
  module-plugin.schema.json
  module-invocation.schema.json
  module-result.schema.json
  requirements-gathering-artifacts.schema.json
docs/
  module-contract.md
  requirements-gathering.md
examples/
  artifacts/
  modules/
    command.module.json
    requirements-gathering.module.json
  plugins/
    local-command.plugin.json
    openspec.plugin.json
    github-spec-kit.plugin.json
  invocations/
  results/
src/
  content-digest.mjs
  module-registry.mjs
  requirements-artifact-validator.mjs
  schema-validation.mjs
test/
```

Run:

```powershell
npm.cmd test
```

The next narrow slice is one host adapter bridge that executes either installed requirements tool, materializes its native output as immutable artifacts, and returns the same canonical `ModuleResult`.

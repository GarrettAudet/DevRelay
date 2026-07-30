# DevRelay

DevRelay is a deterministic runner for composable software-engineering Modules.

It does not implement requirements engineering, architecture, coding, verification, or OpenSpec. It connects versioned Modules that implement those capabilities and moves typed artifacts between them through an explicit graph.

## First-Pass Goal

Prove one boundary:

```txt
ModuleInvocation -> ModuleAdapter -> ModuleResult
```

If that boundary is correct, OpenSpec, a model provider, a test runner, a human workflow, or a future best-practice library can be plugged in without adding a special case to DevRelay core.

## Module Rules

- A Module declares operations, typed input/output ports, outcomes, evidence, and requested capabilities.
- Core resolves an exact Module ID/version/operation.
- A Module receives only its invocation and bounded host services.
- A Module cannot inspect the pipeline, schedule another Module, approve a gate, or mark a Run complete.
- Core validates and records the result before exposing outputs downstream.
- Module-specific configuration is opaque to core after validation.
- Effectful Modules are not implicitly rerun during resume.

## Repository

```txt
contracts/
  module-definition.schema.json
  module-invocation.schema.json
  module-result.schema.json
docs/
  module-contract.md
examples/
  modules/
    command.module.json
    openspec.module.json
    template-requirements.module.json
  invocations/
    openspec-proposal.invocation.json
  results/
    openspec-proposal.result.json
test/
  module-contract.test.mjs
```

The OpenSpec file is deliberately an example of the same contract as the generic command Module. DevRelay has no OpenSpec-specific field or lifecycle.

## Current Status

The three portable contracts, examples, and zero-dependency conformance tests are in place. There is no runner yet.

Run:

```powershell
npm.cmd test
```

The next implementation slice is:

1. implement an explicit local Module registry;
2. invoke one adapter and validate its result;
3. checkpoint the result before downstream use;
4. prove the same runner can use either compatible requirements Module.

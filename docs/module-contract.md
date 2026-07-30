# DevRelay Module Contract

## Status

Executable first-pass contract. The objective is the smallest boundary that allows best-in-class engineering tools to be swapped without changing workflow semantics or adding kernel branches.

## Separation Of Authority

### `ModuleDefinition`

The semantic engineering capability:

- stable ID and exact version;
- operations;
- tool-neutral input and output ports and declarative input relationships;
- declared outcomes and outcome-specific result contracts;
- evidence kinds;
- portable operation options.

It does not declare a command, native file layout, execution mode, requested capability, provider, or tool configuration.

### `ModulePlugin`

One implementation binding:

- stable plug-in ID and exact version;
- exact Module ID/version targets;
- implemented operation IDs;
- `pure` or `effect` execution mode;
- implementation-specific configuration schema;
- requested capabilities.

A plug-in cannot redefine a Module's ports, outcomes, result rules, or evidence semantics.

### `ModuleInvocation`

One exact request:

- invocation, Run, and node identities;
- exact Module ID/version/operation;
- exact plug-in ID/version;
- input `ArtifactRef` values grouped by semantic port;
- portable Module options;
- opaque plug-in configuration;
- host-granted capabilities.

The invocation fingerprint covers the declared Module, plug-in, content digests, options, configuration, and grants. It identifies checkpoint material; it is not a claim that effectful model/tool execution is bit-for-bit reproducible. Adapter, tool, model, prompt, and environment provenance belong in the host run record.

### `ModuleResult`

One checkpointable observation:

- invocation identity;
- lifecycle status;
- one declared semantic outcome;
- output `ArtifactRef` values grouped by semantic port;
- Evidence;
- bounded diagnostics.

A result never says that the pipeline, gate, or Run is accepted.

### `ModuleAdapter`

Executable code paired with a `ModulePlugin`:

```ts
interface ModuleAdapter {
  invoke(
    invocation: ModuleInvocation,
    context: ModuleContext,
  ): Promise<ModuleResult>;
}
```

`ModuleContext` remains a bounded host surface for reading and creating immutable artifacts, logging, cancellation, and explicitly granted effects. It exposes neither the scheduler nor mutable Run state.

## Resolution

```txt
validate the invocation JSON Schema
  -> resolve exact Module and operation
  -> resolve exact plug-in
  -> prove plug-in implements that Module version and operation
  -> validate Module options and plug-in configuration schemas
  -> validate semantic ports and input relationships
  -> compare requested and granted capability kinds
  -> expose the registered adapter
```

There are no version ranges, implicit defaults, preferred implementations, or `latest` aliases.

## Result Contracts

Output requirements often depend on the outcome. Each Module operation therefore defines one `resultContract` per outcome:

```json
{
  "status": "completed",
  "requiredInputs": [],
  "forbiddenInputs": ["requirements-baseline"],
  "requiredOutputs": ["requirements-draft", "native-source-bundle"],
  "allowedOutputs": ["requirements-draft", "native-source-bundle"],
  "requiredEvidence": [
    {
      "kind": "requirements/source-provenance",
      "statuses": ["pass"],
      "artifactOutput": "native-source-bundle"
    }
  ],
  "diagnosticsRequired": false
}
```

The registry rejects missing/forbidden inputs, broken input relationships, missing or undeclared outputs, wrong artifact schemas/media types, evidence with an unacceptable status, lifecycle mismatches, and missing diagnostics.

## Artifacts And Provenance

Artifacts are immutable references:

```txt
artifactId
schema
mediaType
digest
uri
```

Interchangeable ports use DevRelay-owned schemas. Plug-ins normalize native representations into those schemas. Promotable requirements candidates must include a `NativeSourceBundle` and passing source-provenance evidence that preserve exact tool/version/source/digest mappings and normalization warnings.

Native tool state is provenance, not downstream authority.

### Digest Semantics

An `ArtifactRef.digest` is SHA-256 over the exact immutable artifact bytes returned by the artifact store. JSON content that needs a stable subdocument identity, such as `expectedRequirementDigest`, uses DevRelay Canonical JSON v1: recursively sort object keys by Unicode code-unit order, preserve array order, serialize without insignificant whitespace as UTF-8 JSON, then SHA-256 the bytes. The implementation is `src/content-digest.mjs` and is covered by fixed integrity tests.

## Execution And Resume

- `pure`: equal semantic outputs are expected for equal exact invocation material.
- `effect`: a model, human, process, filesystem, network, or external service may be involved.

Core checkpoints a completed result before downstream use. Resume reuses that exact result. It does not silently rerun an effect whose completion is uncertain.

## Capabilities

A plug-in declares implementation demand:

- `filesystem.read`;
- `filesystem.write`;
- `process.spawn`;
- `network.connect`;
- `secrets.read`.

The invocation records grants. This slice checks capability kinds and returns declared scopes to the host. Scope resolution/containment and sandbox enforcement are host authorization responsibilities; the registry does not treat scope strings as a security boundary.

## Requirements Plug-in Mapping

| Semantic operation | OpenSpec plug-in | GitHub Spec Kit plug-in |
| --- | --- | --- |
| Gather requirements | proposal plus specs | `/speckit.specify` output |
| Clarify ambiguity | `/opsx:explore` or bounded continuation | `/speckit.clarify` |
| Preserve native source | proposal/spec files | feature `spec.md` and clarification content |
| Canonical output | DevRelay draft/change set/questions | DevRelay draft/change set/questions |

OpenSpec `design.md` and `tasks.md`, and Spec Kit plan/tasks/implementation, belong to future semantic Modules. They are not smuggled through `RequirementsGathering`.

Both upstream command surfaces are primarily agent-facing. The manifests are contract-compatible bindings; operational interchangeability is not claimed until executable host adapters pass the same artifact/outcome conformance suite.

## Rejected First-Pass Features

- Module-to-Module calls;
- arbitrary access to Run state;
- Module-owned gates or final acceptance;
- automatic package discovery;
- dynamic version resolution;
- distributed workers;
- a built-in model provider wrapper;
- plug-in-specific fields or branches in core.

# DevRelay Module Contract

## Status

First-pass design. The objective is the smallest boundary that lets external engineering libraries participate without becoming kernel special cases.

## Design Test

The contract succeeds when all of these are true:

1. DevRelay core contains no branch for `openspec` or any other Module ID.
2. A second Module with compatible ports can replace OpenSpec in a pipeline definition.
3. Core can validate, invoke, checkpoint, resume, and trace both Modules identically.
4. OpenSpec-specific paths, commands, schemas, and native status stay inside its adapter and configuration.

## Four Objects

### ModuleDefinition

Portable description of what a Module can do:

- stable ID and exact version;
- one or more operations;
- execution mode;
- typed input and output ports;
- declared outcomes;
- optional evidence kinds;
- configuration schema;
- requested capabilities.

It contains no pipeline position, current Run state, provider credential, or downstream behavior.

### ModuleInvocation

One exact request to one operation:

- invocation, Run, and node identities;
- exact Module ID/version/operation;
- input ArtifactRefs grouped by port;
- operation configuration;
- granted capabilities.

It deliberately omits:

- the pipeline graph;
- other node states;
- gate state;
- scheduler controls;
- a method to invoke another Module;
- a method to mark the Run complete.

### ModuleResult

One recorded observation:

- invocation identity;
- lifecycle status;
- one declared Module outcome;
- output ArtifactRefs grouped by port;
- Evidence;
- bounded diagnostics.

A result never says that the pipeline or Run is accepted. Pipeline outcome routing and gates remain core responsibilities.

### ModuleAdapter

Runtime implementation paired with one ModuleDefinition:

```ts
interface ModuleAdapter {
  readonly definition: ModuleDefinition;

  invoke(
    invocation: ModuleInvocation,
    context: ModuleContext,
  ): Promise<ModuleResult>;
}
```

`ModuleContext` is a bounded host surface:

```ts
interface ModuleContext {
  readArtifact(ref: ArtifactRef): Promise<Uint8Array>;
  createArtifact(input: NewArtifact): Promise<ArtifactRef>;
  log(entry: ModuleLogEntry): void;
  signal: AbortSignal;
}
```

It exposes neither scheduler nor mutable Run state.

The first runner can use in-process adapters. A later `process-json` adapter protocol can implement the same invocation/result contracts without changing Module semantics.

## Ports And Artifacts

A port declares:

- name;
- artifact schema identity;
- accepted media types;
- cardinality `one` or `many`;
- required or optional.

Artifacts are immutable references:

```txt
artifactId
schema
mediaType
digest
uri
```

Content may be stored outside the invocation. Core verifies the digest before using an ArtifactRef.

Modules communicate only through artifacts and evidence. Native paths may appear inside a Module's private configuration or artifact URI, but downstream Modules consume declared artifacts rather than reaching into another Module's internals.

Interchangeable pipeline ports SHOULD use tool-neutral artifact schemas. An adapter normalizes native files into that boundary and may preserve the exact native representation as a secondary artifact. A pipeline may intentionally choose a tool-native schema, but that makes the coupling explicit rather than a kernel special case.

## Execution Modes

### `pure`

The adapter promises equal semantic outputs for equal Module version, operation, configuration, and input bytes. Core may cache or repeat it.

### `effect`

The adapter may invoke a human, model, process, filesystem, network, or external service. Core records its result before downstream use and does not implicitly rerun a completed invocation during resume.

This distinction is generic; it is not tied to any specific library.

## Outcomes

Operations declare their possible outcomes as strings. A result must use one declared outcome.

Examples:

- `generated`;
- `valid`;
- `invalid`;
- `completed`;
- `command_failed`.

Core does not interpret these strings globally. A pipeline binding maps them to downstream routes or gate behavior.

## Evidence

Evidence is a generic claim:

```txt
kind
subject
status: pass | fail | inconclusive
artifact?
summary?
```

OpenSpec strict validation, test output, security review, and human review all use this same shape. Evidence never approves its own pipeline gate; core evaluates gate policy separately.

## Capabilities

A ModuleDefinition declares requested capability kinds:

- `filesystem.read`;
- `filesystem.write`;
- `process.spawn`;
- `network.connect`;
- `secrets.read`.

The invocation contains only granted capabilities. This first pass records and narrows capability demand; it does not claim to provide a security sandbox.

## Generic Invocation Lifecycle

```txt
resolve exact Module
  -> validate invocation
  -> compare requested and granted capabilities
  -> invoke adapter
  -> validate result and declared outcome
  -> verify and record artifacts/evidence
  -> checkpoint invocation result
  -> expose outputs to downstream ports
```

If the process stops after checkpointing, resume reuses the recorded result. If it stops during an effect before a result is checkpointed, the first pass reports the invocation as unresolved rather than blindly rerunning it.

## OpenSpec Mapping

| OpenSpec concern | Generic DevRelay representation |
| --- | --- |
| Proposal generation | `openspec` Module, `proposal` operation |
| Goal text | Input ArtifactRef |
| Project root/change/schema | Opaque operation configuration |
| CLI invocation | Adapter implementation detail |
| Proposal/design/spec/task files | Tool-neutral output ArtifactRefs; exact native files may be preserved as secondary artifacts |
| Strict validation | `validate` operation plus Evidence |
| Native status | Declared Module outcome or evidence |
| Filesystem/process access | Requested and granted capabilities |
| Apply/sync/archive | Separate effect operations if added |

Nothing in this mapping requires a kernel branch.

## Rejected First-Pass Features

- Module-to-Module calls;
- arbitrary access to Run state;
- Module-owned gates or final acceptance;
- automatic package discovery;
- dynamic `latest` resolution;
- distributed workers;
- event sourcing;
- migration and promotion machinery;
- module-specific fields in core contracts.

## Next Decision

After the examples stabilize, decide whether the first executable adapter boundary is:

1. an in-process TypeScript interface; or
2. newline-delimited JSON over a child process.

The contracts intentionally permit either.

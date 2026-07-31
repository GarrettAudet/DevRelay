# AGENTS.md

## Purpose

DevRelay is a small deterministic runner for composable
software-engineering Modules and interchangeable bounded adapters.

## Current scope

The executable contract slices are:

- `requirements-gathering@0.1.0`, which turns a goal and project context into
  a requirements candidate or clarification checkpoint through one configured
  plug-in;
- `architecture-design@0.1.0`, which state-routes approved requirements into
  `establish-baseline` or `design-change` and executes a configured designer,
  modeler, decision-recorder chain.

RequirementsGathering supports bounded OpenSpec and GitHub Spec Kit
requirements bindings. ArchitectureDesign V1 uses bounded Spec Kit plan or
OpenSpec design bindings, followed by Structurizr and MADR bindings.

The manifests and conformance fixtures are present; live upstream command
adapters are not shipped. Do not claim live interoperability from contract
fixtures.

Do not add a workflow platform, agent framework, package marketplace,
distributed scheduler, provider wrapper, or plug-in-specific kernel behavior.

## Invariants

- Generic Core never branches on a Module, operation, adapter, or product ID.
- A Module owns provider-neutral ports, outcomes, result contracts, evidence,
  deterministic routing rules, and ordered step contracts.
- A plug-in owns one exact Module operation/step binding, execution mode,
  implementation configuration, and capability demand.
- Core loads persisted state bytes, verifies their digest and semantic
  contract, derives a `ModuleRouteDecision`, and recomputes it at execution.
  A model, adapter, or caller cannot select or override the operation.
- A chained invocation pins every step, exact adapter version, configuration,
  grant, option, and input artifact.
- Core resolves the complete chain before execution and invokes steps only in
  declared order.
- Every handoff is an immutable, schema-declared artifact result. Adapters do
  not share conversational or native session memory.
- Only the terminal step can return a successful primary Module result.
  Declared clarification, unable-to-proceed, and execution-failed outcomes may
  terminate early.
- An effect result is reused only after it was durably checkpointed and
  revalidated for the exact invocation ID, fingerprint, step, and plug-in.
  Cross-invocation clarification resume requires explicit lineage.
- Supporting architecture material is embedded or attached inside one
  `ArchitectureDraft` or `ArchitectureChangeSetDraft`; it is not exposed as
  separate successful Module outcomes.
- Requirements and architecture Modules emit candidates, clarification, or
  diagnostics. Separate gates own validation policy, approval, and baseline
  promotion.
- Detailed interface contracts belong to ContractGeneration. Architecture
  enforcement belongs to Verification.
- Cross-module artifact IDs have one schema owner.
- Published exact Module and plug-in versions are immutable.
- Module-owned schemas compile through the generic schema helper; do not add
  module-ID conditionals to Core.

## Workflow

Before implementation:

1. Establish or update an approved RequirementsBaseline.
2. Update the semantic Module, routing, step, or plug-in contract.
3. Add a valid invocation and positive/negative conformance fixtures.
4. Verify raw-byte digests, deterministic routing, full-chain preflight,
   effect checkpoints, handoff validation, terminal results, and legacy
   compatibility.
5. Prove generic source contains no product identifier branch.
6. Keep dependencies minimal. Ajv is the contract validator.

When the user says to use a Module, run its normal user-facing workflow:
present its clarification questions and gate decision in chat, then preserve
the resulting artifacts. Do not infer a completed interactive stage without
performing it.

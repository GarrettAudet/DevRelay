# AGENTS.md

## Purpose

DevRelay is a small deterministic runner for composable software-engineering Modules and interchangeable Module plug-ins.

## Current Scope

The first executable vertical slice is `requirements-gathering@0.1.0`. OpenSpec and GitHub Spec Kit are plug-in implementations of that semantic module; neither tool owns the module contract.

Do not add a workflow platform, agent framework, package marketplace, distributed scheduler, or plug-in-specific kernel behavior.

## Invariants

- Core code must never branch on a Module or plug-in ID such as `openspec`.
- A Module owns tool-neutral ports, outcomes, result contracts, evidence semantics, and portable options.
- A Module plug-in owns execution mode, implementation configuration, and requested capabilities.
- An invocation pins the exact Module, operation, plug-in, configuration, options, and input artifacts.
- Plug-ins receive only `ModuleInvocation` plus bounded host services.
- Plug-ins return only `ModuleResult`; they cannot mutate Run or pipeline state directly.
- Artifacts and Evidence cross boundaries; conversational or native tool state does not.
- A recorded effect result is reused on resume rather than implicitly rerun.
- Adding or replacing a plug-in must not require a core change when it implements the same exact Module contract.
- Requirements gathering emits candidates, clarification artifacts, or diagnostics. Validation, approval, and baseline promotion are downstream concerns.

## Workflow

Before implementation:

1. Update the semantic contract or plug-in manifest.
2. Add a conformance fixture demonstrating generic behavior.
3. Verify the generic command example and both requirements plug-ins.
4. Prove core source contains no plug-in-specific branch.
5. Keep dependencies minimal. Ajv is the contract validator; do not hand-roll JSON Schema validation.

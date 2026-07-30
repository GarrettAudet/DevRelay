# AGENTS.md

## Purpose

DevRelay is a small deterministic runner for composable software-engineering Modules.

## Current Scope

The first pass defines and proves the generic Module boundary. Do not add a workflow platform, agent framework, package marketplace, distributed scheduler, or module-specific kernel behavior.

## Invariants

- Core code must never branch on a Module ID such as `openspec`.
- Modules receive only `ModuleInvocation` plus bounded host services.
- Modules return only `ModuleResult`; they cannot mutate Run or pipeline state directly.
- Module configuration is opaque to core after schema validation.
- Artifacts and Evidence cross Module boundaries; conversational memory does not.
- A recorded effect result is reused on resume rather than implicitly rerun.
- Exact Module ID, version, operation, configuration, and input artifacts identify an invocation.
- Adding or replacing a Module must not require a core change when its ports remain compatible.

## Workflow

Before implementation:

1. Update the contract or example.
2. Add a conformance fixture demonstrating generic behavior.
3. Verify both the generic command example and the OpenSpec example.
4. Keep dependencies at zero until a dependency removes clear repeated work.

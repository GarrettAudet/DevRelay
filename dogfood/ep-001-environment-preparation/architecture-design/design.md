# DevRelay EP-001 EnvironmentPreparation/Verification architecture change

## Context

WorkExecution can currently begin without one approved profile-bound proof that the exact host and project environment is safe and ready.

## Decision

Add EnvironmentPreparation as a provider-neutral semantic module after SpecialistAssignmentGate. Keep profile resolution, inventory, remediation, and effect proposals in the module. Keep fingerprinting, checkpointing, EnvironmentVerificationGate, readiness-to-attempt binding, and traceability authority in Core.

## Adapters

Ship a native Windows inventory/verifier for the controlled host. Expose inventory, acquire, configure, service-check, and target-probe capability slots so external tools remain optional bounded bindings.

## Failure behavior

Unknown or failed required checks, stale fingerprints, missing grants, unsafe rollback, secret leakage, undeclared network access, or adapter drift blocks WorkExecution. Exact replay performs zero effects.

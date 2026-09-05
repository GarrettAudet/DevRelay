# DevRelay RP-001 ReleasePreparation and ReleaseVerification architecture change

## Context

SystemVerification can prove integrated software quality but does not materialize or prove one exact release candidate, and current release scripts do not provide a semantic module and Gate boundary for candidate readiness.

## Decision

Add conditional ReleasePreparation after SystemVerification and a separate Core-owned ReleaseVerificationGate before BusinessAcceptance. Keep candidate identity and bounded materialization in the module. Keep stored-byte verification, policy evaluation, checkpoints, readiness authority, compact summary, and traceability authority in Core.

## Adapters

Ship native Node and Windows catalog, pack, checksum, SBOM, export, installed-package, and consumer verification capabilities. Expose materialize, inspect, verify, attest, and publication-prerequisite-probe slots while keeping hosted publication systems optional and non-authoritative.

## Failure behavior

Missing or stale environment readiness, identity drift, failed or unknown obligations, rebuilt or substituted bytes, policy violations, unsafe grants, secret leakage, or adapter drift blocks release readiness. Exact replay performs zero release effects. No successful result publishes, tags, deploys, or mutates protected main.

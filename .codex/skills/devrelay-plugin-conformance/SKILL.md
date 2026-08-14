---
name: devrelay-plugin-conformance
description: Evaluate a DevRelay adapter or plug-in and record its exact maturity and bounded authority. Use when comparing contract-defined, fixture-conformant, live-conformant, release-ready, simulated, or unavailable integrations and when live tool receipts and provider attestations must be distinguished from schemas or fixtures.
---

# DevRelay Plug-in Conformance

1. Identify the exact Module operation and step binding, plug-in version, provider version, configuration digest, capability demand, permissions, and normalization contract.
2. Resolve the provider through the host-owned pinned toolchain. Never download or discover a replacement inside the adapter.
3. Classify evidence precisely:
   - unavailable: the pinned provider cannot be resolved or policy rejects it.
   - contract-defined: schemas and binding contracts exist without executable conformance.
   - fixture-conformant: deterministic fixtures exercise the adapter contract without the real provider.
   - live-conformant: a trusted host attestation binds a real provider execution, exact command receipt, native artifacts, and normalization result.
   - release-ready: live conformance plus supported-platform regression, replay, security, packaging, and release evidence.
4. Exercise positive, negative, permission, tamper, checkpoint, and zero-call replay cases.
5. Preserve raw receipts, native artifacts, normalized output, provider attestation, and maturity decision.
6. Reject provider-authored maturity, Gate authority, graph operations, implicit network calls, and unpinned versions.
7. Report the narrowest supported operation. Do not claim the full upstream repository or workflow is integrated when only one capability ran.

Core validates the normalized result and owns progression. This skill can propose a maturity record but cannot promote it.

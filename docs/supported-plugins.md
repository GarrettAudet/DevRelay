# Plug-in support in the modular preview

A registration is not proof that an upstream tool is installed, callable or live-conformant. Support is version- and environment-specific. The runtime catalog describes exact registered bindings and required configuration; this document states what has been exercised.

| Binding | Capability | Status and evidence boundary |
| --- | --- | --- |
| node-sha256@1.0.0 | example.content-digest@1.0.0 / compute | Live local reference implementation using Node createHash; tested with known vectors, real file input and substitution. No external service. |
| webcrypto-sha256@1.0.0 | Same capability and operation | Live local reference implementation using WebCrypto subtle.digest; the same contract and tests. No external service. |

These are small developer examples demonstrating the wrapper, not a complete coding harness or two independent coding agents. Their source and executable conformance cases ship with the branch. Qualification on another runtime/host requires running the tests there.

## Existing repository integrations

The repository also contains native implementations for architecture inventory, JSON Schema generation, dependency mechanics, specialist selection, local Git integration and lifecycle reporting. Their existing versioned contracts and evidence remain authoritative; this preview does not recertify them.

OpenSpec, GitHub Spec Kit, Task Master, Structurizr, MADR, A2A and external test/review bindings remain contract-defined or fixture-conformant unless an exact live execution receipt establishes otherwise. They are not made runnable by adding a catalog row.

Superpowers is used to develop DevRelay. It is not a supported runtime plug-in in this preview.

## Adding a supported binding

1. Implement one exact declared Module operation/step with the standard manifest and bounded adapter.
2. Run conformance tests, including real failure and applicable recovery cases.
3. Record exact implementation/version, dependencies, host requirements, grants and observed evidence.
4. Add its registration to the host configuration and list its actual maturity here.

A compatibility claim is limited to the tested semantic contract. Updates produce new immutable versions and must be explicitly selected; an active invocation cannot float to latest.

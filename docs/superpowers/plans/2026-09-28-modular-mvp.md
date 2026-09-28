# Modular DevRelay developer preview plan

Goal: ship a focused modular entry point, validated registration catalog and runnable interchangeability example, using the existing Core.

Spec: docs/specs/devrelay-modular-mvp.md. The owner approved the direction and requested a GitHub branch. Superpowers is development tooling, not a runtime dependency.

Architecture: reuse ModuleDefinition, ModulePlugin, ModuleInvocation and ModuleResult. The catalog exposes metadata for exact registered bindings and delegates execution to the unchanged registry. Two pure SHA-256 implementations demonstrate replacement; effect/recovery semantics remain the existing host/Core responsibility.

Constraints: Node >=22, existing Ajv, no new dependencies, Desktop on Windows, no implicit providers or commands, no policy or traceability bypass. Preserve all existing exports and published versions.

Baseline reuse: this additive preview exercises the current approved paired requirements/overview 2.8.0, especially CAP-DEV-EXTENSIBILITY-001, BO-DEV-MODULARITY-001 and BO-DEV-ADOPTION-001. It does not replace the baseline, relax existing lifecycle obligations or claim acceptance of the full product. The broader release-scope proposal is kept distinct from this implemented slice.

Execution: inline TDD, then fresh independent review, under the user's Proceed authorization. Superpowers skills read at commit 8ca22dba9a94f28898bbce59f2537ff4d87c747d. Use native PowerShell/Node progress records because the upstream Bash helpers are not available on this Windows host. Keep evidence rather than deleting it.

Review focus: caller mutation, malformed filters widening selection, invalid artifact/result rejection, catalog entries falsely implying live certification, and installed-package imports.

## Task 1: Registration catalog

Files: src/plugin-catalog.mjs; test/plugin-catalog.test.mjs.
Interface: createPluginCatalog({ modules, plugins, artifactContracts, traceability }) -> { registry, list(filter = {}) }.
Filters: exact module {id,version}, operation and step. Entries expose frozen exact plugin/module identities, configuration schema and capability demands. No automatic selection or certification.

- [x] Write tests for listing, exact filters, invalid filters, duplicate/incompatible registration and mutation isolation.
- [x] Observe RED, implement by delegating contract validation to Core, verify GREEN.
- [x] Run existing Module/registry regression tests.

## Task 2: Interchangeability example

Files: examples/modular/digest.mjs; examples/modular/run.mjs; test/modular-example.test.mjs.
Interface: same digest capability implemented by Node createHash and WebCrypto, using exact artifact bytes and declared project context.
- [x] Test known vectors, empty/Unicode input, substitution, composition and rejection of tampered/malformed artifacts.
- [x] Observe RED, implement, verify GREEN.
- [x] Exercise both plugins against existing and newly created project files.

## Task 3: Package and documentation

Files: src/modular.mjs; docs/modular-quickstart.md; docs/supported-plugins.md; package.json; README.md.
Interface: devrelay/modular exports the catalog and existing Core APIs; examples ship with the package.
- [x] Verify missing package entry behavior, add exports and package inclusion.
- [x] Document plugin authoring, conformance, permissions and host checkpoint/traceability responsibilities.
- [x] Verify an isolated installed-package consumer.

## Task 4: Review and publish
- [x] Run relevant regressions and the repository's full test command, reporting environment/pre-existing failures precisely.
- [x] Obtain fresh review, fix material findings and rerun affected checks.
- [ ] Publish the verified MVP branch; the GitHub commit/PR is the delivery record.

Verification details and review disposition: [modular preview verification](../../modular-preview-verification.md).

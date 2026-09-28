# DevRelay modular MVP, developed using Superpowers

Date: 2026-09-28. Status: owner-approved direction; additive developer preview on codex/modular-mvp. The broader release-scope change remains a candidate, not a promoted product baseline.

## Owner intent

Use Superpowers as the development methodology/tooling to build DevRelay. The immediate task is not to wrap Superpowers as a DevRelay plug-in.

DevRelay's first release should concentrate on a small modular framework with standardized plug-in boundaries and a catalog of supported implementations. The larger engineering lifecycle already developed can become a reference workflow composed using the framework, rather than the prerequisite for shipping the framework itself.

Operation remains inside ChatGPT Desktop on Windows. Both existing repositories and new projects remain intended use cases. Neither requires a separate orchestration engine; they are inputs and eventual workflows that the modular framework should accommodate.

This corrects the earlier, unapproved proposal to prioritize a Superpowers executor/reviewer adapter. No such adapter was installed or implemented.

## Recommended first-release promise

Select a supported capability and compatible plug-in, supply its declared inputs, run it from Desktop, and receive a validated result with explicit evidence and recoverable execution state. Substitute a compatible implementation through configuration without changing Generic Core.

DevRelay standardizes the boundary and execution rules. The plug-in provides the capability. A workflow composes capabilities and supplies its own policy obligations.

## What ships

1. The smallest supported contract subset from existing `ModuleDefinition`, `ModulePlugin`, invocation and result contracts: identity/version, semantic inputs/outputs, configuration, capabilities, outcomes and evidence.
2. A generic loader/dispatcher that validates compatibility and explicit grants before invocation, validates results, and retains existing effect-checkpoint and recovery protections. Reuse the existing Core where it fits; do not write another engine.
3. A small checked catalog identifying supported versions, entry points, configuration and maturity. A catalog entry distinguishes contract-defined, fixture-conformant and live-conformant support.
4. A conformance harness so an adapter author can prove valid behavior, invalid-input rejection, permission boundaries, failures and applicable replay behavior.
5. A minimal Desktop entry skill for listing compatible plug-ins, invoking one and inspecting its result, backed by supported host tools.
6. Two live implementations of at least one shared capability, plus a small composition example. This demonstrates actual substitution rather than only a common manifest shape.

Exact initial plug-ins should be chosen by inspecting which existing bindings are already live and cheapest to qualify. Do not advertise external repositories as supported simply because a fixture or manifest exists. A Markdown/JSON catalog is sufficient initially; no marketplace service or graphical block editor is needed.

## What is outside the MVP acceptance boundary

- Completing the entire requirements-to-business-acceptance lifecycle as the default experience.
- A universal workflow builder, full preset catalog, large template library or arbitrary third-party compatibility.
- Meta-Harness optimization, agent strategy experiments and automatic policy tuning.
- Advanced parallel scheduling, multi-provider/model management and hosted operation.
- A full operator dashboard, graph explorer, marketplace, or cross-platform release.
- Making Superpowers a runtime dependency of shipped DevRelay or building its adapter now.

Existing code and evidence for these capabilities remain preserved. Moving a feature outside the MVP does not mark it accepted or remove safeguards from an existing active run.

## Relationship to the existing lifecycle

The framework provides the generic mechanisms. The current full engineering lifecycle becomes a proposed reference workflow/policy pack that uses those mechanisms. Requirements, architecture, specialized Gates and rich SDLC policies remain meaningful within that pack; the framework should not force every unrelated plug-in invocation through that entire process.

This is an actual release-scope and policy-boundary change, not just a simpler UI. It must be reflected in versioned requirements and architecture before changing runtime semantics. Generic Core must remain neutral. Existing validation, authorization, durable checkpoints, traceability obligations and required verification cannot be silently removed from already governed work.

The first small example computes content digests with two real interchangeable implementations and handles files from an existing repository or a newly created project. The current large lifecycle is a follow-on reference example whose maturity is reported honestly, not an MVP shipping prerequisite.

## How Superpowers is used

Use its design, planning, TDD, debugging and review practices while implementing the agreed MVP in this repository, inside Desktop. Treat it as development tooling, similar to a test or review tool. Its use during development does not determine DevRelay's runtime API or force a Superpowers dependency on users.

Development used the upstream skills at commit 8ca22dba9a94f28898bbce59f2537ff4d87c747d directly in Desktop: design, planning, TDD, execution and verification. Its Bash helper scripts were not available on this Windows host; PowerShell and Node recorded the equivalent progress evidence. Superpowers was not installed as a product dependency or plug-in.

## First implementation sequence

1. Freeze the smaller product promise and map existing code to framework, adapter and reference-workflow responsibilities. Select exact already-implemented contracts/bindings to reuse.
2. Define the supported contract subset and qualification criteria; avoid extracting/reorganizing the entire repository before proving the boundary.
3. Package the minimal framework and small catalog with two live interchangeable implementations. Add only the missing glue and meaningful conformance tests.
4. Exercise valid invocation, substitution, composition, failure, denied permission, malformed results and applicable restart/replay paths inside Desktop.
5. Deliver a documented developer preview with measured evidence. Port/finish the broader lifecycle as a separate example after that preview works.

A four-hour session should target this first vertical slice. An exact completion estimate depends on the audit of reusable runtime paths and their current integration gaps; it is not established by this scope proposal.

## Session evidence

Bootstrap passed for `superpowers-modular-scope-20260928`, receipt `DPMBR-55650F4C11843D4B`. ProjectMemory baseline `PMB-MUC-7A172C974C0158E7`; baseline digest `sha256:47eddea9836521b0b1557782740121feab15d5fbc9ad6556654172b0334a57e4`; synopsis digest `sha256:4d1ec4b933d0736cb2d7ad568816788d50bcbc5dd018e7a95cce51fd83e6caab`; graph digest `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee`. Inspected prior ProjectMemory session status: concluded.

The initial scope discussion changed only this candidate document. The subsequent owner-approved implementation adds the focused catalog, entry point, sample adapters, tests and documentation on an isolated branch. It reuses the current 2.8.0 approved requirements/overview pair under CAP-DEV-EXTENSIBILITY-001; it does not change runtime semantics or relax existing lifecycle obligations. The full lifecycle remains a proposed reference workflow. No Gate or ProjectMemory promotion is claimed.

## References

- [Existing Module and plug-in contracts](../module-contract.md)
- [Current broader product direction](modular-execution-product-direction.md)
- [Superpowers](https://github.com/obra/superpowers)

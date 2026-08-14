# Upstream module benchmark - initial snapshot

Snapshot date: 2026-08-13

This is a research input, not an adoption decision. Each candidate must later
receive a version-pinned adapter evaluation, license/security review, Windows
Desktop execution assessment, conformance plan, and explicit maturity label.

| DevRelay surface | Current strength | High-value upstream practices to evaluate | Initial gap |
| --- | --- | --- | --- |
| RequirementsGathering | Typed baselines, stateless clarification, exact lineage, OpenSpec host-executor adapter | Spec Kit clarify/checklist/analyze; BMAD coached discovery/PRD validation; GSD adaptive discussion/assumptions; Superpowers one-question dialogue and alternatives; OpenSpec explore/delta scenarios | Core does not yet own a decision-domain coverage and closure loop |
| ArchitectureDiscovery | Deterministic offline inventory, privacy controls, GDScript semantics | Tree-sitter language parsers; SCIP indexes; dependency-cruiser; Semgrep observations | Semantic depth and language coverage remain narrow |
| ArchitectureDesign | Routed baseline/change operations; bounded Spec Kit, OpenSpec, Structurizr, MADR chain | Structurizr validation/export; LikeC4 as optional modeler; additional ADR tooling; architecture fitness functions | Most upstream bindings are not yet live-provider-attested |
| ContractGeneration | Core-owned validation/diff with OpenAPI, AsyncAPI, JSON Schema, Protobuf generators | Spectral lint rules; Buf lint/breaking; AsyncAPI CLI; OpenAPI Generator downstream conformance | Generation is stronger than governance and compatibility tooling |
| WorkBreakdown | Typed, bounded, traceable deliverables and coverage dispositions | Spec Kit tasks/analyze; OpenSpec tasks; BMAD epics/stories/readiness; GSD phase planning | Optional adapters need live execution and cross-artifact quality scoring |
| WorkDependencyAnalysis | Native proposal, Graphology DAG, OPA policy, optional reviewers | Task Master proposals; Spec Kit consistency review; build-system project graphs | External proposal/review bindings are mostly fixture maturity |
| SpecialistAssignment | Provider-neutral profiles, A2A card import, deterministic ranking | A2A discovery; signed capability catalogs; MCP/tool and Codex skill inventories | Discovery and runtime availability are not live-attested |
| WorkExecution | Core readiness/binding/checkpoint/replay boundary | ChatGPT Desktop/Codex task execution; A2A task execution; bounded local-command hosts | Release catalog has no concrete WorkExecution plug-in |
| WorkItemVerification | Obligation expansion, policy, evidence normalization, test/review ports | Playwright; language test runners; CodeQL/Semgrep; Stryker mutation testing; accessibility/performance tools | Generic fixtures exist, but best-in-class verifier catalog and live proofs are thin |
| ChangeIntegration | Local Git compare-and-swap and recovery | GitHub pull requests, protected-branch checks, merge queue, signed commits | No bounded live GitHub integration adapter |
| SystemVerification | System obligations, independent test/review evidence, replay | Playwright suites; contract testing; CodeQL; ORT/SBOM policy; load/reliability tooling | Evidence families and provider maturity need expansion |
| BusinessAcceptanceGate | Exact scope/evidence approval and exclusions | Spec Kit converge; OpenSpec verify; scenario/BDD acceptance summaries | Human review UX and automated business-outcome coverage could improve |
| TraceabilityGraph | Append-only authority-scoped graph, deterministic contributors, diagnostics | OSLC interoperability; durable graph stores; signed provenance/attestations | Reference in-memory persistence and limited external interchange |

## Evaluation principles

1. Adopt capabilities, not whole upstream workflows.
2. Keep semantic contracts provider-neutral and immutable by version.
3. Let Core own routing, coverage, policy, progression, and graph authority.
4. Pin upstream version, command, configuration, permissions, input bytes, and
   native output evidence for every live execution claim.
5. Preserve honest maturity: `contract-defined`, `fixture-conformant`,
   `live-conformant`, or `release-ready`.
6. Optimize the ChatGPT Desktop on Windows path first.

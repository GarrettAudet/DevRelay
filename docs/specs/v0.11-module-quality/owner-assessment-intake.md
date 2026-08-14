# Owner assessment intake - live integration depth

Date: 2026-08-13

Status: RequirementsGathering input; architecture and implementation are not yet approved.

## Assessment accepted as direction

The owner rates DevRelay's deterministic traceability highly and identifies live ecosystem integration as the main weakness. The priority is to preserve Core authority while replacing contract-only claims with version-pinned, receipt-backed provider executions where that produces material engineering value.

## Canonical workstreams

### MQ-01 - Requirements interview and closure

Add a Core-owned decision-domain catalog, coverage ledger, deterministic depth policy, contradiction and duplication checks, persisted clarification continuation, and a closure proof consumed by RequirementsGate. Provider adapters may propose questions and candidate answers; they cannot declare completeness.

### MQ-02 - Live specification and architecture providers

- Execute pinned OpenSpec capabilities through the bounded operation adapter, run strict native validation, archive the exact native artifacts, and emit a provider-execution attestation.
- Execute the applicable GitHub Spec Kit capability through a bounded host adapter and preserve its prompts, configuration, outputs, command or tool identity, and receipt without giving Spec Kit lifecycle authority.
- Execute a current, pinned Structurizr toolchain to validate and inspect the DSL, export the native model, normalize it, and compare hierarchy, elements, relationships, and views to the canonical architecture artifact.
- Render and validate pinned MADR templates deterministically. MADR itself is a format and template upstream; do not label it a live CLI provider unless a separate executable implementation is selected and evaluated.

### MQ-03 - Optional Godot engineering pack

Candidate adapters:

- `GodotAiDiscoveryAdapter`: read-only editor and project state, scene hierarchy, node properties, diagnostics, and repository observations.
- `GodotAiExecutionAdapter`: explicitly granted scene, node, script, signal, input, and project-run operations. Each effect is checkpointed and produces raw request, response, and changed-artifact receipts.
- `GodotAiEvidenceAdapter`: screenshots, run state, diagnostics, and log slices normalized into typed evidence without treating image descriptions as raw screenshot equivalence.
- `GdUnit4WorkItemVerificationAdapter`: focused test discovery and execution with normalized JUnit and test receipts for a work item.
- `GdUnit4SystemVerificationAdapter`: full-suite, scene-runner, fuzz or parameter, flake, orphan-node, and CI report evidence for system verification.

The pack must declare only the existing capability demand kinds. Fine-grained Godot operation allowlists belong in grant and configuration scope; an external host remains responsible for enforcing filesystem, process, network, and secret permissions.

### MQ-04 - Automatic raw execution receipts

Add a Core-owned receipt recorder around provider execution. When observable, the receipt contains:

- invocation, step, adapter, operation, and execution IDs;
- normalized command or tool fingerprint and configuration digest;
- exact stdout, stderr, or structured tool-response bytes and digests;
- exit or termination status, start and end time, monotonic duration, retry identity;
- provider, engine, runtime, and host versions;
- input and produced-artifact digests;
- redaction policy and an explicit list of unavailable observations.

Adapters supply native observations. Core canonicalizes, validates, hashes, checkpoints, and references the receipt from the execution ledger.

### MQ-05 - Two-phase Git sealing

Use two identities:

1. `ImplementationCommit` contains the approved integrated source change.
2. `EvidenceSealCommit` contains immutable evidence that references and hashes the implementation commit and its verification receipts.

The evidence seal never attempts to contain its own commit hash. A later BusinessAcceptance or release record may reference the exact seal commit from outside that commit. ChangeIntegration owns the implementation commit and seal transaction; acceptance owns approval, not Git mutation.

### MQ-06 - Queryable traceability and compact reporting

Expose a read-only MCP projection over TraceabilityGraph with typed operations for provenance (`why`), coverage, impact, evidence, and orphan diagnostics. Queries cannot create nodes or edges, promote facts, or bypass graph scopes. Compact mode is the default and returns the shortest supporting paths, counts, and diagnostics; callers explicitly request expanded paths or edge lists.

### MQ-07 - Performance telemetry

Attach a typed `RunMetrics` artifact to ModuleExecutionRecord. Candidate fields include stage and cycle duration, provider time, retry count, test time, cache hits, changed-file counts, receipt bytes, and host-reported token or tool usage. Unknown metrics remain unknown. Metrics are observational unless a separately approved versioned policy declares a Gate dependency.

### MQ-08 - ChatGPT Desktop skills

Create four thin operating surfaces that invoke DevRelay rather than duplicate its policy:

- `devrelay-cycle`: run one bounded goal through the released circuit.
- `devrelay-godot-release`: invoke the Godot pack's test, soak, export, smoke, hash, and evidence-seal operations.
- `devrelay-plugin-conformance`: inspect and prove `contract-defined`, `fixture-conformant`, `live-conformant`, `release-ready`, or `unavailable`.
- `devrelay-trace-query`: issue typed read-only traceability questions and render compact provenance, coverage, or impact results.

Recommended distribution is repository-scoped `.agents/skills` for identical behavior from a GitHub source checkout in ChatGPT Desktop on Windows. A Codex plug-in package can be evaluated later if installation and discovery ergonomics justify it.

### MQ-09 - Optional production feedback (deferred)

Sentry and PostHog are opt-in observation adapters, disabled by default. They may normalize bounded crash or product-usage observations into a future intake artifact. They do not mutate RequirementsBaseline or TraceabilityGraph and do not authorize lifecycle work. Privacy, consent, retention, redaction, and network grants require a separate requirements and adapter review.

## Trust-boundary rules

1. Provider output is untrusted until normalized and validated by Core.
2. A live integration claim requires an exact version-pinned provider receipt; an adapter fixture proves only fixture conformance.
3. MCP tools are capability surfaces, not workflow authorities.
4. Screenshots, simulated input, commands, network calls, and file mutations require explicit bounded grants and durable receipts.
5. Traceability queries are read-only; trusted contributors remain the only source of graph update sets.
6. Skills orchestrate the public DevRelay surface and contain no hidden Module semantics.

## Decisions requiring owner closure

1. Interview depth: use exhaustive coverage for new and high-risk work and an adaptive shorter path for small, understood changes (recommended), or force exhaustive depth for every invocation.
2. Godot packaging: make Godot the first official optional domain pack while keeping Core domain-neutral (recommended), or embed Godot-specific behavior in the base release.
3. Skill distribution: commit the four skills under repository-scoped `.agents/skills` (recommended), or keep them personal to one Desktop host.

## Current RequirementsGathering outcome

`clarify`

No integration code, dependency installation, or live provider invocation is authorized until the decisions above are closed and the resulting RequirementsGate candidate is reviewed.

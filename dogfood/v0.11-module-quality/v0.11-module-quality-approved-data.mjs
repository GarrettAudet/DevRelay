const sortedCollectionKeys = new Set([
  "acceptanceCriteria", "assumptions", "businessObjectives", "capabilities",
  "constraints", "nonFunctionalRequirements", "nonGoals", "scope",
  "stakeholders", "successMetrics", "terminology", "userJourneys",
  "userStories", "users",
]);
const sortedStringArrayKeys = new Set([
  "acceptanceCriterionIds", "aliases", "businessObjectiveIds", "capabilityIds",
  "deliverables", "dependencies", "interests", "needs", "requiredEvidence",
  "risks", "stakeholderIds", "userIds", "userJourneyIds",
]);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") return entries.sort((left, right) => compareText(
      [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
      [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
    ));
    if (sortedCollectionKeys.has(key)) return entries.sort((left, right) => compareText(left.id, right.id));
    if (sortedStringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) return [...new Set(entries)].sort(compareText);
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]));
}
const sourced = (sourceRefs, value) => ({ ...value, sourceRefs: structuredClone(sourceRefs) });
const appendUnique = (entries, values) => [...new Set([...entries, ...values])];

export const ownerDecisions = Object.freeze([
  ["Q-MQ-DEPTH-001", "Use adaptive depth with mandatory closure, expanding questions as size, risk, or ambiguity grows until deterministic weighted coverage is at least 0.99."],
  ["Q-MQ-GODOT-PACK-001", "Make Godot the first official optional domain pack while keeping Core and semantic Modules domain-neutral."],
  ["Q-MQ-SKILLS-001", "Commit devrelay-cycle, devrelay-godot-release, devrelay-plugin-conformance, and devrelay-trace-query under repository-scoped .agents/skills."],
  ["Q-MQ-STRATEGIES-001", "Ship a native composite interviewing strategy and configurable bounded Spec Kit, BMAD, GSD, Superpowers, and OpenSpec strategy adapters."],
  ["Q-MQ-ACQUISITION-001", "Acquire live providers project-locally in a checksum-pinned cache after explicit first-download approval; never install globally."],
  ["Q-MQ-UPDATES-001", "Lock provider versions until controlled evaluation and promotion; forbid floating latest and automatic upgrades."],
  ["Q-MQ-NETWORK-001", "Default adapters to local and offline; require an explicit network.connect grant for remote calls or source transmission."],
  ["Q-MQ-FALLBACK-001", "Forbid silent fallback and use a native fallback only when explicitly configured, preserving provider failure or unavailability."],
  ["Q-MQ-UNKNOWN-001", "Allow only owner-approved non-blocking assumptions; keep security, privacy, destructive behavior, public API, data-loss, and acceptance ambiguity blocking."],
  ["Q-MQ-WAVES-001", "Use breadth-first, resumable interview waves without an arbitrary question cap and always expose coverage and remaining blockers."],
  ["Q-MQ-CONFLICT-001", "Deduplicate strategy disagreement into one conflict set with alternatives and trade-offs for owner resolution."],
  ["Q-MQ-GODOT-GRANTS-001", "Make Godot inspection read-only by default and separately allowlist writes, input, execution, screenshots, and tests."],
  ["Q-MQ-GODOT-RECEIPTS-001", "Preserve original screenshot bytes and hashes plus capture metadata and preserve exact input actions, timing, targets, and results."],
  ["Q-MQ-GODOT-RELEASE-001", "Require focused and complete GdUnit4 tests, flake or soak execution, export, exported-build smoke testing, and artifact hashing, with explicit not-applicable dispositions."],
  ["Q-MQ-RAW-RECEIPTS-001", "Keep raw receipts as immutable local artifacts, commit digest-bound redacted views, and block persistence when secrets or unsafe content are detected."],
  ["Q-MQ-TELEMETRY-001", "Enable local-only host-observed performance telemetry by default with no network export."],
  ["Q-MQ-PRODUCTION-FEEDBACK-001", "Keep Sentry and PostHog disabled, uninstalled, and outside V0.11 pending separate privacy requirements."],
  ["Q-MQ-LIVE-TARGETS-001", "Require OpenSpec, Spec Kit, current Structurizr tooling, MADR format conformance, Godot AI, and GdUnit4 to become live-conformant and prove the combined path release-ready."],
  ["Q-MQ-STRATEGY-MATURITY-001", "Evaluate BMAD, GSD, and Superpowers and claim live maturity only for bounded deterministic license-compatible operations; otherwise adopt the practice natively and label the binding honestly."],
  ["Q-MQ-END-TO-END-001", "Require a clean GitHub checkout in ChatGPT Desktop on Windows to complete a small Godot change through the full circuit with receipts, trace queries, two-phase sealing, compact reporting, and all four skills."],
  ["Q-MQ-COMPATIBILITY-001", "Derive Godot support only from a version-pinned live-attested compatibility matrix and claim no untested version or project-specific compatibility."],
].map(([questionId, decision]) => Object.freeze({ questionId, decision, answer: "Approve exactly as stated" })));

export function buildModuleQualityRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = typeof makeSourceRefs === "function" ? makeSourceRefs() : structuredClone(makeSourceRefs);
  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary: "V0.11 module-quality requirements are clarified and closed: adaptive breadth-first requirements interviews, live-attested priority providers, an optional Godot pack, automatic receipts, two-phase Git sealing, queryable traceability, local telemetry, and four repository-scoped Desktop skills.",
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, { id: "BO-DEV-REQ-QUALITY-001", statement: "Elicit sufficiently complete, testable requirements through adaptive interview depth and deterministic mandatory closure.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" }),
    sourced(sourceRefs, { id: "BO-DEV-LIVE-INTEGRATION-001", statement: "Replace ambiguous contract-only integration claims with version-pinned, receipt-backed live provider conformance while preserving Core authority.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" }),
    sourced(sourceRefs, { id: "BO-DEV-DOMAIN-PACK-001", statement: "Support production-quality domain workflows through optional packs without placing domain behavior in Generic Core.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" }),
  );
  requirements.successMetrics.push(
    sourced(sourceRefs, { id: "SM-DEV-REQ-CLOSURE-001", name: "Deterministic requirements closure", businessObjectiveIds: ["BO-DEV-REQ-QUALITY-001"], measure: "Applicable decision-domain weight resolved with zero blocking unknowns or contradictions.", target: "At least 0.99 weighted coverage and exactly zero blocking unresolved decisions for every promoted candidate.", measurementMethod: "Recompute the version-pinned RequirementsClosureAssessment from question waves, responses, dispositions, weights, and source artifacts." }),
    sourced(sourceRefs, { id: "SM-DEV-LIVE-INTEGRATION-001", name: "Honest live provider maturity", businessObjectiveIds: ["BO-DEV-LIVE-INTEGRATION-001"], measure: "Priority provider bindings backed by exact live execution attestations and negative conformance evidence.", target: "100 percent of OpenSpec, Spec Kit, current Structurizr, MADR conformance, Godot AI, and GdUnit4 release claims are live-attested or explicitly unavailable.", measurementMethod: "Validate provider versions, configuration, permissions, raw receipts, normalized outputs, replay behavior, and maturity records." }),
    sourced(sourceRefs, { id: "SM-DEV-GODOT-E2E-001", name: "Accepted Godot domain dogfood", businessObjectiveIds: ["BO-DEV-DOMAIN-PACK-001"], measure: "Applicable lifecycle stages completed for a small Godot change from a clean Windows Desktop checkout.", target: "100 percent of applicable Modules and Gates pass with exact evidence and compatibility bindings.", measurementMethod: "Reconcile the LifecycleRunReport, GdUnit4 evidence, screenshots and input receipts, export smoke test, trace queries, Git seals, and BusinessAcceptance." }),
  );

  const capabilityIds = [
    ["CAP-DEV-REQ-INTERVIEW-001", "Adaptive requirements interview", "Run native or configured strategy chains in breadth-first waves and produce a deterministic closure proof.", "BO-DEV-REQ-QUALITY-001"],
    ["CAP-DEV-LIVE-PROVIDER-001", "Live provider attestation", "Invoke version-pinned bounded providers and preserve exact execution, normalization, and conformance evidence.", "BO-DEV-LIVE-INTEGRATION-001"],
    ["CAP-DEV-GODOT-PACK-001", "Optional Godot engineering pack", "Bind Godot AI and GdUnit4 inspection, execution, verification, screenshots, inputs, exports, and compatibility evidence to existing Module ports.", "BO-DEV-DOMAIN-PACK-001"],
    ["CAP-DEV-EXECUTION-RECEIPT-001", "Automatic execution receipts and metrics", "Capture raw provider observations, redacted evidence views, deterministic fingerprints, and local performance metrics.", "BO-DEV-LIVE-INTEGRATION-001"],
    ["CAP-DEV-TRACE-QUERY-001", "Queryable traceability", "Answer read-only provenance, coverage, evidence, impact, and orphan questions with compact results by default.", "BO-DEV-LIVE-INTEGRATION-001"],
    ["CAP-DEV-EVIDENCE-SEAL-001", "Two-phase Git evidence sealing", "Separate the implementation commit from an evidence-seal commit without self-referential commit claims.", "BO-DEV-LIVE-INTEGRATION-001"],
    ["CAP-DEV-DESKTOP-SKILLS-001", "Repository-scoped DevRelay skills", "Expose cycle, Godot release, provider conformance, and trace query workflows to ChatGPT Desktop without duplicating Core policy.", "BO-DEV-DOMAIN-PACK-001"],
  ];
  requirements.capabilities.push(...capabilityIds.map(([id, name, description, objective]) => sourced(sourceRefs, { id, name, description, businessObjectiveIds: [objective], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must" })));

  requirements.userJourneys.push(sourced(sourceRefs, {
    id: "UJ-DEV-MODULE-QUALITY-001", name: "Run a live-attested domain engineering cycle", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityIds: capabilityIds.map(([id]) => id),
    trigger: "A user starts a bounded software change from ChatGPT Desktop on Windows.", outcome: "The change progresses from exhaustively closed requirements through live domain execution, verification, traceability, integration, and acceptance with exact evidence.",
    steps: [
      { sequence: 1, action: "Answer breadth-first requirements waves until deterministic closure.", expectedOutcome: "All blocking decisions are resolved and weighted coverage is at least 0.99." },
      { sequence: 2, action: "Execute configured live specification and architecture providers through bounded adapters.", expectedOutcome: "Native artifacts, provider receipts, normalization, and conformance evidence are preserved." },
      { sequence: 3, action: "Run a bounded Godot work item with explicit grants and structured verification.", expectedOutcome: "Code, tests, screenshots, inputs, logs, export, and smoke evidence are version-bound." },
      { sequence: 4, action: "Query traceability, integrate, seal evidence, and request acceptance.", expectedOutcome: "The lifecycle is compactly understandable and every claim resolves to exact source evidence." },
    ],
  }));

  const acceptanceIds = [
    "AC-DEV-REQ-WAVES-001", "AC-DEV-REQ-CLOSURE-001", "AC-DEV-REQ-STRATEGIES-001",
    "AC-DEV-PROVIDER-ACQUISITION-001", "AC-DEV-PROVIDER-FAILURE-001", "AC-DEV-LIVE-SPEC-001",
    "AC-DEV-LIVE-ARCH-001", "AC-DEV-GODOT-COMPAT-001", "AC-DEV-GODOT-GRANTS-001",
    "AC-DEV-GODOT-VERIFY-001", "AC-DEV-RECEIPTS-001", "AC-DEV-GIT-SEAL-001",
    "AC-DEV-TRACE-QUERY-001", "AC-DEV-METRICS-001", "AC-DEV-DESKTOP-SKILLS-001",
    "AC-DEV-MODULE-QUALITY-E2E-001",
  ];
  requirements.userStories.push(sourced(sourceRefs, {
    id: "US-DEV-MODULE-QUALITY-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-REQ-INTERVIEW-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
    need: "Use deep but proportionate requirements elicitation and live best-in-class engineering providers through one deterministic lifecycle.", benefit: "Production-quality changes remain modular, reproducible, inspectable, and provider-replaceable instead of relying on prompt improvisation.", priority: "must", acceptanceCriterionIds: acceptanceIds,
  }));

  requirements.userStories.push(
    sourced(sourceRefs, {
      id: "US-DEV-LIVE-PROVIDER-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-LIVE-PROVIDER-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
      need: "Invoke configured specification and architecture providers as bounded live operations with honest maturity evidence.", benefit: "Provider swapping improves engineering quality without transferring lifecycle authority or obscuring what actually executed.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-PROVIDER-ACQUISITION-001", "AC-DEV-PROVIDER-FAILURE-001", "AC-DEV-LIVE-SPEC-001", "AC-DEV-LIVE-ARCH-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-GODOT-PACK-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-GODOT-PACK-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
      need: "Use an optional Godot-aware execution and verification pack through the same DevRelay lifecycle.", benefit: "Godot changes receive least-privilege execution, structured tests, visual evidence, export verification, and tested compatibility.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-GODOT-COMPAT-001", "AC-DEV-GODOT-GRANTS-001", "AC-DEV-GODOT-VERIFY-001", "AC-DEV-MODULE-QUALITY-E2E-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-EXECUTION-RECEIPT-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-EXECUTION-RECEIPT-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
      need: "Inspect exact raw provider receipts and local performance measurements for every material execution.", benefit: "Failures, retries, provider behavior, and bottlenecks can be reconstructed without relying on summaries.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-RECEIPTS-001", "AC-DEV-METRICS-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-TRACE-QUERY-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-TRACE-QUERY-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
      need: "Ask concise provenance, coverage, evidence, impact, and orphan questions about a lifecycle run.", benefit: "The graph remains useful to humans as its size grows without dumping every edge by default.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-TRACE-QUERY-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-EVIDENCE-SEAL-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-EVIDENCE-SEAL-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
      need: "Seal verification evidence after the implementation commit without a self-referential commit claim.", benefit: "Source and evidence identities remain immutable, understandable, and independently verifiable.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-GIT-SEAL-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-DESKTOP-SKILLS-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-DESKTOP-SKILLS-001", userJourneyIds: ["UJ-DEV-MODULE-QUALITY-001"],
      need: "Operate common DevRelay cycles, Godot releases, provider conformance, and trace queries through discoverable repository skills.", benefit: "A clean GitHub checkout has the same simple ChatGPT Desktop operating surface without hidden duplicated policy.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-DESKTOP-SKILLS-001", "AC-DEV-MODULE-QUALITY-E2E-001"],
    }),
  );

  const criteria = [
    ["AC-DEV-REQ-WAVES-001", "RequirementsGathering asks every presently knowable applicable question in breadth-first waves and issues later waves only for newly exposed dependencies, gaps, or conflicts.", "Run new, ambiguous, and small-change fixtures and compare wave membership, reasons, resume state, and deterministic replay."],
    ["AC-DEV-REQ-CLOSURE-001", "No candidate progresses unless every blocking decision is closed, contradictions are zero, and reproducible weighted coverage is at least 0.99.", "Recompute closure from pinned catalog, weights, questions, responses, assumptions, and dispositions; exercise below-threshold and blocking-negative fixtures."],
    ["AC-DEV-REQ-STRATEGIES-001", "A native composite strategy works without external tools and configured Spec Kit, BMAD, GSD, Superpowers, or OpenSpec strategies may propose bounded questions without owning closure.", "Execute native and configured strategy fixtures, verify deduplication and conflict handling, and scan Core for provider-specific routing."],
    ["AC-DEV-PROVIDER-ACQUISITION-001", "Provider acquisition is project-local, checksum-pinned, explicitly approved before first download, offline by default, and never silently upgraded.", "Exercise clean install, checksum mismatch, denied network, existing cache, and attempted floating-version cases."],
    ["AC-DEV-PROVIDER-FAILURE-001", "Provider absence or failure is explicit and never silently replaced; native fallback occurs only when pinned configuration authorizes it.", "Run unavailable, failed, configured-fallback, and replay cases and inspect diagnostics and maturity records."],
    ["AC-DEV-LIVE-SPEC-001", "OpenSpec and Spec Kit execute bounded live capabilities with exact native artifact archival, strict validation, permissions, version identity, and provider receipts.", "Run both providers from a clean Windows checkout, validate native outputs, normalize them, and compare live attestations with negative fixtures."],
    ["AC-DEV-LIVE-ARCH-001", "Current Structurizr tooling validates, inspects, and exports the real model and MADR records are rendered and validated from pinned templates without a fictitious CLI claim.", "Execute the pinned Structurizr toolchain, normalize exports, compare hierarchy and views, and validate MADR template and semantic conformance."],
    ["AC-DEV-GODOT-COMPAT-001", "The Godot pack claims only version combinations recorded in a pinned matrix and exercised by DevRelay live conformance and end-to-end tests.", "Reject untested or mismatched engine, Godot AI, GdUnit4, adapter, and Windows combinations; verify every supported matrix row."],
    ["AC-DEV-GODOT-GRANTS-001", "Godot inspection is read-only by default and every write, input, execution, screenshot, or test operation is separately allowlisted and receipted.", "Exercise denied and granted operations, inspect exact effect checkpoints, and prove no undeclared capability executes."],
    ["AC-DEV-GODOT-VERIFY-001", "Godot acceptance preserves focused and full GdUnit4 results, flake or soak evidence, export and exported-build smoke evidence, hashes, original screenshots, and exact input receipts.", "Run the declared Windows matrix and reconcile JUnit, logs, images, actions, exports, hashes, and ApprovedNotApplicable dispositions."],
    ["AC-DEV-RECEIPTS-001", "Core persists immutable local raw receipts and digest-bound redacted Git views containing all host-observed execution identity, output, timing, version, retry, and artifact fields.", "Exercise stdout, stderr, structured MCP, missing observation, retry, redaction, secret detection, checkpoint, and replay cases."],
    ["AC-DEV-GIT-SEAL-001", "ChangeIntegration distinguishes an implementation commit from a later evidence-seal commit and never requires either commit to contain its own identity.", "Create and verify both commits, validate parentage and evidence bindings, and reject self-referential or stale seals."],
    ["AC-DEV-TRACE-QUERY-001", "A read-only MCP surface answers why, coverage, evidence, impact, and orphan questions with compact shortest-path results by default and cannot mutate graph state.", "Run query fixtures across graph scopes, compare compact and expanded results, and prove graph version and digest remain unchanged."],
    ["AC-DEV-METRICS-001", "Local-only telemetry records host-observed cycle, provider, retry, test, cache, changed-file, receipt-size, and available token or tool metrics without inventing unavailable values.", "Run repeated executions, validate units and unknown fields, and prove no network export or implicit Gate dependency."],
    ["AC-DEV-DESKTOP-SKILLS-001", "The four repository-scoped skills invoke released DevRelay operations from ChatGPT Desktop on Windows and contain no hidden Module policy.", "Validate skill structure and triggering, execute each from a clean checkout, and compare actions with the same direct DevRelay operations."],
    ["AC-DEV-MODULE-QUALITY-E2E-001", "A clean GitHub checkout completes a small Godot change through every applicable Module and Gate with live providers, receipts, trace queries, compact reporting, two-phase sealing, and BusinessAcceptance.", "Reconcile the complete Windows Desktop LifecycleRunReport with exact artifacts, provider attestations, checkpoints, graph updates, tests, commits, seal, and acceptance."],
  ];
  requirements.acceptanceCriteria.push(...criteria.map(([id, statement, verification]) => sourced(sourceRefs, { id, statement, verification })));

  const nfrs = [
    ["NFR-DEV-MQ-DETERMINISM-001", "reliability", "Question waves, closure, provider selection, receipt canonicalization, queries, metrics, compatibility evaluation, and sealing must be deterministic for exact inputs.", "Digest equality and zero-call replay across repeated runs.", "100 percent equality with zero unexplained drift.", ["AC-DEV-REQ-CLOSURE-001", "AC-DEV-RECEIPTS-001", "AC-DEV-GIT-SEAL-001"]],
    ["NFR-DEV-MQ-SECURITY-001", "security", "External providers and Godot effects must be least-privilege, offline by default, explicitly granted, secret-safe, and fail closed.", "Denied-operation, checksum, redaction, secret, and network-isolation conformance cases.", "Zero undeclared effects, silent downloads, secret-bearing committed receipts, or implicit network calls.", ["AC-DEV-PROVIDER-ACQUISITION-001", "AC-DEV-GODOT-GRANTS-001", "AC-DEV-RECEIPTS-001"]],
    ["NFR-DEV-MQ-PRIVACY-001", "privacy", "Raw execution evidence and telemetry remain local unless a separately approved export explicitly grants disclosure.", "Inspect network activity, persisted paths, redacted views, and optional-provider configuration.", "Zero default external telemetry or source transmission.", ["AC-DEV-PROVIDER-ACQUISITION-001", "AC-DEV-METRICS-001"]],
    ["NFR-DEV-MQ-COMPATIBILITY-001", "compatibility", "Live support claims must bind exact DevRelay, provider, runtime, engine, operating-system, and adapter versions.", "Execute every supported compatibility row and negative mismatched rows.", "100 percent of claimed rows pass; untested rows are unavailable.", ["AC-DEV-GODOT-COMPAT-001", "AC-DEV-LIVE-SPEC-001", "AC-DEV-LIVE-ARCH-001"]],
    ["NFR-DEV-MQ-USABILITY-001", "usability", "Requirements and trace reporting must remain compact, resumable, and human-readable while preserving expandable exact evidence.", "Review breadth-first wave summaries and compact query/report output for representative small and complex changes.", "Every run exposes status, blockers, coverage, next action, and evidence links without requiring a full edge dump.", ["AC-DEV-REQ-WAVES-001", "AC-DEV-TRACE-QUERY-001"]],
    ["NFR-DEV-MQ-PERFORMANCE-001", "performance", "Instrumentation and compact reporting must expose their own overhead and avoid materially dominating bounded provider execution.", "Compare instrumented and baseline run durations and receipt sizes on the Windows reference host.", "Measured overhead is reported and remains within the approved performance policy established during ArchitectureDesign.", ["AC-DEV-METRICS-001"]],
  ];
  requirements.nonFunctionalRequirements.push(...nfrs.map(([id, category, statement, measure, target, acceptanceCriterionIds]) => sourced(sourceRefs, { id, category, statement, applicability: { level: "project" }, measure, target, priority: "must", acceptanceCriterionIds })));

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-DEV-MQ-CORE-001", category: "technical", statement: "Generic Core and semantic Module contracts remain provider-neutral and domain-neutral; Godot behavior resides in an optional pack.", rationale: "Best-in-class capability swapping must not create product-specific routing or lifecycle authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-REQ-STRATEGIES-001", "AC-DEV-GODOT-GRANTS-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-MQ-PROVIDER-001", category: "security", statement: "Provider acquisition and execution are project-local, checksum-pinned, explicitly approved, offline by default, and never silently substituted.", rationale: "Live integration must not weaken reproducibility or trust boundaries.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-PROVIDER-ACQUISITION-001", "AC-DEV-PROVIDER-FAILURE-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-MQ-HOST-001", category: "platform", statement: "ChatGPT Desktop on Windows is the release-defining V0.11 host.", rationale: "Release evidence must match the owner-supported product environment.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-MODULE-QUALITY-E2E-001", "AC-DEV-DESKTOP-SKILLS-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-MQ-EVIDENCE-001", category: "security", statement: "Raw receipts remain local and Git receives only digest-bound redacted views that pass secret and unsafe-content checks.", rationale: "Exact evidence and open-source safety must coexist.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-RECEIPTS-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-MQ-FEEDBACK-001", category: "data", statement: "Sentry and PostHog remain disabled, uninstalled, and outside V0.11.", rationale: "Production feedback requires a separate consent, retention, and privacy design.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-METRICS-001"] }),
  );
  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-DEV-MQ-REQUIREMENTS-001", statement: "Adaptive breadth-first requirements interviewing, native and optional strategy composition, persistent waves, conflicts, coverage, and deterministic closure." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-MQ-LIVE-ADAPTERS-001", statement: "Live provider conformance for OpenSpec, Spec Kit, current Structurizr tooling, MADR format rendering and validation, Godot AI, and GdUnit4." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-MQ-GODOT-001", statement: "An optional Godot pack with least-privilege inspection, execution, structured verification, screenshots, input receipts, exports, smoke tests, and tested compatibility." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-MQ-INFRASTRUCTURE-001", statement: "Automatic raw receipt capture, redaction, local performance metrics, two-phase Git sealing, and read-only compact traceability MCP queries." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-MQ-SKILLS-001", statement: "Repository-scoped devrelay-cycle, devrelay-godot-release, devrelay-plugin-conformance, and devrelay-trace-query skills for ChatGPT Desktop on Windows." }),
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-DEV-MQ-CORE-GODOT-001", statement: "Add Godot-specific branches or contracts to Generic Core.", rationale: "Godot is an optional domain pack." }),
    sourced(sourceRefs, { id: "NG-DEV-MQ-REMOTE-TELEMETRY-001", statement: "Send performance, source, test, screenshot, or usage telemetry to a remote service by default.", rationale: "V0.11 telemetry is local-only." }),
    sourced(sourceRefs, { id: "NG-DEV-MQ-FORCED-UPSTREAM-001", statement: "Require every external interviewing framework to execute live when it lacks a bounded deterministic integration surface.", rationale: "DevRelay adopts useful practices natively and labels external maturity honestly." }),
    sourced(sourceRefs, { id: "NG-DEV-MQ-UNTESTED-COMPAT-001", statement: "Claim support for an untested Godot or provider version.", rationale: "Compatibility is live-attested, not inferred." }),
    sourced(sourceRefs, { id: "NG-DEV-MQ-PRODUCTION-FEEDBACK-001", statement: "Integrate Sentry or PostHog in V0.11.", rationale: "Production feedback is deferred pending privacy requirements." }),
  );
  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-DEV-MQ-CLOSURE-001", term: "Requirements closure", definition: "A reproducible assessment in which all blocking decisions are closed, contradictions are absent, and weighted applicable-domain coverage meets policy.", aliases: ["Closure proof"] }),
    sourced(sourceRefs, { id: "TERM-DEV-MQ-LIVE-ATTESTATION-001", term: "Live provider attestation", definition: "Digest-bound evidence of an exact provider version executing an exact bounded operation with pinned inputs, configuration, permissions, native outputs, and result.", aliases: ["Live conformance receipt"] }),
    sourced(sourceRefs, { id: "TERM-DEV-MQ-GODOT-PACK-001", term: "Godot engineering pack", definition: "The optional versioned DevRelay adapter bundle that maps Godot AI and GdUnit4 capabilities into existing provider-neutral lifecycle ports.", aliases: ["Godot pack"] }),
    sourced(sourceRefs, { id: "TERM-DEV-MQ-SEAL-001", term: "Evidence seal commit", definition: "A commit created after the implementation commit that contains immutable evidence referencing the implementation identity without attempting to reference its own commit hash.", aliases: ["Seal commit"] }),
  );
  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-DEV-MQ-OWNER-001", statement: "The owner approved all recorded V0.11 module-quality requirements decisions and the corrected provider-matrix compatibility boundary.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DEV-MQ-UPSTREAM-001", statement: "An upstream declaration is research input and does not become a DevRelay compatibility or maturity claim until live-attested.", status: "confirmed", blocking: false }),
  );
  requirements.dependencies = appendUnique(requirements.dependencies, [
    "Owner-approved version-pinned adapter evaluations and first-download grants for every selected upstream provider.",
    "Windows hosts capable of running ChatGPT Desktop, supported Node versions, selected Godot versions, Godot AI, GdUnit4, and current Structurizr tooling.",
    "A local immutable receipt store and a Git-safe redaction and secret-scanning boundary.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "A numerical closure score can create false assurance unless all blocking domains and contradictions remain independent hard gates.",
    "Upstream tools can change commands, licenses, telemetry, compatibility, or artifact shapes after a version is evaluated.",
    "Raw provider output, logs, screenshots, or test receipts can contain secrets, personal information, or unsafe repository content.",
    "A Godot compatibility claim can drift if engine, plug-in, test framework, adapter, or Windows versions are not pinned together.",
    "Instrumentation can add overhead or nondeterminism unless timing and unavailable host observations are modeled explicitly.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "RequirementsGathering 0.2 decision-domain, wave, strategy, conflict, coverage, continuation, and closure contracts with native implementation.",
    "Version-pinned adapter evaluations and live conformance records for priority specification, architecture, Godot, and testing providers.",
    "Optional Godot engineering pack with compatibility matrix, permissions, receipts, GdUnit4 evidence, export, smoke, and release workflow.",
    "Core execution receipt recorder, redaction boundary, local RunMetrics artifact, two-phase Git seal contract, and read-only traceability MCP query surface.",
    "Four repository-scoped DevRelay skills and a clean-checkout Windows Desktop end-to-end acceptance package.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "requirements/interview-waves", "requirements/closure-assessment", "providers/live-attestation",
    "providers/negative-conformance", "godot/compatibility-matrix", "godot/structured-tests",
    "godot/screenshots-and-inputs", "godot/export-smoke", "execution/raw-receipts",
    "execution/redaction", "execution/run-metrics", "integration/two-phase-seal",
    "traceability/read-only-query", "desktop/repository-skills", "dogfood/godot-full-lifecycle",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}

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

export const ownerDecisions = Object.freeze([["Q-SIM-PR-001","Preserve the verified V0.11 candidate, build stacked replacement changes from its evidence-sealed baseline, and close the superseded oversized pull request only after replacement pull requests exist."],["Q-SIM-VERSION-001","Target 0.10.0-rc.2 as the simplified advanced open-source preview and reserve 0.11 for the durable local reference host."],["Q-SIM-HOST-001","Keep ChatGPT Desktop on Windows as the primary supported product surface and provide a deterministic CLI beneath it as the host and operator boundary."],["Q-SIM-PROFILES-001","Provide quick, standard, assurance, and inspect workflow profiles; make standard the default and prohibit every profile from bypassing Core validation or required Gates."],["Q-SIM-CLOSURE-001","Require adaptive requirements interviewing with mandatory 0.99 closure in every profile while scaling question depth to risk, size, ambiguity, and change impact."],["Q-SIM-FACADE-001","Expose a small public facade centered on createDevRelay, createLocalHost, defineModule, definePlugin, run, resume, verify, and inspect."],["Q-SIM-API-TIERS-001","Move advanced contracts behind explicit package subpaths first and defer physical workspace package splitting until conformance proves the boundaries."],["Q-SIM-EVIDENCE-001","Keep minimal fixtures and compact dogfood evidence in Git, publish full checksum-bound evidence as GitHub Release assets, and do not rewrite repository history."],["Q-SIM-PACKS-001","Keep Godot and GdUnit4 in an optional domain pack and use the same pack boundary later for a TypeScript web-service reference pack."],["Q-SIM-COMPAT-001","Retain displaced public APIs under compat/v1 for one prerelease cycle with explicit deprecation metadata and migration guidance."],["Q-SIM-REVIEW-001","Require independent human review before a stable release; when unavailable, label the artifact as a preview rather than weakening the Gate."],["Q-SIM-LOCAL-HOST-001","Scope the durable local host to SQLite state, content-addressed artifacts, isolated Git worktrees, explicit grants, one Desktop/Codex executor, crash recovery, CLI commands, and measured performance budgets."]].map(([questionId, decision]) => Object.freeze({ questionId, decision, answer: "Approve exactly as stated" })));

export function buildSimplificationRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = typeof makeSourceRefs === "function" ? makeSourceRefs() : structuredClone(makeSourceRefs);
  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary: "SIM-001 simplification requirements are closed: a small facade, risk-scaled workflow profiles, explicit API tiers, compact repository evidence, optional domain packs, preview-safe review policy, and a durable Windows local host."
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, { id: "BO-DEV-ADOPTION-001", statement: "Make DevRelay straightforward to adopt and operate without weakening deterministic lifecycle authority, evidence, or traceability.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" }),
    sourced(sourceRefs, { id: "BO-DEV-DURABLE-HOST-001", statement: "Provide a recoverable local Windows host that turns the verified library into a practical ChatGPT Desktop engineering runtime.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" })
  );
  requirements.successMetrics.push(
    sourced(sourceRefs, { id: "SM-DEV-FIRST-RUN-001", name: "Successful first run", businessObjectiveIds: ["BO-DEV-ADOPTION-001"], measure: "A new user completes a standard-profile deterministic run from a clean GitHub checkout on ChatGPT Desktop for Windows.", target: "One documented setup path, no internal artifact construction by the user, and a passing compact run summary.", measurementMethod: "Execute the clean-checkout Windows Desktop acceptance fixture and review the operator transcript." }),
    sourced(sourceRefs, { id: "SM-DEV-PUBLIC-SURFACE-001", name: "Small public surface", businessObjectiveIds: ["BO-DEV-ADOPTION-001"], measure: "Top-level supported facade operations required for ordinary use.", target: "No more than eight primary facade operations; advanced contracts remain under explicit subpaths.", measurementMethod: "Inspect generated API inventory and execute public-surface conformance tests." }),
    sourced(sourceRefs, { id: "SM-DEV-EVIDENCE-WEIGHT-001", name: "Compact source evidence", businessObjectiveIds: ["BO-DEV-ADOPTION-001"], measure: "Full raw lifecycle evidence retained directly in Git after externalization.", target: "Only minimal fixtures, compact summaries, manifests, and checksums remain in Git; full evidence is independently retrievable and checksum-verifiable.", measurementMethod: "Compare tracked evidence inventory with the release-asset manifest and verify every external digest." }),
    sourced(sourceRefs, { id: "SM-DEV-RECOVERY-001", name: "Durable recovery", businessObjectiveIds: ["BO-DEV-DURABLE-HOST-001"], measure: "Interrupted local runs resumed without repeating checkpointed effects or losing approvals and evidence.", target: "100 percent of crash-window fixtures recover deterministically with zero duplicate completed effects.", measurementMethod: "Run SQLite, artifact-store, worktree, and executor crash-recovery tests on Windows." })
  );

  const capabilities = [
    ["CAP-DEV-SIMPLE-FACADE-001", "Simple DevRelay facade", "Expose ordinary configuration, execution, recovery, verification, and inspection through a small stable API.", "BO-DEV-ADOPTION-001"],
    ["CAP-DEV-WORKFLOW-PROFILES-001", "Risk-scaled workflow profiles", "Select deterministic quick, standard, assurance, or inspect policies without bypassing Core or required Gates.", "BO-DEV-ADOPTION-001"],
    ["CAP-DEV-API-TIERS-001", "Explicit API tiers", "Separate ordinary facade APIs, advanced subpaths, compatibility surfaces, and optional domain packs.", "BO-DEV-ADOPTION-001"],
    ["CAP-DEV-EVIDENCE-DISTRIBUTION-001", "Externalized verifiable evidence", "Keep Git compact while preserving checksum-bound full lifecycle evidence in release assets.", "BO-DEV-ADOPTION-001"],
    ["CAP-DEV-LOCAL-HOST-001", "Durable Windows local host", "Persist state and artifacts, isolate work, enforce grants, recover crashes, and bind one Desktop executor.", "BO-DEV-DURABLE-HOST-001"],
    ["CAP-DEV-OPERATOR-CLI-001", "Deterministic operator CLI", "Provide profile-aware run, resume, verify, inspect, and evidence commands beneath ChatGPT Desktop.", "BO-DEV-DURABLE-HOST-001"]
  ];
  requirements.capabilities.push(...capabilities.map(([id, name, description, objective]) => sourced(sourceRefs, { id, name, description, businessObjectiveIds: [objective], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must" })));
  requirements.userJourneys.push(sourced(sourceRefs, {
    id: "UJ-DEV-SIMPLIFIED-CYCLE-001", name: "Run DevRelay without operating its internals", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityIds: capabilities.map(([id]) => id),
    trigger: "A user starts or resumes a software change in ChatGPT Desktop on Windows.", outcome: "The user selects an appropriate profile, completes the deterministic lifecycle through a small facade, and can inspect compact evidence or drill into exact artifacts.",
    steps: [
      { sequence: 1, action: "Create or open a local DevRelay project and choose a workflow profile.", expectedOutcome: "The host resolves explicit policy and required capabilities." },
      { sequence: 2, action: "Run or resume the change through the facade or CLI.", expectedOutcome: "Core executes required Modules and Gates with durable checkpoints and explicit approvals." },
      { sequence: 3, action: "Inspect the compact result and retrieve exact evidence when needed.", expectedOutcome: "Claims resolve to checksum-bound local or release-asset evidence without exposing internal construction work." }
    ]
  }));

  const stories = [
    ["US-DEV-SIMPLE-FACADE-001", "CAP-DEV-SIMPLE-FACADE-001", "Start, resume, verify, and inspect a DevRelay run without manually assembling low-level artifact contracts.", "Use the deterministic lifecycle through a learnable public surface.", ["AC-SIM-FACADE-001", "AC-SIM-WINDOWS-E2E-001"]],
    ["US-DEV-WORKFLOW-PROFILES-001", "CAP-DEV-WORKFLOW-PROFILES-001", "Choose a risk-appropriate workflow profile while preserving mandatory requirements closure, validation, and Gates.", "Small changes remain efficient and high-risk changes receive deeper assurance without separate workflows.", ["AC-SIM-PROFILES-001", "AC-SIM-CLOSURE-001", "AC-SIM-FAST-LANE-001"]],
    ["US-DEV-API-TIERS-001", "CAP-DEV-API-TIERS-001", "Use a small root API and opt into advanced contracts, compatibility APIs, or domain packs explicitly.", "The product remains approachable while advanced integrations stay possible and versioned.", ["AC-SIM-API-TIERS-001", "AC-SIM-COMPAT-001", "AC-SIM-DOMAIN-PACK-001"]],
    ["US-DEV-EVIDENCE-DISTRIBUTION-001", "CAP-DEV-EVIDENCE-DISTRIBUTION-001", "Verify full lifecycle evidence without storing every raw execution artifact in the source tree.", "The repository stays reviewable while trust and reproducibility remain intact.", ["AC-SIM-EVIDENCE-001", "AC-SIM-PR-DECOMPOSITION-001", "AC-SIM-VERSION-001", "AC-SIM-REVIEW-001"]],
    ["US-DEV-LOCAL-HOST-001", "CAP-DEV-LOCAL-HOST-001", "Recover interrupted local runs with exact state, artifacts, grants, workspaces, and executor identity preserved.", "ChatGPT Desktop can use DevRelay as a durable runtime rather than only a library.", ["AC-SIM-DURABLE-HOST-001", "AC-SIM-CRASH-RECOVERY-001"]],
    ["US-DEV-OPERATOR-CLI-001", "CAP-DEV-OPERATOR-CLI-001", "Use deterministic CLI commands as the testable operator boundary beneath ChatGPT Desktop.", "Desktop integration and automation share one inspectable execution surface.", ["AC-SIM-CLI-001", "AC-SIM-WINDOWS-E2E-001"]]
  ];
  requirements.userStories.push(...stories.map(([id, capabilityId, need, benefit, acceptanceCriterionIds]) => sourced(sourceRefs, { id, userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId, userJourneyIds: ["UJ-DEV-SIMPLIFIED-CYCLE-001"], need, benefit, priority: "must", acceptanceCriterionIds })));

  const criteria = [
    ["AC-SIM-PR-DECOMPOSITION-001", "The verified V0.11 evidence pair remains immutable while replacement changes are reviewable in bounded stacked pull requests; the superseded oversized pull request is closed only after replacements exist.", "Compare commit identities, changed-file scopes, pull-request dependency order, and closure evidence."],
    ["AC-SIM-VERSION-001", "The simplification preview identifies as 0.10.0-rc.2 while durable-host work is versioned as 0.11, and Module versions remain independent from source-package versions.", "Inspect manifests, changelog, package metadata, release notes, and negative mixed-version fixtures."],
    ["AC-SIM-FACADE-001", "The supported root facade contains createDevRelay, createLocalHost, defineModule, definePlugin, run, resume, verify, and inspect, with ordinary callers not required to construct internal invocation or checkpoint artifacts.", "Execute root API type and runtime conformance cases from an installed package."],
    ["AC-SIM-PROFILES-001", "Quick, standard, assurance, and inspect profiles resolve to immutable explicit policy; standard is the default and no profile bypasses Core validation or an applicable required Gate.", "Compare resolved policy and transition records across profiles and reject bypass configurations."],
    ["AC-SIM-CLOSURE-001", "Every profile retains adaptive requirements interviewing, at least 0.99 deterministic closure, zero blocking unknowns, and zero contradictions before progression.", "Run small, ambiguous, risky, and resumed interview fixtures across every profile."],
    ["AC-SIM-FAST-LANE-001", "Quick-profile feedback uses bounded fast verification lanes while recording omitted expensive checks as downstream obligations rather than silently declaring them passed.", "Measure representative quick runs and inspect obligation carry-forward and final assurance enforcement."],
    ["AC-SIM-API-TIERS-001", "Advanced contracts are available only through documented explicit subpaths, and physical package splitting occurs only after import-boundary and installed-package conformance passes.", "Inventory exports, scan root imports, exercise subpath imports, and run boundary-negative fixtures."],
    ["AC-SIM-EVIDENCE-001", "Git retains compact summaries, minimal fixtures, manifests, and checksums; full evidence is stored as immutable GitHub Release assets and independently validates against the committed manifest without rewriting history.", "Download release assets from a clean checkout, validate hashes and media types, and reconcile every summarized claim."],
    ["AC-SIM-DOMAIN-PACK-001", "Godot and GdUnit4 remain optional pack bindings with no domain-specific branch in Generic Core, and the same conformance contract can describe a future TypeScript web-service pack.", "Run pack discovery, permission, dependency, and Core identifier-scan conformance tests."],
    ["AC-SIM-COMPAT-001", "Displaced public APIs remain available under compat/v1 for exactly one prerelease cycle with machine-readable deprecation metadata and tested migration examples.", "Execute old-to-compat and compat-to-facade tests and verify scheduled removal metadata."],
    ["AC-SIM-REVIEW-001", "Stable release promotion requires an independent human review bound to the exact candidate; absent that review, release metadata and documentation identify the artifact as preview.", "Exercise approved-review, missing-review, stale-review, and preview-label Gate cases."],
    ["AC-SIM-DURABLE-HOST-001", "The local Windows host persists lifecycle state in SQLite, artifacts by content digest, work in isolated Git worktrees, explicit grants, and one exact Desktop/Codex executor binding.", "Run storage, migration, CAS, worktree isolation, grant denial, and executor-binding tests on Windows."],
    ["AC-SIM-CRASH-RECOVERY-001", "A crash at each defined persistence boundary resumes without duplicating a completed effect, losing an approval, accepting stale state, or orphaning evidence.", "Inject failures before and after effect, checkpoint, graph, Git, and evidence commits and reconcile the recovered ledger."],
    ["AC-SIM-CLI-001", "The CLI exposes deterministic init, run, resume, status, verify, inspect, and evidence operations with machine-readable output and stable exit codes.", "Execute command-matrix, malformed-input, interrupted-run, and installed-package tests."],
    ["AC-SIM-WINDOWS-E2E-001", "A clean GitHub checkout on ChatGPT Desktop for Windows completes a small production-quality software change through the standard profile using the facade and CLI host, exact evidence, and BusinessAcceptance.", "Reconcile the complete run report, checkpoints, graph, changes, tests, integration, release evidence, and acceptance decision."],
  ];
  requirements.acceptanceCriteria.push(...criteria.map(([id, statement, verification]) => sourced(sourceRefs, { id, statement, verification })));

  const nfrs = [
    ["NFR-SIM-DETERMINISM-001", "reliability", "Facade calls, profile resolution, CLI commands, durable recovery, and evidence retrieval must be deterministic for exact content-addressed inputs.", "Compare outputs, digests, transition histories, and effect counts across repeated and recovered runs.", "100 percent equality with zero duplicate completed effects.", ["AC-SIM-PROFILES-001", "AC-SIM-CRASH-RECOVERY-001", "AC-SIM-CLI-001"]],
    ["NFR-SIM-USABILITY-001", "usability", "Ordinary users must operate DevRelay through a compact facade, profile choice, concise status, and expandable evidence rather than internal artifact construction.", "Run clean-checkout operator studies and API inventory checks.", "At most eight primary facade operations and one documented standard path.", ["AC-SIM-FACADE-001", "AC-SIM-WINDOWS-E2E-001"]],
    ["NFR-SIM-PERFORMANCE-001", "performance", "Profile-specific latency and storage budgets must be measured on the Windows reference host and regressions must fail the applicable release lane.", "Record cold and warm run duration, checkpoint reuse, database size, evidence size, and command latency.", "Budgets are defined during ArchitectureDesign and all release-defining measurements meet them.", ["AC-SIM-FAST-LANE-001", "AC-SIM-DURABLE-HOST-001"]],
    ["NFR-SIM-SECURITY-001", "security", "The local host must fail closed on undeclared filesystem, process, network, secret, worktree, database, or artifact access.", "Exercise capability denial, path escape, SQL migration, artifact tamper, and executor substitution fixtures.", "Zero undeclared effects or accepted tampered state.", ["AC-SIM-DURABLE-HOST-001", "AC-SIM-CRASH-RECOVERY-001"]],
    ["NFR-SIM-COMPATIBILITY-001", "compatibility", "0.10.0-rc.2 must preserve the declared compat/v1 window and support the release-defined Node versions on ChatGPT Desktop for Windows.", "Run installed-package and migration matrices on supported Windows and Node combinations.", "100 percent of claimed combinations and compat examples pass.", ["AC-SIM-COMPAT-001", "AC-SIM-WINDOWS-E2E-001"]],
    ["NFR-SIM-MAINTAINABILITY-001", "maintainability", "Facade, advanced APIs, host services, and domain packs must have enforceable import boundaries and independently reviewable changes.", "Run architecture boundary checks and inspect stacked pull-request scopes.", "Zero forbidden imports and every replacement pull request stays within its approved work-item scope.", ["AC-SIM-API-TIERS-001", "AC-SIM-PR-DECOMPOSITION-001", "AC-SIM-DOMAIN-PACK-001"]]
  ];
  requirements.nonFunctionalRequirements.push(...nfrs.map(([id, category, statement, measure, target, acceptanceCriterionIds]) => sourced(sourceRefs, { id, category, statement, applicability: { level: "project" }, measure, target, priority: "must", acceptanceCriterionIds })));

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-SIM-AUTHORITY-001", category: "technical", statement: "Facade and profiles may simplify configuration and presentation but cannot move routing, validation, Gate, checkpoint, traceability, or progression authority out of Core.", rationale: "Product simplicity must not weaken DevRelay's trust model.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-SIM-FACADE-001", "AC-SIM-PROFILES-001"] }),
    sourced(sourceRefs, { id: "CON-SIM-PLATFORM-001", category: "platform", statement: "ChatGPT Desktop on Windows is the only release-defining interactive host for this increment.", rationale: "Verification must match the owner-supported product surface.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-SIM-WINDOWS-E2E-001"] }),
    sourced(sourceRefs, { id: "CON-SIM-EVIDENCE-001", category: "data", statement: "Evidence externalization must preserve immutable content digests, media types, provenance, availability checks, and offline-verifiable manifests.", rationale: "Repository reduction cannot sacrifice reproducibility.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-SIM-EVIDENCE-001"] }),
    sourced(sourceRefs, { id: "CON-SIM-HISTORY-001", category: "schedule", statement: "The simplification increment must not rewrite published Git history or mutate the verified V0.11 implementation/evidence pair.", rationale: "Existing release evidence is an immutable trust input.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-SIM-PR-DECOMPOSITION-001", "AC-SIM-EVIDENCE-001"] })
  );
  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-SIM-FACADE-001", statement: "Small root facade, explicit advanced subpaths, workflow profiles, compatibility window, compact operator reporting, and migration guidance." }),
    sourced(sourceRefs, { id: "SCOPE-SIM-EVIDENCE-001", statement: "Compact in-repository evidence plus checksum-bound GitHub Release evidence assets and retrieval verification." }),
    sourced(sourceRefs, { id: "SCOPE-SIM-HOST-001", statement: "Durable Windows local host with SQLite, content-addressed artifacts, isolated worktrees, explicit grants, one Desktop executor, recovery, CLI, and performance budgets." }),
    sourced(sourceRefs, { id: "SCOPE-SIM-DELIVERY-001", statement: "Bounded stacked pull requests, 0.10.0-rc.2 preview identity, independent stable-review policy, and superseded pull-request disposition." })
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-SIM-CORE-REWRITE-001", statement: "Rewrite or weaken the deterministic Module, Gate, checkpoint, traceability, or evidence model.", rationale: "The increment simplifies the product surface, not the trust architecture." }),
    sourced(sourceRefs, { id: "NG-SIM-MULTIPLATFORM-001", statement: "Claim release readiness for macOS, Linux, hosted execution, or a browser-only host.", rationale: "ChatGPT Desktop on Windows is the approved release boundary." }),
    sourced(sourceRefs, { id: "NG-SIM-PACKAGE-SPLIT-001", statement: "Immediately split the repository into multiple physical workspace packages.", rationale: "Subpath conformance must prove boundaries before a physical split." }),
    sourced(sourceRefs, { id: "NG-SIM-GODOT-CORE-001", statement: "Move Godot, GdUnit4, or future web-service behavior into Generic Core.", rationale: "Domain behavior remains optional and replaceable." }),
    sourced(sourceRefs, { id: "NG-SIM-STABLE-WITHOUT-REVIEW-001", statement: "Call a candidate stable without independent human review.", rationale: "Unreviewed artifacts remain previews." })
  );
  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-SIM-PROFILE-001", term: "Workflow profile", definition: "A versioned immutable policy selection that scales workflow depth and verification cost without bypassing Core validation or applicable Gates.", aliases: ["Profile"] }),
    sourced(sourceRefs, { id: "TERM-SIM-FACADE-001", term: "DevRelay facade", definition: "The small supported root API used for ordinary project configuration, execution, recovery, verification, and inspection.", aliases: ["Simple API"] }),
    sourced(sourceRefs, { id: "TERM-SIM-EVIDENCE-ASSET-001", term: "Evidence asset", definition: "An immutable GitHub Release attachment bound by a committed manifest containing its digest, media type, size, provenance, and retrieval identity.", aliases: ["External evidence bundle"] }),
    sourced(sourceRefs, { id: "TERM-SIM-LOCAL-HOST-001", term: "Local reference host", definition: "The Windows process and CLI that durably persists DevRelay state and artifacts, enforces capabilities, manages isolated worktrees, and binds Desktop execution.", aliases: ["Durable host"] })
  );
  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-SIM-OWNER-001", statement: "The owner approved all twelve SIM-001 requirements decisions exactly as recommended.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-SIM-GITHUB-001", statement: "GitHub source and GitHub Release assets are the approved open-source distribution channels for SIM-001.", status: "confirmed", blocking: false })
  );
  requirements.dependencies = appendUnique(requirements.dependencies, [
    "The immutable V0.11 implementation commit and evidence-seal commit as the simplification baseline.",
    "GitHub pull requests and Release assets for bounded review and external evidence distribution.",
    "A supported Windows host with Node.js, Git worktree support, SQLite, and ChatGPT Desktop/Codex execution.",
    "Independent human review before stable release promotion."
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "A facade can accidentally hide authority-relevant decisions or create an implicit bypass path.",
    "A quick profile can be mistaken for completed assurance unless deferred obligations remain explicit and blocking at final acceptance.",
    "External evidence can become unavailable or detached from source claims unless manifests, hashes, and retrieval checks are mandatory.",
    "Stacked pull requests can drift or duplicate evidence unless each change pins its exact parent and lifecycle package.",
    "SQLite, worktree, and executor crash windows can create split-brain state unless commit protocols and recovery semantics are explicit.",
    "Compatibility shims can become permanent accidental API unless removal timing and migration evidence are enforced."
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "A small typed DevRelay facade and four deterministic workflow profiles with standard as the default.",
    "Explicit advanced and compat/v1 export tiers with conformance and migration evidence.",
    "A compact evidence policy, release-asset manifest format, retrieval verifier, and externalized V0.11 evidence bundle.",
    "An optional domain-pack boundary preserving Godot and GdUnit4 outside Generic Core.",
    "A durable Windows local reference host and deterministic operator CLI with recovery and performance evidence.",
    "Bounded stacked pull requests and a 0.10.0-rc.2 preview acceptance package."
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "simplification/facade-conformance", "simplification/profile-policy", "simplification/api-boundaries",
    "simplification/compatibility-migration", "simplification/evidence-externalization", "simplification/pr-decomposition",
    "host/sqlite-recovery", "host/artifact-cas", "host/worktree-isolation", "host/capability-enforcement",
    "host/desktop-executor", "host/cli-matrix", "performance/profile-budgets", "review/independent-human",
    "dogfood/windows-desktop-simplified-cycle"
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}

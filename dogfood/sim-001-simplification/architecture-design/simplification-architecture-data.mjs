const uniq = (...values) => [...new Set(values.flat())];

function element({ id, name, type, parentId, description, responsibilities, sourceRequirementIds, tags = [] }) {
  return {
    id,
    name,
    type,
    ...(parentId === undefined ? {} : { parentId }),
    description,
    technology: type === "software-system" ? "" : "Provider-neutral DevRelay contract",
    responsibilities,
    tags: [type === "container" ? "Container" : "Component", ...tags],
    properties: {},
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}

const container = (id, name, description, responsibilities, requirements, tags = []) =>
  element({ id, name, type: "container", parentId: "EL-DEVRELAY-SYSTEM", description, responsibilities, sourceRequirementIds: requirements, tags });

const component = (id, name, parentId, description, responsibilities, requirements, tags = []) =>
  element({ id, name, type: "component", parentId, description, responsibilities, sourceRequirementIds: requirements, tags });

function relationship(id, sourceElementId, targetElementId, description, requirements) {
  return {
    id,
    sourceElementId,
    targetElementId,
    description,
    interactionStyle: "synchronous",
    tags: [],
    sourceRequirementIds: uniq(requirements),
    sourceRefs: [],
  };
}

function interfaceIntent({ id, name, provider, consumers, inputs, outputs, requirements, failure, security, contract = true }) {
  return {
    id,
    name,
    purpose: name,
    ownerBoundary: provider,
    providerElementId: provider,
    consumerElementIds: consumers,
    interactionStyle: "synchronous",
    semanticInputs: inputs,
    semanticOutputs: outputs,
    protocolConstraints: [
      "Exact provider, adapter, configuration, permission, and content digests",
      "Canonical provider-neutral semantics",
      "Explicit availability, maturity, and failure dispositions",
    ],
    failureBehavior: failure,
    compatibilityObligations: [
      "Stable canonical behavior across supported ChatGPT Desktop, Windows, Node, and provider versions",
      "Unknown, stale, unavailable, or unverified provider state fails closed",
    ],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: [
      "Validate canonical structured bytes before progression",
      "Preserve exact inputs, native output, receipts, and approval lineage",
    ],
    contractGeneration: { required: contract, suggestedKinds: contract ? ["json-schema"] : [] },
    sourceRequirementIds: uniq(requirements),
    sourceRefs: [],
  };
}

function constraint(id, category, statement, appliesTo, requirements) {
  return {
    id,
    category,
    strength: "must",
    statement,
    rationale: statement,
    appliesTo,
    verificationIntent: "Dedicated positive, negative, permission, privacy, drift, replay, provider-failure, and clean-Windows conformance fixtures.",
    sourceRequirementIds: uniq(requirements),
    sourceRefs: [],
  };
}

function baselineCoverage(baseSections, normativeIds) {
  const map = new Map(normativeIds.map((id) => [id, new Map()]));
  const cite = (kind, id, requirementIds) => {
    for (const requirementId of requirementIds ?? []) {
      const targets = map.get(requirementId);
      if (targets) targets.set(`${kind}:${id}`, { kind, id });
    }
  };
  for (const item of baseSections.architectureModel.content.elements) cite("element", item.id, item.sourceRequirementIds);
  for (const item of baseSections.architectureModel.content.relationships) cite("relationship", item.id, item.sourceRequirementIds);
  for (const item of baseSections.interfaceIntent.content.interfaces) cite("interface", item.id, item.sourceRequirementIds);
  for (const item of baseSections.architectureConstraints.content.constraints) cite("constraint", item.id, item.sourceRequirementIds);
  for (const item of baseSections.decisionRecords.content.decisions) cite("decision", item.id, item.sourceRequirementIds);
  return new Map([...map].map(([id, targets]) => [id, [...targets.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))]));
}

export function buildSimplificationArchitecture({ architectureBaseline, requirements }) {
  const SIM = Object.freeze({
    facade: "US-DEV-SIMPLE-FACADE-001",
    profiles: "US-DEV-WORKFLOW-PROFILES-001",
    api: "US-DEV-API-TIERS-001",
    evidence: "US-DEV-EVIDENCE-DISTRIBUTION-001",
    host: "US-DEV-LOCAL-HOST-001",
    cli: "US-DEV-OPERATOR-CLI-001",
    deterministic: "NFR-SIM-DETERMINISM-001",
    usability: "NFR-SIM-USABILITY-001",
    performance: "NFR-SIM-PERFORMANCE-001",
    security: "NFR-SIM-SECURITY-001",
    compatibility: "NFR-SIM-COMPATIBILITY-001",
    maintainability: "NFR-SIM-MAINTAINABILITY-001",
    authority: "CON-SIM-AUTHORITY-001",
    platform: "CON-SIM-PLATFORM-001",
    evidenceConstraint: "CON-SIM-EVIDENCE-001",
    history: "CON-SIM-HISTORY-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(SIM).filter((id) => !declaredIds.has(id));
  if (missing.length) throw new Error("SIM-001 architecture drivers are absent: " + missing.join(", "));

  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const newNormativeIds = Object.values(SIM);
  const baseSections = architectureBaseline.sections;
  const alreadyDesignedTargets = baselineCoverage(baseSections, allNormativeIds);
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-SIM-001";

  model.elements.push(
    component("EL-SIM-FACADE", "DevRelay Public Facade", "EL-DEVRELAY-CORE", "Presents eight ordinary lifecycle operations while delegating every authority-bearing decision to existing Core services.", ["Construct validated project/runtime configurations", "Run, resume, verify, and inspect without caller-authored internal artifacts"], [SIM.facade, SIM.usability, SIM.authority, SIM.maintainability], ["PublicAPI"]),
    component("EL-SIM-PROFILES", "Workflow Profile Resolver", "EL-DEVRELAY-CORE", "Resolves quick, standard, assurance, or inspect into one immutable explicit policy without bypassing Core validation or applicable Gates.", ["Select standard by default", "Carry deferred verification obligations forward explicitly"], [SIM.profiles, SIM.deterministic, SIM.performance, SIM.authority], ["Policy"]),
    component("EL-SIM-API-BOUNDARY", "API Tier Boundary", "EL-DEVRELAY-CORE", "Enforces root facade, advanced subpath, compat/v1, and optional-pack import boundaries before any physical package split.", ["Keep the root export small", "Reject forbidden cross-tier imports"], [SIM.api, SIM.compatibility, SIM.maintainability, SIM.authority], ["PublicAPI"]),
    component("EL-SIM-COMPAT", "Prerelease Compatibility Adapter", "EL-DEVRELAY-CORE", "Maps displaced prerelease APIs through compat/v1 for one release cycle with explicit deprecation and migration metadata.", ["Preserve declared prerelease compatibility", "Retire shims on the approved schedule"], [SIM.api, SIM.compatibility, SIM.maintainability], ["Compatibility"]),
    component("EL-SIM-EVIDENCE-ASSET", "Release Evidence Asset Publisher", "EL-REL-TOOLING", "Publishes full immutable evidence as checksum-bound GitHub Release assets while Git retains compact summaries, fixtures, manifests, and checksums.", ["Build and validate evidence manifests", "Prove clean-checkout retrieval and offline verification"], [SIM.evidence, SIM.evidenceConstraint, SIM.history, SIM.security], ["Release"]),
    container("EL-SIM-LOCAL-HOST", "Windows Local Reference Host", "Provides the durable operator and executor boundary beneath ChatGPT Desktop on Windows.", ["Persist exact lifecycle state and artifacts", "Enforce grants and isolated workspaces", "Recover interrupted runs deterministically"], [SIM.host, SIM.cli, SIM.deterministic, SIM.security, SIM.platform], ["Desktop", "Host"]),
    component("EL-SIM-HOST-STATE", "SQLite State Store", "EL-SIM-LOCAL-HOST", "Persists runs, transitions, approvals, checkpoints, graph references, leases, and schema migrations transactionally.", ["Commit state transitions atomically", "Expose migration and integrity status"], [SIM.host, SIM.deterministic, SIM.security]),
    component("EL-SIM-HOST-ARTIFACTS", "Content-addressed Artifact Store", "EL-SIM-LOCAL-HOST", "Stores exact immutable artifact bytes by digest and verifies media type, size, provenance, and retrieval identity.", ["Reject digest mismatch and unsafe replacement", "Support local and release-asset retrieval"], [SIM.host, SIM.evidence, SIM.deterministic, SIM.security, SIM.evidenceConstraint]),
    component("EL-SIM-HOST-WORKSPACES", "Isolated Worktree Manager", "EL-SIM-LOCAL-HOST", "Creates exact Git worktrees for bounded work items and reconciles their base, candidate, and cleanup state.", ["Prevent cross-work-item mutation", "Bind every workspace to an exact repository revision"], [SIM.host, SIM.security, SIM.history]),
    component("EL-SIM-HOST-GRANTS", "Capability Grant Enforcer", "EL-SIM-LOCAL-HOST", "Enforces declared filesystem, process, network, and secret grants at the host effect boundary.", ["Deny undeclared effects", "Receipt every granted external effect"], [SIM.host, SIM.security, SIM.authority]),
    component("EL-SIM-HOST-EXECUTOR", "Desktop Executor Binding", "EL-SIM-LOCAL-HOST", "Binds one exact ChatGPT Desktop/Codex executor identity and its declared capabilities to an authorized work item.", ["Prevent executor substitution", "Preserve execution and result receipts"], [SIM.host, SIM.security, SIM.platform, SIM.authority]),
    component("EL-SIM-HOST-RECOVERY", "Run Recovery Coordinator", "EL-SIM-LOCAL-HOST", "Reconciles state, artifact, graph, worktree, effect, and Git commit boundaries after interruption without duplicating completed effects.", ["Resume from the last durable checkpoint", "Quarantine ambiguous effects for explicit reconciliation"], [SIM.host, SIM.deterministic, SIM.security, SIM.performance]),
    component("EL-SIM-HOST-CLI", "Deterministic Operator CLI", "EL-SIM-LOCAL-HOST", "Exposes init, run, resume, status, verify, inspect, and evidence commands with stable machine-readable output and exit codes.", ["Provide the testable Desktop host seam", "Keep detailed evidence expandable rather than default"], [SIM.cli, SIM.facade, SIM.usability, SIM.platform], ["CLI"]),
  );

  model.relationships.push(
    relationship("REL-SIM-FACADE-PROFILES", "EL-SIM-FACADE", "EL-SIM-PROFILES", "Resolves one exact profile policy before lifecycle execution.", [SIM.facade, SIM.profiles, SIM.deterministic]),
    relationship("REL-SIM-FACADE-API", "EL-SIM-FACADE", "EL-SIM-API-BOUNDARY", "Exposes only approved root operations and explicit advanced paths.", [SIM.facade, SIM.api, SIM.maintainability]),
    relationship("REL-SIM-COMPAT-FACADE", "EL-SIM-COMPAT", "EL-SIM-FACADE", "Delegates compatible calls through the canonical facade and records migration diagnostics.", [SIM.api, SIM.compatibility]),
    relationship("REL-SIM-CLI-FACADE", "EL-SIM-HOST-CLI", "EL-SIM-FACADE", "Invokes the same deterministic facade used by installed library consumers.", [SIM.cli, SIM.facade, SIM.platform]),
    relationship("REL-SIM-HOST-CORE", "EL-SIM-LOCAL-HOST", "EL-DEVRELAY-CORE", "Supplies durable stores, grants, workspaces, and the exact executor without acquiring lifecycle authority.", [SIM.host, SIM.authority, SIM.deterministic]),
    relationship("REL-SIM-STATE-ARTIFACTS", "EL-SIM-HOST-STATE", "EL-SIM-HOST-ARTIFACTS", "Stores only content-addressed artifact references and validates them on every transition.", [SIM.host, SIM.deterministic, SIM.security]),
    relationship("REL-SIM-GRANTS-EXECUTOR", "EL-SIM-HOST-GRANTS", "EL-SIM-HOST-EXECUTOR", "Enforces exact declared grants for every executor effect.", [SIM.host, SIM.security, SIM.authority]),
    relationship("REL-SIM-WORKSPACE-EXECUTOR", "EL-SIM-HOST-WORKSPACES", "EL-SIM-HOST-EXECUTOR", "Provides one revision-bound isolated worktree for the authorized work item.", [SIM.host, SIM.security, SIM.history]),
    relationship("REL-SIM-RECOVERY-STATE", "EL-SIM-HOST-RECOVERY", "EL-SIM-HOST-STATE", "Reconciles durable transaction and lease state after interruption.", [SIM.host, SIM.deterministic, SIM.performance]),
    relationship("REL-SIM-RECOVERY-ARTIFACTS", "EL-SIM-HOST-RECOVERY", "EL-SIM-HOST-ARTIFACTS", "Verifies all referenced bytes before resuming or quarantining a run.", [SIM.host, SIM.deterministic, SIM.security]),
    relationship("REL-SIM-EVIDENCE-ARTIFACTS", "EL-SIM-EVIDENCE-ASSET", "EL-SIM-HOST-ARTIFACTS", "Packages exact full evidence and publishes a committed checksum manifest and retrieval identity.", [SIM.evidence, SIM.evidenceConstraint, SIM.security]),
  );

  const viewFor = ({ viewKey, type, title, purpose, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return { viewKey, type, title, purpose, audience: ["engineering", "architecture", "verification", "operators"], scopeElementId, elementIds,
      relationshipIds: model.relationships.filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId)).map(({ id }) => id) };
  };
  const priorViews = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const children = (parentId) => model.elements.filter(({ type, parentId: parent }) => type === "component" && parent === parentId).map(({ id }) => id);
  const diagramViewSpecs = [
    ...priorViews,
    viewFor({ viewKey: "VIEW-SIM-CONTAINERS", type: "container", title: "SIM-001 top-level containers", purpose: "Show the durable local host beside existing DevRelay containers.", scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-SIM-CORE-COMPONENTS", type: "component", title: "Simplified public library surface", purpose: "Show facade, profile, API-tier, and compatibility components without moving Core authority.", scopeElementId: "EL-DEVRELAY-CORE", elementIds: children("EL-DEVRELAY-CORE").filter((id) => id.startsWith("EL-SIM-")) }),
    viewFor({ viewKey: "VIEW-SIM-HOST-COMPONENTS", type: "component", title: "Windows local reference host", purpose: "Show durable state, artifacts, workspaces, grants, executor, recovery, and CLI boundaries.", scopeElementId: "EL-SIM-LOCAL-HOST", elementIds: children("EL-SIM-LOCAL-HOST") }),
    viewFor({ viewKey: "VIEW-SIM-RELEASE-COMPONENTS", type: "component", title: "Compact verifiable evidence distribution", purpose: "Show full evidence externalization through release tooling.", scopeElementId: "EL-REL-TOOLING", elementIds: children("EL-REL-TOOLING").filter((id) => id.startsWith("EL-SIM-")) }),
  ];

  const scope = {
    level: "change",
    boundary: "DevRelay SIM-001 public-surface simplification, evidence distribution, and durable Windows local host.",
    in: ["small public facade", "quick, standard, assurance, and inspect profiles", "advanced and compat/v1 subpaths", "compact Git evidence and checksum-bound GitHub Release evidence assets", "optional domain-pack boundary", "SQLite and content-addressed local persistence", "isolated Git worktrees and explicit grants", "one ChatGPT Desktop/Codex executor", "crash recovery and deterministic CLI", "profile-specific performance budgets", "bounded stacked pull requests and preview-safe review policy"],
    out: ["rewriting deterministic Core", "Gate or traceability bypasses", "immediate physical workspace package split", "Godot or GdUnit4 behavior in Generic Core", "hosted backend", "macOS or Linux product claims", "stable release without independent human review"],
  };

  const openSpecDesign = `# DevRelay SIM-001 simplification architecture change

## Context

The V0.11 runtime is deterministic and deeply evidenced, but ordinary use exposes internal contracts, the root API is broad, repository evidence is heavy, and no durable local host turns the library into a practical ChatGPT Desktop runtime.

## Decision

Add a thin public facade, immutable risk-scaled workflow profiles, explicit advanced and compat/v1 API tiers, checksum-bound release-asset evidence distribution, and a Windows local reference host using SQLite, content-addressed artifacts, isolated Git worktrees, explicit grants, one exact Desktop executor, crash recovery, and a deterministic CLI. Keep domain capabilities in optional packs and preserve all existing Core authority.

## Contract consequence

Facade configuration, profile policy, CLI requests/results, host state, artifact manifests, recovery journals, executor bindings, evidence assets, compatibility metadata, and performance observations require machine-validatable contracts before WorkBreakdown.

## Boundaries

Profiles never bypass validation or Gates. The host supplies effects but does not own lifecycle progression. Git history and the verified V0.11 evidence pair remain immutable. Stable release remains blocked without independent human review.
`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({ id: "IF-SIM-FACADE", name: "DevRelay facade operation", provider: "EL-SIM-FACADE", consumers: ["EL-SIM-HOST-CLI", "EL-SIM-COMPAT"], inputs: ["Project configuration, goal or run identity, selected profile, explicit approvals, and declared host bindings"], outputs: ["Canonical run, resume, verification, or inspection result with compact status and exact artifact references"], requirements: [SIM.facade, SIM.usability, SIM.deterministic, SIM.authority], failure: "Reject ambiguous project identity, invalid profile, missing host capability, stale run identity, or attempted Gate bypass.", security: ["The facade constructs no hidden grants and exposes no mutable Core internals"] }),
    interfaceIntent({ id: "IF-SIM-PROFILE", name: "Resolved workflow profile policy", provider: "EL-SIM-PROFILES", consumers: ["EL-SIM-FACADE", "EL-DEVRELAY-CORE"], inputs: ["Profile name, project risk context, closure policy version, and verification policy catalog"], outputs: ["Immutable explicit Module, Gate, evidence, and deferred-obligation policy"], requirements: [SIM.profiles, SIM.deterministic, SIM.performance, SIM.authority], failure: "Reject unknown, floating, internally contradictory, or bypass-capable profile definitions.", security: ["Every profile retains adaptive 0.99 closure and applicable Core-owned Gates"] }),
    interfaceIntent({ id: "IF-SIM-API-TIERS", name: "Public API tier manifest", provider: "EL-SIM-API-BOUNDARY", consumers: ["EL-SIM-FACADE", "EL-SIM-COMPAT"], inputs: ["Package export map, supported facade inventory, advanced subpaths, compatibility window, and pack manifests"], outputs: ["Validated tier inventory, deprecation metadata, migration links, and forbidden-import diagnostics"], requirements: [SIM.api, SIM.compatibility, SIM.maintainability], failure: "Reject undeclared root exports, forbidden tier imports, missing deprecation metadata, or premature package splitting.", security: ["Advanced subpaths do not gain additional runtime authority"] }),
    interfaceIntent({ id: "IF-SIM-EVIDENCE-ASSET", name: "Checksum-bound release evidence asset", provider: "EL-SIM-EVIDENCE-ASSET", consumers: ["EL-SIM-HOST-ARTIFACTS", "EL-REL-TOOLING"], inputs: ["Exact evidence files, candidate identity, redaction policy, media types, and GitHub Release identity"], outputs: ["Immutable asset, committed manifest, SHA-256 digests, byte counts, provenance, and retrieval verification"], requirements: [SIM.evidence, SIM.evidenceConstraint, SIM.history, SIM.security], failure: "Reject secret-bearing content, digest drift, missing media type, unavailable asset, candidate mismatch, or attempted history rewrite.", security: ["Only approved publishable evidence enters a public release asset"] }),
    interfaceIntent({ id: "IF-SIM-HOST-STATE", name: "Durable local host transaction", provider: "EL-SIM-HOST-STATE", consumers: ["EL-SIM-HOST-RECOVERY", "EL-DEVRELAY-CORE"], inputs: ["Exact expected state version, lifecycle transition, artifact references, approvals, checkpoint, graph reference, and lease"], outputs: ["Atomic committed state version and recovery journal entry"], requirements: [SIM.host, SIM.deterministic, SIM.security], failure: "Fail closed on stale version, migration mismatch, missing artifact, invalid lease, partial commit, or database integrity failure.", security: ["Parameterized local SQLite operations and integrity checks are mandatory"] }),
    interfaceIntent({ id: "IF-SIM-HOST-EXECUTOR", name: "Capability-enforced Desktop executor operation", provider: "EL-SIM-HOST-EXECUTOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Authorized work item, exact worktree, executor identity, required capabilities, grants, and idempotency key"], outputs: ["Raw execution receipt, proposed result artifacts, effect status, and checkpoint identity"], requirements: [SIM.host, SIM.security, SIM.platform, SIM.authority], failure: "Reject executor substitution, path escape, undeclared effect, stale worktree, duplicate ambiguous effect, or missing receipt.", security: ["Filesystem, process, network, and secret access are host-enforced and deny by default"] }),
    interfaceIntent({ id: "IF-SIM-CLI", name: "Deterministic operator command", provider: "EL-SIM-HOST-CLI", consumers: ["EL-SIM-FACADE"], inputs: ["Versioned command, project or run identity, profile, flags, input document, and output-format request"], outputs: ["Stable exit code, machine-readable result, concise human projection, and exact evidence references"], requirements: [SIM.cli, SIM.facade, SIM.usability, SIM.platform], failure: "Return stable nonzero codes for validation, clarification, approval, effect, recovery, verification, and internal failures without losing exact diagnostics.", security: ["Secrets are referenced, never printed; mutating commands require explicit authority"] }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-SIM-THIN-FACADE", "technology", "The facade may assemble and present released operations but cannot duplicate routing, validation, persistence semantics, Gate policy, or traceability contribution.", [{ kind: "element", id: "EL-SIM-FACADE" }, { kind: "interface", id: "IF-SIM-FACADE" }], [SIM.facade, SIM.authority, SIM.maintainability]),
    constraint("CON-SIM-PROFILE-NO-BYPASS", "security", "Every profile retains Core validation, mandatory adaptive requirements closure, and each applicable required Gate; fast lanes create explicit deferred obligations only.", [{ kind: "element", id: "EL-SIM-PROFILES" }, { kind: "interface", id: "IF-SIM-PROFILE" }], [SIM.profiles, SIM.deterministic, SIM.performance, SIM.authority]),
    constraint("CON-SIM-HOST-LOCAL", "operational", "The reference host is local to ChatGPT Desktop on Windows, uses SQLite and local content-addressed storage, and binds one exact Desktop/Codex executor.", [{ kind: "element", id: "EL-SIM-LOCAL-HOST" }, { kind: "interface", id: "IF-SIM-HOST-EXECUTOR" }], [SIM.host, SIM.platform, SIM.security]),
    constraint("CON-SIM-EVIDENCE-RETRIEVABLE", "security", "Every externalized evidence asset is immutable, content-addressed, media-typed, candidate-bound, publicly retrievable, and independently verifiable from a clean checkout.", [{ kind: "element", id: "EL-SIM-EVIDENCE-ASSET" }, { kind: "interface", id: "IF-SIM-EVIDENCE-ASSET" }], [SIM.evidence, SIM.evidenceConstraint, SIM.history, SIM.security]),
    constraint("CON-SIM-PERFORMANCE-BUDGETS", "operational", "On the Windows reference host, p95 init/status/inspect is at most 500 ms, p95 crash reconciliation is at most 5 s for a bounded run, quick-profile minimal-project feedback is at most 60 s, and durable-host overhead is reported and at most 15 percent of a matched in-memory run.", [{ kind: "element", id: "EL-SIM-PROFILES" }, { kind: "element", id: "EL-SIM-HOST-RECOVERY" }, { kind: "element", id: "EL-SIM-HOST-CLI" }], [SIM.performance, SIM.profiles, SIM.host]),
    constraint("CON-SIM-COMPAT-WINDOW", "organizational", "Displaced prerelease APIs remain only under compat/v1 for 0.10.0-rc.2 and are removed or re-approved before the next prerelease after tested migration guidance exists.", [{ kind: "element", id: "EL-SIM-COMPAT" }, { kind: "interface", id: "IF-SIM-API-TIERS" }], [SIM.api, SIM.compatibility, SIM.maintainability]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-SIM-001",
    objective: "Make DevRelay easy to adopt from ChatGPT Desktop on Windows through a thin facade and durable local host while preserving the complete deterministic trust model.",
    scope,
    problemSummary: "V0.11 proves the lifecycle but exposes internal contracts, a broad root API, evidence-heavy Git history, verbose operations, and no durable local runtime.",
    solutionSummary: "Layer a small facade and immutable profiles over existing Core, enforce explicit API tiers, externalize full evidence through checksum-bound release assets, and add a local SQLite/CAS/worktree/grant/executor/recovery/CLI host.",
    requirementsDrivers: ["Simple ordinary use", "No authority regression", "Compact independently verifiable evidence", "Recoverable local execution", "Explicit compatibility and domain boundaries", "Windows Desktop acceptance"],
    behaviorFlows: [
      "The operator selects a profile; the resolver emits immutable explicit policy and Core performs adaptive requirements closure and Gate progression.",
      "The facade translates ordinary run, resume, verify, and inspect requests into released Core operations without exposing internal artifact construction.",
      "The local host atomically persists state references in SQLite and exact bytes in content-addressed storage.",
      "Each work item executes in an exact isolated worktree through one capability-enforced Desktop executor binding.",
      "Recovery reconciles durable state and artifacts, replays completed checkpoints with zero effects, and quarantines ambiguous external effects.",
      "Release tooling retains compact Git evidence and publishes full candidate-bound evidence assets with independently verified hashes.",
    ],
    dataResponsibilities: ["ProfilePolicy owns explicit risk-scaled Module, Gate, and evidence policy.", "HostState owns run versions, transitions, approvals, leases, and artifact references.", "ArtifactStore owns immutable bytes and retrieval verification.", "ExecutorBinding owns exact Desktop executor identity, worktree, grants, and idempotency.", "EvidenceAssetManifest owns release identity, files, digests, sizes, media types, and provenance.", "CompatibilityManifest owns compat/v1 symbols, deprecation timing, and migration evidence."],
    failureHandling: ["Facade and CLI fail closed on validation or ambiguous identity.", "SQLite uses optimistic state versions and explicit migration/integrity failure.", "CAS rejects digest or media-type drift.", "Worktree or executor mismatch blocks execution.", "Recovery quarantines unreceipted uncertain effects.", "Unavailable evidence assets or stale review prevent release promotion."],
    securityPrivacy: ["All effects are deny-by-default and capability-granted.", "Secrets remain references and never enter CLI output or public evidence.", "SQLite is parameterized and local.", "Evidence publication applies existing redaction and secret checks.", "Optional packs receive only declared capabilities."],
    performanceReliabilityOperability: ["p95 init/status/inspect <=500 ms.", "p95 bounded crash reconciliation <=5 s.", "Quick-profile minimal-project feedback <=60 s.", "Durable-host overhead <=15 percent of matched in-memory execution and is always reported.", "All state-changing operations are idempotent or explicitly quarantined."],
    compatibilityMigrationRollout: ["Ship facade and subpath boundaries before any physical package split.", "Keep compat/v1 for exactly the 0.10.0-rc.2 cycle.", "Externalize evidence only after clean-checkout retrieval verification.", "Deliver the host as V0.11 work after the 0.10.0-rc.2 simplification preview.", "Use bounded stacked pull requests and keep the old verified pair immutable.", "Require independent review before stable labeling."],
    verificationIntent: ["Installed-package facade and subpath tests.", "Profile equivalence and bypass-negative tests.", "SQLite migration, integrity, CAS tamper, worktree isolation, grant denial, and crash-window tests.", "CLI command and exit-code matrix.", "Evidence publish, retrieval, digest, absence, and secret-negative tests.", "Windows Desktop clean-checkout full lifecycle and measured performance budgets."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-SIM-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-SIM-")).map(({ id }) => id),
    sourceRequirementIds: newNormativeIds,
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-SIM-001", "Layer a thin facade over released Core operations", "OPT-SIM-THIN-FACADE", "OPT-SIM-REWRITE-CORE", [SIM.facade, SIM.usability, SIM.authority], [{ kind: "element", id: "EL-SIM-FACADE" }]],
    ["ADR-SIM-002", "Resolve immutable workflow profiles without Gate bypass", "OPT-SIM-EXPLICIT-PROFILES", "OPT-SIM-SEPARATE-WORKFLOWS", [SIM.profiles, SIM.deterministic, SIM.performance, SIM.authority], [{ kind: "element", id: "EL-SIM-PROFILES" }]],
    ["ADR-SIM-003", "Prove API tiers through subpaths before physical package splitting", "OPT-SIM-SUBPATH-FIRST", "OPT-SIM-IMMEDIATE-MONOREPO-SPLIT", [SIM.api, SIM.compatibility, SIM.maintainability], [{ kind: "element", id: "EL-SIM-API-BOUNDARY" }]],
    ["ADR-SIM-004", "Externalize full evidence as checksum-bound GitHub Release assets", "OPT-SIM-RELEASE-ASSETS", "OPT-SIM-ALL-EVIDENCE-IN-GIT", [SIM.evidence, SIM.evidenceConstraint, SIM.history, SIM.security], [{ kind: "element", id: "EL-SIM-EVIDENCE-ASSET" }]],
    ["ADR-SIM-005", "Use SQLite plus content-addressed artifacts for the local host", "OPT-SIM-SQLITE-CAS", "OPT-SIM-IN-MEMORY-ONLY", [SIM.host, SIM.deterministic, SIM.security], [{ kind: "element", id: "EL-SIM-HOST-STATE" }, { kind: "element", id: "EL-SIM-HOST-ARTIFACTS" }]],
    ["ADR-SIM-006", "Isolate work with Git worktrees and one capability-enforced Desktop executor", "OPT-SIM-WORKTREE-EXECUTOR", "OPT-SIM-SHARED-WORKSPACE", [SIM.host, SIM.security, SIM.platform, SIM.authority], [{ kind: "element", id: "EL-SIM-HOST-WORKSPACES" }, { kind: "element", id: "EL-SIM-HOST-EXECUTOR" }]],
    ["ADR-SIM-007", "Make crash recovery a first-class reconciled protocol", "OPT-SIM-RECOVERY-JOURNAL", "OPT-SIM-BEST-EFFORT-RESTART", [SIM.host, SIM.deterministic, SIM.performance, SIM.security], [{ kind: "element", id: "EL-SIM-HOST-RECOVERY" }]],
    ["ADR-SIM-008", "Retain compat/v1 for one prerelease cycle", "OPT-SIM-ONE-CYCLE-COMPAT", "OPT-SIM-PERMANENT-SHIMS", [SIM.api, SIM.compatibility, SIM.maintainability], [{ kind: "element", id: "EL-SIM-COMPAT" }]],
    ["ADR-SIM-009", "Keep domain behavior in optional packs", "OPT-SIM-OPTIONAL-PACKS", "OPT-SIM-DOMAIN-IN-CORE", [SIM.api, SIM.maintainability, SIM.authority], [{ kind: "element", id: "EL-MQ-GODOT-PACK" }]],
    ["ADR-SIM-010", "Use preview labeling until exact independent human review", "OPT-SIM-PREVIEW-UNTIL-REVIEW", "OPT-SIM-STABLE-BY-SELF-ATTESTATION", [SIM.evidence, SIM.history, SIM.platform], [{ kind: "element", id: "EL-REL-TOOLING" }]],
  ].map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-SIM-BASELINE-CURRENT", statement: "The supplied approved V0.11 architecture baseline is the exact current design baseline for SIM-001.", status: "confirmed", blocking: false },
    { id: "ASM-SIM-WINDOWS-HOST", statement: "ChatGPT Desktop on Windows remains the sole release-defining interactive host.", status: "confirmed", blocking: false },
    { id: "ASM-SIM-REVIEW", statement: "A candidate without independent human review remains a preview and cannot be promoted as stable.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-SIM-FACADE-LEAK", statement: "The facade can hide authority-bearing decisions.", impact: "Users may believe a simplified call bypasses required engineering controls.", mitigation: "Return resolved policy, Gates, obligations, and exact evidence references from every operation." },
    { id: "RISK-SIM-RECOVERY-SPLIT", statement: "Database, artifact, worktree, external effect, and Git state can diverge during a crash.", impact: "A resumed run may duplicate effects or accept stale evidence.", mitigation: "Use state versions, idempotency keys, commit journals, exact reconciliation, and quarantine for uncertainty." },
    { id: "RISK-SIM-EVIDENCE-AVAILABILITY", statement: "External evidence assets can be unavailable or replaced.", impact: "Repository claims become unverifiable.", mitigation: "Bind immutable release identity, digest, size, media type, provenance, and clean-checkout retrieval checks." },
    { id: "RISK-SIM-COMPAT-DRAG", statement: "Compatibility adapters can outlive their approved window.", impact: "The simplified API remains permanently coupled to legacy shapes.", mitigation: "Machine-readable expiration, migration tests, and a blocking removal or reapproval Gate." },
    { id: "RISK-SIM-PROFILE-MISUSE", statement: "Quick profile results can be mistaken for final assurance.", impact: "Incomplete verification may reach acceptance.", mitigation: "Persist deferred obligations and require their closure before final verification and acceptance." },
  ];

  return { DEV: {}, RUN: { inspect: SIM.facade, deterministic: SIM.deterministic }, SIM, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope, openSpecDesign, diagramViewSpecs, decisionSpecs, technicalDesign, interfaces, constraints, assumptions, risks, uniq };
}

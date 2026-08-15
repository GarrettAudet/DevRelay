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
  return { id, sourceElementId, targetElementId, description, interactionStyle: "synchronous", tags: [], sourceRequirementIds: uniq(requirements), sourceRefs: [] };
}

function interfaceIntent({ id, name, provider, consumers, inputs, outputs, requirements, failure, security }) {
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
    protocolConstraints: ["Exact artifact versions and content digests", "Canonical provider-neutral semantics", "Explicit authority and failure dispositions"],
    failureBehavior: failure,
    compatibilityObligations: ["Stable canonical behavior across supported ChatGPT Desktop and Windows versions", "Unknown, stale, unavailable, or unverified state fails closed"],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: ["Validate canonical structured bytes before progression", "Preserve exact inputs, native output, receipts, checkpoints, and approval lineage"],
    contractGeneration: { required: true, suggestedKinds: ["json-schema"] },
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
    verificationIntent: "Dedicated positive, negative, drift, substitution, replay, projection, performance, and Windows Desktop conformance fixtures.",
    sourceRequirementIds: uniq(requirements),
    sourceRefs: [],
  };
}

function baselineCoverage(baseSections, normativeIds) {
  const map = new Map(normativeIds.map((id) => [id, new Map()]));
  const cite = (kind, id, ids) => {
    for (const requirementId of ids ?? []) {
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

export function buildRoadmapArchitecture({ architectureBaseline, requirements }) {
  const RM = Object.freeze({
    review: "US-DEV-ROADMAP-REVIEW-001",
    triage: "US-DEV-ROADMAP-TRIAGE-001",
    bootstrap: "US-DEV-SESSION-BOOTSTRAP-001",
    deterministic: "NFR-RM-DETERMINISM-001",
    failClosed: "NFR-RM-FAIL-CLOSED-001",
    usability: "NFR-RM-USABILITY-001",
    performance: "NFR-RM-PERFORMANCE-001",
    authority: "CON-RM-AUTHORITY-001",
    context: "CON-RM-CONTEXT-001",
    scope: "CON-RM-SCOPE-001",
    platform: "CON-RM-PLATFORM-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(RM).filter((id) => !declaredIds.has(id));
  if (missing.length) throw new Error(`RM-001 architecture drivers are absent: ${missing.join(", ")}`);

  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const newNormativeIds = Object.values(RM);
  const baseSections = architectureBaseline.sections;
  const alreadyDesignedTargets = baselineCoverage(baseSections, allNormativeIds);
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-RM-001";

  model.elements.push(
    container("EL-RM-ROADMAP-MANAGEMENT", "RoadmapManagement", "Cross-cutting semantic module for deterministic roadmap review, candidate triage, and reprioritization without construction-stage or scheduling authority.", ["Route the three explicit roadmap operations", "Invoke configured proposer adapters", "Return validated roadmap drafts and diagnostics"], [RM.review, RM.triage, RM.scope, RM.authority], ["SemanticModule"]),
    component("EL-RM-ROUTER", "Roadmap Operation Router", "EL-RM-ROADMAP-MANAGEMENT", "Selects triage-candidate, review-roadmap, or reprioritize from the explicit invocation and current roadmap disposition.", ["Reject implicit operation selection", "Route RoadmapNotInitialized to baseline establishment"], [RM.review, RM.triage, RM.deterministic, RM.authority]),
    component("EL-RM-NATIVE-PROPOSER", "Native Structured Roadmap Proposer", "EL-RM-ROADMAP-MANAGEMENT", "Produces provider-neutral roadmap proposals, deterministic priority facts, and exactly one disposition recommendation.", ["Compare exact context slices", "Score with explicit weights", "Preserve rationale and duplicate/conflict evidence"], [RM.review, RM.triage, RM.deterministic, RM.scope]),
    component("EL-RM-OPTIONAL-ADAPTERS", "Optional Planning Adapter Bridge", "EL-RM-ROADMAP-MANAGEMENT", "Normalizes proposals from optional external planning systems without granting them roadmap or workflow authority.", ["Validate adapter maturity and grants", "Archive native output and normalize canonical semantics"], [RM.review, RM.triage, RM.authority]),
    component("EL-RM-ROADMAP-GATE", "Roadmap Gate", "EL-DEVRELAY-CORE", "Validates exact candidate bytes, coverage, recommendation, replay, owner approval, and baseline drift before atomic promotion.", ["Own RoadmapBaseline promotion authority", "Reject stale, substituted, or incomplete candidates"], [RM.triage, RM.failClosed, RM.authority]),
    component("EL-RM-BASELINE-PROJECTOR", "Roadmap Baseline and Projection Service", "EL-DEVRELAY-CORE", "Persists the authoritative structured RoadmapBaseline and deterministically projects concise Roadmap.md bytes.", ["Preserve disposition history and lineage", "Emit UTF-8 NFC LF projections"], [RM.review, RM.triage, RM.deterministic, RM.usability]),
    component("EL-RM-SESSION-BOOTSTRAP", "DevRelay Session Bootstrap", "EL-DEVRELAY-CORE", "Loads mandatory current orientation context at the start of each fresh DevRelay task in a configured workspace.", ["Build an exact SessionContextSnapshot", "Emit a SessionContextReceipt before module execution", "Permit unrelated ChatGPT chats to remain outside DevRelay"], [RM.bootstrap, RM.context, RM.platform, RM.usability, RM.performance]),
    component("EL-RM-CONTEXT-VALIDATOR", "Session Context Validator", "EL-DEVRELAY-CORE", "Validates required context, digest bindings, task/workspace identity, current baselines, Gate, frontier, blockers, and refresh state.", ["Fail closed on missing, stale, malformed, substituted, or mismatched context", "Require refresh at the next module boundary after baseline change"], [RM.bootstrap, RM.context, RM.failClosed, RM.deterministic]),
    component("EL-RM-TRACE-CONTRIBUTOR", "Roadmap Traceability Contributor", "EL-DEVRELAY-CORE", "Derives approved upstream-to-downstream roadmap and session provenance facts from validated canonical artifacts.", ["Prevent adapters from mutating the graph", "Atomically merge approved roadmap lineage and coverage facts"], [RM.review, RM.triage, RM.authority, RM.deterministic]),
  );

  model.relationships.push(
    relationship("REL-RM-ROUTER-PROPOSER", "EL-RM-ROUTER", "EL-RM-NATIVE-PROPOSER", "Invokes the default native proposer for the selected roadmap operation.", [RM.review, RM.triage, RM.deterministic]),
    relationship("REL-RM-ROUTER-ADAPTERS", "EL-RM-ROUTER", "EL-RM-OPTIONAL-ADAPTERS", "Invokes an explicitly configured optional proposer adapter when available and approved.", [RM.review, RM.triage, RM.authority]),
    relationship("REL-RM-PROPOSER-GATE", "EL-RM-NATIVE-PROPOSER", "EL-RM-ROADMAP-GATE", "Submits a validated proposal and recommendation without promotion authority.", [RM.triage, RM.failClosed, RM.authority]),
    relationship("REL-RM-GATE-BASELINE", "EL-RM-ROADMAP-GATE", "EL-RM-BASELINE-PROJECTOR", "Atomically promotes the approved structured baseline and matching Markdown projection.", [RM.review, RM.triage, RM.deterministic, RM.authority]),
    relationship("REL-RM-BOOTSTRAP-VALIDATOR", "EL-RM-SESSION-BOOTSTRAP", "EL-RM-CONTEXT-VALIDATOR", "Validates the complete fresh-task snapshot before issuing a passing receipt.", [RM.bootstrap, RM.context, RM.failClosed]),
    relationship("REL-RM-BASELINE-BOOTSTRAP", "EL-RM-BASELINE-PROJECTOR", "EL-RM-SESSION-BOOTSTRAP", "Supplies the exact current RoadmapBaseline and projection or RoadmapNotInitialized disposition.", [RM.bootstrap, RM.review, RM.deterministic]),
    relationship("REL-RM-GATE-CONTEXT", "EL-RM-ROADMAP-GATE", "EL-RM-CONTEXT-VALIDATOR", "Marks the prior session snapshot stale after promotion so the next module boundary must refresh it.", [RM.bootstrap, RM.context, RM.failClosed]),
    relationship("REL-RM-GATE-TRACE", "EL-RM-ROADMAP-GATE", "EL-RM-TRACE-CONTRIBUTOR", "Supplies only approved baseline changes for deterministic graph contribution.", [RM.triage, RM.authority, RM.deterministic]),
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
    viewFor({ viewKey: "VIEW-RM-CONTAINERS", type: "container", title: "RM-001 top-level containers", purpose: "Show RoadmapManagement beside existing DevRelay containers.", scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-RM-MODULE-COMPONENTS", type: "component", title: "RoadmapManagement components", purpose: "Show operation routing and replaceable proposer boundaries.", scopeElementId: "EL-RM-ROADMAP-MANAGEMENT", elementIds: children("EL-RM-ROADMAP-MANAGEMENT") }),
    viewFor({ viewKey: "VIEW-RM-CORE-COMPONENTS", type: "component", title: "Roadmap and session Core services", purpose: "Show Gate, baseline, bootstrap, validation, and traceability authority in Generic Core.", scopeElementId: "EL-DEVRELAY-CORE", elementIds: children("EL-DEVRELAY-CORE").filter((id) => id.startsWith("EL-RM-")) }),
  ];

  const scope = {
    level: "change",
    boundary: "DevRelay RM-001 deterministic roadmap governance and mandatory fresh-task session context.",
    in: ["three RoadmapManagement operations", "native structured proposer", "optional planning proposal adapters", "explicit weighted prioritization", "human-owned RoadmapGate", "structured RoadmapBaseline", "concise Roadmap.md projection", "mandatory DevRelaySessionBootstrap", "SessionContextSnapshot and receipt", "RoadmapNotInitialized routing", "next-boundary refresh", "trusted traceability contribution"],
    out: ["dates", "staffing", "scheduling", "execution", "work status", "automatic roadmap mutation", "hidden ModuleInvocation inputs", "mandatory behavior in unrelated ChatGPT chats", "hosted backend"],
  };

  const openSpecDesign = `# DevRelay RM-001 roadmap architecture change\n\n## Context\n\nDevRelay has deterministic construction modules and durable project context, but it lacks a governed place for net-new initiatives and a mandatory fresh-task context receipt.\n\n## Decision\n\nAdd one cross-cutting RoadmapManagement semantic module with three explicit operations, a native structured proposer, optional proposer adapters, a Core-owned RoadmapGate, an authoritative RoadmapBaseline with deterministic Roadmap.md projection, and a mandatory DevRelaySessionBootstrap for fresh DevRelay tasks.\n\n## Authority\n\nAdapters propose only. RoadmapGate promotes only exact owner-approved candidates. Session context or conversation memory never substitutes for explicit ModuleInvocation inputs.\n\n## Failure behavior\n\nMissing or stale roadmap/session authority fails closed. An uninitialized roadmap produces RoadmapNotInitialized and routes to baseline establishment while read-only inspection remains available.\n`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({ id: "IF-RM-MODULE", name: "RoadmapManagement operation", provider: "EL-RM-ROADMAP-MANAGEMENT", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Explicit operation, exact current baselines and roadmap disposition, configured proposer, priority policy, and candidate when applicable"], outputs: ["RoadmapDraft or RoadmapChangeSetDraft, exactly one disposition recommendation when triaging, diagnostics, and native artifacts"], requirements: [RM.review, RM.triage, RM.scope, RM.authority], failure: "Reject unknown operations, missing exact context, implicit scheduling data, or an adapter attempt to mutate authority-bearing state.", security: ["Adapters receive only declared context and remain proposer-only"] }),
    interfaceIntent({ id: "IF-RM-PRIORITY", name: "Deterministic roadmap priority evaluation", provider: "EL-RM-NATIVE-PROPOSER", consumers: ["EL-RM-ROADMAP-GATE"], inputs: ["Explicit weights and bounded values for strategic alignment, user value, urgency, risk reduction, effort range, dependencies, and confidence"], outputs: ["Canonical factor facts, weighted score, stable tie-breaks, ordering, and rationale"], requirements: [RM.review, RM.triage, RM.deterministic], failure: "Reject missing weights, invalid ranges, unknown criteria, unstable ties, or incomparable context.", security: ["No provider-generated hidden weights or dates"] }),
    interfaceIntent({ id: "IF-RM-GATE", name: "RoadmapGate promotion", provider: "EL-RM-ROADMAP-GATE", consumers: ["EL-RM-BASELINE-PROJECTOR", "EL-RM-TRACE-CONTRIBUTOR"], inputs: ["Exact candidate, terminal checkpoint, replay proof, current baseline, owner approval, and policy"], outputs: ["Approved promotion proof, new baseline reference, projection reference, graph checkpoint, or blocking diagnostics"], requirements: [RM.triage, RM.failClosed, RM.authority], failure: "Reject missing approval, baseline drift, byte substitution, invalid disposition, failed replay, or incomplete coverage.", security: ["Only exact content-addressed human approval can promote"] }),
    interfaceIntent({ id: "IF-RM-BASELINE", name: "RoadmapBaseline and Roadmap.md projection", provider: "EL-RM-BASELINE-PROJECTOR", consumers: ["EL-RM-SESSION-BOOTSTRAP", "EL-RM-ROADMAP-MANAGEMENT"], inputs: ["Approved roadmap promotion and previous baseline lineage"], outputs: ["Authoritative structured RoadmapBaseline, concise UTF-8 NFC LF Roadmap.md, disposition history, and content digests"], requirements: [RM.review, RM.triage, RM.deterministic, RM.usability], failure: "Reject projection drift, missing lineage, duplicate identities, or noncanonical bytes.", security: ["Projection cannot add or omit authoritative roadmap semantics"] }),
    interfaceIntent({ id: "IF-RM-SESSION-SNAPSHOT", name: "Fresh DevRelay session context snapshot", provider: "EL-RM-SESSION-BOOTSTRAP", consumers: ["EL-RM-CONTEXT-VALIDATOR"], inputs: ["Configured workspace and task identity plus exact ProjectOverview, Roadmap, lifecycle status, baselines, pending Gate, ready frontier, clarifications, and blockers"], outputs: ["Canonical SessionContextSnapshot or RoadmapNotInitialized disposition"], requirements: [RM.bootstrap, RM.context, RM.usability, RM.performance], failure: "Fail closed on missing required initialized context while preserving read-only inspection for RoadmapNotInitialized.", security: ["Snapshot is orientation context, not hidden workflow authority"] }),
    interfaceIntent({ id: "IF-RM-SESSION-RECEIPT", name: "Session context validation receipt", provider: "EL-RM-CONTEXT-VALIDATOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["SessionContextSnapshot, expected workspace/task identity, repository revision, artifact versions and digests, and freshness policy"], outputs: ["Passing or failing SessionContextReceipt with duration, cache behavior, exact bindings, and diagnostics"], requirements: [RM.bootstrap, RM.context, RM.failClosed, RM.deterministic], failure: "No module may execute after missing, stale, substituted, malformed, or digest-mismatched required context.", security: ["Receipt is candidate- and task-bound and cannot be cloned across workspaces"] }),
    interfaceIntent({ id: "IF-RM-REFRESH", name: "Next-boundary session context refresh", provider: "EL-RM-CONTEXT-VALIDATOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Prior receipt, approved baseline change, next ModuleInvocation boundary, and current artifact bindings"], outputs: ["New snapshot and receipt or stale-context diagnostic"], requirements: [RM.bootstrap, RM.context, RM.failClosed, RM.deterministic], failure: "Block progression when a baseline changed after the last receipt and no exact refresh has passed.", security: ["Refresh does not mutate or synthesize explicit ModuleInvocation ports"] }),
    interfaceIntent({ id: "IF-RM-TRACEABILITY", name: "Roadmap traceability contribution", provider: "EL-RM-TRACE-CONTRIBUTOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Validated approved roadmap baseline change and source requirement references"], outputs: ["Deterministic approved graph update, update digest, merge proof, and resulting checkpoint"], requirements: [RM.review, RM.triage, RM.authority, RM.deterministic], failure: "Reject adapter-authored graph operations, inverse edges, unknown node types, or unapproved roadmap facts.", security: ["Only the trusted contributor creates approved relationship types"] }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-RM-CROSS-CUTTING", "organizational", "RoadmapManagement is callable when roadmap work is needed and is not inserted as a mandatory construction stage.", [{ kind: "element", id: "EL-RM-ROADMAP-MANAGEMENT" }], [RM.review, RM.triage, RM.scope]),
    constraint("CON-RM-HUMAN-GATE", "security", "No detection, proposer, adapter, or model may alter RoadmapBaseline; only RoadmapGate with exact owner approval may promote.", [{ kind: "element", id: "EL-RM-ROADMAP-GATE" }, { kind: "interface", id: "IF-RM-GATE" }], [RM.triage, RM.failClosed, RM.authority]),
    constraint("CON-RM-EXPLICIT-CONTEXT", "technology", "SessionContextSnapshot is mandatory orientation for fresh configured DevRelay tasks but never replaces explicit content-addressed ModuleInvocation inputs.", [{ kind: "element", id: "EL-RM-SESSION-BOOTSTRAP" }, { kind: "interface", id: "IF-RM-SESSION-RECEIPT" }], [RM.bootstrap, RM.context, RM.failClosed]),
    constraint("CON-RM-PROJECTION-BYTES", "technology", "Roadmap.md is a deterministic UTF-8 NFC LF projection of RoadmapBaseline and has no independent authority.", [{ kind: "element", id: "EL-RM-BASELINE-PROJECTOR" }, { kind: "interface", id: "IF-RM-BASELINE" }], [RM.review, RM.deterministic, RM.usability]),
    constraint("CON-RM-PERFORMANCE-BUDGETS", "operational", "On the Windows reference host, cold fresh-task bootstrap p95 is at most 750 ms, warm bootstrap p95 is at most 250 ms, and native roadmap review for 1,000 items p95 is at most 1 second, with duration and cache behavior always receipted.", [{ kind: "element", id: "EL-RM-SESSION-BOOTSTRAP" }, { kind: "element", id: "EL-RM-NATIVE-PROPOSER" }], [RM.performance, RM.usability, RM.platform]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-RM-001",
    objective: "Govern roadmap initiatives and make exact current DevRelay context mandatory at every fresh configured Desktop task without weakening explicit lifecycle authority.",
    scope,
    problemSummary: "Net-new ideas can disappear into chat or enter implementation without deliberate prioritization, while fresh tasks can begin from stale conversational memory.",
    solutionSummary: "Add a cross-cutting RoadmapManagement module, Core-owned RoadmapGate and projection service, and fail-closed DevRelaySessionBootstrap with exact snapshots, receipts, and next-boundary refresh.",
    requirementsDrivers: ["Human-controlled scope", "Deterministic prioritization", "Readable roadmap", "Fresh-task context integrity", "Explicit ModuleInvocation ports", "Windows Desktop acceptance"],
    behaviorFlows: ["A fresh configured DevRelay task loads exact current context and Core validates a bound receipt before module execution.", "A detected idea remains non-authoritative until the user confirms it is net-new.", "RequirementsGathering closes the confirmed initiative before RoadmapManagement triages it.", "The native or configured proposer returns exactly one recommendation and explicit score facts.", "RoadmapGate validates replay and owner approval, then atomically promotes RoadmapBaseline, Roadmap.md, and traceability.", "A baseline change invalidates the prior session context and requires refresh at the next Module boundary."],
    dataResponsibilities: ["RoadmapBaseline owns authoritative initiatives, priorities, dispositions, and lineage.", "Roadmap.md owns only the concise deterministic human projection.", "SessionContextSnapshot owns exact orientation bindings for one task and workspace.", "SessionContextReceipt owns validation outcome, duration, cache facts, and binding proof.", "ModuleInvocation remains the sole explicit semantic input contract for each module."],
    failureHandling: ["Missing or stale initialized context blocks module execution.", "RoadmapNotInitialized routes to baseline establishment and still permits read-only inspection.", "Invalid weights or ambiguous recommendations block RoadmapGate.", "Projection or replay drift rejects promotion.", "Baseline change without next-boundary refresh blocks progression."],
    securityPrivacy: ["External adapters are proposer-only and receive declared context.", "Receipts are workspace-, task-, revision-, and digest-bound.", "No roadmap candidate changes scope without owner approval.", "Session summaries omit secrets and reference exact evidence."],
    performanceReliabilityOperability: ["Cold bootstrap p95 <=750 ms.", "Warm bootstrap p95 <=250 ms.", "Native review of 1,000 items p95 <=1 second.", "Every bootstrap and review records duration and cache behavior.", "Canonical sorting and content digests make repeats byte-stable."],
    compatibilityMigrationRollout: ["Introduce RoadmapNotInitialized for existing projects.", "Establish the first RoadmapBaseline through RoadmapGate.", "Require bootstrap only for configured DevRelay tasks.", "Keep construction lifecycle ordering unchanged.", "Ship native file contracts first and optional adapters separately."],
    verificationIntent: ["Module route and authority-negative tests.", "Priority and tie-order property tests.", "Gate approval, substitution, drift, and replay tests.", "Projection byte-parity tests.", "Fresh-tab, new-day, restart, refresh, and cloned-receipt tests.", "Installed-package ChatGPT Desktop Windows end-to-end roadmap intake."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-RM-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-RM-")).map(({ id }) => id),
    sourceRequirementIds: newNormativeIds,
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-RM-001", "Keep RoadmapManagement cross-cutting rather than a mandatory construction stage", "OPT-RM-CROSS-CUTTING", "OPT-RM-MANDATORY-STAGE", [RM.review, RM.triage, RM.scope], [{ kind: "element", id: "EL-RM-ROADMAP-MANAGEMENT" }]],
    ["ADR-RM-002", "Keep RoadmapGate promotion authority in Generic Core", "OPT-RM-CORE-GATE", "OPT-RM-ADAPTER-MUTATION", [RM.triage, RM.failClosed, RM.authority], [{ kind: "element", id: "EL-RM-ROADMAP-GATE" }]],
    ["ADR-RM-003", "Use structured RoadmapBaseline with deterministic Markdown projection", "OPT-RM-STRUCTURED-BASELINE", "OPT-RM-MARKDOWN-AUTHORITY", [RM.review, RM.deterministic, RM.usability], [{ kind: "element", id: "EL-RM-BASELINE-PROJECTOR" }]],
    ["ADR-RM-004", "Require digest-bound session bootstrap for every fresh configured DevRelay task", "OPT-RM-MANDATORY-BOOTSTRAP", "OPT-RM-CONVERSATIONAL-MEMORY", [RM.bootstrap, RM.context, RM.failClosed, RM.platform], [{ kind: "element", id: "EL-RM-SESSION-BOOTSTRAP" }, { kind: "element", id: "EL-RM-CONTEXT-VALIDATOR" }]],
    ["ADR-RM-005", "Keep session context separate from explicit ModuleInvocation ports", "OPT-RM-ORIENTATION-ONLY", "OPT-RM-HIDDEN-INPUT-INJECTION", [RM.bootstrap, RM.context, RM.authority], [{ kind: "interface", id: "IF-RM-SESSION-RECEIPT" }]],
    ["ADR-RM-006", "Use native file contracts as authority with optional proposer adapters", "OPT-RM-NATIVE-AUTHORITY", "OPT-RM-EXTERNAL-SYSTEM-AUTHORITY", [RM.review, RM.triage, RM.authority], [{ kind: "element", id: "EL-RM-NATIVE-PROPOSER" }, { kind: "element", id: "EL-RM-OPTIONAL-ADAPTERS" }]],
  ].map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-RM-BASELINE-CURRENT", statement: "The supplied approved architecture baseline is the exact current DevRelay design baseline for RM-001.", status: "confirmed", blocking: false },
    { id: "ASM-RM-WINDOWS-HOST", statement: "ChatGPT Desktop on Windows remains the sole release-defining interactive host.", status: "confirmed", blocking: false },
    { id: "ASM-RM-FRESH-TASK", statement: "A fresh DevRelay task means a new tab, new-day task, or restarted task explicitly configured for a DevRelay workspace; unrelated chats are excluded.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-RM-HIDDEN-AUTHORITY", statement: "A startup snapshot can become hidden workflow authority.", impact: "Modules may execute from implicit or stale inputs.", mitigation: "Require explicit ModuleInvocation ports and test that snapshots are orientation-only." },
    { id: "RISK-RM-FRICTION", statement: "Mandatory bootstrap can make every fresh task feel slow or verbose.", impact: "Users may bypass DevRelay.", mitigation: "Enforce performance budgets and show one concise summary with expandable exact evidence." },
    { id: "RISK-RM-SCOPE-CREEP", statement: "Roadmap prioritization can drift into scheduling and execution management.", impact: "RoadmapManagement duplicates downstream module authority.", mitigation: "Reject dates, staffing, scheduling, execution, and work status from V1 contracts." },
    { id: "RISK-RM-STALE-CONTEXT", statement: "A promoted baseline can invalidate an active session snapshot.", impact: "The next module may run against stale context.", mitigation: "Invalidate the receipt and require deterministic refresh at the next Module boundary." },
  ];

  return { DEV: {}, RUN: { inspect: RM.review, deterministic: RM.deterministic }, RM, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope, openSpecDesign, diagramViewSpecs, decisionSpecs, technicalDesign, interfaces, constraints, assumptions, risks, uniq };
}

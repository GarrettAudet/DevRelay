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

export function buildModuleQualityArchitecture({ architectureBaseline, requirements }) {
  const MQ = Object.freeze({
    skills: "US-DEV-DESKTOP-SKILLS-001",
    seal: "US-DEV-EVIDENCE-SEAL-001",
    receipts: "US-DEV-EXECUTION-RECEIPT-001",
    godot: "US-DEV-GODOT-PACK-001",
    live: "US-DEV-LIVE-PROVIDER-001",
    quality: "US-DEV-MODULE-QUALITY-001",
    trace: "US-DEV-TRACE-QUERY-001",
    compatibility: "NFR-DEV-MQ-COMPATIBILITY-001",
    deterministic: "NFR-DEV-MQ-DETERMINISM-001",
    performance: "NFR-DEV-MQ-PERFORMANCE-001",
    privacy: "NFR-DEV-MQ-PRIVACY-001",
    security: "NFR-DEV-MQ-SECURITY-001",
    usability: "NFR-DEV-MQ-USABILITY-001",
    core: "CON-DEV-MQ-CORE-001",
    evidence: "CON-DEV-MQ-EVIDENCE-001",
    feedback: "CON-DEV-MQ-FEEDBACK-001",
    host: "CON-DEV-MQ-HOST-001",
    provider: "CON-DEV-MQ-PROVIDER-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(MQ).filter((id) => !declaredIds.has(id));
  if (missing.length) throw new Error(`Module-quality architecture drivers are absent: ${missing.join(", ")}`);
  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const newNormativeIds = Object.values(MQ);
  const baseSections = architectureBaseline.sections;
  const alreadyDesignedTargets = baselineCoverage(baseSections, allNormativeIds);
  alreadyDesignedTargets.set("US-DEV-SPECIFY-001", [{ kind: "element", id: "EL-WB-MODULE" }]);
  alreadyDesignedTargets.set("NFR-DEV-DETERMINISM-001", [{ kind: "element", id: "EL-DEVRELAY-CORE" }]);

  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-MODULE-QUALITY-011";
  model.elements.push(
    component("EL-MQ-INTERVIEW", "Adaptive Interview Orchestrator", "EL-DEVRELAY-CORE", "Orders typed explore, challenge, clarify, and validate strategies while Core owns breadth-first waves, coverage, contradiction detection, and mandatory closure.", ["Build deterministic question waves", "Reject premature requirements closure"], [MQ.quality, MQ.deterministic, MQ.usability, MQ.core]),
    component("EL-MQ-PROVIDER-MANAGER", "Provider Toolchain Manager", "EL-DEVRELAY-CORE", "Resolves project-local checksum-pinned provider tools after explicit acquisition approval and never silently upgrades or substitutes them.", ["Verify provider manifests and checksums", "Enforce offline and failure dispositions"], [MQ.live, MQ.compatibility, MQ.security, MQ.provider]),
    component("EL-MQ-RECEIPT-RECORDER", "Execution Receipt Recorder", "EL-DEVRELAY-CORE", "Canonicalizes immutable local raw execution receipts and digest-bound redacted Git views for bounded provider effects.", ["Capture exact process and tool observations", "Redact and validate publishable receipt views"], [MQ.receipts, MQ.deterministic, MQ.privacy, MQ.security, MQ.evidence]),
    component("EL-MQ-METRICS", "Local Performance Metrics Recorder", "EL-DEVRELAY-CORE", "Attaches host-observed cycle, retry, test, cache, change, receipt, token, and tool metrics to ModuleExecutionRecord without inventing unavailable values.", ["Measure lifecycle performance and overhead", "Keep telemetry local and non-authoritative"], [MQ.receipts, MQ.performance, MQ.privacy, MQ.deterministic]),
    component("EL-MQ-TRACE-QUERY", "Read-only Trace Query Service", "EL-DEVRELAY-GRAPH", "Answers provenance, coverage, evidence, impact, and orphan questions from approved graph state using compact deterministic paths.", ["Provide compact shortest-path results", "Prevent every query-side mutation"], [MQ.trace, MQ.deterministic, MQ.usability, MQ.core]),
    component("EL-MQ-EVIDENCE-SEAL", "Two-phase Evidence Seal Coordinator", "EL-CI-MODULE", "Separates the implementation commit from a later evidence-sealing commit so neither commit embeds its own identity.", ["Bind evidence to an immutable implementation commit", "Produce a separate accepted seal reference"], [MQ.seal, MQ.deterministic, MQ.evidence]),
    container("EL-MQ-LIVE-PROVIDERS", "Live Provider Adapters", "Hosts bounded live specification, architecture-modeling, and decision-recording adapters without owning workflow progression.", ["Execute exact bounded provider capabilities", "Emit native artifacts and live conformance receipts"], [MQ.live, MQ.compatibility, MQ.security, MQ.provider, MQ.core], ["AdapterHost"]),
    component("EL-MQ-SPEC-PROVIDERS", "Specification Provider Adapters", "EL-MQ-LIVE-PROVIDERS", "Executes bounded OpenSpec and Spec Kit operations and evaluates BMAD, GSD, and Superpowers only as typed requirements strategies.", ["Archive exact native artifacts", "Return explicit provider absence or failure"], [MQ.live, MQ.quality, MQ.compatibility, MQ.provider]),
    component("EL-MQ-ARCH-PROVIDERS", "Architecture Provider Adapters", "EL-MQ-LIVE-PROVIDERS", "Runs current Structurizr validation, inspection, and export plus template-pinned MADR rendering and validation.", ["Validate and export the real C4 model", "Render decision records without claiming a fictitious MADR CLI"], [MQ.live, MQ.compatibility, MQ.provider]),
    container("EL-MQ-DESKTOP-SKILLS", "ChatGPT Desktop Skills", "Provides repository-scoped DevRelay operator guidance for Windows Desktop without acquiring Module, Gate, or graph authority.", ["Expose four bounded DevRelay skills", "Delegate all lifecycle effects to released contracts"], [MQ.skills, MQ.quality, MQ.host, MQ.core], ["Desktop"]),
    component("EL-MQ-SKILL-BRIDGE", "Repository Skill Bridge", "EL-MQ-DESKTOP-SKILLS", "Maps devrelay-cycle, devrelay-godot-release, devrelay-plugin-conformance, and devrelay-trace-query guidance to released library operations.", ["Load project-local skill instructions", "Preserve explicit user approval and host boundaries"], [MQ.skills, MQ.host, MQ.core]),
    container("EL-MQ-GODOT-PACK", "Optional Godot Engineering Pack", "Adds Godot-specific inspection, execution, testing, export, screenshots, and receipts without adding a Godot dependency to Generic Core.", ["Bind Godot AI MCP capabilities", "Bind GdUnit4 evidence and compatibility"], [MQ.godot, MQ.compatibility, MQ.security, MQ.core], ["OptionalPack", "Godot"]),
    component("EL-MQ-GODOT-MCP", "Godot AI MCP Adapter", "EL-MQ-GODOT-PACK", "Provides capability-granted scene inspection, input simulation, screenshots, execution, and log observations through a bounded MCP adapter.", ["Default to read-only inspection", "Receipt every granted effect and original screenshot"], [MQ.godot, MQ.security, MQ.privacy, MQ.provider]),
    component("EL-MQ-GDUNIT4", "GdUnit4 Verification Adapter", "EL-MQ-GODOT-PACK", "Collects structured focused, full, scene, fuzz, flake, soak, JUnit, export, and exported-build smoke evidence.", ["Preserve raw and structured test evidence", "Expose exact engine and adapter versions"], [MQ.godot, MQ.compatibility, MQ.deterministic, MQ.security]),
    component("EL-MQ-GODOT-COMPAT", "Godot Compatibility Registry", "EL-MQ-GODOT-PACK", "Publishes only version combinations backed by pinned live conformance and end-to-end evidence.", ["Bind DevRelay, Godot, provider, runtime, adapter, and Windows versions", "Reject inferred compatibility"], [MQ.godot, MQ.compatibility, MQ.provider]),
  );
  model.relationships.push(
    relationship("REL-MQ-INTERVIEW-PROVIDERS", "EL-MQ-INTERVIEW", "EL-MQ-SPEC-PROVIDERS", "Invokes only configured typed strategy roles and retains Core-owned closure.", [MQ.quality, MQ.deterministic, MQ.core]),
    relationship("REL-MQ-PROVIDER-SPEC", "EL-MQ-PROVIDER-MANAGER", "EL-MQ-SPEC-PROVIDERS", "Supplies an approved checksum-verified project-local provider binding.", [MQ.live, MQ.security, MQ.provider]),
    relationship("REL-MQ-PROVIDER-ARCH", "EL-MQ-PROVIDER-MANAGER", "EL-MQ-ARCH-PROVIDERS", "Supplies an approved checksum-verified architecture tool binding.", [MQ.live, MQ.compatibility, MQ.provider]),
    relationship("REL-MQ-PROVIDER-GODOT", "EL-MQ-PROVIDER-MANAGER", "EL-MQ-GODOT-PACK", "Supplies only approved version-pinned Godot toolchain bindings.", [MQ.godot, MQ.security, MQ.provider]),
    relationship("REL-MQ-PROVIDERS-RECEIPTS", "EL-MQ-LIVE-PROVIDERS", "EL-MQ-RECEIPT-RECORDER", "Streams exact native output, process observations, and artifact identities into immutable receipts.", [MQ.live, MQ.receipts, MQ.evidence]),
    relationship("REL-MQ-GODOT-RECEIPTS", "EL-MQ-GODOT-PACK", "EL-MQ-RECEIPT-RECORDER", "Streams granted input, screenshot, engine, test, export, and smoke evidence.", [MQ.godot, MQ.receipts, MQ.security]),
    relationship("REL-MQ-RECEIPTS-METRICS", "EL-MQ-RECEIPT-RECORDER", "EL-MQ-METRICS", "Supplies exact observed durations, sizes, retries, and availability dispositions.", [MQ.receipts, MQ.performance, MQ.privacy]),
    relationship("REL-MQ-DESKTOP-CORE", "EL-MQ-SKILL-BRIDGE", "EL-DEVRELAY-CORE", "Invokes released DevRelay operations through ChatGPT Desktop without hidden policy.", [MQ.skills, MQ.host, MQ.core]),
    relationship("REL-MQ-CI-SEAL", "EL-CI-RESULT-VALIDATOR", "EL-MQ-EVIDENCE-SEAL", "Supplies the verified implementation commit and integration evidence after successful integration.", [MQ.seal, MQ.evidence]),
    relationship("REL-MQ-SEAL-RECEIPT", "EL-MQ-EVIDENCE-SEAL", "EL-MQ-RECEIPT-RECORDER", "Records separate implementation and evidence-seal commit identities.", [MQ.seal, MQ.receipts, MQ.evidence]),
    relationship("REL-MQ-GODOT-TEST-COMPAT", "EL-MQ-GDUNIT4", "EL-MQ-GODOT-COMPAT", "Contributes live-tested compatibility observations only after verification.", [MQ.godot, MQ.compatibility]),
  );

  const viewFor = ({ viewKey, type, title, purpose, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return {
      viewKey,
      type,
      title,
      purpose,
      audience: ["engineering", "architecture", "verification", "operators"],
      scopeElementId,
      elementIds,
      relationshipIds: model.relationships.filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId)).map(({ id }) => id),
    };
  };
  const priorViews = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const children = (parentId) => model.elements.filter(({ type, parentId: parent }) => type === "component" && parent === parentId).map(({ id }) => id);
  const diagramViewSpecs = [
    ...priorViews,
    viewFor({ viewKey: "VIEW-MQ-CONTAINERS", type: "container", title: "V0.11 module-quality containers", purpose: "Show optional packs and live-provider boundaries beside existing DevRelay containers.", scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-MQ-CORE-COMPONENTS", type: "component", title: "V0.11 Generic Core services", purpose: "Show interview, provider, receipt, and metrics authority in Generic Core.", scopeElementId: "EL-DEVRELAY-CORE", elementIds: children("EL-DEVRELAY-CORE").filter((id) => id.startsWith("EL-MQ-")) }),
    viewFor({ viewKey: "VIEW-MQ-PROVIDER-COMPONENTS", type: "component", title: "Live provider adapters", purpose: "Show bounded live specification and architecture providers.", scopeElementId: "EL-MQ-LIVE-PROVIDERS", elementIds: children("EL-MQ-LIVE-PROVIDERS") }),
    viewFor({ viewKey: "VIEW-MQ-GODOT-COMPONENTS", type: "component", title: "Optional Godot engineering pack", purpose: "Show bounded Godot MCP, GdUnit4, and compatibility components.", scopeElementId: "EL-MQ-GODOT-PACK", elementIds: children("EL-MQ-GODOT-PACK") }),
    viewFor({ viewKey: "VIEW-MQ-DESKTOP-COMPONENTS", type: "component", title: "ChatGPT Desktop skill bridge", purpose: "Show repository-scoped skills as non-authoritative host guidance.", scopeElementId: "EL-MQ-DESKTOP-SKILLS", elementIds: children("EL-MQ-DESKTOP-SKILLS") }),
  ];

  const scope = {
    level: "change",
    boundary: "DevRelay V0.11 module quality, live-provider conformance, receipts, trace queries, Desktop skills, and optional Godot engineering support.",
    in: [
      "adaptive breadth-first requirements strategy composition and mandatory closure",
      "project-local checksum-pinned provider acquisition and explicit failure",
      "live OpenSpec, Spec Kit, Structurizr, and MADR adapter evidence",
      "local raw receipts, redacted Git views, and performance telemetry",
      "read-only compact trace queries",
      "two-phase implementation/evidence Git sealing",
      "repository-scoped ChatGPT Desktop skills",
      "optional Godot AI MCP and GdUnit4 pack with a tested compatibility matrix",
    ],
    out: [
      "domain behavior inside Generic Core",
      "silent provider installation, upgrade, fallback, or substitution",
      "network telemetry export",
      "Sentry or PostHog installation or activation",
      "provider ownership of lifecycle routing, closure, Gates, or TraceabilityGraph",
    ],
  };

  const openSpecDesign = `# DevRelay V0.11 module-quality architecture change

## Context

The deterministic lifecycle and graph contracts are mature, but several external integrations remain contract-defined or fixture-conformant. Requirements elicitation needs Core-owned adaptive closure, live effects need immutable receipts, traceability needs compact queries, and ChatGPT Desktop on Windows needs an optional production-grade Godot path.

## Decision

Add typed requirements-strategy orchestration, a host-owned provider toolchain manager, a Core-owned receipt and metrics boundary, bounded live specification and architecture adapters, a read-only TraceabilityGraph query service, two-phase Git sealing, repository-scoped Desktop skills, and an optional Godot pack containing Godot AI MCP and GdUnit4 adapters. Generic Core retains routing, closure, validation, checkpointing, traceability, and Gate authority.

## Contract consequence

Provider acquisition, execution receipt, metrics, trace query, evidence seal, Desktop skill bridge, Godot operation, and Godot verification artifacts require machine-validatable contracts before WorkBreakdown.

## Boundaries

No provider owns the workflow. No adapter downloads tools. No Godot dependency enters Generic Core. Raw receipts and metrics remain local. Sentry and PostHog remain disabled and outside V0.11.
`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({ id: "IF-MQ-REQUIREMENTS-STRATEGY", name: "Typed requirements strategy contribution", provider: "EL-MQ-INTERVIEW", consumers: ["EL-MQ-SPEC-PROVIDERS"], inputs: ["Exact decision-domain catalog, prior answers, coverage state, and configured strategy role"], outputs: ["Bounded proposed questions, follow-ups, assumptions, and native artifacts"], requirements: [MQ.quality, MQ.deterministic, MQ.usability, MQ.core], failure: "Reject undeclared domains, duplicate questions, hidden closure, contradictory assumptions, or out-of-order strategy roles.", security: ["Strategies receive only declared context and cannot mutate project state, Gates, or TraceabilityGraph"] }),
    interfaceIntent({ id: "IF-MQ-PROVIDER-TOOLCHAIN", name: "Approved project-local provider binding", provider: "EL-MQ-PROVIDER-MANAGER", consumers: ["EL-MQ-SPEC-PROVIDERS", "EL-MQ-ARCH-PROVIDERS", "EL-MQ-GODOT-PACK"], inputs: ["Pinned provider manifest, checksum, acquisition approval, offline policy, and host grants"], outputs: ["Verified executable binding or explicit unavailable/failed disposition"], requirements: [MQ.live, MQ.compatibility, MQ.security, MQ.provider], failure: "Fail closed on absent approval, checksum mismatch, drift, unavailable binary, attempted global install, or silent fallback.", security: ["The host enforces downloads, process execution, filesystem, network, and secrets; adapters never acquire tools"] }),
    interfaceIntent({ id: "IF-MQ-EXECUTION-RECEIPT", name: "Canonical provider execution receipt", provider: "EL-MQ-RECEIPT-RECORDER", consumers: ["EL-DEVRELAY-CORE", "EL-MQ-METRICS"], inputs: ["Raw stdout/stderr, exit code, duration, command fingerprint, versions, retries, and artifact digests"], outputs: ["Immutable local raw receipt and digest-bound redacted Git view"], requirements: [MQ.receipts, MQ.deterministic, MQ.privacy, MQ.security, MQ.evidence], failure: "Reject missing mandatory observations, unsafe controls, secret findings, digest mismatch, or unsupported maturity claims.", security: ["Raw bytes remain local; only secret-scanned redacted views may enter Git"] }),
    interfaceIntent({ id: "IF-MQ-METRICS", name: "Module execution performance attachment", provider: "EL-MQ-METRICS", consumers: ["EL-DEVRELAY-CORE", "EL-RUN-REPORTING"], inputs: ["Host-observed timestamps, retries, cache events, test durations, changed files, receipt sizes, and available token/tool usage"], outputs: ["Non-authoritative local metrics attachment with unavailable dispositions and self-overhead"], requirements: [MQ.receipts, MQ.performance, MQ.privacy, MQ.deterministic], failure: "Never invent a value; mark unavailable observations explicitly and reject negative or inconsistent measurements.", security: ["Metrics remain local unless a separately approved export grants disclosure"] }),
    interfaceIntent({ id: "IF-MQ-TRACE-QUERY", name: "Read-only traceability query", provider: "EL-MQ-TRACE-QUERY", consumers: ["EL-MQ-SKILL-BRIDGE"], inputs: ["Exact graph checkpoint, query kind, stable IDs, direction, horizon, and compactness policy"], outputs: ["Deterministic compact provenance, coverage, evidence, impact, or orphan result with expandable refs"], requirements: [MQ.trace, MQ.deterministic, MQ.usability, MQ.core], failure: "Reject unknown query kinds, stale graph checkpoints, ambiguous identities, or any mutation request.", security: ["Read-only access applies content minimization and returns no hidden raw receipt bytes"], contract: true }),
    interfaceIntent({ id: "IF-MQ-EVIDENCE-SEAL", name: "Two-phase Git evidence seal", provider: "EL-MQ-EVIDENCE-SEAL", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Verified implementation commit, exact evidence digests, integration record, and target-ref pre-state"], outputs: ["Separate evidence-seal commit and immutable seal record"], requirements: [MQ.seal, MQ.deterministic, MQ.evidence], failure: "Reject self-referential commit claims, implementation drift, missing receipts, target-ref conflict, or duplicate sealing.", security: ["The host enforces Git permissions and the seal contains no secret or unredacted raw receipt"] }),
    interfaceIntent({ id: "IF-MQ-DESKTOP-SKILLS", name: "Repository-scoped Desktop skill operation", provider: "EL-MQ-SKILL-BRIDGE", consumers: ["EL-DEVRELAY-CORE", "EL-MQ-GODOT-PACK", "EL-MQ-TRACE-QUERY"], inputs: ["Explicit user goal, repository context, selected skill, and declared DevRelay invocation"], outputs: ["Host guidance and exact DevRelay operation requests"], requirements: [MQ.skills, MQ.quality, MQ.host, MQ.core], failure: "Stop when a skill asks for hidden policy, undeclared authority, unsupported effects, or missing clarification.", security: ["Skills do not bypass user approval, host grants, Module contracts, Gates, or graph authority"], contract: false }),
    interfaceIntent({ id: "IF-MQ-GODOT-MCP", name: "Capability-granted Godot MCP operation", provider: "EL-MQ-GODOT-MCP", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Exact project, scene, operation, read/write/input/run/screenshot grant, and tool versions"], outputs: ["Godot observation or effect result with raw log, screenshot, and input receipts"], requirements: [MQ.godot, MQ.compatibility, MQ.security, MQ.privacy, MQ.provider], failure: "Fail closed on absent granular grant, project drift, unsupported version, tool failure, or missing effect receipt.", security: ["Inspection defaults read-only; write, input, run, screenshot, and test capabilities are separately allowlisted"] }),
    interfaceIntent({ id: "IF-MQ-GODOT-VERIFY", name: "Structured GdUnit4 verification evidence", provider: "EL-MQ-GDUNIT4", consumers: ["EL-DEVRELAY-CORE", "EL-MQ-GODOT-COMPAT"], inputs: ["Exact test subject, focused/full/flake/soak/export plan, engine version, and verifier grants"], outputs: ["Raw console, structured result, JUnit, screenshots, hashes, export, and smoke evidence"], requirements: [MQ.godot, MQ.compatibility, MQ.deterministic, MQ.security], failure: "Reject missing required evidence, incompatible version, flaky or failing result, export failure, smoke failure, or subject drift.", security: ["Verifier uses an isolated project/workspace and preserves exact raw evidence locally"] }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-MQ-CORE-DOMAIN-NEUTRAL", "organizational", "Generic Core owns provider-neutral routing, closure, receipts, metrics, checkpointing, traceability, and Gate inputs; every Godot behavior remains in the optional pack.", [{ kind: "element", id: "EL-DEVRELAY-CORE" }, { kind: "element", id: "EL-MQ-GODOT-PACK" }], [MQ.core, MQ.godot]),
    constraint("CON-MQ-PROVIDER-ACQUISITION", "security", "Providers are project-local, checksum-pinned, explicitly approved before first download, offline by default, and never silently installed, upgraded, substituted, or globally resolved.", [{ kind: "element", id: "EL-MQ-PROVIDER-MANAGER" }, { kind: "interface", id: "IF-MQ-PROVIDER-TOOLCHAIN" }], [MQ.live, MQ.security, MQ.provider]),
    constraint("CON-MQ-RECEIPT-PRIVACY", "security", "Raw receipts and telemetry remain local; Git receives only digest-bound redacted views that pass secret and unsafe-content checks.", [{ kind: "element", id: "EL-MQ-RECEIPT-RECORDER" }, { kind: "interface", id: "IF-MQ-EXECUTION-RECEIPT" }], [MQ.receipts, MQ.privacy, MQ.security, MQ.evidence]),
    constraint("CON-MQ-QUERY-READ-ONLY", "technology", "Trace queries may read one exact graph checkpoint and derive results but cannot create, update, retire, approve, or merge graph assertions.", [{ kind: "element", id: "EL-MQ-TRACE-QUERY" }, { kind: "interface", id: "IF-MQ-TRACE-QUERY" }], [MQ.trace, MQ.core, MQ.deterministic]),
    constraint("CON-MQ-TWO-PHASE-SEAL", "technology", "The implementation commit and evidence-seal commit are distinct immutable identities; neither commit is required to contain its own hash.", [{ kind: "element", id: "EL-MQ-EVIDENCE-SEAL" }, { kind: "interface", id: "IF-MQ-EVIDENCE-SEAL" }], [MQ.seal, MQ.deterministic, MQ.evidence]),
    constraint("CON-MQ-WINDOWS-HOST", "operational", "ChatGPT Desktop on Windows is the release-defining V0.11 host, and compatibility claims require exact version-pinned clean-checkout evidence on that host.", [{ kind: "element", id: "EL-MQ-DESKTOP-SKILLS" }, { kind: "element", id: "EL-MQ-GODOT-COMPAT" }], [MQ.host, MQ.compatibility, MQ.skills, MQ.godot]),
    constraint("CON-MQ-FEEDBACK-DEFERRED", "organizational", "Sentry and PostHog remain disabled, uninstalled, and outside V0.11; no component may emit production telemetry to them.", [{ kind: "element", id: "EL-MQ-METRICS" }], [MQ.feedback, MQ.privacy]),
    constraint("CON-MQ-UPSTREAM-BOUNDARY", "organizational", "OpenSpec, Spec Kit, Structurizr, MADR, BMAD, GSD, Superpowers, Godot AI, and GdUnit4 provide bounded capabilities only and never own DevRelay routing, closure, Gates, or TraceabilityGraph.", [{ kind: "element", id: "EL-MQ-LIVE-PROVIDERS" }, { kind: "element", id: "EL-MQ-GODOT-PACK" }], [MQ.live, MQ.quality, MQ.godot, MQ.core, MQ.provider]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-MQ-011",
    objective: "Raise every released DevRelay module toward best-in-class live integration while preserving deterministic Core authority and a production-quality ChatGPT Desktop on Windows path.",
    scope,
    problemSummary: "The lifecycle contracts are deterministic, but requirements closure is not yet Core-enforced, several important providers are not live-attested, raw effects lack one canonical receipt boundary, trace reports are verbose, and the optional Godot path lacks structured execution and verification support.",
    solutionSummary: "Add typed adaptive interviewing, host-owned provider acquisition, canonical receipts and metrics, bounded live providers, compact read-only trace queries, two-phase Git sealing, repository skills, and an optional Godot engineering pack.",
    requirementsDrivers: ["Mandatory reproducible requirements closure", "Honest live provider maturity", "Local immutable evidence", "Compact queryable traceability", "Release-defining Desktop/Windows operation", "Domain-neutral Generic Core"],
    behaviorFlows: [
      "Core selects typed requirements strategy roles, admits breadth-first questions, and computes closure from exact decisions.",
      "The host acquires an explicitly approved checksum-pinned project-local provider; adapters only receive the verified binding.",
      "Every live adapter effect emits exact native artifacts and a canonical local receipt before downstream progression.",
      "Trace queries read one immutable graph checkpoint and return compact deterministic paths with evidence expansion.",
      "ChangeIntegration creates the implementation commit, then a separate evidence-seal transaction binds verified receipts.",
      "Repository skills guide ChatGPT Desktop through released operations without gaining authority.",
      "The optional Godot pack performs separately granted MCP effects and GdUnit4 verification against a pinned compatibility matrix.",
    ],
    dataResponsibilities: ["ProviderBinding owns acquisition approval, checksum, version, location, availability, and grants.", "ExecutionReceipt owns exact process/tool observations and redaction lineage.", "ModuleMetricsAttachment owns host-observed metrics and unavailable dispositions.", "TraceQueryResult owns checkpoint-bound compact paths and evidence refs.", "EvidenceSealRecord owns implementation and sealing commit identities.", "GodotCompatibilityRecord owns only live-tested version combinations."],
    failureHandling: ["Missing or drifting providers fail explicitly without silent fallback.", "Unclosed decision domains or contradictions return clarification.", "Missing raw evidence, secret findings, or invalid redaction blocks receipt publication.", "Unsupported Godot versions or missing granular grants fail before effects.", "Git conflict or self-reference retires the seal candidate.", "Stale graph checkpoints fail trace queries."],
    securityPrivacy: ["Downloads and effects require exact host-enforced grants.", "Raw receipts and telemetry remain local by default.", "Godot input, run, write, screenshot, and test operations are separately granted and receipted.", "Skills and MCP query surfaces remain non-authoritative.", "Sentry and PostHog remain absent."],
    performanceReliabilityOperability: ["Metrics expose instrumentation overhead and unavailable values.", "Receipts and query outputs use canonical ordering and digests.", "Provider and compatibility claims bind exact versions.", "Checkpoint replay performs zero duplicate adapter effects."],
    compatibilityMigrationRollout: ["Ship the infrastructure contracts before claiming live provider maturity.", "Promote each adapter only after version-pinned conformance and failure-path evidence.", "Keep Godot in an optional pack so existing consumers take no domain dependency.", "Validate the complete clean-checkout Desktop path before V0.11 release."],
    verificationIntent: ["Exercise adaptive interviews with small, large, ambiguous, contradictory, and resumed goals.", "Test provider acquisition, checksum drift, offline reuse, absence, failure, and forbidden fallback.", "Run live OpenSpec, Spec Kit, Structurizr, and MADR conformance with archived receipts.", "Run Godot MCP and GdUnit4 focused/full/flake/soak/export/smoke evidence on a pinned Windows matrix.", "Test trace query determinism and mutation rejection.", "Prove two-phase sealing and clean ChatGPT Desktop end-to-end operation."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-MQ-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-MQ-")).map(({ id }) => id),
    sourceRequirementIds: newNormativeIds,
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-MQ-001", "Keep one coherent V0.11 architecture change with phased downstream work", "OPT-MQ-COHERENT-CHANGE", "OPT-MQ-INDEPENDENT-UNBOUND-DESIGNS", [MQ.quality, MQ.deterministic], [{ kind: "element", id: "EL-MQ-INTERVIEW" }]],
    ["ADR-MQ-002", "Compose ordered typed requirements strategies under Core-owned closure", "OPT-MQ-TYPED-STRATEGY-CHAIN", "OPT-MQ-ADAPTER-OWNS-INTERVIEW", [MQ.quality, MQ.deterministic, MQ.usability, MQ.core], [{ kind: "element", id: "EL-MQ-INTERVIEW" }, { kind: "interface", id: "IF-MQ-REQUIREMENTS-STRATEGY" }]],
    ["ADR-MQ-003", "Make provider acquisition a host-owned approved boundary", "OPT-MQ-HOST-PROVIDER-MANAGER", "OPT-MQ-ADAPTER-DOWNLOADS", [MQ.live, MQ.security, MQ.provider], [{ kind: "element", id: "EL-MQ-PROVIDER-MANAGER" }, { kind: "constraint", id: "CON-MQ-PROVIDER-ACQUISITION" }]],
    ["ADR-MQ-004", "Record canonical local execution receipts and metrics", "OPT-MQ-CORE-RECEIPTS", "OPT-MQ-ADAPTER-SUMMARIES", [MQ.receipts, MQ.performance, MQ.privacy, MQ.evidence], [{ kind: "element", id: "EL-MQ-RECEIPT-RECORDER" }, { kind: "element", id: "EL-MQ-METRICS" }]],
    ["ADR-MQ-005", "Ship Godot as an optional engineering pack", "OPT-MQ-OPTIONAL-GODOT-PACK", "OPT-MQ-GODOT-IN-CORE", [MQ.godot, MQ.compatibility, MQ.security, MQ.core], [{ kind: "element", id: "EL-MQ-GODOT-PACK" }, { kind: "constraint", id: "CON-MQ-CORE-DOMAIN-NEUTRAL" }]],
    ["ADR-MQ-006", "Expose compact read-only traceability queries", "OPT-MQ-READONLY-COMPACT-QUERY", "OPT-MQ-MUTABLE-FULL-GRAPH", [MQ.trace, MQ.deterministic, MQ.usability, MQ.core], [{ kind: "element", id: "EL-MQ-TRACE-QUERY" }, { kind: "constraint", id: "CON-MQ-QUERY-READ-ONLY" }]],
    ["ADR-MQ-007", "Use two-phase Git evidence sealing", "OPT-MQ-TWO-PHASE-SEAL", "OPT-MQ-SELF-REFERENTIAL-COMMIT", [MQ.seal, MQ.deterministic, MQ.evidence], [{ kind: "element", id: "EL-MQ-EVIDENCE-SEAL" }, { kind: "constraint", id: "CON-MQ-TWO-PHASE-SEAL" }]],
    ["ADR-MQ-008", "Keep repository skills as non-authoritative Desktop guidance", "OPT-MQ-REPOSITORY-SKILLS", "OPT-MQ-SKILL-OWNS-WORKFLOW", [MQ.skills, MQ.host, MQ.core], [{ kind: "element", id: "EL-MQ-SKILL-BRIDGE" }, { kind: "interface", id: "IF-MQ-DESKTOP-SKILLS" }]],
    ["ADR-MQ-009", "Keep upstream tools as bounded replaceable providers", "OPT-MQ-BOUNDED-UPSTREAM", "OPT-MQ-UPSTREAM-OWNS-LIFECYCLE", [MQ.live, MQ.quality, MQ.godot, MQ.core, MQ.provider], [{ kind: "element", id: "EL-MQ-LIVE-PROVIDERS" }, { kind: "constraint", id: "CON-MQ-UPSTREAM-BOUNDARY" }]],
    ["ADR-MQ-010", "Defer production feedback adapters beyond V0.11", "OPT-MQ-FEEDBACK-DEFERRED", "OPT-MQ-INSTALL-TELEMETRY", [MQ.feedback, MQ.privacy], [{ kind: "constraint", id: "CON-MQ-FEEDBACK-DEFERRED" }]],
  ].map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-MQ-BASELINE-CURRENT", statement: "The supplied approved architecture baseline remains the exact current design baseline for V0.11.", status: "confirmed", blocking: false },
    { id: "ASM-MQ-HOST-ENFORCEMENT", statement: "ChatGPT Desktop on Windows remains responsible for filesystem, process, network, secret, and tool-acquisition enforcement.", status: "confirmed", blocking: false },
    { id: "ASM-MQ-LIVE-MATURITY", statement: "No adapter becomes live-conformant until exact version-pinned provider execution and receipts pass its conformance suite.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-MQ-UPSTREAM-DRIFT", statement: "Upstream commands or artifact formats can change.", impact: "Live adapters may emit incompatible or misleading evidence.", mitigation: "Pin versions and checksums, archive native output, and fail closed on conformance drift." },
    { id: "RISK-MQ-RECEIPT-SECRETS", statement: "Raw provider or Godot output can contain secrets or sensitive source.", impact: "Evidence publication could disclose protected data.", mitigation: "Keep raw bytes local and require secret-scanned deterministic redacted Git views." },
    { id: "RISK-MQ-CORE-COUPLING", statement: "Domain or provider behavior can leak into Generic Core.", impact: "Provider neutrality and module swapping degrade.", mitigation: "Enforce provider-neutral interfaces, optional packs, and negative boundary tests." },
    { id: "RISK-MQ-DESKTOP-VARIANCE", statement: "A provider may pass CI but fail in ChatGPT Desktop on Windows.", impact: "The release-defining workflow is unusable.", mitigation: "Require a clean-checkout Windows Desktop end-to-end run with exact receipts." },
    { id: "RISK-MQ-OVERHEAD", statement: "Receipts and telemetry can dominate small operations.", impact: "Dogfood performance regresses and reports become noisy.", mitigation: "Measure instrumentation overhead and use compact default projections." },
  ];

  return {
    DEV: {},
    RUN: { inspect: MQ.trace, deterministic: MQ.deterministic },
    MQ,
    allNormativeIds,
    alreadyDesignedTargets,
    baseSections,
    model,
    scope,
    openSpecDesign,
    diagramViewSpecs,
    decisionSpecs,
    technicalDesign,
    interfaces,
    constraints,
    assumptions,
    risks,
    uniq,
  };
}

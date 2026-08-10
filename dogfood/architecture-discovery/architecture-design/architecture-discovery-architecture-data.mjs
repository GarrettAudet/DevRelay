const uniq = (...values) => [...new Set(values.flat())];

function element({
  id,
  name,
  type,
  parentId,
  description,
  responsibilities,
  requirementIds,
  tags,
}) {
  return {
    id,
    name,
    type,
    ...(parentId ? { parentId } : {}),
    description,
    technology:
      type === "software-system" ? "" : "Provider-neutral DevRelay discovery",
    responsibilities,
    tags,
    properties: {},
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

const component = (
  id,
  name,
  parentId,
  description,
  responsibilities,
  requirementIds,
  tags = [],
) =>
  element({
    id,
    name,
    type: "component",
    parentId,
    description,
    responsibilities,
    requirementIds,
    tags: ["Component", ...tags],
  });

const relationship = (
  id,
  sourceElementId,
  targetElementId,
  description,
  requirementIds,
) => ({
  id,
  sourceElementId,
  targetElementId,
  description,
  interactionStyle: "synchronous",
  tags: [],
  sourceRequirementIds: uniq(requirementIds),
  sourceRefs: [],
});

function interfaceIntent({
  id,
  name,
  provider,
  consumers,
  inputs,
  outputs,
  requirementIds,
  failure,
  security,
}) {
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
      "Exact artifact versions, repository revision/tree digest, raw bytes, and SHA-256 identities",
      "Mandatory native inventory precedes optional bounded analyzer observations",
      "Closed observed, derived, inferred, unknown, not-applicable, material-gap, and outcome semantics",
    ],
    failureBehavior: failure,
    compatibilityObligations: [
      "Stable provider-neutral snapshot semantics across compatible inventory and analyzer adapters",
      "Unknown fields, dispositions, adapter versions, policies, source references, or outcomes fail closed",
    ],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: [
      "Bind every finding to exact repository or native analyzer evidence",
      "Preserve inventory, observations, confidence, gaps, checkpoints, and graph lineage",
    ],
    contractGeneration: {
      required: true,
      suggestedKinds: ["json-schema"],
    },
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

const archConstraint = (
  id,
  category,
  statement,
  appliesTo,
  requirementIds,
) => ({
  id,
  category,
  strength: "must",
  statement,
  rationale: statement,
  appliesTo,
  verificationIntent:
    "Dedicated routing, inventory, analyzer, provenance, confidence, privacy, drift, replay, authority, and traceability conformance fixtures.",
  sourceRequirementIds: uniq(requirementIds),
  sourceRefs: [],
});

export function buildArchitectureDiscoveryArchitecture({
  architectureBaseline,
  requirements,
}) {
  const CG = Object.freeze({
    integrate: "US-DEV-ARCHITECTURE-DISCOVERY-001",
    auditability: "NFR-DEV-AD-DETERMINISM-001",
    routing: "CON-DEV-AD-AUTHORITY-001",
    inventory: "US-DEV-ARCHITECTURE-DISCOVERY-001",
    confidence: "CON-DEV-AD-OBSERVATIONAL-001",
    privacy: "CON-DEV-AD-LOCAL-FIRST-001",
    privacyNfr: "NFR-DEV-AD-PRIVACY-001",
    authority: "CON-DEV-AD-AUTHORITY-001",
    localFirst: "CON-DEV-AD-LOCAL-FIRST-001",
    provenance: "US-DEV-ARCHITECTURE-DISCOVERY-001",
    replay: "NFR-DEV-AD-DETERMINISM-001",
    boundary: "CON-DEV-AD-OBSERVATIONAL-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const availableIds = new Set([
    ...declaredIds,
    ...requirements.requirements.acceptanceCriteria.map(({ id }) => id),
  ]);
  const missing = Object.values(CG).filter((id) => !availableIds.has(id));
  if (missing.length) {
    throw new Error(
      `ArchitectureDiscovery architecture drivers are absent from approved requirements: ${missing.join(", ")}`,
    );
  }
  const allNormativeIds = [...declaredIds];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-ARCHITECTURE-DISCOVERY-009";

  model.elements.push(
    element({
      id: "EL-AD-MODULE",
      name: "ArchitectureDiscovery",
      type: "container",
      parentId: "EL-DEVRELAY-SYSTEM",
      description:
        "Conditionally discovers implemented architecture for an existing repository lacking an approved baseline or valid current snapshot.",
      responsibilities: [
        "Invoke one mandatory native inventory and configured optional analyzers through provider-neutral ports",
        "Return bounded observations and native evidence without intended-design, Gate, or graph authority",
      ],
      requirementIds: Object.values(CG),
      tags: ["Container", "LifecycleModule", "ArchitectureDiscovery"],
    }),
    component(
      "EL-AD-INVENTORY-PORT",
      "Repository Inventory Port",
      "EL-AD-MODULE",
      "Provider-neutral boundary for the mandatory deterministic local repository inventory.",
      [
        "Receive the exact allowed repository surface, revision, policy, options, and grants",
        "Return canonical file, manifest, language, build, package, and boundary observations with exact provenance",
      ],
      [CG.inventory, CG.privacy, CG.provenance],
      ["AdapterPort", "Mandatory"],
    ),
    component(
      "EL-AD-NATIVE-INVENTORY",
      "Native Repository Inventory Adapter",
      "EL-AD-MODULE",
      "Live V1 local adapter that inventories tracked or explicitly declared repository inputs deterministically.",
      [
        "Respect ignore, exclusion, secret, symlink, and submodule policy",
        "Produce a stable minimum discovery observation set independent of optional tools",
      ],
      [CG.inventory, CG.privacy, CG.provenance, CG.auditability],
      ["AdapterBinding", "Local", "LiveTarget"],
    ),
    component(
      "EL-AD-ANALYZER-PORT",
      "Optional Architecture Analyzer Port",
      "EL-AD-MODULE",
      "Bounded contributor port for tools such as dependency-cruiser, SCIP, or future analyzers.",
      [
        "Receive an explicit version-pinned context slice and declared grants",
        "Return observations only, never completeness, routing, Gate, or graph claims",
      ],
      [CG.provenance, CG.confidence, CG.privacy],
      ["AdapterPort", "Optional"],
    ),
    component(
      "EL-AD-ROUTER",
      "Discovery Route Guard",
      "EL-DEVRELAY-CORE",
      "Selects discovery only from exact existing-undiscovered project state.",
      [
        "Reject greenfield, already-discovered, baselined, stale, conflicting, or caller-forced routes",
        "Bind the selected operation to exact project-state evidence",
      ],
      [CG.routing, CG.boundary],
      ["CoreAuthority", "Routing"],
    ),
    component(
      "EL-AD-INPUT-GUARD",
      "Discovery Input and Privacy Guard",
      "EL-DEVRELAY-CORE",
      "Binds exact project, repository, policy, adapter-chain, options, and grant inputs.",
      [
        "Reject drift, substitutions, unresolved sources, ignored or undeclared content, and implicit external transmission",
        "Authorize only the exact local inventory and bounded analyzer invocations",
      ],
      [CG.inventory, CG.privacy, CG.provenance],
      ["CoreAuthority", "Security"],
    ),
    component(
      "EL-AD-NORMALIZER",
      "Discovery Observation Normalizer",
      "EL-DEVRELAY-CORE",
      "Normalizes inventory and analyzer observations into provider-neutral current-state findings.",
      [
        "Preserve observed, derived, inferred, unknown, and not-applicable dispositions",
        "Reject duplicate, contradictory, stale, unproven, or authority-expanding findings",
      ],
      [CG.provenance, CG.confidence, CG.auditability],
      ["CoreAuthority", "Validation"],
    ),
    component(
      "EL-AD-GAP-GATE",
      "Discovery Confidence and Gap Gate",
      "EL-DEVRELAY-CORE",
      "Evaluates material gaps separately from explicit non-blocking uncertainty.",
      [
        "Return needs_clarification for declared material gaps",
        "Preserve non-material low-confidence findings for explicit downstream Gate disposition",
      ],
      [CG.confidence, CG.boundary],
      ["CoreAuthority", "Gate"],
    ),
    component(
      "EL-AD-CHECKPOINT",
      "Discovery Checkpoint Controller",
      "EL-DEVRELAY-CORE",
      "Persists exact inventory and analyzer results before canonical projection.",
      [
        "Bind effect checkpoints to invocation, repository state, adapter, configuration, and step",
        "Replay successful and non-success results without reinvoking tools",
      ],
      [CG.replay, CG.auditability],
      ["CoreAuthority", "Checkpoint"],
    ),
    component(
      "EL-AD-TRACEABILITY",
      "Current Architecture Traceability Contributor",
      "EL-DEVRELAY-GRAPH",
      "Projects validated observational current-state lineage without approved-design claims.",
      [
        "Link the repository snapshot and source evidence to discovered architecture entities",
        "Create only declared forward observational relationships and atomic merge proof",
      ],
      [CG.provenance, CG.boundary, CG.auditability],
      ["TraceabilityContributor", "Candidate"],
    ),
  );

  const relations = [
    ["REL-AD-ROUTER-GUARD", "EL-AD-ROUTER", "EL-AD-INPUT-GUARD", "Releases one exact existing-undiscovered project state for discovery input validation.", [CG.routing, CG.privacy]],
    ["REL-AD-GUARD-INVENTORY", "EL-AD-INPUT-GUARD", "EL-AD-INVENTORY-PORT", "Authorizes the mandatory local inventory over the exact declared repository surface.", [CG.inventory, CG.privacy]],
    ["REL-AD-INVENTORY-NATIVE", "EL-AD-INVENTORY-PORT", "EL-AD-NATIVE-INVENTORY", "Invokes the version-pinned native repository inventory capability.", [CG.inventory, CG.provenance]],
    ["REL-AD-GUARD-ANALYZER", "EL-AD-INPUT-GUARD", "EL-AD-ANALYZER-PORT", "Authorizes only configured optional analyzer context slices and grants.", [CG.privacy, CG.provenance]],
    ["REL-AD-INVENTORY-CHECKPOINT", "EL-AD-INVENTORY-PORT", "EL-AD-CHECKPOINT", "Persists exact mandatory inventory observations before normalization.", [CG.inventory, CG.replay]],
    ["REL-AD-ANALYZER-CHECKPOINT", "EL-AD-ANALYZER-PORT", "EL-AD-CHECKPOINT", "Persists each bounded analyzer result or failure before normalization.", [CG.provenance, CG.replay]],
    ["REL-AD-CHECKPOINT-NORMALIZER", "EL-AD-CHECKPOINT", "EL-AD-NORMALIZER", "Supplies replay-verified native observations for canonical current-state normalization.", [CG.replay, CG.auditability]],
    ["REL-AD-NORMALIZER-GAP", "EL-AD-NORMALIZER", "EL-AD-GAP-GATE", "Supplies explicit findings, confidence, contradictions, unknowns, and candidate gaps.", [CG.confidence, CG.provenance]],
    ["REL-AD-GAP-TRACE", "EL-AD-GAP-GATE", "EL-AD-TRACEABILITY", "Supplies only a validated non-blocking observational snapshot for traceability projection.", [CG.confidence, CG.boundary]],
  ];
  model.relationships.push(
    ...relations.map(([id, source, target, description, ids]) =>
      relationship(id, source, target, description, ids),
    ),
  );

  const viewFor = ({
    viewKey,
    type,
    title,
    purpose,
    audience,
    scopeElementId,
    elementIds,
  }) => {
    const included = new Set(elementIds);
    return {
      viewKey,
      type,
      title,
      purpose,
      audience,
      scopeElementId,
      elementIds,
      relationshipIds: model.relationships
        .filter(
          ({ sourceElementId, targetElementId }) =>
            included.has(sourceElementId) && included.has(targetElementId),
        )
        .map(({ id }) => id),
    };
  };
  const priorViews = baseSections.diagrams.content.views.map(
    ({ renderings: _renderings, ...view }) => structuredClone(view),
  );
  const diagramViewSpecs = [
    ...priorViews,
    viewFor({
      viewKey: "VIEW-AD-CONTAINERS",
      type: "container",
      title: "DevRelay ArchitectureDiscovery containers",
      purpose:
        "Show ArchitectureDiscovery beside Generic Core and TraceabilityGraph.",
      audience: ["engineering", "architecture", "workflow-authors"],
      scopeElementId: "EL-DEVRELAY-SYSTEM",
      elementIds: model.elements
        .filter(
          ({ type, parentId }) =>
            type === "container" && parentId === "EL-DEVRELAY-SYSTEM",
        )
        .map(({ id }) => id),
    }),
    viewFor({
      viewKey: "VIEW-AD-CORE-COMPONENTS",
      type: "component",
      title: "Generic Core discovery authority",
      purpose:
        "Show routing, privacy/input validation, normalization, gap policy, and checkpoint authority.",
      audience: ["engineering", "architecture", "security"],
      scopeElementId: "EL-DEVRELAY-CORE",
      elementIds: [
        "EL-AD-ROUTER",
        "EL-AD-INPUT-GUARD",
        "EL-AD-NORMALIZER",
        "EL-AD-GAP-GATE",
        "EL-AD-CHECKPOINT",
      ],
    }),
    viewFor({
      viewKey: "VIEW-AD-MODULE-COMPONENTS",
      type: "component",
      title: "ArchitectureDiscovery adapter boundary",
      purpose:
        "Show the mandatory native inventory and optional analyzer contribution ports.",
      audience: ["engineering", "adapter-authors"],
      scopeElementId: "EL-AD-MODULE",
      elementIds: [
        "EL-AD-INVENTORY-PORT",
        "EL-AD-NATIVE-INVENTORY",
        "EL-AD-ANALYZER-PORT",
      ],
    }),
    viewFor({
      viewKey: "VIEW-AD-TRACEABILITY-COMPONENTS",
      type: "component",
      title: "Current architecture traceability",
      purpose:
        "Show observational source-to-architecture lineage without intended-design claims.",
      audience: ["engineering", "audit"],
      scopeElementId: "EL-DEVRELAY-GRAPH",
      elementIds: ["EL-AD-TRACEABILITY"],
    }),
  ];

  const scope = {
    level: "change",
    boundary:
      "ArchitectureDiscovery for one exact existing-undiscovered repository snapshot.",
    in: [
      "Deterministic project-state route",
      "Exact repository and project context",
      "Mandatory local native inventory",
      "Optional bounded analyzer observations",
      "Provider-neutral observation normalization",
      "Confidence, contradiction, and material-gap evaluation",
      "CurrentArchitectureSnapshot and observational traceability",
    ],
    out: [
      "Intended architecture design or baseline promotion",
      "Requirement, contract, work, code, test, or verification generation",
      "Unbounded repository access or implicit external source transmission",
      "Analyzer-authored completeness, Gate, progression, or graph claims",
    ],
  };
  const openSpecDesign = [
    "# ArchitectureDiscovery design",
    "",
    "## Decision",
    "",
    "Core routes only existing-undiscovered state into one ordered discovery chain. A mandatory version-pinned native adapter inventories the exact allowed local repository surface. Optional analyzers contribute bounded observations through a separate port. Core checkpoints every native result, normalizes dispositions and provenance, evaluates material gaps, and returns one observational CurrentArchitectureSnapshot.",
    "",
    "## Authority boundary",
    "",
    "Discovery cannot propose intended architecture or promote a baseline. Material gaps return needs_clarification. Non-material low-confidence findings remain visible for ArchitectureDesign and explicit Gate disposition. External source transmission is disabled unless exact policy and grants opt in.",
    "",
    "## Consequences",
    "",
    "The minimum snapshot remains available without specialized tooling, analyzer bindings remain replaceable, and downstream design receives current-state evidence without confusing inference with approval.",
  ].join("\n");

  const interfaces = structuredClone(
    baseSections.interfaceIntent.content.interfaces,
  );
  const specs = [
    ["IF-AD-ROUTING", "Existing-system discovery route", "EL-AD-ROUTER", ["EL-AD-INPUT-GUARD"], ["ProjectArchitectureState", "RequirementsBaseline and ProjectOverviewBaseline", "RepositorySnapshot"], ["Validated existing-undiscovered discovery subject or deterministic bypass/rejection"], [CG.routing, CG.boundary], "Conflicting, stale, caller-forced, already-discovered, baselined, or greenfield state cannot enter discovery.", ["Core loads exact state and never delegates route selection to an adapter."]],
    ["IF-AD-INVENTORY", "Mandatory deterministic local repository inventory", "EL-AD-INVENTORY-PORT", ["EL-AD-NATIVE-INVENTORY"], ["Exact repository revision and declared file surface", "Ignore, exclusion, secret, symlink, submodule, and transmission policy", "Version-pinned adapter configuration and grants"], ["NativeRepositoryInventory with exact file, manifest, language, build, package, and boundary observations"], [CG.inventory, CG.privacy, CG.provenance], "Drift, denied access, excluded content, malformed observations, or incomplete minimum inventory returns a durable non-success result.", ["Default execution is offline; content cannot leave the host without exact opt-in policy and network grant."]],
    ["IF-AD-ANALYZER", "Optional bounded analyzer contribution", "EL-AD-ANALYZER-PORT", ["EL-AD-CHECKPOINT"], ["Explicit version-pinned context slice", "Analyzer binding, configuration, and grants", "Native inventory reference"], ["Bounded analyzer observations, native evidence, warnings, or explicit unavailable/failed disposition"], [CG.provenance, CG.confidence, CG.privacy], "Analyzer absence or failure cannot erase the native inventory; malformed or authority-expanding output is rejected.", ["Each analyzer receives only its declared context slice and cannot access Gate or graph services."]],
    ["IF-AD-NORMALIZATION", "Provider-neutral current-state observation normalization", "EL-AD-NORMALIZER", ["EL-AD-GAP-GATE"], ["Replay-verified native inventory and optional analyzer results", "Closed evidence disposition and confidence vocabulary"], ["Canonical architecture elements, relationships, interfaces, constraints, discovered decision records, provenance, confidence, gaps, and warnings"], [CG.provenance, CG.confidence, CG.auditability], "Duplicate, contradictory, stale, unresolved, cross-repository, unknown-disposition, or unproven observations fail closed.", ["Canonical findings preserve native evidence digests and never embed secret values."]],
    ["IF-AD-GAP-POLICY", "Material discovery gap evaluation", "EL-AD-GAP-GATE", ["EL-DEVRELAY-CORE", "EL-AD-TRACEABILITY"], ["Canonical findings, contradictions, unknowns, confidence, and configured materiality policy"], ["CurrentArchitectureSnapshot candidate, needs_clarification, unable_to_proceed, or baseline_drift"], [CG.confidence, CG.boundary], "Every material gap blocks; non-material uncertainty must remain explicit and cannot be silently upgraded to observed fact.", ["Gate diagnostics expose rationale and source identities without leaking excluded content."]],
    ["IF-AD-CHECKPOINT", "Discovery effect checkpoint and replay", "EL-AD-CHECKPOINT", ["EL-AD-NORMALIZER"], ["Exact invocation, repository state, adapter chain, step result bytes, and configuration"], ["Replay-verified inventory and analyzer results or corruption/substitution diagnostic"], [CG.replay, CG.auditability], "Changed repository, invocation, adapter, configuration, step, or bytes cannot reuse a checkpoint.", ["Checkpoint identity includes every effective permission and source boundary."]],
    ["IF-AD-TRACEABILITY", "Observational current-architecture traceability", "EL-AD-TRACEABILITY", ["EL-DEVRELAY-GRAPH"], ["Validated CurrentArchitectureSnapshot", "Exact repository and source evidence references"], ["Forward observational relationships and atomic merge proof"], [CG.provenance, CG.boundary, CG.auditability], "Non-success, unresolved source, arbitrary edge, approved-design claim, graph drift, or duplicate fact rejects the merge.", ["Trusted contributor accepts no adapter-authored graph operations."]],
  ];
  for (const [id, name, provider, consumers, inputs, outputs, ids, failure, security] of specs) {
    interfaces.push(
      interfaceIntent({
        id,
        name,
        provider,
        consumers,
        inputs,
        outputs,
        requirementIds: ids,
        failure,
        security,
      }),
    );
  }

  const constraints = structuredClone(
    baseSections.architectureConstraints.content.constraints,
  );
  const constraintSpecs = [
    ["CON-AD-CONDITIONAL-ROUTE", "organizational", "Only exact existing-undiscovered state enters ArchitectureDiscovery; callers and adapters cannot force discovery or bypass a required snapshot.", [{ kind: "element", id: "EL-AD-ROUTER" }, { kind: "interface", id: "IF-AD-ROUTING" }], [CG.routing]],
    ["CON-AD-MANDATORY-NATIVE", "operational", "Every discovery run completes the version-pinned native local inventory before optional analyzer observations can contribute.", [{ kind: "element", id: "EL-AD-NATIVE-INVENTORY" }, { kind: "interface", id: "IF-AD-INVENTORY" }], [CG.inventory]],
    ["CON-AD-OPTIONAL-ANALYZERS", "organizational", "Specialized analyzers contribute bounded observations only; their absence, failure, or identity cannot redefine the canonical minimum inventory contract.", [{ kind: "element", id: "EL-AD-ANALYZER-PORT" }, { kind: "interface", id: "IF-AD-ANALYZER" }], [CG.provenance, CG.confidence]],
    ["CON-AD-MATERIAL-GAPS", "operational", "Every declared material discovery gap blocks ArchitectureDesign while non-material uncertainty remains explicit for Gate disposition.", [{ kind: "element", id: "EL-AD-GAP-GATE" }, { kind: "interface", id: "IF-AD-GAP-POLICY" }], [CG.confidence]],
    ["CON-AD-LOCAL-PRIVACY", "security", "Default analysis is offline over tracked or explicitly declared files, respects ignore and secret policy, and requires exact opt-in before source content leaves the host.", [{ kind: "element", id: "EL-AD-INPUT-GUARD" }, { kind: "interface", id: "IF-AD-INVENTORY" }], [CG.privacy]],
    ["CON-AD-OBSERVATIONAL-ONLY", "organizational", "CurrentArchitectureSnapshot records implemented current-state evidence and uncertainty but cannot claim intended architecture, approved decisions, or ArchitectureBaseline promotion.", [{ kind: "element", id: "EL-AD-NORMALIZER" }, { kind: "element", id: "EL-AD-TRACEABILITY" }], [CG.boundary, CG.provenance]],
    ["CON-AD-TRACEABILITY-AUTHORITY", "organizational", "Only the trusted contributor derives observational graph updates from a validated snapshot; adapters cannot choose nodes, edges, scopes, or graph operations.", [{ kind: "element", id: "EL-AD-TRACEABILITY" }], [CG.provenance, CG.boundary]],
  ];
  for (const [id, category, statement, appliesTo, ids] of constraintSpecs) {
    constraints.push(archConstraint(id, category, statement, appliesTo, ids));
  }

  const technicalDesign = {
    technicalDesignId: "TD-AD-001",
    objective:
      "Produce one deterministic, evidence-bound observational CurrentArchitectureSnapshot for an exact existing-undiscovered repository without transferring design or Gate authority to discovery adapters.",
    scope,
    problemSummary:
      "ArchitectureDesign cannot safely establish a baseline for an existing implementation when its current components, dependencies, interfaces, constraints, and uncertainty are unknown.",
    solutionSummary:
      "Core routes exact state, validates a local-first discovery plan, invokes a mandatory native inventory and optional bounded analyzers, checkpoints native results, normalizes evidence and confidence, blocks material gaps, and projects observational traceability.",
    requirementsDrivers: [
      "Conditional existing-undiscovered routing",
      "Mandatory deterministic native inventory",
      "Optional replaceable analyzers",
      "Exact provenance and confidence",
      "Material-gap blocking",
      "Offline tracked-or-declared repository boundary",
      "Zero-call checkpoint replay",
      "Observational output only",
    ],
    behaviorFlows: [
      "Core validates exact ProjectArchitectureState, baselines, repository snapshot, policies, adapter chain, options, and grants.",
      "The host verifies repository revision/tree identity and resolves the allowed local file surface.",
      "The native inventory adapter produces the deterministic minimum observation set.",
      "Configured optional analyzers receive only declared context slices and return bounded observations or explicit non-success.",
      "Every native result is checkpointed before normalization.",
      "Core normalizes evidence dispositions, confidence, contradictions, unknowns, native provenance, and candidate gaps.",
      "Material gaps return needs_clarification; otherwise one CurrentArchitectureSnapshot candidate is validated.",
      "The trusted contributor merges observational lineage and ArchitectureDesign receives the snapshot as explicit input.",
    ],
    dataResponsibilities: [
      "DiscoverySubject binds project state, baselines, repository identity, policy, adapters, and grants.",
      "NativeRepositoryInventory records the stable minimum local observation set.",
      "AnalyzerObservationSet preserves bounded tool-native findings and provenance.",
      "DiscoveryFinding distinguishes observed, derived, inferred, unknown, and not-applicable evidence.",
      "DiscoveryGap records materiality, rationale, sources, and required clarification.",
      "CurrentArchitectureSnapshot binds normalized current state, confidence, gaps, warnings, native artifacts, and exact source references.",
    ],
    failureHandling: [
      "Route or repository drift stops before adapter invocation.",
      "Excluded or unauthorized content access fails closed.",
      "Optional analyzer failure remains explicit and cannot remove native inventory evidence.",
      "Contradictory or material missing evidence returns needs_clarification.",
      "Exact replay reuses completed checkpoints without adapter calls.",
    ],
    securityPrivacy: [
      "External host enforces filesystem, process, network, and secret grants.",
      "Default policy analyzes tracked or declared files offline and respects ignore/exclusion rules.",
      "Source content leaves the host only under explicit version-pinned policy and network grant.",
      "Native evidence redaction preserves original digest and transformation provenance.",
    ],
    performanceReliabilityOperability: [
      "Independent optional analyzers may execute in parallel after mandatory inventory.",
      "Canonical sorting removes analyzer completion-order nondeterminism.",
      "Exact checkpoints prevent duplicate analyzer effects.",
      "Closed gap, confidence, drift, denial, and adapter diagnostics make every blocked transition observable.",
    ],
    compatibilityMigrationRollout: [
      "V1 ships a provider-neutral inventory port and live native local inventory target.",
      "dependency-cruiser, SCIP, and future analyzers bind through the optional observation port.",
      "Adapter maturity remains explicit and no language or analyzer identity enters Core semantics.",
      "ArchitectureDiscovery becomes mandatory circuit inventory only after full release verification and integration.",
    ],
    verificationIntent: [
      "Test every ProjectArchitectureState route and caller-forced selection.",
      "Test tracked, declared, ignored, generated, secret-like, symlink, submodule, and drifted repository inputs.",
      "Test mandatory inventory with optional analyzers present, absent, failed, reordered, and substituted.",
      "Test observed, derived, inferred, unknown, not-applicable, contradictory, material, and non-material findings.",
      "Test implicit and explicit external source transmission policies.",
      "Test exact checkpoint replay with zero inventory and analyzer calls.",
      "Test observational traceability and reject intended-design or adapter-authored graph claims.",
    ],
    interfaceIntentIds: interfaces
      .filter(({ id }) => id.startsWith("IF-AD-"))
      .map(({ id }) => id),
    constraintIds: constraints
      .filter(({ id }) => id.startsWith("CON-AD-"))
      .map(({ id }) => id),
    sourceRequirementIds: uniq(Object.values(CG)),
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-AD-001", "Require a deterministic native inventory in every discovery run", "OPT-AD-MANDATORY-NATIVE", "OPT-AD-ANALYZER-DEFINES-MINIMUM", [CG.inventory], [{ kind: "constraint", id: "CON-AD-MANDATORY-NATIVE" }]],
    ["ADR-AD-002", "Expose specialized discovery as optional bounded analyzer contributions", "OPT-AD-OPTIONAL-ANALYZERS", "OPT-AD-ANALYZERS-IN-CORE", [CG.provenance, CG.confidence], [{ kind: "element", id: "EL-AD-ANALYZER-PORT" }]],
    ["ADR-AD-003", "Block only material gaps and preserve all other uncertainty", "OPT-AD-MATERIALITY-GATE", "OPT-AD-BLOCK-ALL-UNKNOWN", [CG.confidence], [{ kind: "constraint", id: "CON-AD-MATERIAL-GAPS" }]],
    ["ADR-AD-004", "Use offline tracked-or-declared analysis by default", "OPT-AD-LOCAL-FIRST", "OPT-AD-IMPLICIT-EXTERNAL-ANALYSIS", [CG.privacy], [{ kind: "constraint", id: "CON-AD-LOCAL-PRIVACY" }]],
    ["ADR-AD-005", "Keep current-state discovery observational and separate from intended architecture", "OPT-AD-SNAPSHOT-NOT-BASELINE", "OPT-AD-DISCOVERY-PROMOTES-ARCHITECTURE", [CG.boundary], [{ kind: "constraint", id: "CON-AD-OBSERVATIONAL-ONLY" }]],
  ];
  const decisions = decisionSpecs.map(
    ([id, title, chosen, rejected, reqs, targets]) => ({
      id,
      title,
      chosen,
      rejected,
      requirements: reqs,
      targets,
      supersedes: [],
    }),
  );
  const assumptions = [
    {
      id: "ASM-AD-HOST-BOUNDARY",
      statement:
        "The external host can enumerate the exact allowed repository surface and enforce filesystem, process, network, and secret policy.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-AD-NATIVE-MINIMUM",
      statement:
        "The native inventory can produce a useful minimum snapshot without language-specific analyzer availability.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-AD-DESIGN-DOWNSTREAM",
      statement:
        "ArchitectureDesign consumes the validated snapshot and remains the only module that proposes intended architecture.",
      status: "confirmed",
      blocking: false,
    },
  ];
  const risks = [
    { id: "RISK-AD-ANALYZER-SILENCE", statement: "Analyzer silence may be mistaken for proof of absence.", impact: "The snapshot could omit material architecture facts.", mitigation: "Require native minimum coverage and explicit unavailable, failed, unknown, confidence, and material-gap dispositions." },
    { id: "RISK-AD-INFERENCE-AS-FACT", statement: "Analyzer inference may be mistaken for direct observation or approved design.", impact: "ArchitectureDesign could baseline an unsupported assumption.", mitigation: "Preserve evidence disposition, confidence, provenance, and observational-only authority in every finding." },
    { id: "RISK-AD-SOURCE-EXPOSURE", statement: "Discovery may inspect or transmit ignored, generated, proprietary, or secret-bearing content.", impact: "Security and privacy boundaries could be violated.", mitigation: "Default to offline tracked-or-declared scope with host-enforced exclusions and explicit transmission opt-in." },
    { id: "RISK-AD-REPOSITORY-DRIFT", statement: "Repository content may change during or after discovery.", impact: "The snapshot could claim architecture for different bytes.", mitigation: "Bind every input and result to exact revision/tree/content digests and reject drift before progression." },
    { id: "RISK-AD-PROVIDER-LEAK", statement: "Language-specific analyzer concepts may leak into canonical contracts.", impact: "Module semantics and downstream design become tool-coupled.", mitigation: "Normalize through closed provider-neutral finding contracts and retain native content only as evidence attachments." },
  ];

  const alreadyDesignedTargets = new Map();
  for (const [kind, items] of [
    ["element", baseSections.architectureModel.content.elements],
    ["relationship", baseSections.architectureModel.content.relationships],
    ["interface", baseSections.interfaceIntent.content.interfaces],
    ["constraint", baseSections.architectureConstraints.content.constraints],
    ["decision", baseSections.decisionRecords.content.decisions],
  ]) {
    for (const item of items) {
      for (const requirementId of item.sourceRequirementIds ?? []) {
        const targets = alreadyDesignedTargets.get(requirementId) ?? [];
        targets.push({ kind, id: item.id });
        alreadyDesignedTargets.set(requirementId, targets);
      }
    }
  }
  alreadyDesignedTargets.set("US-DEV-SPECIFY-001", [
    { kind: "element", id: "EL-WB-MODULE" },
  ]);
  alreadyDesignedTargets.set("NFR-DEV-DETERMINISM-001", [
    { kind: "element", id: "EL-DEVRELAY-CORE" },
  ]);
  alreadyDesignedTargets.set("NFR-DEV-PORTABILITY-001", [
    { kind: "element", id: "EL-WB-ADAPTER-PORT" },
  ]);
  return {
    CG,
    allNormativeIds,
    alreadyDesignedTargets,
    baseSections,
    model,
    scope,
    openSpecDesign,
    diagramViewSpecs,
    decisionSpecs: decisions,
    technicalDesign,
    interfaces,
    constraints,
    assumptions,
    risks,
    uniq,
  };
}

const uniq = (...values) => [...new Set(values.flat())];

function architectureElement({
  id,
  name,
  type,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
  tags,
}) {
  return {
    id,
    name,
    type,
    ...(parentId === undefined ? {} : { parentId }),
    description,
    technology:
      type === "software-system" ? "" : "Provider-neutral DevRelay desktop runtime",
    responsibilities,
    tags,
    properties: {},
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}

function component(
  id,
  name,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
  tags = [],
) {
  return architectureElement({
    id,
    name,
    type: "component",
    parentId,
    description,
    responsibilities,
    sourceRequirementIds,
    tags: ["Component", ...tags],
  });
}

function relationship(
  id,
  sourceElementId,
  targetElementId,
  description,
  sourceRequirementIds,
) {
  return {
    id,
    sourceElementId,
    targetElementId,
    description,
    interactionStyle: "synchronous",
    tags: [],
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}

function interfaceIntent({
  id,
  name,
  providerElementId,
  consumerElementIds,
  inputs,
  outputs,
  requirementIds,
  failureBehavior,
  securityPrivacyIntent,
}) {
  return {
    id,
    name,
    purpose: name,
    ownerBoundary: providerElementId,
    providerElementId,
    consumerElementIds,
    interactionStyle: "synchronous",
    semanticInputs: inputs,
    semanticOutputs: outputs,
    protocolConstraints: [
      "Exact artifact versions and SHA-256 digests",
      "Canonical provider-neutral inputs and outputs",
      "Core-owned routing, Gate, checkpoint, and graph authority",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Remain compatible with supported ChatGPT Desktop, Codex CLI, and Node versions",
      "Unknown fields, unsupported protocol versions, and stale identities fail closed",
    ],
    securityPrivacyIntent,
    deliveryConsistencyIntent: [
      "Validate exact bytes before effects or progression",
      "Persist effect checkpoints and task identities before reporting success",
    ],
    contractGeneration: {
      required: true,
      suggestedKinds: ["json-schema"],
    },
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

function constraint(id, category, statement, appliesTo, requirementIds) {
  return {
    id,
    category,
    strength: "must",
    statement,
    rationale: statement,
    appliesTo,
    verificationIntent:
      "Dedicated positive, negative, drift, replay, Windows compatibility, permission, and clean-install conformance evidence.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildDesktopRuntimeArchitecture({
  architectureBaseline,
  requirements,
}) {
  const DEV = Object.freeze({
    extend: "US-DEV-EXTEND-001",
    orchestrate: "US-DEV-ORCHESTRATE-001",
    specify: "US-DEV-SPECIFY-001",
    verify: "US-DEV-VERIFY-001",
    deterministic: "NFR-DEV-DETERMINISM-001",
    portable: "NFR-DEV-PORTABILITY-001",
    traceable: "NFR-DEV-TRACEABILITY-001",
    artifacts: "CON-DEV-ARTIFACT-CONTRACTS-001",
    gates: "CON-DEV-GATE-SEPARATION-001",
    inventory: "CON-DEV-MODULE-INVENTORY-001",
    neutral: "CON-DEV-PROVIDER-NEUTRAL-001",
  });
  const DESKTOP = Object.freeze({
    runtime: "US-DEV-DESKTOP-RUNTIME-001",
    deterministic: "NFR-DEV-DESKTOP-DETERMINISM-001",
    isolation: "NFR-DEV-DESKTOP-ISOLATION-001",
    windows: "NFR-DEV-DESKTOP-WINDOWS-COMPATIBILITY-001",
    coreAuthority: "CON-DEV-DESKTOP-CORE-AUTHORITY-001",
    localFirst: "CON-DEV-DESKTOP-LOCAL-FIRST-001",
    releasePath: "CON-DEV-DESKTOP-RELEASE-PATH-001",
  });
  const requiredIds = [...Object.values(DEV), ...Object.values(DESKTOP)];
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missingIds = requiredIds.filter((id) => !declaredIds.has(id));
  if (missingIds.length !== 0) {
    throw new Error(
      `Architecture drivers are absent from the approved requirements: ${missingIds.join(", ")}.`,
    );
  }

  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-DESKTOP-RUNTIME-001";

  const allDesktopRequirements = Object.values(DESKTOP);
  model.elements.push(
    architectureElement({
      id: "EL-DESKTOP-HOST",
      name: "ChatGPT Desktop Windows Host",
      type: "container",
      parentId: "EL-DEVRELAY-SYSTEM",
      description:
        "Local host boundary that packages DevRelay for ChatGPT Desktop and supervises bounded Codex work-item tasks.",
      responsibilities: [
        "Install and expose the DevRelay workflow plugin through a repository marketplace",
        "Bridge typed Desktop interactions to deterministic DevRelay Core operations",
        "Create one Codex app-server task for each Core-derived ready work item",
        "Persist run, task, checkpoint, and handoff identities for restart-safe resume",
      ],
      sourceRequirementIds: allDesktopRequirements,
      tags: ["Container", "Windows", "ChatGPTDesktop"],
    }),
    component(
      "EL-DESKTOP-PLUGIN",
      "DevRelay Desktop Plugin",
      "EL-DESKTOP-HOST",
      "Repository-owned plugin package with workflow skill and local MCP declaration.",
      [
        "Expose the human-facing goal-to-acceptance workflow in ChatGPT Desktop",
        "Carry installation, upgrade, rollback, and uninstall metadata",
      ],
      [DESKTOP.runtime, DESKTOP.windows, DESKTOP.releasePath],
      ["Plugin"],
    ),
    component(
      "EL-DESKTOP-MCP-BRIDGE",
      "Typed STDIO MCP Bridge",
      "EL-DESKTOP-HOST",
      "Bounded local protocol surface over deterministic Core operations.",
      [
        "Validate typed run, clarification, Gate, progression, resume, and evidence requests",
        "Return artifact references and diagnostics without accepting caller-authored authority",
      ],
      [
        DESKTOP.runtime,
        DESKTOP.deterministic,
        DESKTOP.coreAuthority,
        DESKTOP.localFirst,
      ],
      ["MCP", "STDIO"],
    ),
    component(
      "EL-DESKTOP-TASK-SUPERVISOR",
      "Codex Task Supervisor",
      "EL-DESKTOP-HOST",
      "Host adapter that maps each approved ready work item to one Codex app-server task and immutable attempt.",
      [
        "Start and resume one task per exact work-item attempt",
        "Persist thread and turn identities before accepting execution output",
        "Preserve raw handoff bytes for downstream validation",
      ],
      [
        DESKTOP.runtime,
        DESKTOP.deterministic,
        DESKTOP.isolation,
        DESKTOP.coreAuthority,
      ],
      ["CodexAppServer", "WorkExecution"],
    ),
    component(
      "EL-DESKTOP-APP-SERVER-CLIENT",
      "Codex App Server Client",
      "EL-DESKTOP-HOST",
      "Version-pinned JSON-RPC client for thread, turn, approval, and event lifecycles.",
      [
        "Negotiate the supported app-server protocol",
        "Create or resume tasks and stream typed task events",
        "Surface host approval and interruption states without fabricating completion",
      ],
      [DESKTOP.runtime, DESKTOP.isolation, DESKTOP.windows],
      ["JSONRPC", "Codex"],
    ),
    component(
      "EL-DESKTOP-RUN-STORE",
      "Durable Desktop Run Store",
      "EL-DESKTOP-HOST",
      "Local content-addressed state for runs, task attempts, checkpoints, raw handoffs, and installation identity.",
      [
        "Persist exact bytes atomically before effect acknowledgement",
        "Detect divergent replay, stale baselines, and duplicate integration identities",
        "Support restart-safe Desktop and MCP process recovery",
      ],
      [
        DESKTOP.deterministic,
        DESKTOP.localFirst,
        DESKTOP.windows,
      ],
      ["Persistence"],
    ),
    component(
      "EL-DESKTOP-CAPABILITY-RESOLVER",
      "Desktop Capability Resolver",
      "EL-DESKTOP-HOST",
      "Resolves the release circuit to evidence-backed live bindings and labels optional alternatives honestly.",
      [
        "Require one release-ready binding for every mandatory lifecycle capability",
        "Expose contract-defined, fixture-conformant, live-conformant, and release-ready maturity",
      ],
      [DESKTOP.runtime, DESKTOP.releasePath, DEV.extend, DEV.neutral],
      ["CapabilityCatalog"],
    ),
    component(
      "EL-DESKTOP-INSTALL-CONTROLLER",
      "Local Marketplace Install Controller",
      "EL-DESKTOP-HOST",
      "Validates and manages repository marketplace installation lifecycle on Windows.",
      [
        "Validate plugin and marketplace manifests before installation",
        "Record installed source revision and support rollback and uninstall",
      ],
      [DESKTOP.runtime, DESKTOP.windows, DESKTOP.releasePath],
      ["Marketplace"],
    ),
  );

  model.relationships.push(
    relationship(
      "REL-DESKTOP-PLUGIN-MCP",
      "EL-DESKTOP-PLUGIN",
      "EL-DESKTOP-MCP-BRIDGE",
      "Invokes typed local DevRelay tools from the workflow skill.",
      [DESKTOP.runtime, DESKTOP.coreAuthority],
    ),
    relationship(
      "REL-DESKTOP-MCP-CORE",
      "EL-DESKTOP-MCP-BRIDGE",
      "EL-DEVRELAY-CORE",
      "Submits validated commands while Core selects routes, Gates, and progression.",
      [DESKTOP.runtime, DESKTOP.deterministic, DESKTOP.coreAuthority],
    ),
    relationship(
      "REL-DESKTOP-CORE-SUPERVISOR",
      "EL-RUN-FRONTIER-RESOLVER",
      "EL-DESKTOP-TASK-SUPERVISOR",
      "Provides an exact Core-derived ready frontier and approved assignments.",
      [DESKTOP.runtime, DESKTOP.deterministic, DESKTOP.coreAuthority],
    ),
    relationship(
      "REL-DESKTOP-SUPERVISOR-APP-SERVER",
      "EL-DESKTOP-TASK-SUPERVISOR",
      "EL-DESKTOP-APP-SERVER-CLIENT",
      "Creates or resumes one isolated Codex task per work-item attempt.",
      [DESKTOP.runtime, DESKTOP.isolation, DESKTOP.windows],
    ),
    relationship(
      "REL-DESKTOP-SUPERVISOR-WE",
      "EL-DESKTOP-TASK-SUPERVISOR",
      "EL-WE-CODEX-TASK-ADAPTER",
      "Returns raw attempt observations and handoff bytes to WorkExecution.",
      [DESKTOP.runtime, DESKTOP.coreAuthority, DESKTOP.isolation],
    ),
    relationship(
      "REL-DESKTOP-MCP-STORE",
      "EL-DESKTOP-MCP-BRIDGE",
      "EL-DESKTOP-RUN-STORE",
      "Persists exact command, checkpoint, approval, and response bytes.",
      [DESKTOP.deterministic, DESKTOP.localFirst],
    ),
    relationship(
      "REL-DESKTOP-SUPERVISOR-STORE",
      "EL-DESKTOP-TASK-SUPERVISOR",
      "EL-DESKTOP-RUN-STORE",
      "Persists thread, turn, attempt, event, and raw handoff identities.",
      [DESKTOP.deterministic, DESKTOP.isolation],
    ),
    relationship(
      "REL-DESKTOP-CAPABILITY-CORE",
      "EL-DESKTOP-CAPABILITY-RESOLVER",
      "EL-DEVRELAY-CORE",
      "Supplies an evidence-backed configured binding set before run creation.",
      [DESKTOP.releasePath, DEV.neutral],
    ),
    relationship(
      "REL-DESKTOP-INSTALL-PLUGIN",
      "EL-DESKTOP-INSTALL-CONTROLLER",
      "EL-DESKTOP-PLUGIN",
      "Installs, upgrades, rolls back, or removes one validated plugin revision.",
      [DESKTOP.windows, DESKTOP.releasePath],
    ),
    relationship(
      "REL-DESKTOP-PLUGIN-REPORT",
      "EL-DESKTOP-PLUGIN",
      "EL-RUN-REPORT-PORT",
      "Reads the current sourced human-readable lifecycle report.",
      [DESKTOP.runtime, DEV.traceable],
    ),
  );

  const desktopElementIds = model.elements
    .filter(({ id }) => id.startsWith("EL-DESKTOP-"))
    .map(({ id }) => id);
  const topLevelContainerIds = model.elements
    .filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM")
    .map(({ id }) => id);
  const diagramViewSpecs = [
    ...structuredClone(baseSections.diagrams.content.views),
    {
      viewKey: "VIEW-DESKTOP-CONTAINERS",
      type: "container",
      title: "ChatGPT Desktop release boundary",
      purpose:
        "DevRelay top-level containers including the ChatGPT Desktop Windows host.",
      audience: ["engineering", "architecture", "workflow-authors"],
      scopeElementId: "EL-DEVRELAY-SYSTEM",
      elementIds: topLevelContainerIds,
      relationshipIds: model.relationships
        .filter(({ sourceElementId, targetElementId }) =>
          topLevelContainerIds.includes(sourceElementId) &&
          topLevelContainerIds.includes(targetElementId),
        )
        .map(({ id }) => id),
    },
    {
      viewKey: "VIEW-DESKTOP-HOST-COMPONENTS",
      type: "component",
      title: "ChatGPT Desktop host components",
      purpose:
        "Local plugin, MCP, task supervision, durable state, capability resolution, and installation boundaries.",
      audience: ["engineering", "architecture", "operators"],
      scopeElementId: "EL-DESKTOP-HOST",
      elementIds: desktopElementIds.filter((id) => id !== "EL-DESKTOP-HOST"),
      relationshipIds: model.relationships
        .filter(({ sourceElementId, targetElementId }) =>
          desktopElementIds.includes(sourceElementId) &&
          desktopElementIds.includes(targetElementId),
        )
        .map(({ id }) => id),
    },
  ];

  const scope = {
    level: "change",
    boundary:
      "ChatGPT Desktop on Windows release host over the approved deterministic DevRelay lifecycle.",
    in: [
      "Repository-backed local marketplace plugin and workflow skill",
      "Typed local STDIO MCP bridge over Core-owned operations",
      "Codex app-server task supervision with one task per ready work item",
      "Durable content-addressed run, checkpoint, task, and handoff state",
      "Evidence-backed capability and adapter maturity resolution",
      "Windows installation, upgrade, rollback, uninstall, and clean-install proof",
      "JSON-schema contract intent for every new structured host boundary",
    ],
    out: [
      "Public plugin-directory publication or public npm publication",
      "A hosted DevRelay backend or WSL dependency",
      "Making every optional external adapter live-conformant",
      "Allowing the Desktop plugin, MCP caller, model, or task to select routes, approve Gates, mutate TraceabilityGraph, or integrate its own work",
      "Deployment, production monitoring, and operational lifecycle extensions",
    ],
  };

  const openSpecDesign = `# ChatGPT Desktop Windows runtime design

## Context

DevRelay is already a deterministic provider-neutral lifecycle library, but its controlled release is not directly usable through ChatGPT Desktop. The release host must expose the complete workflow without becoming a second authority or a coding-agent wrapper.

## Decision

Ship a repository-backed local marketplace plugin containing a workflow skill and local STDIO MCP server. The MCP bridge delegates typed operations to DevRelay Core. A Codex app-server task supervisor creates one task for each Core-derived runnable work item, persists exact task and handoff identity, and returns all results to WorkExecution, WorkItemVerification, and ChangeIntegration. A local content-addressed run store supports restart-safe replay. Capability resolution requires one release-ready binding per mandatory module while preserving honest maturity labels for alternatives.

## Contract consequence

Desktop command, task lifecycle, durable run state, capability resolution, installation, and human-readable run access interfaces require provider-neutral JSON Schema contracts before WorkBreakdown.

## Boundaries

The plugin, MCP tools, app-server tasks, implementation models, and optional adapters cannot select lifecycle routes, satisfy Gates, mutate TraceabilityGraph directly, self-verify, or self-integrate. V1 is Windows-local and does not claim public directory publication, a hosted backend, or universal live adapter interoperability.
`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({
      id: "IF-DESKTOP-MCP-COMMANDS",
      name: "Typed Desktop lifecycle commands",
      providerElementId: "EL-DESKTOP-MCP-BRIDGE",
      consumerElementIds: ["EL-DEVRELAY-CORE"],
      inputs: [
        "Exact run identity, operation request, artifact references, approvals, and host observations",
      ],
      outputs: [
        "Validated Core result, artifact references, Gate state, diagnostics, and next action",
      ],
      requirementIds: [
        DESKTOP.runtime,
        DESKTOP.deterministic,
        DESKTOP.coreAuthority,
        DESKTOP.localFirst,
      ],
      failureBehavior:
        "Reject malformed, stale, caller-authoritative, cross-run, or noncanonical requests before invoking Core or persisting an effect.",
      securityPrivacyIntent: [
        "STDIO is local; filesystem, process, network, and secret demands remain explicit host-enforced grants",
      ],
    }),
    interfaceIntent({
      id: "IF-DESKTOP-TASK-LIFECYCLE",
      name: "Codex work-item task lifecycle",
      providerElementId: "EL-DESKTOP-TASK-SUPERVISOR",
      consumerElementIds: [
        "EL-DESKTOP-APP-SERVER-CLIENT",
        "EL-WE-CODEX-TASK-ADAPTER",
      ],
      inputs: [
        "Exact ready WorkItem, approved assignment, immutable context bundle, permission demands, and predecessor handoffs",
      ],
      outputs: [
        "Persisted thread and turn identity, raw events, terminal attempt result, and exact raw handoff bytes",
      ],
      requirementIds: [
        DESKTOP.runtime,
        DESKTOP.deterministic,
        DESKTOP.isolation,
        DESKTOP.coreAuthority,
        DESKTOP.windows,
      ],
      failureBehavior:
        "Interrupted tasks remain resumable; stale, duplicated, malformed, cross-work-item, or authority-bearing results fail before verification.",
      securityPrivacyIntent: [
        "Each attempt receives only its declared workspace, context, tools, and host-enforced permissions",
      ],
    }),
    interfaceIntent({
      id: "IF-DESKTOP-RUN-STATE",
      name: "Durable Desktop run state",
      providerElementId: "EL-DESKTOP-RUN-STORE",
      consumerElementIds: [
        "EL-DESKTOP-MCP-BRIDGE",
        "EL-DESKTOP-TASK-SUPERVISOR",
        "EL-DEVRELAY-CORE",
      ],
      inputs: [
        "Canonical run artifacts, checkpoints, task identities, raw handoffs, effect observations, and graph proofs",
      ],
      outputs: [
        "Atomic content-addressed receipt, current checkpoint, and exact replay bytes",
      ],
      requirementIds: [
        DESKTOP.deterministic,
        DESKTOP.localFirst,
        DESKTOP.windows,
      ],
      failureBehavior:
        "Divergent duplicate identity, corrupt bytes, stale lineage, or failed atomic persistence stops progression and never repeats an uncertain effect.",
      securityPrivacyIntent: [
        "State is local, run-scoped, path-safe, and excludes undeclared secrets or transmitted source",
      ],
    }),
    interfaceIntent({
      id: "IF-DESKTOP-CAPABILITY-RESOLUTION",
      name: "Release capability resolution",
      providerElementId: "EL-DESKTOP-CAPABILITY-RESOLVER",
      consumerElementIds: ["EL-DEVRELAY-CORE"],
      inputs: [
        "Configured circuit, module catalog, adapter catalog, maturity evidence, host capabilities, and policies",
      ],
      outputs: [
        "Exact compatible binding set or explicit missing-live-capability diagnostic",
      ],
      requirementIds: [
        DESKTOP.runtime,
        DESKTOP.releasePath,
        DEV.extend,
        DEV.neutral,
      ],
      failureBehavior:
        "A mandatory capability without a release-ready compatible binding blocks run creation; fixture conformance is never promoted to live conformance.",
      securityPrivacyIntent: [
        "Capability metadata cannot grant runtime authority or permissions",
      ],
    }),
    interfaceIntent({
      id: "IF-DESKTOP-INSTALLATION",
      name: "Local marketplace installation lifecycle",
      providerElementId: "EL-DESKTOP-INSTALL-CONTROLLER",
      consumerElementIds: ["EL-DESKTOP-PLUGIN"],
      inputs: [
        "Repository marketplace source, plugin manifest, package revision, target installation, and requested operation",
      ],
      outputs: [
        "Validated install, upgrade, rollback, uninstall, or diagnostic receipt",
      ],
      requirementIds: [
        DESKTOP.runtime,
        DESKTOP.windows,
        DESKTOP.releasePath,
      ],
      failureBehavior:
        "Invalid manifests, unsupported host versions, drifted source revisions, or ambiguous installed state fail before activation.",
      securityPrivacyIntent: [
        "Installation writes only to declared plugin and marketplace locations and records the exact source revision",
      ],
    }),
    interfaceIntent({
      id: "IF-DESKTOP-RUN-VIEW",
      name: "Desktop lifecycle run view",
      providerElementId: "EL-RUN-REPORT-PORT",
      consumerElementIds: ["EL-DESKTOP-PLUGIN"],
      inputs: ["Exact run identity, report policy, and current run-ledger checkpoint"],
      outputs: [
        "Human-readable active stage, outcome, artifacts, Gate state, frontier, tasks, evidence, traceability diagnostics, and sourced performance",
      ],
      requirementIds: [DESKTOP.runtime, DEV.traceable],
      failureBehavior:
        "Missing or policy-denied observations remain explicit and the view cannot mutate workflow state.",
      securityPrivacyIntent: [
        "Apply existing deterministic report content policy before returning Desktop-visible text",
      ],
    }),
  );

  const constraints = structuredClone(
    baseSections.architectureConstraints.content.constraints,
  );
  constraints.push(
    constraint(
      "CON-DESKTOP-CORE-AUTHORITY",
      "organizational",
      "Only DevRelay Core selects routes, evaluates deterministic Gates, validates traceability updates, derives ready frontiers, and authorizes progression; Desktop host components are bounded adapters.",
      [
        { kind: "element", id: "EL-DESKTOP-MCP-BRIDGE" },
        { kind: "element", id: "EL-DESKTOP-TASK-SUPERVISOR" },
        { kind: "element", id: "EL-DEVRELAY-CORE" },
      ],
      [DESKTOP.runtime, DESKTOP.coreAuthority, DEV.gates],
    ),
    constraint(
      "CON-DESKTOP-LOCAL-PRIVACY",
      "security",
      "The V1 orchestration bridge and durable state remain local on Windows; source or secrets leave the configured ChatGPT/Codex host boundary only after exact explicit opt-in.",
      [
        { kind: "element", id: "EL-DESKTOP-MCP-BRIDGE" },
        { kind: "element", id: "EL-DESKTOP-RUN-STORE" },
      ],
      [DESKTOP.localFirst, DESKTOP.isolation, DESKTOP.windows],
    ),
    constraint(
      "CON-DESKTOP-TASK-ISOLATION",
      "security",
      "Every Codex task is bound to one immutable work-item attempt, context bundle, workspace, and host-enforced grant set and cannot approve, verify, schedule, or integrate itself.",
      [
        { kind: "element", id: "EL-DESKTOP-TASK-SUPERVISOR" },
        { kind: "interface", id: "IF-DESKTOP-TASK-LIFECYCLE" },
      ],
      [DESKTOP.runtime, DESKTOP.isolation, DESKTOP.coreAuthority],
    ),
    constraint(
      "CON-DESKTOP-DETERMINISTIC-RESUME",
      "availability",
      "Exact inputs and checkpoints reproduce byte-identical Core outputs and zero duplicate checkpointed effects across Desktop, MCP, and app-server restarts.",
      [
        { kind: "element", id: "EL-DESKTOP-RUN-STORE" },
        { kind: "interface", id: "IF-DESKTOP-RUN-STATE" },
      ],
      [DESKTOP.deterministic, DESKTOP.windows],
    ),
    constraint(
      "CON-DESKTOP-LIVE-PATH",
      "compatibility",
      "The release circuit resolves every mandatory lifecycle capability to one release-ready executable binding while optional alternatives retain their evidence-backed maturity label.",
      [
        { kind: "element", id: "EL-DESKTOP-CAPABILITY-RESOLVER" },
        { kind: "interface", id: "IF-DESKTOP-CAPABILITY-RESOLUTION" },
      ],
      [DESKTOP.runtime, DESKTOP.releasePath, DEV.extend, DEV.neutral],
    ),
    constraint(
      "CON-DESKTOP-WINDOWS-RELEASE",
      "compatibility",
      "The controlled release is installable and executable through ChatGPT Desktop on Windows with supported Node and Codex CLI versions and no WSL, hosted-backend, or second-IDE dependency.",
      [
        { kind: "element", id: "EL-DESKTOP-HOST" },
        { kind: "element", id: "EL-DESKTOP-INSTALL-CONTROLLER" },
      ],
      [DESKTOP.runtime, DESKTOP.windows, DESKTOP.releasePath],
    ),
  );

  const technicalDesign = {
    technicalDesignId: "TD-DESKTOP-RUNTIME-001",
    objective:
      "Make the complete deterministic DevRelay lifecycle directly usable through ChatGPT Desktop on Windows without transferring workflow authority to the host or model.",
    scope,
    problemSummary:
      "The released library and module contracts are not yet packaged as an installable Desktop workflow, and the current host path does not create and supervise one isolated Codex task per ready work item.",
    solutionSummary:
      "Package a repository marketplace plugin with a workflow skill and typed local STDIO MCP bridge, add a Codex app-server task supervisor, persist exact run and task state locally, resolve one release-ready binding per mandatory capability, and prove the path through a clean-install end-to-end run.",
    requirementsDrivers: [
      "Use DevRelay from ChatGPT Desktop on Windows from Goal through BusinessAcceptance.",
      "Keep Core deterministic and authoritative while implementation engines remain interchangeable.",
      "Create one independently traceable task per ready work item.",
      "Resume after process interruption without repeating checkpointed effects.",
      "Ship one honest live reference path while maturity-labelling alternatives.",
      "Install, upgrade, roll back, and uninstall locally from the repository marketplace.",
    ],
    behaviorFlows: [
      "The user invokes the installed DevRelay workflow skill and starts or resumes one content-addressed run through the local MCP bridge.",
      "Core executes planning modules and Gates using exact configured bindings and records artifacts, graph updates, and run facts.",
      "Core derives a ready frontier; the task supervisor creates one app-server task per work-item attempt and persists thread and turn identity.",
      "Each task returns raw handoff bytes to WorkExecution; downstream verification and integration remain separate Core-controlled steps.",
      "After each verified integration Core recalculates readiness from the static dependency DAG and integrated-completion facts.",
      "SystemVerification and owner BusinessAcceptance close the run and the Desktop view renders the exact evidence chain.",
    ],
    dataResponsibilities: [
      "DesktopRunState owns run identity, current lifecycle checkpoint, exact bindings, and durable artifact references.",
      "CodexTaskAttempt owns work-item, assignment, thread, turn, predecessor, grants, raw events, and handoff lineage.",
      "DesktopCapabilityResolution owns compatible binding selection and maturity evidence without granting authority.",
      "PluginInstallationReceipt owns source revision, target, operation, and resulting installed identity.",
      "Existing ModuleExecutionRecord, TraceabilityGraph, and LifecycleRunReport remain canonical workflow evidence.",
    ],
    failureHandling: [
      "Malformed, stale, caller-authoritative, or cross-run MCP requests fail before Core execution.",
      "Interrupted app-server tasks remain resumable and cannot be interpreted as completed handoffs.",
      "Prepared or uncertain effects require trusted reconciliation rather than blind reinvocation.",
      "Missing release-ready mandatory bindings block run creation with explicit diagnostics.",
      "Invalid installation state blocks activation and preserves the last known exact installed revision.",
    ],
    securityPrivacy: [
      "Use local STDIO and local durable storage by default.",
      "Require explicit host-enforced grants for filesystem, process, network, and secret access.",
      "Constrain each work-item task to its exact workspace and context bundle.",
      "Require explicit opt-in before external source or secret transmission.",
    ],
    performanceReliabilityOperability: [
      "Content-addressed checkpoints permit zero-call replay across Desktop and MCP restarts.",
      "One task per work item preserves independent evidence and permits safe parallel frontiers.",
      "Run reporting continuously exposes stage, Gate, frontier, task, retry, evidence, and traceability state.",
      "Protocol and host compatibility are pinned and verified during installation and release tests.",
    ],
    compatibilityMigrationRollout: [
      "V1 targets ChatGPT Desktop on Windows, supported Node, and local Codex app-server.",
      "The MCP contract remains provider-neutral and versioned so future hosts can implement the same boundary.",
      "Optional external adapters remain selectable only at their evidence-backed maturity.",
      "Clean-install proof precedes release acceptance; public directory and hosted deployment remain later extensions.",
    ],
    verificationIntent: [
      "Validate plugin and marketplace manifests and test install, upgrade, rollback, and uninstall.",
      "Exercise every MCP command with positive, negative, stale, authority, and replay cases.",
      "Run serial and parallel frontiers with one task per item and independent handoff validation.",
      "Interrupt Desktop, MCP, and app-server at every effect boundary and prove resume without duplicate effects.",
      "Execute one clean-install real-feature lifecycle through every mandatory module and Gate.",
      "Reconcile Git history, tests, graph, run ledger, evidence, SystemVerification, and BusinessAcceptance.",
    ],
    interfaceIntentIds: interfaces
      .filter(({ id }) => id.startsWith("IF-DESKTOP-"))
      .map(({ id }) => id),
    constraintIds: constraints
      .filter(({ id }) => id.startsWith("CON-DESKTOP-"))
      .map(({ id }) => id),
    sourceRequirementIds: uniq(
      allDesktopRequirements,
      DEV.extend,
      DEV.orchestrate,
      DEV.verify,
      DEV.deterministic,
      DEV.portable,
      DEV.traceable,
      DEV.artifacts,
      DEV.gates,
      DEV.inventory,
      DEV.neutral,
    ),
    sourceRefs: [],
  };

  const decisionSpecs = [
    {
      id: "ADR-DESKTOP-001",
      title: "Distribute V1 through a repository local marketplace plugin",
      chosen: "OPT-DESKTOP-REPOSITORY-MARKETPLACE",
      rejected: "OPT-DESKTOP-PUBLIC-DIRECTORY-FIRST",
      requirements: [DESKTOP.runtime, DESKTOP.windows, DESKTOP.releasePath],
      targets: [
        { kind: "element", id: "EL-DESKTOP-PLUGIN" },
        { kind: "element", id: "EL-DESKTOP-INSTALL-CONTROLLER" },
        { kind: "constraint", id: "CON-DESKTOP-WINDOWS-RELEASE" },
      ],
    },
    {
      id: "ADR-DESKTOP-002",
      title: "Expose Core through a typed local STDIO MCP bridge",
      chosen: "OPT-DESKTOP-LOCAL-STDIO-MCP",
      rejected: "OPT-DESKTOP-HOSTED-ORCHESTRATION-API",
      requirements: [
        DESKTOP.runtime,
        DESKTOP.coreAuthority,
        DESKTOP.localFirst,
      ],
      targets: [
        { kind: "element", id: "EL-DESKTOP-MCP-BRIDGE" },
        { kind: "interface", id: "IF-DESKTOP-MCP-COMMANDS" },
        { kind: "constraint", id: "CON-DESKTOP-CORE-AUTHORITY" },
      ],
    },
    {
      id: "ADR-DESKTOP-003",
      title: "Create one Codex app-server task per ready work item",
      chosen: "OPT-DESKTOP-ONE-TASK-PER-WORK-ITEM",
      rejected: "OPT-DESKTOP-SINGLE-GIANT-IMPLEMENTATION-TURN",
      requirements: [
        DESKTOP.runtime,
        DESKTOP.isolation,
        DESKTOP.coreAuthority,
      ],
      targets: [
        { kind: "element", id: "EL-DESKTOP-TASK-SUPERVISOR" },
        { kind: "interface", id: "IF-DESKTOP-TASK-LIFECYCLE" },
        { kind: "constraint", id: "CON-DESKTOP-TASK-ISOLATION" },
      ],
    },
    {
      id: "ADR-DESKTOP-004",
      title: "Persist local content-addressed Desktop run state",
      chosen: "OPT-DESKTOP-DURABLE-LOCAL-RUN-STORE",
      rejected: "OPT-DESKTOP-CONVERSATIONAL-MEMORY",
      requirements: [
        DESKTOP.deterministic,
        DESKTOP.localFirst,
        DESKTOP.windows,
      ],
      targets: [
        { kind: "element", id: "EL-DESKTOP-RUN-STORE" },
        { kind: "interface", id: "IF-DESKTOP-RUN-STATE" },
        { kind: "constraint", id: "CON-DESKTOP-DETERMINISTIC-RESUME" },
      ],
    },
    {
      id: "ADR-DESKTOP-005",
      title: "Release one complete live path and maturity-label alternatives",
      chosen: "OPT-DESKTOP-ONE-RELEASE-READY-PATH",
      rejected: "OPT-DESKTOP-ALL-ADAPTERS-LIVE-BEFORE-RELEASE",
      requirements: [DESKTOP.runtime, DESKTOP.releasePath, DEV.extend, DEV.neutral],
      targets: [
        { kind: "element", id: "EL-DESKTOP-CAPABILITY-RESOLVER" },
        { kind: "interface", id: "IF-DESKTOP-CAPABILITY-RESOLUTION" },
        { kind: "constraint", id: "CON-DESKTOP-LIVE-PATH" },
      ],
    },
  ].map((entry) => ({ ...entry, supersedes: [] }));

  const assumptions = [
    {
      id: "ASM-DESKTOP-HOST-CURRENT",
      statement:
        "The supported release host is the current ChatGPT Desktop for Windows with local STDIO MCP and Codex app-server capabilities documented by OpenAI.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-DESKTOP-CONTROLLED-DISTRIBUTION",
      statement:
        "A repository-backed local marketplace installation is sufficient for V1 release readiness; public directory publication is not required.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-DESKTOP-LIVE-PATH",
      statement:
        "Release readiness requires one live executable binding per mandatory capability and one clean-install real-feature run; optional alternatives may remain maturity-labelled.",
      status: "confirmed",
      blocking: false,
    },
  ];
  const risks = [
    {
      id: "RISK-DESKTOP-AUTHORITY-LEAK",
      statement:
        "Desktop commands or work-item tasks could accidentally acquire routing, Gate, graph, verification, or integration authority.",
      impact:
        "The host would become an improvisational coding-agent wrapper and invalidate deterministic workflow guarantees.",
      mitigation:
        "Use narrow typed ports, Core-owned decisions, immutable attempt contracts, negative authority tests, and separate verification and integration.",
    },
    {
      id: "RISK-DESKTOP-PROTOCOL-DRIFT",
      statement:
        "ChatGPT Desktop, Codex CLI, plugin, MCP, or app-server protocol versions may drift.",
      impact:
        "Installation or task execution could fail or silently change behavior on Windows.",
      mitigation:
        "Pin supported versions, negotiate protocols, fail closed on incompatibility, and run clean-install conformance in release verification.",
    },
    {
      id: "RISK-DESKTOP-UNCERTAIN-EFFECT",
      statement:
        "A Desktop, MCP, or app-server interruption may occur after an effect but before its acknowledgement.",
      impact:
        "Blind retry could duplicate tasks, approvals, or integration effects.",
      mitigation:
        "Persist prepared checkpoints, task identities, and trusted observations; reconcile uncertain effects before retry.",
    },
    {
      id: "RISK-DESKTOP-SOURCE-EXPOSURE",
      statement:
        "Host or adapter behavior could transmit repository content or secrets outside the approved boundary.",
      impact:
        "Proprietary code or credentials could be disclosed.",
      mitigation:
        "Default to local STDIO and local state, require explicit grants and transmission opt-in, and exercise path, network, and secret-denial tests.",
    },
    {
      id: "RISK-DESKTOP-FALSE-MATURITY",
      statement:
        "Fixture-conformant optional adapters could be presented as live release-ready integrations.",
      impact:
        "Users could select nonfunctional bindings and mistake test fixtures for interoperability proof.",
      mitigation:
        "Resolve mandatory capabilities through evidence-backed maturity and fail release inventory when the live path is incomplete.",
    },
  ];
  const alreadyDesignedTargets = new Map([
    [DEV.specify, [{ kind: "element", id: "EL-WB-MODULE" }]],
    [DEV.portable, [{ kind: "element", id: "EL-WB-ADAPTER-PORT" }]],
  ]);

  return {
    DEV,
    DESKTOP,
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

const uniq = (...values) => [...new Set(values.flat())];

function element({ id, name, type, parentId, description, responsibilities, sourceRequirementIds, tags = [] }) {
  return {
    id, name, type,
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
const relationship = (id, sourceElementId, targetElementId, description, requirements) => ({
  id, sourceElementId, targetElementId, description, interactionStyle: "synchronous", tags: [], sourceRequirementIds: uniq(requirements), sourceRefs: [],
});

function interfaceIntent({ id, name, provider, consumers, inputs, outputs, requirements, failure, security }) {
  return {
    id, name, purpose: name, ownerBoundary: provider, providerElementId: provider,
    consumerElementIds: consumers, interactionStyle: "synchronous",
    semanticInputs: inputs, semanticOutputs: outputs,
    protocolConstraints: ["Exact artifact versions and content digests", "Canonical provider-neutral semantics", "Explicit authority and failure dispositions"],
    failureBehavior: failure,
    compatibilityObligations: ["Stable canonical behavior on ChatGPT/Codex Desktop for Windows", "Missing, stale, conflicting, or unverified memory fails closed"],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: ["Validate canonical bytes before progression", "Preserve exact candidates, provider receipts, approvals, supersession, and checkpoints"],
    contractGeneration: { required: true, suggestedKinds: ["json-schema"] },
    sourceRequirementIds: uniq(requirements), sourceRefs: [],
  };
}

function constraint(id, category, statement, appliesTo, requirements) {
  return {
    id, category, strength: "must", statement, rationale: statement, appliesTo,
    verificationIntent: "Dedicated positive, negative, drift, conflict, replay, provider-failure, privacy, concurrency, and Windows Desktop conformance fixtures.",
    sourceRequirementIds: uniq(requirements), sourceRefs: [],
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

export function buildProjectMemoryArchitecture({ architectureBaseline, requirements }) {
  const PM = Object.freeze({
    conclude: "US-DEV-MEMORY-CONCLUDE-001",
    context: "US-DEV-MEMORY-CONTEXT-001",
    trace: "US-DEV-MEMORY-TRACE-001",
    mem0: "US-DEV-MEM0-001",
    project: "US-DEV-PROJECT-MEMORY-001",
    bootstrap: "US-DEV-SESSION-BOOTSTRAP-001",
    accuracy: "NFR-PM-ACCURACY-001",
    deterministic: "NFR-PM-DETERMINISM-001",
    performance: "NFR-PM-PERFORMANCE-001",
    security: "NFR-PM-SECURITY-001",
    usability: "NFR-PM-USABILITY-001",
    authority: "CON-PM-AUTHORITY-001",
    domain: "CON-PM-DOMAIN-001",
    host: "CON-PM-HOST-001",
    traceBoundary: "CON-PM-TRACE-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(PM).filter((id) => !declaredIds.has(id));
  if (missing.length) throw new Error(`PM-001 architecture drivers are absent: ${missing.join(", ")}`);

  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const newNormativeIds = Object.values(PM);
  const baseSections = architectureBaseline.sections;
  const alreadyDesignedTargets = baselineCoverage(baseSections, allNormativeIds);
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-PM-001";

  model.elements.push(
    container("EL-PM-PROJECT-MEMORY", "ProjectMemory", "Cross-cutting semantic module for exact project context retrieval and candidate memory updates.", ["Load approved project context", "Normalize provider retrieval", "Propose bounded memory deltas without promotion authority"], [PM.context, PM.project, PM.authority, PM.domain], ["SemanticModule"]),
    component("EL-PM-ROUTER", "Memory Operation Router", "EL-PM-PROJECT-MEMORY", "Selects load-context, propose-update, refresh-context, or conclude-session from explicit state and invocation.", ["Reject implicit operation selection", "Route recovery for unconcluded sessions"], [PM.context, PM.conclude, PM.deterministic]),
    component("EL-PM-NATIVE-ENGINE", "Native Memory Baseline Engine", "EL-PM-PROJECT-MEMORY", "Reads exact local baselines and creates canonical candidate deltas.", ["Apply authority-before-recency ordering", "Detect conflicts and supersession", "Preserve source locators"], [PM.project, PM.accuracy, PM.deterministic, PM.security]),
    component("EL-PM-PROVIDER-PORT", "Memory Provider Port", "EL-PM-PROJECT-MEMORY", "Defines bounded retrieval and indexing capabilities for replaceable providers.", ["Validate provider maturity and grants", "Archive retrieval/index receipts", "Normalize provider output"], [PM.context, PM.mem0, PM.security, PM.authority]),
    component("EL-PM-MEM0-ADAPTER", "Mem0 Adapter", "EL-PM-PROJECT-MEMORY", "Uses Mem0 for derived local session and module-scoped retrieval/indexing without authoritative storage or graph access.", ["Namespace project, session, module, and invocation identities", "Return citations and deterministic receipts", "Remain optional and fail-closed"], [PM.context, PM.mem0, PM.project, PM.trace, PM.security, PM.domain]),
    component("EL-PM-CONTEXT-ASSEMBLER", "Memory Context Assembler", "EL-PM-PROJECT-MEMORY", "Combines authoritative project memory, recent session context, provider retrieval, and trace projection into one bounded handoff.", ["Enforce authority over recency", "Prefer recent session facts only within equal authority", "Emit exact context bundle"], [PM.context, PM.trace, PM.accuracy, PM.performance]),
    component("EL-PM-GATE", "ProjectMemory Gate", "EL-DEVRELAY-CORE", "Validates exact candidate bytes, conflicts, closure, owner disposition, and baseline drift before promotion.", ["Promote qualitative changes only with exact owner approval", "Permit validated status-only updates", "Reject inaccurate memory"], [PM.conclude, PM.project, PM.accuracy, PM.authority]),
    component("EL-PM-CONCLUDE", "Conclusion Coordinator", "EL-DEVRELAY-CORE", "Implements the idempotent /conclude transition for main and worker tasks.", ["Collect task state and evidence", "Show add/replace/supersede/retain/reject delta", "Serialize parent promotion after worker completion", "Issue ConcludeReceipt"], [PM.conclude, PM.accuracy, PM.deterministic, PM.usability]),
    component("EL-PM-SYNOPSIS", "Current Synopsis Projector", "EL-DEVRELAY-CORE", "Renders CurrentSynopsis.md as a concise deterministic full-coverage projection of ProjectMemoryBaseline.", ["Generate UTF-8 NFC LF bytes", "Bind projection digest to baseline", "Provide the first semantic handoff for fresh tasks"], [PM.context, PM.project, PM.bootstrap, PM.usability]),
    component("EL-PM-TRACE-PROJECTOR", "Traceability Context Projector", "EL-DEVRELAY-CORE", "Builds a bounded read-only memory context from the approved TraceabilityGraph checkpoint.", ["Select relevant lifecycle nodes and edges", "Bind graph version and checkpoint", "Prevent provider graph access"], [PM.trace, PM.accuracy, PM.traceBoundary]),
    component("EL-PM-TRACE-CONTRIBUTOR", "Memory Traceability Contributor", "EL-DEVRELAY-CORE", "Derives approved memory lineage and supersession relationships from promoted canonical artifacts.", ["Reject adapter-authored graph operations", "Merge only approved forward edges", "Record atomic merge proof"], [PM.trace, PM.authority, PM.traceBoundary]),
  );

  model.relationships.push(
    relationship("REL-PM-ROUTER-NATIVE", "EL-PM-ROUTER", "EL-PM-NATIVE-ENGINE", "Invokes deterministic local baseline loading and delta construction.", [PM.context, PM.project, PM.deterministic]),
    relationship("REL-PM-ROUTER-PROVIDER", "EL-PM-ROUTER", "EL-PM-PROVIDER-PORT", "Invokes a configured bounded provider capability.", [PM.context, PM.security, PM.authority]),
    relationship("REL-PM-PROVIDER-MEM0", "EL-PM-PROVIDER-PORT", "EL-PM-MEM0-ADAPTER", "Binds the V1 Mem0 retrieval and indexing adapter.", [PM.context, PM.domain, PM.security]),
    relationship("REL-PM-NATIVE-ASSEMBLER", "EL-PM-NATIVE-ENGINE", "EL-PM-CONTEXT-ASSEMBLER", "Supplies authoritative baseline facts and candidate deltas.", [PM.context, PM.project, PM.accuracy]),
    relationship("REL-PM-MEM0-ASSEMBLER", "EL-PM-MEM0-ADAPTER", "EL-PM-CONTEXT-ASSEMBLER", "Supplies derived cited retrieval results without authority.", [PM.context, PM.accuracy, PM.authority]),
    relationship("REL-PM-TRACE-ASSEMBLER", "EL-PM-TRACE-PROJECTOR", "EL-PM-CONTEXT-ASSEMBLER", "Supplies a checkpoint-bound read-only lifecycle projection.", [PM.trace, PM.traceBoundary, PM.accuracy]),
    relationship("REL-PM-ASSEMBLER-BOOTSTRAP", "EL-PM-CONTEXT-ASSEMBLER", "EL-RM-SESSION-BOOTSTRAP", "Makes CurrentSynopsis and exact project memory the first semantic context loaded by configured fresh tasks.", [PM.context, PM.bootstrap, PM.performance]),
    relationship("REL-PM-CONCLUDE-GATE", "EL-PM-CONCLUDE", "EL-PM-GATE", "Submits an explicit candidate delta and user disposition for validation.", [PM.conclude, PM.accuracy, PM.authority]),
    relationship("REL-PM-GATE-SYNOPSIS", "EL-PM-GATE", "EL-PM-SYNOPSIS", "Atomically promotes the baseline and matching synopsis projection.", [PM.project, PM.deterministic, PM.usability]),
    relationship("REL-PM-GATE-TRACE", "EL-PM-GATE", "EL-PM-TRACE-CONTRIBUTOR", "Supplies only approved canonical memory changes for graph contribution.", [PM.trace, PM.authority, PM.traceBoundary]),
    relationship("REL-PM-TRACE-CONTRIBUTOR-PROJECTOR", "EL-PM-TRACE-CONTRIBUTOR", "EL-PM-TRACE-PROJECTOR", "Makes the resulting approved graph checkpoint available to later context projections.", [PM.trace, PM.deterministic]),
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
    viewFor({ viewKey: "VIEW-PM-CONTAINERS", type: "container", title: "PM-001 top-level containers", purpose: "Show ProjectMemory beside existing DevRelay containers.", scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-PM-MODULE-COMPONENTS", type: "component", title: "ProjectMemory components", purpose: "Show native, provider, Mem0, and context assembly boundaries.", scopeElementId: "EL-PM-PROJECT-MEMORY", elementIds: children("EL-PM-PROJECT-MEMORY") }),
    viewFor({ viewKey: "VIEW-PM-CORE-COMPONENTS", type: "component", title: "ProjectMemory Core services", purpose: "Show Gate, conclusion, synopsis, and trusted traceability authority.", scopeElementId: "EL-DEVRELAY-CORE", elementIds: children("EL-DEVRELAY-CORE").filter((id) => id.startsWith("EL-PM-")) }),
  ];

  const scope = {
    level: "change",
    boundary: "DevRelay PM-001 authoritative project memory, derived Mem0 retrieval, trace projection, and conclusion control.",
    in: ["ProjectMemoryBaseline", "CurrentSynopsis.md", "session and module-scoped derived retrieval", "Mem0 adapter", "mandatory fresh-task load", "module-boundary refresh", "MemoryUpdateCandidate", "ProjectMemoryGate", "/conclude", "ConcludeReceipt", "trusted traceability projection and contribution", "conflict and supersession semantics"],
    out: ["raw-chat authority", "provider-owned lifecycle state", "provider graph mutation", "cross-project retrieval by default", "automatic qualitative promotion", "undocumented tab-close hooks", "hosted backend"],
  };
  const openSpecDesign = `# DevRelay PM-001 ProjectMemory architecture change\n\n## Context\n\nDevRelay preserves lifecycle artifacts but lacks one authoritative cross-cutting memory baseline and deterministic task conclusion protocol.\n\n## Decision\n\nAdd ProjectMemory as a cross-cutting semantic module. Keep ProjectMemoryBaseline authoritative, render CurrentSynopsis.md as its first-loaded projection, use Mem0 only through a bounded provider port, and keep Gate, conclusion, and traceability authority in Core.\n\n## Authority\n\nModules and providers propose candidates only. Qualitative changes require exact user disposition and ProjectMemoryGate promotion. TraceabilityGraph is accessed only through trusted checkpoint-bound projections and contributors.\n\n## Failure behavior\n\nMissing, stale, conflicting, inaccurate, unconcluded, or provider-unverified memory blocks progression unless a verified equivalent native path satisfies the same contract.\n`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({ id: "IF-PM-CONTEXT-LOAD", name: "Project memory context load", provider: "EL-PM-PROJECT-MEMORY", consumers: ["EL-RM-SESSION-BOOTSTRAP", "EL-DEVRELAY-CORE"], inputs: ["Exact ProjectMemoryBaseline, CurrentSynopsis projection, session identity, module invocation identity, retrieval policy, and optional trace projection"], outputs: ["Bounded MemoryContextBundle, citations, provider receipt, freshness facts, and diagnostics"], requirements: [PM.context, PM.project, PM.bootstrap, PM.accuracy], failure: "Block on missing authority, projection drift, unresolved conflict, stale session, or unverifiable retrieval.", security: ["Local-only by default", "No source transmission without explicit opt-in"] }),
    interfaceIntent({ id: "IF-PM-CANDIDATE", name: "Memory update candidate", provider: "EL-PM-NATIVE-ENGINE", consumers: ["EL-PM-CONCLUDE", "EL-PM-GATE"], inputs: ["Completed module/task artifacts, decisions, status, evidence, existing memory identities, and exact source references"], outputs: ["Typed add, replace, supersede, retain, or reject proposal with rationale and conflicts"], requirements: [PM.conclude, PM.project, PM.accuracy, PM.deterministic], failure: "Reject raw-chat authority, ambiguous replacement, missing provenance, cross-domain unresolved deltas, or silent overwrite.", security: ["Modules cannot mutate memory"] }),
    interfaceIntent({ id: "IF-PM-PROVIDER", name: "Bounded memory provider", provider: "EL-PM-PROVIDER-PORT", consumers: ["EL-PM-MEM0-ADAPTER", "EL-PM-CONTEXT-ASSEMBLER"], inputs: ["Approved bounded context slice, namespace, query/index operation, local policy, grants, and version pin"], outputs: ["Cited retrieval or index receipt, provider version, command fingerprint, duration, and diagnostics"], requirements: [PM.context, PM.trace, PM.security, PM.domain], failure: "Fail closed on unavailable, uncited, cross-project, remote-unapproved, nondeterministic, or malformed provider behavior.", security: ["Provider has no Gate, baseline, or graph authority"] }),
    interfaceIntent({ id: "IF-PM-GATE", name: "ProjectMemoryGate promotion", provider: "EL-PM-GATE", consumers: ["EL-PM-SYNOPSIS", "EL-PM-TRACE-CONTRIBUTOR"], inputs: ["Exact candidate, current baseline, user disposition when qualitative, replay proof, provider receipts, and policy"], outputs: ["Atomic promotion proof, new baseline and synopsis references, graph checkpoint, or blocking diagnostics"], requirements: [PM.conclude, PM.project, PM.accuracy, PM.authority], failure: "Reject drift, substitution, conflict, missing qualitative approval, inaccurate memory, failed provider equivalence, or incomplete coverage.", security: ["Only exact approval-bound Core promotion changes authority"] }),
    interfaceIntent({ id: "IF-PM-CONCLUDE", name: "Task conclusion", provider: "EL-PM-CONCLUDE", consumers: ["EL-PM-GATE", "EL-DEVRELAY-CORE"], inputs: ["Task/session identity, current context receipt, completed work, evidence, pending decisions, worker handoffs, and memory candidate"], outputs: ["Displayed delta, user disposition when needed, ConcludeReceipt, updated synopsis binding, session terminal state, and recovery diagnostics"], requirements: [PM.conclude, PM.accuracy, PM.deterministic, PM.usability], failure: "Block a new configured task while the prior session remains unconcluded until resume, conclude, or explicit abandon.", security: ["Worker tasks cannot promote project memory; parent serialization is required"] }),
    interfaceIntent({ id: "IF-PM-SYNOPSIS", name: "CurrentSynopsis projection", provider: "EL-PM-SYNOPSIS", consumers: ["EL-RM-SESSION-BOOTSTRAP", "EL-PM-CONTEXT-ASSEMBLER"], inputs: ["Approved ProjectMemoryBaseline and deterministic projection policy"], outputs: ["Concise full-coverage UTF-8 NFC LF CurrentSynopsis.md and digest binding"], requirements: [PM.context, PM.project, PM.bootstrap, PM.usability], failure: "Reject projection drift, omitted authoritative direction, stale status, or independent Markdown edits.", security: ["Projection cannot add authority"] }),
    interfaceIntent({ id: "IF-PM-TRACE-PROJECTION", name: "Traceability memory projection", provider: "EL-PM-TRACE-PROJECTOR", consumers: ["EL-PM-CONTEXT-ASSEMBLER"], inputs: ["Approved graph checkpoint, task/module scope, lifecycle identities, and projection policy"], outputs: ["Bounded read-only lifecycle context with node/edge citations and graph version"], requirements: [PM.trace, PM.accuracy, PM.traceBoundary], failure: "Reject stale graph version, orphan citations, inverse authority, arbitrary query scope, or provider access to the graph service.", security: ["Core performs projection; Mem0 sees only the approved derived slice"] }),
    interfaceIntent({ id: "IF-PM-TRACE-CONTRIBUTION", name: "Memory traceability contribution", provider: "EL-PM-TRACE-CONTRIBUTOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Validated promoted memory baseline, supersession facts, source artifacts, and approval evidence"], outputs: ["Deterministic forward graph update, update digest, merge proof, and resulting checkpoint"], requirements: [PM.trace, PM.authority, PM.traceBoundary], failure: "Reject adapter-authored graph operations, unknown relationships, inverse edges, or unapproved qualitative facts.", security: ["Only trusted contributor vocabulary is permitted"] }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-PM-BASELINE-AUTHORITY", "data", "ProjectMemoryBaseline is authoritative; CurrentSynopsis.md, Mem0 indexes, session memory, and module retrieval are derived and rebuildable.", [{ kind: "element", id: "EL-PM-NATIVE-ENGINE" }, { kind: "element", id: "EL-PM-SYNOPSIS" }], [PM.project, PM.accuracy, PM.authority]),
    constraint("CON-PM-AUTHORITY-ORDER", "data", "Conflict resolution orders approved artifact authority before recency; recent session facts win only within equal authority and never silently overwrite.", [{ kind: "element", id: "EL-PM-CONTEXT-ASSEMBLER" }, { kind: "interface", id: "IF-PM-CANDIDATE" }], [PM.context, PM.accuracy, PM.deterministic]),
    constraint("CON-PM-LOCAL-DEFAULT", "security", "Memory storage, retrieval, embeddings, and inference remain local on Windows by default; any external transmission requires explicit operation-scoped opt-in.", [{ kind: "element", id: "EL-PM-MEM0-ADAPTER" }, { kind: "interface", id: "IF-PM-PROVIDER" }], [PM.security, PM.host, PM.domain]),
    constraint("CON-PM-GRAPH-BOUNDARY", "security", "Mem0 and all other adapters cannot access or mutate TraceabilityGraph; Core supplies only a validated checkpoint-bound projection.", [{ kind: "element", id: "EL-PM-TRACE-PROJECTOR" }, { kind: "element", id: "EL-PM-MEM0-ADAPTER" }], [PM.trace, PM.traceBoundary, PM.authority]),
    constraint("CON-PM-CONCLUSION-CLOSURE", "organizational", "Every terminal worker task concludes automatically into a parent-owned candidate; every terminal main task displays its exact delta and requires qualitative disposition before closure.", [{ kind: "element", id: "EL-PM-CONCLUDE" }, { kind: "interface", id: "IF-PM-CONCLUDE" }], [PM.conclude, PM.accuracy, PM.usability]),
    constraint("CON-PM-FRESH-TASK", "operational", "Every fresh configured DevRelay task loads and validates CurrentSynopsis and exact ProjectMemory context first; an unconcluded prior session blocks until resolved.", [{ kind: "element", id: "EL-PM-CONTEXT-ASSEMBLER" }, { kind: "interface", id: "IF-PM-CONTEXT-LOAD" }], [PM.context, PM.bootstrap, PM.accuracy, PM.host]),
    constraint("CON-PM-PERFORMANCE-BUDGET", "operational", "On the Windows reference host, warm authoritative context load p95 is at most 250 ms and bounded provider retrieval p95 is at most 750 ms, with duration and cache behavior receipted.", [{ kind: "element", id: "EL-PM-CONTEXT-ASSEMBLER" }, { kind: "element", id: "EL-PM-MEM0-ADAPTER" }], [PM.performance, PM.usability, PM.host]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-PM-001",
    objective: "Make accurate, current, traceable project memory the first context of every configured DevRelay task while preserving deterministic Core authority and replaceable providers.",
    scope,
    problemSummary: "Project direction and task conclusions can remain trapped in chats, while an external memory provider can become an inaccurate hidden authority.",
    solutionSummary: "Add ProjectMemoryBaseline, deterministic CurrentSynopsis, explicit candidate/Gate/conclude protocols, trusted trace projections, and a bounded local-first Mem0 adapter.",
    requirementsDrivers: ["Memory accuracy", "Mandatory fresh-task orientation", "Explicit qualitative approval", "Provider neutrality", "Local privacy", "Traceability", "Recoverable task conclusion"],
    behaviorFlows: ["Fresh configured task resolves any prior unconcluded session, then loads CurrentSynopsis and exact project memory before other modules.", "Core projects relevant TraceabilityGraph context and the provider returns cited derived retrieval.", "Each module emits typed MemoryUpdateCandidates without mutation authority.", "At task completion /conclude assembles and displays add/replace/supersede/retain/reject deltas.", "ProjectMemoryGate validates approval, replay, conflict, drift, and provider evidence before atomic promotion.", "Core regenerates CurrentSynopsis, merges trusted graph updates, and emits ConcludeReceipt."],
    dataResponsibilities: ["ProjectMemoryBaseline owns current durable qualitative direction, decisions, status, open work, assumptions, risks, and provenance.", "CurrentSynopsis.md is a deterministic compact full-coverage projection.", "Session memory owns current-task recency only.", "Module memory is invocation-scoped derived retrieval, not a durable agent identity.", "Mem0 indexes are derived and rebuildable.", "TraceabilityContextProjection is read-only and checkpoint-bound."],
    failureHandling: ["Missing or inaccurate authoritative memory blocks progression.", "Provider failure may continue only through a verified equivalent native path.", "Conflicting facts require explicit resolution.", "Cross-domain deltas route through the owning module and Gate.", "Unconcluded sessions require resume, conclude, or explicit abandon."],
    securityPrivacy: ["Local Windows storage and retrieval by default.", "No raw chat retention by default.", "External source/model/embedding transmission is explicit opt-in.", "Adapters cannot mutate baselines, Gates, or graph state.", "Project namespace isolation prevents cross-project retrieval."],
    performanceReliabilityOperability: ["Warm context load p95 <=250 ms.", "Bounded provider retrieval p95 <=750 ms.", "Idempotent conclude and checkpoint replay.", "Provider receipts record versions, duration, cache, inputs, and citations.", "All projections and candidate IDs are canonical and content-addressed."],
    compatibilityMigrationRollout: ["Introduce ProjectMemoryNotInitialized for existing projects.", "Establish the first baseline from current approved artifacts and owner decisions.", "Enable Mem0 only after live local conformance.", "Ship the Desktop /conclude skill/command and next-task recovery hook.", "Keep all lifecycle ModuleInvocation inputs explicit."],
    verificationIntent: ["Authority and provider-negative tests.", "Conflict, recency, supersession, and projection property tests.", "Mem0 local live conformance and unavailable-provider fallback tests.", "Trace projection and graph-mutation denial tests.", "Worker/main concurrency and idempotent conclude tests.", "Fresh-task/restart/unconcluded recovery Desktop end-to-end tests."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-PM-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-PM-")).map(({ id }) => id),
    sourceRequirementIds: newNormativeIds, sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-PM-001", "Keep ProjectMemoryBaseline authoritative and all provider state derived", "OPT-PM-CANONICAL-BASELINE", "OPT-PM-PROVIDER-AUTHORITY", [PM.project, PM.accuracy, PM.authority], [{ kind: "element", id: "EL-PM-NATIVE-ENGINE" }]],
    ["ADR-PM-002", "Use Mem0 through a bounded local-first provider port", "OPT-PM-BOUNDED-MEM0", "OPT-PM-DIRECT-MEM0", [PM.context, PM.security, PM.domain], [{ kind: "element", id: "EL-PM-MEM0-ADAPTER" }]],
    ["ADR-PM-003", "Load deterministic CurrentSynopsis before all other semantic context", "OPT-PM-SYNOPSIS-FIRST", "OPT-PM-CONVERSATION-FIRST", [PM.context, PM.project, PM.bootstrap, PM.usability], [{ kind: "element", id: "EL-PM-SYNOPSIS" }]],
    ["ADR-PM-004", "Require explicit qualitative delta disposition at conclusion", "OPT-PM-EXACT-DISPOSITION", "OPT-PM-AUTO-QUALITATIVE", [PM.conclude, PM.accuracy, PM.authority], [{ kind: "element", id: "EL-PM-CONCLUDE" }, { kind: "element", id: "EL-PM-GATE" }]],
    ["ADR-PM-005", "Project TraceabilityGraph through trusted Core services", "OPT-PM-TRUSTED-PROJECTION", "OPT-PM-PROVIDER-GRAPH-ACCESS", [PM.trace, PM.traceBoundary, PM.authority], [{ kind: "element", id: "EL-PM-TRACE-PROJECTOR" }]],
    ["ADR-PM-006", "Treat module memory as invocation-scoped retrieval rather than durable agents", "OPT-PM-INVOCATION-SCOPE", "OPT-PM-PER-MODULE-AGENT", [PM.context, PM.domain, PM.deterministic], [{ kind: "element", id: "EL-PM-CONTEXT-ASSEMBLER" }]],
    ["ADR-PM-007", "Use DevRelay-managed conclusion and recovery instead of an undocumented tab-close hook", "OPT-PM-MANAGED-CONCLUDE", "OPT-PM-TAB-CLOSE-HOOK", [PM.conclude, PM.host, PM.accuracy], [{ kind: "interface", id: "IF-PM-CONCLUDE" }]],
  ].map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-PM-BASELINE-CURRENT", statement: "The supplied approved architecture baseline is the exact current DevRelay design baseline for PM-001.", status: "confirmed", blocking: false },
    { id: "ASM-PM-WINDOWS-HOST", statement: "ChatGPT/Codex Desktop on Windows remains the release-defining interactive host.", status: "confirmed", blocking: false },
    { id: "ASM-PM-MEM0-LIVE-PENDING", statement: "Mem0 is approved as the V1 provider but cannot be claimed live-conformant until pinned local acquisition and conformance receipts pass.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-PM-HIDDEN-AUTHORITY", statement: "Retrieved memory can be mistaken for approved truth.", impact: "Modules may act on stale or invented direction.", mitigation: "Carry authority and citations, order approved artifacts before recency, and fail closed on conflict." },
    { id: "RISK-PM-PRIVACY", statement: "External embeddings or inference can transmit project content.", impact: "Source or decisions may leave the local workspace.", mitigation: "Local-only defaults and explicit operation-scoped opt-in with receipts." },
    { id: "RISK-PM-CONCLUSION-FRICTION", statement: "Mandatory conclusion can feel repetitive.", impact: "Users may bypass the workflow.", mitigation: "Show one compact delta wave, auto-handle status-only changes, and keep conclusion idempotent." },
    { id: "RISK-PM-CONCURRENCY", statement: "Parallel workers can propose conflicting memory changes.", impact: "Project memory may lose causal order.", mitigation: "Workers emit candidates only; the parent serializes and presents one consolidated delta." },
    { id: "RISK-PM-PROVIDER-DRIFT", statement: "Mem0 behavior or storage formats can change.", impact: "Retrieval may cease to be reproducible.", mitigation: "Pin versions, record receipts, maintain native equivalence tests, and rebuild derived indexes." },
  ];

  return { DEV: {}, RUN: { inspect: PM.context, deterministic: PM.deterministic }, PM, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope, openSpecDesign, diagramViewSpecs, decisionSpecs, technicalDesign, interfaces, constraints, assumptions, risks, uniq };
}

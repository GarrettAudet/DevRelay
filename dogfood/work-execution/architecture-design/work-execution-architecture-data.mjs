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
      type === "software-system" ? "" : "Provider-neutral DevRelay execution",
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
      "Canonical provider-neutral execution-attempt semantics",
      "Closed readiness, binding, authority, and validation dispositions",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Stable canonical behavior across compatible executors and hosts",
      "Unknown bindings, fields, executor versions, or policy values fail closed",
    ],
    securityPrivacyIntent,
    deliveryConsistencyIntent: [
      "Validate canonical structured bytes before checkpoint or Gate preparation",
      "Preserve exact work-item, baseline, adapter, validator, and evidence lineage",
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
      "Dedicated positive, negative, drift, replay, readiness, binding, host-boundary, authority, and traceability conformance fixtures.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildWorkExecutionArchitecture({ architectureBaseline, requirements }) {
  const CG = Object.freeze({
    execute: "US-DEV-WORK-EXECUTION-001",
    deterministic: "NFR-DEV-WE-DETERMINISM-001",
    isolation: "NFR-DEV-WE-ISOLATION-001",
    authority: "CON-DEV-WE-AUTHORITY-001",
    oneItem: "CON-DEV-WE-ONE-ITEM-001",
    immutableAttempt: "CON-DEV-WE-IMMUTABLE-ATTEMPT-001",
    host: "CON-DEV-WE-HOST-ENFORCEMENT-001",
    verificationBarrier: "CON-DEV-WE-VERIFICATION-BARRIER-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missingIds = Object.values(CG).filter((id) => !declaredIds.has(id));
  if (missingIds.length) throw new Error("WorkExecution architecture drivers are absent from approved requirements: " + missingIds.join(", "));
  const allNormativeIds = [...declaredIds];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-WORK-EXECUTION-006";

  model.elements.push(
    architectureElement({
      id: "EL-WE-MODULE", name: "WorkExecution", type: "container", parentId: "EL-DEVRELAY-SYSTEM",
      description: "Executes one Core-selected runnable work item per immutable attempt through a provider-neutral executor port.",
      responsibilities: ["Accept one exact readiness-approved WorkItem", "Invoke one configured executor binding", "Return proposed changes and raw evidence without verification or integration claims"],
      sourceRequirementIds: Object.values(CG), tags: ["Container", "LifecycleModule", "WorkExecution"],
    }),
    component("EL-WE-EXECUTOR-PORT", "Executor Port", "EL-WE-MODULE", "Provider-neutral boundary for one exact execution attempt.", ["Pass immutable work, context, workspace, policy, and binding inputs", "Receive exact change-set draft, raw evidence, diagnostics, and native artifacts"], [CG.execute, CG.authority, CG.host], ["AdapterPort", "WorkExecution"]),
    component("EL-WE-CODEX-TASK-ADAPTER", "Codex Task Executor Adapter", "EL-WE-MODULE", "First dogfood binding that maps one attempt to one user-visible Codex task and preserves its structured handoff.", ["Create one task for one assigned work item", "Return exact task identity, handoff bytes, proposed changes, and evidence"], [CG.execute, CG.oneItem, CG.immutableAttempt], ["AdapterBinding", "Dogfood"]),
    component("EL-WE-A2A-EXECUTOR-ADAPTER", "A2A Executor Adapter", "EL-WE-MODULE", "Optional binding that performs the same attempt contract through a version-pinned A2A agent endpoint.", ["Bind an approved profile and Agent Card to one task request", "Preserve A2A request, task, artifact, and terminal-state evidence"], [CG.execute, CG.authority, CG.host], ["AdapterBinding", "Optional", "A2A"]),
    component("EL-WE-INPUT-GUARD", "Execution Input Guard", "EL-DEVRELAY-CORE", "Validates exact work, dependency, assignment, repository, project, policy, and retry lineage before effects.", ["Reject stale or incomplete baselines", "Require exactly one selected work item and one immutable attempt identity"], [CG.execute, CG.authority, CG.oneItem, CG.immutableAttempt], ["CoreAuthority", "WorkExecution"]),
    component("EL-WE-FRONTIER-VALIDATOR", "Runnable Frontier Validator", "EL-DEVRELAY-CORE", "Derives the current runnable frontier from the static DAG and approved integrated completion facts.", ["Prove all prerequisites are integrated", "Reject adapter-supplied, stale, or forged readiness"], [CG.execute, CG.authority, CG.oneItem], ["CoreAuthority", "DependencySafety"]),
    component("EL-WE-BINDING-VALIDATOR", "Execution Binding Validator", "EL-DEVRELAY-CORE", "Validates the version-pinned SpecialistProfile-to-executor mapping and exact declared permission demand.", ["Bind profile, adapter, configuration, tools, grants, and host policy", "Reject mismatched profiles, adapter drift, or expanded authority"], [CG.execute, CG.authority, CG.host, CG.isolation], ["CoreAuthority", "Validation"]),
    component("EL-WE-RESULT-ASSEMBLER", "Execution Result Assembler", "EL-DEVRELAY-CORE", "Builds canonical immutable attempt, ChangeSetDraft, and ExecutionEvidenceBundle artifacts from validated executor bytes.", ["Reject completion, verification, or integration claims", "Bind every output and diagnostic to the exact attempt and workspace base"], [CG.execute, CG.deterministic, CG.verificationBarrier], ["CoreAuthority", "Canonicalization"]),
    component("EL-WE-CHECKPOINT", "Execution Checkpoint Controller", "EL-DEVRELAY-CORE", "Persists effect results before progression and replays exact attempts without reinvoking executors.", ["Checkpoint raw executor result and canonical outputs", "Create new linked attempt identity for retry after failure or interruption"], [CG.deterministic, CG.immutableAttempt, CG.authority], ["CoreAuthority", "Checkpoint"]),
    component("EL-WE-TRACEABILITY-CONTRIBUTOR", "Execution Attempt Traceability Contributor", "EL-DEVRELAY-GRAPH", "Projects attempted-by and produces relationships from validated execution artifacts only.", ["Link WorkItem to immutable ExecutionAttempt", "Link successful ExecutionAttempt to proposed ChangeSet without creating verification or integration facts"], [CG.execute, CG.authority, CG.verificationBarrier], ["TraceabilityContributor", "Candidate"]),
  );

  const relationships = [
    ["REL-WE-GUARD-FRONTIER", "EL-WE-INPUT-GUARD", "EL-WE-FRONTIER-VALIDATOR", "Requests readiness proof for the exact work item.", [CG.execute, CG.authority, CG.oneItem]],
    ["REL-WE-FRONTIER-BINDING", "EL-WE-FRONTIER-VALIDATOR", "EL-WE-BINDING-VALIDATOR", "Releases only a readiness-approved work item for binding.", [CG.execute, CG.authority]],
    ["REL-WE-BINDING-PORT", "EL-WE-BINDING-VALIDATOR", "EL-WE-EXECUTOR-PORT", "Supplies one exact validated execution binding and permission demand.", [CG.execute, CG.authority, CG.host]],
    ["REL-WE-PORT-CODEX", "EL-WE-EXECUTOR-PORT", "EL-WE-CODEX-TASK-ADAPTER", "Invokes one user-visible Codex task through the common executor contract.", [CG.execute, CG.oneItem]],
    ["REL-WE-PORT-A2A", "EL-WE-EXECUTOR-PORT", "EL-WE-A2A-EXECUTOR-ADAPTER", "Optionally invokes a version-pinned A2A agent through the same contract.", [CG.execute, CG.host]],
    ["REL-WE-PORT-CHECKPOINT", "EL-WE-EXECUTOR-PORT", "EL-WE-CHECKPOINT", "Persists exact effect bytes before canonical progression.", [CG.deterministic, CG.immutableAttempt]],
    ["REL-WE-CHECKPOINT-ASSEMBLER", "EL-WE-CHECKPOINT", "EL-WE-RESULT-ASSEMBLER", "Supplies replay-verified executor bytes for canonical assembly.", [CG.deterministic, CG.verificationBarrier]],
    ["REL-WE-ASSEMBLER-TRACE", "EL-WE-RESULT-ASSEMBLER", "EL-WE-TRACEABILITY-CONTRIBUTOR", "Supplies validated attempt and proposed change artifacts for candidate traceability.", [CG.execute, CG.authority]],
  ];
  model.relationships.push(...relationships.map(([id, source, target, description, ids]) => relationship(id, source, target, description, ids)));

  const viewFor = ({ viewKey, type, title, purpose, audience, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return { viewKey, type, title, purpose, audience, scopeElementId, elementIds, relationshipIds: model.relationships.filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId)).map(({ id }) => id) };
  };
  const priorViewSpecs = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const diagramViewSpecs = [
    ...priorViewSpecs,
    viewFor({ viewKey: "VIEW-WE-CONTAINERS", type: "container", title: "DevRelay WorkExecution containers", purpose: "Show WorkExecution beside Generic Core and TraceabilityGraph.", audience: ["engineering", "architecture", "workflow-authors"], scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-WE-CORE-COMPONENTS", type: "component", title: "Generic Core execution authority", purpose: "Show readiness, binding, checkpoint, and canonical output authority.", audience: ["engineering", "architecture", "security"], scopeElementId: "EL-DEVRELAY-CORE", elementIds: ["EL-WE-INPUT-GUARD", "EL-WE-FRONTIER-VALIDATOR", "EL-WE-BINDING-VALIDATOR", "EL-WE-RESULT-ASSEMBLER", "EL-WE-CHECKPOINT"] }),
    viewFor({ viewKey: "VIEW-WE-MODULE-COMPONENTS", type: "component", title: "WorkExecution adapter boundary", purpose: "Show Codex task and A2A bindings behind one executor port.", audience: ["engineering", "adapter-authors"], scopeElementId: "EL-WE-MODULE", elementIds: ["EL-WE-EXECUTOR-PORT", "EL-WE-CODEX-TASK-ADAPTER", "EL-WE-A2A-EXECUTOR-ADAPTER"] }),
    viewFor({ viewKey: "VIEW-WE-TRACEABILITY-COMPONENTS", type: "component", title: "Execution traceability", purpose: "Show candidate attempt and produced-change projection.", audience: ["engineering", "audit"], scopeElementId: "EL-DEVRELAY-GRAPH", elementIds: ["EL-WE-TRACEABILITY-CONTRIBUTOR"] }),
  ];

  const scope = {
    level: "change",
    boundary: "WorkExecution over one exact Core-selected runnable WorkItem and one isolated host workspace.",
    in: ["Core-derived readiness proof", "Version-pinned ExecutionBinding", "One immutable ExecutionAttempt", "Codex task executor dogfood binding", "Optional A2A executor binding", "ChangeSetDraft and ExecutionEvidenceBundle", "Effect checkpoint replay", "Candidate attempt traceability"],
    out: ["Work decomposition or assignment", "Scheduling beyond frontier fan-out", "Workspace or operating-system enforcement by portable Core", "Verification or completion claims", "Change integration", "Executor-authored graph operations"],
  };
  const openSpecDesign = [
    "# WorkExecution design",
    "",
    "## Decision",
    "",
    "Core invokes one work item per immutable attempt only after deriving readiness from the approved DAG and integrated completion facts. A version-pinned ExecutionBinding resolves the approved specialist profile to one configured executor. The external host creates and enforces an isolated workspace. Executor output is checkpointed before Core assembles a ChangeSetDraft and ExecutionEvidenceBundle.",
    "",
    "## Bindings",
    "",
    "The first dogfood binding creates one user-visible Codex task per work item. An A2A executor uses the same port. Neither adapter owns readiness, permissions, verification, integration, or graph authority.",
    "",
    "## Consequences",
    "",
    "Parallelism is represented as independent invocations across the ready frontier. Failed and interrupted attempts remain immutable; retry creates a new linked attempt.",
  ].join("\n");

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  const interfaceSpecs = [
    ["IF-WE-READINESS-PROOF", "Runnable work-item proof", "EL-WE-FRONTIER-VALIDATOR", ["EL-WE-BINDING-VALIDATOR"], ["Exact WorkBreakdownBaseline and WorkDependencyBaseline", "Integrated completion fact set", "Selected WorkItem identity"], ["RunnableFrontierProof with prerequisite evidence and graph digest"], [CG.execute, CG.authority, CG.oneItem], "A stale graph, absent item, unmet prerequisite, candidate completion fact, or multi-item selection fails before binding.", ["Pure Core derivation reads approved content-addressed artifacts only."]],
    ["IF-WE-EXECUTION-BINDING", "Concrete executor binding validation", "EL-WE-BINDING-VALIDATOR", ["EL-WE-EXECUTOR-PORT"], ["Exact SpecialistAssignmentBaseline", "Selected WorkItem and SpecialistProfile", "Version-pinned ExecutionBinding and ExecutionPolicy"], ["ValidatedExecutionBinding with adapter, tools, grants, host policy, and binding digest"], [CG.execute, CG.authority, CG.host, CG.isolation], "Missing, stale, mismatched, unauthorized, or authority-expanding binding fails before executor entry.", ["Core validates declarative demand; the external host enforces operating-system effects."]],
    ["IF-WE-EXECUTOR-INVOCATION", "Bounded executor invocation", "EL-WE-EXECUTOR-PORT", ["EL-WE-CODEX-TASK-ADAPTER", "EL-WE-A2A-EXECUTOR-ADAPTER"], ["One immutable ExecutionAttempt request", "Exact work contract and ProjectOverview", "Isolated workspace base and declared grants", "Configured executor identity and version"], ["RawExecutorResult with proposed mutations, raw evidence, diagnostics, native artifacts, and terminal state"], [CG.execute, CG.oneItem, CG.host, CG.immutableAttempt], "Invalid binding, host denial, interruption, timeout, malformed output, or modified context produces a durable non-success attempt and no partial success.", ["Adapters receive minimum declared authority and cannot access Core Gate or TraceabilityGraph services."]],
    ["IF-WE-RESULT-ASSEMBLY", "Canonical execution result assembly", "EL-WE-RESULT-ASSEMBLER", ["EL-DEVRELAY-CORE"], ["Checkpoint-replayed RawExecutorResult", "Exact attempt request and workspace base", "Output and evidence policy"], ["ExecutionAttempt", "ChangeSetDraft", "ExecutionEvidenceBundle", "Diagnostics"], [CG.execute, CG.deterministic, CG.verificationBarrier], "Unscoped mutation, missing evidence, forbidden completion claim, noncanonical bytes, or attempt mismatch blocks progression.", ["The assembler is pure and cannot execute tools, verify correctness, or integrate changes."]],
    ["IF-WE-CANDIDATE-TRACEABILITY", "Execution attempt traceability projection", "EL-WE-TRACEABILITY-CONTRIBUTOR", ["EL-DEVRELAY-GRAPH"], ["Validated ExecutionAttempt", "Exact WorkItem and optional ChangeSetDraft references"], ["Candidate WorkItem attempted-by ExecutionAttempt facts", "Candidate ExecutionAttempt produces ChangeSet facts", "Atomic merge proof"], [CG.execute, CG.authority, CG.verificationBarrier], "Unknown references, arbitrary edges, graph drift, or missing contributor blocks the graph-aware execution record.", ["Trusted Core contributor accepts no adapter-authored graph operations."]],
  ];
  for (const [id, name, provider, consumers, inputs, outputs, ids, failure, security] of interfaceSpecs) {
    interfaces.push(interfaceIntent({ id, name, providerElementId: provider, consumerElementIds: consumers, inputs, outputs, requirementIds: ids, failureBehavior: failure, securityPrivacyIntent: security }));
  }

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  const constraintSpecs = [
    ["CON-WE-ONE-ITEM", "operational", "One WorkExecution invocation contains exactly one Core-selected runnable WorkItem; frontier parallelism is multiple independent invocations.", [{ kind: "element", id: "EL-WE-INPUT-GUARD" }, { kind: "interface", id: "IF-WE-READINESS-PROOF" }], [CG.execute, CG.oneItem]],
    ["CON-WE-CORE-READINESS", "operational", "Only Core derives readiness from the approved DAG and integrated completion facts; executors and bindings cannot propose readiness.", [{ kind: "element", id: "EL-WE-FRONTIER-VALIDATOR" }], [CG.execute, CG.authority]],
    ["CON-WE-BINDING-AUTHORITY", "organizational", "ExecutionBinding selects a configured executor only for the exact assigned profile and cannot expand capabilities, tools, grants, or work scope.", [{ kind: "element", id: "EL-WE-BINDING-VALIDATOR" }, { kind: "interface", id: "IF-WE-EXECUTION-BINDING" }], [CG.execute, CG.authority, CG.host]],
    ["CON-WE-HOST-BOUNDARY", "security", "Portable Core records declarative permission demand while the external host alone claims workspace, process, network, filesystem, and secret enforcement.", [{ kind: "element", id: "EL-WE-EXECUTOR-PORT" }], [CG.host, CG.isolation]],
    ["CON-WE-OUTPUT-AUTHORITY", "organizational", "Executor output may propose changes and raw evidence only; verification, completion, and integration fields are forbidden.", [{ kind: "element", id: "EL-WE-RESULT-ASSEMBLER" }, { kind: "interface", id: "IF-WE-RESULT-ASSEMBLY" }], [CG.execute, CG.verificationBarrier]],
    ["CON-WE-IMMUTABLE-RETRY", "data", "Every actual invocation has a new immutable ExecutionAttempt identity; retry references but never overwrites its predecessor.", [{ kind: "element", id: "EL-WE-CHECKPOINT" }], [CG.immutableAttempt, CG.deterministic]],
    ["CON-WE-CHECKPOINT-REPLAY", "operational", "Exact retry replays checkpointed executor bytes with zero executor calls; changed inputs or binding creates a different fingerprint and attempt.", [{ kind: "element", id: "EL-WE-CHECKPOINT" }, { kind: "interface", id: "IF-WE-EXECUTOR-INVOCATION" }], [CG.deterministic, CG.immutableAttempt]],
    ["CON-WE-TRACEABILITY-AUTHORITY", "organizational", "Only the trusted contributor projects attempted-by and produces candidate facts; it cannot create verified or integrated facts.", [{ kind: "element", id: "EL-WE-TRACEABILITY-CONTRIBUTOR" }], [CG.execute, CG.authority, CG.verificationBarrier]],
  ];
  for (const [id, category, statement, appliesTo, ids] of constraintSpecs) constraints.push(constraint(id, category, statement, appliesTo, ids));

  const technicalDesign = {
    technicalDesignId: "TD-WE-001",
    objective: "Execute one ready work item through replaceable host adapters while preserving deterministic Core authority, isolation boundaries, immutable retry, raw evidence, and downstream verification separation.",
    scope,
    problemSummary: "Assigned work must be performed by concrete humans or AI runtimes, but executors cannot own readiness, permissions, verification, integration, or lifecycle truth.",
    solutionSummary: "Core derives readiness, validates a version-pinned profile-to-executor binding, invokes one executor through a host-enforced isolated workspace, checkpoints exact effect bytes, assembles proposed changes and raw evidence, and projects candidate attempt traceability.",
    requirementsDrivers: ["One work item per invocation", "Core-owned readiness and binding validation", "External host enforcement", "Immutable attempt and retry lineage", "Proposed changes and raw evidence only", "Replaceable Codex task and A2A executors"],
    behaviorFlows: ["Core validates exact baselines and derives the ready frontier.", "Core validates one selected work item and its assigned profile.", "Core validates the ExecutionBinding and declared host permission demand.", "The host creates an isolated workspace and invokes the configured executor.", "Raw result bytes are checkpointed before Core assembly.", "Core emits immutable attempt, proposed change set, evidence bundle, and diagnostics.", "Trusted traceability records attempted and produced facts; WorkItemVerification is next."],
    dataResponsibilities: ["RunnableFrontierProof binds DAG and integrated completion state.", "ExecutionBinding binds profile, adapter, version, configuration, tools, grants, and host policy.", "ExecutionAttempt is immutable and optionally references one predecessor.", "ChangeSetDraft describes proposed mutations without integration authority.", "ExecutionEvidenceBundle preserves raw commands, outputs, artifacts, and observations."],
    failureHandling: ["Baseline or readiness drift stops before executor entry.", "Binding or host denial creates no successful attempt.", "Failure and interruption remain durable terminal attempts.", "Malformed, unscoped, or authority-expanding output is rejected after checkpoint and before progression.", "Retry creates a new linked attempt."],
    securityPrivacy: ["External host enforces declared permissions and isolation.", "Secrets are referenced, never embedded in portable artifacts.", "Executor adapters cannot access graph or downstream Gate authority.", "Raw evidence follows explicit retention and redaction policy."],
    performanceReliabilityOperability: ["Core fans out independent ready-frontier invocations.", "Per-item attempts isolate failures and retries.", "Exact checkpoints prevent duplicate effects.", "Task and A2A identities make remote execution observable."],
    compatibilityMigrationRollout: ["First dogfood binding uses Codex tasks.", "A2A uses the same executor contract.", "Additional human, local-command, or model-specific bindings remain edge plugins.", "No provider identity enters canonical readiness or result semantics."],
    verificationIntent: ["Test ready and blocked frontier cases.", "Test exact and malicious bindings.", "Test host permission allow and deny paths.", "Test success, failure, interruption, retry, and zero-call replay.", "Reject verification and integration claims.", "Test Codex task and A2A adapter substitution.", "Test candidate traceability and downstream barrier."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-WE-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-WE-")).map(({ id }) => id),
    sourceRequirementIds: Object.values(CG),
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-WE-001", "Execute one work item per immutable attempt", "OPT-WE-ONE-ITEM", "OPT-WE-FRONTIER-IN-ONE-ATTEMPT", [CG.execute, CG.oneItem], [{ kind: "constraint", id: "CON-WE-ONE-ITEM" }]],
    ["ADR-WE-002", "Keep readiness and binding validation in Core", "OPT-WE-CORE-AUTHORITY", "OPT-WE-EXECUTOR-SELF-SELECTS", [CG.execute, CG.authority], [{ kind: "element", id: "EL-WE-FRONTIER-VALIDATOR" }, { kind: "element", id: "EL-WE-BINDING-VALIDATOR" }]],
    ["ADR-WE-003", "Treat workspace and permission enforcement as external host responsibility", "OPT-WE-HOST-ENFORCEMENT", "OPT-WE-CORE-CLAIMS-OS-ISOLATION", [CG.host, CG.isolation], [{ kind: "constraint", id: "CON-WE-HOST-BOUNDARY" }]],
    ["ADR-WE-004", "Return proposed changes and raw evidence without completion authority", "OPT-WE-PROPOSED-OUTPUT", "OPT-WE-EXECUTOR-VERIFIES-ITSELF", [CG.execute, CG.verificationBarrier], [{ kind: "constraint", id: "CON-WE-OUTPUT-AUTHORITY" }]],
    ["ADR-WE-005", "Use Codex task and A2A bindings behind one executor port", "OPT-WE-PORTABLE-EXECUTOR-PORT", "OPT-WE-PROVIDER-BRANCHES-IN-CORE", [CG.execute, CG.authority], [{ kind: "element", id: "EL-WE-EXECUTOR-PORT" }]],
  ];
  const decisions = decisionSpecs.map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-WE-HOST-CONFORMANCE", statement: "The external host exposes enforceable isolated-workspace and permission primitives and returns evidence of the exact policy applied.", status: "confirmed", blocking: false },
    { id: "ASM-WE-CODEX-DOGFOOD", statement: "The first dogfood executor creates one user-visible Codex task per assigned work item and preserves exact task handoff evidence.", status: "confirmed", blocking: false },
    { id: "ASM-WE-A2A-OPTIONAL", statement: "A2A execution begins fixture-conformant and becomes live-conformant only after real Agent Card, task, artifact, authentication, and terminal-state tests.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-WE-HOST-CLAIM", statement: "Portable Core may overstate isolation it cannot enforce.", impact: "Executors could mutate undeclared state.", mitigation: "Keep enforcement and evidence in the external host contract and test host conformance." },
    { id: "RISK-WE-STALE-FRONTIER", statement: "An attempt may start from stale dependency or completion state.", impact: "Work could run before prerequisites are integrated.", mitigation: "Bind a freshly derived RunnableFrontierProof and reject drift before executor entry." },
    { id: "RISK-WE-DUPLICATE-EFFECT", statement: "Retry may reinvoke an executor after its effects occurred.", impact: "Duplicate changes, tasks, or external effects may result.", mitigation: "Checkpoint exact raw results before progression and use attempt/idempotency keys at adapter boundaries." },
    { id: "RISK-WE-SELF-VERIFICATION", statement: "Executor output may claim its own correctness.", impact: "Invalid work could bypass WorkItemVerification.", mitigation: "Use closed output schemas that forbid verification, completion, and integration authority." },
    { id: "RISK-WE-TASK-DRIFT", statement: "A user-visible execution task may receive incomplete or changed context.", impact: "The returned changes may not satisfy the assigned work contract.", mitigation: "Bind exact task context, package digest, handoff shape, and returned raw bytes to the attempt." },
  ];

  const alreadyDesignedTargets = new Map();
  for (const [kind, items, idOf] of [
    ["element", baseSections.architectureModel.content.elements, ({ id }) => id],
    ["relationship", baseSections.architectureModel.content.relationships, ({ id }) => id],
    ["interface", baseSections.interfaceIntent.content.interfaces, ({ id }) => id],
    ["constraint", baseSections.architectureConstraints.content.constraints, ({ id }) => id],
    ["decision", baseSections.decisionRecords.content.decisions, ({ id }) => id],
  ]) {
    for (const item of items) for (const requirementId of item.sourceRequirementIds ?? []) {
      const targets = alreadyDesignedTargets.get(requirementId) ?? [];
      targets.push({ kind, id: idOf(item) });
      alreadyDesignedTargets.set(requirementId, targets);
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
    CG, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope,
    openSpecDesign, diagramViewSpecs, decisionSpecs: decisions, technicalDesign,
    interfaces, constraints, assumptions, risks, uniq,
  };
}
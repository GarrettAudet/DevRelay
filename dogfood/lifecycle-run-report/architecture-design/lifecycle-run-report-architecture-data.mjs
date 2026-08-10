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
      type === "software-system"
        ? ""
        : "Provider-neutral DevRelay contract",
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
      "Exact versions and SHA-256 digests",
      "Canonical provider-neutral semantics",
      "Explicit availability and authority dispositions",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Stable canonical behavior across compatible hosts and renderers",
      "Unknown fields and unsupported maturity or availability values fail closed",
    ],
    securityPrivacyIntent,
    deliveryConsistencyIntent: [
      "Validate canonical structured bytes before append or projection",
      "Preserve exact source lineage and deterministic ordering",
    ],
    contractGeneration: {
      required: true,
      suggestedKinds: ["json-schema"],
    },
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

function constraint(
  id,
  category,
  statement,
  appliesTo,
  requirementIds,
) {
  return {
    id,
    category,
    strength: "must",
    statement,
    rationale: statement,
    appliesTo,
    verificationIntent:
      "Dedicated positive, negative, drift, replay, redaction, and non-authority conformance fixtures.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildLifecycleRunReportArchitecture({
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
  const RUN = Object.freeze({
    inspect: "US-DEV-INSPECT-RUN-001",
    performance: "US-DEV-GAUGE-PERFORMANCE-001",
    maturity: "US-DEV-UNDERSTAND-ADAPTERS-001",
    frontier: "US-DEV-RUN-FRONTIERS-001",
    deterministic: "NFR-DEV-RUN-REPORT-DETERMINISM-001",
    observability: "NFR-DEV-RUN-REPORT-OBSERVABILITY-001",
    privacy: "NFR-DEV-RUN-REPORT-PRIVACY-001",
    nonAuthority: "CON-DEV-RUN-REPORT-NON-AUTHORITY-001",
  });
  const requiredIds = [...Object.values(DEV), ...Object.values(RUN)];
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
  model.modelId = "MODEL-DEVRELAY-LIFECYCLE-RUN-003";

  model.elements.push(
    architectureElement({
      id: "EL-RUN-REPORTING",
      name: "Lifecycle Reporting",
      type: "container",
      parentId: "EL-DEVRELAY-SYSTEM",
      description:
        "Cross-cutting operational history and human-readable projection without workflow authority.",
      responsibilities: [
        "Persist exact standardized run records and observations",
        "Project traceable lifecycle snapshots and human-readable reports",
        "Expose sourced performance and adapter-maturity evidence",
      ],
      sourceRequirementIds: Object.values(RUN),
      tags: ["Container", "CoreInfrastructure", "LifecycleReporting"],
    }),
    component(
      "EL-RUN-FACT-RECORDER",
      "Workflow Fact Recorder",
      "EL-DEVRELAY-CORE",
      "Derives standardized immutable run records from trusted Core transitions and Gate results.",
      [
        "Record exact module, Gate, adapter, checkpoint, approval, and progression facts",
        "Bind every record to execution and artifact identities",
      ],
      [
        RUN.inspect,
        RUN.deterministic,
        RUN.nonAuthority,
        DEV.artifacts,
        DEV.gates,
      ],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-COMPLETION-REGISTRY",
      "Integrated Completion Registry",
      "EL-DEVRELAY-CORE",
      "Stores separately approved verified integration facts without mutating the static dependency DAG.",
      [
        "Admit only exact verified ChangeIntegration completion facts",
        "Preserve work-item, ChangeSet, verification, and integration lineage",
      ],
      [RUN.frontier, DEV.gates, DEV.traceable],
      ["LifecycleControl"],
    ),
    component(
      "EL-RUN-FRONTIER-RESOLVER",
      "Ready Frontier Resolver",
      "EL-DEVRELAY-CORE",
      "Derives the current runnable work frontier from the immutable WorkDependencyBaseline and integrated completion facts.",
      [
        "Reject readiness inferred from assignment, execution start, or unintegrated changes",
        "Return deterministic ready, blocked, completed, and failed dependency dispositions",
      ],
      [RUN.frontier, RUN.deterministic, DEV.orchestrate],
      ["LifecycleControl"],
    ),
    component(
      "EL-RUN-LEDGER",
      "Run Ledger Store",
      "EL-RUN-REPORTING",
      "Append-only content-addressed store for trusted workflow records and explicitly non-authoritative observations.",
      [
        "Preserve exact raw records and lineage",
        "Reject record substitution, duplicates with divergent bytes, and invalid authority claims",
      ],
      [
        RUN.inspect,
        RUN.observability,
        RUN.deterministic,
        RUN.nonAuthority,
        DEV.artifacts,
      ],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-OBSERVATION-INGRESS",
      "Host Observation Ingress",
      "EL-RUN-REPORTING",
      "Admits sourced timing, wait, call, token, cost, retry, and replay observations without workflow authority.",
      [
        "Require captured, not-reported, or not-applicable disposition",
        "Bind measurements to exact run and execution identities",
      ],
      [RUN.performance, RUN.observability, RUN.nonAuthority],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-MATURITY-RESOLVER",
      "Adapter Maturity Resolver",
      "EL-RUN-REPORTING",
      "Resolves evidence-backed adapter binding maturity separately from Core-owned implementations.",
      [
        "Admit only contract-defined, fixture-conformant, live-conformant, or release-ready",
        "Link every maturity claim to exact binding and evidence",
      ],
      [RUN.maturity, RUN.inspect, DEV.extend, DEV.neutral],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-COMPARABILITY",
      "Run Comparability Evaluator",
      "EL-RUN-REPORTING",
      "Allows relative performance claims only for explicitly comparable executions.",
      [
        "Compare module, operation, input, policy, circuit, and host dimensions",
        "Return non-comparable with exact reasons on any mismatch",
      ],
      [RUN.performance, RUN.observability, RUN.deterministic],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-SNAPSHOT-PROJECTOR",
      "Lifecycle Snapshot Projector",
      "EL-RUN-REPORTING",
      "Purely projects the run ledger, graph checkpoint, maturity evidence, and policy results into one canonical snapshot.",
      [
        "Discover circuit components from records rather than product identifiers",
        "Join business-to-acceptance paths and coverage diagnostics",
      ],
      [
        RUN.inspect,
        RUN.performance,
        RUN.maturity,
        RUN.deterministic,
        RUN.nonAuthority,
        DEV.traceable,
      ],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-CONTENT-POLICY",
      "Report Content Policy",
      "EL-RUN-REPORTING",
      "Applies deterministic allow, omit, and redact dispositions before human-readable projection.",
      [
        "Exclude credentials, secrets, and unrestricted raw prompts or tool logs",
        "Preserve audit links and explicit omission dispositions",
      ],
      [RUN.privacy, RUN.inspect, RUN.nonAuthority],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-MARKDOWN-RENDERER",
      "Lifecycle Markdown Renderer",
      "EL-RUN-REPORTING",
      "Renders byte-deterministic LifecycleRunReport.md from one validated canonical snapshot.",
      [
        "Lead with an executive summary and readable stage table",
        "Render outcomes, Gates, rework, metrics, important artifacts, and next actions",
      ],
      [RUN.inspect, RUN.performance, RUN.deterministic, RUN.privacy],
      ["LifecycleReporting"],
    ),
    component(
      "EL-RUN-REPORT-PORT",
      "Report Access Port",
      "EL-RUN-REPORTING",
      "Exposes the exact structured snapshot, Markdown report, and linked evidence to IDE and host consumers.",
      [
        "Serve only validated content-addressed report artifacts",
        "Expose no mutation, routing, approval, or evidence-satisfaction operation",
      ],
      [RUN.inspect, RUN.nonAuthority, DEV.portable],
      ["LifecycleReporting"],
    ),
  );

  model.relationships.push(
    relationship(
      "REL-CORE-RUN-REPORTING",
      "EL-DEVRELAY-CORE",
      "EL-RUN-REPORTING",
      "Supplies trusted standardized lifecycle facts without granting reporting progression authority.",
      [RUN.inspect, RUN.nonAuthority, DEV.orchestrate],
    ),
    relationship(
      "REL-GRAPH-RUN-REPORTING",
      "EL-DEVRELAY-GRAPH",
      "EL-RUN-REPORTING",
      "Supplies one exact TraceabilityGraph checkpoint for read-only report projection.",
      [RUN.inspect, RUN.nonAuthority, DEV.traceable],
    ),
    relationship(
      "REL-RUN-FACTS-LEDGER",
      "EL-RUN-FACT-RECORDER",
      "EL-RUN-LEDGER",
      "Appends trusted content-addressed module, Gate, checkpoint, approval, and progression records.",
      [RUN.inspect, RUN.deterministic, RUN.nonAuthority],
    ),
    relationship(
      "REL-RUN-OBSERVATIONS-LEDGER",
      "EL-RUN-OBSERVATION-INGRESS",
      "EL-RUN-LEDGER",
      "Appends sourced non-authoritative host observations with explicit availability dispositions.",
      [RUN.performance, RUN.observability, RUN.nonAuthority],
    ),
    relationship(
      "REL-RUN-LEDGER-PROJECTOR",
      "EL-RUN-LEDGER",
      "EL-RUN-SNAPSHOT-PROJECTOR",
      "Supplies one exact run lineage and observation set.",
      [RUN.inspect, RUN.performance, RUN.deterministic],
    ),
    relationship(
      "REL-RUN-GRAPH-PROJECTOR",
      "EL-DEVRELAY-GRAPH",
      "EL-RUN-SNAPSHOT-PROJECTOR",
      "Supplies one exact graph snapshot and deterministic query results.",
      [RUN.inspect, RUN.nonAuthority, DEV.traceable],
    ),
    relationship(
      "REL-RUN-MATURITY-PROJECTOR",
      "EL-RUN-MATURITY-RESOLVER",
      "EL-RUN-SNAPSHOT-PROJECTOR",
      "Supplies evidence-backed adapter binding and Core implementation maturity.",
      [RUN.maturity, RUN.inspect],
    ),
    relationship(
      "REL-RUN-COMPARABILITY-PROJECTOR",
      "EL-RUN-COMPARABILITY",
      "EL-RUN-SNAPSHOT-PROJECTOR",
      "Supplies explicit comparable or non-comparable dispositions.",
      [RUN.performance, RUN.observability],
    ),
    relationship(
      "REL-RUN-PROJECTOR-POLICY",
      "EL-RUN-SNAPSHOT-PROJECTOR",
      "EL-RUN-CONTENT-POLICY",
      "Submits the canonical report field set for deterministic content policy.",
      [RUN.inspect, RUN.privacy, RUN.nonAuthority],
    ),
    relationship(
      "REL-RUN-POLICY-RENDERER",
      "EL-RUN-CONTENT-POLICY",
      "EL-RUN-MARKDOWN-RENDERER",
      "Supplies an allowed or explicitly redacted canonical snapshot.",
      [RUN.inspect, RUN.privacy, RUN.deterministic],
    ),
    relationship(
      "REL-RUN-RENDERER-PORT",
      "EL-RUN-MARKDOWN-RENDERER",
      "EL-RUN-REPORT-PORT",
      "Publishes the exact Markdown report and structured snapshot references.",
      [RUN.inspect, RUN.nonAuthority, DEV.portable],
    ),
    relationship(
      "REL-RUN-INTEGRATION-COMPLETION",
      "EL-WB-DOWNSTREAM",
      "EL-RUN-COMPLETION-REGISTRY",
      "Submits only verified integrated-completion facts from ChangeIntegration.",
      [RUN.frontier, DEV.gates, DEV.traceable],
    ),
    relationship(
      "REL-RUN-COMPLETION-FRONTIER",
      "EL-RUN-COMPLETION-REGISTRY",
      "EL-RUN-FRONTIER-RESOLVER",
      "Supplies the exact separately approved completion fact set.",
      [RUN.frontier, RUN.deterministic],
    ),
    relationship(
      "REL-RUN-DAG-FRONTIER",
      "EL-WDA-MODULE",
      "EL-RUN-FRONTIER-RESOLVER",
      "Supplies the immutable approved WorkDependencyBaseline DAG.",
      [RUN.frontier, RUN.deterministic],
    ),
    relationship(
      "REL-RUN-FRONTIER-DOWNSTREAM",
      "EL-RUN-FRONTIER-RESOLVER",
      "EL-WB-DOWNSTREAM",
      "Releases only the currently derived dependency-ready work-item frontier.",
      [RUN.frontier, DEV.orchestrate],
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
  const priorViewSpecs = baseSections.diagrams.content.views.map(
    ({ renderings: _renderings, ...view }) => structuredClone(view),
  );
  const newCoreIds = [
    "EL-RUN-COMPLETION-REGISTRY",
    "EL-RUN-FACT-RECORDER",
    "EL-RUN-FRONTIER-RESOLVER",
  ];
  const reportingIds = model.elements
    .filter(
      ({ type, parentId }) =>
        type === "component" && parentId === "EL-RUN-REPORTING",
    )
    .map(({ id }) => id);
  const diagramViewSpecs = [
    ...priorViewSpecs,
    viewFor({
      viewKey: "VIEW-RUN-CONTAINERS",
      type: "container",
      title: "DevRelay lifecycle and reporting containers",
      purpose:
        "Show Generic Core, lifecycle modules, TraceabilityGraph, and cross-cutting Lifecycle Reporting as separate top-level boundaries.",
      audience: ["engineering", "architecture", "product"],
      scopeElementId: "EL-DEVRELAY-SYSTEM",
      elementIds: model.elements
        .filter(
          ({ type, parentId }) =>
            type === "container" && parentId === "EL-DEVRELAY-SYSTEM",
        )
        .map(({ id }) => id),
    }),
    viewFor({
      viewKey: "VIEW-RUN-CORE-COMPONENTS",
      type: "component",
      title: "Generic Core lifecycle facts and frontier derivation",
      purpose:
        "Show trusted workflow fact recording, integrated completion state, and deterministic ready-frontier derivation.",
      audience: ["engineering", "architecture", "verification"],
      scopeElementId: "EL-DEVRELAY-CORE",
      elementIds: newCoreIds,
    }),
    viewFor({
      viewKey: "VIEW-RUN-REPORTING-COMPONENTS",
      type: "component",
      title: "Lifecycle Reporting components",
      purpose:
        "Show ledger, observations, maturity, comparability, projection, content policy, rendering, and read-only access.",
      audience: ["engineering", "architecture", "workflow-authors"],
      scopeElementId: "EL-RUN-REPORTING",
      elementIds: reportingIds,
    }),
  ];

  const scope = {
    level: "change",
    boundary:
      "Cross-cutting RunLedger, LifecycleRunReport, and Core ready-frontier derivation over the approved V1 lifecycle.",
    in: [
      "Standardized immutable module, Gate, adapter, checkpoint, approval, and progression records",
      "Explicitly non-authoritative host observations with availability dispositions",
      "Evidence-backed adapter maturity and run-comparability decisions",
      "Read-only TraceabilityGraph snapshot joins and coverage diagnostics",
      "Deterministic content policy and LifecycleRunReport.md projection",
      "Core-derived ready frontiers from a static DAG and verified integrated-completion facts",
      "JSON-schema contract intent for every structured reporting and frontier handoff",
    ],
    out: [
      "Workflow routing, adapter selection, Gate approval, evidence satisfaction, or artifact promotion by reporting",
      "Module-specific business transformations",
      "Specialist assignment, scheduling, concrete executor binding, or work execution",
      "Deployment, production verification, monitoring, and operations lifecycle extensions",
      "Fabricated timing, token, cost, success, or maturity values",
    ],
  };

  const openSpecDesign = `# Lifecycle run reporting design

## Context

DevRelay needs one human-readable view of an arbitrary deterministic circuit without allowing telemetry or presentation to become workflow authority. The approved dependency artifact is static, while execution must repeatedly derive current ready work from verified integrated completion.

## Decision

Generic Core emits trusted standardized lifecycle facts and stores verified integrated-completion facts separately from the static DAG. A Core-owned resolver derives each ready frontier. Cross-cutting Lifecycle Reporting appends trusted records and explicitly non-authoritative host observations to a content-addressed ledger, resolves evidence-backed adapter maturity and run comparability, joins one exact TraceabilityGraph snapshot, applies deterministic content policy, and renders byte-stable LifecycleRunReport.md.

## Contract consequence

Run records, observations, lifecycle snapshots, content-policy decisions, integrated completion facts, and ready-frontier results require provider-neutral JSON Schema contracts before WorkBreakdown.

## Boundaries

Reporting cannot route modules, select adapters, mutate canonical artifacts or TraceabilityGraph, satisfy evidence, approve Gates, or alter progression. Missing observations remain explicitly not-reported or not-applicable.
`;

  const interfaces = structuredClone(
    baseSections.interfaceIntent.content.interfaces,
  );
  interfaces.push(
    interfaceIntent({
      id: "IF-RUN-WORKFLOW-FACTS",
      name: "Trusted workflow fact append",
      providerElementId: "EL-RUN-FACT-RECORDER",
      consumerElementIds: ["EL-RUN-LEDGER"],
      inputs: [
        "Exact module, Gate, adapter, checkpoint, approval, and progression facts",
      ],
      outputs: ["Content-addressed RunRecord append receipt"],
      requirementIds: [
        RUN.inspect,
        RUN.deterministic,
        RUN.nonAuthority,
        DEV.artifacts,
      ],
      failureBehavior:
        "Reject invalid lineage, authority, duplicate identity with divergent bytes, or non-canonical ordering without changing the ledger.",
      securityPrivacyIntent: [
        "Trusted facts contain references and bounded summaries rather than secret values or unrestricted logs",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-HOST-OBSERVATIONS",
      name: "Non-authoritative host observation append",
      providerElementId: "EL-RUN-OBSERVATION-INGRESS",
      consumerElementIds: ["EL-RUN-LEDGER"],
      inputs: [
        "Sourced duration, wait, adapter-call, retry, replay, token, and cost observations",
      ],
      outputs: ["Validated RunObservation or explicit rejection"],
      requirementIds: [
        RUN.performance,
        RUN.observability,
        RUN.privacy,
        RUN.nonAuthority,
      ],
      failureBehavior:
        "Reject missing provenance, invalid availability disposition, secret-bearing content, or attempted authority without changing lifecycle state.",
      securityPrivacyIntent: [
        "Observation content follows least-content collection and explicit sensitivity classification",
        "Credentials, secrets, prompts, and raw tool logs are excluded by default",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-LIFECYCLE-SNAPSHOT",
      name: "Canonical lifecycle run snapshot",
      providerElementId: "EL-RUN-SNAPSHOT-PROJECTOR",
      consumerElementIds: [
        "EL-RUN-CONTENT-POLICY",
        "EL-RUN-MARKDOWN-RENDERER",
      ],
      inputs: [
        "Exact RunLedger lineage",
        "Exact TraceabilityGraph checkpoint",
        "Adapter maturity and comparability dispositions",
      ],
      outputs: [
        "LifecycleRunSnapshot with stages, artifacts, metrics, paths, diagnostics, and next action",
      ],
      requirementIds: [
        RUN.inspect,
        RUN.performance,
        RUN.maturity,
        RUN.deterministic,
        RUN.nonAuthority,
        DEV.traceable,
      ],
      failureBehavior:
        "Fail closed on unresolvable lineage, graph mismatch, unknown record kind, or missing metric availability disposition.",
      securityPrivacyIntent: [
        "Snapshot fields are classified before rendering and retain content-addressed source links",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-COMPARABILITY",
      name: "Exact run comparability decision",
      providerElementId: "EL-RUN-COMPARABILITY",
      consumerElementIds: ["EL-RUN-SNAPSHOT-PROJECTOR"],
      inputs: [
        "Exact module, operation, input, policy, circuit, and host comparison dimensions",
      ],
      outputs: ["Comparable or non-comparable disposition with reasons"],
      requirementIds: [
        RUN.performance,
        RUN.observability,
        RUN.deterministic,
      ],
      failureBehavior:
        "Return non-comparable for missing or mismatched dimensions; never infer relative performance.",
      securityPrivacyIntent: [
        "Comparison uses digests and bounded host classifications rather than sensitive environment contents",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-CONTENT-POLICY",
      name: "Deterministic report content policy",
      providerElementId: "EL-RUN-CONTENT-POLICY",
      consumerElementIds: ["EL-RUN-MARKDOWN-RENDERER"],
      inputs: ["Canonical LifecycleRunSnapshot field set"],
      outputs: ["Allow, omit, or redact disposition for every protected field"],
      requirementIds: [RUN.privacy, RUN.inspect, RUN.nonAuthority],
      failureBehavior:
        "Unknown classification or policy failure omits protected content and records an explicit disposition.",
      securityPrivacyIntent: [
        "Default-deny secret, credential, unrestricted prompt, and raw tool-log content",
        "Redaction preserves audit references without protected bytes",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-REPORT-ACCESS",
      name: "Read-only lifecycle report access",
      providerElementId: "EL-RUN-REPORT-PORT",
      consumerElementIds: ["EL-WB-DOWNSTREAM"],
      inputs: ["Exact run identity and optional validated report view selector"],
      outputs: [
        "LifecycleRunReport.md",
        "LifecycleRunSnapshot reference",
        "Linked evidence references",
      ],
      requirementIds: [
        RUN.inspect,
        RUN.performance,
        RUN.deterministic,
        RUN.privacy,
        RUN.nonAuthority,
        DEV.portable,
      ],
      failureBehavior:
        "Unknown runs or invalid selectors fail without returning unrelated or unredacted data.",
      securityPrivacyIntent: [
        "Access is read-only and returns only content-policy-approved report bytes",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-INTEGRATED-COMPLETION",
      name: "Verified integrated-completion fact",
      providerElementId: "EL-RUN-COMPLETION-REGISTRY",
      consumerElementIds: ["EL-RUN-FRONTIER-RESOLVER"],
      inputs: [
        "Exact WorkItem, ChangeSet, passing verification, and integration evidence references",
      ],
      outputs: ["Immutable IntegratedCompletionFact"],
      requirementIds: [RUN.frontier, DEV.gates, DEV.traceable],
      failureBehavior:
        "Reject missing, stale, candidate-only, failing, or unrelated verification and integration evidence.",
      securityPrivacyIntent: [
        "Completion facts contain artifact references and bounded dispositions rather than code or credentials",
      ],
    }),
    interfaceIntent({
      id: "IF-RUN-READY-FRONTIER",
      name: "Deterministic ready-frontier derivation",
      providerElementId: "EL-RUN-FRONTIER-RESOLVER",
      consumerElementIds: ["EL-WB-DOWNSTREAM"],
      inputs: [
        "Immutable WorkDependencyBaseline",
        "Approved IntegratedCompletionFact set",
      ],
      outputs: [
        "Ready WorkItem IDs",
        "Blocked, completed, and failed dependency dispositions",
      ],
      requirementIds: [
        RUN.frontier,
        RUN.deterministic,
        DEV.orchestrate,
        DEV.gates,
      ],
      failureBehavior:
        "Reject DAG drift, unknown work items, conflicting completion facts, or readiness inferred from assignment or unintegrated work.",
      securityPrivacyIntent: [
        "The resolver reads only approved dependency and completion facts and cannot execute work",
      ],
    }),
  );

  const constraints = structuredClone(
    baseSections.architectureConstraints.content.constraints,
  );
  constraints.push(
    constraint(
      "CON-RUN-NON-AUTHORITY",
      "organizational",
      "RunLedger, host observations, snapshots, and reports cannot route modules, select adapters, mutate canonical artifacts or TraceabilityGraph, satisfy evidence, approve Gates, or alter progression.",
      [
        { kind: "element", id: "EL-RUN-REPORTING" },
        { kind: "element", id: "EL-RUN-SNAPSHOT-PROJECTOR" },
      ],
      [RUN.nonAuthority, RUN.inspect, DEV.gates],
    ),
    constraint(
      "CON-RUN-APPEND-ONLY",
      "data",
      "RunLedger records are append-only, content-addressed, execution-bound, and reject duplicate identities with divergent bytes.",
      [
        { kind: "element", id: "EL-RUN-LEDGER" },
        { kind: "interface", id: "IF-RUN-WORKFLOW-FACTS" },
      ],
      [RUN.inspect, RUN.deterministic, RUN.observability, DEV.artifacts],
    ),
    constraint(
      "CON-RUN-OBSERVATION-DISPOSITION",
      "data",
      "Every configured observation is captured with exact provenance or explicitly not-reported or not-applicable; absence is never interpreted as zero.",
      [
        { kind: "element", id: "EL-RUN-OBSERVATION-INGRESS" },
        { kind: "interface", id: "IF-RUN-HOST-OBSERVATIONS" },
      ],
      [RUN.performance, RUN.observability],
    ),
    constraint(
      "CON-RUN-DYNAMIC-PROJECTION",
      "operational",
      "Lifecycle projection discovers stages, Gates, adapters, branches, retries, resumes, and frontiers from standardized records without module or product identifier branches.",
      [{ kind: "element", id: "EL-RUN-SNAPSHOT-PROJECTOR" }],
      [RUN.inspect, RUN.deterministic, DEV.extend, DEV.neutral],
    ),
    constraint(
      "CON-RUN-BYTE-DETERMINISM",
      "operational",
      "Identical ledger, graph, maturity, policy, and renderer inputs produce byte-identical LifecycleRunSnapshot and LifecycleRunReport.md artifacts.",
      [
        { kind: "element", id: "EL-RUN-SNAPSHOT-PROJECTOR" },
        { kind: "element", id: "EL-RUN-MARKDOWN-RENDERER" },
      ],
      [RUN.deterministic, RUN.inspect],
    ),
    constraint(
      "CON-RUN-COMPARABILITY",
      "operational",
      "Relative performance claims require an explicit comparable disposition over module, operation, input, policy, circuit, and relevant host dimensions.",
      [
        { kind: "element", id: "EL-RUN-COMPARABILITY" },
        { kind: "interface", id: "IF-RUN-COMPARABILITY" },
      ],
      [RUN.performance, RUN.observability, RUN.deterministic],
    ),
    constraint(
      "CON-RUN-CONTENT-POLICY",
      "security",
      "Reports exclude secrets, credentials, unrestricted prompts, and raw tool logs by default while preserving content-addressed audit links and explicit redaction or omission dispositions.",
      [
        { kind: "element", id: "EL-RUN-CONTENT-POLICY" },
        { kind: "interface", id: "IF-RUN-CONTENT-POLICY" },
      ],
      [RUN.privacy, RUN.inspect],
    ),
    constraint(
      "CON-RUN-MATURITY-VOCABULARY",
      "data",
      "Adapter binding maturity is exactly contract-defined, fixture-conformant, live-conformant, or release-ready and is never conflated with a Core-owned implementation.",
      [{ kind: "element", id: "EL-RUN-MATURITY-RESOLVER" }],
      [RUN.maturity, DEV.extend, DEV.neutral],
    ),
    constraint(
      "CON-RUN-STATIC-DAG",
      "operational",
      "The WorkDependencyBaseline remains immutable; Core derives readiness only from that DAG plus separately approved verified integrated-completion facts.",
      [
        { kind: "element", id: "EL-RUN-COMPLETION-REGISTRY" },
        { kind: "element", id: "EL-RUN-FRONTIER-RESOLVER" },
      ],
      [RUN.frontier, RUN.deterministic, DEV.gates],
    ),
    constraint(
      "CON-RUN-CROSS-CUTTING",
      "organizational",
      "Lifecycle Reporting and TraceabilityGraph remain cross-cutting infrastructure and cannot appear as additional lifecycle stages.",
      [
        { kind: "element", id: "EL-RUN-REPORTING" },
        { kind: "element", id: "EL-DEVRELAY-GRAPH" },
      ],
      [RUN.inspect, RUN.nonAuthority, DEV.inventory],
    ),
  );

  const technicalDesign = {
    technicalDesignId: "TD-RUN-001",
    objective:
      "Add deterministic human-readable lifecycle reporting and safe ready-frontier derivation without moving workflow authority out of Generic Core.",
    scope,
    problemSummary:
      "DevRelay has exact module artifacts and traceability but no dynamic human-readable operational history, explicit metric availability model, comparable adapter evidence, or Core-owned repeating-frontier boundary.",
    solutionSummary:
      "Record trusted lifecycle facts and separately sourced observations in an append-only ledger, project one canonical snapshot with graph and maturity joins, apply deterministic comparability and content policy, render byte-stable Markdown, and derive ready frontiers from the static DAG plus verified integrated-completion facts.",
    requirementsDrivers: [
      "A human can understand any configured circuit without reading raw JSON.",
      "Every shown metric is sourced or explicitly unavailable.",
      "Reporting remains read-only and non-authoritative.",
      "Adapter maturity and performance claims are evidence-backed and comparable.",
      "Secrets and sensitive raw content do not leak into the report.",
      "Only verified integrated completion unlocks dependent work.",
    ],
    behaviorFlows: [
      "Generic Core derives and appends immutable standardized records for each trusted lifecycle transition.",
      "The host may append separately classified non-authoritative observations with exact provenance and availability.",
      "Adapter maturity and run comparability evaluators emit bounded evidence-backed dispositions.",
      "The snapshot projector loads one exact ledger lineage and TraceabilityGraph checkpoint and derives dynamic stages, paths, coverage diagnostics, metrics, and next action.",
      "Content policy deterministically allows, omits, or redacts protected fields.",
      "The Markdown renderer produces one byte-stable primary LifecycleRunReport.md plus a structured snapshot reference.",
      "After each verified integration, Core records an IntegratedCompletionFact and derives the next ready frontier from the immutable dependency baseline.",
    ],
    dataResponsibilities: [
      "RunRecord owns trusted module, Gate, adapter, checkpoint, approval, artifact, and progression facts.",
      "RunObservation owns sourced optional measurements and explicit availability and sensitivity dispositions.",
      "AdapterMaturityRecord owns exact binding identity, maturity status, and evidence.",
      "RunComparabilityDecision owns comparison dimensions, disposition, and mismatch reasons.",
      "LifecycleRunSnapshot owns the canonical dynamic report model and exact source lineage.",
      "IntegratedCompletionFact owns verified work-item completion lineage.",
      "ReadyFrontierResult owns current derived work dispositions and never mutates the DAG.",
    ],
    failureHandling: [
      "Invalid record identity, lineage, authority, or divergent duplicate bytes fail before append.",
      "Missing measurements render as explicit not-reported or not-applicable dispositions.",
      "Graph or run-lineage mismatch stops projection without changing workflow state.",
      "Unknown sensitivity defaults to omission and records a content-policy disposition.",
      "Non-comparable runs never produce relative performance claims.",
      "Stale DAGs or incomplete integration evidence prevent frontier release.",
    ],
    securityPrivacy: [
      "The observation boundary excludes credentials, secrets, prompts, and raw tool logs by default.",
      "Report projection uses content policy before rendering and preserves references rather than protected bytes.",
      "Report access is read-only and cannot mutate ledger, graph, artifacts, Gates, or progression.",
    ],
    performanceReliabilityOperability: [
      "Canonical sorting and content addressing make projection replayable across insertion orders.",
      "Ledger append and projection are separable so rendering failure does not lose source records.",
      "Metrics distinguish active execution, queueing, human approval wait, retry, and replay.",
      "Static-DAG frontier derivation avoids persisted waves and stale scheduling state.",
    ],
    compatibilityMigrationRollout: [
      "The projector discovers record kinds through registered contracts rather than module names.",
      "New module and Gate record producers can be added without renderer branches.",
      "Adapter maturity uses a closed versioned vocabulary and preserves historical evidence.",
      "V1 starts with file-backed records and Markdown; IDE and API surfaces consume the same contracts later.",
    ],
    verificationIntent: [
      "Test serial, conditional, skipped, failed, resumed, parallel, and repeating-frontier circuits.",
      "Test byte identity across insertion orders, checkpoint replay, and renderer restarts.",
      "Test missing metrics, comparability mismatches, invalid maturity claims, secret redaction, and report non-authority.",
      "Test business-to-acceptance graph joins, orphan and missing-evidence diagnostics, and source-link resolution.",
      "Test branching, joining, failed-item, retry, partial-frontier, and resumed readiness fixtures.",
      "Use real generated JSON schemas in ContractGeneration before WorkBreakdown.",
    ],
    interfaceIntentIds: interfaces
      .filter(({ id }) => id.startsWith("IF-RUN-"))
      .map(({ id }) => id),
    constraintIds: constraints
      .filter(({ id }) => id.startsWith("CON-RUN-"))
      .map(({ id }) => id),
    sourceRequirementIds: uniq(
      Object.values(RUN),
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
      id: "ADR-RUN-001",
      title: "Separate structured run truth from human-readable projection",
      chosen: "OPT-RUN-LEDGER-AND-PROJECTION",
      rejected: "OPT-RUN-MARKDOWN-AS-SOURCE",
      requirements: [RUN.inspect, RUN.deterministic, DEV.artifacts],
      targets: [
        { kind: "element", id: "EL-RUN-LEDGER" },
        { kind: "element", id: "EL-RUN-MARKDOWN-RENDERER" },
        { kind: "constraint", id: "CON-RUN-APPEND-ONLY" },
      ],
    },
    {
      id: "ADR-RUN-002",
      title: "Keep lifecycle reporting non-authoritative",
      chosen: "OPT-RUN-READ-ONLY-SIDECAR",
      rejected: "OPT-RUN-REPORT-DRIVES-PROGRESSION",
      requirements: [RUN.nonAuthority, RUN.inspect, DEV.gates],
      targets: [
        { kind: "element", id: "EL-RUN-REPORTING" },
        { kind: "constraint", id: "CON-RUN-NON-AUTHORITY" },
      ],
    },
    {
      id: "ADR-RUN-003",
      title: "Separate trusted lifecycle facts from host observations",
      chosen: "OPT-RUN-DUAL-AUTHORITY-STREAMS",
      rejected: "OPT-RUN-UNIFIED-IMPLICIT-TELEMETRY",
      requirements: [
        RUN.performance,
        RUN.observability,
        RUN.nonAuthority,
      ],
      targets: [
        { kind: "interface", id: "IF-RUN-WORKFLOW-FACTS" },
        { kind: "interface", id: "IF-RUN-HOST-OBSERVATIONS" },
        { kind: "constraint", id: "CON-RUN-OBSERVATION-DISPOSITION" },
      ],
    },
    {
      id: "ADR-RUN-004",
      title: "Project reports dynamically from registered record contracts",
      chosen: "OPT-RUN-RECORD-DRIVEN-PROJECTION",
      rejected: "OPT-RUN-MODULE-SPECIFIC-RENDERER",
      requirements: [
        RUN.inspect,
        RUN.deterministic,
        DEV.extend,
        DEV.neutral,
      ],
      targets: [
        { kind: "element", id: "EL-RUN-SNAPSHOT-PROJECTOR" },
        { kind: "constraint", id: "CON-RUN-DYNAMIC-PROJECTION" },
      ],
    },
    {
      id: "ADR-RUN-005",
      title: "Gate performance claims through explicit comparability",
      chosen: "OPT-RUN-EXACT-COMPARABILITY",
      rejected: "OPT-RUN-UNQUALIFIED-RANKING",
      requirements: [
        RUN.performance,
        RUN.observability,
        RUN.deterministic,
      ],
      targets: [
        { kind: "interface", id: "IF-RUN-COMPARABILITY" },
        { kind: "constraint", id: "CON-RUN-COMPARABILITY" },
      ],
    },
    {
      id: "ADR-RUN-006",
      title: "Apply deterministic content policy before rendering",
      chosen: "OPT-RUN-POLICY-BEFORE-RENDER",
      rejected: "OPT-RUN-POST-HOC-REDACTION",
      requirements: [RUN.privacy, RUN.inspect, RUN.nonAuthority],
      targets: [
        { kind: "element", id: "EL-RUN-CONTENT-POLICY" },
        { kind: "interface", id: "IF-RUN-CONTENT-POLICY" },
        { kind: "constraint", id: "CON-RUN-CONTENT-POLICY" },
      ],
    },
    {
      id: "ADR-RUN-007",
      title: "Derive ready frontiers from the static DAG and integrated facts",
      chosen: "OPT-RUN-DERIVED-FRONTIER",
      rejected: "OPT-RUN-PERSISTED-WAVES",
      requirements: [RUN.frontier, RUN.deterministic, DEV.orchestrate],
      targets: [
        { kind: "element", id: "EL-RUN-COMPLETION-REGISTRY" },
        { kind: "element", id: "EL-RUN-FRONTIER-RESOLVER" },
        { kind: "constraint", id: "CON-RUN-STATIC-DAG" },
      ],
    },
  ].map((entry) => ({ ...entry, supersedes: [] }));

  const assumptions = [
    {
      id: "ASM-RUN-BASELINE-CURRENT",
      statement:
        "The supplied ArchitectureBaseline is the current approved V0.4 architecture and the target requirements/ProjectOverview pair is exactly version 1.2.0.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-RUN-CONTRACT-GENERATION",
      statement:
        "Every new structured reporting, completion, and frontier interface requires JSON-schema ContractGeneration and ContractGate approval before WorkBreakdown.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-RUN-HOST-METRICS",
      statement:
        "Hosts may not expose timing, token, or cost data; explicit not-reported and not-applicable dispositions remain valid and visible.",
      status: "confirmed",
      blocking: false,
    },
  ];
  const risks = [
    {
      id: "RISK-RUN-AUTHORITY-LEAK",
      statement:
        "Operational reporting could accidentally influence routing, evidence, or Gate decisions.",
      impact:
        "Non-authoritative or incomplete telemetry could change deterministic engineering outcomes.",
      mitigation:
        "Expose read-only contracts, forbid progression outputs, and test report-driven mutation and approval attempts.",
    },
    {
      id: "RISK-RUN-MISSING-AS-ZERO",
      statement:
        "Missing host measurements could be rendered as zero or silently omitted.",
      impact:
        "Performance conclusions and optimization priorities would be misleading.",
      mitigation:
        "Require exact provenance or captured, not-reported, or not-applicable disposition for every configured metric.",
    },
    {
      id: "RISK-RUN-SECRET-LEAK",
      statement:
        "Raw prompts, tool logs, or host observations could expose protected content.",
      impact:
        "Human-readable reports could disclose credentials, secrets, or sensitive engineering context.",
      mitigation:
        "Apply deterministic default-deny content policy before rendering and preserve audit links instead of protected bytes.",
    },
    {
      id: "RISK-RUN-FALSE-COMPARISON",
      statement:
        "Runs with different inputs, policies, circuits, or hosts could be ranked as comparable.",
      impact:
        "Adapter selection and optimization would use invalid relative claims.",
      mitigation:
        "Require an exact comparability decision and render mismatches explicitly.",
    },
    {
      id: "RISK-RUN-EARLY-FRONTIER",
      statement:
        "Assignment or execution-start state could be mistaken for dependency completion.",
      impact:
        "Dependent work could run before prerequisites are verified and integrated.",
      mitigation:
        "Admit only separately approved IntegratedCompletionFacts and keep the WorkDependencyBaseline immutable.",
    },
  ];
  const alreadyDesignedTargets = new Map([
    [DEV.specify, [{ kind: "element", id: "EL-WB-MODULE" }]],
    [DEV.portable, [{ kind: "element", id: "EL-WB-ADAPTER-PORT" }]],
  ]);

  return {
    DEV,
    RUN,
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

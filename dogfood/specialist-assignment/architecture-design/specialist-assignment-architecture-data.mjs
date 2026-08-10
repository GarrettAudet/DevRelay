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
      type === "software-system" ? "" : "Provider-neutral DevRelay assignment",
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
      "Canonical provider-neutral profile-capability semantics",
      "Closed authority, assignment-policy, and validation dispositions",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Stable canonical behavior across compatible rankers and hosts",
      "Unknown profiles, fields, validators, or policy values fail closed",
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
      "Dedicated positive, negative, drift, replay, assignment-policy, authority, and traceability conformance fixtures.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildSpecialistAssignmentArchitecture({
  architectureBaseline,
  requirements,
}) {
  const CG = Object.freeze({
    generate: "US-DEV-SPECIALIST-ASSIGNMENT-001",
    deterministic: "NFR-DEV-SA-DETERMINISM-001",
    authority: "CON-DEV-SA-AUTHORITY-001",
    extension: "CON-DEV-SA-ONE-PROFILE-001",
    workBarrier: "CON-DEV-SA-EXECUTION-BARRIER-001",
  });
  const requiredIds = Object.values(CG);
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missingIds = requiredIds.filter((id) => !declaredIds.has(id));
  if (missingIds.length !== 0) {
    throw new Error(
      `SpecialistAssignment architecture drivers are absent from the approved requirements: ${missingIds.join(", ")}.`,
    );
  }

  const allNormativeIds = [...declaredIds];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-SPECIALIST-ASSIGNMENT-005";

  model.elements.push(
    architectureElement({
      id: "EL-SA-MODULE",
      name: "SpecialistAssignment",
      type: "container",
      parentId: "EL-DEVRELAY-SYSTEM",
      description:
        "Produces one complete typed assignment candidate by combining Core-approved eligibility sets with configured replaceable ranking, without owning approval.",
      responsibilities: [
        "Expose one assign-specialists operation over the complete approved work plan",
        "Invoke the configured ranker only after Core computes exact eligible profiles",
        "Return one complete SpecialistAssignmentDraft covering every approved work item or needs-clarification",
      ],
      sourceRequirementIds: Object.values(CG),
      tags: ["Container", "LifecycleModule", "SpecialistAssignment"],
    }),
    component(
      "EL-SA-RANKER-PORT",
      "Specialist Ranker Port",
      "EL-SA-MODULE",
      "Provider-neutral ranker boundary that accepts only Core-computed eligible profile sets for exact work items.",
      [
        "Pass exact work-item identities, eligible profile sets, tie policy, configuration, and grants",
        "Receive ranked profile selections, rationale, and subordinate native evidence without eligibility authority",
      ],
      [CG.generate, CG.extension, CG.authority],
      ["AdapterPort", "SpecialistAssignment"],
    ),
    component(
      "EL-SA-NATIVE-RANKER",
      "Native Structured Ranker",
      "EL-SA-MODULE",
      "V1 deterministic default ranker over Core-supplied eligible profile sets.",
      [
        "Select exactly one profile per work item using stable ordering and explicit tie policy",
        "Preserve ranker provenance, rationale, eligible-set digest, and selected-profile mapping",
      ],
      [CG.generate, CG.extension, CG.deterministic],
      ["AdapterBinding", "JsonSchema202012"],
    ),
    component(
      "EL-SA-OPTIONAL-ADAPTERS",
      "Optional Ranker Adapter Bridge",
      "EL-SA-MODULE",
      "Shared bounded port for optional policy-aware or future ranking implementations.",
      [
        "Use the same eligible-set input and ranked-selection output contract",
        "Keep optional binding maturity explicit and evidence-backed",
      ],
      [CG.generate, CG.extension, CG.authority],
      ["AdapterBinding", "Optional"],
    ),
    component(
      "EL-SA-INPUT-GUARD",
      "Assignment Input Guard",
      "EL-DEVRELAY-CORE",
      "Validates exact approved work, dependency, catalog, policy, project, and repository inputs before extension entry.",
      [
        "Select assign-specialists from exact approved work and catalog state",
        "Recompute a complete candidate when an exact current SpecialistAssignmentBaseline exists",
        "Reject an empty or uncovered approved work plan unless an explicit upstream no-work disposition exists",
      ],
      [CG.generate, CG.authority, CG.deterministic],
      ["CoreAuthority", "SpecialistAssignment"],
    ),
    component(
      "EL-SA-ELIGIBILITY-EVALUATOR",
      "Core Eligibility Evaluator",
      "EL-DEVRELAY-CORE",
      "Computes the exact eligible specialist profiles for each work item from capabilities, tools, grants, and assignment policy before ranking.",
      [
        "Validate catalog identities and enforce every hard capability, tool, grant, and policy constraint",
        "Return ordered eligible profile sets, exclusion reasons, policy identity, and exact input digest",
      ],
      [CG.generate, CG.deterministic, CG.authority, CG.extension],
      ["CoreAuthority", "Validation"],
    ),
    component(
      "EL-SA-CANDIDATE-ASSEMBLER",
      "Candidate Assembler",
      "EL-DEVRELAY-CORE",
      "Validates ranker selections against the eligible sets and assembles one complete canonical assignment candidate.",
      [
        "Require exactly one eligible selection for every approved work item and no unscoped assignment",
        "Canonicalize assignments, rationale, coverage, and prior-baseline comparison evidence",
      ],
      [CG.generate, CG.deterministic, CG.authority],
      ["CoreAuthority", "Assignment policy"],
    ),
    component(
      "EL-SA-GATE",
      "Specialist Assignment Gate",
      "EL-DEVRELAY-CORE",
      "Owns semantic completeness, assignment-policy policy, approval, and exact baseline promotion.",
      [
        "Require every approved WorkItem to be assigned exactly once to an eligible profile",
        "Reject partial candidates and independently verify policy, rationale, tools, grants, and evidence",
        "Promote only exact checkpoint-replayed bytes after approval",
      ],
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      ["CoreAuthority", "Gate"],
    ),
    component(
      "EL-SA-CANDIDATE-CONTRIBUTOR",
      "Assignment Candidate Traceability Contributor",
      "EL-DEVRELAY-GRAPH",
      "Projects validated candidate assignment relationships without making them authoritative.",
      [
        "Derive only declared candidate graph vocabulary from validated typed entries",
        "Preserve candidate scope and execution lineage",
      ],
      [CG.generate, CG.authority, CG.deterministic],
      ["TraceabilityContributor", "Candidate"],
    ),
    component(
      "EL-SA-APPROVED-CONTRIBUTOR",
      "Approved Assignment Baseline Observer",
      "EL-DEVRELAY-GRAPH",
      "Projects active assignment facts only from an exact SpecialistAssignmentGate promotion proof.",
      [
        "Activate WorkItem to SpecialistProfile assignment relationships after approval",
        "Retire or supersede prior assignment facts without deleting history",
      ],
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      ["TraceabilityContributor", "Approved"],
    ),
  );

  model.relationships.push(
    relationship(
      "REL-SA-ROUTE-INVOKE",
      "EL-SA-INPUT-GUARD",
      "EL-SA-RANKER-PORT",
      "Supplies the state-selected operation and exact configured ranker binding.",
      [CG.generate, CG.authority, CG.deterministic],
    ),
    relationship(
      "REL-SA-NATIVE-RANKER-PORT",
      "EL-SA-RANKER-PORT",
      "EL-SA-NATIVE-RANKER",
      "Invokes the declared native structured ranking ranker binding.",
      [CG.generate, CG.extension, CG.deterministic],
    ),
    relationship(
      "REL-SA-OPTIONAL-PORT",
      "EL-SA-RANKER-PORT",
      "EL-SA-OPTIONAL-ADAPTERS",
      "Invokes one configured optional profile-capability ranker through the same semantic port.",
      [CG.generate, CG.extension, CG.authority],
    ),
    relationship(
      "REL-SA-RANKER-ELIGIBILITY",
      "EL-SA-RANKER-PORT",
      "EL-SA-ELIGIBILITY-EVALUATOR",
      "Submits canonical draft entries and native bytes for independent eligibility validation.",
      [CG.generate, CG.deterministic, CG.authority],
    ),
    relationship(
      "REL-SA-ELIGIBILITY-ASSEMBLER",
      "EL-SA-ELIGIBILITY-EVALUATOR",
      "EL-SA-CANDIDATE-ASSEMBLER",
      "Supplies only validated normalized entries for exact baseline comparison.",
      [CG.generate, CG.deterministic, CG.authority],
    ),
    relationship(
      "REL-SA-ASSEMBLER-GATE",
      "EL-SA-CANDIDATE-ASSEMBLER",
      "EL-SA-GATE",
      "Supplies canonical change facts and assignment-policy evidence for Gate policy.",
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
    ),
    relationship(
      "REL-SA-ELIGIBILITY-GATE",
      "EL-SA-ELIGIBILITY-EVALUATOR",
      "EL-SA-GATE",
      "Supplies eligibility validation evidence for semantic completeness review.",
      [CG.generate, CG.authority, CG.deterministic],
    ),
    relationship(
      "REL-SA-CANDIDATE-TRACE",
      "EL-SA-RANKER-PORT",
      "EL-SA-CANDIDATE-CONTRIBUTOR",
      "Supplies the validated candidate result for non-authoritative traceability projection.",
      [CG.generate, CG.authority, CG.deterministic],
    ),
    relationship(
      "REL-SA-GATE-APPROVED-TRACE",
      "EL-SA-GATE",
      "EL-SA-APPROVED-CONTRIBUTOR",
      "Supplies exact SpecialistAssignmentGate promotion proof for active assignment projection.",
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
    ),
    relationship(
      "REL-SA-GATE-WORK-EXECUTION",
      "EL-SA-GATE",
      "EL-WDA-MODULE",
      "Supplies the approved complete assignment baseline for dependency-ordered WorkExecution frontier calculation.",
      [CG.generate, CG.authority, CG.workBarrier],
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
  const diagramViewSpecs = [
    ...priorViewSpecs,
    viewFor({
      viewKey: "VIEW-SA-CONTAINERS",
      type: "container",
      title: "DevRelay SpecialistAssignment containers",
      purpose:
        "Show SpecialistAssignment as one lifecycle module beside Generic Core, TraceabilityGraph, and downstream planning.",
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
      viewKey: "VIEW-SA-CORE-COMPONENTS",
      type: "component",
      title: "Generic Core assignment authority",
      purpose:
        "Show input guarding, Core-owned eligibility, complete candidate assembly, and SpecialistAssignmentGate authority.",
      audience: ["engineering", "architecture", "verification"],
      scopeElementId: "EL-DEVRELAY-CORE",
      elementIds: [
        "EL-SA-INPUT-GUARD",
        "EL-SA-ELIGIBILITY-EVALUATOR",
        "EL-SA-CANDIDATE-ASSEMBLER",
        "EL-SA-GATE",
      ],
    }),
    viewFor({
      viewKey: "VIEW-SA-MODULE-COMPONENTS",
      type: "component",
      title: "SpecialistAssignment adapter boundary",
      purpose:
        "Show the provider-neutral ranker port, deterministic native ranker, and optional ranker bridge.",
      audience: ["engineering", "architecture", "adapter-authors"],
      scopeElementId: "EL-SA-MODULE",
      elementIds: [
        "EL-SA-RANKER-PORT",
        "EL-SA-NATIVE-RANKER",
        "EL-SA-OPTIONAL-ADAPTERS",
      ],
    }),
    viewFor({
      viewKey: "VIEW-SA-TRACEABILITY-COMPONENTS",
      type: "component",
      title: "Assignment traceability projections",
      purpose:
        "Show separate candidate and approved contributors inside TraceabilityGraph.",
      audience: ["engineering", "architecture", "audit"],
      scopeElementId: "EL-DEVRELAY-GRAPH",
      elementIds: [
        "EL-SA-CANDIDATE-CONTRIBUTOR",
        "EL-SA-APPROVED-CONTRIBUTOR",
      ],
    }),
  ];

  const scope = {
    level: "change",
    boundary:
      "SpecialistAssignment and SpecialistAssignmentGate over the approved architecture work-item universe.",
    in: [
      "One full-snapshot assign-specialists operation",
      "Provider-neutral ranker port with native structured ranking as the first live binding",
      "Optional optional policy-aware rankers, and future bindings through the same assignment",
      "Independent Core-owned kind-specific eligibility validation",
      "Canonical assignment diff and assignment-policy evidence",
      "Typed SpecialistAssignmentDraft and SpecialistAssignmentRevisionDraft outcomes",
      "Separate candidate and approved traceability projections",
      "SpecialistAssignmentGate baseline and revision authority",
    ],
    out: [
      "Architecture intent creation or modification",
      "Work decomposition, assignment, scheduling, execution, or verification",
      "Adapter-authored graph operations or Gate decisions",
      "Implicit profile-capability selection or provider-specific Core branches",
      "Claiming optional ranker bindings are live before live conformance evidence exists",
    ],
  };

  const openSpecDesign = `# SpecialistAssignment design

## Context

Approved ArchitectureBaseline work items require machine-readable assignments before WorkExecution can plan implementation. Rankers must remain replaceable, while routing, validation, assignment-policy truth, traceability authority, and promotion stay in DevRelay Core and SpecialistAssignmentGate.

## Decision

SpecialistAssignment exposes one assign-specialists operation. Core supplies the complete approved work plan and exact catalogs and policies. Core computes exact eligible profile sets. A configured ranker selects only from those sets, Core validates every selection and assembles the complete typed candidate, and SpecialistAssignmentGate alone promotes the exact complete baseline. Trusted graph contributors separately project candidate and approved relationships.

## V1 bindings

A deterministic native structured ranker is the first live path. Optional future rankers use the same eligible-set and ranked-selection port and begin as fixture-conformant bindings.

## Consequences

The module remains provider-neutral and deterministic, ranker output is never approval authority, WorkExecution receives one explicit assignment disposition, and later ranking tools can be swapped without changing lifecycle semantics.
`;

  const interfaces = structuredClone(
    baseSections.interfaceIntent.content.interfaces,
  );
  interfaces.push(
    interfaceIntent({
      id: "IF-SA-RANKER-INVOCATION",
      name: "Bounded specialist ranker invocation",
      providerElementId: "EL-SA-RANKER-PORT",
      consumerElementIds: [
        "EL-SA-NATIVE-RANKER",
        "EL-SA-OPTIONAL-ADAPTERS",
      ],
      inputs: [
        "Exact assign-specialists operation",
        "Exact work-item identities and Core-computed eligible profile sets",
        "Stable tie policy and optional current-baseline comparison digest",
        "Configured ranker identity, version, options, and grants",
      ],
      outputs: [
        "One ranked SpecialistProfile selection and rationale per WorkItem",
        "NativeArtifactBundle",
        "Ranker provenance and diagnostics",
      ],
      requirementIds: [CG.generate, CG.extension, CG.authority, CG.deterministic],
      failureBehavior:
        "Reject missing work items, selections outside eligible sets, duplicate selections, invalid typed output, or ranker-selected scope.",
      securityPrivacyIntent: [
        "Adapters receive only exact declared inputs and grants and cannot access Gate or TraceabilityGraph services",
      ],
    }),
    interfaceIntent({
      id: "IF-SA-ELIGIBILITY-EVALUATION",
      name: "Independent assignment eligibility validation",
      providerElementId: "EL-SA-ELIGIBILITY-EVALUATOR",
      consumerElementIds: ["EL-SA-CANDIDATE-ASSEMBLER", "EL-SA-GATE"],
      inputs: [
        "Exact WorkBreakdownBaseline and WorkDependencyBaseline",
        "Version-pinned SpecialistCatalog and CapabilityCatalog",
        "Version-pinned AssignmentPolicy plus project and repository context",
      ],
      outputs: [
        "Ordered eligible SpecialistProfile set for every WorkItem",
        "Per-specialist-profile capability, tool, grant, and policy coverage evidence",
        "Closed exclusion reasons and eligibility-input digest",
      ],
      requirementIds: [CG.generate, CG.deterministic, CG.authority, CG.extension],
      failureBehavior:
        "Unknown work item, profile, capability, tool, grant, policy value, unresolved reference, or input drift fails closed before ranking.",
      securityPrivacyIntent: [
        "Eligibility evaluation is pure, read-only, and cannot rank profiles, rewrite work, or invoke undeclared network resolution",
      ],
    }),
    interfaceIntent({
      id: "IF-SA-CANDIDATE-ASSEMBLY",
      name: "Complete assignment candidate assembly",
      providerElementId: "EL-SA-CANDIDATE-ASSEMBLER",
      consumerElementIds: ["EL-SA-GATE"],
      inputs: [
        "Exact complete WorkBreakdownBaseline and optional current SpecialistAssignmentBaseline",
        "Core eligibility results and ranker selections",
        "Pinned assignment policy, tie policy, and canonical ordering rules",
      ],
      outputs: [
        "Complete canonical SpecialistAssignmentDraft and coverage proof",
        "Optional ordered prior-baseline comparison",
        "Selection rationale, eligible-set digests, and exclusion evidence",
      ],
      requirementIds: [CG.generate, CG.deterministic, CG.authority],
      failureBehavior:
        "Missing or duplicate work coverage, ineligible selection, unscoped assignment, stale baseline, invalid reference, or nondeterministic ordering stops before SpecialistAssignmentGate.",
      securityPrivacyIntent: [
        "The assembler is pure and reads only validated content-addressed work, eligibility, selection, and policy artifacts",
      ],
    }),
    interfaceIntent({
      id: "IF-SA-GATE-CANDIDATE",
      name: "SpecialistAssignmentGate candidate preparation",
      providerElementId: "EL-SA-GATE",
      consumerElementIds: ["EL-DEVRELAY-CORE"],
      inputs: [
        "Checkpoint-replayed typed candidate",
        "Core-owned eligibility and exclusion evidence",
        "Complete coverage, rationale, policy, and optional baseline-comparison evidence",
        "Exact owner or policy approval",
      ],
      outputs: [
        "SpecialistAssignmentBaseline",
        "SpecialistAssignment revision baseline",
        "Promotion proof and WorkExecution progression decision",
      ],
      requirementIds: [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      failureBehavior:
        "Uncovered work, duplicate or unscoped assignment, ineligible profile, invalid policy, missing approval, replay mismatch, or exact-byte drift blocks promotion.",
      securityPrivacyIntent: [
        "Only SpecialistAssignmentGate returns promotable raw bytes and progression authority",
      ],
    }),
    interfaceIntent({
      id: "IF-SA-CANDIDATE-TRACEABILITY",
      name: "Candidate assignment traceability projection",
      providerElementId: "EL-SA-CANDIDATE-CONTRIBUTOR",
      consumerElementIds: ["EL-DEVRELAY-GRAPH"],
      inputs: [
        "Validated SpecialistAssignment ModuleResult",
        "Exact WorkItem and SpecialistProfile references",
      ],
      outputs: [
        "Candidate-scoped WorkItem to SpecialistProfile proposed-assignment update",
        "Traceability checkpoint and merge proof",
      ],
      requirementIds: [CG.generate, CG.authority, CG.deterministic],
      failureBehavior:
        "Unknown work item or profile, arbitrary relationship, graph drift, or missing contributor fails before merge.",
      securityPrivacyIntent: [
        "The contributor is trusted Core infrastructure and accepts no adapter-authored graph operations",
      ],
    }),
    interfaceIntent({
      id: "IF-SA-APPROVED-TRACEABILITY",
      name: "Approved assignment traceability projection",
      providerElementId: "EL-SA-APPROVED-CONTRIBUTOR",
      consumerElementIds: ["EL-DEVRELAY-GRAPH"],
      inputs: [
        "Exact SpecialistAssignmentGate promotion proof",
        "Promoted complete SpecialistAssignmentBaseline artifact",
      ],
      outputs: [
        "Approved WorkItem to SpecialistProfile assigned-to facts",
        "Retirement or supersession updates",
        "Traceability checkpoint and merge proof",
      ],
      requirementIds: [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      failureBehavior:
        "Candidate-only evidence, stale promotion proof, divergent baseline bytes, or invalid retirement horizon fails before merge.",
      securityPrivacyIntent: [
        "Approved facts activate only after exact Gate promotion and preserve historical candidate lineage",
      ],
    }),
  );

  const constraints = structuredClone(
    baseSections.architectureConstraints.content.constraints,
  );
  constraints.push(
    constraint(
      "CON-SA-STATE-ROUTING",
      "operational",
      "Core invokes one assign-specialists operation over the complete approved work plan; no model or ranker selects routing, readiness, or a partial scope.",
      [
        { kind: "element", id: "EL-SA-INPUT-GUARD" },
        { kind: "interface", id: "IF-SA-GATE-CANDIDATE" },
      ],
      [CG.generate, CG.authority, CG.deterministic],
    ),
    constraint(
      "CON-SA-ADAPTER-NON-AUTHORITY",
      "organizational",
      "Assignment ranker adapters cannot route operations, select undeclared profiles, validate their own authority, approve assignment-policy, promote baselines, mutate TraceabilityGraph, or release WorkExecution.",
      [
        { kind: "element", id: "EL-SA-RANKER-PORT" },
        { kind: "element", id: "EL-SA-OPTIONAL-ADAPTERS" },
      ],
      [CG.generate, CG.authority, CG.extension],
    ),
    constraint(
      "CON-SA-INDEPENDENT-VALIDATION",
      "operational",
      "Every ranked selection is independently checked against the exact Core-owned eligible set before complete candidate assembly or Gate preparation.",
      [
        { kind: "element", id: "EL-SA-ELIGIBILITY-EVALUATOR" },
        { kind: "interface", id: "IF-SA-ELIGIBILITY-EVALUATION" },
      ],
      [CG.generate, CG.deterministic, CG.authority, CG.extension],
    ),
    constraint(
      "CON-SA-COMPLETE-SNAPSHOT",
      "data",
      "Assignment changes use a canonical complete comparison with ordered additions, modifications, removals, expected prior digests, target digests, and assignment-policy evidence.",
      [
        { kind: "element", id: "EL-SA-CANDIDATE-ASSEMBLER" },
        { kind: "interface", id: "IF-SA-CANDIDATE-ASSEMBLY" },
      ],
      [CG.generate, CG.deterministic, CG.authority],
    ),
    constraint(
      "CON-SA-RANKER-PORTABILITY",
      "organizational",
      "native structured ranker, optional policy-aware rankers, and future rankers bind through the same provider-neutral operation and typed candidate assignment; generic Core contains no product or interface-ID branches.",
      [
        { kind: "element", id: "EL-SA-RANKER-PORT" },
        { kind: "element", id: "EL-SA-OPTIONAL-ADAPTERS" },
      ],
      [CG.generate, CG.extension, CG.authority],
    ),
    constraint(
      "CON-SA-CHECKPOINT-REPLAY",
      "operational",
      "Effectful ranking checkpoints exact adapter results before candidate assembly; identical retry replays without adapter invocation and any baseline, catalog, binding, eligibility, or policy drift fails before adapter entry.",
      [{ kind: "interface", id: "IF-SA-RANKER-INVOCATION" }],
      [CG.generate, CG.deterministic, CG.authority],
    ),
    constraint(
      "CON-SA-TRACEABILITY-AUTHORITY",
      "organizational",
      "Candidate and approved assignment facts use separate trusted contributors, scopes, checkpoints, and merge proofs; candidate facts never satisfy an approved assignment reference.",
      [
        { kind: "element", id: "EL-SA-CANDIDATE-CONTRIBUTOR" },
        { kind: "element", id: "EL-SA-APPROVED-CONTRIBUTOR" },
      ],
      [CG.generate, CG.authority, CG.deterministic],
    ),
    constraint(
      "CON-SA-WORK-BARRIER",
      "organizational",
      "WorkExecution progression requires an exact approved complete SpecialistAssignmentBaseline and corresponding SpecialistAssignmentGate promotion proof.",
      [
        { kind: "element", id: "EL-SA-GATE" },
        { kind: "element", id: "EL-DEVRELAY-CORE" },
      ],
      [CG.generate, CG.authority, CG.workBarrier],
    ),
  );

  const technicalDesign = {
    technicalDesignId: "TD-SA-001",
    objective:
      "Generate complete typed assignment candidates through replaceable adapters while keeping routing, validation, assignment-policy, traceability, and promotion authority in DevRelay.",
    scope,
    problemSummary:
      "Approved WorkBreakdown items must be matched to eligible provider-neutral profiles before WorkExecution, but rankers cannot be trusted with eligibility, lifecycle, graph, or approval authority.",
    solutionSummary:
      "Invoke one full-snapshot SpecialistAssignment operation, compute eligibility in Core, let a configured ranker choose only among eligible profiles, assemble and validate the complete candidate in Core, project candidate traceability, and let SpecialistAssignmentGate alone promote the baseline and approved graph facts.",
    requirementsDrivers: [
      "Every approved WorkItem is assigned exactly once to an eligible profile or the complete candidate returns needs-clarification.",
      "Ranker implementations remain replaceable behind one semantic port.",
      "Validation and assignment-policy decisions are independent of rankers.",
      "Exact retry reuses checkpoints and drift stops before effects.",
      "Candidate and approved traceability never share authority.",
      "WorkExecution never consumes missing or candidate-only assignment truth.",
    ],
    behaviorFlows: [
      "Core resolves exact work, dependency, catalog, assignment state, project context, repository context, operation, ranker binding, and policy inputs.",
      "The configured adapter generates typed draft entries and subordinate native artifacts and is checkpointed before further processing.",
      "Core independently validates each entry through the pinned profile-capability validator.",
      "When a current baseline exists, Core computes a deterministic comparison as evidence without changing the single full-snapshot operation.",
      "The candidate contributor projects non-authoritative WorkItem to AssignmentDraft facts with an atomic merge proof.",
      "SpecialistAssignmentGate checks coverage, assignment-policy, replay, evidence, and approval and returns exact promotable bytes or a blocked decision.",
      "The approved observer activates WorkItem to Assignment facts, retires superseded facts, and releases WorkExecution only after promotion.",
    ],
    dataResponsibilities: [
      "SpecialistAssignment entry owns work-item identity, selected profile, capability coverage, tools, grants, rationale, execution-policy reference, and exact eligibility evidence.",
      "SpecialistAssignmentDraft owns the complete assign-specialists candidate universe.",
      "A revision is another complete SpecialistAssignmentDraft with an optional canonical comparison to the exact current baseline.",
      "EligibilityProof owns catalog and policy identity, exact input digest, eligible profiles, exclusions, and findings.",
      "AssignmentPolicyAssessment owns policy identity and assignment-policy dispositions without approval authority.",
      "SpecialistAssignmentBaseline owns only exact SpecialistAssignmentGate-promoted assignment truth.",
      "An upstream no-work disposition bypasses assignment; SpecialistAssignment itself never emits partial or not-applicable baselines.",
    ],
    failureHandling: [
      "Unknown or stale state, architecture, assignment baseline, adapter binding, validator, or policy fails before adapter entry.",
      "Invalid typed output or native-byte mismatch fails before checkpoint progression.",
      "Eligibility, reference resolution, complete coverage, deterministic assembly, or assignment-policy failure blocks SpecialistAssignmentGate.",
      "Missing or duplicate WorkItem coverage blocks promotion.",
      "Candidate traceability failure prevents a successful graph-aware execution record.",
      "Approved projection failure prevents atomic Gate completion and WorkExecution release.",
    ],
    securityPrivacy: [
      "Adapters receive explicit minimum grants and cannot access graph, Gate, secrets, or undeclared network endpoints.",
      "Validators resolve only allowed content-addressed local references unless policy explicitly declares a pinned source.",
      "Native artifacts remain subordinate evidence and cannot override canonical assignment bytes.",
    ],
    performanceReliabilityOperability: [
      "Canonical ordering and content addressing make validation, diff, Gate preparation, and traceability replayable.",
      "Effect checkpoints isolate ranker retries from pure validation and diff recomputation.",
      "Per-entry validation findings keep large assignment sets diagnosable without partial promotion.",
      "Closed binding maturity distinguishes the live native structured ranker path from fixture-conformant optional formats.",
    ],
    compatibilityMigrationRollout: [
      "V1 ships native structured ranking generation and validation first.",
      "OpenAPI, AsyncAPI, and Protobuf adapters use identical operation and result semantics as optional bindings.",
      "New catalogs, policies, and rankers register by exact version without Core product branches.",
      "Existing work items retain identity; later assignment changes compare against exact approved baseline bytes.",
    ],
    verificationIntent: [
      "Test the full-snapshot operation, re-assignment against a current baseline, and the no-eligible-profile clarification branch.",
      "Test exact WorkItem coverage, unscoped entries, duplicates, stale baselines, and binding drift.",
      "Run real native structured ranking compilation plus positive and negative instance fixtures.",
      "Test complete coverage, deterministic ordering, eligibility exclusions, prior-baseline comparison, and assignment-policy evidence.",
      "Test effect checkpoint replay with zero adapter calls and pure validation/diff determinism.",
      "Test separate candidate and approved graph scopes, atomic merges, retirement, and replay.",
      "Test WorkExecution rejects candidate-only, stale, or absent assignment dispositions.",
    ],
    interfaceIntentIds: interfaces
      .filter(({ id }) => id.startsWith("IF-SA-"))
      .map(({ id }) => id),
    constraintIds: constraints
      .filter(({ id }) => id.startsWith("CON-SA-"))
      .map(({ id }) => id),
    sourceRequirementIds: Object.values(CG),
    sourceRefs: [],
  };

  const decisionSpecs = [
    {
      id: "ADR-SA-001",
      title: "Use one full-snapshot assign-specialists operation",
      chosen: "OPT-SA-STATE-ROUTED-OPERATIONS",
      rejected: "OPT-SA-ADAPTER-SELECTED-OPERATION",
      requirements: [CG.generate, CG.authority, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-SA-INPUT-GUARD" },
        { kind: "constraint", id: "CON-SA-STATE-ROUTING" },
      ],
    },
    {
      id: "ADR-SA-002",
      title: "Separate generation from validation, diff, and Gate authority",
      chosen: "OPT-SA-SEPARATED-TRUST-BOUNDARIES",
      rejected: "OPT-SA-RANKER-OWNS-ELIGIBILITY",
      requirements: [CG.generate, CG.authority, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-SA-ELIGIBILITY-EVALUATOR" },
        { kind: "element", id: "EL-SA-CANDIDATE-ASSEMBLER" },
        { kind: "element", id: "EL-SA-GATE" },
      ],
    },
    {
      id: "ADR-SA-003",
      title: "Ship native structured ranking first behind a profile-capability port",
      chosen: "OPT-SA-NATIVE-RANKER-FIRST",
      rejected: "OPT-SA-RANKER-SPECIAL-CASES",
      requirements: [CG.generate, CG.extension, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-SA-RANKER-PORT" },
        { kind: "element", id: "EL-SA-NATIVE-RANKER" },
        { kind: "constraint", id: "CON-SA-RANKER-PORTABILITY" },
      ],
    },
    {
      id: "ADR-SA-004",
      title: "Use typed primary outputs with subordinate native artifacts",
      chosen: "OPT-SA-TYPED-CANDIDATE-SETS",
      rejected: "OPT-SA-NATIVE-FILES-AS-OUTCOME",
      requirements: [CG.generate, CG.authority, CG.deterministic],
      targets: [
        { kind: "interface", id: "IF-SA-RANKER-INVOCATION" },
        { kind: "interface", id: "IF-SA-GATE-CANDIDATE" },
      ],
    },
    {
      id: "ADR-SA-005",
      title: "Separate candidate and approved assignment traceability",
      chosen: "OPT-SA-DUAL-TRACEABILITY-SCOPES",
      rejected: "OPT-SA-CANDIDATE-ACTIVATES-ASSIGNMENT",
      requirements: [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-SA-CANDIDATE-CONTRIBUTOR" },
        { kind: "element", id: "EL-SA-APPROVED-CONTRIBUTOR" },
        { kind: "constraint", id: "CON-SA-TRACEABILITY-AUTHORITY" },
      ],
    },
  ].map((entry) => ({ ...entry, supersedes: [] }));

  const assumptions = [
    {
      id: "ASM-SA-BASELINE-CURRENT",
      statement:
        "The supplied ArchitectureBaseline is the exact approved lifecycle-reporting baseline and the target requirements/ProjectOverview pair is exactly version 1.3.0.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-SA-JSON-SCHEMA-FIRST",
      statement:
        "native structured ranking is the first live generation and validation path; optional formats remain fixture-conformant until live evidence exists.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-SA-GATE-DISPOSITION",
      statement:
        "SpecialistAssignmentGate alone owns baseline promotion and WorkExecution progression authority.",
      status: "confirmed",
      blocking: false,
    },
  ];
  const risks = [
    {
      id: "RISK-SA-SELF-HOSTING",
      statement:
        "SpecialistAssignment introduces assignment intents needed to describe its own typed boundaries.",
      impact:
        "A circular bootstrap could prevent the first SpecialistAssignmentBaseline from being established.",
      mitigation:
        "Bootstrap the released module schemas as version-pinned source assignments, then require the live native structured ranker path to regenerate and byte-or-semantically compare every required interface before Gate promotion.",
    },
    {
      id: "RISK-SA-GENERATOR-AUTHORITY",
      statement:
        "A ranker may return syntactically valid but incomplete or semantically incompatible assignments.",
      impact:
        "WorkExecution could plan against incomplete or unsafe interface truth.",
      mitigation:
        "Keep eligibility validation, canonical diff, semantic coverage, assignment-policy policy, and promotion outside the adapter.",
    },
    {
      id: "RISK-SA-FORMAT-LEAK",
      statement:
        "native structured ranker-specific concepts may leak into the canonical module assignment.",
      impact:
        "optional policy-aware rankers, or future adapters would require Core special cases.",
      mitigation:
        "Keep canonical entries typed by provider-neutral kind/dialect/bytes/evidence and register kind-specific validators at the edge.",
    },
    {
      id: "RISK-SA-FALSE-COMPATIBILITY",
      statement:
        "Canonical syntax diff alone may be mistaken for semantic assignment-policy.",
      impact:
        "Breaking changes could be approved as backward-compatible.",
      mitigation:
        "Store mechanical diff as evidence input and let SpecialistAssignmentGate apply an explicit kind-aware assignment-policy policy with approval.",
    },
    {
      id: "RISK-SA-CANDIDATE-ACTIVATION",
      statement:
        "Candidate assignment graph facts may be mistaken for approved implementation constraints.",
      impact:
        "Work planning could reference unapproved assignments.",
      mitigation:
        "Use separate contributors, scopes, edge vocabularies, checkpoints, and Gate-activated approved facts.",
    },
  ];

  const alreadyDesignedTargets = new Map();
  const baselineCollections = [
    ["element", baseSections.architectureModel.content.elements, ({ id }) => id],
    [
      "relationship",
      baseSections.architectureModel.content.relationships,
      ({ id }) => id,
    ],
    ["interface", baseSections.interfaceIntent.content.interfaces, ({ id }) => id],
    [
      "constraint",
      baseSections.architectureConstraints.content.constraints,
      ({ id }) => id,
    ],
    ["decision", baseSections.decisionRecords.content.decisions, ({ id }) => id],
  ];
  for (const [kind, items, idOf] of baselineCollections) {
    for (const item of items) {
      for (const requirementId of item.sourceRequirementIds ?? []) {
        const targets = alreadyDesignedTargets.get(requirementId) ?? [];
        targets.push({ kind, id: idOf(item) });
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
    decisionSpecs,
    technicalDesign,
    interfaces,
    constraints,
    assumptions,
    risks,
    uniq,
  };
}

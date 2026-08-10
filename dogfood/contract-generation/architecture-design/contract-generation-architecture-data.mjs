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
      type === "software-system" ? "" : "Provider-neutral DevRelay contract",
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
      "Canonical provider-neutral contract-kind semantics",
      "Closed authority, compatibility, and validation dispositions",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Stable canonical behavior across compatible generators and hosts",
      "Unknown contract kinds, fields, validators, or policy values fail closed",
    ],
    securityPrivacyIntent,
    deliveryConsistencyIntent: [
      "Validate canonical structured bytes before checkpoint or Gate preparation",
      "Preserve exact interface-intent, baseline, adapter, validator, and evidence lineage",
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
      "Dedicated positive, negative, drift, replay, compatibility, authority, and traceability conformance fixtures.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildContractGenerationArchitecture({
  architectureBaseline,
  requirements,
}) {
  const CG = Object.freeze({
    generate: "US-DEV-CONTRACT-GENERATION-001",
    deterministic: "NFR-DEV-CONTRACT-DETERMINISM-001",
    authority: "CON-DEV-CONTRACT-AUTHORITY-001",
    extension: "CON-DEV-CONTRACT-FORMAT-EXTENSION-001",
    workBarrier: "CON-DEV-CONTRACT-WORK-BREAKDOWN-BARRIER-001",
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
      `ContractGeneration architecture drivers are absent from the approved requirements: ${missingIds.join(", ")}.`,
    );
  }

  const allNormativeIds = [...declaredIds];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-CONTRACT-GENERATION-004";

  model.elements.push(
    architectureElement({
      id: "EL-CG-MODULE",
      name: "ContractGeneration",
      type: "container",
      parentId: "EL-DEVRELAY-SYSTEM",
      description:
        "Generates typed machine-readable contract candidates through configured replaceable adapters without owning approval.",
      responsibilities: [
        "Expose establish-contracts and generate-contract-change operations",
        "Invoke exactly configured contract-kind generators",
        "Return one typed ContractDraftSet or ContractChangeSetDraft",
      ],
      sourceRequirementIds: Object.values(CG),
      tags: ["Container", "LifecycleModule", "ContractGeneration"],
    }),
    component(
      "EL-CG-GENERATOR-PORT",
      "Contract Generator Port",
      "EL-CG-MODULE",
      "Provider-neutral adapter boundary for generating typed contract candidates from exact interface intent.",
      [
        "Pass only declared contract kind, exact inputs, configuration, and grants",
        "Receive canonical draft entries plus subordinate native artifacts",
      ],
      [CG.generate, CG.extension, CG.authority],
      ["AdapterPort", "ContractGeneration"],
    ),
    component(
      "EL-CG-JSON-SCHEMA-ADAPTER",
      "JSON Schema Generator Binding",
      "EL-CG-MODULE",
      "V1 live-conformant binding for JSON Schema draft 2020-12 generation.",
      [
        "Generate one schema candidate per declared JSON Schema interface intent",
        "Preserve native generator provenance and canonical entry mapping",
      ],
      [CG.generate, CG.extension, CG.deterministic],
      ["AdapterBinding", "JsonSchema202012"],
    ),
    component(
      "EL-CG-OPTIONAL-ADAPTERS",
      "Optional Contract Adapter Bridge",
      "EL-CG-MODULE",
      "Shared bounded port for OpenAPI, AsyncAPI, Protobuf, and future contract generators.",
      [
        "Use the same ContractGeneration operation and typed result contract",
        "Keep optional binding maturity explicit and evidence-backed",
      ],
      [CG.generate, CG.extension, CG.authority],
      ["AdapterBinding", "Optional"],
    ),
    component(
      "EL-CG-ROUTE-GUARD",
      "Contract State Route Guard",
      "EL-DEVRELAY-CORE",
      "Selects the ContractGeneration operation from exact approved contract state and architecture intent.",
      [
        "Select establish-contracts when no ContractBaseline exists",
        "Select generate-contract-change when an exact ContractBaseline exists",
        "Route zero-required-intent cases to ContractGate ApprovedNotApplicable preparation",
      ],
      [CG.generate, CG.authority, CG.deterministic],
      ["CoreAuthority", "ContractGeneration"],
    ),
    component(
      "EL-CG-VALIDATOR-REGISTRY",
      "Pinned Contract Validator Registry",
      "EL-DEVRELAY-CORE",
      "Runs version-pinned kind-specific format validators independently of generators.",
      [
        "Validate schema dialect, syntax, references, and canonical bytes",
        "Return exact validator identity, version, input digest, and findings",
      ],
      [CG.generate, CG.deterministic, CG.authority, CG.extension],
      ["CoreAuthority", "Validation"],
    ),
    component(
      "EL-CG-CANONICAL-DIFFER",
      "Canonical Contract Differ",
      "EL-DEVRELAY-CORE",
      "Computes additions, modifications, removals, prior and target digests, and compatibility facts.",
      [
        "Compare exact normalized contract baseline and candidate sets",
        "Canonicalize change ordering and compatibility evidence inputs",
      ],
      [CG.generate, CG.deterministic, CG.authority],
      ["CoreAuthority", "Compatibility"],
    ),
    component(
      "EL-CG-GATE",
      "Contract Gate",
      "EL-DEVRELAY-CORE",
      "Owns semantic completeness, compatibility policy, approval, and exact baseline or not-applicable promotion.",
      [
        "Require every contract-required InterfaceIntent to be covered exactly once",
        "Apply compatibility policy independently of generator claims",
        "Promote only exact checkpoint-replayed bytes after approval",
      ],
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      ["CoreAuthority", "Gate"],
    ),
    component(
      "EL-CG-CANDIDATE-CONTRIBUTOR",
      "Contract Candidate Traceability Contributor",
      "EL-DEVRELAY-GRAPH",
      "Projects validated candidate contract relationships without making them authoritative.",
      [
        "Derive only declared candidate graph vocabulary from validated typed entries",
        "Preserve candidate scope and execution lineage",
      ],
      [CG.generate, CG.authority, CG.deterministic],
      ["TraceabilityContributor", "Candidate"],
    ),
    component(
      "EL-CG-APPROVED-OBSERVER",
      "Approved Contract Baseline Observer",
      "EL-DEVRELAY-GRAPH",
      "Projects active contract facts only from an exact ContractGate promotion proof.",
      [
        "Activate InterfaceIntent to Contract relationships after approval",
        "Retire or supersede prior contract facts without deleting history",
      ],
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      ["TraceabilityContributor", "Approved"],
    ),
  );

  model.relationships.push(
    relationship(
      "REL-CG-ROUTE-INVOKE",
      "EL-CG-ROUTE-GUARD",
      "EL-CG-GENERATOR-PORT",
      "Supplies the state-selected operation and exact configured generator binding.",
      [CG.generate, CG.authority, CG.deterministic],
    ),
    relationship(
      "REL-CG-JSON-SCHEMA-PORT",
      "EL-CG-GENERATOR-PORT",
      "EL-CG-JSON-SCHEMA-ADAPTER",
      "Invokes the declared JSON Schema 2020-12 generator binding.",
      [CG.generate, CG.extension, CG.deterministic],
    ),
    relationship(
      "REL-CG-OPTIONAL-PORT",
      "EL-CG-GENERATOR-PORT",
      "EL-CG-OPTIONAL-ADAPTERS",
      "Invokes one configured optional contract-kind generator through the same semantic port.",
      [CG.generate, CG.extension, CG.authority],
    ),
    relationship(
      "REL-CG-PORT-VALIDATOR",
      "EL-CG-GENERATOR-PORT",
      "EL-CG-VALIDATOR-REGISTRY",
      "Submits canonical draft entries and native bytes for independent format validation.",
      [CG.generate, CG.deterministic, CG.authority],
    ),
    relationship(
      "REL-CG-VALIDATOR-DIFFER",
      "EL-CG-VALIDATOR-REGISTRY",
      "EL-CG-CANONICAL-DIFFER",
      "Supplies only validated normalized entries for exact baseline comparison.",
      [CG.generate, CG.deterministic, CG.authority],
    ),
    relationship(
      "REL-CG-DIFFER-GATE",
      "EL-CG-CANONICAL-DIFFER",
      "EL-CG-GATE",
      "Supplies canonical change facts and compatibility evidence for Gate policy.",
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
    ),
    relationship(
      "REL-CG-VALIDATOR-GATE",
      "EL-CG-VALIDATOR-REGISTRY",
      "EL-CG-GATE",
      "Supplies format validation evidence for semantic completeness review.",
      [CG.generate, CG.authority, CG.deterministic],
    ),
    relationship(
      "REL-CG-CANDIDATE-TRACE",
      "EL-CG-GENERATOR-PORT",
      "EL-CG-CANDIDATE-CONTRIBUTOR",
      "Supplies the validated candidate result for non-authoritative traceability projection.",
      [CG.generate, CG.authority, CG.deterministic],
    ),
    relationship(
      "REL-CG-GATE-APPROVED-TRACE",
      "EL-CG-GATE",
      "EL-CG-APPROVED-OBSERVER",
      "Supplies exact ContractGate promotion proof for active contract projection.",
      [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
    ),
    relationship(
      "REL-CG-GATE-WORK-BREAKDOWN",
      "EL-CG-GATE",
      "EL-WB-MODULE",
      "Releases WorkBreakdown only with an approved ContractBaseline or ApprovedNotApplicable disposition.",
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
      viewKey: "VIEW-CG-CONTAINERS",
      type: "container",
      title: "DevRelay ContractGeneration containers",
      purpose:
        "Show ContractGeneration as one lifecycle module beside Generic Core, TraceabilityGraph, and downstream planning.",
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
      viewKey: "VIEW-CG-CORE-COMPONENTS",
      type: "component",
      title: "Generic Core contract authority",
      purpose:
        "Show state routing, independent format validation, canonical diff, and ContractGate authority.",
      audience: ["engineering", "architecture", "verification"],
      scopeElementId: "EL-DEVRELAY-CORE",
      elementIds: [
        "EL-CG-ROUTE-GUARD",
        "EL-CG-VALIDATOR-REGISTRY",
        "EL-CG-CANONICAL-DIFFER",
        "EL-CG-GATE",
      ],
    }),
    viewFor({
      viewKey: "VIEW-CG-MODULE-COMPONENTS",
      type: "component",
      title: "ContractGeneration adapter boundary",
      purpose:
        "Show the provider-neutral generator port, V1 JSON Schema binding, and optional format bindings.",
      audience: ["engineering", "architecture", "adapter-authors"],
      scopeElementId: "EL-CG-MODULE",
      elementIds: [
        "EL-CG-GENERATOR-PORT",
        "EL-CG-JSON-SCHEMA-ADAPTER",
        "EL-CG-OPTIONAL-ADAPTERS",
      ],
    }),
    viewFor({
      viewKey: "VIEW-CG-TRACEABILITY-COMPONENTS",
      type: "component",
      title: "Contract traceability projections",
      purpose:
        "Show separate candidate and approved contributors inside TraceabilityGraph.",
      audience: ["engineering", "architecture", "audit"],
      scopeElementId: "EL-DEVRELAY-GRAPH",
      elementIds: [
        "EL-CG-CANDIDATE-CONTRIBUTOR",
        "EL-CG-APPROVED-OBSERVER",
      ],
    }),
  ];

  const scope = {
    level: "change",
    boundary:
      "ContractGeneration and ContractGate over the approved architecture interface-intent universe.",
    in: [
      "State-routed establish-contracts and generate-contract-change operations",
      "Provider-neutral generator port with JSON Schema 2020-12 as the first live binding",
      "Optional OpenAPI, AsyncAPI, Protobuf, and future bindings through the same contract",
      "Independent Core-owned kind-specific format validation",
      "Canonical contract diff and compatibility evidence",
      "Typed ContractDraftSet and ContractChangeSetDraft outcomes",
      "Separate candidate and approved traceability projections",
      "ContractGate baseline, change, and ApprovedNotApplicable authority",
    ],
    out: [
      "Architecture intent creation or modification",
      "Work decomposition, assignment, scheduling, execution, or verification",
      "Adapter-authored graph operations or Gate decisions",
      "Implicit contract-kind selection or provider-specific Core branches",
      "Claiming optional generator bindings are live before live conformance evidence exists",
    ],
  };

  const openSpecDesign = `# ContractGeneration design

## Context

Approved ArchitectureBaseline interface intents require machine-readable contracts before WorkBreakdown can plan implementation. Generators must remain replaceable, while routing, validation, compatibility truth, traceability authority, and promotion stay in DevRelay Core and ContractGate.

## Decision

ContractGeneration exposes establish-contracts and generate-contract-change. Core selects the operation from exact contract state. A configured contract-kind adapter generates a typed candidate and native artifacts. Core independently runs a pinned validator and canonical differ. ContractGate evaluates completeness and compatibility and alone promotes ContractBaseline or ApprovedNotApplicable. Trusted graph contributors separately project candidate and approved relationships.

## V1 bindings

JSON Schema draft 2020-12 is the first live generation and validation path. OpenAPI, AsyncAPI, Protobuf, and future formats use the same semantic port and begin as fixture-conformant optional bindings.

## Consequences

The module remains provider-neutral and deterministic, generator output is never approval authority, WorkBreakdown receives one explicit contract disposition, and later format tools can be swapped without changing lifecycle semantics.
`;

  const interfaces = structuredClone(
    baseSections.interfaceIntent.content.interfaces,
  );
  interfaces.push(
    interfaceIntent({
      id: "IF-CG-GENERATOR-INVOCATION",
      name: "Bounded contract generator invocation",
      providerElementId: "EL-CG-GENERATOR-PORT",
      consumerElementIds: [
        "EL-CG-JSON-SCHEMA-ADAPTER",
        "EL-CG-OPTIONAL-ADAPTERS",
      ],
      inputs: [
        "State-selected operation",
        "Exact required InterfaceIntent set",
        "Current ContractBaseline when changing contracts",
        "Configured contract kind, adapter version, options, and grants",
      ],
      outputs: [
        "Typed ContractDraftSet or ContractChangeSetDraft proposal",
        "NativeArtifactBundle",
        "Generator provenance and diagnostics",
      ],
      requirementIds: [CG.generate, CG.extension, CG.authority, CG.deterministic],
      failureBehavior:
        "Reject missing intent coverage, undeclared contract kinds, stale baselines, invalid typed output, or adapter-selected routing.",
      securityPrivacyIntent: [
        "Adapters receive only exact declared inputs and grants and cannot access Gate or TraceabilityGraph services",
      ],
    }),
    interfaceIntent({
      id: "IF-CG-FORMAT-VALIDATION",
      name: "Independent contract format validation",
      providerElementId: "EL-CG-VALIDATOR-REGISTRY",
      consumerElementIds: ["EL-CG-CANONICAL-DIFFER", "EL-CG-GATE"],
      inputs: [
        "Canonical contract candidate bytes",
        "Declared contract kind and dialect",
        "Pinned validator identity, version, and policy",
      ],
      outputs: [
        "Validation disposition",
        "Normalized contract digest",
        "Closed validation finding set and validator evidence",
      ],
      requirementIds: [CG.generate, CG.deterministic, CG.authority, CG.extension],
      failureBehavior:
        "Unknown kind, dialect, validator, unresolved reference, invalid bytes, or validator drift fails closed before Gate preparation.",
      securityPrivacyIntent: [
        "Validation is read-only and cannot rewrite candidate bytes or invoke undeclared network resolution",
      ],
    }),
    interfaceIntent({
      id: "IF-CG-CANONICAL-DIFF",
      name: "Canonical contract change analysis",
      providerElementId: "EL-CG-CANONICAL-DIFFER",
      consumerElementIds: ["EL-CG-GATE"],
      inputs: [
        "Exact current ContractBaseline",
        "Validated normalized candidate set",
        "Pinned compatibility vocabulary",
      ],
      outputs: [
        "Ordered additions, modifications, and removals",
        "Expected prior and target digests",
        "Compatibility evidence inputs",
      ],
      requirementIds: [CG.generate, CG.deterministic, CG.authority],
      failureBehavior:
        "Baseline drift, duplicate identity, ambiguous rename, invalid reference, or nondeterministic normalization stops before ContractGate.",
      securityPrivacyIntent: [
        "The differ is pure and reads only validated content-addressed contract artifacts",
      ],
    }),
    interfaceIntent({
      id: "IF-CG-GATE-CANDIDATE",
      name: "ContractGate candidate preparation",
      providerElementId: "EL-CG-GATE",
      consumerElementIds: ["EL-WB-MODULE"],
      inputs: [
        "Checkpoint-replayed typed candidate",
        "Independent format-validation evidence",
        "Canonical diff and compatibility evidence",
        "Exact owner or policy approval",
      ],
      outputs: [
        "ContractBaseline",
        "Updated ContractBaseline",
        "ApprovedNotApplicable disposition",
        "Promotion proof and WorkBreakdown progression decision",
      ],
      requirementIds: [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      failureBehavior:
        "Uncovered required intent, unscoped contract, invalid compatibility, missing approval, replay mismatch, or exact-byte drift blocks promotion.",
      securityPrivacyIntent: [
        "Only ContractGate returns promotable raw bytes and progression authority",
      ],
    }),
    interfaceIntent({
      id: "IF-CG-CANDIDATE-TRACEABILITY",
      name: "Candidate contract traceability projection",
      providerElementId: "EL-CG-CANDIDATE-CONTRIBUTOR",
      consumerElementIds: ["EL-DEVRELAY-GRAPH"],
      inputs: [
        "Validated ContractGeneration ModuleResult",
        "Exact InterfaceIntent and draft-entry references",
      ],
      outputs: [
        "Candidate-scoped InterfaceIntent to ContractDraft update",
        "Traceability checkpoint and merge proof",
      ],
      requirementIds: [CG.generate, CG.authority, CG.deterministic],
      failureBehavior:
        "Unknown intent, undeclared draft, arbitrary relationship, graph drift, or missing contributor fails before merge.",
      securityPrivacyIntent: [
        "The contributor is trusted Core infrastructure and accepts no adapter-authored graph operations",
      ],
    }),
    interfaceIntent({
      id: "IF-CG-APPROVED-TRACEABILITY",
      name: "Approved contract traceability projection",
      providerElementId: "EL-CG-APPROVED-OBSERVER",
      consumerElementIds: ["EL-DEVRELAY-GRAPH"],
      inputs: [
        "Exact ContractGate promotion proof",
        "Promoted ContractBaseline or ApprovedNotApplicable artifact",
      ],
      outputs: [
        "Approved InterfaceIntent to Contract facts",
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
      "CON-CG-STATE-ROUTING",
      "operational",
      "Core selects establish-contracts or generate-contract-change solely from exact contract state; only ContractGate may select ApprovedNotApplicable from an approved zero-required-intent architecture.",
      [
        { kind: "element", id: "EL-CG-ROUTE-GUARD" },
        { kind: "interface", id: "IF-CG-GATE-CANDIDATE" },
      ],
      [CG.generate, CG.authority, CG.deterministic],
    ),
    constraint(
      "CON-CG-ADAPTER-NON-AUTHORITY",
      "organizational",
      "Contract generator adapters cannot route operations, select undeclared contract kinds, validate their own authority, approve compatibility, promote baselines, mutate TraceabilityGraph, or release WorkBreakdown.",
      [
        { kind: "element", id: "EL-CG-GENERATOR-PORT" },
        { kind: "element", id: "EL-CG-OPTIONAL-ADAPTERS" },
      ],
      [CG.generate, CG.authority, CG.extension],
    ),
    constraint(
      "CON-CG-INDEPENDENT-VALIDATION",
      "operational",
      "Every generated contract is independently validated by a version-pinned kind-specific Core validator before canonical diff or ContractGate preparation.",
      [
        { kind: "element", id: "EL-CG-VALIDATOR-REGISTRY" },
        { kind: "interface", id: "IF-CG-FORMAT-VALIDATION" },
      ],
      [CG.generate, CG.deterministic, CG.authority, CG.extension],
    ),
    constraint(
      "CON-CG-CANONICAL-DIFF",
      "data",
      "Contract changes use a canonical complete comparison with ordered additions, modifications, removals, expected prior digests, target digests, and compatibility evidence.",
      [
        { kind: "element", id: "EL-CG-CANONICAL-DIFFER" },
        { kind: "interface", id: "IF-CG-CANONICAL-DIFF" },
      ],
      [CG.generate, CG.deterministic, CG.authority],
    ),
    constraint(
      "CON-CG-FORMAT-PORTABILITY",
      "organizational",
      "JSON Schema, OpenAPI, AsyncAPI, Protobuf, and future generators bind through the same provider-neutral operation and typed candidate contract; generic Core contains no product or interface-ID branches.",
      [
        { kind: "element", id: "EL-CG-GENERATOR-PORT" },
        { kind: "element", id: "EL-CG-OPTIONAL-ADAPTERS" },
      ],
      [CG.generate, CG.extension, CG.authority],
    ),
    constraint(
      "CON-CG-CHECKPOINT-REPLAY",
      "operational",
      "Effectful generation checkpoints exact adapter results before downstream validation; identical retry replays without adapter invocation and any baseline, binding, validator, or policy drift fails before adapter entry.",
      [{ kind: "interface", id: "IF-CG-GENERATOR-INVOCATION" }],
      [CG.generate, CG.deterministic, CG.authority],
    ),
    constraint(
      "CON-CG-TRACEABILITY-AUTHORITY",
      "organizational",
      "Candidate and approved contract facts use separate trusted contributors, scopes, checkpoints, and merge proofs; candidate facts never satisfy an approved contract reference.",
      [
        { kind: "element", id: "EL-CG-CANDIDATE-CONTRIBUTOR" },
        { kind: "element", id: "EL-CG-APPROVED-OBSERVER" },
      ],
      [CG.generate, CG.authority, CG.deterministic],
    ),
    constraint(
      "CON-CG-WORK-BARRIER",
      "organizational",
      "WorkBreakdown progression requires an exact approved ContractBaseline or ApprovedNotApplicable artifact and corresponding ContractGate promotion proof.",
      [
        { kind: "element", id: "EL-CG-GATE" },
        { kind: "element", id: "EL-WB-MODULE" },
      ],
      [CG.generate, CG.authority, CG.workBarrier],
    ),
  );

  const technicalDesign = {
    technicalDesignId: "TD-CG-001",
    objective:
      "Generate complete typed contract candidates through replaceable adapters while keeping routing, validation, compatibility, traceability, and promotion authority in DevRelay.",
    scope,
    problemSummary:
      "Approved architecture interface intent must become exact machine-readable contracts before WorkBreakdown, but generator tools cannot be trusted with lifecycle, compatibility, graph, or approval authority.",
    solutionSummary:
      "State-route one ContractGeneration module, invoke a configured contract-kind generator, independently validate and canonically diff its output in Core, project candidate traceability, and let ContractGate alone promote baseline or not-applicable truth and approved graph facts.",
    requirementsDrivers: [
      "Every required InterfaceIntent is covered exactly once or blocks.",
      "Generator implementations remain replaceable behind one semantic port.",
      "Validation and compatibility decisions are independent of generators.",
      "Exact retry reuses checkpoints and drift stops before effects.",
      "Candidate and approved traceability never share authority.",
      "WorkBreakdown never consumes missing or candidate-only contract truth.",
    ],
    behaviorFlows: [
      "Core resolves exact architecture, contract state, project context, repository context, operation, adapter binding, validator, and policy inputs.",
      "The configured adapter generates typed draft entries and subordinate native artifacts and is checkpointed before further processing.",
      "Core independently validates each entry through the pinned contract-kind validator.",
      "For generate-contract-change, Core computes one canonical complete diff against the exact current ContractBaseline.",
      "The candidate contributor projects non-authoritative InterfaceIntent to ContractDraft facts with an atomic merge proof.",
      "ContractGate checks coverage, compatibility, replay, evidence, and approval and returns exact promotable bytes or a blocked decision.",
      "The approved observer activates InterfaceIntent to Contract facts, retires superseded facts, and releases WorkBreakdown only after promotion.",
    ],
    dataResponsibilities: [
      "ContractDraftEntry owns contract identity, kind, dialect, semantic source, exact bytes, and validation evidence.",
      "ContractDraftSet owns the complete establish-contracts candidate universe.",
      "ContractChangeSetDraft owns the complete generate-contract-change target plus canonical typed changes.",
      "ContractValidationProof owns validator identity, version, input digest, normalized digest, and findings.",
      "ContractCompatibilityAssessment owns policy identity and compatibility dispositions without approval authority.",
      "ContractBaseline owns only exact ContractGate-promoted contract truth.",
      "ApprovedNotApplicable owns a Gate-approved zero-required-intent disposition.",
    ],
    failureHandling: [
      "Unknown or stale state, architecture, contract baseline, adapter binding, validator, or policy fails before adapter entry.",
      "Invalid typed output or native-byte mismatch fails before checkpoint progression.",
      "Format validation, reference resolution, canonical diff, or compatibility failure blocks ContractGate.",
      "Missing or duplicate InterfaceIntent coverage blocks promotion.",
      "Candidate traceability failure prevents a successful graph-aware execution record.",
      "Approved projection failure prevents atomic Gate completion and WorkBreakdown release.",
    ],
    securityPrivacy: [
      "Adapters receive explicit minimum grants and cannot access graph, Gate, secrets, or undeclared network endpoints.",
      "Validators resolve only allowed content-addressed local references unless policy explicitly declares a pinned source.",
      "Native artifacts remain subordinate evidence and cannot override canonical contract bytes.",
    ],
    performanceReliabilityOperability: [
      "Canonical ordering and content addressing make validation, diff, Gate preparation, and traceability replayable.",
      "Effect checkpoints isolate generator retries from pure validation and diff recomputation.",
      "Per-entry validation findings keep large contract sets diagnosable without partial promotion.",
      "Closed binding maturity distinguishes the live JSON Schema path from fixture-conformant optional formats.",
    ],
    compatibilityMigrationRollout: [
      "V1 ships JSON Schema draft 2020-12 generation and validation first.",
      "OpenAPI, AsyncAPI, and Protobuf adapters use identical operation and result semantics as optional bindings.",
      "New validators register by contract kind and exact version without Core product branches.",
      "Existing interface intents retain identity; later contract changes compare against exact approved baseline bytes.",
    ],
    verificationIntent: [
      "Test both state-selected operations and the zero-required-intent ContractGate branch.",
      "Test exact InterfaceIntent coverage, unscoped entries, duplicates, stale baselines, and binding drift.",
      "Run real JSON Schema 2020-12 compilation plus positive and negative instance fixtures.",
      "Test canonical diff ordering, add/modify/remove digests, and compatibility policy evidence.",
      "Test effect checkpoint replay with zero adapter calls and pure validation/diff determinism.",
      "Test separate candidate and approved graph scopes, atomic merges, retirement, and replay.",
      "Test WorkBreakdown rejects candidate-only, stale, or absent contract dispositions.",
    ],
    interfaceIntentIds: interfaces
      .filter(({ id }) => id.startsWith("IF-CG-"))
      .map(({ id }) => id),
    constraintIds: constraints
      .filter(({ id }) => id.startsWith("CON-CG-"))
      .map(({ id }) => id),
    sourceRequirementIds: Object.values(CG),
    sourceRefs: [],
  };

  const decisionSpecs = [
    {
      id: "ADR-CG-001",
      title: "State-route one ContractGeneration module with two operations",
      chosen: "OPT-CG-STATE-ROUTED-OPERATIONS",
      rejected: "OPT-CG-ADAPTER-SELECTED-OPERATION",
      requirements: [CG.generate, CG.authority, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-CG-ROUTE-GUARD" },
        { kind: "constraint", id: "CON-CG-STATE-ROUTING" },
      ],
    },
    {
      id: "ADR-CG-002",
      title: "Separate generation from validation, diff, and Gate authority",
      chosen: "OPT-CG-SEPARATED-TRUST-BOUNDARIES",
      rejected: "OPT-CG-GENERATOR-OWNS-COMPATIBILITY",
      requirements: [CG.generate, CG.authority, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-CG-VALIDATOR-REGISTRY" },
        { kind: "element", id: "EL-CG-CANONICAL-DIFFER" },
        { kind: "element", id: "EL-CG-GATE" },
      ],
    },
    {
      id: "ADR-CG-003",
      title: "Ship JSON Schema 2020-12 first behind a contract-kind port",
      chosen: "OPT-CG-JSON-SCHEMA-FIRST-PORTABLE",
      rejected: "OPT-CG-MULTIFORMAT-SPECIAL-CASES",
      requirements: [CG.generate, CG.extension, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-CG-GENERATOR-PORT" },
        { kind: "element", id: "EL-CG-JSON-SCHEMA-ADAPTER" },
        { kind: "constraint", id: "CON-CG-FORMAT-PORTABILITY" },
      ],
    },
    {
      id: "ADR-CG-004",
      title: "Use typed primary outputs with subordinate native artifacts",
      chosen: "OPT-CG-TYPED-CANDIDATE-SETS",
      rejected: "OPT-CG-NATIVE-FILES-AS-OUTCOME",
      requirements: [CG.generate, CG.authority, CG.deterministic],
      targets: [
        { kind: "interface", id: "IF-CG-GENERATOR-INVOCATION" },
        { kind: "interface", id: "IF-CG-GATE-CANDIDATE" },
      ],
    },
    {
      id: "ADR-CG-005",
      title: "Separate candidate and approved contract traceability",
      chosen: "OPT-CG-DUAL-TRACEABILITY-SCOPES",
      rejected: "OPT-CG-CANDIDATE-ACTIVATES-CONTRACT",
      requirements: [CG.generate, CG.authority, CG.workBarrier, CG.deterministic],
      targets: [
        { kind: "element", id: "EL-CG-CANDIDATE-CONTRIBUTOR" },
        { kind: "element", id: "EL-CG-APPROVED-OBSERVER" },
        { kind: "constraint", id: "CON-CG-TRACEABILITY-AUTHORITY" },
      ],
    },
  ].map((entry) => ({ ...entry, supersedes: [] }));

  const assumptions = [
    {
      id: "ASM-CG-BASELINE-CURRENT",
      statement:
        "The supplied ArchitectureBaseline is the exact approved lifecycle-reporting baseline and the target requirements/ProjectOverview pair is exactly version 1.3.0.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-CG-JSON-SCHEMA-FIRST",
      statement:
        "JSON Schema draft 2020-12 is the first live generation and validation path; optional formats remain fixture-conformant until live evidence exists.",
      status: "confirmed",
      blocking: false,
    },
    {
      id: "ASM-CG-GATE-DISPOSITION",
      statement:
        "ContractGate, not ContractGeneration, owns ApprovedNotApplicable and WorkBreakdown progression authority.",
      status: "confirmed",
      blocking: false,
    },
  ];
  const risks = [
    {
      id: "RISK-CG-SELF-HOSTING",
      statement:
        "ContractGeneration introduces contract intents needed to describe its own typed boundaries.",
      impact:
        "A circular bootstrap could prevent the first ContractBaseline from being established.",
      mitigation:
        "Bootstrap the released module schemas as version-pinned source contracts, then require the live JSON Schema path to regenerate and byte-or-semantically compare every required interface before Gate promotion.",
    },
    {
      id: "RISK-CG-GENERATOR-AUTHORITY",
      statement:
        "A generator may return syntactically valid but incomplete or semantically incompatible contracts.",
      impact:
        "WorkBreakdown could plan against incomplete or unsafe interface truth.",
      mitigation:
        "Keep format validation, canonical diff, semantic coverage, compatibility policy, and promotion outside the adapter.",
    },
    {
      id: "RISK-CG-FORMAT-LEAK",
      statement:
        "JSON Schema-specific concepts may leak into the canonical module contract.",
      impact:
        "OpenAPI, AsyncAPI, Protobuf, or future adapters would require Core special cases.",
      mitigation:
        "Keep canonical entries typed by provider-neutral kind/dialect/bytes/evidence and register kind-specific validators at the edge.",
    },
    {
      id: "RISK-CG-FALSE-COMPATIBILITY",
      statement:
        "Canonical syntax diff alone may be mistaken for semantic compatibility.",
      impact:
        "Breaking changes could be approved as backward-compatible.",
      mitigation:
        "Store mechanical diff as evidence input and let ContractGate apply an explicit kind-aware compatibility policy with approval.",
    },
    {
      id: "RISK-CG-CANDIDATE-ACTIVATION",
      statement:
        "Candidate contract graph facts may be mistaken for approved implementation constraints.",
      impact:
        "Work planning could reference unapproved contracts.",
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

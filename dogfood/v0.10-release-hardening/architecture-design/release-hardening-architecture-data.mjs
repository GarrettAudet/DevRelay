const uniq = (...values) => [...new Set(values.flat())];

function architectureElement({ id, name, type, parentId, description, responsibilities, sourceRequirementIds, tags }) {
  return {
    id,
    name,
    type,
    ...(parentId === undefined ? {} : { parentId }),
    description,
    technology: type === "software-system" ? "" : "Provider-neutral DevRelay contract",
    responsibilities,
    tags,
    properties: {},
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}

function component(id, name, parentId, description, responsibilities, sourceRequirementIds, tags = []) {
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

function relationship(id, sourceElementId, targetElementId, description, sourceRequirementIds) {
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

function interfaceIntent({ id, name, providerElementId, consumerElementIds, inputs, outputs, requirementIds, failureBehavior, securityPrivacyIntent }) {
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
      "Explicit authority and availability dispositions",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Stable canonical behavior across supported Windows and Node versions",
      "Unknown fields, unresolved exports, and stale evidence fail closed",
    ],
    securityPrivacyIntent,
    deliveryConsistencyIntent: [
      "Validate canonical structured bytes before promotion",
      "Preserve exact source, package, verification, and approval lineage",
    ],
    contractGeneration: { required: true, suggestedKinds: ["json-schema"] },
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
    verificationIntent: "Dedicated positive, negative, drift, package, installed-consumer, Windows-matrix, replay, and promotion conformance fixtures.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildReleaseHardeningArchitecture({ architectureBaseline, requirements }) {
  const REL = Object.freeze({
    consume: "US-DEV-OSS-CONSUME-001",
    deterministic: "NFR-DEV-OSS-DETERMINISM-001",
    compatible: "NFR-DEV-OSS-COMPATIBILITY-001",
    distribution: "CON-DEV-OSS-DISTRIBUTION-001",
    license: "CON-DEV-OSS-LICENSE-001",
    platform: "CON-DEV-OSS-PLATFORM-001",
    branch: "CON-DEV-OSS-BRANCH-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(REL).filter((id) => !declaredIds.has(id));
  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  if (missing.length !== 0) throw new Error(`Release architecture drivers are absent: ${missing.join(", ")}.`);

  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-OSS-RELEASE-010";
  model.elements.push(
    architectureElement({
      id: "EL-REL-TOOLING",
      name: "Release Tooling",
      type: "container",
      parentId: "EL-DEVRELAY-SYSTEM",
      description: "Deterministically materializes and verifies the GitHub source/library release candidate without becoming lifecycle authority.",
      responsibilities: [
        "Project the declared package export contract",
        "Materialize and verify the installable tarball",
        "Assemble exact release evidence and promotion intent",
      ],
      sourceRequirementIds: allNormativeIds,
      tags: ["Container", "ReleaseTooling"],
    }),
    component(
      "EL-REL-EXPORT-PROJECTOR",
      "Package Export Projector",
      "EL-REL-TOOLING",
      "Derives the complete fixed and wildcard public-subpath inventory directly from package.json exports.",
      ["Expand wildcard targets deterministically", "Reject invalid, duplicate, escaping, or missing export targets"],
      [REL.consume, REL.deterministic, REL.distribution],
      ["ReleaseTooling"],
    ),
    component(
      "EL-REL-TARBALL-MATERIALIZER",
      "Tarball Materializer",
      "EL-REL-TOOLING",
      "Builds the exact installable GitHub release tarball from the approved source candidate.",
      ["Materialize npm-compatible tarball bytes without registry publication", "Bind contents to source, metadata, and export inventory"],
      [REL.consume, REL.deterministic, REL.distribution, REL.license],
      ["ReleaseTooling"],
    ),
    component(
      "EL-REL-INSTALLED-VERIFIER",
      "Installed Package Verifier",
      "EL-REL-TOOLING",
      "Installs the tarball into a clean consumer and exercises every declared public subpath.",
      ["Resolve fixed and expanded wildcard exports", "Import executable and JSON surfaces under supported Node versions"],
      [REL.consume, REL.deterministic, REL.compatible, REL.platform],
      ["ReleaseTooling", "Verification"],
    ),
    component(
      "EL-REL-EVIDENCE-ASSEMBLER",
      "Release Evidence Assembler",
      "EL-REL-TOOLING",
      "Assembles exact catalog, checksums, test results, installed-consumer evidence, governance evidence, and dogfood receipts.",
      ["Reject missing, stale, unrelated, or unsupported release claims", "Produce one content-addressed release candidate evidence set"],
      [REL.consume, REL.deterministic, REL.compatible, REL.license, REL.platform, REL.branch],
      ["ReleaseTooling", "Evidence"],
    ),
    component(
      "EL-REL-GITHUB-PROMOTION",
      "GitHub Promotion Adapter",
      "EL-REL-TOOLING",
      "Projects an approved release candidate into GitHub source, protected-main, and release-asset operations enforced by the host.",
      ["Never publish to npm", "Require exact acceptance and repository-setting evidence before promotion"],
      [REL.consume, REL.distribution, REL.branch, REL.license],
      ["Adapter", "GitHub", "ReleaseTooling"],
    ),
  );
  model.relationships.push(
    relationship("REL-CORE-RELEASE-TOOLING", "EL-DEVRELAY-CORE", "EL-REL-TOOLING", "Supplies exact approved lifecycle, source, and acceptance identities without delegating Gate authority.", [REL.consume, REL.deterministic, REL.branch]),
    relationship("REL-REL-EXPORT-TARBALL", "EL-REL-EXPORT-PROJECTOR", "EL-REL-TARBALL-MATERIALIZER", "Supplies the canonical expanded public export inventory.", [REL.consume, REL.deterministic, REL.distribution]),
    relationship("REL-REL-TARBALL-VERIFY", "EL-REL-TARBALL-MATERIALIZER", "EL-REL-INSTALLED-VERIFIER", "Supplies the exact candidate tarball for isolated installation.", [REL.consume, REL.compatible, REL.platform]),
    relationship("REL-REL-VERIFY-EVIDENCE", "EL-REL-INSTALLED-VERIFIER", "EL-REL-EVIDENCE-ASSEMBLER", "Supplies exact Windows and Node installed-consumer results.", [REL.consume, REL.deterministic, REL.compatible, REL.platform]),
    relationship("REL-REL-EVIDENCE-PROMOTION", "EL-REL-EVIDENCE-ASSEMBLER", "EL-REL-GITHUB-PROMOTION", "Supplies the exact accepted release evidence and exclusions.", [REL.consume, REL.distribution, REL.license, REL.branch]),
  );

  const viewFor = ({ viewKey, type, title, purpose, audience, scopeElementId, elementIds }) => {
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
        .filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId))
        .map(({ id }) => id),
    };
  };
  const priorViewSpecs = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const releaseComponentIds = model.elements
    .filter(({ type, parentId }) => type === "component" && parentId === "EL-REL-TOOLING")
    .map(({ id }) => id);
  const diagramViewSpecs = [
    ...priorViewSpecs,
    viewFor({
      viewKey: "VIEW-REL-CONTAINERS",
      type: "container",
      title: "DevRelay release tooling boundary",
      purpose: "Show Release Tooling as a non-authoritative container beside Generic Core and the released lifecycle modules.",
      audience: ["engineering", "architecture", "release"],
      scopeElementId: "EL-DEVRELAY-SYSTEM",
      elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id),
    }),
    viewFor({
      viewKey: "VIEW-REL-COMPONENTS",
      type: "component",
      title: "Release Tooling components",
      purpose: "Show export projection, tarball materialization, installed verification, evidence assembly, and GitHub promotion.",
      audience: ["engineering", "architecture", "verification", "release"],
      scopeElementId: "EL-REL-TOOLING",
      elementIds: releaseComponentIds,
    }),
  ];

  const scope = {
    level: "change",
    boundary: "Public GitHub source/library preview release tooling for the exact accepted DevRelay candidate.",
    in: [
      "package.json export-derived fixed and wildcard inventory",
      "npm-compatible tarball materialization without registry publication",
      "clean installed-consumer verification on Windows with Node 22 and Node 24",
      "Apache-2.0/DCO, community, security, catalog, checksum, and dogfood evidence",
      "protected-main and GitHub release promotion intent",
    ],
    out: [
      "public npm publication",
      "a one-click ChatGPT Desktop plug-in",
      "a hosted DevRelay backend",
      "release progression based on the adapter or release tooling itself",
    ],
  };
  const openSpecDesign = `# DevRelay V0.10 public OSS source/library preview design

## Context

The accepted 0.9.0 source is deterministic, but its packed artifact omits two declared ArchitectureDiscovery exports and its repository is not yet prepared for the approved Apache-2.0/DCO public GitHub preview.

## Decision

Add a bounded Release Tooling container. Derive the public-subpath inventory only from package.json exports, materialize an installable tarball without registry publication, install it in a clean consumer, exercise every expanded export on the supported Windows/Node matrix, assemble exact release evidence, and expose a host-enforced GitHub promotion adapter. Generic Core and lifecycle Gates retain all progression authority.

## Contract consequence

The expanded PackageExportInventory, ReleaseCandidateEvidenceSet, and GitHubPromotionRequest require JSON Schema contracts before WorkBreakdown.

## Boundaries

The design does not add an npm publisher, Desktop plug-in, hosted backend, or release-specific branch inside Generic Core.
`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({
      id: "IF-REL-EXPORT-INVENTORY",
      name: "Canonical package export inventory",
      providerElementId: "EL-REL-EXPORT-PROJECTOR",
      consumerElementIds: ["EL-REL-TARBALL-MATERIALIZER", "EL-REL-INSTALLED-VERIFIER"],
      inputs: ["Exact package.json bytes", "Approved source revision and package-root boundary"],
      outputs: ["Sorted fixed and expanded wildcard PackageExportInventory"],
      requirementIds: [REL.consume, REL.deterministic, REL.distribution],
      failureBehavior: "Reject invalid targets, path escape, duplicates, missing target files, unsupported conditions, or ambiguous wildcard expansion.",
      securityPrivacyIntent: ["Inventory exposes declared package paths only and never reads secrets or untracked files"],
    }),
    interfaceIntent({
      id: "IF-REL-CANDIDATE-EVIDENCE",
      name: "Release candidate evidence set",
      providerElementId: "EL-REL-EVIDENCE-ASSEMBLER",
      consumerElementIds: ["EL-REL-GITHUB-PROMOTION"],
      inputs: ["Exact source, tarball, export inventory, verification, governance, security, and dogfood evidence"],
      outputs: ["Content-addressed ReleaseCandidateEvidenceSet with inclusions and exclusions"],
      requirementIds: allNormativeIds,
      failureBehavior: "Reject missing, stale, failing, unrelated, unsupported, or non-Windows release-defining evidence.",
      securityPrivacyIntent: ["Publish bounded evidence references and summaries without credentials, tokens, or private vulnerability contents"],
    }),
    interfaceIntent({
      id: "IF-REL-GITHUB-PROMOTION",
      name: "Approved GitHub promotion request",
      providerElementId: "EL-DEVRELAY-CORE",
      consumerElementIds: ["EL-REL-GITHUB-PROMOTION"],
      inputs: ["Exact BusinessAcceptance record", "ReleaseCandidateEvidenceSet", "Repository and protected-main setting snapshot"],
      outputs: ["GitHubPromotionRequest limited to source, main, tag, and release asset operations"],
      requirementIds: [REL.consume, REL.distribution, REL.license, REL.branch],
      failureBehavior: "Reject absent acceptance, digest drift, unprotected or non-default main, npm publication intent, or unsupported release claims.",
      securityPrivacyIntent: ["Host enforces least-privilege GitHub grants; no repository credential enters canonical artifacts"],
    }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-REL-EXPORT-SOURCE-OF-TRUTH", "data", "package.json exports is the only authoritative public-subpath inventory; verification cannot rely on a second manual export list.", [{ kind: "element", id: "EL-REL-EXPORT-PROJECTOR" }, { kind: "interface", id: "IF-REL-EXPORT-INVENTORY" }], [REL.consume, REL.deterministic, REL.distribution]),
    constraint("CON-REL-GITHUB-ONLY", "organizational", "Release promotion supports GitHub source and an installable tarball only and contains no public npm publication operation.", [{ kind: "element", id: "EL-REL-GITHUB-PROMOTION" }], [REL.consume, REL.distribution]),
    constraint("CON-REL-WINDOWS-MATRIX", "operational", "Windows is release-defining and every supported Node major must pass the canonical and clean installed-consumer gates.", [{ kind: "element", id: "EL-REL-INSTALLED-VERIFIER" }], [REL.consume, REL.compatible, REL.platform]),
    constraint("CON-REL-PROMOTION-AUTHORITY", "organizational", "Release tooling and GitHub adapters cannot approve requirements, architecture, contracts, work, verification, integration, system evidence, or business acceptance.", [{ kind: "element", id: "EL-REL-TOOLING" }, { kind: "interface", id: "IF-REL-GITHUB-PROMOTION" }], [REL.consume, REL.deterministic, REL.branch]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-REL-010",
    objective: "Produce a complete, deterministic, GitHub-only DevRelay source/library preview with release-defining Windows Desktop evidence.",
    scope,
    problemSummary: "The current packed artifact does not faithfully realize the declared export contract, and public OSS governance, security, platform, and promotion evidence are incomplete.",
    solutionSummary: "Project exports from package.json, validate the real packed and installed artifact, assemble exact governance and lifecycle evidence, and limit host-enforced promotion to protected-main GitHub source and release assets.",
    requirementsDrivers: [
      "Every declared export resolves from the installed tarball.",
      "GitHub-only distribution and npm exclusion are mechanically enforceable.",
      "Windows and supported Node versions define compatibility evidence.",
      "Apache-2.0/DCO, security, community, and lifecycle evidence are part of the candidate.",
      "Release tooling never becomes lifecycle or acceptance authority.",
    ],
    behaviorFlows: [
      "Core supplies the exact accepted source and lifecycle identities to Release Tooling.",
      "The export projector expands package.json exports into one canonical inventory.",
      "The tarball materializer builds the exact installable artifact and binds its contents to source and inventory.",
      "The installed verifier tests every public subpath in a clean Windows consumer for Node 22 and Node 24.",
      "The evidence assembler combines package, governance, security, dogfood, integration, and system evidence.",
      "After BusinessAcceptance, the host-enforced GitHub adapter promotes only the exact accepted source and tarball through protected main.",
    ],
    dataResponsibilities: [
      "PackageExportInventory owns fixed and expanded wildcard subpaths and target classifications.",
      "ReleaseCandidateEvidenceSet owns exact source, tarball, test, governance, security, dogfood, and exclusion bindings.",
      "GitHubPromotionRequest owns the bounded accepted promotion intent without credentials or execution state.",
    ],
    failureHandling: [
      "Invalid or missing exports fail before packing.",
      "Tarball/content mismatch, install failure, or any unresolved subpath fails release verification.",
      "Missing Windows/Node, governance, security, dogfood, or acceptance evidence blocks promotion.",
      "Repository or GitHub-setting drift retires the candidate and requires regeneration.",
    ],
    securityPrivacy: [
      "GitHub credentials remain host-enforced grants and never enter canonical artifacts.",
      "Security reporting publishes the approved contact but excludes private vulnerability content from release evidence.",
      "The tarball includes only allowlisted package content derived from package and release contracts.",
    ],
    performanceReliabilityOperability: [
      "Export expansion and evidence assembly use canonical ordering and content digests.",
      "Installed-package verification runs from isolated consumers and is replayable from exact tarball bytes.",
      "Node 22 and 24 Windows jobs provide the release-defining compatibility matrix.",
    ],
    compatibilityMigrationRollout: [
      "Existing source/library APIs remain backward-compatible; the change corrects missing packaged resources.",
      "The public preview starts with GitHub source and tarball only; npm and hosted distribution require a later approved change.",
      "Protected-main configuration is host-owned and evidenced separately from source bytes.",
    ],
    verificationIntent: [
      "Test invalid, missing, escaping, duplicated, fixed, and wildcard exports.",
      "Pack and install the candidate in isolated Windows consumers on Node 22 and Node 24.",
      "Verify exact LICENSE, NOTICE, DCO, governance, support, security, catalog, checksum, and community artifacts.",
      "Run the full DevRelay lifecycle plus a separate minimal software project from ChatGPT Desktop on Windows.",
      "Query and verify protected main before GitHub release promotion.",
    ],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-REL-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-REL-")).map(({ id }) => id),
    sourceRequirementIds: allNormativeIds,
    sourceRefs: [],
  };

  const decisionSpecs = [
    {
      id: "ADR-REL-001",
      title: "Derive package verification from package.json exports",
      chosen: "OPT-REL-EXPORTS-AS-CONTRACT",
      rejected: "OPT-REL-MANUAL-REQUIRED-FILES",
      requirements: [REL.consume, REL.deterministic, REL.distribution],
      targets: [{ kind: "element", id: "EL-REL-EXPORT-PROJECTOR" }, { kind: "constraint", id: "CON-REL-EXPORT-SOURCE-OF-TRUTH" }],
    },
    {
      id: "ADR-REL-002",
      title: "Separate release evidence from host-enforced GitHub promotion",
      chosen: "OPT-REL-EVIDENCE-THEN-PROMOTION",
      rejected: "OPT-REL-TOOLING-SELF-APPROVES",
      requirements: [REL.consume, REL.deterministic, REL.branch, REL.license],
      targets: [{ kind: "element", id: "EL-REL-EVIDENCE-ASSEMBLER" }, { kind: "element", id: "EL-REL-GITHUB-PROMOTION" }, { kind: "constraint", id: "CON-REL-PROMOTION-AUTHORITY" }],
    },
    {
      id: "ADR-REL-003",
      title: "Use Windows as the release-defining compatibility host",
      chosen: "OPT-REL-WINDOWS-RELEASE-DEFINING",
      rejected: "OPT-REL-GENERIC-CI-IMPLIES-WINDOWS",
      requirements: [REL.consume, REL.compatible, REL.platform],
      targets: [{ kind: "element", id: "EL-REL-INSTALLED-VERIFIER" }, { kind: "constraint", id: "CON-REL-WINDOWS-MATRIX" }],
    },
  ].map((entry) => ({ ...entry, supersedes: [] }));

  const assumptions = [
    { id: "ASM-REL-BASELINE-CURRENT", statement: "The supplied ArchitectureBaseline is current and the target requirements/ProjectOverview pair is exactly version 1.8.0.", status: "confirmed", blocking: false },
    { id: "ASM-REL-GITHUB-SETTINGS", statement: "Default-branch, ruleset, and private vulnerability settings are host-owned and require separately captured GitHub evidence.", status: "confirmed", blocking: false },
    { id: "ASM-REL-DRAFT-NONAUTHORITY", statement: "Pre-existing uncommitted OSS edits are a non-authoritative implementation draft until executed and verified through approved work items.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-REL-EXPORT-DRIFT", statement: "The packed artifact can diverge from package.json exports.", impact: "Consumers receive missing or unresolvable public subpaths.", mitigation: "Derive inventory from exports and test the real installed tarball." },
    { id: "RISK-REL-GITHUB-SETTINGS", statement: "Source changes can pass while main remains unprotected or non-default.", impact: "The public promotion boundary is weaker than the release claim.", mitigation: "Require exact GitHub setting evidence before promotion." },
    { id: "RISK-REL-PLATFORM-GAP", statement: "Generic or non-Windows CI can mask a Desktop-host failure.", impact: "The release-defining product path is unverified.", mitigation: "Require Windows Node 22/24 installed-consumer evidence and a Desktop dogfood." },
    { id: "RISK-REL-AUTHORITY", statement: "Release tooling can be mistaken for business or lifecycle acceptance authority.", impact: "An incomplete candidate could be published.", mitigation: "Keep promotion downstream of exact BusinessAcceptance and enforce the non-authority interface and constraint." },
  ];

  return {
    DEV: {},
    RUN: { inspect: REL.consume, deterministic: REL.deterministic },
    REL,
    allNormativeIds,
    alreadyDesignedTargets: new Map([
      ["US-DEV-SPECIFY-001", [{ kind: "element", id: "EL-WB-MODULE" }]],
      ["NFR-DEV-DETERMINISM-001", [{ kind: "element", id: "EL-DEVRELAY-CORE" }]],
    ]),
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

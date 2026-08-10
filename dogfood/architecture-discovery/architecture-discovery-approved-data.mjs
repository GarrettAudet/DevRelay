const collectionKeys = new Set([
  "acceptanceCriteria",
  "assumptions",
  "businessObjectives",
  "capabilities",
  "constraints",
  "nonFunctionalRequirements",
  "nonGoals",
  "scope",
  "stakeholders",
  "successMetrics",
  "terminology",
  "userJourneys",
  "userStories",
  "users",
]);

const stringArrayKeys = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "deliverables",
  "dependencies",
  "interests",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compare(
          [
            left.role,
            left.artifact.artifactId,
            left.artifact.digest,
            left.location ?? "",
          ].join("\u0000"),
          [
            right.role,
            right.artifact.artifactId,
            right.artifact.digest,
            right.location ?? "",
          ].join("\u0000"),
        ),
      );
    }
    if (collectionKeys.has(key)) {
      return entries.sort((left, right) => compare(left.id, right.id));
    }
    if (
      stringArrayKeys.has(key) &&
      entries.every((entry) => typeof entry === "string")
    ) {
      return [...new Set(entries)].sort(compare);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      canonicalize(child, childKey),
    ]),
  );
}

export const ownerDecisions = Object.freeze([
  Object.freeze({
    questionId: "Q-AD-DISCOVERY-CAPABILITIES-001",
    answer:
      "Require a version-pinned native inventory adapter; treat specialized analyzers as optional contributors (recommended)",
  }),
  Object.freeze({
    questionId: "Q-AD-CONFIDENCE-GATE-001",
    answer:
      "Block only on declared material gaps; preserve non-blocking low-confidence findings and require explicit Gate disposition (recommended)",
  }),
  Object.freeze({
    questionId: "Q-AD-REPOSITORY-BOUNDARY-001",
    answer:
      "Analyze tracked or explicitly declared files offline, respect ignore and secret rules, and require opt-in before source content leaves the host (recommended)",
  }),
]);

export function buildArchitectureDiscoveryRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => {
    requirements[key] = [...requirements[key], ...values];
  };

  append("capabilities", [
    {
      id: "CAP-DEV-ARCHITECTURE-DISCOVERY-001",
      name: "Evidence-bound current architecture discovery",
      description:
        "Discover an existing repository's implemented architecture through a deterministic local inventory and replaceable bounded analyzers, producing one observational CurrentArchitectureSnapshot.",
      businessObjectiveIds: [
        "BO-DEV-DETERMINISM-001",
        "BO-DEV-MODULARITY-001",
        "BO-DEV-TRACEABILITY-001",
      ],
      userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
      audience: "user-facing",
      key: true,
      priority: "must",
      sourceRefs: refs(),
    },
  ]);

  append("userJourneys", [
    {
      id: "UJ-DEV-ARCHITECTURE-DISCOVERY-001",
      name: "Discover an unbaselined existing system",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityIds: ["CAP-DEV-ARCHITECTURE-DISCOVERY-001"],
      trigger:
        "Core resolves an existing-undiscovered project state with an exact repository snapshot and no architecture baseline or valid current snapshot.",
      outcome:
        "ArchitectureDesign receives one validated observational CurrentArchitectureSnapshot, or progression stops with explicit material gaps.",
      steps: [
        {
          sequence: 1,
          action:
            "Core validates the project state, repository snapshot, policies, adapter chain, options, and grants.",
          expectedOutcome:
            "Discovery starts only from exact approved context and a drift-free repository state.",
        },
        {
          sequence: 2,
          action:
            "The native inventory adapter inspects the allowed local repository surface and optional analyzers contribute bounded observations.",
          expectedOutcome:
            "Every observation retains exact method, source, confidence, and native provenance.",
        },
        {
          sequence: 3,
          action:
            "Trusted validation normalizes observations, identifies gaps, and determines whether the candidate can reach the discovery Gate.",
          expectedOutcome:
            "Material uncertainty blocks; non-material uncertainty remains visible for explicit Gate disposition.",
        },
      ],
      sourceRefs: refs(),
    },
  ]);

  append("userStories", [
    {
      id: "US-DEV-ARCHITECTURE-DISCOVERY-001",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-ARCHITECTURE-DISCOVERY-001",
      userJourneyIds: ["UJ-DEV-ARCHITECTURE-DISCOVERY-001"],
      need:
        "Establish trustworthy current-system context before designing an architecture baseline for an existing repository.",
      benefit:
        "ArchitectureDesign can propose intended architecture without guessing about the implemented system or coupling discovery to one analyzer.",
      priority: "must",
      acceptanceCriterionIds: [
        "AC-DEV-AD-BOUNDARY-001",
        "AC-DEV-AD-CONFIDENCE-001",
        "AC-DEV-AD-DETERMINISM-001",
        "AC-DEV-AD-INVENTORY-001",
        "AC-DEV-AD-OUTPUT-001",
        "AC-DEV-AD-PRIVACY-001",
        "AC-DEV-AD-PROVENANCE-001",
        "AC-DEV-AD-REPLAY-001",
        "AC-DEV-AD-ROUTING-001",
      ],
      sourceRefs: refs(),
    },
  ]);

  append("acceptanceCriteria", [
    {
      id: "AC-DEV-AD-BOUNDARY-001",
      statement:
        "ArchitectureDiscovery describes implemented current state only and cannot propose intended architecture, record approved architecture decisions, promote an ArchitectureBaseline, or control ArchitectureDesign progression.",
      verification:
        "Attempt every forbidden authority through inputs and adapter outputs and require fail-closed rejection.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-CONFIDENCE-001",
      statement:
        "Every finding has an observed, deterministically-derived, analyzer-inferred, unknown, or not-applicable disposition with confidence and rationale; declared material gaps return needs_clarification while non-material uncertainty remains explicit for Gate review.",
      verification:
        "Exercise complete, low-confidence non-blocking, material-gap, contradictory, and analyzer-silent fixtures.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-DETERMINISM-001",
      statement:
        "Exact repository bytes, context, policies, adapters, versions, options, and native observations produce byte-identical canonical snapshots, gaps, diagnostics, and checkpoints.",
      verification:
        "Repeat equivalent runs with reordered native observations and compare all canonical digests.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-INVENTORY-001",
      statement:
        "Every discovery run invokes one version-pinned deterministic native inventory adapter before any configured specialized analyzer, and analyzer availability cannot remove the minimum inventory contract.",
      verification:
        "Exercise native-only, analyzer-present, analyzer-absent, analyzer-failed, reordered-chain, and substituted-adapter fixtures.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-OUTPUT-001",
      statement:
        "A successful invocation returns exactly one schema-valid CurrentArchitectureSnapshot containing architecture elements, relationships, interfaces, constraints, decisions discovered as records, diagrams or model attachments, discovery methods, confidence, gaps, warnings, and source references.",
      verification:
        "Validate complete positive output and reject absent, duplicate, structurally incomplete, or authority-expanding outputs.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-PRIVACY-001",
      statement:
        "The default discovery policy analyzes tracked or explicitly declared files offline, respects repository ignore and secret rules, and requires an explicit version-pinned opt-in grant before source content leaves the host.",
      verification:
        "Exercise tracked, untracked, ignored, generated, secret-like, symlink, submodule, and external-transmission fixtures.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-PROVENANCE-001",
      statement:
        "Every canonical finding resolves to exact repository locations or native analyzer artifacts and records method, adapter identity and version, evidence disposition, and confidence without adapter-authored graph operations.",
      verification:
        "Reject missing, stale, unresolved, cross-repository, substituted, and graph-operation provenance.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-REPLAY-001",
      statement:
        "A durably checkpointed discovery result replays byte-identically without reinvoking inventory or analyzer adapters.",
      verification:
        "Prove successful, clarification, unable-to-proceed, interrupted, corrupt-checkpoint, and zero-call replay paths.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-AD-ROUTING-001",
      statement:
        "Core selects ArchitectureDiscovery only for existing-undiscovered state; greenfield, existing-discovered-unbaselined, and baselined states bypass or reject it deterministically.",
      verification:
        "Exercise every ProjectArchitectureState variant, stale snapshot, conflicting baseline, and caller-forced operation.",
      sourceRefs: refs(),
    },
  ]);

  append("scope", [
    {
      id: "SCOPE-DEV-ARCHITECTURE-DISCOVERY-DETAIL-001",
      statement:
        "One conditional ArchitectureDiscovery module covering deterministic state routing, native local inventory, optional bounded analyzers, observational normalization, confidence and material-gap policy, privacy controls, checkpoint replay, and current-snapshot traceability.",
      sourceRefs: refs(),
    },
  ]);

  append("constraints", [
    {
      id: "CON-DEV-AD-AUTHORITY-001",
      category: "business",
      statement:
        "Core owns routing, exact input and adapter validation, checkpoints, canonical result validation, and Gate progression; adapters own only bounded repository observations.",
      rationale:
        "Discovery tools cannot safely certify their own completeness, authority, or downstream readiness.",
      applicability: { level: "project" },
      acceptanceCriterionIds: [
        "AC-DEV-AD-BOUNDARY-001",
        "AC-DEV-AD-ROUTING-001",
      ],
      sourceRefs: refs(),
    },
    {
      id: "CON-DEV-AD-OBSERVATIONAL-001",
      category: "business",
      statement:
        "The snapshot records current implementation evidence and uncertainty; ArchitectureDesign alone converts approved requirements and current context into intended architecture.",
      rationale:
        "Mixing observation and design would allow inferred current state to become an unreviewed architecture decision.",
      applicability: { level: "project" },
      acceptanceCriterionIds: ["AC-DEV-AD-BOUNDARY-001"],
      sourceRefs: refs(),
    },
    {
      id: "CON-DEV-AD-LOCAL-FIRST-001",
      category: "security",
      statement:
        "Default discovery is local and offline over tracked or explicitly declared inputs; external transmission requires explicit policy and grants.",
      rationale:
        "Repository discovery routinely encounters proprietary source and secret-bearing files.",
      applicability: { level: "project" },
      acceptanceCriterionIds: ["AC-DEV-AD-PRIVACY-001"],
      sourceRefs: refs(),
    },
  ]);

  append("nonFunctionalRequirements", [
    {
      id: "NFR-DEV-AD-DETERMINISM-001",
      category: "reliability",
      statement:
        "Routing, inventory projection, observation normalization, confidence and gap evaluation, diagnostics, and checkpoint replay must be deterministic for exact version-pinned inputs.",
      applicability: { level: "project" },
      measure: "Canonical digest equality and zero-call replay.",
      target: "100 percent equality for Core-owned artifacts.",
      priority: "must",
      acceptanceCriterionIds: [
        "AC-DEV-AD-DETERMINISM-001",
        "AC-DEV-AD-REPLAY-001",
      ],
      sourceRefs: refs(),
    },
    {
      id: "NFR-DEV-AD-PRIVACY-001",
      category: "security",
      statement:
        "Discovery must not inspect excluded files or transmit source content without exact policy-bound authorization.",
      applicability: { level: "project" },
      measure:
        "Denied-access and external-transmission conformance cases across all configured adapter bindings.",
      target: "No undeclared inspection or transmission succeeds.",
      priority: "must",
      acceptanceCriterionIds: ["AC-DEV-AD-PRIVACY-001"],
      sourceRefs: refs(),
    },
  ]);

  append("assumptions", [
    {
      id: "ASM-DEV-AD-V1-001",
      statement:
        "V1 uses a mandatory native local inventory adapter, allows optional specialized analyzer contributions, blocks only on declared material gaps, preserves all lower-confidence findings for explicit Gate disposition, and requires opt-in before source leaves the host.",
      status: "confirmed",
      blocking: false,
      sourceRefs: refs(),
    },
  ]);

  append("terminology", [
    {
      id: "TERM-DEV-CURRENT-ARCHITECTURE-SNAPSHOT-001",
      term: "Current architecture snapshot",
      definition:
        "A version-pinned observational artifact describing discovered implemented architecture, evidence provenance, confidence, gaps, and native attachments without approving intended design.",
      aliases: ["CurrentArchitectureSnapshot"],
      sourceRefs: refs(),
    },
    {
      id: "TERM-DEV-MATERIAL-DISCOVERY-GAP-001",
      term: "Material discovery gap",
      definition:
        "A declared missing, contradictory, or insufficiently supported current-state fact whose absence could materially change ArchitectureDesign and therefore blocks progression.",
      aliases: ["blocking discovery gap"],
      sourceRefs: refs(),
    },
  ]);

  requirements.currentStatus = {
    lifecycle: "existing",
    phase: "implementation",
    summary:
      "ArchitectureDiscovery requirements are clarified: mandatory native local inventory, optional bounded analyzers, material-gap blocking, explicit lower-confidence findings, and offline tracked-or-declared repository analysis with external-transmission opt-in.",
    sourceRefs: refs(),
  };
  requirements.deliverables = [
    ...requirements.deliverables,
    "Provider-neutral ArchitectureDiscovery module and conditional route",
    "CurrentArchitectureSnapshot discovery, confidence, gap, and provenance contracts",
    "Live native repository inventory adapter and optional analyzer adapter contracts",
  ];
  requirements.dependencies = [
    ...requirements.dependencies,
    "Exact ProjectArchitectureState, RepositorySnapshot, ProjectOverviewBaseline, and project context",
    "Host-enforced repository, process, network, and secret policy",
  ];
  requirements.requiredEvidence = [
    ...requirements.requiredEvidence,
    "architecture-discovery/routing",
    "architecture-discovery/native-inventory",
    "architecture-discovery/analyzer-provenance",
    "architecture-discovery/confidence-gaps",
    "architecture-discovery/privacy-boundary",
    "architecture-discovery/checkpoint-replay",
    "architecture-discovery/traceability-merge",
  ];
  requirements.risks = [
    ...requirements.risks,
    "Analyzer silence could be mistaken for proof that an architecture element or relationship does not exist.",
    "Inferred current state could be mistaken for approved intended architecture.",
    "Generated, ignored, or secret-bearing files could be inspected or transmitted beyond approved policy.",
    "Repository drift could bind findings to a different implementation than the snapshot claims.",
    "Language-specific analyzer semantics could leak into the provider-neutral snapshot contract.",
  ];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}

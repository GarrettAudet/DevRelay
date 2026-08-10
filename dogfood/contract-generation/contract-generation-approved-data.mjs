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

const compare = (left, right) =>
  left.localeCompare(right, "en", { sensitivity: "variant" });

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compare(
          [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
          [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
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
    questionId: "Q-CG-OPERATION-LIFECYCLE-001",
    answer:
      "Separate state-routed operations; ContractGate owns ApprovedNotApplicable (recommended)",
  }),
  Object.freeze({
    questionId: "Q-CG-TRUST-BOUNDARY-001",
    answer:
      "Adapters generate; Core runs pinned format validators and canonical diff; ContractGate verifies semantics and promotes (recommended)",
  }),
  Object.freeze({
    questionId: "Q-CG-V1-BINDINGS-001",
    answer:
      "Live JSON Schema 2020-12 path first; define fixture-conformant optional format adapters behind the same contract (recommended)",
  }),
  Object.freeze({
    questionId: "Q-CG-OUTPUT-TRACEABILITY-001",
    answer:
      "Typed draft/change-set outputs with separate candidate and approved traceability projections (recommended)",
  }),
]);

export function buildContractGenerationRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => {
    requirements[key] = [...requirements[key], ...values];
  };

  append("capabilities", [
    {
      id: "CAP-DEV-CONTRACT-GENERATION-001",
      name: "Deterministic contract generation",
      description:
        "Turn approved architecture interface intent into complete machine-valid contract candidates through replaceable generators and trusted validation boundaries.",
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
      id: "UJ-DEV-CONTRACT-GENERATION-001",
      name: "Resolve architecture interface intent into approved contracts",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityIds: ["CAP-DEV-CONTRACT-GENERATION-001"],
      trigger:
        "An approved ArchitectureBaseline contains one or more interface intents requiring machine-readable contracts.",
      outcome:
        "ContractGate approves an exact ContractBaseline, or progression stops with explicit diagnostics.",
      steps: [
        {
          sequence: 1,
          action:
            "Core selects establishment or change generation from exact project state and resolves configured generators by required contract kind.",
          expectedOutcome:
            "Every required interface enters one bounded, content-addressed generation path.",
        },
        {
          sequence: 2,
          action:
            "Core validates native bytes with pinned format validators and derives the canonical contract set or compatibility change set.",
          expectedOutcome:
            "Coverage, format validity, provenance, and compatibility evidence are explicit.",
        },
        {
          sequence: 3,
          action:
            "ContractGate evaluates semantic completeness and exact approval before promotion.",
          expectedOutcome:
            "WorkBreakdown receives an approved ContractBaseline and never a generator-owned draft.",
        },
      ],
      sourceRefs: refs(),
    },
  ]);
  append("userStories", [
    {
      id: "US-DEV-CONTRACT-GENERATION-001",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-CONTRACT-GENERATION-001",
      userJourneyIds: ["UJ-DEV-CONTRACT-GENERATION-001"],
      need:
        "Generate or evolve exact machine-readable contracts for every approved architecture interface that requires one.",
      benefit:
        "Work planning and implementation consume validated interface truth instead of prose or generator-specific state.",
      priority: "must",
      acceptanceCriterionIds: [
        "AC-DEV-CONTRACT-COMPATIBILITY-001",
        "AC-DEV-CONTRACT-COVERAGE-001",
        "AC-DEV-CONTRACT-GATE-001",
        "AC-DEV-CONTRACT-PLUGIN-001",
        "AC-DEV-CONTRACT-REPLAY-001",
        "AC-DEV-CONTRACT-ROUTING-001",
        "AC-DEV-CONTRACT-TRACEABILITY-001",
        "AC-DEV-CONTRACT-VALIDATION-001",
      ],
      sourceRefs: refs(),
    },
  ]);

  append("acceptanceCriteria", [
    {
      id: "AC-DEV-CONTRACT-COMPATIBILITY-001",
      statement:
        "A contract change candidate identifies every addition, modification, removal, expected prior digest, target digest, and compatibility impact against the exact current ContractBaseline.",
      verification:
        "Run additive, backward-compatible, breaking, removed-interface, stale-baseline, and relocation-only change fixtures.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-COVERAGE-001",
      statement:
        "Every required InterfaceIntent in the approved ArchitectureBaseline maps to exactly one typed ContractDraft entry or a blocking diagnostic, with no unscoped contract entries.",
      verification:
        "Run missing, duplicate, unknown-interface, undeclared-kind, and extra-contract coverage fixtures.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-GATE-001",
      statement:
        "ContractGate alone promotes an exact replayed ContractDraftSet or ContractChangeSetDraft to ContractBaseline, or records ApprovedNotApplicable only when no interface requires a contract.",
      verification:
        "Attempt promotion with missing approval, stale input, altered native bytes, failed validation, incomplete coverage, and an invalid not-applicable disposition.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-PLUGIN-001",
      statement:
        "Contract generator bindings are selected by declared contract kind and configuration without interface-ID, provider, or product branches in generic Core.",
      verification:
        "Swap fixture-conformant generators by kind and scan Core for adapter or interface special cases.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-REPLAY-001",
      statement:
        "Effectful contract generation checkpoints exact adapter outputs; retry replays identical results without reinvocation, and baseline or binding drift stops before adapter entry.",
      verification:
        "Run interruption, checkpoint replay, corrupt checkpoint, changed binding, changed architecture, and zero-call Gate replay fixtures.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-ROUTING-001",
      statement:
        "Core selects establish-contracts when no ContractBaseline exists, generate-contract-change when one exists, and the ContractGate not-applicable branch when the approved architecture contains zero required contract intents.",
      verification:
        "Run all three exact project-state routes and reject model-selected or invocation-selected route divergence.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-TRACEABILITY-001",
      statement:
        "A trusted contributor projects candidate InterfaceIntent-to-ContractDraft relationships separately from approved InterfaceIntent-to-Contract relationships, and adapters never submit graph operations.",
      verification:
        "Validate candidate and approved graph scopes, forward-only edges, provenance, atomic merge receipts, and forbidden adapter graph access.",
      sourceRefs: refs(),
    },
    {
      id: "AC-DEV-CONTRACT-VALIDATION-001",
      statement:
        "Core runs version-pinned kind-specific format validation and canonical diff independently of the generator, while ContractGate verifies semantic completeness and compatibility policy before approval.",
      verification:
        "Run malformed JSON Schema, invalid references, unsupported dialect, divergent validator, generator self-certification, and semantic Gate-denial fixtures.",
      sourceRefs: refs(),
    },
  ]);

  append("scope", [
    {
      id: "SCOPE-DEV-CONTRACT-GENERATION-DETAIL-001",
      statement:
        "One ContractGeneration module with establish-contracts and generate-contract-change operations, typed draft outputs, a live JSON Schema 2020-12 path, extensible optional format adapters, and a separate ContractGate/ApprovedNotApplicable authority boundary.",
      sourceRefs: refs(),
    },
  ]);

  append("constraints", [
    {
      id: "CON-DEV-CONTRACT-AUTHORITY-001",
      category: "business",
      statement:
        "Generators propose native contract bytes only; Core owns pinned format validation and canonical diff, while ContractGate owns semantic completeness, compatibility policy, approval, and progression.",
      rationale:
        "A generator cannot safely certify its own completeness or authority.",
      applicability: { level: "project" },
      acceptanceCriterionIds: [
        "AC-DEV-CONTRACT-GATE-001",
        "AC-DEV-CONTRACT-VALIDATION-001",
      ],
      sourceRefs: refs(),
    },
    {
      id: "CON-DEV-CONTRACT-FORMAT-EXTENSION-001",
      category: "technical",
      statement:
        "Canonical contract kinds include JSON Schema, OpenAPI, AsyncAPI, Protobuf, and versioned extensions; binding selection cannot branch on interface IDs in generic Core.",
      rationale:
        "Contract formats and best-in-class tooling must remain replaceable.",
      applicability: { level: "project" },
      acceptanceCriterionIds: ["AC-DEV-CONTRACT-PLUGIN-001"],
      sourceRefs: refs(),
    },
    {
      id: "CON-DEV-CONTRACT-WORK-BREAKDOWN-BARRIER-001",
      category: "business",
      statement:
        "WorkBreakdown cannot progress without an exact approved ContractBaseline or ContractGate-owned ApprovedNotApplicable disposition.",
      rationale:
        "Work must not be planned against missing or unapproved interface truth.",
      applicability: { level: "project" },
      acceptanceCriterionIds: ["AC-DEV-CONTRACT-GATE-001"],
      sourceRefs: refs(),
    },
  ]);

  append("nonFunctionalRequirements", [
    {
      id: "NFR-DEV-CONTRACT-DETERMINISM-001",
      category: "reliability",
      statement:
        "Exact architecture, baseline, binding, validator, policy, and native bytes must produce byte-identical canonical contract candidates, diffs, diagnostics, and Gate inputs.",
      applicability: { level: "project" },
      measure:
        "Canonical digest equality across replay, insertion order, process restart, and equivalent artifact relocation.",
      target: "100 percent equality for deterministic Core-owned outputs.",
      priority: "must",
      acceptanceCriterionIds: [
        "AC-DEV-CONTRACT-COMPATIBILITY-001",
        "AC-DEV-CONTRACT-REPLAY-001",
        "AC-DEV-CONTRACT-VALIDATION-001",
      ],
      sourceRefs: refs(),
    },
  ]);

  append("assumptions", [
    {
      id: "ASM-DEV-CONTRACT-GENERATION-V1-001",
      statement:
        "V1 implements a live JSON Schema 2020-12 generation and validation path first; OpenAPI, AsyncAPI, Protobuf, and future formats use the same provider-neutral contract and begin as fixture-conformant optional bindings.",
      status: "confirmed",
      blocking: false,
      sourceRefs: refs(),
    },
  ]);

  append("terminology", [
    {
      id: "TERM-DEV-CONTRACT-DRAFT-001",
      term: "Contract draft",
      definition:
        "One typed candidate contract entry bound to an approved architecture InterfaceIntent, exact native bytes, validation evidence, compatibility disposition, and source provenance; it has no approved authority until ContractGate promotion.",
      aliases: ["ContractDraft", "ContractDraftSet entry"],
      sourceRefs: refs(),
    },
  ]);

  requirements.currentStatus = {
    lifecycle: "existing",
    phase: "planning",
    summary:
      "ContractGeneration requirements are clarified: separate state-routed operations, untrusted generators, Core-owned pinned format validation and canonical diff, ContractGate authority, a live JSON Schema 2020-12 path first, typed draft/change-set outputs, and separate candidate/approved traceability projections.",
    sourceRefs: refs(),
  };
  requirements.deliverables = [
    ...requirements.deliverables,
    "Provider-neutral ContractGeneration module and ContractGate contracts",
    "Live JSON Schema 2020-12 generator and pinned validator path",
    "Fixture-conformant optional OpenAPI, AsyncAPI, and Protobuf bindings",
    "Trusted candidate and approved contract traceability contributors",
  ];
  requirements.dependencies = [
    ...requirements.dependencies,
    "Approved ArchitectureBaseline interface intent and contract-generation disposition",
    "Pinned kind-specific validator and compatibility policy versions",
  ];
  requirements.requiredEvidence = [
    ...requirements.requiredEvidence,
    "contract/coverage",
    "contract/format-validation",
    "contract/compatibility",
    "contract/checkpoint-replay",
    "contract/gate-promotion",
    "contract/traceability-merge",
  ];
  requirements.risks = [
    ...requirements.risks,
    "Generator self-certification could admit malformed or semantically incomplete contracts.",
    "Contract-format special cases in Core could prevent module and tool replacement.",
    "Compatibility claims can be wrong if compared against a stale ContractBaseline.",
    "WorkBreakdown can propagate invalid scope if it starts before ContractGate resolution.",
  ];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}

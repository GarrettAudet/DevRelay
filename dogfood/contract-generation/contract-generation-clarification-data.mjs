export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-contract-generation-module-v1",
  statement:
    "Define DevRelay's ContractGeneration module and ContractGate so approved architecture interface intent becomes an exact machine-valid ContractBaseline or an explicit ApprovedNotApplicable disposition before work planning.",
  objectives: [
    "Generate complete provider-neutral contract candidates for every architecture interface that requires a machine-readable contract.",
    "Support establishment and compatible evolution of approved contract baselines without coupling Core to one contract format or tool.",
    "Keep generators replaceable while Core and ContractGate retain validation, compatibility, approval, and progression authority.",
    "Preserve exact native contract bytes as subordinate artifacts with deterministic canonical indexing and evidence.",
    "Extend TraceabilityGraph through trusted contributors rather than adapter-authored graph operations.",
  ],
  constraints: [
    "The exact approved ArchitectureBaseline owns the interface-intent universe and required contract kinds.",
    "ContractGeneration is not invoked when no interface intent requires a contract; ContractGate records ApprovedNotApplicable instead.",
    "Adapters cannot route workflow, approve contracts, mutate TraceabilityGraph, or silently select undeclared formats.",
    "WorkBreakdown cannot progress until ContractGate approves an exact ContractBaseline or ApprovedNotApplicable disposition.",
    "V1 must satisfy the eight approved lifecycle-reporting JSON Schema interface intents without hard-coding those interface IDs in generic Core.",
  ],
  acceptanceCriteria: [
    "Every required architecture interface receives exactly one approved contract or an explicit blocking diagnostic.",
    "Exact input baselines, generator bindings, validator versions, native bytes, compatibility results, and Gate approval are content-bound.",
    "Changing a generator or validator binding requires no semantic Core branch and cannot change canonical authority rules.",
    "Contract changes identify additions, modifications, removals, and compatibility impact against the exact current baseline.",
    "Checkpoint replay never reinvokes an effectful generator and drift stops before adapter entry.",
    "Trusted traceability projection links approved interface intent forward to approved contracts without claiming implementation.",
  ],
  assumptions: [
    "The operation lifecycle, validator trust boundary, V1 format bindings, and candidate traceability semantics require owner confirmation.",
    "The OpenSpec chat bridge records this clarification run but does not claim OpenSpec CLI execution.",
  ],
});

export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary:
    "DevRelay has approved requirements and architecture baselines for the eighteen-component V1 lifecycle. ArchitectureDiscovery is skipped because a baseline exists. The approved architecture requires eight JSON Schema contracts, so Core has selected ContractGeneration and blocks WorkBreakdown until ContractGate completes.",
  stakeholders: [
    "DevRelay product owner",
    "Module and adapter authors",
    "API and schema authors",
    "Workflow and IDE hosts",
    "WorkBreakdown and verification consumers",
    "Security and compatibility reviewers",
  ],
  domainConstraints: [
    "Generic Core owns exact loading, deterministic routing, adapter resolution, checkpoints, canonical validation, traceability merge, and progression.",
    "Architecture interface intent determines whether ContractGeneration runs and which contract kinds are required.",
    "Candidate and approved contract authority remain distinct and ContractGate promotion is explicit.",
    "Adapters receive declared immutable inputs only and never receive TraceabilityGraph.",
    "Native contract files remain subordinate to canonical DevRelay contract artifacts and exact byte references.",
  ],
  conventions: [
    "Use SHA-256-bound artifacts and exact semantic versions at runtime boundaries.",
    "Use JSON Schema draft 2020-12 for DevRelay's portable artifact contracts.",
    "Use lowercase kebab-case operations, ports, relationships, and outcomes.",
    "Store forward lifecycle relationships and derive inverse traversal at query time.",
    "Distinguish contract-defined, fixture-conformant, live-conformant, and release-ready bindings.",
    "Prove positive, negative, replay, drift, substitution, compatibility, and Gate behavior.",
  ],
  sourceRefs: [],
});

export const questions = Object.freeze([
  Object.freeze({
    id: "Q-CG-OPERATION-LIFECYCLE-001",
    prompt:
      "Should ContractGeneration use separate establish-contracts and generate-contract-change operations selected from project state, while ContractGate owns ApprovedNotApplicable when no contracts are required?",
    rationale:
      "This keeps establishment, compatibility-aware evolution, and the conditional not-applicable branch deterministic without asking a model to choose the path.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Separate state-routed operations; ContractGate owns ApprovedNotApplicable (recommended)",
      "One full-snapshot generate-contracts operation for both establishment and change",
    ],
  }),
  Object.freeze({
    id: "Q-CG-TRUST-BOUNDARY-001",
    prompt:
      "Which boundary should own generation, format validation, compatibility analysis, semantic completeness, and promotion?",
    rationale:
      "A generator can propose useful native contracts but cannot safely certify its own completeness, compatibility, or authority.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Adapters generate; Core runs pinned format validators and canonical diff; ContractGate verifies semantics and promotes (recommended)",
      "Separate generator and validator adapters jointly produce the authoritative candidate",
      "The configured generator owns validation and compatibility evidence",
    ],
  }),
  Object.freeze({
    id: "Q-CG-V1-BINDINGS-001",
    prompt:
      "How broad should the first executable ContractGeneration binding be?",
    rationale:
      "The current approved architecture requires JSON Schema only, while the provider-neutral contract should remain extensible to OpenAPI, AsyncAPI, Protobuf, and future formats.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Live JSON Schema 2020-12 path first; define fixture-conformant optional format adapters behind the same contract (recommended)",
      "Implement live JSON Schema, OpenAPI, AsyncAPI, and Protobuf paths together",
      "Define contracts only and defer every executable format binding",
    ],
  }),
  Object.freeze({
    id: "Q-CG-OUTPUT-TRACEABILITY-001",
    prompt:
      "Should the module return ContractDraftSet or ContractChangeSetDraft with one typed entry per interface, while trusted contributors project candidate and approved forward traceability separately?",
    rationale:
      "This preserves exact interface coverage, compatibility change semantics, and candidate-versus-approved authority without letting adapters author graph operations.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Typed draft/change-set outputs with separate candidate and approved traceability projections (recommended)",
      "Return only a native artifact bundle and derive contract identity at the Gate",
    ],
  }),
]);

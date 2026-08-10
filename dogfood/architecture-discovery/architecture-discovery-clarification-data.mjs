export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-architecture-discovery-module-v1",
  statement:
    "Define DevRelay's conditional ArchitectureDiscovery module so an existing repository without an approved architecture baseline can produce a source-bound observational CurrentArchitectureSnapshot before ArchitectureDesign.",
  objectives: [
    "Discover the implemented system from an exact version-pinned repository snapshot without treating intended design as observed fact.",
    "Produce the canonical current-architecture context required by ArchitectureDesign establish-baseline.",
    "Separate direct observations, deterministic derivations, analyzer inferences, unknowns, and blocking gaps.",
    "Keep discovery capabilities replaceable while Core retains routing, validation, checkpointing, and progression authority.",
    "Prevent incomplete or stale discovery from silently becoming an architecture baseline.",
  ],
  constraints: [
    "ArchitectureDiscovery runs only for an existing repository with neither an approved ArchitectureBaseline nor a valid CurrentArchitectureSnapshot.",
    "The module describes current implementation; ArchitectureDesign owns proposed architecture and ArchitectureGate owns baseline promotion.",
    "Every observation must resolve to exact repository, artifact, or analyzer provenance.",
    "Adapters cannot mutate TraceabilityGraph, approve results, or choose lifecycle progression.",
    "Repository access, external transmission, and analyzer execution must be explicit and policy-bound.",
  ],
  acceptanceCriteria: [
    "Deterministic project state selects discover or bypass without model or adapter discretion.",
    "The invocation pins the repository revision, tree/content digest, ProjectOverviewBaseline, project context, adapter versions, options, and grants.",
    "A successful run returns exactly one schema-valid CurrentArchitectureSnapshot with provenance, confidence, gaps, and native artifacts.",
    "Blocking discovery gaps produce needs_clarification and cannot progress to ArchitectureDesign.",
    "Checkpoint replay reuses the exact validated output without reinvoking analyzers.",
    "Provider substitution changes only configured capability bindings while canonical output semantics remain stable.",
  ],
  assumptions: [
    "The default inventory strategy, uncertainty policy, and repository privacy boundary require owner confirmation.",
    "The bounded OpenSpec chat bridge records this clarification run but does not claim OpenSpec CLI execution.",
  ],
});

export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary:
    "DevRelay has a conditional ArchitectureDiscovery prerequisite contract and a CurrentArchitectureSnapshot schema, but no executable discovery module. The module is required to complete the approved V1 lifecycle.",
  stakeholders: [
    "DevRelay product owner",
    "Architecture and repository maintainers",
    "Workflow and IDE hosts",
    "Analyzer and adapter authors",
    "Security and compliance reviewers",
  ],
  domainConstraints: [
    "Generic Core cannot branch on product, repository language, analyzer, or adapter identity.",
    "ArchitectureDesign already consumes CurrentArchitectureSnapshot for existing-discovered-unbaselined state.",
    "External hosts enforce filesystem, process, network, and secret permissions.",
    "Discovery findings are observational inputs, not approved architecture decisions.",
    "Traceability contributors are trusted infrastructure; adapters declare canonical domain provenance only.",
  ],
  conventions: [
    "Use SHA-256-bound artifacts and exact semantic versions at every boundary.",
    "Represent observed, derived, inferred, unknown, and not-applicable dispositions explicitly.",
    "Preserve native analyzer output as evidence; summaries are never the only truth.",
    "Fail closed on repository drift, malformed output, unresolved source references, and checkpoint substitution.",
    "Prove successful, clarification, unable-to-proceed, drift, substitution, and zero-call replay paths.",
  ],
  sourceRefs: [],
});

export const questions = Object.freeze([
  Object.freeze({
    id: "Q-AD-DISCOVERY-CAPABILITIES-001",
    prompt:
      "Should every discovery run begin with a mandatory deterministic local repository inventory, with dependency-cruiser, SCIP, or similar analyzers contributing only optional bounded observations?",
    rationale:
      "A stable minimum inventory prevents analyzer availability from changing the module contract while keeping specialized analysis replaceable.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Require a version-pinned native inventory adapter; treat specialized analyzers as optional contributors (recommended)",
      "Require each selected external analyzer to provide the entire discovery result",
    ],
  }),
  Object.freeze({
    id: "Q-AD-CONFIDENCE-GATE-001",
    prompt:
      "How should incomplete or low-confidence discovery affect progression to ArchitectureDesign?",
    rationale:
      "Treating uncertainty as certainty can create an incorrect baseline, while blocking on every minor unknown can make discovery unusable.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Block only on declared material gaps; preserve non-blocking low-confidence findings and require explicit Gate disposition (recommended)",
      "Block ArchitectureDesign whenever any discovery finding is low-confidence or unknown",
    ],
  }),
  Object.freeze({
    id: "Q-AD-REPOSITORY-BOUNDARY-001",
    prompt:
      "What repository-access and privacy boundary should ArchitectureDiscovery use by default?",
    rationale:
      "Discovery may inspect proprietary source, generated output, ignored files, secrets, and dependency metadata, so its default boundary must be explicit.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Analyze tracked or explicitly declared files offline, respect ignore and secret rules, and require opt-in before source content leaves the host (recommended)",
      "Allow configured analyzers to inspect or transmit any repository content allowed by their host credentials",
    ],
  }),
]);

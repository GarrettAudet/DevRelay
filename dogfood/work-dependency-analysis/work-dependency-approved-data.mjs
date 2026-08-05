import {
  buildWorkingRequirements,
  mergeProjectRequirements,
} from "./work-dependency-clarification-data.mjs";

export { mergeProjectRequirements };

export const ownerDecisions = Object.freeze([
  Object.freeze({
    questionId: "Q-WDA-OPERATION-LIFECYCLE-001",
    decision:
      "Use one full-snapshot analyze-dependencies operation for every exact WorkBreakdownBaseline.",
  }),
  Object.freeze({
    questionId: "Q-WDA-TRUST-BOUNDARY-001",
    decision:
      "A proposer returns a candidate; trusted Core validates graph mechanics; WorkDependencyGate verifies semantic completeness and owns promotion.",
  }),
  Object.freeze({
    questionId: "Q-WDA-INPUT-CONTEXT-001",
    decision:
      "Supply the full immutable candidate work-breakdown snapshot plus only declared relevant context slices, each pinned to an exact artifact version, content digest, or repository commit.",
  }),
  Object.freeze({
    questionId: "Q-WDA-PARALLELISM-001",
    decision:
      "Persist only the authoritative DAG; downstream runtime state derives the runnable frontier.",
  }),
  Object.freeze({
    questionId: "Q-WDA-PLUGIN-SURFACE-001",
    decision:
      "Use a native structured proposer, OPA policy evaluation, Graphology-DAG for Core-owned graph mechanics, Spec Kit as a consistency reviewer, and optional Task Master or OpenSpec proposal adapters.",
  }),
]);

function replaceById(entries, id, update) {
  return entries.map((entry) =>
    entry.id === id ? { ...entry, ...update(entry) } : entry,
  );
}

function sourced(sourceRefs, value) {
  return { ...value, sourceRefs: structuredClone(sourceRefs) };
}

export function buildApprovedWorkingRequirements(makeSourceRefs) {
  const requirements = structuredClone(buildWorkingRequirements(makeSourceRefs));
  const sourceRefs = makeSourceRefs();

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary:
      "The five WorkDependencyAnalysis boundary decisions are confirmed. The requirements change candidate is ready for Requirements Gate review before ArchitectureDesign.",
  });

  const assumptions = {
    "ASM-WDA-OPERATION-LIFECYCLE-001":
      "WorkDependencyAnalysis exposes one analyze-dependencies operation that recomputes a complete candidate DAG from each exact full WorkBreakdownBaseline snapshot.",
    "ASM-WDA-TRUST-BOUNDARY-001":
      "A proposer proposes dependencies; trusted Core validates Graphology-DAG mechanics; OPA evaluates the exact policy bundle; WorkDependencyGate verifies semantic completeness and promotes.",
    "ASM-WDA-INPUT-CONTEXT-001":
      "The proposer receives the full immutable work-breakdown analysis snapshot plus declared relevant context slices pinned to exact artifact versions, content digests, or repository commits.",
    "ASM-WDA-PARALLELISM-001":
      "The module persists only the dependency DAG while downstream runtime state derives runnable frontiers.",
    "ASM-WDA-PLUGIN-SURFACE-001":
      "V1 provides a native structured proposer, OPA policy evaluation, Graphology-DAG mechanics, a bounded Spec Kit consistency reviewer, and optional Task Master and OpenSpec proposal adapters.",
  };
  requirements.assumptions = requirements.assumptions.map((entry) =>
    assumptions[entry.id]
      ? {
          ...entry,
          statement: assumptions[entry.id],
          status: "confirmed",
          blocking: false,
          sourceRefs: structuredClone(sourceRefs),
        }
      : entry,
  );

  requirements.acceptanceCriteria = replaceById(
    requirements.acceptanceCriteria,
    "AC-WDA-INPUT-COHERENCE-001",
    () => ({
      statement:
        "Core constructs one complete immutable WorkBreakdownAnalysisSnapshot from the exact approved WorkBreakdownBaseline and admits only declared relevant ContextSlice entries whose source artifact version, content digest, or repository commit and extracted-content digest all verify before proposer entry.",
      verification:
        "Mutate the baseline pointer, slice selector, source version, source digest, repository commit, or extracted-content digest and verify pre-proposer rejection with zero proposer calls.",
      sourceRefs: structuredClone(sourceRefs),
    }),
  );
  requirements.acceptanceCriteria = replaceById(
    requirements.acceptanceCriteria,
    "AC-WDA-CYCLE-001",
    () => ({
      statement:
        "Trusted Core uses its pinned Graphology and Graphology-DAG implementation to reject self-dependencies and every directed cycle with a deterministic canonical cycle witness.",
      verification:
        "Exercise self-loop, two-node, nested, disconnected, and insertion-order variants and compare canonical witnesses across replays.",
      sourceRefs: structuredClone(sourceRefs),
    }),
  );
  requirements.acceptanceCriteria = replaceById(
    requirements.acceptanceCriteria,
    "AC-WDA-MISSING-001",
    () => ({
      statement:
        "WorkDependencyGate rejects unresolved blocking missing-dependency findings from the exact native proposal, OPA decision set, consistency review, and Gate-owned semantic review.",
      verification:
        "Use omitted-prerequisite fixtures and verify that proposer silence or a passing mechanical DAG cannot authorize promotion.",
      sourceRefs: structuredClone(sourceRefs),
    }),
  );
  requirements.acceptanceCriteria = replaceById(
    requirements.acceptanceCriteria,
    "AC-WDA-ORDERING-001",
    () => ({
      statement:
        "WorkDependencyGate rejects invalid endpoints, duplicate edges, contradictory evidence, OPA-denied relationships, unresolved reviewer findings, and other policy-forbidden ordering.",
      verification:
        "Run one negative fixture per rejection and verify stable diagnostics and no promotion payload.",
      sourceRefs: structuredClone(sourceRefs),
    }),
  );
  requirements.acceptanceCriteria = replaceById(
    requirements.acceptanceCriteria,
    "AC-WDA-PLUGIN-BOUNDARY-001",
    () => ({
      statement:
        "The default native structured proposer and optional Task Master or OpenSpec proposal adapters may return only the canonical proposal contract; Spec Kit may return only consistency-review findings; none may route, validate Core mechanics, evaluate promotion policy, access TraceabilityGraph, or claim authority.",
      verification:
        "Swap every proposer and reviewer binding, attempt prohibited outputs and graph operations, and scan generic routing Core for product identifiers.",
      sourceRefs: structuredClone(sourceRefs),
    }),
  );

  requirements.acceptanceCriteria.push(
    sourced(sourceRefs, {
      id: "AC-WDA-NATIVE-PROPOSER-001",
      statement:
        "The default proposer is a DevRelay-native structured proposer that consumes only the full analysis snapshot and declared context slices and returns the same provider-neutral DependencyProposal contract required from optional proposal adapters.",
      verification:
        "Run native, Task Master, and OpenSpec proposal fixtures through the same schema, lineage, hint-disposition, provenance, and substitution suite.",
    }),
    sourced(sourceRefs, {
      id: "AC-WDA-OPA-POLICY-001",
      statement:
        "OPA evaluates a version-pinned policy bundle against one canonical JSON input document and returns a normalized decision set whose bundle digest, entrypoint, input digest, engine version, and raw result evidence are checkpoint-bound.",
      verification:
        "Exercise allow, deny, undefined, malformed, stale-bundle, wrong-entrypoint, nondeterministic-input-order, and evaluation-failure fixtures.",
    }),
    sourced(sourceRefs, {
      id: "AC-WDA-GRAPH-MECHANICS-001",
      statement:
        "Graphology and Graphology-DAG remain replaceable implementation libraries behind Core-owned canonical graph mechanics; their native serialization, traversal order, or diagnostic wording never becomes the DevRelay artifact contract.",
      verification:
        "Feed equivalent insertion orders and library-native shapes and compare canonical node, edge, topological-order, cycle-witness, and diagnostic bytes.",
    }),
    sourced(sourceRefs, {
      id: "AC-WDA-CONSISTENCY-REVIEW-001",
      statement:
        "The bounded Spec Kit analyze capability acts only as a consistency and coverage reviewer after canonical proposal normalization and cannot add authoritative edges or approve the candidate.",
      verification:
        "Return reviewer passes, warnings, proposed corrections, malformed outputs, and contradictions and verify that only Gate-owned policy can resolve blocking findings.",
    }),
    sourced(sourceRefs, {
      id: "AC-WDA-CONTEXT-SLICES-001",
      statement:
        "Every ContextSlice declares its purpose, source artifact reference, source kind and version or commit, deterministic selector, extracted-content digest, and covered work-item or proposal references; undeclared adapter-selected context is forbidden.",
      verification:
        "Reject missing relevance, overbroad selectors, unresolved source pointers, duplicate slices, uncovered references, and byte or version drift before any proposal effect.",
    }),
  );

  requirements.userStories = replaceById(
    requirements.userStories,
    "US-WDA-ANALYZE-001",
    (entry) => ({
      acceptanceCriterionIds: [
        ...entry.acceptanceCriterionIds,
        "AC-WDA-CONTEXT-SLICES-001",
        "AC-WDA-NATIVE-PROPOSER-001",
      ],
      sourceRefs: structuredClone(sourceRefs),
    }),
  );
  requirements.userStories = replaceById(
    requirements.userStories,
    "US-WDA-VERIFY-001",
    (entry) => ({
      acceptanceCriterionIds: [
        ...entry.acceptanceCriterionIds,
        "AC-WDA-CONSISTENCY-REVIEW-001",
        "AC-WDA-GRAPH-MECHANICS-001",
        "AC-WDA-OPA-POLICY-001",
      ],
      sourceRefs: structuredClone(sourceRefs),
    }),
  );
  requirements.userStories = replaceById(
    requirements.userStories,
    "US-WDA-PLUGINS-001",
    (entry) => ({
      acceptanceCriterionIds: [
        ...entry.acceptanceCriterionIds,
        "AC-WDA-CONSISTENCY-REVIEW-001",
        "AC-WDA-NATIVE-PROPOSER-001",
      ],
      sourceRefs: structuredClone(sourceRefs),
    }),
  );

  requirements.scope.push(
    sourced(sourceRefs, {
      id: "SCOPE-WDA-CONTEXT-SLICES-001",
      statement:
        "Version-pinned relevant context slicing and pre-proposer coherence validation.",
    }),
    sourced(sourceRefs, {
      id: "SCOPE-WDA-OPA-001",
      statement:
        "Pinned OPA policy bundle evaluation and normalized decision evidence.",
    }),
    sourced(sourceRefs, {
      id: "SCOPE-WDA-REVIEW-001",
      statement:
        "A bounded post-proposal consistency-review slot with Spec Kit as the V1 binding.",
    }),
  );
  requirements.terminology.push(
    sourced(sourceRefs, {
      id: "TERM-WDA-CONTEXT-SLICE-001",
      term: "Context slice",
      definition:
        "A deterministic, relevance-declared extraction from one immutable version-pinned source artifact, supplied as explicit analyzer input with its own content digest.",
      aliases: [],
    }),
    sourced(sourceRefs, {
      id: "TERM-WDA-ANALYSIS-SNAPSHOT-001",
      term: "WorkBreakdown analysis snapshot",
      definition:
        "The complete immutable projection of one exact approved WorkBreakdownBaseline used as the work-item universe for a single full dependency analysis.",
      aliases: ["Candidate work-breakdown snapshot"],
    }),
  );

  requirements.dependencies = requirements.dependencies
    .filter((entry) => !entry.startsWith("Owner responses to"))
    .concat([
      "Pinned Graphology and Graphology-DAG libraries behind the Core graph-mechanics boundary.",
      "A version-pinned OPA policy bundle and deterministic evaluation host.",
      "A bounded Spec Kit consistency-review binding plus optional Task Master and OpenSpec proposal bindings.",
    ]);
  requirements.risks = requirements.risks.concat([
    "Context slices may omit a semantically relevant source region unless Gate coverage checks remain independent of proposer selection.",
    "OPA policy success may be mistaken for semantic completeness unless WorkDependencyGate separately reviews missing-dependency evidence.",
    "Graphology traversal or serialization order may leak nondeterminism unless Core canonicalizes all externally visible artifacts and diagnostics.",
    "A consistency reviewer may be mistaken for authority unless reviewer findings remain advisory inputs to the Gate.",
  ]);
  requirements.requiredEvidence = requirements.requiredEvidence.concat([
    "dependency/context-slice-coherence",
    "dependency/graphology-mechanics",
    "dependency/opa-policy-decision",
    "dependency/spec-kit-consistency-review",
  ]);

  return requirements;
}

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
    if (collectionKeys.has(key)) return entries.sort((left, right) => compare(left.id, right.id));
    if (stringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) {
      return [...new Set(entries)].sort(compare);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]),
  );
}

export const ownerDecisions = Object.freeze([
  Object.freeze({ questionId: "Q-WE-EXECUTION-UNIT-001", answer: "One runnable WorkItem per invocation; Core fans out the frontier (recommended)" }),
  Object.freeze({ questionId: "Q-WE-RUNTIME-BINDING-001", answer: "A version-pinned ExecutionBinding resolves the profile to a configured executor adapter; Core validates it (recommended)" }),
  Object.freeze({ questionId: "Q-WE-OUTPUT-BOUNDARY-001", answer: "Return ChangeSetDraft plus ExecutionEvidenceBundle only; no verified, complete, or integrated claim (recommended)" }),
  Object.freeze({ questionId: "Q-WE-RETRY-IDENTITY-001", answer: "Create a new immutable ExecutionAttempt linked to the prior attempt; never overwrite (recommended)" }),
]);

export function buildWorkExecutionRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => { requirements[key] = [...requirements[key], ...values]; };

  append("capabilities", [{
    id: "CAP-DEV-WORK-EXECUTION-001",
    name: "Isolated deterministic work execution",
    description: "Execute one Core-selected runnable work item through a provider-neutral binding in an isolated host-enforced workspace and return proposed changes with raw evidence.",
    businessObjectiveIds: ["BO-DEV-DETERMINISM-001", "BO-DEV-MODULARITY-001", "BO-DEV-TRACEABILITY-001"],
    userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
    audience: "user-facing",
    key: true,
    priority: "must",
    sourceRefs: refs(),
  }]);

  append("userJourneys", [{
    id: "UJ-DEV-WORK-EXECUTION-001",
    name: "Execute one runnable work item",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityIds: ["CAP-DEV-WORK-EXECUTION-001"],
    trigger: "Core derives a runnable work item from the approved dependency baseline and integrated completion facts.",
    outcome: "One immutable attempt returns a proposed change set and raw evidence, or a durable failed or interrupted outcome.",
    steps: [
      { sequence: 1, action: "Core validates readiness and resolves the exact assignment and execution binding.", expectedOutcome: "Only one authorized work item and executor enter the attempt." },
      { sequence: 2, action: "The host prepares an isolated workspace and enforces declared tools, grants, repository scope, network scope, and secrets.", expectedOutcome: "The executor receives only approved authority and context." },
      { sequence: 3, action: "The configured executor performs the bounded work and returns exact changes and raw evidence.", expectedOutcome: "Downstream verification receives proposed work without an execution-authored completion claim." },
    ],
    sourceRefs: refs(),
  }]);

  append("userStories", [{
    id: "US-DEV-WORK-EXECUTION-001",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityId: "CAP-DEV-WORK-EXECUTION-001",
    userJourneyIds: ["UJ-DEV-WORK-EXECUTION-001"],
    need: "Execute each ready work item independently through its approved specialist assignment and a replaceable concrete executor.",
    benefit: "Dependency-safe work can run in parallel without coupling workflow semantics to one provider or sacrificing isolation, retryability, or evidence.",
    priority: "must",
    acceptanceCriterionIds: [
      "AC-DEV-WE-BINDING-001",
      "AC-DEV-WE-BOUNDARY-001",
      "AC-DEV-WE-DETERMINISM-001",
      "AC-DEV-WE-ISOLATION-001",
      "AC-DEV-WE-ONE-ITEM-001",
      "AC-DEV-WE-OUTPUT-001",
      "AC-DEV-WE-READINESS-001",
      "AC-DEV-WE-RETRY-001",
      "AC-DEV-WE-TRACEABILITY-001"
    ],
    sourceRefs: refs(),
  }]);

  append("acceptanceCriteria", [
    { id: "AC-DEV-WE-BINDING-001", statement: "A version-pinned ExecutionBinding resolves the assigned provider-neutral SpecialistProfile to one configured executor adapter, and Core validates the exact binding before invocation.", verification: "Run exact, stale, missing, mismatched-profile, and substituted-executor binding fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WE-BOUNDARY-001", statement: "WorkExecution cannot select readiness, modify work scope or the dependency DAG, claim verification, integrate changes, or mark a work item complete.", verification: "Attempt every forbidden authority through inputs and executor output and require fail-closed rejection.", sourceRefs: refs() },
    { id: "AC-DEV-WE-DETERMINISM-001", statement: "Exact inputs, binding, policy, workspace base, and executor result bytes produce byte-identical canonical attempt, change-set, evidence, diagnostics, and checkpoint artifacts.", verification: "Repeat equivalent executions, replay checkpoints, and compare canonical digests.", sourceRefs: refs() },
    { id: "AC-DEV-WE-ISOLATION-001", statement: "The external host supplies an isolated workspace and enforces exactly the declared filesystem, process, network, and secret grants for the attempt.", verification: "Exercise allowed and denied mutations, commands, connections, and secret reads against a host conformance fixture.", sourceRefs: refs() },
    { id: "AC-DEV-WE-ONE-ITEM-001", statement: "One WorkExecution invocation is bound to exactly one runnable WorkItem; Core fans out separate invocations for a ready DAG frontier.", verification: "Reject multi-item, absent-item, non-frontier, and duplicate-attempt invocations and demonstrate independent parallel frontier attempts.", sourceRefs: refs() },
    { id: "AC-DEV-WE-OUTPUT-001", statement: "A successful attempt returns exactly one ChangeSetDraft and one ExecutionEvidenceBundle and makes no verified, complete, or integrated claim.", verification: "Validate positive output and reject missing, extra, verification, completion, and integration claims.", sourceRefs: refs() },
    { id: "AC-DEV-WE-READINESS-001", statement: "Core proves the selected work item is in the current runnable frontier derived from the approved DAG and integrated completion facts before executor entry.", verification: "Exercise ready, blocked, stale-completion, changed-DAG, and forged-frontier fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WE-RETRY-001", statement: "Every actual invocation creates a new immutable ExecutionAttempt; retry links to but never overwrites its failed or interrupted predecessor.", verification: "Exercise failure, interruption, retry, replay, duplicate identity, and predecessor-drift fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WE-TRACEABILITY-001", statement: "Trusted contributors link WorkItem to ExecutionAttempt and successful ExecutionAttempt to ChangeSetDraft while executors cannot author graph operations or completion facts.", verification: "Validate candidate graph scope, forward edge vocabulary, provenance, atomic merge, and forbidden executor graph access.", sourceRefs: refs() },
  ]);

  append("scope", [{
    id: "SCOPE-DEV-WORK-EXECUTION-DETAIL-001",
    statement: "One WorkExecution module covering Core readiness proof, version-pinned runtime binding, isolated one-item attempts, replaceable executors, immutable retries, proposed changes, raw evidence, checkpoint replay, and candidate traceability.",
    sourceRefs: refs(),
  }]);

  append("constraints", [
    { id: "CON-DEV-WE-AUTHORITY-001", category: "business", statement: "Core owns readiness, input validation, binding validation, canonical output validation, checkpointing, and progression; executor adapters own only bounded work performance.", rationale: "An executor cannot safely certify its own authority or downstream completion.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-READINESS-001"], sourceRefs: refs() },
    { id: "CON-DEV-WE-ONE-ITEM-001", category: "business", statement: "V1 executes exactly one runnable WorkItem per invocation and represents frontier parallelism as multiple independent invocations.", rationale: "Per-item isolation preserves retry, permission, evidence, and failure boundaries.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WE-ONE-ITEM-001"], sourceRefs: refs() },
    { id: "CON-DEV-WE-IMMUTABLE-ATTEMPT-001", category: "business", statement: "ExecutionAttempt records are immutable; every retry has a new identity and exact predecessor reference.", rationale: "Overwriting attempts destroys auditability and makes replay ambiguous.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WE-RETRY-001"], sourceRefs: refs() },
    { id: "CON-DEV-WE-HOST-ENFORCEMENT-001", category: "security", statement: "External hosts enforce workspaces and permissions; declarative grants in DevRelay are demands, not claims that Core enforced operating-system isolation.", rationale: "Provider-neutral Core cannot truthfully claim host effects it does not perform.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WE-ISOLATION-001"], sourceRefs: refs() },
    { id: "CON-DEV-WE-VERIFICATION-BARRIER-001", category: "business", statement: "Only WorkItemVerification may determine whether a ChangeSetDraft and evidence satisfy the work item; WorkExecution cannot advance directly to integration.", rationale: "Producing changes is distinct from proving them correct.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-OUTPUT-001"], sourceRefs: refs() },
  ]);

  append("nonFunctionalRequirements", [
    { id: "NFR-DEV-WE-DETERMINISM-001", category: "reliability", statement: "Readiness proof, binding validation, attempt identity, canonical output, diagnostics, and checkpoint replay must be deterministic for exact version-pinned inputs.", applicability: { level: "project" }, measure: "Canonical digest equality and zero-call replay.", target: "100 percent equality for Core-owned artifacts.", priority: "must", acceptanceCriterionIds: ["AC-DEV-WE-DETERMINISM-001", "AC-DEV-WE-RETRY-001"], sourceRefs: refs() },
    { id: "NFR-DEV-WE-ISOLATION-001", category: "security", statement: "Execution permissions must be least-privilege, explicit, host-enforced, and bound to one attempt and workspace.", applicability: { level: "project" }, measure: "Host conformance tests for every declared permission kind and denial path.", target: "No undeclared access succeeds.", priority: "must", acceptanceCriterionIds: ["AC-DEV-WE-ISOLATION-001"], sourceRefs: refs() },
  ]);

  append("assumptions", [{
    id: "ASM-DEV-WE-V1-001",
    statement: "V1 executes one ready work item per immutable attempt, validates a version-pinned profile-to-executor binding, returns proposed changes plus raw evidence, and leaves verification and integration downstream.",
    status: "confirmed",
    blocking: false,
    sourceRefs: refs(),
  }]);

  append("terminology", [
    { id: "TERM-DEV-EXECUTION-ATTEMPT-001", term: "Execution attempt", definition: "One immutable, content-addressed invocation of a concrete executor for one exact runnable work item in one isolated workspace.", aliases: ["ExecutionAttempt"], sourceRefs: refs() },
    { id: "TERM-DEV-EXECUTION-BINDING-001", term: "Execution binding", definition: "A version-pinned mapping from an approved provider-neutral specialist profile to a configured concrete executor adapter and its host policy.", aliases: ["ExecutionBinding"], sourceRefs: refs() },
  ]);

  requirements.currentStatus = { lifecycle: "existing", phase: "implementation", summary: "WorkExecution requirements are clarified: one ready work item per isolated immutable attempt, Core-validated runtime binding, proposed changes plus raw evidence only, and linked non-overwriting retries.", sourceRefs: refs() };
  requirements.deliverables = [...requirements.deliverables, "Provider-neutral WorkExecution module and execution contract", "ExecutionBinding, ExecutionAttempt, ChangeSetDraft, and ExecutionEvidenceBundle contracts", "Trusted execution-attempt traceability contributors"];
  requirements.dependencies = [...requirements.dependencies, "Approved WorkBreakdown, WorkDependency, and SpecialistAssignment baselines", "Version-pinned repository snapshot, execution policy, workspace base, and executor binding"];
  requirements.requiredEvidence = [...requirements.requiredEvidence, "execution/readiness", "execution/binding", "execution/isolation", "execution/change-set", "execution/raw-evidence", "execution/checkpoint-replay", "execution/traceability-merge"];
  requirements.risks = [...requirements.risks, "An executor could exceed scope unless the host enforces exact grants.", "A stale frontier could run work before prerequisites are integrated.", "Retries could destroy evidence if attempts are overwritten.", "Execution could improperly claim verification or integration authority.", "Provider-specific binding details could leak into generic workflow semantics."];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}
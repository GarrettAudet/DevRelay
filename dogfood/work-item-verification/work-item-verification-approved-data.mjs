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

export const confirmedDecisions = Object.freeze([
  Object.freeze({ decisionId: "D-WIV-UNIT-001", statement: "Verify exactly one immutable ExecutionAttempt and its ChangeSetDraft against one approved WorkItem per invocation." }),
  Object.freeze({ decisionId: "D-WIV-AUTHORITY-001", statement: "Verifier adapters produce evidence only; Core validates evidence and WorkItemVerificationGate owns the authoritative disposition." }),
  Object.freeze({ decisionId: "D-WIV-INTEGRATION-001", statement: "A passing item verification authorizes ChangeIntegration consideration but cannot integrate or create an integrated-completion fact." }),
  Object.freeze({ decisionId: "D-WIV-RETRY-001", statement: "Every verification run is immutable; rerun or additional evidence creates a new linked VerificationAttempt." }),
  Object.freeze({ decisionId: "D-WIV-ADAPTER-001", statement: "Core selects configured verifier adapters deterministically from approved evidence kinds and policy, never from model improvisation." }),
]);

export function buildWorkItemVerificationRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => { requirements[key] = [...requirements[key], ...values]; };

  append("capabilities", [{
    id: "CAP-DEV-WORK-ITEM-VERIFICATION-001",
    name: "Evidence-bound work-item verification",
    description: "Evaluate one exact execution attempt and proposed change set against its approved work-item verification plan, acceptance criteria, architecture and contract obligations, and required evidence before integration.",
    businessObjectiveIds: ["BO-DEV-DETERMINISM-001", "BO-DEV-QUALITY-001", "BO-DEV-TRACEABILITY-001"],
    userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
    audience: "user-facing",
    key: true,
    priority: "must",
    sourceRefs: refs(),
  }]);

  append("userJourneys", [{
    id: "UJ-DEV-WORK-ITEM-VERIFICATION-001",
    name: "Verify one executed work item",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityIds: ["CAP-DEV-WORK-ITEM-VERIFICATION-001"],
    trigger: "WorkExecution returns an immutable ExecutionAttempt, ChangeSetDraft, and ExecutionEvidenceBundle for one approved WorkItem.",
    outcome: "One exact verification candidate is approved, rejected, or held for missing evidence without integrating the change.",
    steps: [
      { sequence: 1, action: "Core binds the work item, attempt, change set, evidence, verification policy, and candidate workspace snapshot.", expectedOutcome: "Verification cannot drift to another item, attempt, repository state, or policy." },
      { sequence: 2, action: "Configured verifier adapters collect the declared evidence under host-enforced permissions.", expectedOutcome: "Evidence is attributable to exact tools, versions, commands, inputs, subjects, and raw bytes." },
      { sequence: 3, action: "Core validates evidence and evaluates every verification-plan and required-evidence obligation before WorkItemVerificationGate.", expectedOutcome: "Only a complete exact candidate can receive an approved verification disposition." },
    ],
    sourceRefs: refs(),
  }]);

  append("userStories", [{
    id: "US-DEV-WORK-ITEM-VERIFICATION-001",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityId: "CAP-DEV-WORK-ITEM-VERIFICATION-001",
    userJourneyIds: ["UJ-DEV-WORK-ITEM-VERIFICATION-001"],
    need: "Independently prove that each proposed work-item change satisfies its approved scope and evidence obligations before integration.",
    benefit: "Execution success cannot be confused with correctness, and invalid or under-evidenced changes cannot propagate into the shared baseline.",
    priority: "must",
    acceptanceCriterionIds: [
      "AC-DEV-WIV-BOUNDARY-001",
      "AC-DEV-WIV-DETERMINISM-001",
      "AC-DEV-WIV-EVIDENCE-001",
      "AC-DEV-WIV-GATE-001",
      "AC-DEV-WIV-INDEPENDENCE-001",
      "AC-DEV-WIV-INPUTS-001",
      "AC-DEV-WIV-OUTCOMES-001",
      "AC-DEV-WIV-PLAN-001",
      "AC-DEV-WIV-RETRY-001",
      "AC-DEV-WIV-TRACEABILITY-001"
    ],
    sourceRefs: refs(),
  }]);

  append("acceptanceCriteria", [
    { id: "AC-DEV-WIV-BOUNDARY-001", statement: "WorkItemVerification cannot execute implementation work, change approved scope or dependencies, mutate the candidate change set, integrate changes, create integrated-completion facts, or perform system or business acceptance.", verification: "Attempt each forbidden authority through invocation, adapter result, evidence, candidate, and Gate inputs and require fail-closed rejection.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-DETERMINISM-001", statement: "Exact version-pinned inputs, verification policy, adapter bindings, raw verifier results, and candidate workspace bytes produce byte-identical Core-owned verification artifacts, diagnostics, checkpoints, and Gate inputs.", verification: "Repeat equivalent runs, reorder semantically unordered inputs, replay checkpoints with zero verifier calls, and compare canonical digests.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-EVIDENCE-001", statement: "Every accepted evidence item binds its exact work item, execution attempt, change set, workspace or repository digest, producer identity and version, invocation or command, raw bytes, observed result, and collection time or explicit time-not-applicable disposition.", verification: "Exercise exact, missing, stale, substituted, truncated, unresolvable, over-scoped, and wrong-subject evidence fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-GATE-001", statement: "WorkItemVerificationGate independently validates the exact checkpointed candidate, evidence closure, policy evaluation, and approval bytes before issuing an approved verification result for ChangeIntegration.", verification: "Exercise approved, rejected, modified-byte, missing-evidence, stale-policy, replay, and approval-substitution Gate fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-INDEPENDENCE-001", statement: "When VerificationPolicy requires producer or reviewer independence, Core proves the configured verifier identity is distinct from the bound executor identity; an adapter cannot self-declare independence.", verification: "Exercise independent, same-executor, aliased-identity, missing-identity, and policy-not-required fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-INPUTS-001", statement: "One invocation binds exactly one approved WorkItem, ExecutionAttempt, ChangeSetDraft, ExecutionEvidenceBundle, verification policy, project and engineering baselines, repository base, and candidate workspace snapshot, all by immutable reference.", verification: "Exercise exact, absent, duplicate, cross-item, cross-attempt, stale-baseline, changed-repository, and changed-workspace fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-OUTCOMES-001", statement: "The closed outcomes are verified, failed, needs-evidence, baseline-drift, and unable-to-proceed; only verified may advance to ChangeIntegration and none may claim integration.", verification: "Exercise every outcome and reject partial, ambiguous, unknown, self-approved, and integrated claims.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-PLAN-001", statement: "Core evaluates every declared verification-plan check and required-evidence obligation from the approved WorkItem, acceptance criteria, architecture elements, and contracts with no adapter-authored scope reduction.", verification: "Exercise complete coverage, missing check, missing evidence kind, unrelated evidence, extra unauthorized check, and adapter-suppressed obligation fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-RETRY-001", statement: "Every actual verification invocation creates a new immutable VerificationAttempt; rerun, failed verification, or added evidence links to but never overwrites its predecessor.", verification: "Exercise pass, fail, evidence continuation, interruption, retry, replay, duplicate identity, and predecessor-drift fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-WIV-TRACEABILITY-001", statement: "Trusted contributors link WorkItem, ExecutionAttempt, and ChangeSetDraft to the verification attempt and link each acceptance criterion to accepted evidence only after Gate approval; verifier adapters cannot author graph operations.", verification: "Validate candidate and approved scopes, forward edge vocabulary, evidence provenance, atomic merge, orphan diagnostics, and forbidden adapter graph access.", sourceRefs: refs() },
  ]);

  append("scope", [{
    id: "SCOPE-DEV-WORK-ITEM-VERIFICATION-DETAIL-001",
    statement: "One WorkItemVerification module covering exact per-item verification inputs, policy-selected evidence producers, immutable verification attempts, evidence closure, independence policy, checkpoint replay, separate Gate approval, and candidate-to-approved traceability without integration authority.",
    sourceRefs: refs(),
  }]);

  append("constraints", [
    { id: "CON-DEV-WIV-AUTHORITY-001", category: "business", statement: "Verifier adapters produce observations and evidence only; Core owns canonical validation and policy evaluation, while WorkItemVerificationGate alone owns approval and progression to ChangeIntegration.", rationale: "No evidence producer can safely certify its own completeness or authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-GATE-001"], sourceRefs: refs() },
    { id: "CON-DEV-WIV-EXACT-SUBJECT-001", category: "technical", statement: "Verification evidence must be bound to one exact work item, execution attempt, change set, repository base, and candidate workspace; evidence from another subject cannot be reused implicitly.", rationale: "Tests or reviews over different bytes do not prove the candidate under consideration.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WIV-EVIDENCE-001", "AC-DEV-WIV-INPUTS-001"], sourceRefs: refs() },
    { id: "CON-DEV-WIV-IMMUTABLE-ATTEMPT-001", category: "business", statement: "VerificationAttempt and accepted evidence records are immutable; every retry or continuation receives a new identity and exact predecessor reference.", rationale: "Overwriting verification destroys the audit trail and can silently replace failing evidence.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WIV-RETRY-001"], sourceRefs: refs() },
    { id: "CON-DEV-WIV-NO-INTEGRATION-001", category: "business", statement: "A verified result authorizes ChangeIntegration consideration only; WorkItemVerification cannot mutate the shared baseline or create an integrated-completion fact.", rationale: "Proof of a candidate and incorporation of that candidate are separate lifecycle authorities.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-OUTCOMES-001"], sourceRefs: refs() },
    { id: "CON-DEV-WIV-HOST-ENFORCEMENT-001", category: "security", statement: "External hosts enforce verifier workspace, process, network, secret, and read/write permissions; DevRelay permission declarations remain demands rather than claims of operating-system enforcement.", rationale: "Provider-neutral Core cannot truthfully claim host isolation effects it does not perform.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-WIV-EVIDENCE-001"], sourceRefs: refs() },
  ]);

  append("nonFunctionalRequirements", [
    { id: "NFR-DEV-WIV-DETERMINISM-001", category: "reliability", statement: "Input binding, obligation expansion, evidence normalization, policy evaluation, diagnostics, checkpoint replay, and Gate preparation must be deterministic for exact version-pinned inputs.", applicability: { level: "project" }, measure: "Canonical digest equality and zero-call checkpoint replay.", target: "100 percent equality for Core-owned artifacts.", priority: "must", acceptanceCriterionIds: ["AC-DEV-WIV-DETERMINISM-001", "AC-DEV-WIV-RETRY-001"], sourceRefs: refs() },
    { id: "NFR-DEV-WIV-EVIDENCE-CLOSURE-001", category: "observability", statement: "Every approved verification result must carry complete, resolvable, subject-bound evidence and an explicit disposition for every required verification obligation.", applicability: { level: "project" }, measure: "Approved obligations lacking exact evidence or an approved not-applicable disposition.", target: "Zero.", priority: "must", acceptanceCriterionIds: ["AC-DEV-WIV-EVIDENCE-001", "AC-DEV-WIV-PLAN-001"], sourceRefs: refs() },
    { id: "NFR-DEV-WIV-ISOLATION-001", category: "security", statement: "Verifier adapters must receive least-privilege, explicit, host-enforced permissions bound to one immutable verification attempt and candidate workspace.", applicability: { level: "project" }, measure: "Host conformance checks for allowed and denied verifier operations.", target: "No undeclared access succeeds.", priority: "must", acceptanceCriterionIds: ["AC-DEV-WIV-EVIDENCE-001", "AC-DEV-WIV-INDEPENDENCE-001"], sourceRefs: refs() },
  ]);

  append("assumptions", [{
    id: "ASM-DEV-WIV-V1-001",
    statement: "The approved V1 lifecycle, WorkExecution verification barrier, per-item execution model, and evidence-first quality objective already determine the WorkItemVerification boundary; no blocking product clarification is required.",
    status: "confirmed",
    blocking: false,
    sourceRefs: refs(),
  }]);

  append("terminology", [
    { id: "TERM-DEV-VERIFICATION-ATTEMPT-001", term: "Verification attempt", definition: "One immutable evaluation of one exact work item, execution attempt, proposed change set, candidate workspace, verification policy, and evidence closure.", aliases: ["VerificationAttempt"], sourceRefs: refs() },
    { id: "TERM-DEV-VERIFICATION-EVIDENCE-001", term: "Verification evidence", definition: "Content-addressed producer output bound to the exact verification subject, producer identity and version, invocation, observed result, and raw bytes.", aliases: ["VerificationEvidence"], sourceRefs: refs() },
  ]);

  requirements.currentStatus = { lifecycle: "existing", phase: "implementation", summary: "WorkItemVerification requirements are defined from the approved V1 verification barrier: verify one exact execution result, keep evidence producers untrusted, require complete subject-bound evidence, and leave integration downstream.", sourceRefs: refs() };
  requirements.deliverables = [...requirements.deliverables, "Provider-neutral WorkItemVerification module and WorkItemVerificationGate", "VerificationPolicy, VerificationAttempt, WorkItemVerificationDraft, VerificationEvidenceBundle, and approved verification-result contracts", "Trusted candidate and approved work-item verification traceability contributors"];
  requirements.dependencies = [...requirements.dependencies, "Approved WorkBreakdown, WorkDependency, SpecialistAssignment, and WorkExecution artifacts", "Version-pinned project, architecture, contract, repository-base, candidate-workspace, verification-policy, and verifier-binding artifacts"];
  requirements.requiredEvidence = [...requirements.requiredEvidence, "work-item-verification/input-binding", "work-item-verification/plan-coverage", "work-item-verification/raw-evidence", "work-item-verification/independence", "work-item-verification/policy", "work-item-verification/checkpoint-replay", "work-item-verification/gate-promotion", "work-item-verification/traceability-merge"];
  requirements.risks = [...requirements.risks, "Evidence could be valid but refer to different candidate bytes.", "An executor or verifier could self-certify completeness or independence.", "A passing check subset could hide an uncovered verification-plan obligation.", "Verification retries could overwrite failing evidence.", "A verified candidate could be mistaken for an integrated or system-accepted change."];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}


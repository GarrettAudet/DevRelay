const collectionKeys = new Set([
  "acceptanceCriteria", "assumptions", "businessObjectives", "capabilities",
  "constraints", "nonFunctionalRequirements", "nonGoals", "scope",
  "stakeholders", "successMetrics", "terminology", "userJourneys",
  "userStories", "users",
]);
const stringArrayKeys = new Set([
  "acceptanceCriterionIds", "aliases", "businessObjectiveIds", "capabilityIds",
  "deliverables", "dependencies", "interests", "needs", "requiredEvidence",
  "risks", "stakeholderIds", "userIds", "userJourneyIds",
]);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") return entries.sort((left, right) => compare(
      [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\\u0000"),
      [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\\u0000"),
    ));
    if (collectionKeys.has(key)) return entries.sort((left, right) => compare(left.id, right.id));
    if (stringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) return [...new Set(entries)].sort(compare);
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]));
}

export const confirmedDecisions = Object.freeze([
  Object.freeze({ decisionId: "D-CI-TARGET-001", statement: "V1 integrates exactly one verified work-item change per invocation into one configured local Git ref; remote pull-request and merge systems are future replaceable adapters." }),
  Object.freeze({ decisionId: "D-CI-CAS-001", statement: "Core requires the target ref to equal the version-pinned expected target commit immediately before mutation; concurrent verified changes serialize and drift requires reconciliation plus re-verification." }),
  Object.freeze({ decisionId: "D-CI-CONFLICT-001", statement: "V1 never automatically resolves integration conflicts; it returns an immutable IntegrationConflictSet, leaves the target unchanged, and routes authorized reconciliation through WorkExecution and WorkItemVerification." }),
  Object.freeze({ decisionId: "D-CI-SUCCESS-001", statement: "Successful integration returns an IntegratedChangeRecord, updated RepositorySnapshot, and TraceabilityGraph merge proof; SystemVerification remains downstream." }),
]);

export function buildChangeIntegrationRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => { requirements[key] = [...requirements[key], ...values]; };

  append("capabilities", [{
    id: "CAP-DEV-CHANGE-INTEGRATION-001",
    name: "Verified local change integration",
    description: "Safely incorporate one exactly verified work-item change into one configured local Git target using Core-owned compare-and-swap, immutable effect evidence, and explicit conflict routing.",
    businessObjectiveIds: ["BO-DEV-DETERMINISM-001", "BO-DEV-QUALITY-001", "BO-DEV-TRACEABILITY-001"],
    userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must", sourceRefs: refs(),
  }]);
  append("userJourneys", [{
    id: "UJ-DEV-CHANGE-INTEGRATION-001", name: "Integrate one verified work-item change",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityIds: ["CAP-DEV-CHANGE-INTEGRATION-001"],
    trigger: "WorkItemVerificationGate approves one exact work item, verification attempt, and proposed change for integration.",
    outcome: "The configured local target either advances atomically to an evidenced post-state or remains unchanged with an explicit conflict, drift, or failure artifact.",
    steps: [
      { sequence: 1, action: "Core binds the exact verification approval, verified change, target repository snapshot, target ref, expected commit, and integration policy.", expectedOutcome: "No caller or adapter can substitute the subject or integration target." },
      { sequence: 2, action: "Core compares the live target ref to the expected commit and invokes the configured local Git integration adapter only when they match.", expectedOutcome: "Concurrent work serializes and stale work cannot mutate the shared target." },
      { sequence: 3, action: "Core validates the effect receipt and either records the exact integrated post-state or returns an immutable no-mutation failure artifact.", expectedOutcome: "Only proven integration creates completion facts and unlocks frontier recalculation." },
    ], sourceRefs: refs(),
  }]);
  append("userStories", [{
    id: "US-DEV-CHANGE-INTEGRATION-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-CHANGE-INTEGRATION-001",
    userJourneyIds: ["UJ-DEV-CHANGE-INTEGRATION-001"],
    need: "Safely incorporate each independently verified change without losing target history, admitting stale work, or hiding conflicts.",
    benefit: "The shared repository advances through reproducible, auditable per-item integration and only factual completion unlocks dependent work.",
    priority: "must",
    acceptanceCriterionIds: [
      "AC-DEV-CI-ATOMICITY-001", "AC-DEV-CI-BOUNDARY-001", "AC-DEV-CI-CAS-001",
      "AC-DEV-CI-CONFLICT-001", "AC-DEV-CI-DETERMINISM-001", "AC-DEV-CI-INPUTS-001",
      "AC-DEV-CI-OUTCOMES-001", "AC-DEV-CI-REPLAY-001", "AC-DEV-CI-SUCCESS-001",
      "AC-DEV-CI-TRACEABILITY-001"
    ], sourceRefs: refs(),
  }]);
  append("acceptanceCriteria", [
    { id: "AC-DEV-CI-ATOMICITY-001", statement: "A successful integration advances the configured target ref from exactly the expected parent commit to one evidenced post-state commit; every non-success outcome leaves the target ref at its observed pre-state.", verification: "Exercise clean integration, adapter failure before mutation, failure after native operation, invalid receipt, conflict, drift, and recovery while comparing exact Git refs and object identities.", sourceRefs: refs() },
    { id: "AC-DEV-CI-BOUNDARY-001", statement: "ChangeIntegration cannot modify approved work scope, verification evidence, dependency or assignment baselines, perform new implementation work, approve its own input, perform SystemVerification, or grant BusinessAcceptance.", verification: "Attempt each forbidden authority through invocation, adapter output, effect receipt, checkpoint, and traceability update and require fail-closed rejection.", sourceRefs: refs() },
    { id: "AC-DEV-CI-CAS-001", statement: "Core compares the configured target ref with the exact expected target commit immediately before mutation; mismatch yields baseline_drift with zero adapter mutation calls, and concurrent verified changes serialize at this boundary.", verification: "Exercise exact, stale, advanced, rewritten, deleted, and concurrently updated target refs and prove only one matching compare-and-swap can advance.", sourceRefs: refs() },
    { id: "AC-DEV-CI-CONFLICT-001", statement: "A textual, semantic, or policy integration conflict returns an immutable IntegrationConflictSet, preserves the target ref unchanged, and cannot be automatically resolved by Core or an adapter.", verification: "Exercise clean and conflicting changes, forged conflict resolution, target mutation during conflict, and authorized reconciliation through a new WorkExecution and WorkItemVerification attempt.", sourceRefs: refs() },
    { id: "AC-DEV-CI-DETERMINISM-001", statement: "Exact version-pinned canonical inputs produce byte-identical integration plans, validation results, diagnostics, checkpoint keys, and traceability proposals; effect observations remain explicit evidence rather than assumed deterministic outputs.", verification: "Repeat preparation with reordered semantically unordered inputs, compare canonical digests, and distinguish deterministic preparation from host-observed Git effects.", sourceRefs: refs() },
    { id: "AC-DEV-CI-INPUTS-001", statement: "One invocation binds exactly one approved WorkItem, WorkItemVerificationGate approval, verified change set and raw bytes, target RepositorySnapshot, configured local Git ref, expected target commit, integration policy, project baselines, and host-enforced grant set.", verification: "Exercise exact, absent, duplicate, cross-item, cross-verification, changed-byte, stale-baseline, wrong-ref, wrong-commit, and excessive-grant fixtures.", sourceRefs: refs() },
    { id: "AC-DEV-CI-OUTCOMES-001", statement: "The closed outcomes are integrated, integration-conflict, baseline-drift, unable-to-proceed, and execution-failed; only integrated may create integrated completion and request frontier recalculation.", verification: "Exercise every outcome and reject partial, ambiguous, unknown, self-approved, or system-accepted claims.", sourceRefs: refs() },
    { id: "AC-DEV-CI-REPLAY-001", statement: "Every external integration effect is protected by an immutable idempotency identity and durable checkpoint; exact replay performs zero additional Git mutation calls and cannot create a second integration commit.", verification: "Exercise normal replay, crash-before-effect, crash-after-effect-before-checkpoint, receipt recovery, changed invocation, changed target, and duplicate idempotency identity.", sourceRefs: refs() },
    { id: "AC-DEV-CI-SUCCESS-001", statement: "Successful integration returns one IntegratedChangeRecord, one updated RepositorySnapshot, exact native effect evidence, and a TraceabilityGraph merge proof binding pre-state, verified change, post-state commit, and execution identity.", verification: "Validate exact parents, trees, refs, raw receipts, artifact digests, post-state snapshot, graph checkpoint, and rejection of substituted or incomplete success evidence.", sourceRefs: refs() },
    { id: "AC-DEV-CI-TRACEABILITY-001", statement: "Trusted contributors add forward factual edges from WorkItem to IntegratedChangeRecord, from ChangeSet to IntegratedChangeRecord, and from architecture and contract elements to the resulting change only after validated integration; adapters cannot author graph operations.", verification: "Validate candidate versus factual scopes, approved edge vocabulary, atomic merge, idempotent replay, orphan diagnostics, and forbidden adapter graph access.", sourceRefs: refs() },
  ]);
  append("scope", [{ id: "SCOPE-DEV-CHANGE-INTEGRATION-DETAIL-001", statement: "One ChangeIntegration module covering exact verified-subject binding, configured local Git target integration, Core-owned compare-and-swap, immutable conflicts and effect receipts, checkpoint recovery, factual traceability, and progression to SystemVerification without system or business acceptance authority.", sourceRefs: refs() }]);
  append("constraints", [
    { id: "CON-DEV-CI-LOCAL-GIT-001", category: "technical", statement: "V1 integration targets one configured local Git ref; remote pull-request, hosted merge, release, and deployment systems may bind later through replaceable adapters without changing the canonical module contract.", rationale: "A bounded local effect proves the orchestration boundary without coupling Core to a repository vendor.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-CI-INPUTS-001", "AC-DEV-CI-SUCCESS-001"], sourceRefs: refs() },
    { id: "CON-DEV-CI-CAS-001", category: "technical", statement: "Only Core may authorize an integration attempt after an exact target-ref compare-and-swap check; an adapter cannot override target drift or choose another target.", rationale: "Optimistic concurrency is required to prevent verified work from applying to unverified target bytes.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-CI-CAS-001", "AC-DEV-CI-ATOMICITY-001"], sourceRefs: refs() },
    { id: "CON-DEV-CI-NO-AUTO-RESOLVE-001", category: "business", statement: "Neither Core nor a V1 adapter may automatically resolve an integration conflict; resolution requires a newly authorized execution and verification attempt.", rationale: "Conflict resolution changes implementation bytes and invalidates prior verification evidence.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-CI-CONFLICT-001"], sourceRefs: refs() },
    { id: "CON-DEV-CI-HOST-ENFORCEMENT-001", category: "security", statement: "The host enforces repository workspace, process, credential, and ref-update permissions; DevRelay declarations remain capability demands rather than claims of operating-system enforcement.", rationale: "Provider-neutral Core cannot truthfully claim external isolation effects it does not perform.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-CI-INPUTS-001", "AC-DEV-CI-ATOMICITY-001"], sourceRefs: refs() },
    { id: "CON-DEV-CI-NO-SYSTEM-ACCEPTANCE-001", category: "business", statement: "An IntegratedChangeRecord proves repository incorporation only; SystemVerification and BusinessAcceptance remain independent downstream authorities.", rationale: "A merged change is not proof that the complete system or business objective is satisfied.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-CI-BOUNDARY-001", "AC-DEV-CI-OUTCOMES-001"], sourceRefs: refs() },
  ]);
  append("nonFunctionalRequirements", [
    { id: "NFR-DEV-CI-ATOMICITY-001", category: "reliability", statement: "Integration must preserve one observable target-ref transition or no target-ref transition for every invocation outcome.", applicability: { level: "project" }, measure: "Invocations with partial or unaccounted target-ref mutation.", target: "Zero.", priority: "must", acceptanceCriterionIds: ["AC-DEV-CI-ATOMICITY-001", "AC-DEV-CI-REPLAY-001"], sourceRefs: refs() },
    { id: "NFR-DEV-CI-AUDITABILITY-001", category: "observability", statement: "Every integration attempt must preserve exact input refs, pre-state observation, adapter identity, native Git operation evidence, post-state observation, checkpoint, outcome, and traceability merge proof where applicable.", applicability: { level: "project" }, measure: "Integration attempts missing required exact evidence.", target: "Zero.", priority: "must", acceptanceCriterionIds: ["AC-DEV-CI-SUCCESS-001", "AC-DEV-CI-TRACEABILITY-001"], sourceRefs: refs() },
    { id: "NFR-DEV-CI-IDEMPOTENCY-001", category: "reliability", statement: "Exact replay and recovery must never apply one verified change more than once.", applicability: { level: "project" }, measure: "Duplicate target commits or effects for one integration identity.", target: "Zero.", priority: "must", acceptanceCriterionIds: ["AC-DEV-CI-REPLAY-001"], sourceRefs: refs() },
  ]);
  append("assumptions", [{ id: "ASM-DEV-CI-V1-001", statement: "The owner-approved local-target, compare-and-swap, no-auto-resolution, and success-output decisions fully determine the V1 ChangeIntegration product boundary.", status: "confirmed", blocking: false, sourceRefs: refs() }]);
  append("terminology", [
    { id: "TERM-DEV-INTEGRATED-CHANGE-001", term: "Integrated change", definition: "One exactly verified work-item change proven to have advanced one configured target ref from an expected pre-state commit to an exact post-state commit.", aliases: ["IntegratedChangeRecord"], sourceRefs: refs() },
    { id: "TERM-DEV-INTEGRATION-CONFLICT-001", term: "Integration conflict", definition: "An immutable finding that the verified change cannot be incorporated under the approved target and policy without producing new implementation bytes; it never authorizes automatic resolution.", aliases: ["IntegrationConflictSet"], sourceRefs: refs() },
  ]);
  requirements.currentStatus = { lifecycle: "existing", phase: "implementation", summary: "ChangeIntegration requirements are approved: integrate one verified work item into one configured local Git ref with Core-owned compare-and-swap, explicit no-mutation conflicts, immutable effect evidence, and SystemVerification downstream.", sourceRefs: refs() };
  requirements.deliverables = [...requirements.deliverables, "Provider-neutral ChangeIntegration module and local Git integration adapter contract", "IntegratedChangeRecord, IntegrationConflictSet, IntegrationAttempt, and updated RepositorySnapshot contracts", "Trusted integrated-change traceability contributor and merge proof"];
  requirements.dependencies = [...requirements.dependencies, "Approved WorkItemVerificationGate result and exact verified change package", "Version-pinned target RepositorySnapshot, configured local Git ref, expected target commit, integration policy, and host-enforced Git grants"];
  requirements.requiredEvidence = [...requirements.requiredEvidence, "integration/input-binding", "integration/target-cas", "integration/no-mutation-conflict", "integration/native-effect", "integration/post-state", "integration/checkpoint-replay", "integration/traceability-merge"];
  requirements.risks = [...requirements.risks, "A verified change may be applied to target bytes other than those it was verified against.", "A conflict resolver could silently create new unverified implementation bytes.", "A crash between Git mutation and checkpoint persistence could duplicate or lose integration evidence.", "An integrated change could be mistaken for system verification or business acceptance."];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}

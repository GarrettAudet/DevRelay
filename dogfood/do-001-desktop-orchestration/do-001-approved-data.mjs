const compareText = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedCollections = new Set([
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
const sortedStringArrays = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "deliverables",
  "dependencies",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const values = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return values.sort((left, right) =>
        compareText(
          [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
          [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
        ),
      );
    }
    if (sortedCollections.has(key)) return values.sort((left, right) => compareText(left.id, right.id));
    if (sortedStringArrays.has(key) && values.every((entry) => typeof entry === "string")) {
      return [...new Set(values)].sort(compareText);
    }
    return values;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]),
  );
}

const sourced = (sourceRefs, value) => ({ ...value, sourceRefs: structuredClone(sourceRefs) });
const appendUnique = (entries, values) => [...new Set([...entries, ...values])];
const replaceById = (entries, id, update) => {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error(`Missing required baseline entity ${id}.`);
  entries[index] = update(structuredClone(entries[index]));
};

export function buildDesktopOrchestrationRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = typeof makeSourceRefs === "function"
    ? makeSourceRefs()
    : structuredClone(makeSourceRefs);

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary:
      "DO-001 requirements are closed for a restart-safe ChatGPT Desktop worktree and task harness with Core-derived frontier scheduling, policy-driven review, operator visibility, and automatic authoritative ProjectMemory continuity.",
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, {
      id: "BO-DEV-DESKTOP-ORCHESTRATION-001",
      statement:
        "Coordinate dependency-safe engineering work across isolated ChatGPT Desktop tasks and Git worktrees without weakening DevRelay lifecycle, Gate, verification, integration, or traceability authority.",
      stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
      priority: "must",
    }),
    sourced(sourceRefs, {
      id: "BO-DEV-AUTOMATIC-MEMORY-001",
      statement:
        "Make every DevRelay-managed Desktop task begin from exact durable project context and reach an explicit persisted conclusion or recoverable quarantine without relying on conversational memory.",
      stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
      priority: "must",
    }),
  );

  requirements.successMetrics.push(
    sourced(sourceRefs, {
      id: "SM-DEV-DESKTOP-FRONTIER-001",
      name: "Dependency-safe Desktop scheduling",
      businessObjectiveIds: ["BO-DEV-DESKTOP-ORCHESTRATION-001"],
      measure: "Harness-created tasks that were not members of the exact Core-derived ready frontier or exceeded configured concurrency.",
      target: "Zero tasks.",
      measurementMethod: "Exercise serial, parallel, repeated, blocked, failed, resumed, and all-complete DAG fixtures against recorded Desktop task plans and receipts.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-DESKTOP-RECOVERY-001",
      name: "Restart-safe orchestration",
      businessObjectiveIds: ["BO-DEV-DESKTOP-ORCHESTRATION-001"],
      measure: "Desktop or host restarts that duplicate a task, worktree, adapter effect, verification, integration, or conclusion.",
      target: "Zero duplicates; every uncertain effect is quarantined until exact reconciliation evidence exists.",
      measurementMethod: "Inject interruption before and after every durable transition and replay from SQLite and content-addressed artifact state.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-AUTOMATIC-MEMORY-001",
      name: "Automatic managed-task continuity",
      businessObjectiveIds: ["BO-DEV-AUTOMATIC-MEMORY-001"],
      measure: "Harness-managed tasks lacking an exact bootstrap receipt before work or a conclusion/quarantine record at termination.",
      target: "Zero tasks.",
      measurementMethod: "Run startup, resume, compact, stop, interrupt, session-end, crash, and fresh-task replacement fixtures with exact memory and repository drift.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-DESKTOP-REVIEW-001",
      name: "Policy-complete review",
      businessObjectiveIds: ["BO-DEV-DESKTOP-ORCHESTRATION-001"],
      measure: "Merge-ready changes missing required test, review, adversarial-review, or conflict dispositions.",
      target: "Zero integrations.",
      measurementMethod: "Evaluate low-risk, high-risk, cross-cutting, integration, release, conflicting, and inconclusive review fixtures.",
    }),
  );

  const capabilities = [
    ["CAP-DEV-DESKTOP-ORCHESTRATOR-001", "Desktop frontier orchestration", "Turn an approved dependency DAG and integrated completion facts into bounded persistent Desktop task plans without selecting readiness outside Core.", "BO-DEV-DESKTOP-ORCHESTRATION-001"],
    ["CAP-DEV-DESKTOP-TASK-HARNESS-001", "Provider-neutral Desktop task harness", "Bind exact task prompts, project identity, starting revision, worktree, executor, grants, and evidence expectations to a replaceable ChatGPT Desktop task adapter.", "BO-DEV-DESKTOP-ORCHESTRATION-001"],
    ["CAP-DEV-WORKTREE-LEASES-001", "Durable worktree leases", "Persist exact worktree ownership, base revision, task binding, state, and cleanup disposition across process restart.", "BO-DEV-DESKTOP-ORCHESTRATION-001"],
    ["CAP-DEV-DESKTOP-REVIEW-LOOP-001", "Merge-readiness and adversarial review", "Require verification and policy-selected independent adversarial review before ChangeIntegration while preserving explicit conflict escalation.", "BO-DEV-DESKTOP-ORCHESTRATION-001"],
    ["CAP-DEV-AUTOMATIC-MEMORY-001", "Automatic task memory lifecycle", "Bootstrap exact ProjectMemory and session context before managed work and conclude, quarantine, resume, or abandon every managed task through explicit authority boundaries.", "BO-DEV-AUTOMATIC-MEMORY-001"],
    ["CAP-DEV-DESKTOP-OPERATOR-VIEW-001", "Central operator view", "Present concise lifecycle, frontier, task, worktree, review, memory, blocker, and recovery state inside ChatGPT Desktop with links to exact evidence.", "BO-DEV-DESKTOP-ORCHESTRATION-001"],
  ];
  requirements.capabilities.push(
    ...capabilities.map(([id, name, description, objective]) => sourced(sourceRefs, {
      id,
      name,
      description,
      businessObjectiveIds: [objective],
      userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
      audience: "user-facing",
      key: true,
      priority: "must",
    })),
  );

  requirements.userJourneys.push(sourced(sourceRefs, {
    id: "UJ-DEV-DESKTOP-ORCHESTRATION-001",
    name: "Run a dependency-safe engineering frontier from ChatGPT Desktop",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityIds: capabilities.map(([id]) => id),
    trigger: "An approved WorkDependencyBaseline, SpecialistAssignmentBaseline, current readiness evidence, and unfinished work are available.",
    outcome: "Every eligible work item is executed in an isolated managed task, verified, reviewed as required, integrated safely, memory-concluded, and recoverable from exact persisted state.",
    steps: [
      { sequence: 1, action: "Load and verify the exact project synopsis, memory, baselines, graph context, repository revision, and host state.", expectedOutcome: "The orchestration run starts only from current approved context." },
      { sequence: 2, action: "Derive the next frontier and persist bounded worktree and Desktop task plans.", expectedOutcome: "Only dependency-ready work is scheduled within policy concurrency." },
      { sequence: 3, action: "Run managed tasks through execution, verification, and policy-required independent review.", expectedOutcome: "Every candidate is evidence-complete or stops with explicit diagnostics." },
      { sequence: 4, action: "Integrate verified changes in dependency-safe order and reconcile conflicts or target drift.", expectedOutcome: "No work reaches the target without exact ChangeIntegration authority." },
      { sequence: 5, action: "Conclude worker and parent task memory and persist the next operator snapshot.", expectedOutcome: "A fresh Desktop task can resume without conversational history or duplicate effects." },
    ],
  }));

  requirements.userStories.push(
    sourced(sourceRefs, {
      id: "US-DEV-DESKTOP-ORCHESTRATE-001",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-DESKTOP-ORCHESTRATOR-001",
      userJourneyIds: ["UJ-DEV-DESKTOP-ORCHESTRATION-001"],
      need: "Give DevRelay a goal and let it coordinate ready work across ChatGPT Desktop tasks without manually tracking branches, worktrees, dependencies, tests, reviews, and merges.",
      benefit: "The owner makes product decisions and reviews evidence instead of managing execution mechanics.",
      priority: "must",
      acceptanceCriterionIds: ["AC-DO-FRONTIER-001", "AC-DO-CONCURRENCY-001", "AC-DO-TASK-BINDING-001", "AC-DO-OPERATOR-VIEW-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-AUTOMATIC-MEMORY-001",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-AUTOMATIC-MEMORY-001",
      userJourneyIds: ["UJ-DEV-DESKTOP-ORCHESTRATION-001"],
      need: "Have every managed task automatically load current project memory and leave a durable governed conclusion even across app or host restarts.",
      benefit: "New tasks continue accurately without rediscovery or hidden conversational state.",
      priority: "must",
      acceptanceCriterionIds: ["AC-DO-MEMORY-BOOTSTRAP-001", "AC-DO-MEMORY-CONCLUDE-001", "AC-DO-RECOVERY-001", "AC-DO-HOOKS-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-DESKTOP-TASK-HARNESS-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-DESKTOP-TASK-HARNESS-001", userJourneyIds: ["UJ-DEV-DESKTOP-ORCHESTRATION-001"],
      need: "Bind each ready item to one exact Desktop task and provider receipt.", benefit: "Task identity and authority remain auditable and replaceable.", priority: "must", acceptanceCriterionIds: ["AC-DO-TASK-BINDING-001", "AC-DO-TASK-ADAPTER-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-WORKTREE-LEASES-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-WORKTREE-LEASES-001", userJourneyIds: ["UJ-DEV-DESKTOP-ORCHESTRATION-001"],
      need: "Give every task an isolated restart-safe worktree lease.", benefit: "Parallel changes cannot mutate each other or bypass safe cleanup.", priority: "must", acceptanceCriterionIds: ["AC-DO-WORKTREE-LEASE-001", "AC-DO-CONFLICT-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-DESKTOP-REVIEW-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-DESKTOP-REVIEW-LOOP-001", userJourneyIds: ["UJ-DEV-DESKTOP-ORCHESTRATION-001"],
      need: "Require tests, independent review, and risk-selected adversarial review before integration.", benefit: "Agent output is challenged before it can reach the target.", priority: "must", acceptanceCriterionIds: ["AC-DO-REVIEW-POLICY-001", "AC-DO-ADVERSARIAL-REVIEW-001", "AC-DO-MERGE-READINESS-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-DESKTOP-OPERATOR-VIEW-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-DESKTOP-OPERATOR-VIEW-001", userJourneyIds: ["UJ-DEV-DESKTOP-ORCHESTRATION-001"],
      need: "See one concise view of tasks, worktrees, evidence, blockers, recovery, and memory state.", benefit: "The owner can supervise without manual bookkeeping.", priority: "must", acceptanceCriterionIds: ["AC-DO-OPERATOR-VIEW-001"],
    }),
  );

  const criteria = [
    ["AC-DO-FRONTIER-001", "Only work items in the exact Core-derived runnable frontier may receive a Desktop task plan, and a new frontier is derived only after verified ChangeIntegration completion facts are persisted.", "Exercise arbitrary DAGs, partial completion, failure, retry, repeated frontiers, and stale completion facts; assert no scheduler-owned readiness."],
    ["AC-DO-CONCURRENCY-001", "The harness enforces a versioned maximum-concurrency policy while preserving deterministic plan order and independent worktree isolation.", "Run zero-, one-, and many-slot policies with reordered equivalent inputs and concurrent task completion."],
    ["AC-DO-TASK-BINDING-001", "Each Desktop task binds one exact project, work item, prompt artifact, starting commit, worktree lease, specialist assignment, executor, configuration, grants, and idempotency identity.", "Mutate every binding field independently and verify rejection before task creation or execution."],
    ["AC-DO-TASK-ADAPTER-001", "The ChatGPT Desktop task adapter may create, inspect, wait for, message, and hand off only its bound task and cannot approve Gates, select readiness, mutate the graph, verify its own work, or integrate changes.", "Run capability, authority, task-substitution, and provider-receipt conformance fixtures."],
    ["AC-DO-WORKTREE-LEASE-001", "Worktree ownership and lifecycle are durably leased to one exact orchestration attempt and task, survive restart, reject concurrent substitution, and clean up only after an explicit safe disposition.", "Restart storage and worktree managers across create, active, completed, quarantined, abandoned, and cleanup states."],
    ["AC-DO-MEMORY-BOOTSTRAP-001", "Every harness-managed task receives a valid fresh SessionContextReceipt and MemoryContextBundle before its first work prompt; stale, missing, or mismatched memory blocks task execution.", "Test startup, resume, compact, changed baseline, changed repository, unconcluded predecessor, and corrupted synopsis cases."],
    ["AC-DO-MEMORY-CONCLUDE-001", "Every terminal worker or parent task produces a typed SessionConclusion and reaches an approved ConcludeReceipt, candidate-only parent handoff, or explicit recoverable quarantine before the orchestration run advances.", "Exercise success, failure, interruption, owner-required dispositions, provider failure, worker-parent lineage, and exact replay."],
    ["AC-DO-HOOKS-001", "The installable Desktop plugin uses trusted lifecycle hooks to inject verified startup context and prevent silent loss at stop, interrupt, or session end without claiming access to unrelated chats.", "Run hook JSON fixtures for startup, resume, compact, stop, interrupt, session end, unrelated directories, malformed input, and missing trust."],
    ["AC-DO-RECOVERY-001", "After Desktop or host restart, the orchestrator reconstructs exact runs, task bindings, leases, checkpoints, memory state, and uncertain effects from SQLite and content-addressed bytes without duplicate external actions.", "Inject crashes at every prepared, dispatched, running, completed, verified, integrated, concluded, and journal boundary."],
    ["AC-DO-REVIEW-POLICY-001", "A versioned Core-owned review policy determines when independent adversarial review is required; high-risk, cross-cutting, integration, security, migration, and release changes require it by default.", "Run risk classification, policy drift, required, optional, not-applicable, missing, failed, and inconclusive review fixtures."],
    ["AC-DO-ADVERSARIAL-REVIEW-001", "Adversarial reviewers receive exact immutable candidate and evidence inputs, remain independent of the implementing task, and return findings only through existing verification contracts.", "Attempt implementer reuse, prompt and subject substitution, self-approval, graph claims, and unsupported provider maturity."],
    ["AC-DO-MERGE-READINESS-001", "A change is merge-ready only after work-item verification, every required adversarial-review disposition, target-drift checks, and exact integration planning pass.", "Exercise missing tests, stale target, unresolved findings, conflict, successful readiness, and replay."],
    ["AC-DO-CONFLICT-001", "Concurrent edits or integration conflicts are never resolved by blindly choosing a side; obvious deterministic rebases require exact evidence and ambiguous conflicts stop for owner review.", "Create overlapping and disjoint worktree changes, target advancement, ambiguous conflicts, and safe retry fixtures."],
    ["AC-DO-OPERATOR-VIEW-001", "ChatGPT Desktop presents one deterministic concise view of current lifecycle stage, ready and active work, task and worktree state, tests, reviews, merge readiness, memory status, blockers, and evidence links.", "Render serial, parallel, blocked, recovering, complete, and partially unavailable runs with content-policy redaction."],
    ["AC-DO-PERMISSIONS-001", "Task, worktree, process, filesystem, network, secret, handoff, and integration effects are deny-by-default and require exact scoped grants with digest-bound receipts.", "Run path escape, excess grant, missing grant, secret leakage, unauthorized network, task substitution, and receipt drift matrices."],
    ["AC-DO-PLUGIN-001", "A validated installable DevRelay Desktop plugin packages the orchestration skill, lifecycle hooks, and bounded scripts without embedding product-specific routing in Generic Core.", "Validate the plugin manifest, hook configuration, skill metadata, package contents, installation path, and Generic Core identifier scan."],
    ["AC-DO-TRACEABILITY-001", "Trusted contributors project only validated forward facts for task plans, leases, reviews, integration, recovery, and conclusions while adapters and hooks receive no graph mutation authority.", "Merge candidate and approved scopes, run provenance and impact queries, and reject inverse, orphaned, adapter-authored, or stale facts."],
    ["AC-DO-DESKTOP-E2E-001", "A clean ChatGPT Desktop on Windows installation can bootstrap memory, schedule a parallel frontier into worktrees, recover one interrupted task, verify and adversarially review required work, integrate safely, conclude memory, and resume in a fresh task.", "Run an installed-package and plugin end-to-end scenario using exact host-observed task, hook, Git, SQLite, memory, and verification receipts."],
  ];
  requirements.acceptanceCriteria.push(
    ...criteria.map(([id, statement, verification]) => sourced(sourceRefs, { id, statement, verification })),
  );

  const nfrs = [
    ["NFR-DO-DETERMINISM-001", "reliability", "Frontier plans, task bindings, review requirements, memory transitions, recovery decisions, and operator projections are byte-stable for exact inputs.", "Compare canonical artifacts and receipts across reordered delivery, restart, and replay.", "100 percent equality and zero duplicate effects.", ["AC-DO-FRONTIER-001", "AC-DO-RECOVERY-001"]],
    ["NFR-DO-SECURITY-001", "security", "Desktop task and hook execution is least-privilege, workspace-scoped, secret-safe, local-first, and deny-by-default for network or external side effects.", "Run grant, path, task, transcript, secret, network, hook-trust, and redaction matrices.", "Zero unauthorized effects or persisted secrets.", ["AC-DO-PERMISSIONS-001", "AC-DO-HOOKS-001"]],
    ["NFR-DO-RELIABILITY-001", "reliability", "The harness survives process, app, task, worktree, and integration interruption without losing authoritative state or claiming false completion.", "Inject failures at every durable state boundary and reconcile from a fresh process.", "Zero false-complete outcomes; all uncertainty is explicit and recoverable.", ["AC-DO-WORKTREE-LEASE-001", "AC-DO-RECOVERY-001", "AC-DO-MEMORY-CONCLUDE-001"]],
    ["NFR-DO-USABILITY-001", "usability", "Routine orchestration requires one goal-level interaction while exposing only material product decisions, blockers, conflicts, and acceptance evidence to the owner.", "Review simple, parallel, conflict, failed-review, recovery, and conclusion transcripts.", "No manual task/worktree bookkeeping and no hidden blocking decision.", ["AC-DO-OPERATOR-VIEW-001", "AC-DO-CONFLICT-001"]],
    ["NFR-DO-PERFORMANCE-001", "performance", "Scheduling and recovery remain bounded by configured concurrency and record honest task, wait, retry, cache, and queue measurements without imposing an unevidenced universal SLA.", "Measure cold, warm, parallel, saturated, interrupted, and replay paths on the Windows Desktop reference host.", "No unbounded polling or queue growth and complete sourced telemetry.", ["AC-DO-CONCURRENCY-001", "AC-DO-OPERATOR-VIEW-001"]],
  ];
  requirements.nonFunctionalRequirements.push(
    ...nfrs.map(([id, category, statement, measure, target, acceptanceCriterionIds]) => sourced(sourceRefs, {
      id,
      category,
      statement,
      applicability: { level: "project" },
      measure,
      target,
      priority: "must",
      acceptanceCriterionIds,
    })),
  );

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-DO-CROSS-CUTTING-001", category: "technical", statement: "Desktop orchestration is a host/plugin layer above the released lifecycle and is not a new Module stage or an alternate source of readiness, verification, integration, Gate, or graph authority.", rationale: "The harness coordinates existing contracts without changing their semantic owners.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DO-FRONTIER-001", "AC-DO-TASK-ADAPTER-001", "AC-DO-TRACEABILITY-001"] }),
    sourced(sourceRefs, { id: "CON-DO-DESKTOP-001", category: "platform", statement: "DO-001 targets ChatGPT/Codex Desktop on Windows and local Git worktrees; hosted orchestration and non-Windows support remain unclaimed.", rationale: "The implementation and acceptance boundary must match exact host evidence.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DO-PLUGIN-001", "AC-DO-DESKTOP-E2E-001"] }),
    sourced(sourceRefs, { id: "CON-DO-MEMORY-AUTHORITY-001", category: "technical", statement: "Repository-backed ProjectMemoryBaseline and Gate-approved conclusions remain authoritative; hook context, task transcripts, cached provider memory, and operator projections are derived evidence only.", rationale: "Automation cannot turn conversational or provider state into project authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DO-MEMORY-BOOTSTRAP-001", "AC-DO-MEMORY-CONCLUDE-001", "AC-DO-HOOKS-001"] }),
    sourced(sourceRefs, { id: "CON-DO-MAIN-001", category: "technical", statement: "Harness-managed implementation never works directly on protected main; every work item uses an exact isolated worktree and reaches main only through verified ChangeIntegration.", rationale: "Parallel agents must not interfere with the trusted target checkout.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DO-WORKTREE-LEASE-001", "AC-DO-MERGE-READINESS-001"] }),
    sourced(sourceRefs, { id: "CON-DO-HUMAN-DECISIONS-001", category: "business", statement: "The orchestrator may apply standing approval only to routine validated in-scope mechanics; material product choices, ambiguous conflicts, trust failures, and expanded external authority require explicit owner input.", rationale: "Autonomy must not silently broaden product or effect authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DO-CONFLICT-001", "AC-DO-PERMISSIONS-001"] }),
  );

  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-DO-HOST-001", statement: "A durable Desktop frontier scheduler, task/worktree lease state machine, restart recovery coordinator, and deterministic operator projection over existing DevRelay lifecycle artifacts." }),
    sourced(sourceRefs, { id: "SCOPE-DO-ADAPTER-001", statement: "A bounded ChatGPT Desktop task adapter contract and receipts for task creation, status, waiting, messaging, handoff, and exact task identity." }),
    sourced(sourceRefs, { id: "SCOPE-DO-REVIEW-001", statement: "Versioned merge-readiness and risk-based adversarial-review policy using existing WorkItemVerification and ChangeIntegration authority boundaries." }),
    sourced(sourceRefs, { id: "SCOPE-DO-MEMORY-001", statement: "Automatic bootstrap, conclusion enforcement, worker-parent memory handoff, interruption quarantine, and fresh-task restart recovery for DevRelay-managed tasks." }),
    sourced(sourceRefs, { id: "SCOPE-DO-PLUGIN-001", statement: "An installable ChatGPT/Codex Desktop plugin containing the orchestration skill, trusted lifecycle hooks, local scripts, documentation, and validation evidence." }),
    sourced(sourceRefs, { id: "SCOPE-DO-DOGFOOD-001", statement: "Full released-circuit dogfood and clean Windows Desktop installed-plugin evidence for parallel worktrees, recovery, review, integration, memory conclusion, and fresh-task resume." }),
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-DO-HOSTED-001", statement: "Build a hosted orchestration backend or remote multi-tenant control plane.", rationale: "The approved runtime is local ChatGPT Desktop on Windows." }),
    sourced(sourceRefs, { id: "NG-DO-UNRELATED-CHATS-001", statement: "Read, summarize, mutate, or persist unrelated ChatGPT conversations.", rationale: "Project memory is repository-scoped and task bindings are explicit." }),
    sourced(sourceRefs, { id: "NG-DO-AGENT-PROVIDER-001", statement: "Hard-code one model, coding agent, or external provider into canonical scheduler or lifecycle contracts.", rationale: "Task execution remains replaceable through bounded adapters." }),
    sourced(sourceRefs, { id: "NG-DO-AUTO-CONFLICT-001", statement: "Blindly resolve ambiguous merge conflicts or automatically choose one agent's changes over another.", rationale: "Conflicts require evidence-backed integration or explicit owner review." }),
    sourced(sourceRefs, { id: "NG-DO-AUTO-APPROVAL-001", statement: "Let the orchestrator, plugin, hook, task adapter, implementer, or reviewer approve its own candidate or expand standing approval.", rationale: "Existing Gate and owner authority remain unchanged." }),
  );

  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-DO-RUN-001", term: "DesktopOrchestrationRun", definition: "A durable host-owned coordination state binding one approved DAG horizon, completion set, policy, task plans, worktree leases, reviews, integrations, memory conclusions, and recovery journal.", aliases: ["Orchestration run"] }),
    sourced(sourceRefs, { id: "TERM-DO-TASK-PLAN-001", term: "DesktopTaskPlan", definition: "An immutable plan for one exact ready work item containing the task prompt, project, starting revision, worktree, executor, grants, expected evidence, and idempotency identity.", aliases: ["Task plan"] }),
    sourced(sourceRefs, { id: "TERM-DO-TASK-RECEIPT-001", term: "DesktopTaskReceipt", definition: "Host-observed evidence binding an exact ChatGPT Desktop task identity and operation to one DesktopTaskPlan without granting lifecycle authority.", aliases: ["Task receipt"] }),
    sourced(sourceRefs, { id: "TERM-DO-WORKTREE-LEASE-001", term: "WorktreeLease", definition: "A durable exclusive ownership record binding one exact worktree path and base revision to an orchestration run, work item, attempt, and Desktop task lifecycle.", aliases: ["Workspace lease"] }),
    sourced(sourceRefs, { id: "TERM-DO-REVIEW-001", term: "AdversarialReviewRequirement", definition: "A Core-owned policy decision requiring an independent verifier to challenge an exact candidate and its evidence before merge readiness.", aliases: ["Independent review"] }),
    sourced(sourceRefs, { id: "TERM-DO-OPERATOR-SNAPSHOT-001", term: "DesktopOperatorSnapshot", definition: "A deterministic read-only projection of lifecycle, frontier, task, worktree, review, integration, memory, blocker, recovery, and evidence state for ChatGPT Desktop.", aliases: ["Operator view"] }),
  );

  replaceById(requirements.users, "USR-DEV-WORKFLOW-AUTHOR-001", (entry) => ({
    ...entry,
    needs: appendUnique(entry.needs, [
      "Coordinate parallel dependency-safe worktrees and Desktop tasks without manual branch, test, review, or merge bookkeeping.",
      "Resume exact project and orchestration state after a fresh task or Desktop restart.",
    ]),
    sourceRefs: [...entry.sourceRefs, ...structuredClone(sourceRefs)],
  }));

  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-DO-DESKTOP-001", statement: "ChatGPT Desktop provides project-scoped Codex tasks, Git worktree creation, task waiting and messaging, handoff, plugins, skills, and trusted lifecycle hooks on the Windows release-defining host.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DO-OWNER-001", statement: "The owner explicitly directed DevRelay to implement both the Reddit-derived worktree/agent-orchestration improvements and persistent memory without stopping until both are complete.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DO-BOUNDARY-001", statement: "Automatic memory lifecycle applies to DevRelay-managed tasks; unrelated chats remain inaccessible and manually created project tasks must enter through the plugin bootstrap boundary.", status: "confirmed", blocking: false }),
  );

  requirements.dependencies = appendUnique(requirements.dependencies, [
    "Accepted PM-001 ProjectMemory bootstrap, context, conclusion, Gate, native-equivalence, and provider synchronization contracts.",
    "Accepted SIM-001 local host SQLite/CAS persistence, capability enforcement, isolated Git worktrees, recovery, CLI, and facade.",
    "Approved WorkDependencyAnalysis frontier mechanics, SpecialistAssignment, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, and ReleasePreparation contracts.",
    "ChatGPT Desktop task/worktree, plugin, skill, and lifecycle-hook surfaces on the Windows release-defining host.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "A scheduler can accidentally become a second source of readiness or completion authority unless every task plan is derived from exact Core artifacts.",
    "Desktop task creation can succeed before its receipt is durably recorded, requiring quarantine and exact host reconciliation rather than blind recreation.",
    "Worktree paths and task identities can drift across restart or handoff and must remain lease- and digest-bound.",
    "Automatic hooks can leak transcript or secret content, run outside the intended project, or block unrelated chats unless inputs and scope fail closed.",
    "Parallel changes can conflict or invalidate target state after verification, requiring explicit merge-readiness and ChangeIntegration checks.",
    "Adversarial review can become performative or self-approval unless reviewer independence, exact subject binding, and policy ownership are enforced.",
    "A task can terminate before memory conclusion, requiring durable pending-conclusion state that blocks unsafe fresh-task progression.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "Desktop orchestration artifacts, schemas, scheduler, task adapter, durable leases, recovery coordinator, review policy, operator projection, and traceability contributors.",
    "Automatic ProjectMemory startup and conclusion enforcement for managed tasks with interruption, abandonment, worker-parent, and restart handling.",
    "Installable DevRelay Desktop plugin with orchestration skill, lifecycle hooks, bounded scripts, validation, and local installation documentation.",
    "Clean Windows Desktop end-to-end evidence covering parallel worktrees, task supervision, recovery, review, safe integration, memory conclusion, and fresh-task resume.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "desktop-orchestration/frontier-scheduling",
    "desktop-orchestration/task-binding",
    "desktop-orchestration/task-adapter-conformance",
    "desktop-orchestration/worktree-lease-recovery",
    "desktop-orchestration/sqlite-restart-recovery",
    "desktop-orchestration/zero-duplicate-effects",
    "desktop-orchestration/review-policy",
    "desktop-orchestration/adversarial-review",
    "desktop-orchestration/merge-readiness",
    "desktop-orchestration/operator-projection",
    "desktop-orchestration/plugin-validation",
    "desktop-orchestration/hook-lifecycle",
    "desktop-orchestration/permission-enforcement",
    "desktop-orchestration/traceability-projection",
    "project-memory/automatic-bootstrap",
    "project-memory/automatic-conclusion",
    "project-memory/fresh-task-recovery",
    "dogfood/windows-desktop-orchestration-cycle",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}

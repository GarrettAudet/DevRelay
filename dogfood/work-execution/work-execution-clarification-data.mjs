export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-work-execution-module-v1",
  statement: "Define DevRelay's WorkExecution module so each runnable approved work item is performed through an exact provider-neutral execution contract without integrating or claiming verification.",
  objectives: [
    "Execute only work items Core derives as runnable from the approved dependency DAG.",
    "Bind an approved specialist profile to an exact executor without making provider identity part of lifecycle semantics.",
    "Isolate each execution attempt, its mutations, and its evidence.",
    "Return a proposed change set and raw execution evidence without claiming verification or integration.",
    "Make interruption, retry, and executor substitution deterministic and auditable.",
  ],
  constraints: [
    "WorkExecution cannot modify the approved WorkBreakdown, dependency DAG, or assignment baseline.",
    "Core owns ready-frontier selection; an executor cannot select its own work.",
    "Only declared tools, grants, repository scope, and network scope may be supplied to an executor.",
    "WorkItemVerification owns completion claims and ChangeIntegration owns incorporation into the shared baseline.",
    "Every execution attempt is immutable and content-addressed.",
  ],
  acceptanceCriteria: [
    "An invocation is bound to exact work-item, dependency, assignment, repository, project-overview, and execution-policy artifacts.",
    "The executor can mutate only its isolated workspace and declared scope.",
    "A successful attempt returns one ChangeSetDraft and one ExecutionEvidenceBundle for the exact work item.",
    "Interrupted or failed attempts remain durable evidence and retry creates a new linked attempt.",
    "Checkpoint replay never reinvokes an effectful executor.",
    "Provider substitution changes only the configured binding while canonical outcomes remain identical.",
  ],
  assumptions: [
    "Execution granularity, runtime binding, retry identity, and output authority require owner confirmation.",
    "The OpenSpec chat bridge records this clarification run but does not claim OpenSpec CLI execution.",
  ],
});
export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary: "DevRelay has promoted requirements, architecture, contracts, work breakdown, dependency, and specialist-assignment baselines. WorkExecution is next and will operate over Core-derived runnable DAG frontiers.",
  stakeholders: [
    "DevRelay product owner",
    "Executor and adapter authors",
    "Workflow and IDE hosts",
    "Human and AI execution providers",
    "Security, verification, and integration reviewers",
  ],
  domainConstraints: [
    "Core selects readiness from the approved static DAG and integrated completion facts.",
    "SpecialistAssignment supplies provider-neutral profiles, not concrete runtime instances.",
    "External hosts enforce workspaces, processes, network access, secrets, and repository permissions.",
    "WorkExecution produces proposed changes only; downstream modules verify and integrate.",
    "Traceability contributors are trusted Core infrastructure and adapters never mutate the graph.",
  ],
  conventions: [
    "Use SHA-256-bound artifacts and exact semantic versions at every boundary.",
    "Use one immutable ExecutionAttempt identity for every actual invocation.",
    "Store raw evidence and change manifests; summaries are never the only truth.",
    "Distinguish planned, attempted, produced, verified, and integrated lifecycle facts.",
    "Prove success, failure, interruption, retry, drift, substitution, permission denial, and zero-call replay.",
  ],
  sourceRefs: [],
});
export const questions = Object.freeze([
  Object.freeze({
    id: "Q-WE-EXECUTION-UNIT-001",
    prompt: "Should one WorkExecution invocation execute exactly one runnable WorkItem in an isolated workspace, while Core fans out the current ready DAG frontier?",
    rationale: "Per-item attempts isolate retries, evidence, permissions, and failures while retaining dependency-safe parallelism.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "One runnable WorkItem per invocation; Core fans out the frontier (recommended)",
      "One invocation executes the entire ready frontier",
    ],
  }),
  Object.freeze({
    id: "Q-WE-RUNTIME-BINDING-001",
    prompt: "How should an assigned provider-neutral SpecialistProfile become a concrete executor?",
    rationale: "The binding must be replaceable without giving the executor authority over eligibility, readiness, or policy.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "A version-pinned ExecutionBinding resolves the profile to a configured executor adapter; Core validates it (recommended)",
      "The SpecialistProfile directly names and controls its executor",
    ],
  }),
  Object.freeze({
    id: "Q-WE-OUTPUT-BOUNDARY-001",
    prompt: "What may a successful WorkExecution attempt claim?",
    rationale: "Execution can prove that an attempt produced bytes and observations, but downstream modules own correctness and integration.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Return ChangeSetDraft plus ExecutionEvidenceBundle only; no verified, complete, or integrated claim (recommended)",
      "Return a completed and verified WorkItem",
    ],
  }),
  Object.freeze({
    id: "Q-WE-RETRY-IDENTITY-001",
    prompt: "How should retries be represented after failure or interruption?",
    rationale: "Overwriting an attempt would destroy auditability and make replay ambiguous.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Create a new immutable ExecutionAttempt linked to the prior attempt; never overwrite (recommended)",
      "Reuse and update the original attempt record",
    ],
  }),
]);
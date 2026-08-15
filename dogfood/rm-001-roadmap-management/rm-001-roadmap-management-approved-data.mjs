const sortedCollectionKeys = new Set([
  "acceptanceCriteria", "assumptions", "businessObjectives", "capabilities",
  "constraints", "nonFunctionalRequirements", "nonGoals", "scope",
  "stakeholders", "successMetrics", "terminology", "userJourneys",
  "userStories", "users",
]);
const sortedStringArrayKeys = new Set([
  "acceptanceCriterionIds", "aliases", "businessObjectiveIds", "capabilityIds",
  "deliverables", "dependencies", "interests", "needs", "requiredEvidence",
  "risks", "stakeholderIds", "userIds", "userJourneyIds",
]);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") return entries.sort((left, right) => compareText(
      [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
      [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
    ));
    if (sortedCollectionKeys.has(key)) return entries.sort((left, right) => compareText(left.id, right.id));
    if (sortedStringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) return [...new Set(entries)].sort(compareText);
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]));
}
const sourced = (sourceRefs, value) => ({ ...value, sourceRefs: structuredClone(sourceRefs) });
const appendUnique = (entries, values) => [...new Set([...entries, ...values])];

export const ownerDecisions = Object.freeze([
  ["Q-RM-BOUNDARY-001", "RoadmapManagement is a cross-cutting semantic Module with triage-candidate, review-roadmap, and reprioritize operations."],
  ["Q-RM-AUTHORITY-001", "Detection creates a RoadmapIntakeCandidate only; RoadmapGate alone may approve changes to RoadmapBaseline."],
  ["Q-RM-CLARITY-001", "Potential initiatives use RequirementsGathering breadth-first clarification waves with mandatory 0.99 closure before roadmap disposition."],
  ["Q-RM-DISPOSITION-001", "RoadmapManagement recommends exactly one of keep, defer, merge, or discard, and preserves every disposition for audit."],
  ["Q-RM-PRIORITY-001", "Prioritization uses explicit configurable weights over strategic alignment, user value, urgency, risk reduction, effort range, dependencies, and confidence."],
  ["Q-RM-STORAGE-001", "RoadmapBaseline is the authoritative structured artifact and Roadmap.md is its concise deterministic human-readable projection."],
  ["Q-RM-CONTEXT-001", "Every fresh DevRelay task in the configured project workspace must run DevRelaySessionBootstrap and read compact digest-bound project, roadmap, lifecycle, Gate, and ready-frontier context."],
  ["Q-RM-RECEIPT-001", "Session bootstrap emits a SessionContextReceipt and fails closed on missing, stale, substituted, malformed, or digest-mismatched required context."],
  ["Q-RM-REFRESH-001", "A baseline promotion during a task requires a refreshed context snapshot at the next Module boundary."],
  ["Q-RM-EXPLICIT-INPUTS-001", "Session context never replaces explicit content-addressed ModuleInvocation inputs and never becomes hidden Core or conversational authority."],
  ["Q-RM-INITIALIZATION-001", "A missing roadmap uses an explicit RoadmapNotInitialized disposition and routes to baseline establishment without fabricating an empty roadmap."],
  ["Q-RM-ADAPTERS-001", "The native file contract is authoritative; external planning systems are optional adapters."]
].map(([questionId, decision]) => Object.freeze({ questionId, decision, answer: "Approve exactly as stated" })));

export function buildRoadmapRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = typeof makeSourceRefs === "function" ? makeSourceRefs() : structuredClone(makeSourceRefs);
  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary: "RM-001 requirements are closed: deterministic roadmap triage and prioritization, human-owned RoadmapGate authority, an authoritative structured baseline and concise projection, plus mandatory fail-closed fresh-task session context."
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, { id: "BO-DEV-ROADMAP-001", statement: "Make potential DevRelay initiatives visible, comparable, auditable, and human-controlled before they alter approved engineering scope.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" }),
    sourced(sourceRefs, { id: "BO-DEV-SESSION-CONTEXT-001", statement: "Ensure every fresh DevRelay task begins from the same exact approved project, roadmap, lifecycle, Gate, frontier, and blocker context.", stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"], priority: "must" })
  );
  requirements.successMetrics.push(
    sourced(sourceRefs, { id: "SM-DEV-ROADMAP-COVERAGE-001", name: "Roadmap intake accountability", businessObjectiveIds: ["BO-DEV-ROADMAP-001"], measure: "Confirmed net-new initiative candidates with an exact audited disposition.", target: "100 percent are kept, deferred, merged, or discarded through RoadmapGate with no silent roadmap mutation.", measurementMethod: "Reconcile candidate, requirements closure, recommendation, Gate approval, baseline change, and traceability records." }),
    sourced(sourceRefs, { id: "SM-DEV-SESSION-CONTEXT-001", name: "Fresh-task context integrity", businessObjectiveIds: ["BO-DEV-SESSION-CONTEXT-001"], measure: "Fresh DevRelay tasks with a valid exact SessionContextReceipt before module execution.", target: "100 percent; missing, stale, substituted, malformed, or digest-mismatched context fails closed.", measurementMethod: "Run fresh-tab, new-day, workspace, drift, substitution, and restart conformance fixtures." }),
    sourced(sourceRefs, { id: "SM-DEV-ROADMAP-PROJECTION-001", name: "Readable roadmap parity", businessObjectiveIds: ["BO-DEV-ROADMAP-001"], measure: "Roadmap.md projections byte-identical to the approved RoadmapBaseline projection.", target: "100 percent parity with UTF-8 NFC LF bytes.", measurementMethod: "Regenerate and compare exact bytes for every RoadmapGate promotion." })
  );

  const capabilities = [
    ["CAP-DEV-ROADMAP-MANAGEMENT-001", "Roadmap review and prioritization", "Review and reprioritize approved roadmap initiatives using explicit weighted criteria without scheduling or execution authority.", "BO-DEV-ROADMAP-001"],
    ["CAP-DEV-ROADMAP-TRIAGE-001", "Initiative intake triage", "Evaluate a requirements-closed RoadmapIntakeCandidate and recommend one keep, defer, merge, or discard disposition.", "BO-DEV-ROADMAP-001"],
    ["CAP-DEV-SESSION-BOOTSTRAP-001", "Mandatory fresh-task context bootstrap", "Load, validate, digest-bind, and receipt current project and roadmap context before any fresh DevRelay task executes modules.", "BO-DEV-SESSION-CONTEXT-001"]
  ];
  requirements.capabilities.push(...capabilities.map(([id, name, description, objective]) => sourced(sourceRefs, { id, name, description, businessObjectiveIds: [objective], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must" })));
  requirements.userJourneys.push(sourced(sourceRefs, {
    id: "UJ-DEV-ROADMAP-CONTEXT-001", name: "Start with current context and govern net-new ideas", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityIds: capabilities.map(([id]) => id),
    trigger: "A user opens a fresh DevRelay task or raises a possible net-new initiative.", outcome: "The task proves exact current context, clarifies a genuine initiative when needed, and records a human-approved roadmap disposition without hidden scope mutation.",
    steps: [
      { sequence: 1, action: "Run DevRelaySessionBootstrap for the configured workspace.", expectedOutcome: "A digest-bound SessionContextSnapshot and passing SessionContextReceipt identify exact current state." },
      { sequence: 2, action: "Confirm whether a detected idea is a net-new initiative.", expectedOutcome: "Only a confirmed idea becomes a RoadmapIntakeCandidate." },
      { sequence: 3, action: "Run adaptive RequirementsGathering waves and RoadmapManagement triage.", expectedOutcome: "Intent closes at 0.99 and one evidence-backed disposition is proposed." },
      { sequence: 4, action: "Approve or reject the exact RoadmapGate candidate.", expectedOutcome: "The baseline and Roadmap.md change atomically, or the prior baseline remains authoritative." }
    ]
  }));

  const stories = [
    ["US-DEV-ROADMAP-REVIEW-001", "CAP-DEV-ROADMAP-MANAGEMENT-001", "Inspect and reprioritize the current roadmap using explicit criteria and exact project state.", "Roadmap choices remain understandable and reproducible.", ["AC-RM-MODULE-001", "AC-RM-PRIORITY-001", "AC-RM-DUPLICATE-001"]],
    ["US-DEV-ROADMAP-TRIAGE-001", "CAP-DEV-ROADMAP-TRIAGE-001", "Clarify and disposition a potential initiative without silently changing approved scope.", "New ideas are retained, deferred, merged, or discarded deliberately and audibly.", ["AC-RM-DISPOSITION-001", "AC-RM-GATE-001", "AC-RM-BASELINE-001", "AC-RM-E2E-001"]],
    ["US-DEV-SESSION-BOOTSTRAP-001", "CAP-DEV-SESSION-BOOTSTRAP-001", "Begin every fresh DevRelay task from exact approved project and roadmap context.", "Fresh tabs and new-day tasks do not depend on conversational memory or stale assumptions.", ["AC-RM-SESSION-BOOTSTRAP-001", "AC-RM-SESSION-RECEIPT-001", "AC-RM-CONTEXT-REFRESH-001", "AC-RM-EXPLICIT-INPUTS-001", "AC-RM-INITIALIZATION-001"]]
  ];
  requirements.userStories.push(...stories.map(([id, capabilityId, need, benefit, acceptanceCriterionIds]) => sourced(sourceRefs, { id, userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId, userJourneyIds: ["UJ-DEV-ROADMAP-CONTEXT-001"], need, benefit, priority: "must", acceptanceCriterionIds })));

  const criteria = [
    ["AC-RM-MODULE-001", "RoadmapManagement is one cross-cutting semantic Module with triage-candidate, review-roadmap, and reprioritize operations, and it is not inserted as a mandatory construction stage.", "Validate the module manifest, routing fixtures, lifecycle composition, and Generic Core identifier scan."],
    ["AC-RM-DISPOSITION-001", "A triage candidate returns exactly one keep, defer, merge, or discard recommendation and preserves every recommendation and rationale for audit.", "Execute positive, duplicate, conflicting, deferred, discarded, malformed, and replay fixtures."],
    ["AC-RM-GATE-001", "RoadmapGate alone approves RoadmapBaseline changes from exact checkpoint-replayed candidate bytes and content-addressed owner approval.", "Exercise approval, rejection, substitution, stale baseline, cloned receipt, and zero-call replay cases."],
    ["AC-RM-PRIORITY-001", "Priority is deterministically derived from explicit configurable weights over strategic alignment, user value, urgency, risk reduction, effort range, dependencies, and confidence.", "Compare canonical scores and ordering under reordered delivery, changed weights, ties, missing inputs, and invalid ranges."],
    ["AC-RM-DUPLICATE-001", "Triage compares candidates with exact current requirements, architecture, contracts, work breakdown, dependencies, active work, accepted work, and roadmap state to identify duplicate, conflicting, or already-covered initiatives.", "Run exact context-slice comparison fixtures and reject missing, stale, or substituted context."],
    ["AC-RM-BASELINE-001", "RoadmapBaseline is authoritative and Roadmap.md is its deterministic UTF-8 NFC LF concise projection; keep, defer, merge, and discard history remains traceable.", "Regenerate projection bytes and reconcile baseline lineage, dispositions, and traceability."],
    ["AC-RM-SESSION-BOOTSTRAP-001", "Every fresh DevRelay task in a configured workspace, including a fresh tab or new-day task, loads digest-bound ProjectOverview, Roadmap, lifecycle, current baselines, pending Gate, ready frontier, clarification, and blocker context before module execution.", "Execute fresh-task and restart fixtures for initialized, active, completed, blocked, and no-active-run states."],
    ["AC-RM-SESSION-RECEIPT-001", "DevRelaySessionBootstrap emits a SessionContextReceipt binding project/task identity, repository revision, exact artifact versions and digests, load time, and outcome, and fails closed on missing, stale, substituted, malformed, or digest-mismatched required context.", "Exercise every failure class and verify zero module execution before a passing receipt."],
    ["AC-RM-CONTEXT-REFRESH-001", "An approved baseline change requires a new bound SessionContextSnapshot and receipt at the next Module boundary before progression.", "Promote each baseline type mid-task and verify deterministic refresh, stale-snapshot rejection, and restart behavior."],
    ["AC-RM-EXPLICIT-INPUTS-001", "Session context supports orientation and candidate detection but never replaces explicit content-addressed ModuleInvocation inputs or becomes hidden Core or conversational authority.", "Scan Core and adapter contexts, reject omitted ports and hidden injection, and prove exact invocation fingerprints."],
    ["AC-RM-INITIALIZATION-001", "A project without a roadmap yields RoadmapNotInitialized and routes to baseline establishment without fabricating an empty roadmap or blocking read-only inspection.", "Execute uninitialized, malformed, initialized, and substituted roadmap state fixtures."],
    ["AC-RM-E2E-001", "A ChatGPT Desktop Windows task starts from a passing session receipt, clarifies a net-new initiative to 0.99 closure, produces one roadmap disposition, receives RoadmapGate approval, refreshes context, and exposes the updated concise roadmap without changing construction work.", "Reconcile the complete installed-package lifecycle report, receipts, checkpoints, baseline bytes, projection, traceability, replay, and owner decision." ]
  ];
  requirements.acceptanceCriteria.push(...criteria.map(([id, statement, verification]) => sourced(sourceRefs, { id, statement, verification })));

  const nfrs = [
    ["NFR-RM-DETERMINISM-001", "reliability", "Roadmap routing, scoring, ordering, projection, session snapshots, receipts, refresh, and replay must be byte-stable for exact inputs.", "Compare canonical bytes, digests, order, and adapter call counts across repeats and restarts.", "100 percent equality and zero duplicate adapter calls on replay.", ["AC-RM-PRIORITY-001", "AC-RM-BASELINE-001", "AC-RM-CONTEXT-REFRESH-001"]],
    ["NFR-RM-FAIL-CLOSED-001", "security", "Missing, stale, malformed, substituted, or digest-mismatched authority-bearing roadmap or session context must stop before module execution or baseline mutation.", "Run mutation matrices across every required artifact, receipt, checkpoint, and Gate approval.", "Zero unauthorized executions, projections, promotions, or graph facts.", ["AC-RM-GATE-001", "AC-RM-SESSION-RECEIPT-001", "AC-RM-EXPLICIT-INPUTS-001"]],
    ["NFR-RM-USABILITY-001", "usability", "Fresh-task context and roadmap review must be concise by default with expandable exact evidence and no requirement to inspect internal artifact construction.", "Review standard Desktop transcripts and compact report output.", "One startup summary, one roadmap summary, explicit blockers, and direct evidence links without full graph dumps.", ["AC-RM-SESSION-BOOTSTRAP-001", "AC-RM-BASELINE-001", "AC-RM-E2E-001"]],
    ["NFR-RM-PERFORMANCE-001", "performance", "Session bootstrap and native roadmap review must remain fast enough for every fresh Desktop task and record measured duration and cache behavior.", "Measure cold and warm bootstrap, baseline load, validation, projection, and receipt persistence on the Windows reference host.", "ArchitectureDesign defines release budgets and SystemVerification rejects regressions.", ["AC-RM-SESSION-BOOTSTRAP-001", "AC-RM-E2E-001"]]
  ];
  requirements.nonFunctionalRequirements.push(...nfrs.map(([id, category, statement, measure, target, acceptanceCriterionIds]) => sourced(sourceRefs, { id, category, statement, applicability: { level: "project" }, measure, target, priority: "must", acceptanceCriterionIds })));

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-RM-AUTHORITY-001", category: "technical", statement: "Candidate detection and adapters are proposer-only; RoadmapGate alone promotes RoadmapBaseline and Generic Core retains validation, checkpoint, and progression authority.", rationale: "Roadmap convenience cannot become scope or workflow authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RM-DISPOSITION-001", "AC-RM-GATE-001"] }),
    sourced(sourceRefs, { id: "CON-RM-CONTEXT-001", category: "technical", statement: "SessionContextSnapshot is mandatory orientation context for fresh DevRelay tasks but never an implicit substitute for ModuleInvocation ports.", rationale: "Fresh-task usability must preserve explicit dataflow and replay identity.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RM-SESSION-BOOTSTRAP-001", "AC-RM-EXPLICIT-INPUTS-001"] }),
    sourced(sourceRefs, { id: "CON-RM-SCOPE-001", category: "business", statement: "V1 RoadmapManagement owns prioritization and disposition only, not dates, staffing, scheduling, execution, or work-item status.", rationale: "Keep the module bounded and avoid duplicating downstream lifecycle authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RM-MODULE-001"] }),
    sourced(sourceRefs, { id: "CON-RM-PLATFORM-001", category: "platform", statement: "ChatGPT Desktop on Windows is the release-defining interactive host for RM-001.", rationale: "Verification must match the supported product surface.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RM-E2E-001"] })
  );
  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-RM-MODULE-001", statement: "RoadmapManagement module, RoadmapGate, RoadmapBaseline, Roadmap.md projection, candidate dispositions, priority configuration, and trusted traceability contribution." }),
    sourced(sourceRefs, { id: "SCOPE-RM-BOOTSTRAP-001", statement: "Mandatory DevRelaySessionBootstrap, SessionContextSnapshot, SessionContextReceipt, drift detection, RoadmapNotInitialized routing, and next-boundary refresh." }),
    sourced(sourceRefs, { id: "SCOPE-RM-DOGFOOD-001", statement: "Complete released-circuit dogfood and installed-package ChatGPT Desktop Windows acceptance for roadmap intake and fresh-task context." })
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-RM-SCHEDULING-001", statement: "Own release dates, staffing, scheduling, execution order, work-item status, or delivery commitments.", rationale: "Those responsibilities belong to separate planning and execution systems." }),
    sourced(sourceRefs, { id: "NG-RM-CHAT-MEMORY-001", statement: "Treat conversational memory as authoritative project or roadmap context.", rationale: "All authority-bearing context remains explicit and content addressed." }),
    sourced(sourceRefs, { id: "NG-RM-EXTERNAL-REQUIRED-001", statement: "Require GitHub Projects, Linear, Productboard, or another hosted planning system.", rationale: "The native structured file contract is authoritative and provider neutral." }),
    sourced(sourceRefs, { id: "NG-RM-ALL-CHATS-001", statement: "Run DevRelay bootstrap for unrelated ChatGPT conversations outside a configured DevRelay workspace.", rationale: "Mandatory context applies only when the user is using DevRelay." })
  );
  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-RM-CANDIDATE-001", term: "RoadmapIntakeCandidate", definition: "A confirmed possible net-new initiative awaiting requirements closure, deterministic triage, and RoadmapGate disposition.", aliases: ["Roadmap candidate"] }),
    sourced(sourceRefs, { id: "TERM-RM-BASELINE-001", term: "RoadmapBaseline", definition: "The authoritative structured, content-addressed set of approved roadmap initiatives, priorities, and disposition history.", aliases: ["Roadmap"] }),
    sourced(sourceRefs, { id: "TERM-RM-SESSION-SNAPSHOT-001", term: "SessionContextSnapshot", definition: "A compact digest-bound orientation bundle loaded at the start of a fresh DevRelay task and refreshed after baseline changes.", aliases: ["Session context"] }),
    sourced(sourceRefs, { id: "TERM-RM-SESSION-RECEIPT-001", term: "SessionContextReceipt", definition: "The fail-closed proof binding exact project, task, repository, artifact versions, digests, load time, and bootstrap outcome.", aliases: ["Bootstrap receipt"] })
  );
  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-RM-OWNER-001", statement: "The owner approved all twelve RM-001 intake decisions exactly as recorded.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-RM-PLATFORM-001", statement: "ChatGPT Desktop on Windows remains the only release-defining interactive host for this increment.", status: "confirmed", blocking: false })
  );
  requirements.dependencies = appendUnique(requirements.dependencies, [
    "The immutable SIM-001 implementation and evidence-seal commits as the RM-001 baseline.",
    "Current approved requirements, ProjectOverview, architecture, contract, work-breakdown, dependency, assignment, lifecycle, and traceability artifacts.",
    "The durable local host for task identity, artifact loading, receipt persistence, and module-boundary refresh.",
    "Optional planning-system adapters only after bounded adapter evaluation and owner approval."
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "Automatic idea detection can become noisy or silently expand scope unless user confirmation and RoadmapGate authority remain explicit.",
    "Priority scores can imply false objectivity unless weights, inputs, confidence, rationale, and ties remain visible.",
    "A session snapshot can become hidden global state unless every ModuleInvocation still binds its exact required artifacts.",
    "Mandatory bootstrap can add friction or block recovery unless read-only inspection and RoadmapNotInitialized have explicit routes.",
    "External planning adapters can drift from the authoritative baseline unless synchronization is bounded, versioned, and conflict-aware."
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "RoadmapManagement and RoadmapGate module contracts, schemas, native implementation, adapters, fixtures, tests, and operator documentation.",
    "RoadmapBaseline and deterministic concise Roadmap.md projection with full disposition and priority audit history.",
    "DevRelaySessionBootstrap with SessionContextSnapshot, SessionContextReceipt, drift diagnostics, initialization route, and boundary refresh.",
    "Queryable TraceabilityGraph links for roadmap candidates, approved initiatives, requirements, work, acceptance, and disposition evidence.",
    "A complete ChatGPT Desktop Windows installed-package dogfood and BusinessAcceptance package."
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "roadmap/module-conformance", "roadmap/gate-promotion", "roadmap/priority-determinism", "roadmap/disposition-audit",
    "roadmap/projection-parity", "session/bootstrap-receipt", "session/drift-matrix", "session/boundary-refresh",
    "session/explicit-input-isolation", "dogfood/windows-desktop-roadmap-cycle"
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}

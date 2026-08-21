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
          [
            left.role,
            left.artifact.artifactId,
            left.artifact.digest,
            left.location ?? "",
          ].join("\u0000"),
          [
            right.role,
            right.artifact.artifactId,
            right.artifact.digest,
            right.location ?? "",
          ].join("\u0000"),
        ),
      );
    }
    if (sortedCollections.has(key)) {
      return values.sort((left, right) => compareText(left.id, right.id));
    }
    if (
      sortedStringArrays.has(key) &&
      values.every((entry) => typeof entry === "string")
    ) {
      return [...new Set(values)].sort(compareText);
    }
    return values;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      canonicalize(child, childKey),
    ]),
  );
}

const sourced = (sourceRefs, value) => ({
  ...value,
  sourceRefs: structuredClone(sourceRefs),
});

const appendUnique = (entries, values) => [...new Set([...entries, ...values])];

const decisions = [
  ["Q-PM-AUTHORITY-001", "ProjectMemory is a cross-cutting DevRelay semantic module; its content-addressed ProjectMemoryBaseline is authoritative and Mem0 is a bounded derived retrieval and indexing adapter."],
  ["Q-PM-BOOTSTRAP-001", "ProjectMemory is the first semantic context loaded for every configured DevRelay task and is refreshed after every approved module boundary."],
  ["Q-PM-FAIL-CLOSED-001", "A missing, malformed, stale, substituted, digest-mismatched, or otherwise inaccurate canonical memory context blocks execution until repaired."],
  ["Q-PM-FALLBACK-001", "A Mem0 failure may use native recovery only when Core proves an equivalent accurate MemoryContextBundle; otherwise execution blocks."],
  ["Q-PM-LOCAL-001", "Mem0 operates locally on the Windows reference host by default; external model, embedding, memory, or cloud transmission requires explicit opt-in."],
  ["Q-PM-INVARIANTS-001", "Every module receives mandatory project invariants plus only relevant retrieved memory through an explicit digest-bound MemoryContextBundle."],
  ["Q-PM-PRECEDENCE-001", "Approved project authority outranks recency; current-session recency influences retrieval only among records with equal authority."],
  ["Q-PM-MODULE-SCOPE-001", "Module memory is invocation-scoped context and attribution, not an independent authoritative agent memory."],
  ["Q-PM-PROPOSER-001", "Modules and adapters return typed MemoryUpdateCandidates and cannot directly mutate ProjectMemory, Mem0, or TraceabilityGraph."],
  ["Q-PM-PROMOTION-001", "Evidence-backed status may be promoted after deterministic validation; direction, preferences, assumptions, requirements, and decisions require exact ProjectMemoryGate approval."],
  ["Q-PM-TRANSCRIPT-001", "Raw conversations are not stored by default; DevRelay preserves normalized decisions, rationale, questions, outcomes, and source receipts, with raw transcript capture opt-in."],
  ["Q-PM-TRACE-PROJECTION-001", "A trusted Core contributor derives a digest-bound TraceabilityContextProjection after an approved graph merge; Mem0 never receives graph mutation authority or direct graph-service access."],
  ["Q-PM-TRACE-CONTENT-001", "The traceability projection covers lifecycle nodes, forward relationships, current stage, approvals, blockers, orphan diagnostics, evidence gaps, and objective-to-evidence paths without uncontrolled graph duplication."],
  ["Q-PM-RETRIEVAL-RECEIPT-001", "Every provider retrieval binds query identity, provider version and configuration, project-memory version, graph checkpoint, ranked source references, result digest, and replay identity."],
  ["Q-PM-HISTORY-001", "Memory is append-only and superseded rather than silently overwritten; conflicts require clarification or an explicit supersession candidate."],
  ["Q-PM-SENSITIVE-001", "Credentials, raw secrets, and unapproved sensitive or personal information are rejected or redacted before memory ingestion."],
  ["Q-PM-PROJECT-SCOPE-001", "ProjectMemory is project-scoped; cross-project personal memory is a separate opt-in future capability."],
  ["Q-PM-BRIEFING-001", "Every task starts with a compact briefing of direction, roadmap item, lifecycle position, recent decisions, blockers, and next action."],
  ["Q-PM-CONCLUDE-001", "DevRelay automatically invokes the conclude operation at terminal worker and main-task boundaries and also exposes the user-facing /conclude command."],
  ["Q-PM-WORKER-AUTHORITY-001", "Worker conclusions cannot promote ProjectMemory; the parent or integration owner validates and serially merges exact worker conclusion candidates."],
  ["Q-PM-DELTA-REVIEW-001", "After every completed parallel frontier and terminal task, DevRelay shows explicit add, replace, supersede, retain, and reject memory dispositions for user approval or rejection."],
  ["Q-PM-QUALITATIVE-GATE-001", "Every qualitative direction or decision remains inactive until the user approves the exact ProjectMemory change set."],
  ["Q-PM-DOMAIN-ROUTING-001", "A proposed memory change that affects requirements, architecture, contracts, roadmap, work planning, or another authoritative domain routes through that domain's clarification and Gate before becoming active memory."],
  ["Q-PM-SYNOPSIS-001", "CurrentSynopsis.md is a deterministic compact projection covering the complete active ProjectMemory through included content or exact references and is the first handoff document loaded in a new task."],
  ["Q-PM-OPEN-SESSION-001", "An unconcluded session blocks a new task until it is resumed, concluded from its last checkpoint, or explicitly abandoned with rationale."],
  ["Q-PM-CONCURRENCY-001", "Concurrent worker conclusions bind optimistic baseline versions; the parent rejects or reconciles stale and conflicting candidates before promotion."],
  ["Q-PM-CONCLUDE-RECEIPT-001", "Task completion requires a ConcludeReceipt binding the session, baseline versions, graph checkpoint, update and synopsis digests, Mem0 synchronization status, and resulting checkpoint."],
  ["Q-PM-HOST-001", "ChatGPT/Codex Desktop on Windows hosts ProjectMemory through DevRelay skills, plug-in surfaces, and MCP tools without relying on an undocumented tab-close hook."],
];

export const ownerDecisions = Object.freeze(
  decisions.map(([questionId, decision]) =>
    Object.freeze({ questionId, decision, answer: "Approve exactly as stated" }),
  ),
);

export function buildProjectMemoryRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs =
    typeof makeSourceRefs === "function"
      ? makeSourceRefs()
      : structuredClone(makeSourceRefs);

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary:
      "PM-001 requirements are closed: authoritative project memory, mandatory task bootstrap, traceability-aware retrieval, bounded local Mem0 integration, explicit qualitative-delta approval, and receipt-bound session conclusion.",
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, {
      id: "BO-DEV-PROJECT-MEMORY-001",
      statement:
        "Preserve accurate project direction, decisions, rationale, state, and lessons across every DevRelay task without relying on conversational memory.",
      stakeholderIds: [
        "STK-DEV-MAINTAINER-001",
        "STK-DEV-OWNER-001",
        "STK-DEV-WORKFLOW-AUTHOR-001",
      ],
      priority: "must",
    }),
    sourced(sourceRefs, {
      id: "BO-DEV-SESSION-CONTINUITY-001",
      statement:
        "Make every completed worker frontier and task produce a reviewable, traceable synopsis that a fresh ChatGPT Desktop task can safely resume.",
      stakeholderIds: [
        "STK-DEV-MAINTAINER-001",
        "STK-DEV-OWNER-001",
        "STK-DEV-WORKFLOW-AUTHOR-001",
      ],
      priority: "must",
    }),
  );

  requirements.successMetrics.push(
    sourced(sourceRefs, {
      id: "SM-DEV-MEMORY-BOOTSTRAP-001",
      name: "Accurate memory bootstrap",
      businessObjectiveIds: ["BO-DEV-PROJECT-MEMORY-001"],
      measure: "Configured DevRelay tasks beginning with a verified current ProjectMemory context bundle.",
      target: "100 percent; inaccurate or unverifiable memory blocks execution.",
      measurementMethod:
        "Run fresh-task, stale, substitution, drift, provider-failure, native-recovery, and replay fixtures.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-MEMORY-CONCLUSION-001",
      name: "Concluded task continuity",
      businessObjectiveIds: ["BO-DEV-SESSION-CONTINUITY-001"],
      measure: "Completed frontiers, worker tasks, and main tasks with a verified ConcludeReceipt.",
      target: "100 percent before completion or handoff acceptance.",
      measurementMethod:
        "Reconcile session checkpoints, delta review, Gate approval, synopsis projection, provider synchronization, and handoff acceptance.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-MEMORY-TRACEABILITY-001",
      name: "Traceable memory claims",
      businessObjectiveIds: ["BO-DEV-PROJECT-MEMORY-001"],
      measure: "Active memory records resolving to exact artifacts, decisions, graph nodes, graph edges, or session receipts.",
      target: "100 percent source resolution and zero provider-authored authority facts.",
      measurementMethod:
        "Validate every active record against the pinned ProjectMemory and TraceabilityGraph checkpoints.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-MEMORY-SYNOPSIS-001",
      name: "Synopsis parity",
      businessObjectiveIds: ["BO-DEV-SESSION-CONTINUITY-001"],
      measure: "CurrentSynopsis.md projections matching the approved ProjectMemoryBaseline.",
      target: "100 percent deterministic UTF-8 NFC LF byte parity with complete active-memory dispositions.",
      measurementMethod:
        "Regenerate the synopsis and compare bytes, coverage manifest, references, and digest.",
    }),
  );

  const capabilities = [
    ["CAP-DEV-PROJECT-MEMORY-001", "Authoritative project memory", "Maintain versioned project direction, decisions, rationale, status, lessons, conflicts, and supersession history.", "BO-DEV-PROJECT-MEMORY-001"],
    ["CAP-DEV-MEMORY-CONTEXT-001", "Deterministic memory context", "Assemble a bounded digest-bound context bundle from project invariants, relevant memory, session state, and traceability context.", "BO-DEV-PROJECT-MEMORY-001"],
    ["CAP-DEV-MEMORY-CONCLUDE-001", "Session conclusion and handoff", "Conclude workers, frontiers, and main tasks through reviewed deltas, synopsis projection, provider synchronization, and exact receipts.", "BO-DEV-SESSION-CONTINUITY-001"],
    ["CAP-DEV-MEM0-001", "Bounded Mem0 retrieval", "Index and retrieve approved project and session memory through a local, version-pinned, proposer-only Mem0 adapter.", "BO-DEV-PROJECT-MEMORY-001"],
    ["CAP-DEV-MEMORY-TRACE-001", "Traceability-aware memory", "Expose approved lifecycle paths and diagnostics through trusted digest-bound TraceabilityContextProjection artifacts.", "BO-DEV-PROJECT-MEMORY-001"],
  ];
  requirements.capabilities.push(
    ...capabilities.map(([id, name, description, objective]) =>
      sourced(sourceRefs, {
        id,
        name,
        description,
        businessObjectiveIds: [objective],
        userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
      }),
    ),
  );

  requirements.userJourneys.push(
    sourced(sourceRefs, {
      id: "UJ-DEV-PROJECT-MEMORY-001",
      name: "Resume and conclude traceable project work",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityIds: capabilities.map(([id]) => id),
      trigger:
        "A user opens a configured DevRelay task, completes a parallel frontier, or concludes a worker or main task.",
      outcome:
        "The task begins from accurate approved memory and ends with an explicit reviewed delta, current synopsis, synchronized retrieval index, and verifiable handoff receipt.",
      steps: [
        { sequence: 1, action: "Verify project identity, ProjectMemoryBaseline, TraceabilityGraph checkpoint, and open-session state.", expectedOutcome: "Inaccurate or unconcluded state fails closed before lifecycle execution." },
        { sequence: 2, action: "Assemble and display the compact MemoryContextBundle and CurrentSynopsis.md.", expectedOutcome: "The task receives mandatory invariants and relevant source-resolving context." },
        { sequence: 3, action: "Execute bounded lifecycle work and collect typed memory candidates.", expectedOutcome: "Modules and adapters propose memory without mutation authority." },
        { sequence: 4, action: "Run /conclude after a frontier or terminal outcome.", expectedOutcome: "The user reviews exact add, replace, supersede, retain, and reject dispositions." },
        { sequence: 5, action: "Route cross-domain deltas and approve the exact ProjectMemoryGate candidate.", expectedOutcome: "Only reconciled, approved qualitative changes become active." },
        { sequence: 6, action: "Render CurrentSynopsis.md, synchronize Mem0, and emit ConcludeReceipt.", expectedOutcome: "A fresh task can reconstruct and resume the exact approved state." },
      ],
    }),
  );

  const stories = [
    ["US-DEV-PROJECT-MEMORY-001", "CAP-DEV-PROJECT-MEMORY-001", "Preserve project direction and decisions as approved, source-linked memory.", "Fresh tasks do not reinterpret the project's intent from chat history.", ["AC-PM-AUTHORITY-001", "AC-PM-PROMOTION-001", "AC-PM-HISTORY-001"]],
    ["US-DEV-MEMORY-CONTEXT-001", "CAP-DEV-MEMORY-CONTEXT-001", "Start each task with accurate invariants, recent context, and current lifecycle state.", "Work resumes without stale assumptions or unbounded prompt repetition.", ["AC-PM-BOOTSTRAP-001", "AC-PM-PRECEDENCE-001", "AC-PM-BRIEFING-001"]],
    ["US-DEV-MEMORY-CONCLUDE-001", "CAP-DEV-MEMORY-CONCLUDE-001", "Conclude every frontier and task through an explicit memory delta and handoff synopsis.", "Completed work is not lost between worker and main tasks or between fresh chats.", ["AC-PM-CONCLUDE-001", "AC-PM-DELTA-REVIEW-001", "AC-PM-OPEN-SESSION-001", "AC-PM-RECEIPT-001", "AC-PM-CONCURRENCY-001", "AC-PM-E2E-001"]],
    ["US-DEV-MEM0-001", "CAP-DEV-MEM0-001", "Use Mem0 for relevant local retrieval without granting it project authority.", "Memory remains useful and provider-replaceable while failures stay visible.", ["AC-PM-MEM0-001", "AC-PM-RETRIEVAL-001", "AC-PM-FALLBACK-001"]],
    ["US-DEV-MEMORY-TRACE-001", "CAP-DEV-MEMORY-TRACE-001", "Query why work exists and how it flows from objectives to evidence.", "Memory explanations remain grounded in the authoritative lifecycle graph.", ["AC-PM-TRACE-PROJECTION-001", "AC-PM-TRACE-QUERY-001"]],
  ];
  requirements.userStories.push(
    ...stories.map(([id, capabilityId, need, benefit, acceptanceCriterionIds]) =>
      sourced(sourceRefs, {
        id,
        userId: "USR-DEV-WORKFLOW-AUTHOR-001",
        capabilityId,
        userJourneyIds: ["UJ-DEV-PROJECT-MEMORY-001"],
        need,
        benefit,
        priority: "must",
        acceptanceCriterionIds,
      }),
    ),
  );

  const criteria = [
    ["AC-PM-AUTHORITY-001", "ProjectMemoryBaseline is the only authoritative project-memory state; Mem0 and every other provider remain derived proposer-only adapters.", "Validate schemas, manifests, Core identifier scans, mutation rejection, and provider substitution fixtures."],
    ["AC-PM-BOOTSTRAP-001", "Every configured DevRelay task verifies ProjectMemoryBaseline and its TraceabilityGraph checkpoint before loading CurrentSynopsis.md or executing a lifecycle module.", "Exercise fresh task, restart, missing, malformed, stale, substituted, and digest-mismatch cases."],
    ["AC-PM-PRECEDENCE-001", "Context assembly orders approved authority ahead of recency and applies recency only among equal-authority records.", "Compare reordered, conflicting, recent, old, approved, candidate, and superseded retrieval fixtures."],
    ["AC-PM-BRIEFING-001", "The first semantic task output is a compact source-linked briefing covering direction, current work, lifecycle stage, recent decisions, blockers, and next action.", "Inspect Desktop task transcripts and reconstruct every briefing field from exact baselines."],
    ["AC-PM-PROMOTION-001", "ProjectMemoryGate alone promotes exact checkpointed memory candidates; evidence status may use validated policy while qualitative changes require exact user approval.", "Run approval, rejection, cloned receipt, substitution, stale baseline, mixed delta, and replay cases."],
    ["AC-PM-DELTA-REVIEW-001", "Each completed parallel frontier and terminal task presents add, replace, supersede, retain, and reject dispositions before qualitative activation.", "Execute empty, additive, replacement, supersession, conflict, rejection, and multi-worker aggregation fixtures."],
    ["AC-PM-DOMAIN-ROUTING-001", "A memory delta affecting requirements, architecture, contracts, roadmap, work planning, or another authoritative domain blocks activation until the owning clarification and Gate resolve it.", "Mutate every domain class and verify fail-closed route identity, continuation, approval binding, and eventual memory activation."],
    ["AC-PM-CONCLUDE-001", "The conclude operation runs at terminal worker and main-task boundaries and is also invocable as /conclude through the Desktop host surface.", "Exercise worker completion, frontier completion, main completion, manual invocation, idempotent retry, and zero-call replay."],
    ["AC-PM-OPEN-SESSION-001", "A new task cannot proceed while an earlier session is unconcluded; it must resume, conclude from the last valid checkpoint, or be abandoned with rationale.", "Simulate close, crash, compaction, interrupted provider sync, recovery, abandonment, and concurrent reopen."],
    ["AC-PM-RECEIPT-001", "Completion requires a ConcludeReceipt binding the session, input and result memory versions, graph checkpoint, delta and synopsis digests, provider synchronization, and resulting checkpoint.", "Reject omitted, stale, substituted, mismatched, unverified-provider, and cross-session receipts."],
    ["AC-PM-SYNOPSIS-001", "CurrentSynopsis.md is a deterministic UTF-8 NFC LF projection with complete active-memory coverage through included text or exact references and is never independently editable authority.", "Regenerate bytes, validate the coverage manifest, and reject omitted active records, stale references, manual edits, and superseded content."],
    ["AC-PM-MEM0-001", "A version-pinned local Mem0 adapter indexes and retrieves only approved memory and trusted traceability projections under project, session, and module-attribution namespaces.", "Run live provider attestation plus configuration, namespace, permission, data-boundary, and version mismatch fixtures."],
    ["AC-PM-RETRIEVAL-001", "Every provider retrieval emits a receipt binding the exact query, configuration, input checkpoints, ranked source references, output digest, and replay behavior.", "Repeat exact queries, reorder delivery, restart, replay, change configuration, and substitute graph or memory checkpoints."],
    ["AC-PM-FALLBACK-001", "Mem0 failure blocks unless Core's native path proves an equivalent accurate context bundle; no degraded or inferred context may proceed silently.", "Exercise provider timeout, malformed output, partial index, stale index, native equivalence pass, equivalence failure, and recovery."],
    ["AC-PM-TRACE-PROJECTION-001", "Only a trusted contributor may derive TraceabilityContextProjection after an approved graph merge, and the projection binds exact nodes, forward edges, diagnostics, lifecycle position, and graph checkpoint.", "Verify contributor ownership, merge ordering, checkpoint binding, graph mutation denial, horizon diagnostics, and replay."],
    ["AC-PM-TRACE-QUERY-001", "ProjectMemory answers current-state, rationale, provenance, coverage, and impact questions using source-resolving objective-to-evidence paths without treating generated summaries as graph authority.", "Execute why, what-changed, current-stage, covered-by, missing-evidence, orphan, and impact queries with source reconciliation."],
    ["AC-PM-HISTORY-001", "Approved memory is append-only, with explicit supersession and conflict history; deletion is limited to approved sensitive-data handling.", "Exercise update, supersession, conflict, rejection, retention, redaction, deletion approval, and historical reconstruction."],
    ["AC-PM-CONCURRENCY-001", "Worker conclusions bind their starting baseline and graph checkpoint; one parent serially validates and merges them or returns explicit stale/conflict diagnostics.", "Run independent, overlapping, contradictory, stale, missing-parent, reordered, and retrying worker frontiers."],
    ["AC-PM-E2E-001", "An installed DevRelay package on ChatGPT/Codex Desktop for Windows bootstraps exact project memory, uses live local Mem0 retrieval and traceability context, executes a worker frontier, concludes it, approves the project delta, emits CurrentSynopsis.md and ConcludeReceipt, then resumes accurately in a fresh task.", "Reconcile the complete clean-workspace Desktop transcript, provider attestation, baselines, graph, receipts, checkpoints, projection bytes, replay, and owner approvals."],
  ];
  requirements.acceptanceCriteria.push(
    ...criteria.map(([id, statement, verification]) =>
      sourced(sourceRefs, { id, statement, verification }),
    ),
  );

  const nfrs = [
    ["NFR-PM-DETERMINISM-001", "reliability", "Memory normalization, authority ordering, context assembly, delta classification, synopsis projection, receipts, checkpoints, and replay must be byte-stable for exact inputs.", "Compare canonical bytes, digests, order, and provider call counts across repeats and restarts.", "100 percent equality and zero duplicate provider calls on replay.", ["AC-PM-PRECEDENCE-001", "AC-PM-RETRIEVAL-001", "AC-PM-SYNOPSIS-001"]],
    ["NFR-PM-ACCURACY-001", "reliability", "DevRelay must not execute from missing, stale, conflicting, unsupported, or unverifiable project memory.", "Run the complete corruption, drift, conflict, provider, and native-equivalence matrices.", "Zero module executions from an inaccurate context bundle.", ["AC-PM-BOOTSTRAP-001", "AC-PM-FALLBACK-001", "AC-PM-DOMAIN-ROUTING-001"]],
    ["NFR-PM-SECURITY-001", "security", "Memory capture, projection, retrieval, and synchronization must reject secrets, unsafe controls, path escapes, unauthorized provider access, and undeclared external transmission.", "Run secret, injection, path, permission, network, redaction, and sensitive-deletion fixtures.", "Zero unauthorized disclosures, writes, graph mutations, or provider transmissions.", ["AC-PM-MEM0-001", "AC-PM-TRACE-PROJECTION-001", "AC-PM-HISTORY-001"]],
    ["NFR-PM-USABILITY-001", "usability", "Task startup and conclusion must present compact human-readable state and deltas while keeping exact evidence expandable.", "Review standard Windows Desktop startup, worker handoff, conflict, recovery, and conclusion transcripts.", "One concise briefing and one concise conclusion diff, with direct exact-artifact references.", ["AC-PM-BRIEFING-001", "AC-PM-DELTA-REVIEW-001", "AC-PM-E2E-001"]],
    ["NFR-PM-PERFORMANCE-001", "performance", "Mandatory memory bootstrap, retrieval, frontier reconciliation, and conclusion must remain fast enough for use at every task and frontier boundary and report measured latency and cache behavior.", "Measure cold and warm native and Mem0 paths on the Windows reference host.", "ArchitectureDesign defines release budgets and SystemVerification rejects regressions.", ["AC-PM-BOOTSTRAP-001", "AC-PM-CONCLUDE-001", "AC-PM-E2E-001"]],
  ];
  requirements.nonFunctionalRequirements.push(
    ...nfrs.map(([id, category, statement, measure, target, acceptanceCriterionIds]) =>
      sourced(sourceRefs, {
        id,
        category,
        statement,
        applicability: { level: "project" },
        measure,
        target,
        priority: "must",
        acceptanceCriterionIds,
      }),
    ),
  );

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-PM-AUTHORITY-001", category: "technical", statement: "Core and ProjectMemoryGate own canonical memory authority; Mem0, modules, models, sessions, and adapters remain proposer-only.", rationale: "Retrieval convenience cannot become project truth or workflow authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-PM-AUTHORITY-001", "AC-PM-PROMOTION-001"] }),
    sourced(sourceRefs, { id: "CON-PM-TRACE-001", category: "technical", statement: "Mem0 receives only trusted digest-bound TraceabilityContextProjection artifacts and cannot access or mutate TraceabilityGraph directly.", rationale: "The graph remains the authoritative lifecycle relationship service.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-PM-TRACE-PROJECTION-001", "AC-PM-TRACE-QUERY-001"] }),
    sourced(sourceRefs, { id: "CON-PM-DOMAIN-001", category: "technical", statement: "ProjectMemory cannot activate a change to another authoritative baseline until that domain's module and Gate approve the exact delta.", rationale: "Memory must reflect approved engineering truth rather than bypass lifecycle authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-PM-DOMAIN-ROUTING-001"] }),
    sourced(sourceRefs, { id: "CON-PM-HOST-001", category: "platform", statement: "ChatGPT/Codex Desktop on Windows is the release-defining interactive host; closeout cannot rely on an undocumented tab-close callback.", rationale: "The supported behavior must be enforceable through DevRelay contracts, skills, plug-in surfaces, MCP, checkpoints, and next-task recovery.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-PM-CONCLUDE-001", "AC-PM-E2E-001"] }),
  );

  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-PM-MODULE-001", statement: "ProjectMemory cross-cutting module, ProjectMemoryGate, canonical baseline, update candidates, authority and precedence policy, checkpoints, receipts, and native recovery." }),
    sourced(sourceRefs, { id: "SCOPE-PM-CONCLUDE-001", statement: "Worker, frontier, and main-task conclusion; /conclude Desktop UX; delta review; cross-domain routing; CurrentSynopsis.md; open-session recovery; and ConcludeReceipt." }),
    sourced(sourceRefs, { id: "SCOPE-PM-MEM0-001", statement: "Version-pinned local Mem0 adapter with live execution attestation, project/session/module-attribution namespaces, synchronization verification, deterministic retrieval receipts, and native equivalence fallback." }),
    sourced(sourceRefs, { id: "SCOPE-PM-TRACE-001", statement: "Trusted TraceabilityContextProjection and source-resolving current-state, rationale, provenance, coverage, evidence-gap, orphan, and impact queries." }),
    sourced(sourceRefs, { id: "SCOPE-PM-DOGFOOD-001", statement: "Complete released-circuit dogfood plus installed-package ChatGPT/Codex Desktop Windows fresh-task, worker, conclusion, and resume acceptance." }),
  );

  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-PM-RAW-CHAT-001", statement: "Store every raw conversation by default or treat chat history as authoritative project memory.", rationale: "Durable memory is normalized, source-linked, minimized, and explicitly governed." }),
    sourced(sourceRefs, { id: "NG-PM-MEM0-AUTHORITY-001", statement: "Allow Mem0 to select lifecycle stages, approve decisions, mutate baselines, write graph edges, or become required canonical storage.", rationale: "Provider replacement and deterministic recovery require Core-owned authority." }),
    sourced(sourceRefs, { id: "NG-PM-MODULE-AGENTS-001", statement: "Turn deterministic lifecycle modules into autonomous agents with independent durable memories.", rationale: "Module attribution is a namespace, not an authority boundary." }),
    sourced(sourceRefs, { id: "NG-PM-CROSS-PROJECT-001", statement: "Share project memory or personal preferences across repositories by default.", rationale: "Cross-project memory is a separate opt-in privacy and authority decision." }),
    sourced(sourceRefs, { id: "NG-PM-DOMAIN-BYPASS-001", statement: "Use /conclude or ProjectMemoryGate to bypass RequirementsGate, ArchitectureGate, ContractGate, RoadmapGate, or another domain Gate.", rationale: "Memory records approved state; it does not create unapproved domain truth." }),
  );

  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-PM-BASELINE-001", term: "ProjectMemoryBaseline", definition: "The authoritative content-addressed project-scoped memory state containing active, pending, superseded, and historical records plus exact source identities.", aliases: ["Project memory"] }),
    sourced(sourceRefs, { id: "TERM-PM-CONTEXT-001", term: "MemoryContextBundle", definition: "The validated bounded task or module input containing mandatory project invariants, relevant approved memory, session context, lifecycle state, and retrieval receipts.", aliases: ["Memory context"] }),
    sourced(sourceRefs, { id: "TERM-PM-SYNOPSIS-001", term: "CurrentSynopsis.md", definition: "The deterministic compact handoff projection of complete active ProjectMemory coverage through included content or exact references.", aliases: ["Project synopsis"] }),
    sourced(sourceRefs, { id: "TERM-PM-CONCLUSION-001", term: "SessionConclusion", definition: "An immutable session or frontier closeout describing accomplished work, decisions, deltas, blockers, open questions, next action, and exact supporting artifacts.", aliases: ["Conclusion"] }),
    sourced(sourceRefs, { id: "TERM-PM-CONCLUDE-RECEIPT-001", term: "ConcludeReceipt", definition: "Proof that an exact session or frontier was reconciled against pinned memory and graph checkpoints, its delta was governed, its synopsis rendered, and provider synchronization verified.", aliases: ["Conclusion receipt"] }),
    sourced(sourceRefs, { id: "TERM-PM-TRACE-PROJECTION-001", term: "TraceabilityContextProjection", definition: "A trusted digest-bound read-only memory view of selected approved TraceabilityGraph nodes, forward edges, diagnostics, paths, lifecycle state, and graph checkpoint.", aliases: ["Trace memory view"] }),
  );

  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-PM-OWNER-001", statement: "The owner approved all PM-001 decisions recorded across the two breadth-first clarification waves and their explicit normalized interpretation.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-PM-HOST-001", statement: "ChatGPT/Codex Desktop on Windows remains the only release-defining interactive host for PM-001.", status: "confirmed", blocking: false }),
  );

  requirements.dependencies = appendUnique(requirements.dependencies, [
    "The immutable RM-001 release-ready commit a18e6fbfac4f8e3088b349dd2c018efcc5dc0bc1 and tree b53a0c5324a3907746dc6770a6734b29735a6888.",
    "Current approved requirements, ProjectOverview, roadmap, architecture, contract, work, lifecycle, session-bootstrap, and TraceabilityGraph artifacts.",
    "A live-evaluated, version-pinned Mem0 OSS distribution and its local Windows runtime dependencies.",
    "ChatGPT/Codex Desktop skill, plug-in, and MCP host surfaces for bootstrap, query, conclusion, recovery, and receipts.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "Automated memory extraction can convert inference into false project truth unless every record carries authority, source, confidence, and approval state.",
    "Recency weighting can override durable decisions unless authority precedence is evaluated before ranking.",
    "Mem0 indexing or model-backed extraction can be nondeterministic, stale, unavailable, or transmit data unless exact configuration, receipts, local defaults, and native equivalence are enforced.",
    "Duplicating TraceabilityGraph into provider memory can drift or create inverse authority unless only trusted checkpointed projections are indexed.",
    "Frequent conclusion approval can create fatigue unless deltas are concise, complete, grouped by authority, and empty changes remain cheap.",
    "Concurrent worker conclusions can overwrite one another unless optimistic baseline identity and one serial integration owner are mandatory.",
    "A user can close a Desktop task without a host callback unless open-session checkpoints and next-task recovery fail closed.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "ProjectMemory and ProjectMemoryGate contracts, schemas, native implementation, trusted contributors, fixtures, tests, operator documentation, and deterministic replay.",
    "ProjectMemoryBaseline, MemoryContextBundle, MemoryUpdateCandidate, SessionConclusion, CurrentSynopsis.md, ConcludeReceipt, and associated checkpoints and receipts.",
    "Local version-pinned Mem0 adapter evaluation, live provider attestation, synchronization verification, retrieval receipts, and native equivalence fallback.",
    "Trusted TraceabilityContextProjection with lifecycle, rationale, provenance, coverage, diagnostic, and impact-query support.",
    "ChatGPT/Codex Desktop on Windows bootstrap, /conclude, worker handoff, crash recovery, fresh-task resume, and installed-package acceptance evidence.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "memory/module-conformance",
    "memory/gate-promotion",
    "memory/authority-precedence",
    "memory/context-bootstrap",
    "memory/delta-review",
    "memory/domain-routing",
    "memory/session-conclusion",
    "memory/synopsis-parity",
    "memory/conclude-receipt",
    "memory/open-session-recovery",
    "memory/concurrency-reconciliation",
    "memory/mem0-live-attestation",
    "memory/mem0-sync-verification",
    "memory/native-equivalence",
    "memory/traceability-projection",
    "memory/trace-query",
    "dogfood/windows-desktop-project-memory-cycle",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}

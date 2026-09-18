# Visual workspace: deferred owner-request intake

Status: requested follow-up, not implemented, not an approved requirements
change set, and not part of the current runtime release's acceptance criteria.
Captured: 2026-09-13. Working name: DevRelay Visual Workspace.

## Owner request and release decision

The owner wants an intuitive visual memory and orchestration experience that
connects ideation, business requirements, deterministic modules, concrete agent
work and evidence. They want to see which strand of discussion contributes to
which business requirement, how the work flows together, and what the project
learns over time without losing its history.

Asked whether the first release should include a focused visual workspace or
finish the runtime first, the owner explicitly answered:

> Finish the runtime release first; add the visual workspace next

This decision defers the visual workspace, not the previously requested runtime
memory, worktrees, quality/continuity and human-orchestration functionality.
Desktop remains the agent operator. The earlier runtime estimate must not be
presented as an estimate for this additional visual product.

Inspiration: the owner's linked [Cognee discussion](https://www.reddit.com/r/LLMDevs/comments/1iptj8g/cognee_opensource_memory_framework_for_ai_agents/)
describes connected semantic memory and repository relationships. It is design
inspiration, not a request to install Cognee, migrate memory, transmit project
data, or adopt its architecture. Its authors' retrieval/completeness claims are
not DevRelay verification evidence.

On 2026-09-14 the owner specifically preferred incorporating Cognee as the
memory map and asked for the next workspace to run locally. Evaluate Cognee
as a bounded derived semantic-graph/retrieval adapter, preserving canonical
ProjectMemory, TraceabilityGraph and Gate authority. This is the preferred
next-stage direction, not a completed provider integration or permission to
send repository content to a cloud service. A local deployment must explicitly
choose both model and embedding providers and a concurrency-safe graph-store
configuration. No Cognee installation or memory migration has occurred.

## Proposed experience — candidate, not approved implementation scope

The owner's 2026-09-14 direction is **simple to understand and use**, citing
early LangChain as an experience analogy, not a dependency selection. Prefer
one everyday flow: describe the goal, review the plan, follow progress and
resolve needed decisions, then review the tested result. Module identifiers,
receipt digests, graph internals and worktree mechanics belong in expandable
details, not mandatory operator input. Preserve explicit approvals and show
blocked or unverified states honestly; simplicity must not imply bypassing Gates.

Proposed usability checks for the next-stage requirements interview:

- A first-time operator can identify the goal, current work, needed decision
  and next action from the landing view without opening raw artifacts.
- Each displayed completion links to verified integration evidence; an agent's
  “done” message is visibly distinct from reviewed and integrated work.
- Resuming the same project recovers its queue and decisions without requiring
  the operator to retell the project history.
- Advanced details remain available without being required for the everyday flow.

These are candidate checks, not evidence of implemented UI or accepted usability.

Use a shared selected item and exact snapshot across complementary views:

1. **Project map:** business outcomes and requirements as anchors, with focused
   memory/decision strands and downstream work/evidence. Clicking an item offers
   “Why?”, “What depends on this?”, “What proves it?” and “What is missing?”
   Prefer focused paths and progressive expansion over an unreadable all-node graph.
2. **Memory:** ideas, source excerpts, decisions, constraints, assumptions,
   lessons and unresolved questions, with explicit source, author/owner,
   version, scope, freshness and candidate/approved/superseded disposition.
   Distinguish exact quoted sources, summaries and suggested relationships.
3. **Lifecycle:** actual deterministic Module/Gate sequence, conditional routes,
   current position, blocked inputs, approved baselines and evidence handoffs.
   Expand each node into its relevant requirement, architecture, contract or
   verification view. Parallel work remains a dependency DAG, not a flat sequence.
4. **Work and agents:** dependency-safe queue, agent/sub-agent tree, task and
   worktree assignments, review obligations, approvals and blockers. Selecting
   work highlights its upstream requirement and downstream proof.
5. **History and learning:** show what changed between exact checkpoints, why,
   who approved it and what earlier knowledge it superseded. Reviewed lessons
   can propose future requirements, policy changes or regression tests; they
   cannot silently rewrite an approved process or weaken quality gates.

The everyday landing view should answer: what are we trying to achieve, where
are we, what needs my attention, what happens next, and what evidence supports
the displayed state? Each Module should expose context-appropriate views, not
force the user to understand raw JSON or open a global graph for every action.

## Reuse and authority boundaries

The approved global requirements/overview pair is version 2.8.0. Existing
business anchors include BO-DEV-PROJECT-MEMORY-001,
BO-DEV-HUMAN-ORCHESTRATION-001, BO-DEV-TRACEABILITY-001,
BO-DEV-OBSERVABILITY-001 and BO-DEV-QUALITY-CONTINUITY-001. Existing criteria
include AC-PM-TRACE-QUERY-001, AC-PM-HISTORY-001, AC-HO-VIEW-001,
AC-HO-CONTROL-001, AC-HO-STALE-001 and AC-DEV-TRACEABILITY-001.
These support the intent; they do not prove the new visual product is approved
or implemented.

- ProjectMemory owns approved semantic memory. TraceabilityGraph owns exact
  engineering lineage. HumanOrchestration owns its projection and typed control
  contracts; existing handlers own effects. ProjectControl and WorkContinuity
  supply their existing status and exact-work/reuse projections.
- One visual experience does not require merging these authorities into a new
  graph database or replacing the deterministic runtime with an agent framework.
- Suggested semantic links, source references and trusted engineering edges are
  distinct relation types. Suggested links must never look like approved evidence.
  Show explicit missing-link and unknown-state dispositions, not invented paths.
- Visual selection, search, filtering and layout are read-only. Mutating actions
  use existing typed requests bound to displayed view digest and durable state
  version, with exact preview, named authority, confirmation where required,
  stale rejection and effect-replay protection. Dragging a node changes layout,
  never dependency order or approval status.
- Any genuinely new candidate-idea persistence or view contract needs one
  explicit schema owner and lifecycle-approved design. Prefer additive renderer
  and projection integration; do not predeclare unnecessary new semantic Modules.

## Candidate acceptance checks for the later milestone

- Follow a captured, in-scope idea to an approved requirement and its actual
  work, change and test evidence, then navigate backward to exact source bytes.
- Distinguish proposals, approved facts, superseded history, conflicts, missing
  sources, unavailable host observations and stale snapshots without color alone.
- Recover the same version-bound view after restart; no missing acknowledged
  intake, hidden write, duplicate effect or unreported truncation.
- Every rendered claim has a resolvable source or an explicit unknown/proposal
  label. Coverage reports show their denominator and current lifecycle horizon;
  never imply that all chats or all possible knowledge were captured.
- Candidate capture is scoped to explicit DevRelay sources and excludes unrelated
  conversations, credentials and sensitive data. Capture acknowledgment and
  reconciliation expose ingestion gaps; sensitive-data handling follows its own
  approved policy rather than a blanket forever-retention promise.
- Keyboard-accessible, readable small-window and large-graph views; bounded
  graph queries, deterministic ordering, stable layouts and visible partial
  results. Define measured budgets during requirements closure.
- Independent review proves visual controls cannot bypass owning Gates, change
  readiness, promote memory or fabricate completion.
- Learning proposals bind observed outcomes and reviewed evidence; retain both
  failed and successful attempts without claiming autonomous self-improvement.

## Next lifecycle entry

After runtime release acceptance, use RequirementsGathering to close the visual
workspace MVP, supported Desktop presentation surface, capture/retention rules,
interaction scope, accessibility and performance budgets. Evolve the single
global requirements/overview pair through its owning Gate, then run the normal
architecture, contract, work-planning, implementation, verification and acceptance
stages. This intake does not promote ProjectMemory or bypass RoadmapManagement.

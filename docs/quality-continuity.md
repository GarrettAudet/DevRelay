# Quality, continuity, and project control

DevRelay can compose three independently versioned cross-cutting Modules around its existing deterministic software-construction lifecycle:

- **QualityPolicy** turns an approved project policy, workflow profile, risk context, changed surfaces, technologies, and acceptance criteria into exact verification obligations.
- **WorkContinuity** gives work a content-derived identity, blocks concurrent duplicate attempts, persists exact attempt lineage, and permits automatic reuse only for a fully revalidated exact match.
- **ProjectControl** projects a read-only view of lifecycle state, ready work, blockers, quality gaps, reuse, worktrees, memory, verification, and local productivity evidence.

They do not add construction stages. Existing Requirements, Architecture, Contract, WorkBreakdown, WorkDependency, SpecialistAssignment, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, and BusinessAcceptance authorities remain unchanged.

## Deterministic composition

Unreleased policy verification also reconstructs the exact candidate and Gate
promotion before resolving obligations. Recomputing a baseline digest after
changing its rules or substituting its approval does not make it acceptable.
This checks approval/content consistency, not the identity of a human approver
or whether that policy is the current host-approved policy; dispatch still needs
the surrounding host authority and current-head checks.

The unreleased local quality Gate preparation helper retains exact raw candidate,
approval and prior-policy evidence, derives the baseline through the existing
Gate, and can reverify its whole result. Replacements bind the prior digest and
require a changed version. Its closed result explicitly does not activate the
policy. Durable head publication, authenticated host approval and CLI dispatch
composition are still required; this helper is not a release-ready command.

The accompanying activation component checkpoints the approved graph projection,
reserves the policy head, merges the graph, and journals baseline publication.
Its recovery test reopens local storage after a post-merge interruption and
completes with one total graph merge. This is component evidence using an
in-memory graph and fixture approval, not full host-crash acceptance. The CLI
still needs to bind explicit approval and require the current activated policy
before preparing or dispatching work.

Activation publication retains the exact candidate, approval, prior-policy and
baseline bytes and checks each stored digest during verification. Replacement
tests confirm that an old activation can be replayed as historical evidence
without restoring it as the current policy; a stale replacement cannot merge.

New unreleased host controls connect this boundary: `resume.qualityPolicyGate`
takes a digest-bound `DesktopQualityPolicySubmission` file; a separate
`resume.activateQualityPolicy` pins the resulting preparation digest. The host
requires that exact activated current policy when preparing work quality and
rechecks the head after asynchronous preparation. Its focused fixture-backed
host test passes preparation, activation, replay and stale-request rejection.
The expanded full-host scenario and installed-product acceptance are pending;
this does not launch a Desktop worker or constitute human policy approval.

Create a `CrossCuttingCompositionPlan` from declarative bindings. Each binding pins an exact Module version and operation, one named boundary, explicit input and output ports, dependency IDs, configuration and grant digests, and `stop` or `diagnostic` failure behavior.

The resolver preflights the complete binding graph against the exact supplied `ModuleDefinition` and operation contract. The resulting binding pins both contract digests. It rejects stale or invented operations and ports, missing dependencies, cycles, later-boundary dependencies, unavailable inputs, ambiguous output producers, unknown boundaries, and unpinned versions or digests. Ordering is boundary, dependency, then stable binding ID. Generic composition code never branches on a product or Module identity.

Supported boundaries are `session-start`, `before-work-planning`, `before-task-dispatch`, `after-work-execution`, `before-integration`, `frontier-complete`, and `session-conclusion`.

## Quality guarantees and limits

QualityPolicy makes quality requirements explicit and enforceable; it does not guarantee defect-free code. The testable guarantee is narrower: work cannot satisfy the quality assessment when a resolved obligation lacks required passing evidence, independent review is missing, a baseline or resolution digest drifted, or a waiver lacks explicit approval authority.

The same quality resolution is bound into `DesktopTaskPlan` and translated into mandatory WorkItemVerification and SystemVerification obligations. Those existing verification Modules and their Gates retain decision authority.

Workflow profiles remain useful:

- `quick` gives fast changed-scope feedback while preserving deferred final-assurance obligations.
- `standard` is the balanced default.
- `assurance` requires the complete configured verification set immediately.
- `inspect` remains read-only.

## Reuse without repeating mistakes

WorkContinuity fingerprints the exact project, requirements and overview baselines, work item, target revision, dependency closure, assignment, quality resolution, input artifacts, and implementation configuration.

Automatic reuse requires the same fingerprint, target revision, and quality resolution plus a completed record with exact receipt, result, and evidence digests. Similarity is only an owner-review candidate. It is never automatic reuse or completion authority. Prepared, dispatched, running, expired, or uncertain effects require reconciliation and are never blindly repeated.

`createDurableWorkContinuityStore` persists canonical index bytes through the existing SQLite and content-addressed local host. Updates use both host-state and continuity-index compare-and-swap revisions. The bundled store is a local reference implementation; another host remains responsible for equivalent durable atomic persistence.

## Desktop and worktree operation

`DesktopOrchestrationPlan` may bind the exact cross-cutting plan. A managed `DesktopTaskPlan` continues to require the exact ProjectMemory bootstrap receipt and may additionally bind a quality resolution, work fingerprint, and continuity decision as an inseparable triple. Their digests participate in task idempotency, so changed policy or work identity creates a different dispatch identity.

Git worktree isolation remains owned by the durable worktree manager. These Modules consume its exact observations; they do not create hidden worktrees or infer provider state. ProjectControl can be added to the Desktop operator snapshot to show the exact frontier, remaining work, and reconciliation diagnostics.

In the unreleased candidate, the task adapter refuses fresh `create` calls when
a bound continuity decision is anything other than `execute`. An exact-reuse
decision therefore makes zero provider creation calls; inspect the existing work
and its evidence instead. This does not promote completion or replace the owning
verification and integration checks. Legacy plans without the optional quality
triple remain supported; full host enforcement of that triple is still pending.

The candidate local continuity claim helper also excludes unresolved attempts
for the same work item across changed fingerprints, including expired and
quarantined attempts. Two independent SQLite connections cannot both commit a
claim from the same state version. This helper is not yet wired into the complete
installed Desktop dispatch workflow; its tests are not proof of that integration.

The candidate host now exposes an explicit claim over a saved, revalidated
execution preparation. It never accepts a caller-authored fingerprint or grants
dispatch authority. Lost-response recovery requires the exact original journaled
claim and an unchanged, unexpired prepared attempt; it does not renew the lease.
Read-only historical claim verification separately proves the original claim
after expiry or later status transitions. It preserves immutable attempt identity
and checks the exact journal checkpoint, but does not attest that subsequent
execution, review, or integration succeeded. Those retain their own evidence and
Gate requirements. The successful composed host claim scenario awaits execution;
the focused claim/recovery tests are not installed Desktop acceptance evidence.

`inspectForDispatch(attemptId)` observes the real Git worktree without optional
Git index writes. It requires an active, unbound lease at the exact starting
commit and rejects tracked or untracked changes. This point-in-time observation
does not lock the workspace or authorize dispatch; the composed host must still
check current continuity, memory, grants and task identity before provider use.

The unreleased `prepareClaimedDesktopTaskPlan` host helper composes exact active
claim recovery, native worktree observation and prepared ProjectMemory binding.
It derives work identity and assignment from the validated fingerprint and
rechecks the claim and observation before returning a plan. It creates no task
and does not replace dispatch-time current-state checks, grant validation, durable
plan storage or effect checkpointing. Its composed tests use real local Git and
SQLite with fixture Desktop responses; live host dispatch remains unfinished.

The orchestration runtime can persist a task plan with `prepareTask` and reload
it with `loadTaskPlan`. Preparation binds canonical plan bytes to the pending
frontier and exact orchestration project/revision; replacement is rejected and
exact replay does not advance state. Loading requires a freshly prepared exact
memory binding. A saved plan is not a provider effect receipt: prepared work still
requires reconciliation on recovery, and these methods never create a task.

`reserveTaskDispatch` records an exact saved plan/provider reservation before
external creation. Repeating a reservation is rejected even after restart;
an uncertain provider effect requires reconciliation. `recordTaskDispatch`
checks the create receipt's plan, work, attempt, provider and idempotency identity
before advancing to dispatched. Exact receipt replay does not advance the
journal. These are orchestration journal boundaries, not readiness or grant
authority; connecting them to the installed host's provider call remains required.

Candidate compatibility note: `createDesktopExecutionCoordinator` now requires
the supplied worktree manager to implement `inspectForDispatch`, not merely
`inspect`. The bundled durable Git manager supplies it. Before the first effect,
the coordinator rechecks required capabilities/grants and the exact observed
worktree binding against its persisted preparation. Changed registry coverage,
workspace or commit fails before executor calls. Recorded-result replay remains
effect-free; resume also checks the exact executor version. Custom integrations
must implement the stronger native observation contract before upgrading.

For Desktop-operated execution, `beginExternal(runId)` persists a schema-declared
`DesktopExternalExecutionRequest` and returns it without invoking the registered
executor. Once issued, the effect is uncertain until its explicit result is
reconciled; repeating the handoff or calling execute/resume does not create another
effect. This is the library handoff boundary, not a claimed automatic Desktop hook
or a finished CLI operator workflow. The operator must use the exact saved task
plan, approved permissions and provider receipt when completing the request.

## Traceability and authority

Trusted QC contributors accept only exact canonical bytes for the declared Module, version, and operation. Candidate and approved scopes are distinct and append-only. Adapters cannot author graph operations, and ProjectControl cannot mutate workflow state, approve Gates, integrate code, promote memory, or activate graph facts.

## Verification

The QC-001 evidence set includes positive and adversarial composition, policy, reuse, CAS, restart, drift, and authority tests; mandatory WorkItemVerification and SystemVerification integration tests; a real local Git-worktree Desktop harness across `quick`, `standard`, and `assurance`; and a Windows reference benchmark at 100 bindings, 1,000 work items, and 10,000 attempt records.

The Desktop provider in the automated end-to-end harness is fixture-conformant. It does not claim live upstream provider interoperability. The repository's existing live ProjectMemory bootstrap and local Git worktree tests remain the evidence for those native boundaries.

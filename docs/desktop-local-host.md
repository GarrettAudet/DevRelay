# Desktop-operated local CLI host

This unreleased host connects the real executable to the existing public facade,
Core registry, SQLite/CAS checkpoints and durable traceability store on Windows.
Desktop remains the agent operator. The CLI never loads user JavaScript,
launches an agent, runs an external command or approves a Gate.

## Exact supported boundary

The candidate `architecture-discovery` contract set supports the exact bundled
`native-architecture-discovery@1.0.0` binding for `architecture-discovery@0.1.1`.
This new module version explicitly declares both approved requirements and overview
inputs. Released discovery 0.1.0 and its contributor remain unchanged.

Supply the exact `nativeDiscoveryPlugin` definition from the advanced API as a
digest-pinned plugin file, and the new versioned module definition from
`examples/modules/architecture-discovery-0.1.1.module.json`. The invocation must
declare a `filesystem.read` grant for `config.sourceRoot`, plus `config.sources`
as an explicit list of `{ path, digest }` entries. `sourceRoot` may be `.`; sources
are still individually pinned and checked against the repository snapshot's
included/excluded paths. Host grants and real-path confinement remain mandatory.

The native binding runs offline inventory only, with no optional analyzer or
external transmission. It requires the declared session revision and exact current
requirements/overview pair. It stores source evidence, observations, inventory and
snapshot bytes, and lets Core checkpoint and project the result. A successful
`module-completed` result is observational, not an ArchitectureGate approval or
authorization to start the next module. No source enumeration or independently
observed Git revision is implied by the configured snapshot.

Native inventory replay reuses durable checkpoints. Core replay can verify the
stored evidence after working-file changes; a new invocation must satisfy the
pinned source digests again. Source text has an explicit `utf8-text` artifact
contract; other contracts retain JSON decoding unless explicitly declared.
Traceability owns its existing opaque-byte projection of source files.

The connection runs one explicit ModuleInvocation at a time. Its closed runtime
contract sets are `requirements`, `architecture`, `architecture-discovery` and
`work-breakdown`. Module
definitions and Desktop effect plug-in definitions are explicit digest-pinned
JSON files; the host does not infer an adapter from a provider name. Existing
Core routing, full-chain preflight, artifact validation, checkpoint replay and
trusted graph contributors remain authoritative.

All seven commands are connected, with deliberately limited scopes:

| Command | What it establishes |
| --- | --- |
| `init` | Validated host/session/memory context, persisted once per exact configuration |
| `run` | One Core module invocation, or a durable pending Desktop request |
| `resume` | The exact stored invocation at the supplied current checkpoint |
| `status`, `inspect` | Read-only persisted run/node state |
| `evidence` | Read-only initialization receipt and execution record or pending request |
| `verify` | Actual Core checkpoint replay verification and applied graph proof |

Results include `scope` and `lifecycleComplete: false`. A `module-completed`
state is not SystemVerification, BusinessAcceptance or release readiness. A
DesktopStepRequest is not a DesktopTaskPlan or permission to dispatch a worker.
There is no automatic lifecycle scheduler, Gate promotion, managed worktree
dispatch or HumanOrchestration view in this host increment.

The facade rejects `run`, `resume` and `conclude` under the read-only `inspect`
profile before bootstrap or operation dispatch (`DR4743`). Inspection and
checkpoint verification remain available. This profile is not permission to
execute external tests or bypass the host's read-only operation boundary.

## Configuration

Pass an absolute configuration path and the SHA-256 digest of its exact bytes:

```text
devrelay init --json --host C:\project\host.json --host-digest sha256:<64-lowercase-hex>
```

The executable is also available as `node node_modules/devrelay/bin/devrelay.mjs`
in a deliberately installed source tarball. Configuration follows
`contracts/desktop-local-host-configuration.schema.json`, with no extra keys:

- `apiVersion: "devrelay.dev/v1alpha1"`, `kind: "DesktopLocalHostConfiguration"`;
- exact `projectId`, `taskId`, `graphId`, and an absolute `workspaceRoot`;
- workspace-relative `stateDirectory`, `memoryManifest`, and digest-pinned
  `sessionSnapshot` and `memorySessionState` file descriptors;
- one supported `contractSet`, and digest-pinned `modules` and `plugins` arrays;
- `artifacts`, each with a workspace-relative `path` and full Core `ref`;
- explicit filesystem `grants`, each with `kind` and path `values`.

A file descriptor is `{ "path": "relative/file.json", "digest": "sha256:..." }`.
Read grants must cover the explicit context, runtime, invocation, response and
artifact files. Write grants must cover the state directory. Host grants accept
only `filesystem.read` and `filesystem.write`; no process, network or secret
capabilities exist here. Both logical and resolved paths are checked. Artifact
URIs are identities, never implicit filesystem paths. Minimal raw artifact
pointers resolve only through an unambiguous explicit full-reference binding.

The context must already contain the exact approved requirements/overview pair,
its rendered ProjectOverview, roadmap disposition and current ProjectMemory.
Bootstrap checks the memory Gate proof and baseline/synopsis/graph bindings. An
open session belonging to another task, or a session needing recovery, stops
execution. `init` does not invent approved baselines or conclude old sessions.
The ordinary repository bootstrap and exact DesktopTaskPlan binding are still
required before any managed task is dispatched.

## Desktop request and result exchange

Use `--input` with a JSON object. For `run`, provide `taskId`, `runId`, `nodeId`,
`goal` and `invocation` (a digest-pinned file descriptor). The run/node identity
must match the invocation. This is an already prepared invocation, not a natural
language project request or caller-selected override of Core routing.

Core performs its normal preflight before invoking the Desktop exchange adapter.
If no response is selected, the host durably records a request and exits with 5,
`awaiting-desktop`. Read the returned `desktopRequest` and `checkpointDigest`
from the result outputs. The request pins the full invocation, exact effect
producer and validated host context.

Desktop supplies a candidate response file conforming to
`contracts/desktop-step-exchange.schema.json`:

```json
{
  "apiVersion": "devrelay.dev/v1alpha1",
  "kind": "DesktopStepResponse",
  "requestId": "sha256:<exact-request-id>",
  "requestDigest": "sha256:<canonical-JSON-digest-of-entire-request>",
  "result": { "...": "the exact Core ModuleResult or ModuleStepResult" }
}
```

This shape is illustrative, not an executable result fixture. `requestDigest`
hashes the entire request including its ID; it is not interchangeable with the
request ID. Raw file descriptors instead hash exact file bytes. Use the existing
`canonicalJsonDigest` and `sha256Digest` helpers for their respective boundaries.

Call `resume` with `taskId`, `runId`, `nodeId`, the last `checkpointDigest` and
the response file descriptor in `response`. New result artifacts may be supplied
in `artifacts` as `{path, ref}` entries; they are raw-digest checked and stored in
CAS before Core consumes them. Existing configured artifacts remain available.
Core, not the exchange, validates outcomes, step lineage, bytes and traceability.

Submitted responses are immutable candidates. An invalid candidate can be
corrected by submitting another response; history is not overwritten. If a
process stops before Core creates the effect checkpoint, resubmit the same
response file to select it in the fresh process. This is data resubmission, not
permission to repeat external work. Once Core has checkpointed the result,
replay does not call the Desktop adapter again. Resume with no response then
reuses the exact checkpoint and graph receipt.

Read commands require the run/node identity; `inspect` and `verify` also accept
the facade's `subject`, for example `{ "kind": "checkpoint" }`. They open SQLite
in read-only mode and do not create missing host state. Stale configuration,
context or checkpoint digests fail closed. Configuration changes require an
explicitly initialized context and do not silently migrate an existing run.

## Evidence and remaining integration

After a completed requirements change invocation, a separate `resume` can
submit `requirementsGate: {path, digest}`. The referenced JSON must satisfy
`contracts/desktop-requirements-gate-submission.schema.json`: exact baseline
file/ref bindings for both requirements and overview, plus a raw-digest-bound
Markdown file and `approvalEvidence` file/ref bindings in the exact order cited
by the paired baselines. Every cited approval must resolve to nonempty raw
bytes with the exact digest; omitted, extra, mismatched or altered evidence
fails before pair publication. Candidate responses and artifact ingestion cannot accompany
this submission. Both prior input baselines must equal the configured pair.

The owning Requirements Gate validates the genuine Core checkpoint replay,
lineage, versions, approval evidence, exact baseline bytes and Markdown
projection. The local host durably checkpoints the pair and cited approval bytes atomically under
`contracts/local-requirements-gate-commit.schema.json`. It returns
`awaiting-gate-activation` (exit 5), **not** lifecycle completion or approval
graph activation. Exact retry preserves the run version. `verify` reconstructs
the recorded pair through the owning Gate with a genuine Core receipt without
writing storage or invoking the adapter. Its nested `requirementsGate` proof
is scoped to `validated-requirements-pair`.

An explicitly initialized host configuration with
`requirementsObserverVersion: "1.1.0"` also supports a separate `resume` with
`activateRequirementsGate: "sha256:<exact-commit-digest>"` and the current run
checkpoint digest. The activation selection conforms to
`contracts/desktop-requirements-gate-activation.schema.json`; it cannot accompany
candidate ingestion or a new Gate submission. The host revalidates the saved
pair and approval bytes through the owning Gate, projects explicit Gate outputs
through the versioned trusted contributor, saves the exact prepared update, and
then merges it. Cited approval artifacts are included in the graph's source
closure. Replay validates that same checkpoint and returns the same graph receipt.

A project-wide requirements-head reservation serializes activation independently
of the selected graph ID. A competing Gate based on the old pair cannot publish
over the winner. Interruption before or after graph merge leaves the exact pending
commit recoverable; graph replay completes head advancement without a duplicate
update. New module work rejects stale paired context or a pending activation.
Read-only historical inspection and exact Gate recovery retain their original
context and do not silently adopt a newer baseline.

The resulting status is `requirements-activated`, not lifecycle completion.
`evidence` and read-only `verify` expose a separate `requirementsActivation`
application proof. Downstream lifecycle progression remains incomplete.
Configurations omitting the observer version
retain released 1.0.0 behavior and cannot activate; changing an existing context
requires explicit reconciliation, never silent contributor migration. No
independent human approval is inferred from the presence of approval bytes.

After activation, a separate `resume` may supply `refreshRequirementsContext`
as an explicit UTC timestamp, together with the current checkpoint digest.
The host verifies the actual activation and current requirements head, then
seals a `DesktopRequirementsContextHandoff`. Its new snapshot binds the paired
baselines, exact overview bytes and a lifecycle boundary containing the runtime
graph/receipt references. ProjectMemory, synopsis, memory graph and roadmap
bindings are preserved and reloaded by exact digest. The prior session is not
rewritten. Downstream bindings, including old ready work or blockers, are retained
as `invalidatedBindings` requiring reassessment, never silently marked resolved.

The result is `requirements-context-prepared`, exit 5. `evidence` exposes the
handoff and its four exact artifact payloads; `verify` rederives the same handoff
read-only. Exact replay preserves the run version; a different timestamp cannot
replace an already sealed handoff. This is not an approved next-stage route.

A subsequent separate `resume` may supply `materializeRequirementsContext` as
the exact handoff digest, together with the current checkpoint digest. The host
rederives the genuine handoff before publishing its four artifacts and snapshot
under the explicitly granted state directory. It publishes `host.json` last,
using atomic no-clobber file publication. Exact existing bytes are reused;
conflicting bytes are rejected, never overwritten. An interrupted publication
can retry the same immutable files without publishing a usable partial configuration.

The result is `requirements-context-materialized`, exit 5, with
`outputs.nextConfiguration.configurationPath` and `configurationDigest`. Use
these exact values as `--host` and `--host-digest` for an explicit `init`.
`verify` checks published bytes read-only. The old configuration is not modified,
and the new configuration cannot inspect or adopt an old run's context identity.
Module bindings and grants are preserved; no next-stage route is selected and
no agent task is launched. Normal downstream lifecycle routing remains required.

Tests exercise the actual Windows executable in separate processes and the
installed package across all seven commands. Candidate artifacts are labelled
fixtures; this is not live provider conformance or produced-code acceptance.
Read-only checks compare database bytes, and negative cases cover stale
bindings, missing grants, prior open memory, substituted responses and corrected
candidate history.

Before returning native discovery success, the host now reloads the materialized
snapshot, repository, native inventory, observations, gaps and source evidence by
raw digest. It rederives observations from the producer findings and rejects
substituted observations or omitted producer warnings. This closure check is
read-only and does not select a route, approve a Gate, or claim design readiness.
Materialized gap reevaluation requires the exact existing gap records and retains
them even when no current rule emits them; a retained material gap still blocks.

The host currently verifies the declared repository revision in the supplied
snapshot, not an independently observed Git HEAD. It initializes a new runtime
graph rather than importing the existing approved ProjectMemory graph. Current
context files must remain available and unchanged for inspection; historical
context migration is not implemented. Memory conclusion belongs to its owning
Gate. Full lifecycle scheduling, approved-frontier dispatch, worktree execution,
quality/continuity/operator integration, installed code-production acceptance,
independent human review and release sealing remain separate required work.

The in-progress `ArchitectureDiscoveryInterpretation` candidate contract binds
the raw observational discovery snapshot to a separate structured snapshot with
the exact project-state, requirements and overview references. Every observation
has a mapped, out-of-scope or unresolved disposition and a rationale. Mapped
targets must resolve to actual entries within architecture sections, never section
metadata. Target pointers use a read-only logical `content` view for both embedded
and attached sections; attached content is loaded by raw digest and validated
through the owning architecture contract without rewriting the snapshot.
Every original gap must map
to a structured gap without changing its reason or materiality; producer warnings
and the original snapshot reference are retained. The read-only interpretation
loader first verifies the complete discovery evidence bundle, then validates
structured-snapshot lineage through the existing ArchitectureDesign contract.

This is a candidate validation boundary, not semantic approval. In particular,
an unresolved disposition or blocking gap can be represented for review; loading
it does not authorize progression. After a completed native discovery run, a
separate `resume` can supply `discoveryInterpretation` as an exact file descriptor
for a `DesktopDiscoveryInterpretationSubmission`. That closed submission contains
an `interpretation` artifact-file descriptor and an `artifacts` array for its
structured snapshot or other new referenced bytes. The host checks source paths
against grants, validates the candidate against the genuine Core replay receipt
and exact discovery inputs, then persists the validated bytes before the run
transition. It returns `awaiting-discovery-approval` (exit 4).

`evidence` exposes the stored candidate record and its unresolved-observation and
blocking-gap counts. `verify` reloads the persisted bytes and revalidates the
interpretation against Core without modifying state. Exact resubmission and
ordinary resume preserve the run version and review boundary. A different
candidate cannot overwrite the sealed boundary implicitly. A correction must
set the submission's `replacesInterpretation` to the exact current interpretation
reference. The host appends a content-addressed history record, retains the old
candidate bytes and advances only the candidate head. A stale predecessor,
invented initial predecessor or attempt to reactivate a historical candidate is
rejected. Exact revision replay does not add another record. `evidence` exposes
the history newest-first; `verify` revalidates every candidate against the same
Core discovery receipt and checks every history link read-only.

The in-progress discovery Gate accepts a separate `resume.discoveryGate` exact
file descriptor for `DesktopDiscoveryGateSubmission`. It contains `ownerApproval`
and supporting `artifacts` file descriptors. The closed owner approval binds the
current interpretation, repository revision, raw review and nonempty supporting
evidence, plus exact warning, non-material-gap and out-of-scope dispositions.
Unresolved observations and material gaps block preparation. Caller-authored
Core receipts do not carry Gate authority.

The host validates the entire decision before storing evidence and the immutable
Gate commit, then returns `awaiting-gate-activation` (exit 5). The prepared state
is `existing-discovered-unbaselined`; it is observational and never creates an
ArchitectureBaseline. Exact replay preserves the run version. A different Gate
or candidate revision cannot silently replace a sealed decision. `evidence`
exposes `discoveryGate`; `verify` rederives it from stored evidence and the genuine
Core checkpoint without writing state. Approval JSON is evidence supplied by the
operator, not independent authentication of the human who authored it.

The in-progress `resume.activateDiscoveryGate` accepts the exact prepared Gate
commit digest in a separate request. The host rederives approval through the
owning Gate and genuine Core checkpoint, stores the exact next-state bytes, and
atomically advances a leased architecture-state head with its transition journal.
It returns `discovery-activated` (exit 5), not lifecycle completion. No design
baseline or approved design graph facts are created by observational activation.

`evidence.discoveryActivation` exposes the state reference and activation digest.
`verify` checks the exact Gate, journal and stored state bytes without writing.
Exact activation replay does not advance the run version. Historical replay is
observational; new runs cannot use an architecture state superseded by the active
head. State persistence precedes head publication so an interrupted activation
can retry without rerunning the discovery adapter.

The in-progress `resume.prepareArchitectureContext` accepts an explicit timestamp
after discovery activation. ArchitectureDesign must already be declared in the
host's module configuration. Core derives its operation from the exact activated
state. A refreshed session preserves the approved project pair, ProjectMemory
and roadmap bindings; the handoff replaces lifecycle status and lists invalidated
bindings. Original discovery provenance is retained, not rewritten to the new
state. ArchitectureDesign requires exact native-artifact evidence roles for any
source references that are not direct invocation inputs or prior handoffs.

`resume.materializeArchitectureContext` accepts the exact handoff digest. It
publishes immutable state, snapshot, route and session files, followed by a new
host configuration as the final usable marker. It preserves declared modules,
plug-ins and grants, and selects the full architecture contract set for downstream
lineage validation. `verify` rederives the handoff and checks published bytes
read-only. The old configuration is unchanged.

The downstream invocation still requires its explicitly configured adapter chain
and normal Core preflight. Reaching a Desktop designer request is not completion
of ArchitectureDesign; designer, modeler, decision-recorder, ArchitectureGate and
the remaining lifecycle must still execute with their required evidence.

The in-progress `resume.architectureGate` accepts an exact file descriptor for a
closed `DesktopArchitectureGateSubmission`: owner approval, baseline, and review/
supporting artifact files. The host requires the completed Core candidate and
current architecture state, binds the repository revision, and invokes the
owning ArchitectureGate. It persists the exact validated approval and baseline
bytes plus their evidence before returning `awaiting-gate-activation` (exit 5).
Conflicting decisions cannot silently replace a sealed Gate. `evidence` exposes
`architectureGate`; `verify` rederives it from Core and durable evidence read-only.
This prepares the approved baseline but does not activate its graph facts, change
the architecture-state head, or advance the lifecycle automatically. Test owner
approvals are explicitly synthetic fixtures, never human product acceptance.

A separate `resume.activateArchitectureGate` takes the exact prepared Gate
commit digest. The host configuration must explicitly select
`architectureObserverVersion: "1.1.0"`; the released default observer is unchanged.
Activation revalidates the owning Gate, stores the prepared graph update before
merge, reserves the architecture head, and publishes the baselined state only
after the exact graph application proof exists. Pending activation blocks new
work. Recovery reuses the stored update; completed historical replay cannot
roll back a newer head or acquire a lease merely to observe an old publication.

The command returns `architecture-activated` (exit 5). `evidence` exposes a
closed `LocalArchitectureActivation`; `verify` rederives its Gate, graph receipt
and state publication read-only. This is not full lifecycle completion and does
not yet publish a downstream ContractGeneration/WorkBreakdown configuration.
Exception-injection tests cover interruptions before and after durable graph
merge with storage reopening; these are not OS process-kill tests.

The in-progress `resume.prepareContractPlanning` takes that exact activated
architecture Gate digest. It derives an initial `ProjectContractState`, persists
the state bytes and a closed planning candidate, then returns
`contract-planning-prepared` (exit 5). Required interface intents select
`establish-contracts`; zero required intents select the separate ContractGate
`approve-not-applicable` branch, not automatic approval. Evidence includes
`contractPlanning`; verification rederives it without writes. Historical evidence
remains verifiable after a newer architecture head, but new planning from the
old head is rejected. Downstream configuration publication, generator execution,
ContractGate host composition and existing-contract change planning remain open.

The subsequent in-progress `resume.executeContracts` selects the exact persisted
planning digest. It requires an explicit `contractGenerators` configuration with
the pinned `json-schema-contract-generator` version `0.1.0` and contract kind
`json-schema`. Missing bindings and unsupported kinds fail closed. The native
binding runs the released ContractGeneration validation/diff/checkpoint runtime;
it does not invoke a model, provider, shell or network. Its deterministic execution
identity binds both the architecture invocation and planning digest.

Successful generation stops at `contract-candidate-prepared` (exit 5), not
approval. Evidence includes `contractExecution`; verification checks its genuine
runtime checkpoint, exact input bindings, candidate and outcome. Replay reuses
the same execution identity. ContractGate host approval and graph promotion remain
unconnected, as does downstream session/configuration publication.

The subsequent in-progress `resume.contractGate` accepts a file descriptor for
`DesktopContractGateSubmission`: exact approval and baseline files plus cited
evidence files. The host requires the current architecture, rederived planning,
and a genuine ContractGeneration receipt bound to those exact inputs before the
owning Gate validates approval. The raw baseline, approval, evidence and derived
disposition are preserved before publishing the immutable Gate record. A second
different approval cannot replace the sealed record.

Preparation stops at `awaiting-contract-activation` (exit 5). Evidence exposes
`contractGate`; verification revalidates it through the owning Gate without
writes. This does not yet activate approved graph/state or advance WorkBreakdown.

Long-running Core validation uses an explicit two-minute host run lease, renewed
every ten seconds while the event loop can progress. Renewal requires the exact
current token and state version and cannot resurrect an expired or stolen lease.
The host checks renewal failure and renews again before committing run progress;
the timer is stopped on completion or failure. A validation stall exceeding the
lease window still fails closed and requires checkpoint-based recovery. This is
not permission for an adapter to run an undeclared process or keep a task alive.

Artifact-loading boundaries cooperatively yield to the event loop at least when
250 milliseconds have elapsed between such boundaries. This prevents a chain of
already-resolved promises from indefinitely starving the renewal timer. It does
not interrupt a single synchronous operation, extend the lease duration, revive
an expired lease, or bypass ownership/version checks. Focused scheduler and lease
tests pass; the current full host run must still prove the original failure is
resolved. Test-only `DEVRELAY_TEST_PROGRESS=1` reports command timings and maximum
observed event-loop delay without logging request payloads.

## Work-baseline activation (unreleased integration)

After `resume.workBreakdownGate` prepares the exact owning Gate record, a separate
`resume.activateWorkBreakdownGate` accepts its commit digest. It requires the
explicit host configuration `traceabilityVocabularyVersion: "1.9.0"`; newly
materialized work contexts select this version. Existing default configurations
retain vocabulary 1.5.0. Older vocabulary digests and authority policies are unchanged.

Activation revalidates the genuine Core receipt and Gate evidence, checkpoints
the graph update before merge, reserves the baseline head, and publishes the raw
baseline with an atomic journal transition. It stops at `work-baseline-activated`
(exit 5). This is not assignment, execution or lifecycle completion. Evidence and
read-only verification expose `workActivation`; replay reuses the exact graph
receipt without repeating the adapter or graph merge.

The durable transaction has an interruption/reopen test. Full Desktop-host
activation, verification and replay assertions are added but not yet proven by
the extended integration run. These fixtures do not constitute human acceptance.

## Durable completion ledger and queue (unreleased integration)

The local completion ledger records exact integrated work, not worker status.
Initialization is explicit; an absent ledger is an error, never an inferred empty
completion list. Every read replays the recorded integration invocations through
the host's Core verifier and checks their work item, all seven baseline bindings,
integration subject, target state and passing evidence. The full append journal
must match the ledger state. Copied receipts are not replay authority.

Appending uses a version check and lease to commit the new state and journal in
one SQLite transaction. Exact repeated completion returns the existing result;
a conflicting completion cannot overwrite it. Incoming completion must already
be recoverable through the host's verifier before it can be recorded. Restart,
interrupted commit, stale version, omitted history and zero-adapter-call replay
have focused component tests using synthetic integration results inside Core.

The queue command below connects initialization and readiness. Execution still
must derive the exact work-item input from approved work, reserve it, enforce
current heads at dispatch, and record verified integration. A worker's “done” message or
a caller-supplied list of completed IDs must never replace that path. Replacing
baselines requires an explicit continuity decision; initialization does not reset
an existing ledger. These checks do not prove native Git integration acceptance.

The unreleased `deriveLocalWorkReadiness` library function now reads that ledger,
loads raw digest-bound work/dependency baselines, checks their exact lineage and
work-item universe, and invokes existing owning DAG/readiness-proof mechanics.
It checks each completed work item's raw projection against approved work and
rejects caller completion overrides. Its result includes ready/blocked/completed
dispositions, blocking prerequisites, per-item proofs and an exact ledger version
and digest. A completion committed while inputs are loading invalidates the
snapshot. This is a read-only queue snapshot, not a work reservation or dispatch
grant; current activation heads and reservations must still be checked by the
Desktop host. Focused tests cover initial readiness, dependent-work unlocking,
storage reopen, byte drift and a concurrent completion update.

After assignment activation, a separate `resume.prepareWorkQueue` takes the
exact assignment Gate commit digest. The host revalidates the activation chain,
derives all seven baseline references from its evidence, rejects pending or stale
heads, initializes the completion ledger if absent, and records a derived queue.
It stops at `work-queue-prepared` (exit 5), without launching an agent. Evidence
exposes `workReadiness`; read-only verification rederives it and rejects stale or
substituted snapshots. Repeating the same request reuses the queue state.

The activation-chain-to-initial-queue component test passes. Full Desktop CLI
queue/verification/replay assertions are present but await a completed current-source
end-to-end run. No release or live execution acceptance is claimed by these tests.

## Work quality preparation (unreleased integration)

A separate `resume.prepareWorkQuality` takes an exact `{ path, digest }` file descriptor for a closed
`DesktopWorkQualitySubmission`: one ready work item, the exact queue digest,
and explicit quality-policy/context artifact files. The host rederives current
readiness, checks activated heads, and computes obligations using the resolved
workflow profile. The context must cover the approved item's exact acceptance
criteria. The owning `work-type` is explicitly mapped to the quality resolver's
`type` input without editing approved work bytes. Caller-authored obligations,
approval flags and stale queue references are rejected.

The command records a per-item quality handoff and stops at
`work-quality-prepared` (exit 5); it does not approve policy, reserve work, or
launch an agent. Read-only verification rederives the handoff from stored raw
inputs and detects changed obligations. A changed queue clears current quality
selections while retaining immutable historical records. Fresh preparation still
needs the surrounding host policy-approval/current-policy integration before
production dispatch; this command is not independent policy approval authority.

Focused handoff tests cover ready/stale/blocked work, exact criteria coverage,
byte drift and replay substitution. Full successful Desktop command acceptance
has not yet been demonstrated on the current source.

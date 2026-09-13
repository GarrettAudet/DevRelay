# Desktop-operated local CLI host

This unreleased host connects the real executable to the existing public facade,
Core registry, SQLite/CAS checkpoints and durable traceability store on Windows.
Desktop remains the agent operator. The CLI never loads user JavaScript,
launches an agent, runs an external command or approves a Gate.

## Exact supported boundary

The connection runs one explicit ModuleInvocation at a time. Its closed runtime
contract sets are `requirements`, `architecture` and `work-breakdown`. Module
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
application proof. Current session-context refresh and downstream lifecycle
progression remain incomplete. Configurations omitting the observer version
retain released 1.0.0 behavior and cannot activate; changing an existing context
requires explicit reconciliation, never silent contributor migration. No
independent human approval is inferred from the presence of approval bytes.

Tests exercise the actual Windows executable in separate processes and the
installed package across all seven commands. Candidate artifacts are labelled
fixtures; this is not live provider conformance or produced-code acceptance.
Read-only checks compare database bytes, and negative cases cover stale
bindings, missing grants, prior open memory, substituted responses and corrected
candidate history.

The host currently verifies the declared repository revision in the supplied
snapshot, not an independently observed Git HEAD. It initializes a new runtime
graph rather than importing the existing approved ProjectMemory graph. Current
context files must remain available and unchanged for inspection; historical
context migration is not implemented. Memory conclusion belongs to its owning
Gate. Full lifecycle scheduling, approved-frontier dispatch, worktree execution,
quality/continuity/operator integration, installed code-production acceptance,
independent human review and release sealing remain separate required work.
